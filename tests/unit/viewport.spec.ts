import { describe, expect, it } from 'vitest'
import { fitView, nearestInDirection, toGraph, toScreen, zoomAt } from '../../src/index'

describe('viewport', () => {
  it('converts both ways', () => {
    const v = { x: 10, y: 20, k: 2 }
    expect(toGraph(v, toScreen(v, { x: 3, y: 4 }))).toEqual({ x: 3, y: 4 })
  })
  it('zooms around a point within limits', () => {
    const v = zoomAt({ x: 0, y: 0, k: 1 }, 2, { x: 100, y: 100 })
    expect(v.k).toBe(2)
    expect(toGraph(v, { x: 100, y: 100 })).toEqual({ x: 100, y: 100 })
    expect(zoomAt(v, 100, { x: 0, y: 0 }).k).toBe(2.5)
  })
  it('fits and centres, without blowing small graphs up', () => {
    const v = fitView({ x: 0, y: 0, width: 1000, height: 500 }, 600, 400, 50)
    expect(v.k).toBeCloseTo(0.5)
    expect(fitView({ x: 0, y: 0, width: 10, height: 10 }, 600, 400).k).toBe(1)
  })
  it('finds the nearest node in a direction', () => {
    const nodes = [
      { id: 'right', x: 100, y: 5 },
      { id: 'far-right', x: 300, y: 0 },
      { id: 'up', x: 0, y: -100 },
    ]
    expect(nearestInDirection({ x: 0, y: 0 }, nodes, 'right')).toBe('right')
    expect(nearestInDirection({ x: 0, y: 0 }, nodes, 'up')).toBe('up')
    expect(nearestInDirection({ x: 0, y: 0 }, nodes, 'left')).toBeUndefined()
  })
})
