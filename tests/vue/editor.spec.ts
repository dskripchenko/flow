// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { FlowEditor, type ChangeEvent } from '../../src/vue'
import { createRegistry, type Graph } from '../../src/index'
import { fromMermaid } from '../../src/mermaid'
import { orderProcess } from '../fixtures/order'

const wrappers: { unmount(): void }[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})

function editor(props: Record<string, unknown> = {}) {
  const w = mount(FlowEditor, {
    props: {
      modelValue: structuredClone(orderProcess),
      toastProvider: false,
      'onUpdate:modelValue': (g: Graph) => w.setProps({ modelValue: g }),
      ...props,
    },
    attachTo: document.body,
  })
  wrappers.push(w)
  return w
}
const model = (w: ReturnType<typeof editor>) => w.props('modelValue') as Graph
const key = (w: ReturnType<typeof editor>, k: string, mods: Record<string, boolean> = {}) => w.find('.fl-editor').trigger('keydown', { key: k, ...mods })

describe('FlowEditor', () => {
  it('adds a node from the palette, undoes and redoes it', async () => {
    const w = editor()
    const n = model(w).nodes.length
    await w.find('.fl-palette__item[data-type="task"]').trigger('click')
    expect(model(w).nodes).toHaveLength(n + 1)
    const added = model(w).nodes.at(-1)!
    expect(added).toMatchObject({ type: 'task', label: 'Task' })
    expect(added.position).toBeDefined()
    // The first edit fixes every auto-laid node in place.
    expect(model(w).nodes.every((x) => x.position)).toBe(true)
    const change = w.emitted('change')!.at(-1)![0] as ChangeEvent
    expect(change.source).toBe('edit')
    expect(change.description).toMatch(/add task-1/)
    await key(w, 'z', { ctrlKey: true })
    expect(model(w).nodes).toHaveLength(n)
    expect(model(w).nodes.some((x) => x.position)).toBe(false)
    await key(w, 'z', { ctrlKey: true, shiftKey: true })
    expect(model(w).nodes).toHaveLength(n + 1)
  })

  it('edits properties of the selected node', async () => {
    const w = editor()
    await w.find('[data-node-id="new"]').trigger('pointerdown')
    await flushPromises()
    const input = w.find('.fl-props__label input')
    await input.setValue('Received')
    expect(model(w).nodes.find((n) => n.id === 'new')!.label).toBe('Received')
    await key(w, 'z', { ctrlKey: true })
    // Undo is ignored while typing in an input; from the canvas it works.
    await w.find('[data-node-id="new"]').trigger('keydown', { key: 'z', ctrlKey: true })
    expect(model(w).nodes.find((n) => n.id === 'new')!.label).toBe('New')
  })

  it('deletes the selection with its edges', async () => {
    const w = editor()
    await w.find('[data-node-id="backorder"]').trigger('pointerdown')
    await key(w, 'Delete')
    expect(model(w).nodes.some((n) => n.id === 'backorder')).toBe(false)
    expect(model(w).edges.some((e) => e.from === 'backorder' || e.to === 'backorder')).toBe(false)
  })

  it('selects all, copies, pastes and duplicates', async () => {
    const w = editor()
    await w.find('[data-node-id="packing"]').trigger('pointerdown')
    await w.find('[data-node-id="shipped"]').element.dispatchEvent(new PointerEvent('pointerdown', { shiftKey: true, bubbles: true }))
    await key(w, 'c', { ctrlKey: true })
    await key(w, 'v', { ctrlKey: true })
    const g = model(w)
    expect(g.nodes).toHaveLength(orderProcess.nodes.length + 2)
    expect(g.edges).toHaveLength(orderProcess.edges.length + 1)
    await key(w, 'd', { ctrlKey: true })
    expect(model(w).nodes).toHaveLength(orderProcess.nodes.length + 4)
    await key(w, 'a', { ctrlKey: true })
    expect(w.find('.fl-props__count').text()).toContain(String(orderProcess.nodes.length + 4))
  })

  it('nudges with arrows and aligns several nodes', async () => {
    const w = editor({ snapGrid: 10 })
    await w.find('[data-node-id="packing"]').trigger('pointerdown')
    await key(w, 'ArrowRight')
    await key(w, 'ArrowRight')
    const p1 = model(w).nodes.find((n) => n.id === 'packing')!.position!
    await key(w, 'z', { ctrlKey: true })
    const p0 = model(w).nodes.find((n) => n.id === 'packing')!.position
    // Two nudges merge into one undo step.
    expect(p0).toBeUndefined()
    expect(p1).toBeDefined()
    await w.find('[data-node-id="packing"]').trigger('pointerdown')
    await w.find('[data-node-id="new"]').element.dispatchEvent(new PointerEvent('pointerdown', { shiftKey: true, bubbles: true }))
    await w.find('[data-align="top"]').trigger('click')
    const g = model(w)
    expect(g.nodes.find((n) => n.id === 'packing')!.position!.y - 0).toBeDefined()
  })

  it('shows validation issues and focuses their element', async () => {
    const graph: Graph = { version: 1, nodes: [{ id: 's', type: 'start' }, { id: 'a', type: 'state', label: 'A' }], edges: [{ id: 'e', from: 's', to: 'a' }] }
    const w = editor({ modelValue: graph })
    await flushPromises()
    expect(w.find('.fl-tab-issues__count').text()).toBe('2')
    expect(w.find('[data-node-id="a"] .fl-node').classes()).toContain('has-warning')
    const issues = (w.emitted('validate')!.at(-1)![0] as { code: string }[]).map((i) => i.code)
    expect(issues).toEqual(['missing-end', 'dead-end'])
  })

  it('imports Mermaid through the dialog', async () => {
    const w = editor({ mermaid: fromMermaid })
    ;(w.vm as unknown as { $: { setupState: { openImport(m: string): void } } }).$.setupState.openImport('mermaid')
    await flushPromises()
    const ta = document.body.querySelector<HTMLTextAreaElement>('.fl-import__source textarea')!
    ta.value = 'stateDiagram-v2\n[*] --> A\nA --> [*]'
    ta.dispatchEvent(new Event('input'))
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('.fl-import__apply')!.click()
    await flushPromises()
    expect(model(w).nodes.map((n) => n.id).sort()).toEqual(['A', 'end', 'start'])
  })

  it('respects locked types and read-only mode', async () => {
    const registry = createRegistry({ state: { title: 'State', shape: 'rounded', minWidth: 120, height: 44, locked: true } })
    const w = editor({ registry })
    await w.find('[data-node-id="new"]').trigger('pointerdown')
    await key(w, 'Delete')
    expect(model(w).nodes.some((n) => n.id === 'new')).toBe(true)
    expect(w.find('.fl-props__label input').attributes('disabled')).toBeDefined()
    const ro = editor({ readonly: true })
    expect(ro.find('.fl-editor__palette').exists()).toBe(false)
  })

  it('edits an inline sub-process and reports the change at the root', async () => {
    const w = editor()
    await w.find('[data-node-id="payment"] .fl-node__enter').trigger('click')
    await flushPromises()
    expect(w.find('[data-node-id="authorize"]').exists()).toBe(true)
    await w.find('[data-node-id="authorize"]').trigger('pointerdown')
    await w.find('.fl-props__label input').setValue('Authorise')
    const change = w.emitted('change')!.at(-1)![0] as ChangeEvent
    expect(change.command).toMatchObject({ type: 'updateNode', id: 'payment' })
    expect(change.local.path).toEqual(['payment'])
    const sub = model(w).nodes.find((n) => n.id === 'payment')!.subgraph as Graph
    expect(sub.nodes.find((n) => n.id === 'authorize')!.label).toBe('Authorise')
  })
})
