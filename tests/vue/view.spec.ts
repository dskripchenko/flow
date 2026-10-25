// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createApp } from 'vue'
import { FlowView, FlowNodeShape, en, mountFlow, type ToggleChange } from '../../src/vue'
import { defaultRegistry, layoutGraph, type MonitorSnapshot } from '../../src/index'
import { orderProcess, snapshotAt } from '../fixtures/order'

const wrappers: { unmount(): void }[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})
/** A tap: press and release without moving (the viewer selects on release). */
async function tap(w: ReturnType<typeof view>, selector: string) {
  await w.find(selector).trigger('pointerdown')
  await w.find('.fl-canvas').trigger('pointerup')
}
function view(props: Record<string, unknown> = {}) {
  const w = mount(FlowView, { props: { graph: orderProcess, toastProvider: false, ...props }, attachTo: document.body })
  wrappers.push(w)
  return w
}

describe('FlowView', () => {
  it('renders every node and edge with accessible names', () => {
    const w = view()
    expect(w.findAll('[data-node-id]')).toHaveLength(orderProcess.nodes.length)
    expect(w.findAll('.fl-edge')).toHaveLength(orderProcess.edges.length)
    const node = w.find('[data-node-id="validate"]')
    expect(node.attributes('role')).toBe('button')
    expect(node.attributes('tabindex')).toBe('0')
    expect(node.attributes('aria-label')).toContain('Validate order')
    expect(w.find('svg.fl-svg').attributes('aria-label')).toBe('Order')
  })

  it('draws the monitoring overlay from a snapshot', async () => {
    const w = view({ state: snapshotAt(6) })
    await flushPromises()
    expect(w.find('[data-node-id="payment"] .fl-node').classes()).toContain('is-current')
    expect(w.find('[data-node-id="delivery-failed"] .fl-node').classes()).toContain('fl-tone--danger')
    expect(w.find('[data-node-id="delivery-failed"] .fl-node__chip text').text()).toBe('2')
    expect(w.find('[data-node-id="packing"] .fl-node__count text').text()).toBe('18')
    expect(w.find('.fl-edge[data-edge-id="e4"]').classes()).toContain('is-path')
    expect(w.find('.fl-edge-label[data-edge-id="e13"] .fl-edge-count text').text()).toBe('46')
    expect(w.find('.fl-status').text()).toMatch(/Updated/)
    expect(w.find('[data-node-id="payment"]').attributes('aria-label')).toContain('Active')
  })

  it('polls and folds snapshots', async () => {
    vi.useFakeTimers()
    let step = 0
    const fetch = vi.fn(async (): Promise<MonitorSnapshot> => snapshotAt(step++))
    const w = view({ poll: { fetch, intervalMs: 1000, visibilityPause: false } })
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    expect(w.find('[data-node-id="start"] .fl-node').classes()).toContain('is-current')
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(w.find('[data-node-id="validate"] .fl-node').classes()).toContain('is-current')
    w.unmount()
    vi.useRealTimers()
  })

  it('selects a node on click and opens the details drawer', async () => {
    const w = view({ state: snapshotAt(6) })
    await tap(w, '[data-node-id="delivery-failed"]')
    await flushPromises()
    const sel = w.emitted('select')!.at(-1)![0] as { id: string; kind: string }
    expect(sel).toMatchObject({ kind: 'node', id: 'delivery-failed' })
    const drawer = document.body.querySelector('.uid-drawer')
    expect(drawer?.textContent).toContain('Carrier API timeout')
    expect(drawer?.textContent).toContain('Error')
  })

  it('selects with the keyboard', async () => {
    const w = view()
    const node = w.find('[data-node-id="new"]')
    await node.trigger('focus')
    await node.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('select')!.at(-1)![0]).toMatchObject({ id: 'new' })
  })

  it('toggles optimistically and rolls back on rejection', async () => {
    let reject: (e: Error) => void = () => {}
    const onToggle = vi.fn((c: ToggleChange) => new Promise((_, r) => { reject = r; void c }))
    const w = view({ toggleable: true, onToggle })
    await tap(w, '[data-node-id="cancelled"]')
    await flushPromises()
    const sw = document.body.querySelector<HTMLInputElement>('.fl-details__toggle input')!
    expect(sw.checked).toBe(true)
    sw.click()
    await flushPromises()
    expect(onToggle).toHaveBeenCalledWith({ kind: 'node', id: 'cancelled', enabled: false, path: [] })
    expect(w.find('[data-node-id="cancelled"] .fl-node').classes()).toContain('is-disabled')
    reject(new Error('policy'))
    await flushPromises()
    expect(w.find('[data-node-id="cancelled"] .fl-node').classes()).not.toContain('is-disabled')
    expect(w.emitted('toggle-error')).toHaveLength(1)
  })

  it('drills into an inline sub-process and back', async () => {
    const w = view()
    await w.find('[data-node-id="payment"] .fl-node__enter').trigger('click')
    await flushPromises()
    expect(w.find('[data-node-id="authorize"]').exists()).toBe(true)
    expect(w.emitted('navigate')!.at(-1)![0]).toHaveLength(1)
    expect(w.find('.fl-nav').text()).toContain('Payment')
    await w.find('.fl-nav__back').trigger('click')
    await flushPromises()
    expect(w.find('[data-node-id="validate"]').exists()).toBe(true)
  })

  it('loads a referenced sub-process', async () => {
    const graph = { ...orderProcess, nodes: orderProcess.nodes.map((n) => (n.id === 'payment' ? { ...n, subgraph: 'payment-v2' } : n)) }
    const loadSubgraph = vi.fn(async () => ({ version: 1 as const, nodes: [{ id: 'remote', type: 'state', label: 'Remote' }], edges: [] }))
    const w = view({ graph, loadSubgraph })
    await w.find('[data-node-id="payment"] .fl-node__enter').trigger('click')
    await flushPromises()
    expect(loadSubgraph).toHaveBeenCalledWith('payment-v2', expect.objectContaining({ id: 'payment' }))
    expect(w.find('[data-node-id="remote"]').exists()).toBe(true)
  })

  it('shows the empty state', () => {
    const w = view({ graph: { version: 1, nodes: [], edges: [] } })
    expect(w.find('.fl-empty').text()).toContain('Nothing to show')
  })

  it('speaks Russian', () => {
    const w = view({ locale: 'ru', state: snapshotAt(2) })
    expect(w.find('.fl-status').text()).toContain('Обновлено')
  })

  it('renders custom node components', () => {
    const Custom = { props: ['node', 'geometry'], template: '<text class="custom">{{ node.label }}!</text>' }
    const w = view({ nodeRenderers: { task: Custom } })
    expect(w.find('[data-node-id="validate"] .custom').text()).toBe('Validate order!')
  })
})

