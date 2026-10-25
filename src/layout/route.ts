/**
 * Edge routing: from an anchor on the source's outline, through the layout's
 * waypoints, to an anchor on the target's outline — as a smooth spline or
 * as orthogonal segments with rounded corners. Pure functions over boxes, so
 * the editor re-routes only the edges of the nodes being dragged.
 */
import type { NodeShape } from '../model/registry'
import type { Point, PortSide } from '../model/types'

export type Routing = 'spline' | 'orthogonal'

export interface NodeBox {
  /** Centre. */
  x: number
  y: number
  width: number
  height: number
}

export interface Anchor {
  point: Point
  side: PortSide
}

const NORMAL: Record<PortSide, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

export function sideNormal(side: PortSide): Point {
  return NORMAL[side]
}

/** A point on a box side, `offset` 0…1 along it (left→right, top→bottom). */
export function sidePoint(box: NodeBox, side: PortSide, offset = 0.5): Point {
  const left = box.x - box.width / 2
  const top = box.y - box.height / 2
  switch (side) {
    case 'top':
      return { x: left + box.width * offset, y: top }
    case 'bottom':
      return { x: left + box.width * offset, y: top + box.height }
    case 'left':
      return { x: left, y: top + box.height * offset }
    default:
      return { x: left + box.width, y: top + box.height * offset }
  }
}

/**
 * The side of `box` that faces `toward`. `prefer` biases ties to the flow's
 * axis: in a TB layout an edge leaves through top/bottom unless the other
 * end is clearly beside the node.
 */
export function facingSide(box: NodeBox, toward: Point, prefer: 'vertical' | 'horizontal'): PortSide {
  const dx = toward.x - box.x
  const dy = toward.y - box.y
  // Normalise by the box so a wide node does not always pick top/bottom.
  const nx = Math.abs(dx) / Math.max(1, box.width / 2)
  const ny = Math.abs(dy) / Math.max(1, box.height / 2)
  const bias = 0.6
  const vertical = prefer === 'vertical' ? ny >= nx * bias : ny > nx / bias
  if (vertical) return dy < 0 ? 'top' : 'bottom'
  return dx < 0 ? 'left' : 'right'
}

/** Whether anchors on this outline may be spread along a side. */
export function spreadable(shape: NodeShape): boolean {
  return shape === 'rect' || shape === 'rounded' || shape === 'note' || shape === 'pill'
}

export interface RouteInput {
  from: Anchor
  to: Anchor
  /** Bends between the anchors (from the layered layout), in order. */
  waypoints?: readonly Point[]
  routing: Routing
  /** Corner radius for orthogonal routes. */
  radius?: number
}

export interface RoutedPath {
  /** SVG path data. */
  d: string
  /** The polyline the path follows (anchors, stubs and bends): for hit tests and the label. */
  points: Point[]
}

const STUB = 18

const fmt = (n: number) => (Math.round(n * 10) / 10).toString()
const P = (p: Point) => `${fmt(p.x)} ${fmt(p.y)}`
const add = (a: Point, b: Point, k = 1): Point => ({ x: a.x + b.x * k, y: a.y + b.y * k })
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

export function route(input: RouteInput): RoutedPath {
  return input.routing === 'orthogonal' ? orthogonal(input) : spline(input)
}

function spline({ from, to, waypoints = [] }: RouteInput): RoutedPath {
  const n0 = NORMAL[from.side]
  const n1 = NORMAL[to.side]
  const a = from.point
  const b = to.point
  if (waypoints.length === 0) {
    const k = Math.max(28, Math.min(120, dist(a, b) * 0.45))
    const c0 = add(a, n0, k)
    const c1 = add(b, n1, k)
    return { d: `M ${P(a)} C ${P(c0)} ${P(c1)} ${P(b)}`, points: [a, c0, c1, b] }
  }
  // Through the layout's bends: a uniform B-spline, as Mermaid draws.
  const pts = [a, ...waypoints, b]
  return { d: basisPath(pts), points: pts }
}

