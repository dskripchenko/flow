import { describe, expect, it } from 'vitest'
import { clipToShape } from '../../src/layout/route'
import { DFD_TYPES, EPC_TYPES, IDEF0_PORTS, layoutGraph, NOTATIONS, notationRegistry, validateGraph } from '../../src/index'
import { dfdShop, epcOrder, idef0Make } from '../fixtures/notations'

describe('notations', () => {
  it('offer their types, a palette and a direction', () => {
    expect(NOTATIONS.epc.palette).toEqual([...Object.keys(EPC_TYPES), 'note'])
    expect(NOTATIONS.dfd.palette).toEqual(['dfd-process', 'dfd-entity', 'dfd-store', 'note'])
    expect(NOTATIONS.idef0.direction).toBe('LR')
    expect(EPC_TYPES['epc-xor']).toMatchObject({ shape: 'operator', glyph: '×' })
    expect(DFD_TYPES['dfd-store']).toMatchObject({ shape: 'store', numbered: true })
    const registry = notationRegistry('idef0')
    expect(registry.get('idef0-function')!.ports).toBe(IDEF0_PORTS)
    // The built-in types stay available (notes, for one).
    expect(registry.get('note')).toBeDefined()
  })

  it.each([
    ['epc', epcOrder],
    ['dfd', dfdShop],
    ['idef0', idef0Make],
  ] as const)('the %s example is a valid graph', (name, graph) => {
    const errors = validateGraph(graph, { registry: notationRegistry(name) }).filter((i) => i.severity === 'error')
    expect(errors).toEqual([])
  })

  it('clips edges to ellipses and operator circles', () => {
    const box = { x: 0, y: 0, width: 100, height: 50 }
    expect(clipToShape(box, 'ellipse', { x: 200, y: 0 })).toEqual({ x: 50, y: 0 })
    const p = clipToShape(box, 'operator', { x: 100, y: 100 })
    expect(Math.hypot(p.x / 50, p.y / 25)).toBeCloseTo(1)
  })
})

describe('layout of satellites', () => {
  const layout = layoutGraph(idef0Make, { registry: notationRegistry('idef0') })
  const n = (id: string) => layout.nodes.get(id)!

  it('puts a control above its box and a mechanism below it', () => {
    expect(n('policy').x).toBeCloseTo(n('a1').x)
    expect(n('policy').y).toBeLessThan(n('a1').y - n('a1').height / 2)
    expect(n('staff').y).toBeGreaterThan(n('a1').y + n('a1').height / 2)
    expect(n('workshop').x).toBeCloseTo(n('a2').x)
    expect(n('workshop').y).toBeGreaterThan(n('a2').y)
  })

  it('keeps inputs and outputs in the flow', () => {
    expect(n('in-order').x).toBeLessThan(n('a1').x)
    expect(n('product').x).toBeGreaterThan(n('a2').x)
    expect(n('a1').x).toBeLessThan(n('a2').x)
  })

  it('enters the control port from above', () => {
    const edge = layout.edges.get('c1')!
    const end = edge.points[edge.points.length - 1]!
    expect(end.y).toBeCloseTo(n('a1').y - n('a1').height / 2)
  })

  it('leaves graphs without side ports alone', () => {
    const plain = layoutGraph(dfdShop, { registry: notationRegistry('dfd') })
    const again = layoutGraph({ ...dfdShop, nodes: dfdShop.nodes }, { registry: notationRegistry('dfd') })
    expect([...plain.nodes.values()].map((g) => [g.x, g.y])).toEqual([...again.nodes.values()].map((g) => [g.x, g.y]))
    expect(plain.nodes.get('customer')!.x).toBeLessThan(plain.nodes.get('p1')!.x)
  })
})
