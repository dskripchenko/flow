// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { FlowView } from '../../src/vue'
import { notationRegistry, type Graph } from '../../src/index'
import { dfdShop, epcOrder, idef0Make } from '../fixtures/notations'

const wrappers: { unmount(): void }[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})

function view(graph: Graph, notation: 'epc' | 'dfd' | 'idef0') {
  const w = mount(FlowView, { props: { graph, registry: notationRegistry(notation) }, attachTo: document.body })
  wrappers.push(w)
  return w
}

describe('notation shapes', () => {
  it('draws EPC events, connectors and documents', () => {
    const w = view(epcOrder, 'epc')
    expect(w.findAll('.fl-node__glyph-text').map((t) => t.text())).toEqual(['×', '×'])
    expect(w.findAll('path.fl-node__body').length).toBeGreaterThanOrEqual(6)
    expect(w.findAll('ellipse.fl-node__body')).toHaveLength(1)
  })

  it('draws DFD processes, entities and stores with their numbers', () => {
    const w = view(dfdShop, 'dfd')
    expect(w.findAll('.fl-node__number').map((t) => t.text())).toEqual(['1', '2', 'D1'])
    expect(w.findAll('.fl-node__store-line')).toHaveLength(1)
  })

  it('numbers IDEF0 boxes', () => {
    const w = view(idef0Make, 'idef0')
    expect(w.findAll('.fl-node__number').map((t) => t.text())).toEqual(['A1', 'A2'])
  })
})
