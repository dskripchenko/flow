/**
 * The standalone build: one <script> with Vue, the kit and the styles inside.
 *
 *   <div id="flow" style="height: 600px"></div>
 *   <script src=".../standalone.js"></script>
 *   <script>
 *     DskFlow.mountFlow('#flow', { graph, poll: { fetch: (signal) => fetch('/state', { signal }).then((r) => r.json()) } })
 *   </script>
 *
 * The script injects its CSS; dist/standalone.css is the same CSS for a page
 * that prefers a <link>.
 */
import '@dskripchenko/ui/styles/tokens.css'
import '@dskripchenko/ui/styles/themes.css'
import '@dskripchenko/ui/styles/index.css'
import '../vue/flow.css'
import './standalone.css'
import { mountFlow as mountView, mountFlowEditor as mountEditor, type FlowEditorHandle, type FlowHandle, type MountFlowEditorOptions, type MountFlowOptions } from '../vue/mount'
import { fromMermaid } from '../mermaid'

export * from '../index'
export { fromMermaid, isMermaidFlow } from '../mermaid'
export type { FlowEditorHandle, FlowHandle, MountFlowEditorOptions, MountFlowOptions } from '../vue/mount'

/** 'light', 'dark' or 'system' (follows prefers-color-scheme): sets data-theme on <html>. Unset leaves the page's theme alone. */
export type StandaloneTheme = 'light' | 'dark' | 'system'

function applyTheme(theme: StandaloneTheme | undefined): void {
  if (!theme) return
  const root = document.documentElement
  if (theme !== 'system') {
    root.dataset.theme = theme
    return
  }
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  const set = () => (root.dataset.theme = mq?.matches ? 'dark' : 'light')
  set()
  mq?.addEventListener?.('change', set)
}

/** Mounts a FlowView: its props, event handlers as `onSelect`, `onToggle`…, and `theme`. */
export function mountFlow(target: string | Element, options: MountFlowOptions & { theme?: StandaloneTheme }): FlowHandle {
  const { theme, ...props } = options
  applyTheme(theme)
  // The kit's toasts need a provider; the widget brings its own.
  return mountView(target, { toastProvider: true, ...props } as MountFlowOptions)
}

/** Mounts a FlowEditor with Mermaid import on; `handle.getGraph()` returns the edited model. */
export function mountFlowEditor(target: string | Element, options: MountFlowEditorOptions & { theme?: StandaloneTheme }): FlowEditorHandle {
  const { theme, ...props } = options
  applyTheme(theme)
  return mountEditor(target, { mermaid: fromMermaid, ...props } as MountFlowEditorOptions)
}
