import { describe, expect, it } from 'vitest'
import { GraphError, createRegistry, emptyGraph, issuesByElement, parseGraph, stringifyGraph, validateGraph, type Graph } from '../../src/index'
import { orderProcess } from '../fixtures/order'

const codes = (g: Graph, opts = {}) => validateGraph(g, opts).map((i) => `${i.severity}:${i.code}:${i.target?.id ?? ''}`)

describe('parseGraph', () => {
  it('reads the sample and round-trips through JSON', () => {
    const g = parseGraph(JSON.parse(stringifyGraph(orderProcess)))
    expect(g).toEqual(orderProcess)
    expect(parseGraph(stringifyGraph(orderProcess))).toEqual(orderProcess)
  })

  it('fills defaults and drops unknown node fields', () => {
    const g = parseGraph({ nodes: [{ id: 1, junk: true }], edges: [] })
    expect(g).toEqual({ version: 1, nodes: [{ id: '1', type: 'state' }], edges: [] })
  })

  it('reads inline sub-processes recursively', () => {
    const g = parseGraph({ version: 1, nodes: [{ id: 'p', type: 'subprocess', subgraph: { nodes: [{ id: 'x' }] } }], edges: [] })
    expect(typeof g.nodes[0]!.subgraph).toBe('object')
  })

  it('throws GraphError with a JSON pointer', () => {
    expect(() => parseGraph({ version: 1, nodes: [{ id: 'a', position: { x: 'no' } }] })).toThrow(/at \/nodes\/0\/position/)
    expect(() => parseGraph({ version: 2, nodes: [] })).toThrow(GraphError)
    expect(() => parseGraph({ nodes: [], edges: [{ id: 'e', from: 'a' }] })).toThrow(/"to" is required/)
    expect(() => parseGraph('{nope')).toThrow(/Not valid JSON/)
    expect(() => parseGraph({ nodes: [{ id: 'a', ports: [{ id: 'p', side: 'up' }] }] })).toThrow(/side/)
  })

  it('creates empty graphs', () => {
    expect(emptyGraph()).toEqual({ version: 1, nodes: [], edges: [] })
  })
})

describe('validateGraph', () => {
  it('finds nothing wrong in the sample', () => {
    expect(validateGraph(orderProcess)).toEqual([])
  })

  it('reports duplicate ids, unknown references and ports as errors', () => {
    const g: Graph = {
      version: 1,
      nodes: [
        { id: 's', type: 'start' },
        { id: 'a', type: 'state', label: 'A', ports: [{ id: 'in', side: 'left', kind: 'in' }] },
        { id: 'a', type: 'state', label: 'A2' },
        { id: 'z', type: 'end' },
      ],
      edges: [
        { id: 'e1', from: 's', to: 'a' },
        { id: 'e2', from: 'a', to: 'ghost' },
        { id: 'e3', from: 'a', to: 'z', fromPort: 'in' },
        { id: 'e4', from: 'a', to: 'z', fromPort: 'nope' },
      ],
    }
    const c = codes(g)
    expect(c).toContain('error:duplicate-id:a')
    expect(c).toContain('error:unknown-node:e2')
    expect(c.filter((x) => x === 'error:unknown-port:e3')).toHaveLength(1)
    expect(c).toContain('error:unknown-port:e4')
    // Errors come first.
    expect(validateGraph(g)[0]!.severity).toBe('error')
  })

  it('warns about unreachable nodes and dead ends, but allows cycles', () => {
    const g: Graph = {
      version: 1,
      nodes: [
        { id: 's', type: 'start' },
        { id: 'a', type: 'state', label: 'A' },
        { id: 'b', type: 'state', label: 'B' },
        { id: 'lonely', type: 'state', label: 'L' },
        { id: 'stuck', type: 'state', label: 'S' },
        { id: 'z', type: 'end' },
      ],
      edges: [
        { id: '1', from: 's', to: 'a' },
        { id: '2', from: 'a', to: 'b' },
        { id: '3', from: 'b', to: 'a' },
        { id: '4', from: 'b', to: 'z' },
        { id: '5', from: 'a', to: 'stuck' },
        { id: '6', from: 'lonely', to: 'z' },
      ],
    }
    const c = codes(g)
    expect(c).toEqual(['warning:unreachable:lonely', 'warning:dead-end:stuck'])
  })

  it('warns about a missing start or end, and edges into start / out of end', () => {
    const g: Graph = { version: 1, nodes: [{ id: 'a', type: 'state', label: 'A' }], edges: [] }
    expect(codes(g)).toEqual(['warning:missing-start:', 'warning:missing-end:', 'warning:dead-end:a'])
    expect(codes(g, { requireStartEnd: false })).toEqual(['warning:dead-end:a'])
    const h: Graph = {
      version: 1,
      nodes: [{ id: 's', type: 'start' }, { id: 'z', type: 'end' }],
      edges: [{ id: 'x', from: 'z', to: 's' }, { id: 'y', from: 's', to: 'z' }],
    }
    expect(codes(h)).toEqual(['warning:start-incoming:x', 'warning:end-outgoing:x'])
  })

  it('knows custom types and unknown ones', () => {
    const registry = createRegistry({ timer: { title: 'Timer', shape: 'circle', size: { width: 40, height: 40 }, labelOutside: true } })
    const g: Graph = {
      version: 1,
      nodes: [{ id: 's', type: 'start' }, { id: 't', type: 'timer' }, { id: 'q', type: 'mystery', label: 'Q' }, { id: 'z', type: 'end' }],
      edges: [{ id: '1', from: 's', to: 't' }, { id: '2', from: 't', to: 'q' }, { id: '3', from: 'q', to: 'z' }],
    }
    expect(codes(g, { registry })).toEqual(['warning:unknown-type:q'])
  })

  it('checks groups', () => {
    const g: Graph = {
      version: 1,
      groups: [{ id: 'g1', parent: 'g2' }, { id: 'g2', parent: 'g1' }],
      nodes: [{ id: 's', type: 'start', group: 'nope' }, { id: 'z', type: 'end' }],
      edges: [{ id: 'e', from: 's', to: 'z' }],
    }
    const c = codes(g)
    expect(c).toContain('error:group-cycle:g1')
    expect(c).toContain('error:unknown-group:s')
  })

  it('groups issues by element', () => {
    const issues = validateGraph({ version: 1, nodes: [{ id: 'a', type: 'state' }], edges: [] })
    expect(issuesByElement(issues).get('a')!.map((i) => i.code)).toEqual(['empty-label', 'dead-end'])
  })
})
