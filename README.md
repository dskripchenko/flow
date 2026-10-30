# @dskripchenko/flow

[![CI](https://github.com/dskripchenko/flow/actions/workflows/ci.yml/badge.svg)](https://github.com/dskripchenko/flow/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@dskripchenko/flow.svg)](https://www.npmjs.com/package/@dskripchenko/flow)
[![license](https://img.shields.io/npm/l/@dskripchenko/flow.svg)](LICENSE)

Process and state-machine graphs: draw them, watch running instances move
through them, switch steps on and off, drill into sub-processes, and edit them
visually. The core has **no runtime dependencies**; the Vue components are
built on [`@dskripchenko/ui`](https://github.com/dskripchenko/ui).

```vue
<script setup lang="ts">
import { FlowView } from '@dskripchenko/flow/vue'
import '@dskripchenko/ui/styles/all.css'
import '@dskripchenko/flow/style.css'

const poll = {
  intervalMs: 5000,
  fetch: (signal: AbortSignal) => fetch('/api/orders/42/state', { signal }).then((r) => r.json()),
}
</script>

<template>
  <FlowView :graph="orderProcess" :poll="poll" toggleable :persist-toggle="saveToggle" style="height: 600px" />
</template>
```

## What is inside

**Core** (`@dskripchenko/flow`, plain TypeScript, no DOM)

- A versioned JSON model: nodes (`start`, `end`, `state`, `task`, `decision`,
  `subprocess`, `parallel` with regions, `timer` and `wait` events, `any`
  state, `note`, or your own types), edges with labels, conditions, triggers and
  ports, groups, inline or referenced sub-processes. JSON Schemas included.
- Validation: duplicate ids, broken references and ports (errors); missing
  start/end, unreachable steps, dead ends (warnings). Cycles are fine.
- Layout: a layered (Sugiyama) layout, left-to-right or top-to-bottom,
  deterministic, around nodes you have placed yourself; orthogonal (or
  smooth) edges that never cut through other nodes or groups, with back
  edges (retries, resends) in their own lanes beside the graph.
- Monitoring: a snapshot format, a pure reducer, stale detection, and a poller
  that pauses in hidden tabs, backs off on errors and cancels requests.
- Editing: undoable commands, history with merging, copy/paste, align,
  distribute, auto layout as one step.

**Vue** (`@dskripchenko/flow/vue`)

- `FlowView` — pan, zoom, pinch, fit, minimap; live state with the active
  step, the instance's path, counters, error badges, last-updated and stale
  indicators; enable/disable switches with rollback on failure; drill-down
  with a breadcrumb; a details drawer with a slot for your content; custom
  node components; keyboard navigation and ARIA labels; light and dark.
- `FlowEditor` — palette (drag or press), drag-to-connect with snapping,
  reconnecting, moving on a grid, multi-select, align/distribute, undo/redo
  with shortcuts, a properties panel, a validation panel, context menus,
  JSON and Mermaid import, sub-process editing, locked node types.

**Mermaid** (`@dskripchenko/flow/mermaid`) — a model from `stateDiagram-v2` or
`flowchart` source (composite states become sub-processes).

**Standalone** — one `<script>`: `DskFlow.mountFlow('#el', { graph, poll })`.

## Documentation

| | English | Русский | Deutsch | 中文 |
|---|---|---|---|---|
| Getting started | [en](docs/en/getting-started.md) | [ru](docs/ru/getting-started.md) | [de](docs/de/getting-started.md) | [zh](docs/zh/getting-started.md) |
| Model | [en](docs/en/model.md) | [ru](docs/ru/model.md) | [de](docs/de/model.md) | [zh](docs/zh/model.md) |
| Monitoring and polling | [en](docs/en/monitoring.md) | [ru](docs/ru/monitoring.md) | [de](docs/de/monitoring.md) | [zh](docs/zh/monitoring.md) |
| Vue components | [en](docs/en/vue.md) | [ru](docs/ru/vue.md) | [de](docs/de/vue.md) | [zh](docs/zh/vue.md) |
| Notations: EPC, DFD, IDEF0 | [en](docs/en/notations.md) | [ru](docs/ru/notations.md) | [de](docs/de/notations.md) | [zh](docs/zh/notations.md) |
| Editor | [en](docs/en/editor.md) | [ru](docs/ru/editor.md) | [de](docs/de/editor.md) | [zh](docs/zh/editor.md) |
| Host integration | [en](docs/en/integration.md) | [ru](docs/ru/integration.md) | [de](docs/de/integration.md) | [zh](docs/zh/integration.md) |
| Standalone | [en](docs/en/standalone.md) | [ru](docs/ru/standalone.md) | [de](docs/de/standalone.md) | [zh](docs/zh/standalone.md) |

## Development

```bash
pnpm install
pnpm dev              # playground: ?view=monitor | editor | large | empty, &theme=dark, &locale=ru
pnpm test             # unit and component tests
pnpm check:browser    # Playwright: rendering, geometry, interactions, screenshots
pnpm lint && pnpm typecheck && pnpm build
```

## License

[MIT](LICENSE)
