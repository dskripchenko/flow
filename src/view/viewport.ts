/**
 * Viewport math: the transform between graph coordinates and screen pixels.
 * `screen = graph * k + (x, y)`.
 */
import type { Point } from '../model/types'

export interface Viewport {
  x: number
  y: number
  /** Zoom factor. */
  k: number
}

export interface ZoomLimits {
  min: number
  max: number
}

export const DEFAULT_LIMITS: ZoomLimits = { min: 0.2, max: 2.5 }

export function clampZoom(k: number, limits: ZoomLimits = DEFAULT_LIMITS): number {
  return Math.min(limits.max, Math.max(limits.min, k))
}

export function toScreen(v: Viewport, p: Point): Point {
  return { x: p.x * v.k + v.x, y: p.y * v.k + v.y }
}

export function toGraph(v: Viewport, p: Point): Point {
  return { x: (p.x - v.x) / v.k, y: (p.y - v.y) / v.k }
}

/** Zooms by `factor` keeping the graph point under `at` (screen) in place. */
export function zoomAt(v: Viewport, factor: number, at: Point, limits: ZoomLimits = DEFAULT_LIMITS): Viewport {
  const k = clampZoom(v.k * factor, limits)
  const g = toGraph(v, at)
  return { k, x: at.x - g.x * k, y: at.y - g.y * k }
}

/**
 * The viewport that shows `bounds` whole and centred in a `width × height`
 * screen with `padding`; never zooms in beyond `maxFit` (small graphs stay
 * at a readable size instead of blowing up).
 */
export function fitView(
  bounds: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
  padding = 32,
  limits: ZoomLimits = DEFAULT_LIMITS,
  maxFit = 1,
): Viewport {
  if (bounds.width <= 0 || bounds.height <= 0 || width <= 0 || height <= 0) {
    return { x: width / 2 - bounds.x, y: height / 2 - bounds.y, k: 1 }
  }
  const k = clampZoom(Math.min((width - padding * 2) / bounds.width, (height - padding * 2) / bounds.height, maxFit), limits)
  return {
    k,
    x: width / 2 - (bounds.x + bounds.width / 2) * k,
    y: height / 2 - (bounds.y + bounds.height / 2) * k,
  }
}

/** Pans so that a graph point sits in the screen centre, keeping the zoom. */
export function centreOn(v: Viewport, p: Point, width: number, height: number): Viewport {
  return { k: v.k, x: width / 2 - p.x * v.k, y: height / 2 - p.y * v.k }
}

/** Whether a graph-space box is (mostly) inside the visible area. */
export function isVisible(v: Viewport, box: { x: number; y: number; width: number; height: number }, width: number, height: number, margin = 24): boolean {
  const a = toScreen(v, { x: box.x - box.width / 2, y: box.y - box.height / 2 })
  const b = toScreen(v, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  return a.x >= margin && a.y >= margin && b.x <= width - margin && b.y <= height - margin
}

/** The node nearest to `from` in a direction: arrow-key navigation. */
export function nearestInDirection(
  from: Point,
  candidates: Iterable<{ id: string; x: number; y: number }>,
  dir: 'up' | 'down' | 'left' | 'right',
): string | undefined {
  let best: string | undefined
  let bestScore = Infinity
  for (const c of candidates) {
    const dx = c.x - from.x
    const dy = c.y - from.y
    const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    if (along <= 1) continue
    // Prefer straight ahead: sideways distance counts double.
    const score = along + across * 2
    if (score < bestScore) {
      bestScore = score
      best = c.id
    }
  }
  return best
}
