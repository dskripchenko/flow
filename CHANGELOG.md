# @dskripchenko/flow

## Unreleased

First release: process and state-machine graphs — a viewer with live
monitoring, drill-down and enable/disable switches, and a visual editor. The
core has no runtime dependencies; the Vue components are built on
`@dskripchenko/ui`.

**Core (`@dskripchenko/flow`)**

- A versioned JSON model (`version: 1`) with nodes, edges, ports, groups and
  inline or referenced sub-processes; `parseGraph` with JSON-pointer errors,
  `stringifyGraph`; JSON Schemas for the model and the monitoring snapshot.
- Built-in node types `start`, `end`, `state`, `task`, `decision`,
  `subprocess`, `note` and a registry for custom types (shape, size, ports,
  icon, locked).
- `validateGraph`: errors for duplicate ids and broken references or ports,
  warnings for missing start/end, unreachable steps, dead ends and empty labels.
- `layoutGraph`: a deterministic layered layout (LR/TB) that keeps fixed
  positions and places the rest; orthogonal routing by default (or smooth
  curves over the same corridors) that never passes through other nodes or
  foreign groups; back edges in lanes of a channel beside the graph; edge
  labels kept off nodes and off each other; ports, spread anchors, self
  loops and group frames.
- Monitoring: the snapshot format, `reduceMonitor` / `mergeSnapshot`,
  `isStale`, `pathEdges`, `statusSummary`; `createPoller` with visibility
  pause, exponential backoff and cancellation.
- Editing: `applyCommand` over serialisable commands, `History` with undo,
  redo and merging, copy/paste fragments, align, distribute, auto layout as a
  command.
- Viewport helpers: `fitView`, `zoomAt`, `nearestInDirection`.

**Mermaid (`@dskripchenko/flow/mermaid`)**

- `fromMermaid` for `stateDiagram-v2` (composites become sub-processes, notes
  become note nodes) and `flowchart` (shapes map to types, subgraphs to
  groups), through `@dskripchenko/diagrams`' parser.

**Vue (`@dskripchenko/flow/vue`)**

- `FlowView`: pan, zoom, pinch, fit, minimap; opens at 100 % on the current
  step (or whole when it fits at 85 % or more), keeping nodes clear of the
  overlays; `edgeStyle: 'orthogonal' | 'smooth'`;
  monitoring from `state` or `poll` with the active step, the instance path,
  counters, error badges, a status line with last update, staleness and a
  summary; enable/disable switches with optimistic update and rollback;
  drill-down with a breadcrumb and `loadSubgraph`; a details drawer with
  slots; custom node renderers; keyboard navigation and ARIA labels; en/ru.
- `FlowEditor`: palette, drag-to-connect with snapping, reconnect and
  detach, grid snapping, multi-select, align/distribute, undo/redo and
  clipboard shortcuts, a properties panel, a validation panel, context menus,
  JSON and Mermaid import, JSON export, in-place sub-process editing, locked
  types, a narrow-screen layout.
- `mountFlow`, `mountFlowEditor`, with an optional `appContext` to render
  inside a host app (its providers reach the component).
- Host integration: `state` is the initial value when `poll` is set (polled
  snapshots replace it); `pollParams` reach `poll.fetch` as
  `context.params` and restart polling at once when they change;
  `FlowEditor`'s `locked: string[]` locks node types; nodes added from the
  palette land on the nearest free grid spot (next along the flow from the
  selection, else mid-view), scrolled into view and selected
  (`findFreeSpot` in the core).

**Standalone** — `dist/standalone.js` with `DskFlow.mountFlow` and
`DskFlow.mountFlowEditor`.
