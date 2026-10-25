import { describe, expect, it } from 'vitest'
import { approximateMeasurer, layoutGraph, route, wrapText, type Graph, type NodeGeometry } from '../../src/index'
import { orderProcess, paymentProcess } from '../fixtures/order'
import { largeGraph } from '../fixtures/large'

function overlaps(a: NodeGeometry, b: NodeGeometry, gap = 0): boolean {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap
}

describe('layoutGraph', () => {
  it('places every node and routes every edge, with cycles', () => {
    const l = layoutGraph(orderProcess)
    expect(l.nodes.size).toBe(orderProcess.nodes.length)
    expect(l.edges.size).toBe(orderProcess.edges.length)
    for (const e of l.edges.values()) expect(e.d).toMatch(/^M [\d.-]+ [\d.-]+/)
    expect(l.groups.get('fulfilment')).toBeDefined()
  })

  it('does not overlap nodes', () => {
    for (const g of [orderProcess, paymentProcess, largeGraph(120)]) {
      const nodes = [...layoutGraph(g).nodes.values()]
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(overlaps(nodes[i]!, nodes[j]!), `${nodes[i]!.id} × ${nodes[j]!.id}`).toBe(false)
    }
  })

  it('keeps edge labels clear of nodes', () => {
    const l = layoutGraph(orderProcess)
    for (const e of l.edges.values()) {
      if (!e.label) continue
      for (const n of l.nodes.values()) {
        const hit = Math.abs(e.label.x - n.x) < (e.label.width + n.width) / 2 - 1 && Math.abs(e.label.y - n.y) < (e.label.height + n.height) / 2 - 1
        expect(hit, `${e.id} label over ${n.id}`).toBe(false)
      }
    }
  })

  it('is deterministic', () => {
    const a = layoutGraph(orderProcess)
    const b = layoutGraph(structuredClone(orderProcess))
    expect([...a.nodes.values()]).toEqual([...b.nodes.values()])
    expect([...a.edges.values()].map((e) => e.d)).toEqual([...b.edges.values()].map((e) => e.d))
  })

  it('flows in the requested direction', () => {
    const lr = layoutGraph(orderProcess, { direction: 'LR' })
    expect(lr.nodes.get('new')!.x).toBeGreaterThan(lr.nodes.get('start')!.x)
    const tb = layoutGraph(orderProcess, { direction: 'TB' })
    expect(tb.nodes.get('new')!.y).toBeGreaterThan(tb.nodes.get('start')!.y)
  })

  it('keeps fixed positions and lays out the rest without overlaps', () => {
    const g: Graph = structuredClone(orderProcess)
    g.nodes.find((n) => n.id === 'new')!.position = { x: 1000, y: 1000 }
    g.nodes.find((n) => n.id === 'packing')!.position = { x: 2000, y: 1000 }
    const l = layoutGraph(g)
    expect(l.nodes.get('new')).toMatchObject({ x: 1000, y: 1000 })
    expect(l.nodes.get('packing')).toMatchObject({ x: 2000, y: 1000 })
    const nodes = [...l.nodes.values()]
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(overlaps(nodes[i]!, nodes[j]!)).toBe(false)
  })

  it('uses only the model positions when all nodes have them', () => {
    const g: Graph = { version: 1, nodes: [{ id: 'a', type: 'state', label: 'A', position: { x: 0, y: 0 } }, { id: 'b', type: 'state', label: 'B', position: { x: 300, y: 40 } }], edges: [{ id: 'e', from: 'a', to: 'b', label: 'go' }] }
    const l = layoutGraph(g)
    expect(l.nodes.get('b')).toMatchObject({ x: 300, y: 40 })
    const e = l.edges.get('e')!
    // Out of a's right side into b's left side.
    expect(e.from.side).toBe('right')
    expect(e.to.side).toBe('left')
    expect(e.label).toBeDefined()
  })

  it('routes through explicit ports', () => {
    const g: Graph = {
      version: 1,
      nodes: [
        { id: 'a', type: 'state', label: 'A', position: { x: 0, y: 0 }, ports: [{ id: 'yes', side: 'bottom', offset: 0.25 }] },
        { id: 'b', type: 'state', label: 'B', position: { x: 0, y: 200 } },
      ],
      edges: [{ id: 'e', from: 'a', to: 'b', fromPort: 'yes' }],
    }
    const l = layoutGraph(g)
    const a = l.nodes.get('a')!
    const e = l.edges.get('e')!
    expect(e.from.side).toBe('bottom')
    expect(e.from.point.x).toBeCloseTo(a.x - a.width / 4)
    expect(e.from.point.y).toBeCloseTo(a.y + a.height / 2)
  })

  it('spreads several edges leaving one side', () => {
    const g: Graph = {
      version: 1,
      nodes: [
        { id: 'a', type: 'state', label: 'A', position: { x: 0, y: 0 } },
        { id: 'b', type: 'state', label: 'B', position: { x: 300, y: -100 } },
        { id: 'c', type: 'state', label: 'C', position: { x: 300, y: 100 } },
      ],
      edges: [{ id: '1', from: 'a', to: 'b' }, { id: '2', from: 'a', to: 'c' }],
    }
    const l = layoutGraph(g)
    expect(l.edges.get('1')!.from.point.y).toBeLessThan(l.edges.get('2')!.from.point.y)
  })

  it('routes orthogonally with axis-aligned segments', () => {
    const l = layoutGraph(orderProcess, { routing: 'orthogonal' })
    for (const e of l.edges.values()) {
      if (e.selfLoop) continue
      for (let i = 1; i < e.points.length; i++) {
        const a = e.points[i - 1]!
        const b = e.points[i]!
        expect(Math.abs(a.x - b.x) < 0.6 || Math.abs(a.y - b.y) < 0.6, `${e.id} segment ${i}`).toBe(true)
      }
    }
  })

  it('draws self loops', () => {
    const g: Graph = { version: 1, nodes: [{ id: 'a', type: 'state', label: 'Retry' }], edges: [{ id: 'l', from: 'a', to: 'a', label: 'again' }] }
    const e = layoutGraph(g).edges.get('l')!
    expect(e.selfLoop).toBe(true)
    expect(e.label).toBeDefined()
  })

  it('lays out 500 nodes', () => {
    const t = performance.now()
    const l = layoutGraph(largeGraph(500))
    expect(l.nodes.size).toBe(500)
    expect(performance.now() - t).toBeLessThan(15000)
  })
})

describe('text and routes', () => {
  it('wraps and truncates', () => {
    const lines = wrapText('Validate the order address and the customer limits carefully', 120, { size: 13 }, approximateMeasurer, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1]!.endsWith('…')).toBe(true)
    expect(wrapText('', 100, { size: 13 }, approximateMeasurer)).toEqual([])
    expect(wrapText('Supercalifragilisticexpialidocious', 60, { size: 13 }, approximateMeasurer)[0]!.endsWith('…')).toBe(true)
  })

  it('draws a direct spline between side anchors', () => {
    const r = route({ from: { point: { x: 0, y: 0 }, side: 'right' }, to: { point: { x: 200, y: 50 }, side: 'left' }, routing: 'spline' })
    expect(r.d.startsWith('M 0 0 C')).toBe(true)
    expect(r.points).toHaveLength(4)
  })
})
