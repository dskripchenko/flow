/**
 * Edge label placement: a label stays where the route puts it (the layout's
 * label slot, the middle of a lane) unless it would cover a node or another
 * label; then it slides along its own route to the first free spot.
 */
import type { NodeBox } from './route'
import type { Point } from '../model/types'

export interface PlacedLabel {
  x: number
  y: number
  width: number
  height: number
}

const hits = (a: PlacedLabel, b: NodeBox, pad: number) => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + pad && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + pad

/** Candidate centres along a polyline (longest segment first), then beside it. */
function candidates(points: readonly Point[], label: PlacedLabel): Point[] {
  const segs: { a: Point; b: Point; len: number }[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    segs.push({ a, b, len: Math.hypot(b.x - a.x, b.y - a.y) })
  }
  segs.sort((u, v) => v.len - u.len)
  const out: Point[] = []
  for (const s of segs) {
    for (const t of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) out.push({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t })
  }
  // Beside the line: above/below a horizontal segment, left/right of a vertical one.
  const beside: Point[] = []
  for (const s of segs) {
    const horizontal = Math.abs(s.a.y - s.b.y) < 0.5
    const dx = horizontal ? 0 : label.width / 2 + 3
    const dy = horizontal ? label.height / 2 + 3 : 0
    for (const t of [0.5, 0.3, 0.7]) {
      const p = { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t }
      beside.push({ x: p.x - dx, y: p.y - dy }, { x: p.x + dx, y: p.y + dy })
    }
  }
  return [...out, ...beside]
}

/**
 * Moves labels off nodes and off each other, in the given order (earlier
 * labels keep their place). Mutates the labels' `x`/`y`.
 */
export function placeLabels(items: readonly { label: PlacedLabel; points: readonly Point[] }[], nodes: Iterable<NodeBox>): void {
  const boxes = [...nodes]
  const placed: PlacedLabel[] = []
  const free = (l: PlacedLabel) => !boxes.some((b) => hits(l, b, 4)) && !placed.some((p) => hits(l, p, 3))
  for (const { label, points } of items) {
    if (!free(label)) {
      for (const c of candidates(points, label)) {
        const moved = { ...label, x: c.x, y: c.y }
        if (free(moved)) {
          label.x = c.x
          label.y = c.y
          break
        }
      }
    }
    placed.push(label)
  }
}