describe('FlowView: host integration', () => {
  it('starts from a server snapshot and hands over to polling', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async (): Promise<MonitorSnapshot> => snapshotAt(4))
    const w = view({ state: snapshotAt(1), poll: { fetch, intervalMs: 1000, visibilityPause: false } })
    // The given snapshot shows at once (no loading state).
    expect(w.find('[data-node-id="new"] .fl-node').classes()).toContain('is-current')
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    expect(fetch).toHaveBeenCalled()
    expect(w.find('[data-node-id="payment"] .fl-node').classes()).toContain('is-current')
    // A new state from the host takes over again.
    await w.setProps({ state: snapshotAt(2) })
    expect(w.find('[data-node-id="validate"] .fl-node').classes()).toContain('is-current')
    w.unmount()
    vi.useRealTimers()
  })

  it('passes pollParams to fetch and restarts at once when they change', async () => {
    vi.useFakeTimers()
    const seen: unknown[] = []
    const fetch = vi.fn(async (_s: AbortSignal, ctx: { params?: unknown }): Promise<MonitorSnapshot> => {
      seen.push(ctx.params)
      return (ctx.params as { instance: number }).instance === 1 ? snapshotAt(1) : snapshotAt(6)
    })
    const w = view({ poll: { fetch, intervalMs: 60_000, visibilityPause: false }, pollParams: { instance: 1 } })
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    expect(w.find('[data-node-id="new"] .fl-node').classes()).toContain('is-current')
    await w.setProps({ pollParams: { instance: 2 } })
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    expect(seen).toEqual([{ instance: 1 }, { instance: 2 }])
    expect(w.find('[data-node-id="payment"] .fl-node').classes()).toContain('is-current')
    // The same params (a new object) do not restart.
    await w.setProps({ pollParams: { instance: 2 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(2)
    w.unmount()
    vi.useRealTimers()
  })

  it('mounts into a host app context', async () => {
    const key = Symbol('host')
    const Probe = { props: ['node', 'geometry'], inject: { host: { from: key, default: 'none' } }, template: '<text class="probe">{{ host }}</text>' }
    const host = createApp({ render: () => null })
    host.provide(key, 'from-host')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const handle = mountFlow(el, { graph: orderProcess, appContext: host._context, nodeRenderers: { task: Probe }, toastProvider: false })
    await flushPromises()
    expect(handle.app).toBeUndefined()
    expect(el.querySelector('.probe')?.textContent).toBe('from-host')
    handle.update({ graph: { ...orderProcess, nodes: orderProcess.nodes.filter((n) => n.id !== 'refund') } })
    await flushPromises()
    expect(el.querySelector('[data-node-id="refund"]')).toBeNull()
    handle.unmount()
    expect(el.querySelector('[data-node-id]')).toBeNull()
  })
})

describe('FlowNodeShape', () => {
  it('draws a sub-process marker and a status chip', () => {
    const g = layoutGraph(orderProcess)
    const node = orderProcess.nodes.find((n) => n.id === 'payment')!
    const w = mount(FlowNodeShape, {
      props: { node, geometry: g.nodes.get('payment')!, def: defaultRegistry.get('subprocess')!, run: { status: 'done' }, tone: 'success', drillable: true, labels: en },
      global: { stubs: {} },
      attachTo: document.body,
    })
    expect(w.find('.fl-node__enter').exists()).toBe(true)
    expect(w.find('.fl-node__chip--icon').exists()).toBe(true)
    w.unmount()
  })
})
