/**
 * Mounting without a Vue app of your own: `mountFlow(el, options)` puts a
 * FlowView into an element, `mountFlowEditor(el, options)` a FlowEditor;
 * both return a handle to update props or unmount.
 */
import { createApp, h, shallowReactive, type App, type Component } from 'vue'
import type { Graph } from '../index'
import FlowEditor from './FlowEditor.vue'
import FlowView from './FlowView.vue'

/** The props of FlowView, plus event handlers as `on*` functions (`onSelect`, `onToggle`…). */
export interface MountFlowOptions {
  graph: Graph
  [prop: string]: unknown
}

/** The props of FlowEditor; `modelValue` is the initial model, kept in sync by the handle. */
export interface MountFlowEditorOptions {
  modelValue: Graph
  [prop: string]: unknown
}

export interface FlowHandle {
  app: App
  /** Merges new props (a new `graph`, `state`, …) into the mounted component. */
  update(props: Record<string, unknown>): void
  unmount(): void
}

export interface FlowEditorHandle extends FlowHandle {
  /** The model as edited so far. */
  getGraph(): Graph
}

function mountComponent(target: string | Element, component: Component, options: Record<string, unknown>): FlowHandle {
  const el = typeof target === 'string' ? document.querySelector(target) : target
  if (!el) throw new Error(`mount: no element matches ${String(target)}`)
  const props = shallowReactive({ ...options })
  const app = createApp({ render: () => h(component, props) })
  app.mount(el)
  return {
    app,
    update: (next) => void Object.assign(props, next),
    unmount: () => app.unmount(),
  }
}

export function mountFlow(target: string | Element, options: MountFlowOptions): FlowHandle {
  return mountComponent(target, FlowView, options)
}

export function mountFlowEditor(target: string | Element, options: MountFlowEditorOptions): FlowEditorHandle {
  let current = options.modelValue
  const userUpdate = options['onUpdate:modelValue'] as ((g: Graph) => void) | undefined
  const handle = mountComponent(target, FlowEditor, {
    ...options,
    'onUpdate:modelValue': (g: Graph) => {
      current = g
      handle.update({ modelValue: g })
      userUpdate?.(g)
    },
  })
  return { ...handle, getGraph: () => current }
}
