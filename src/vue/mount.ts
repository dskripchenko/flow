/**
 * Mounting without a Vue app of your own: `mountFlow(el, options)` puts a
 * FlowView into an element, `mountFlowEditor(el, options)` a FlowEditor;
 * both return a handle to update props or unmount.
 */
import { createApp, defineComponent, h, render, shallowReactive, type App, type AppContext, type Component } from 'vue'
import type { Graph } from '../index'
import FlowEditor from './FlowEditor.vue'
import FlowView from './FlowView.vue'

/** The props of FlowView, plus event handlers as `on*` functions (`onSelect`, `onToggle`…). */
export interface MountFlowOptions {
  graph: Graph
  /**
   * Render inside this Vue app's context (from `getCurrentInstance()!.appContext`
   * or `app._context`) instead of a new app: the host's provides, plugins and
   * global components (kit locale and theme, i18n, router) reach the component.
   */
  appContext?: AppContext
  [prop: string]: unknown
}

/** The props of FlowEditor; `modelValue` is the initial model, kept in sync by the handle. */
export interface MountFlowEditorOptions {
  modelValue: Graph
  /** As in MountFlowOptions. */
  appContext?: AppContext
  [prop: string]: unknown
}

export interface FlowHandle {
  /** The app created for the component; undefined when mounted into a host `appContext`. */
  app?: App
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
  const { appContext, ...rest } = options as { appContext?: AppContext } & Record<string, unknown>
  const props = shallowReactive({ ...rest })
  const update = (next: Record<string, unknown>) => void Object.assign(props, next)
  if (appContext) {
    // Rendered into the host's app: a wrapper re-renders when props change.
    const Root = defineComponent({ name: 'FlowMountRoot', render: () => h(component, props) })
    const vnode = h(Root)
    vnode.appContext = appContext
    render(vnode, el)
    return { update, unmount: () => render(null, el) }
  }
  const app = createApp({ render: () => h(component, props) })
  app.mount(el)
  return { app, update, unmount: () => app.unmount() }
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
