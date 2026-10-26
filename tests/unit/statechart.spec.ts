import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BUILTIN_TYPES,
  REGION_STRIP,
  STATUS_TONES,
  layoutGraph,
  measureEdgeLabel,
  measureNode,
  defaultRegistry,
  parseGraph,
  regionsOf,
  stringifyGraph,
  validateGraph,
  approximateMeasurer,
  type FlowNode,
  type Graph,
} from '../../src/index'
import { claimProcess, claimProcessV10 } from '../fixtures/statechart'

const schema = (f: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../schema', f), 'utf8'))
const codes = (g: Graph) => validateGraph(g).map((i) => `${i.code}:${i.target?.id ?? ''}`)

describe('flow 1.1 types', () => {
  it('registers parallel, timer, wait and any as built-ins', () => {
    expect(BUILTIN_TYPES.parallel).toMatchObject({ drillable: true, regions: true })
    expect(BUILTIN_TYPES.timer).toMatchObject({ shape: 'event', labelOutside: true })
    expect(BUILTIN_TYPES.wait).toMatchObject({ shape: 'event', labelOutside: true })
    expect(BUILTIN_TYPES.any).toMatchObject({ shape: 'any', noIncoming: true, anyState: true })
  })

  it('parses and keeps join and trigger, drops unknown values', () => {
    const g = parseGraph(stringifyGraph(claimProcess))
    expect(g.nodes.find((n) => n.id === 'review')?.join).toBe('all')
    expect(g.edges.find((e) => e.id === 'e4')?.trigger).toBe('timer')
    const odd = parseGraph({ nodes: [{ id: 'p', type: 'parallel', join: 'some' }], edges: [{ id: 'x', from: 'p', to: 'p', trigger: 'cron' }] })
    expect(odd.nodes[0]!.join).toBeUndefined()
    expect(odd.edges[0]!.trigger).toBeUndefined()
  })

  it('reads a parallel node regions from its inline subgraph', () => {
    const review = claimProcess.nodes.find((n) => n.id === 'review')!
    expect(regionsOf(review).map((g) => g.label)).toEqual(['Documents', 'Approval'])
    expect(regionsOf({ id: 'r', type: 'parallel', subgraph: 'ref@1' })).toEqual([])
    expect(regionsOf({ id: 'r', type: 'parallel' })).toEqual([])
  })

  it('validates: "any state" reaches its targets but is not the start', () => {
    expect(codes(claimProcess)).toEqual([])
    const onlyAny: Graph = {
      version: 1,
      nodes: [
        { id: 'any', type: 'any' },
        { id: 'a', type: 'state', label: 'A' },
        { id: 'end', type: 'end' },
      ],
      edges: [{ id: 'x', from: 'any', to: 'end' }, { id: 'y', from: 'a', to: 'end' }],
    }
    expect(codes(onlyAny)).toContain('missing-start:')
    const into: Graph = structuredClone(claimProcess)
    into.edges.push({ id: 'bad', from: 'filing', to: 'any' })
    expect(validateGraph(into).find((i) => i.target?.id === 'bad')?.message).toContain('"any state"')
  })

  it('sizes a parallel node with a compartment per region', () => {
    const review = claimProcess.nodes.find((n) => n.id === 'review')!
    const plain: FlowNode = { ...review, subgraph: undefined }
    const withRegions = measureNode(review, defaultRegistry, approximateMeasurer)
    const without = measureNode(plain, defaultRegistry, approximateMeasurer)
    expect(withRegions.regions?.map((r) => r.label)).toEqual(['Documents', 'Approval'])
    expect(withRegions.height).toBe(without.height + REGION_STRIP)
    const cells = withRegions.regions!.reduce((s, r) => s + r.width, 0)
    expect(Math.round(cells + 16)).toBe(withRegions.width)
    expect(without.regions).toBeUndefined()
  })

  it('makes room for a trigger icon on an edge label, and shows a bare trigger', () => {
    const plain = measureEdgeLabel({ id: 'a', from: 'x', to: 'y', label: 'cancel' }, approximateMeasurer)!
    const timed = measureEdgeLabel({ id: 'a', from: 'x', to: 'y', label: 'cancel', trigger: 'event' }, approximateMeasurer)!
    expect(timed.width - plain.width).toBe(16)
    expect(measureEdgeLabel({ id: 'b', from: 'x', to: 'y', trigger: 'timer' }, approximateMeasurer)).toMatchObject({ width: 26, lines: [] })
    expect(measureEdgeLabel({ id: 'c', from: 'x', to: 'y' }, approximateMeasurer)).toBeUndefined()
  })

  it('lays out the 1.1 graph and its parallel subgraph', () => {
    const outer = layoutGraph(claimProcess)
    expect(outer.nodes.get('review')!.regions).toHaveLength(2)
    const inner = layoutGraph(claimProcess.nodes.find((n) => n.id === 'review')!.subgraph as Graph)
    expect([...inner.groups.keys()]).toEqual(['docs', 'approval'])
  })

  it('adds the unknown and compensated statuses', () => {
    expect(STATUS_TONES.unknown).toBe('warning')
    expect(STATUS_TONES.compensated).toBe('neutral')
    const status = schema('snapshot.schema.json').properties.nodes.additionalProperties.properties.status
    for (const s of Object.keys(STATUS_TONES)) {
      expect(status.description).toContain(s)
      expect(status.examples).toContain(s)
    }
  })

  it('describes join and trigger in the graph schema', () => {
    const g = schema('graph.schema.json')
    expect(g.$defs.node.properties.join.enum).toEqual(['all', 'any'])
    expect(g.$defs.edge.properties.trigger.enum).toEqual(['timer', 'event'])
  })
})

describe('flow 1.0.x exports', () => {
  it('still parse, validate and lay out unchanged', () => {
    const g = parseGraph(stringifyGraph(claimProcessV10))
    expect(g).toEqual(claimProcessV10)
    expect(codes(g)).toEqual([])
    const layout = layoutGraph(g)
    expect(layout.nodes.get('review')!.regions).toBeUndefined()
    expect(layout.edges.get('e2')!.label!.lines.join(' ')).toContain('10 days')
  })
})
