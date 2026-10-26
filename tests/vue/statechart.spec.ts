// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { FlowView, FlowNodeShape, en, ru } from '../../src/vue'
import { defaultRegistry, layoutGraph } from '../../src/index'
import { claimProcess, claimProcessV10 } from '../fixtures/statechart'

const wrappers: { unmount(): void }[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})
function view(props: Record<string, unknown> = {}) {
  const w = mount(FlowView, { props: { graph: claimProcess, toastProvider: false, ...props }, attachTo: document.body })
  wrappers.push(w)
  return w
}

describe('flow 1.1 in the viewer', () => {
  it('draws a parallel node with its regions and join', () => {
    const layout = layoutGraph(claimProcess)
    const node = claimProcess.nodes.find((n) => n.id === 'review')!
    const w = mount(FlowNodeShape, {
      props: { node, geometry: layout.nodes.get('review')!, def: defaultRegistry.get('parallel')!, drillable: true, labels: en },
    })
    wrappers.push(w)
    expect(w.findAll('.fl-node__region-label').map((t) => t.text())).toEqual(['Documents', 'Approval'])
    expect(w.findAll('.fl-node__region-divider')).toHaveLength(1)
    expect(w.find('.fl-node__join text').text()).toBe('all regions')
    expect(w.find('.fl-node__enter').exists()).toBe(true)
  })

  it('draws timer, wait and any as round event shapes', () => {
    const w = view()
    expect(w.find('[data-node-id="reminder"] .fl-node__body--event').exists()).toBe(true)
    expect(w.find('[data-node-id="reminder"] .fl-node__event-inner').exists()).toBe(true)
    expect(w.find('[data-node-id="any"] .fl-node__body--any').exists()).toBe(true)
  })

  it('puts the trigger icon on the edge label', () => {
    const w = view()
    const timer = w.find('[data-edge-id="e4"] .fl-edge-label__trigger')
    expect(timer.exists()).toBe(true)
    expect(timer.attributes('aria-label')).toBe('Timer')
    expect(w.find('[data-edge-id="e5"] .fl-edge-label__trigger').attributes('aria-label')).toBe('Event')
    expect(w.find('[data-edge-id="e2"] .fl-edge-label__trigger').exists()).toBe(false)
  })

  it('drills into a parallel node: regions as lanes, join in the bar', async () => {
    const w = view()
    await w.find('[data-node-id="review"] .fl-node__enter').trigger('click')
    await flushPromises()
    expect(w.findAll('.fl-group--region').map((g) => g.attributes('data-group-id'))).toEqual(['docs', 'approval'])
    expect(w.find('.fl-nav__join').text()).toContain('all regions')
  })

  it('does not draw a sub-process graph as regions', async () => {
    const w = view({ graph: claimProcessV10 })
    await w.find('[data-node-id="review"] .fl-node__enter').trigger('click')
    await flushPromises()
    expect(w.find('.fl-group').exists()).toBe(true)
    expect(w.find('.fl-group--region').exists()).toBe(false)
    expect(w.find('.fl-nav__join').exists()).toBe(false)
  })

  it('tones the unknown and compensated statuses without a statusTones map', async () => {
    const w = view({ state: { nodes: { filing: { status: 'unknown' }, review: { status: 'compensated' } } } })
    await flushPromises()
    expect(w.find('[data-node-id="filing"] .fl-node').classes()).toContain('fl-tone--warning')
    expect(w.find('[data-node-id="review"] .fl-node').classes()).toContain('fl-tone--neutral')
  })

  it('names the new types and statuses in both languages', () => {
    for (const l of [en, ru]) {
      for (const t of ['parallel', 'timer', 'wait', 'any']) expect(l.types[t]).toBeTruthy()
      for (const s of ['unknown', 'compensated']) expect(l.statuses[s]).toBeTruthy()
    }
  })
})