/** d3's curveBasis written out: smooth, starts and ends exactly on the end points. */
export function basisPath(points: readonly Point[]): string {
  const pts: Point[] = []
  for (const p of points) {
    const last = pts[pts.length - 1]
    if (!last || dist(last, p) > 0.5) pts.push(p)
  }
  if (pts.length === 0) return ''
  if (pts.length === 2) return `M ${P(pts[0]!)} L ${P(pts[1]!)}`
  let d = ''
  let x0 = 0
  let y0 = 0
  let x1 = 0
  let y1 = 0
  const bezier = (x: number, y: number) => {
    d += ` C ${fmt((2 * x0 + x1) / 3)} ${fmt((2 * y0 + y1) / 3)} ${fmt((x0 + 2 * x1) / 3)} ${fmt((y0 + 2 * y1) / 3)} ${fmt((x0 + 4 * x1 + x) / 6)} ${fmt((y0 + 4 * y1 + y) / 6)}`
  }
  let state = 0
  for (const p of pts) {
    if (state === 0) {
      state = 1
      d = `M ${P(p)}`
    } else if (state === 1) {
      state = 2
    } else if (state === 2) {
      state = 3
      d += ` L ${fmt((5 * x0 + x1) / 6)} ${fmt((5 * y0 + y1) / 6)}`
      bezier(p.x, p.y)
    } else {
      bezier(p.x, p.y)
    }
    x0 = x1
    x1 = p.x
    y0 = y1
    y1 = p.y
  }
  if (state === 3) bezier(x1, y1)
  d += ` L ${P({ x: x1, y: y1 })}`
  return d
}

/** Where the line from a shape's centre towards `toward` leaves its outline. */
export function clipToShape(box: NodeBox, shape: NodeShape, toward: Point): Point {
  const dx = toward.x - box.x
  const dy = toward.y - box.y
  if (dx === 0 && dy === 0) return { x: box.x, y: box.y + box.height / 2 }
  const w = box.width / 2
  const h = box.height / 2
  if (shape === 'circle' || shape === 'ring') {
    const t = 1 / Math.sqrt((dx * dx) / (w * w) + (dy * dy) / (h * h))
    return { x: box.x + dx * t, y: box.y + dy * t }
  }
  if (shape === 'diamond') {
    // |x|/w + |y|/h = 1 along the ray.
    const t = 1 / (Math.abs(dx) / w + Math.abs(dy) / h)
    return { x: box.x + dx * t, y: box.y + dy * t }
  }
  const t = Math.min(dx === 0 ? Infinity : w / Math.abs(dx), dy === 0 ? Infinity : h / Math.abs(dy))
  return { x: box.x + dx * t, y: box.y + dy * t }
}

function orthogonal({ from, to, waypoints = [], radius = 8 }: RouteInput): RoutedPath {
  const a = from.point
  const b = to.point
  const s0 = add(a, NORMAL[from.side], STUB)
  const s1 = add(b, NORMAL[to.side], STUB)
  const verticalStart = from.side === 'top' || from.side === 'bottom'
  // Bends: axis-aligned elbows between consecutive control points.
  const ctrl = [s0, ...waypoints, s1]
  const pts: Point[] = [a, s0]
  let vertical = verticalStart
  for (let i = 1; i < ctrl.length; i++) {
    const p = pts[pts.length - 1]!
    let q = ctrl[i]!
    const last = i === ctrl.length - 1
    // Bends a pixel or two off a line are on it: no tiny jogs.
    if (!last) {
      if (Math.abs(p.y - q.y) < 3) q = { x: q.x, y: p.y }
      else if (Math.abs(p.x - q.x) < 3) q = { x: p.x, y: q.y }
    }
    if (Math.abs(p.x - q.x) < 0.5 || Math.abs(p.y - q.y) < 0.5) {
      pts.push(q)
      vertical = Math.abs(p.x - q.x) < 0.5
      continue
    }
    // Into the final stub along the target side's axis.
    const endVertical = to.side === 'top' || to.side === 'bottom'
    if (last && vertical !== endVertical) {
      pts.push(vertical ? { x: p.x, y: q.y } : { x: q.x, y: p.y })
    } else if (vertical) {
      const my = (p.y + q.y) / 2
      pts.push({ x: p.x, y: my }, { x: q.x, y: my })
    } else {
      const mx = (p.x + q.x) / 2
      pts.push({ x: mx, y: p.y }, { x: mx, y: q.y })
    }
    pts.push(q)
  }
  pts.push(b)
  const clean = simplify(pts)
  return { d: roundedPath(clean, radius), points: clean }
}

/** Drops repeated and collinear points. */
function simplify(pts: Point[]): Point[] {
  const out: Point[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue
    const prev = out[out.length - 2]
    if (prev && last) {
      const col = (Math.abs(prev.x - last.x) < 0.5 && Math.abs(last.x - p.x) < 0.5) || (Math.abs(prev.y - last.y) < 0.5 && Math.abs(last.y - p.y) < 0.5)
      if (col) out.pop()
    }
    out.push(p)
  }
  return out
}

