/**
 * Back edges — transitions against the flow (retry, resend, give up…) — are
 * routed through a channel beside the graph instead of across it: out of the
 * source's side facing the channel, along a lane of their own, and back into
 * the target from the same side. Lanes are assigned like intervals on a line,
 * so parallel back edges never share one; the shortest take the inner lanes.
 * The side (below/above in LR, right/left in TB) is picked per edge so its
 * drops do not cut through other nodes or foreign groups.
 */
import { roundedPath, sidePoint, type Anchor, type NodeBox } from './route'
import type { Point, PortSide } from '../model/types'

export interface BackEdgeInput {
  id: string
  from: string
  to: string
  source: NodeBox
  target: NodeBox
  /** Groups (with ancestors) the source and the target sit in. */
  sourceGroups: ReadonlySet<string>
  targetGroups: ReadonlySet<string>
  label?: { width: number; height: number }
  /** Offsets along the side are spread when the shape allows it. */
  spreadSource: boolean
  spreadTarget: boolean
}

export interface ChannelRoute {
  d: string
  points: Point[]
  from: Anchor
  to: Anchor
  label?: Point
}

export interface ChannelContext {
  direction: 'LR' | 'TB'
  /** Every node box (obstacles and the graph's extent), by id. */
  nodes: ReadonlyMap<string, NodeBox>
  groups: ReadonlyMap<string, NodeBox>
  /** Extra room past a node on the channel side (a label under a circle). */
  extraBelow?: (id: string) => number
}

const GAP = 30
const LANE = 16
const LANE_LABELLED = 30

/** Whether `target` lies wholly behind `source` along the flow. */
export function isBehind(source: NodeBox, target: NodeBox, direction: 'LR' | 'TB'): boolean {
  return direction === 'LR' ? target.x + target.width / 2 <= source.x - source.width / 2 : target.y + target.height / 2 <= source.y - source.height / 2
}

