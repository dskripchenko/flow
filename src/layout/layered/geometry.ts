/**
 * The two shapes the layered layout speaks in. Copied from
 * @dskripchenko/diagrams (src/core/geometry.ts) together with the layout.
 */
export interface Point {
  x: number
  y: number
}

export interface Box {
  /** Centre. */
  x: number
  y: number
  width: number
  height: number
}
