# Vue components

```ts
import { FlowView, FlowEditor, mountFlow, mountFlowEditor } from '@dskripchenko/flow/vue'
import '@dskripchenko/flow/style.css'
```

All components are built on `@dskripchenko/ui` (buttons, switch, drawer,
breadcrumb, badges, tooltips, menus, forms) and follow its tokens and themes.
The component fills its box: give it a height.

## FlowView

A read-only process or state machine with live monitoring, enable/disable
switches, drill-down into sub-processes and a details drawer.

### Props

| Prop | Type | Default | |
|---|---|---|---|
| `graph` | `Graph` | — | the model (root level) |
| `state` | `MonitorSnapshot \| MonitorState` | — | monitoring for the graph on screen; with `poll`, the initial value that polled snapshots replace |
| `poll` | `{ fetch(signal, context), intervalMs?, backoff?, merge?, visibilityPause? }` | — | poll an endpoint instead ([monitoring](monitoring.md)) |
| `pollParams` | `unknown` | — | handed to `poll.fetch` as `context.params` (an instance id, a filter); a change restarts polling at once |
| `staleAfterMs` | `number` | 3 intervals, ≥ 15 s | the stale warning |
| `toggleable` | `boolean` | `false` | enable/disable switches on hover and in the drawer |
| `onToggle` | `(change) => Promise \| void` | — | persists a toggle; a rejection rolls it back with an error toast |
| `subgraphs` | `Record<string, Graph>` | `{}` | graphs for string `subgraph` references |
| `loadSubgraph` | `(ref, node) => Promise<Graph>` | — | loads a reference not in `subgraphs` |
| `details` | `boolean` | `true` | the built-in details drawer |
| `minimap` | `boolean` | `true` | the minimap (also `v-model:minimap`) |
| `controls` | `boolean` | `true` | the zoom/fit bar |
| `statusBar` | `boolean` | `true` | last update, staleness, summary by status |
| `direction` | `'LR' \| 'TB' \| 'auto'` | `meta.direction`, else `auto` | `auto`: LR on a landscape box, TB on a portrait one |
| `edgeStyle` | `'orthogonal' \| 'smooth'` | `'orthogonal'` | right angles, or the same routes with smooth curves |
| `registry` | `NodeTypeRegistry` | built-in types | custom node types |
| `nodeRenderers` | `Record<type, Component>` | `{}` | custom node drawing |
| `nodeIcons` | `Record<type \| icon, Component>` | `{}` | icons for types |
| `statusTones` | `Record<status, tone>` | — | `accent`, `success`, `danger`, `warning`, `info`, `neutral` |
| `locale` | `'en' \| 'ru' \| string` | `'en'` | interface language (also the kit's) |
| `labels` | `Partial<FlowLabels>` | — | override any string |
| `wheel` | `'zoom' \| 'pan'` | `'zoom'` | what the plain mouse wheel does (Ctrl/⌘ + wheel always zooms) |
| `minZoom`, `maxZoom` | `number` | `0.15`, `2.5` | |
| `toastProvider` | `boolean` | `true` | mounts the kit's toast provider; set `false` when the app has one |

### Events

| Event | Payload |
|---|---|
| `select` | `{ kind, id, element, path } \| null` |
| `toggle` | `{ kind: 'node' \| 'edge', id, enabled, path }` — emitted optimistically |
| `toggle-error` | `(change, error)` — `onToggle` rejected; the change is rolled back |
| `navigate` | `NavigationLevel[]` — the sub-processes entered, root first |
| `poll-error` | `error` |

### Slots

- `details` — `{ kind, element, state, path }`: extra content in the drawer
  (history, actions).
- `details-header` — `{ kind, element }`: replaces the drawer title.
- `controls` — extra buttons in the zoom bar.
- `empty` — replaces the empty-graph message.

### Exposed

`fit()`, `enter(nodeId)`, `back()`, `refresh()` (poll now), `select(id | null)`, `stack`.

### Enabling and disabling

With `toggleable`, hovering a node or an edge shows a kit switch above it, and
the details drawer has one too. The change is applied at once (dimmed, struck
through; edges of a disabled node are dimmed with it) and `onToggle` is called:

```ts
async function onToggle({ kind, id, enabled, path }: ToggleChange) {
  const r = await fetch(`/api/process/${kind}s/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) })
  if (!r.ok) throw new Error((await r.json()).message) // rolled back, toast with the message
}
```

The override is kept until the `graph` prop changes (pass the updated model
back) — then the model decides.

### Drill-down

A node with `subgraph` gets a marker under it; pressing it, double-clicking the
node or the "Open sub-process" button in the drawer opens the sub-process. The
breadcrumb shows the way back (and the back button, and Escape). An inline
graph opens at once; a string reference is looked up in `subgraphs`, then
loaded with `loadSubgraph(ref, node)` (a spinner meanwhile, a toast on failure).
Polling restarts for the level with `context.path` / `context.ref`.

### Custom node rendering

Per type, a component that draws inside the node's box (SVG, origin at the
top-left corner):

```vue
<!-- ApprovalNode.vue -->
<script setup lang="ts">
import type { NodeRendererProps } from '@dskripchenko/flow/vue'
defineProps<NodeRendererProps>()
</script>
<template>
  <rect :width="geometry.width" :height="geometry.height" rx="10" :class="['approval', state?.status, { selected }]" />
  <text :x="geometry.width / 2" :y="geometry.height / 2 + 4" text-anchor="middle">{{ node.label }}</text>
</template>
```

```vue
<FlowView :graph="graph" :registry="registry" :node-renderers="{ approval: ApprovalNode }" />
```

Props: `node`, `geometry` (`{ width, height, lines, … }`), `state` (the node's
monitoring entry), `selected`, `disabled`, `current`, `labels`. The size comes
from the type definition in the registry. For HTML content use
`<foreignObject>`.

### First view

The graph opens at 100 % on the step that matters — the current step of the
instance, else an active one, else the start — unless the whole graph fits at
85 % or more, in which case it is shown whole. It never opens smaller than
that; the fit button and the minimap give the overview. Fitting and centring
keep nodes clear of the status line, the breadcrumb, the controls and the
minimap, and no empty space is shown before the start or after the end.

### Keyboard and accessibility

- Every node is a focusable `role="button"` with a label that includes its
  type, status, counters and "disabled"; edges are focusable when the graph
  is toggleable or editable.
- Tab moves through nodes; arrow keys move to the nearest node in that
  direction (the view follows focus).
- Enter or Space selects and opens the details; Escape closes the drawer,
  clears the selection, then goes back up a sub-process.
- `+` / `-` zoom, `0` fits.
- Pointer: drag the background (or Space + drag) to pan; the wheel or a pinch
  to zoom; touch works the same.

## mountFlow

Without a Vue app of your own:

```ts
import { mountFlow } from '@dskripchenko/flow/vue'

const handle = mountFlow('#flow', { graph, poll, onSelect: (s) => console.log(s) })
handle.update({ graph: nextGraph })
handle.unmount()
```

`mountFlowEditor(el, { modelValue, onChange })` does the same for the editor;
`handle.getGraph()` returns the edited model.

Inside a host Vue app, pass its context so the host's providers (the kit's
locale and theme, i18n, the router) reach the component; it is then rendered
into the element without a separate app (`handle.app` is undefined):

```ts
import { getCurrentInstance } from 'vue'

const appContext = getCurrentInstance()!.appContext // or app._context
const handle = mountFlow(el, { graph, appContext })
```