export function routeChannels(edges: readonly BackEdgeInput[], ctx: ChannelContext): Map<string, ChannelRoute> {
  const out = new Map<string, ChannelRoute>()
  if (edges.length === 0) return out
  const lr = ctx.direction === 'LR'
  // Main axis m (the flow), cross axis c (where the channel is).
  const m = (p: Point) => (lr ? p.x : p.y)
  const c = (p: Point) => (lr ? p.y : p.x)
  const mHalf = (b: NodeBox) => (lr ? b.width : b.height) / 2
  const cHalf = (b: NodeBox) => (lr ? b.height : b.width) / 2
  const at = (mv: number, cv: number): Point => (lr ? { x: mv, y: cv } : { x: cv, y: mv })

  let cMin = Infinity
  let cMax = -Infinity
  for (const [id, b] of ctx.nodes) {
    cMin = Math.min(cMin, c(b) - cHalf(b))
    cMax = Math.max(cMax, c(b) + cHalf(b) + (ctx.extraBelow?.(id) ?? 0))
  }
  for (const g of ctx.groups.values()) {
    cMin = Math.min(cMin, c(g) - cHalf(g))
    cMax = Math.max(cMax, c(g) + cHalf(g))
  }

  /** Things a straight segment along the cross axis at `mv`, from `c0` to the graph's edge on side `s`, would cut through. */
  const blockedFrom = (skip: string, mv: number, c0: number, s: 1 | -1, own: ReadonlySet<string>): number => {
    let n = 0
    const hit = (b: NodeBox) => Math.abs(m(b) - mv) < mHalf(b) + 6 && (s > 0 ? c(b) + cHalf(b) > c0 + 1 : c(b) - cHalf(b) < c0 - 1)
    for (const [other, b] of ctx.nodes) if (other !== skip && hit(b)) n++
    for (const [gid, g] of ctx.groups) if (!own.has(gid) && hit(g)) n += 2
    return n
  }

  interface EndPlan {
    /** On the node's outline. */
    point: Point
    side: PortSide
    /** Where the drop to the lane runs along the main axis. */
    dropM: number
    /** A stub out of the node before the drop (rank-gap exits). */
    stub?: Point
    cost: number
  }
  const used = new Map<string, number[]>()
  /**
   * How one end reaches the channel on side `s`: straight out of the side
   * facing the channel at the first clear offset, else out of the side facing
   * along the flow into the gap between ranks, else straight (blocked).
   */
  const endPlan = (id: string, box: NodeBox, own: ReadonlySet<string>, s: 1 | -1, isSource: boolean, spread: boolean, commit: boolean): EndPlan => {
    const facing: PortSide = lr ? (s > 0 ? 'bottom' : 'top') : s > 0 ? 'right' : 'left'
    const key = `${id}\u0000${facing}`
    const taken = used.get(key) ?? []
    const offsets = spread ? [0.5, 0.3, 0.7, 0.15, 0.85] : [0.5]
    const edgeC = c(box) + s * cHalf(box)
    for (const o of offsets) {
      if (taken.some((t) => Math.abs(t - o) < 0.1)) continue
      const p = sidePoint(box, facing, o)
      if (blockedFrom(id, m(p), edgeC, s, own) === 0) {
        if (commit) used.set(key, [...taken, o])
        return { point: p, side: facing, dropM: m(p), cost: 0 }
      }
    }
    // Into a gap between ranks: a source prefers to leave backwards, a target
    // to be entered from ahead; the other gap is the next choice.
    const gapSides: PortSide[] = lr ? (isSource ? ['left', 'right'] : ['right', 'left']) : isSource ? ['top', 'bottom'] : ['bottom', 'top']
    let best: EndPlan | undefined
    for (const gapSide of gapSides) {
      const p = sidePoint(box, gapSide, 0.5)
      const dir = gapSide === 'left' || gapSide === 'top' ? -1 : 1
      const dropM = m(p) + dir * 18
      const cost = blockedFrom(id, dropM, c(box), s, own)
      const plan: EndPlan = { point: p, side: gapSide, dropM, stub: at(dropM, c(p)), cost }
      if (cost === 0) return plan
      if (!best || cost < best.cost) best = plan
    }
    const p0 = sidePoint(box, facing, 0.5)
    const straight: EndPlan = { point: p0, side: facing, dropM: m(p0), cost: blockedFrom(id, m(p0), edgeC, s, own) }
    return best && best.cost < straight.cost ? best : straight
  }

  interface Plan {
    e: BackEdgeInput
    side: 1 | -1
    lane: number
    lo: number
    hi: number
    src: EndPlan
    dst: EndPlan
  }
  const plans: Plan[] = edges.map((e) => {
    const cost = (s: 1 | -1) =>
      endPlan(e.from, e.source, e.sourceGroups, s, true, e.spreadSource, false).cost + endPlan(e.to, e.target, e.targetGroups, s, false, e.spreadTarget, false).cost
    const side: 1 | -1 = cost(-1) < cost(1) ? -1 : 1
    const src = endPlan(e.from, e.source, e.sourceGroups, side, true, e.spreadSource, true)
    const dst = endPlan(e.to, e.target, e.targetGroups, side, false, e.spreadTarget, true)
    return { e, side, lane: 0, lo: Math.min(src.dropM, dst.dropM), hi: Math.max(src.dropM, dst.dropM), src, dst }
  })

  // Lanes per side: shortest spans innermost, first lane whose spans do not overlap.
  for (const s of [1, -1] as const) {
    const side = plans.filter((p) => p.side === s).sort((a, b) => a.hi - a.lo - (b.hi - b.lo) || a.lo - b.lo)
    const lanes: { lo: number; hi: number }[][] = []
    for (const p of side) {
      let i = lanes.findIndex((lane) => lane.every((r) => p.hi + 12 < r.lo || p.lo - 12 > r.hi))
      if (i < 0) {
        lanes.push([])
        i = lanes.length - 1
      }
      lanes[i]!.push({ lo: p.lo, hi: p.hi })
      p.lane = i
    }
  }
  const labelled = (s: 1 | -1) => plans.some((p) => p.side === s && p.e.label)
  const gap = (s: 1 | -1) => (lr && labelled(s) ? LANE_LABELLED : LANE)
  const base = (s: 1 | -1) => (s > 0 ? cMax + GAP : cMin - GAP)

  for (const p of plans) {
    const s = p.side
    const laneC = base(s) + s * p.lane * gap(s)
    const points: Point[] = [p.src.point]
    if (p.src.stub) points.push(p.src.stub)
    points.push(at(p.src.dropM, laneC), at(p.dst.dropM, laneC))
    if (p.dst.stub) points.push(p.dst.stub)
    points.push(p.dst.point)
    const route: ChannelRoute = { d: roundedPath(points, 10), points, from: { point: p.src.point, side: p.src.side }, to: { point: p.dst.point, side: p.dst.side } }
    if (p.e.label) route.label = at((p.src.dropM + p.dst.dropM) / 2, laneC)
    out.set(p.e.id, route)
  }
  return out
}