/** Straight segments with rounded corners. */
export function roundedPath(pts: readonly Point[], radius: number): string {
  let d = `M ${P(pts[0]!)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1]!
    const c = pts[i]!
    const n = pts[i + 1]!
    const r = Math.min(radius, dist(p, c) / 2, dist(c, n) / 2)
    const inP = add(c, { x: Math.sign(p.x - c.x), y: Math.sign(p.y - c.y) }, r)
    const outP = add(c, { x: Math.sign(n.x - c.x), y: Math.sign(n.y - c.y) }, r)
    d += ` L ${P(inP)} Q ${P(c)} ${P(outP)}`
  }
  d += ` L ${P(pts[pts.length - 1]!)}`
  return d
}

/** The point halfway along a polyline: where a label goes without a layout hint. */
export function midpoint(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  let total = 0
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!)
  let left = total / 2
  for (let i = 1; i < points.length; i++) {
    const l = dist(points[i - 1]!, points[i]!)
    if (left <= l && l > 0) {
      const t = left / l
      return { x: points[i - 1]!.x + (points[i]!.x - points[i - 1]!.x) * t, y: points[i - 1]!.y + (points[i]!.y - points[i - 1]!.y) * t }
    }
    left -= l
  }
  return points[points.length - 1]!
}

/** A cubic Bézier point, for the label of a direct spline. */
export function bezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}

/** Distance from a point to a polyline: hit testing edges in the editor. */
export function distanceToPolyline(p: Point, points: readonly Point[]): number {
  let best = Infinity
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2))
    best = Math.min(best, dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }))
  }
  return best
}

/**
 * Orthogonal routing through the layout's bends with as few corners as the
 * obstacles allow: the route keeps its lane while `clear` says the way along
 * the flow is free, and changes lane in the gap between two ranks (where no
 * node stands) only when the next bend would be blocked. `mainX` is true when
 * the flow runs along x (LR).
 */
export function orthogonalThrough(
  from: Anchor,
  to: Anchor,
  waypoints: readonly Point[],
  mainX: boolean,
  clear: (a: Point, b: Point) => boolean,
  radius = 10,
  /** A bend the route must run through (the layout's label slot), so the label sits where room was reserved. */
  through?: Point,
): RoutedPath {
  const m = (p: Point) => (mainX ? p.x : p.y)
  const c = (p: Point) => (mainX ? p.y : p.x)
  const at = (mv: number, cv: number): Point => (mainX ? { x: mv, y: cv } : { x: cv, y: mv })
  const s0 = add(from.point, NORMAL[from.side], STUB)
  const s1 = add(to.point, NORMAL[to.side], STUB)
  const pts: Point[] = [from.point, s0]
  let cur = s0
  // A lane change may happen as soon as the route clears the node's outline.
  let prevM = m(from.point) + Math.sign(m(s0) - m(from.point) || 1) * 6
  /** Changes lane to `cv` somewhere between prevM and nextM, preferring the middle of the gap. */
  const shift = (cv: number, nextM: number) => {
    let bend = (prevM + nextM) / 2
    for (const t of [0.5, 0.3, 0.7, 0.15, 0.85, 0.05, 0.95]) {
      const b = prevM + (nextM - prevM) * t
      if (clear(at(b, c(cur)), at(b, cv)) && clear(at(m(cur), c(cur)), at(b, c(cur)))) {
        bend = b
        break
      }
    }
    pts.push(at(bend, c(cur)), at(bend, cv))
    cur = at(bend, cv)
  }
  for (const w of waypoints) {
    const required = !!through && Math.abs(w.x - through.x) < 0.5 && Math.abs(w.y - through.y) < 0.5
    if (Math.abs(c(w) - c(cur)) < 1 || (!required && clear(cur, at(m(w), c(cur))))) {
      prevM = m(w)
      continue
    }
    shift(c(w), m(w))
    prevM = m(w)
  }
  if (Math.abs(c(cur) - c(s1)) >= 1) shift(c(s1), m(s1))
  pts.push(s1, to.point)
  const clean = simplify(pts)
  return { d: roundedPath(clean, radius), points: clean }
}

/** Whether an axis-aligned segment passes through a box (grown by `pad`). */
export function segmentHitsBox(a: Point, b: Point, box: NodeBox, pad = 0): boolean {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  const bx0 = box.x - box.width / 2 - pad
  const bx1 = box.x + box.width / 2 + pad
  const by0 = box.y - box.height / 2 - pad
  const by1 = box.y + box.height / 2 + pad
  return x1 > bx0 && x0 < bx1 && y1 > by0 && y0 < by1
}

/** The point of an orthogonal route at main-axis coordinate `mv` (for its label), if a segment along the flow covers it. */
export function pointAtMain(points: readonly Point[], mv: number, mainX: boolean): Point | undefined {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const along = mainX ? Math.abs(a.y - b.y) < 0.5 : Math.abs(a.x - b.x) < 0.5
    if (!along) continue
    const lo = Math.min(mainX ? a.x : a.y, mainX ? b.x : b.y)
    const hi = Math.max(mainX ? a.x : a.y, mainX ? b.x : b.y)
    if (mv >= lo && mv <= hi) return mainX ? { x: mv, y: a.y } : { x: a.x, y: mv }
  }
  return undefined
}
