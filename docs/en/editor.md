# Editor

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { FlowEditor, type ChangeEvent } from '@dskripchenko/flow/vue'
import { fromMermaid } from '@dskripchenko/flow/mermaid'

const graph = ref(initial)
function onChange(e: ChangeEvent) {
  // e.command — what changed, as a command at the root of the model
  // e.local   — the same at the level it was made, with the sub-process path
  // e.source  — 'edit' | 'undo' | 'redo'
}
</script>

<template>
  <FlowEditor v-model="graph" :mermaid="fromMermaid" style="height: 720px" @change="onChange" />
</template>
```

## What the user can do

- **Add** — drag a type from the elements panel onto the canvas, or press it
  (it lands next along the flow from the selected node, or in the middle of the view, on the nearest free spot of the grid, and is scrolled into view and selected); double-click the background for a
  state; the context menu's "Add here".
- **Connect** — hover a node: handles appear on its sides (or its ports).
  Drag from one to another node; the line snaps to the nearest handle within
  reach, and the new transition is selected for labelling. From the keyboard:
  "Add a transition to…" in the node's properties.
- **Reconnect / detach** — select a transition, drag one of its end handles
  to another node; drop it on empty space to remove the transition.
- **Move** — drag; the grabbed node snaps to the grid (the magnet button turns
  snapping off). Arrow keys nudge the selection by a grid step (Shift: five).
- **Select** — click; Shift/Ctrl/⌘-click adds; Shift-drag on the background
  draws a selection box; Ctrl/⌘+A selects all.
- **Arrange** — align (left, centre, right, top, middle, bottom) and
  distribute evenly from the properties panel or the context menu; "Auto
  layout" lays everything out again (one undo step).
- **Properties** — label, description, type, group, enabled, transitions,
  sub-process (a reference, or an inline graph to open and edit), data as
  key/value rows (values that look like JSON — numbers, booleans, arrays —
  are stored as such). For a transition: label, condition, kind, enabled.
  With nothing selected: the graph's title and layout direction.
- **Sub-processes** — open an inline sub-process (marker, double-click, or the
  properties) and edit it in place; the breadcrumb leads back. Changes reach
  the host as an `updateNode` of the sub-process node at the root.
- **Validate** — the Issues tab lists errors and warnings; elements with
  issues carry a marker; pressing an issue selects its element and shows it.
- **Import / export** — "JSON / Mermaid" menu: export the model as a JSON
  file, import JSON, import Mermaid `stateDiagram-v2` / `flowchart` (with the
  `mermaid` prop). Imports are undoable.

## Shortcuts

| Keys | |
|---|---|
| Ctrl/⌘ + Z | undo |
| Ctrl/⌘ + Shift + Z, Ctrl + Y | redo |
| Delete, Backspace | delete the selection (edges of deleted nodes go too) |
| Ctrl/⌘ + C / X / V | copy / cut / paste (pasted copies get new ids) |
| Ctrl/⌘ + D | duplicate |
| Ctrl/⌘ + A | select all |
| Arrows (Shift) | nudge |
| Enter | select the focused element and edit its label |
| Escape | clear the selection, then leave the sub-process |
| Space + drag | pan |

Shortcuts are ignored while typing in a field.

## Props

| Prop | Type | Default | |
|---|---|---|---|
| `modelValue` | `Graph` | — | `v-model` |
| `registry` | `NodeTypeRegistry` | built-in | types; `locked: true` makes a type read-only |
| `palette` | `string[]` | all types | which types the elements panel offers, in order |
| `readonly` | `boolean` | `false` | browse only |
| `snapGrid` | `number` | `20` | `0` turns snapping off |
| `direction`, `edgeStyle` | | | as in FlowView |
| `nodeRenderers`, `nodeIcons` | | | as in FlowView |
| `mermaid` | `(source) => Graph` | — | enables "Import Mermaid": pass `fromMermaid` |
| `locale`, `labels` | | as in FlowView | |
| `minimap` | `boolean` | `false` | |
| `exportName` | `string` | `'process.json'` | the exported file name |
| `toastProvider` | `boolean` | `true` | |

Events: `update:modelValue`, `change` (`ChangeEvent`), `select` (ids),
`validate` (issues, on every change), `export` (the JSON text).
Slots: `toolbar` (extra toolbar content), `properties` (`{ selection, graph, path }`).
Exposed: `undo()`, `redo()`, `autoLayout()`, `fit()`, `select(ids)`, `history`, `issues`.

On narrow screens (under 760 px) the elements and properties panels fold
into drawers opened from the toolbar; touch: long-press opens the context menu.

The first edit of a graph that was laid out automatically fixes every node
where it is drawn (in the same undo step), so nothing jumps.

## Commands and history (core)

Every change is a `Command`, applied by a pure function — the host can replay,
log or send it instead of the whole model:

```ts
import { applyCommand, History, describeCommand } from '@dskripchenko/flow'

type Command =
  | { type: 'addNodes'; nodes; edges? }
  | { type: 'removeElements'; ids }            // nodes, edges, groups; edges of removed nodes go too
  | { type: 'updateNode' | 'updateEdge' | 'updateGroup'; id; patch } // null removes a field
  | { type: 'moveNodes'; moves: { id, position }[] }
  | { type: 'addEdge'; edge }
  | { type: 'setEnabled'; kind: 'node' | 'edge'; id; enabled }
  | { type: 'addGroup'; group }
  | { type: 'updateMeta'; patch }
  | { type: 'replace'; graph }
  | { type: 'batch'; commands }

const history = new History(graph, { limit: 200, mergeWindowMs: 800 })
history.execute({ type: 'updateNode', id: 'a', patch: { label: 'Paid' } }, 'label:a') // same key in a row merges
history.undo()
history.redo()
```

Helpers: `copyFragment` / `pasteFragment` (fresh ids, internal edges only),
`alignNodes`, `distributeNodes`, `layoutCommand(layoutGraph(g, { ignorePositions: true }))`,
`nextId(graph, prefix)`, `findFreeSpot(boxes, size, near, { grid })`, `snap(point, grid)`.

| `locked` | `string[]` | `[]` | node types users cannot move, edit or delete (besides `locked: true` in the registry) |