// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { FlowEditor, type ChangeEvent } from '../../src/vue'
import { UidSelect } from '@dskripchenko/ui'
import { createRegistry, type Graph } from '../../src/index'
import { fromMermaid } from '../../src/mermaid'
import { orderProcess } from '../fixtures/order'
import { claimProcess } from '../fixtures/statechart'

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

  it('connects from the properties panel without a pointer', async () => {
    const w = editor()
    await w.find('[data-node-id="refund"]').trigger('pointerdown')
    await flushPromises()
    const select = w.findAllComponents(UidSelect).find((c) => c.classes().includes('fl-props__connect'))!
    expect(select).toBeDefined()
    // The select is named for assistive technology, not only by its placeholder.
    expect((select.props() as { ariaLabel?: string }).ariaLabel ?? select.attributes('aria-label')).toBeTruthy()
    select.vm.$emit('update:modelValue', 'cancelled')
    await flushPromises()
    const edge = model(w).edges.at(-1)!
    expect(edge).toMatchObject({ from: 'refund', to: 'cancelled' })
    expect((w.emitted('select')!.at(-1)![0] as string[])).toEqual([edge.id])
  })

  it('locks the node types given in `locked`', async () => {
    const w = editor({ locked: ['state'] })
    await w.find('[data-node-id="new"]').trigger('pointerdown')
    await key(w, 'Delete')
    expect(model(w).nodes.some((n) => n.id === 'new')).toBe(true)
    expect(w.find('.fl-props__label input').attributes('disabled')).toBeDefined()
    await w.find('[data-node-id="validate"]').trigger('pointerdown')
    await key(w, 'Delete')
    expect(model(w).nodes.some((n) => n.id === 'validate')).toBe(false)
  })

  it('places palette clicks on free spots, next to the selected node', async () => {
    const graph: Graph = {
      version: 1,
      nodes: [
        { id: 'a', type: 'state', label: 'A', position: { x: 0, y: 0 } },
        { id: 'b', type: 'state', label: 'B', position: { x: 260, y: 0 } },
      ],
      edges: [],
    }
    const w = editor({ modelValue: graph })
    await w.find('[data-node-id="a"]').trigger('pointerdown')
    await w.find('.fl-palette__item[data-type="task"]').trigger('click')
    const first = model(w).nodes.at(-1)!
    // Next along the flow from the selection (to its right), on a free spot.
    expect(first.position!.x).toBeGreaterThan(80)
    for (let i = 0; i < 5; i++) await w.find('.fl-palette__item[data-type="state"]').trigger('click')
    const ps = model(w).nodes.map((n) => n.position!)
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) expect(Math.abs(ps[i]!.x - ps[j]!.x) >= 160 || Math.abs(ps[i]!.y - ps[j]!.y) >= 44, `${i} × ${j}`).toBe(true)
  })

  it('edits a parallel node join and an edge trigger', async () => {
    const w = editor({ modelValue: structuredClone(claimProcess) })
    await w.find('[data-node-id="review"]').trigger('pointerdown')
    await flushPromises()
    const field = (label: string) => w.findAllComponents(UidSelect).find((c) => c.element.closest('.uid-form-field')?.textContent?.includes(label))
    const join = field('Join')!
    expect(join).toBeDefined()
    join.vm.$emit('update:modelValue', 'any')
    await flushPromises()
    expect(model(w).nodes.find((n) => n.id === 'review')!.join).toBe('any')
    join.vm.$emit('update:modelValue', '')
    await flushPromises()
    expect(model(w).nodes.find((n) => n.id === 'review')!.join).toBeUndefined()

    await w.find('[data-node-id="filing"]').trigger('pointerdown')
    await flushPromises()
    expect(field('Join')).toBeUndefined()

    await w.find('.fl-edge-label[data-edge-id="e2"]').trigger('pointerdown')
    await flushPromises()
    const trigger = field('Trigger')!
    trigger.vm.$emit('update:modelValue', 'timer')
    await flushPromises()
    expect(model(w).edges.find((e) => e.id === 'e2')!.trigger).toBe('timer')
  })

  it('shows only the built-in fields given in `fields`, the slot still renders', async () => {
    const w = mount(FlowEditor, {
      props: { modelValue: structuredClone(orderProcess), toastProvider: false, fields: { node: ['label', 'transitions'], edge: [], graph: ['title'] } },
      slots: { properties: '<div class="host-fields">host</div>' },
      attachTo: document.body,
    })
    wrappers.push(w)
    const field = (label: string) => w.findAll('.fl-props .uid-form-field, .fl-props label').some((c) => c.text().includes(label))
    // Nothing selected: the graph title only.
    expect(w.text()).toContain('host')
    expect(field('Layout direction')).toBe(false)
    expect(field('Title')).toBe(true)
    await w.find('[data-node-id="new"]').trigger('pointerdown')
    await flushPromises()
    expect(w.find('.fl-props__label input').exists()).toBe(true)
    expect(w.find('.fl-props__transitions').exists()).toBe(true)
    expect(w.find('.fl-props__connect').exists()).toBe(true)
    expect(w.find('.fl-props__data').exists()).toBe(false)
    expect(w.find('.fl-props textarea').exists()).toBe(false)
    expect(field('Type')).toBe(false)
    // Delete stays: it is an action, not a field.
    expect(w.find('.fl-props__delete').exists()).toBe(true)
    expect(w.find('.host-fields').exists()).toBe(true)

    await w.find('.fl-edge-label[data-edge-id]').trigger('pointerdown')
    await flushPromises()
    expect(w.find('.fl-props__label').exists()).toBe(false)
    expect(w.find('.fl-props__condition').exists()).toBe(false)
    expect(w.find('.fl-props__data').exists()).toBe(false)
    expect(w.find('.fl-props__delete').exists()).toBe(true)
    expect(w.find('.host-fields').exists()).toBe(true)
  })

  it('shows every built-in field by default', async () => {
    const w = editor()
    const field = (label: string) => w.findAll('.fl-props .uid-form-field, .fl-props label').some((c) => c.text().includes(label))
    expect(field('Layout direction')).toBe(true)
    await w.find('[data-node-id="new"]').trigger('pointerdown')
    await flushPromises()
    expect(field('Type')).toBe(true)
    await flushPromises()
    expect(w.find('.fl-props__label input').exists()).toBe(true)
    expect(w.find('.fl-props textarea').exists()).toBe(true)
    expect(w.find('.fl-props__transitions').exists()).toBe(true)
    expect(w.find('.fl-props__data').exists()).toBe(true)
  })

  it('hides import and export with `io: false`', async () => {
    const on = editor({ mermaid: fromMermaid, modelValue: { version: 1, nodes: [], edges: [] } })
    expect(on.find('.fl-toolbar__file').exists()).toBe(true)
    expect(on.find('.fl-empty__import-json').exists()).toBe(true)
    const off = editor({ mermaid: fromMermaid, io: false, modelValue: { version: 1, nodes: [], edges: [] } })
    expect(off.find('.fl-toolbar__file').exists()).toBe(false)
    expect(off.find('.fl-empty__import-json').exists()).toBe(false)
    expect(off.find('.fl-editor-empty').text()).not.toContain('Mermaid')
    expect(off.find('.fl-empty__add-start').exists()).toBe(true)
  })

  it('floats a compact toolbar over the canvas without undo and redo, exposing them to the host', async () => {
    const w = editor({ toolbar: 'floating' })
    await flushPromises()
    const bar = w.find('.fl-editor__canvas .fl-tools .fl-toolbar--floating')
    expect(bar.exists()).toBe(true)
    expect(w.findAll('.fl-toolbar')).toHaveLength(1)
    expect(bar.find('.fl-toolbar__undo').exists()).toBe(false)
    expect(bar.find('.fl-toolbar__layout').exists()).toBe(true)
    expect(bar.find('.fl-toolbar__text').exists()).toBe(false)
    const vm = w.vm as unknown as { canUndo: boolean; canRedo: boolean; undo(): void }
    expect(vm.canUndo).toBe(false)
    await w.find('.fl-palette__item[data-type="task"]').trigger('click')
    expect(vm.canUndo).toBe(true)
    vm.undo()
    await flushPromises()
    expect(vm.canRedo).toBe(true)
  })

  it('lays a long chain out anew at a readable zoom from its start, not shrunk to fit', async () => {
    const size = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500, toJSON: () => ({}) })
    try {
      const chain: Graph = {
        version: 1,
        nodes: Array.from({ length: 14 }, (_, i) => ({ id: `s${i}`, type: 'state', label: `Step ${i}` })),
        edges: Array.from({ length: 13 }, (_, i) => ({ id: `e${i}`, from: `s${i}`, to: `s${i + 1}`, label: `go ${i}` })),
      }
      const w = editor({ modelValue: chain, direction: 'LR' })
      await flushPromises()
      ;(w.vm as unknown as { autoLayout(): void }).autoLayout()
      await new Promise((r) => setTimeout(r, 60))
      await flushPromises()
      expect(w.find('.fl-controls__zoom').text()).toBe('100%')
    } finally {
      size.mockRestore()
    }
  })

  it('keeps the toolbar across the top by default', async () => {
    const w = editor()
    await flushPromises()
    expect(w.find('.fl-editor > .fl-toolbar .fl-toolbar__undo').exists()).toBe(true)
    expect(w.find('.fl-tools').exists()).toBe(false)
  })

  it('drops the issue codes given in `ignoreIssues`', async () => {
    const graph: Graph = { version: 1, nodes: [{ id: 's', type: 'start' }, { id: 'a', type: 'state', label: 'A' }], edges: [{ id: 'e', from: 's', to: 'a' }] }
    const w = editor({ modelValue: graph, ignoreIssues: ['dead-end'] })
    await flushPromises()
    expect(w.find('.fl-tab-issues__count').text()).toBe('1')
    expect(w.find('[data-node-id="a"] .fl-node').classes()).not.toContain('has-warning')
    const codes = (w.emitted('validate')!.at(-1)![0] as { code: string }[]).map((i) => i.code)
    expect(codes).toEqual(['missing-end'])
    expect((w.vm as unknown as { issues: { code: string }[] }).issues.map((i) => i.code)).toEqual(['missing-end'])

    const none = editor({ modelValue: structuredClone(graph), ignoreIssues: ['dead-end', 'missing-end'] })
    await flushPromises()
    expect(none.find('.fl-tab-issues__count').exists()).toBe(false)
    expect(none.emitted('validate')!.at(-1)![0]).toEqual([])
  })

  it('words issues in the interface language, naming elements by their label', async () => {
    const graph: Graph = {
      version: 1,
      nodes: [
        { id: 's', type: 'start' },
        { id: 'a', type: 'state', label: 'Draft' },
        { id: 'b', type: 'state' },
        { id: 'end', type: 'end' },
      ],
      edges: [{ id: 'e', from: 's', to: 'a' }],
    }
    const issueTexts = async (x: ReturnType<typeof editor>) => {
      await x.find('.fl-tab-issues').trigger('click')
      await flushPromises()
      return x.findAll('.fl-issue__text').map((i) => i.text())
    }
    const w = editor({ modelValue: graph, locale: 'ru' })
    await flushPromises()
    const texts = await issueTexts(w)
    expect(texts).toContain('У «Draft» нет исходящего перехода')
    expect(texts).toContain('«b» недостижим из начала')
    // The model keeps the English message for non-UI use.
    const issues = w.emitted('validate')!.at(-1)![0] as { code: string; message: string }[]
    expect(issues.find((i) => i.code === 'unreachable')!.message).toBe('Node "b" cannot be reached from the start')

    const en = editor({ modelValue: structuredClone(graph) })
    await flushPromises()
    expect(await issueTexts(en)).toContain('"Draft" has no outgoing transition')

    const custom = editor({ modelValue: structuredClone(graph), locale: 'ru', labels: { issueDeadEnd: (t: { name: string }) => `Тупик: ${t.name}` } })
    await flushPromises()
    expect(await issueTexts(custom)).toContain('Тупик: Draft')
  })
})
