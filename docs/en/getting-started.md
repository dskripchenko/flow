# Getting started

## Install

```bash
npm install @dskripchenko/flow
```

The package has three entry points:

- `@dskripchenko/flow` — the core: the model, validation, layout, monitoring
  state, the poller and the editing commands. Plain TypeScript with no
  dependencies and no DOM; it runs in a browser, in Node 20+ and in a worker.
- `@dskripchenko/flow/vue` — `FlowView` (viewer and monitor) and `FlowEditor`.
  They need Vue 3.4+ and [`@dskripchenko/ui`](https://github.com/dskripchenko/ui)
  1.14+, declared as optional peer dependencies.
- `@dskripchenko/flow/mermaid` — `fromMermaid()`, a model from a Mermaid
  `stateDiagram-v2` or `flowchart`. It needs
  [`@dskripchenko/diagrams`](https://github.com/dskripchenko/diagrams) 1.1+
  (also an optional peer dependency); nothing else imports it.

```bash
npm install vue @dskripchenko/ui            # for the components
npm install @dskripchenko/diagrams          # for Mermaid import
```

For a page without a build step there is a standalone bundle with Vue, the kit
and the styles inside — see [Standalone](standalone.md).

## Styles

Import the kit's styles and the package's once, in the app entry:

```ts
import '@dskripchenko/ui/styles/all.css'
import '@dskripchenko/flow/style.css'
```

The components use the kit's tokens (`--uid-*`), so the light and dark themes
follow the kit's `data-theme` on `<html>`.

## A first graph

```vue
<script setup lang="ts">
import { FlowView } from '@dskripchenko/flow/vue'
import type { Graph } from '@dskripchenko/flow'

const graph: Graph = {
  version: 1,
  meta: { title: 'Order' },
  nodes: [
    { id: 'start', type: 'start' },
    { id: 'new', type: 'state', label: 'New' },
    { id: 'paid', type: 'state', label: 'Paid' },
    { id: 'cancelled', type: 'state', label: 'Cancelled' },
    { id: 'end', type: 'end' },
  ],
  edges: [
    { id: 'e1', from: 'start', to: 'new' },
    { id: 'e2', from: 'new', to: 'paid', label: 'pay' },
    { id: 'e3', from: 'new', to: 'cancelled', label: 'cancel' },
    { id: 'e4', from: 'paid', to: 'end' },
    { id: 'e5', from: 'cancelled', to: 'end' },
  ],
}
</script>

<template>
  <FlowView :graph="graph" style="height: 560px" />
</template>
```

Nodes without a `position` are laid out automatically (a layered layout, left
to right on a landscape screen and top to bottom on a portrait one). Give the
component a height: it fills its box.

## Live state

Point the viewer at a monitoring endpoint and it polls, highlights the active
step, the path of the current instance, counters and errors:

```vue
<FlowView
  :graph="graph"
  :poll="{ intervalMs: 5000, fetch: (signal) => fetch('/api/orders/42/state', { signal }).then((r) => r.json()) }"
/>
```

The endpoint returns a [monitoring snapshot](monitoring.md#the-snapshot).

## Editing

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { FlowEditor } from '@dskripchenko/flow/vue'
import { fromMermaid } from '@dskripchenko/flow/mermaid'

const graph = ref(initialGraph)
</script>

<template>
  <FlowEditor v-model="graph" :mermaid="fromMermaid" style="height: 720px" @change="(e) => save(e.graph)" />
</template>
```

## Where next

- [Model](model.md) — nodes, edges, groups, ports, types, validation, layout.
- [Monitoring and polling](monitoring.md) — the snapshot, the reducer, the poller.
- [Vue components](vue.md) — `FlowView`: props, events, slots, custom nodes.
- [Editor](editor.md) — `FlowEditor`, commands, undo, shortcuts.
- [Host integration](integration.md) — the JSON contracts a backend implements.
- [Standalone](standalone.md) — one `<script>`, no build.
