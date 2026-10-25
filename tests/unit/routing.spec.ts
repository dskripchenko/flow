import { describe, expect, it } from 'vitest'
import { layoutGraph, type Graph, type GraphLayout, type NodeBox } from '../../src/index'
import { isBehind } from '../../src/layout/channels'
import { segmentHitsBox } from '../../src/layout/route'
import { orderProcess, paymentProcess } from '../fixtures/order'
import { largeGraph } from '../fixtures/large'

const shrink = (b: NodeBox, d: number): NodeBox => ({ ...b, width: b.width - 2 * d, height: b.height - 2 * d })
const overlap = (a: NodeBox, b: NodeBox) => Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2

function groupsOf(g: Graph, id: string): Set<string> {
  const parent = new Map((g.groups ?? []).map((x) => [x.id, x.parent]))
  const out = new Set<string>()
  let cur = g.nodes.find((n) => n.id === id)?.group
  while (cur && !out.has(cur)) {
    out.add(cur)
    cur = parent.get(cur)
  }
  return out
}

/** Edges through other nodes or through groups that hold neither end. */
function crossings(g: Graph, l: GraphLayout): string[] {
  const out: string[] = []
  for (const e of g.edges) {
    if (e.kind === 'association' || e.from === e.to) continue
    const pts = l.edges.get(e.id)!.points
    const own = new Set([...groupsOf(g, e.from), ...groupsOf(g, e.to)])
    for (let i = 1; i < pts.length; i++) {
      for (const [id, b] of l.nodes) if (id !== e.from && id !== e.to && segmentHitsBox(pts[i - 1]!, pts[i]!, shrink(b, 2))) out.push(`${e.id} × ${id}`)
      for (const [id, b] of l.groups) if (!own.has(id) && segmentHitsBox(pts[i - 1]!, pts[i]!, shrink(b, 2))) out.push(`${e.id} × group ${id}`)
    }
  }
  return [...new Set(out)]
}

describe('edge routing', () => {
  for (const direction of ['LR', 'TB'] as const) {
    for (const routing of ['orthogonal', 'spline'] as const) {
      it(`keeps edges out of foreign nodes and groups (${direction}, ${routing})`, () => {
        for (const g of [orderProcess, paymentProcess]) expect(crossings(g, layoutGraph(g, { direction, routing }))).toEqual([])
      })
    }
  }

  it('routes back edges through lanes beside the graph', () => {
    const l = layoutGraph(orderProcess, { direction: 'LR' })
    const back = orderProcess.edges.filter((e) => e.kind !== 'association' && isBehind(l.nodes.get(e.from)!, l.nodes.get(e.to)!, 'LR'))
    expect(back.map((e) => e.id).sort()).toEqual(['e15', 'e19', 'e9'].sort())
    const bottom = Math.max(...[...l.nodes.values()].map((n) => n.y + n.height / 2))
    const top = Math.min(...[...l.nodes.values()].map((n) => n.y - n.height / 2))
    const lanes = back.map((e) => {
      const pts = l.edges.get(e.id)!.points
      // Axis-aligned throughout, with a lane outside the nodes' extent.
      for (let i = 1; i < pts.length; i++) expect(Math.abs(pts[i]!.x - pts[i - 1]!.x) < 0.5 || Math.abs(pts[i]!.y - pts[i - 1]!.y) < 0.5).toBe(true)
      const lane = pts.find((p, i) => i > 0 && Math.abs(p.y - pts[i - 1]!.y) < 0.5 && (p.y > bottom || p.y < top))
      expect(lane, e.id).toBeDefined()
      const xs = pts.map((p) => p.x)
      return { id: e.id, y: lane!.y, lo: Math.min(...xs), hi: Math.max(...xs) }
    })
    // Parallel back edges never share a lane where they overlap.
    for (let i = 0; i < lanes.length; i++)
      for (let j = i + 1; j < lanes.length; j++) {
        const a = lanes[i]!
        const b = lanes[j]!
        if (a.lo < b.hi && b.lo < a.hi) expect(Math.abs(a.y - b.y), `${a.id}/${b.id}`).toBeGreaterThan(10)
      }
    // Labels sit on their lane.
    for (const e of back) {
      const geo = l.edges.get(e.id)!
      if (geo.label) expect(lanes.some((x) => x.id === e.id && Math.abs(x.y - geo.label!.y) < geo.label!.height)).toBe(true)
    }
  })

  it('places labels off nodes and off each other', () => {
    for (const g of [orderProcess, largeGraph(80)]) {
      for (const direction of ['LR', 'TB'] as const) {
        const l = layoutGraph(g, { direction, edgeLabelExtra: 30 })
        const labels = [...l.edges.values()].filter((e) => e.label).map((e) => ({ id: e.id, b: e.label! }))
        for (const { id, b } of labels) for (const [nid, n] of l.nodes) expect(overlap(shrink(b, 1), n), `${id} over ${nid}`).toBe(false)
        for (let i = 0; i < labels.length; i++)
          for (let j = i + 1; j < labels.length; j++) expect(overlap(shrink(labels[i]!.b, 1), labels[j]!.b), `${labels[i]!.id} × ${labels[j]!.id}`).toBe(false)
      }
    }
  })

  it('defaults to orthogonal routing and roomier nodes', () => {
    const l = layoutGraph(orderProcess)
    expect(l.routing).toBe('orthogonal')
    const state = l.nodes.get('packing')!
    expect(state.width).toBeGreaterThanOrEqual(160)
    expect(state.height).toBe(44)
  })
})
