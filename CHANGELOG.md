# @dskripchenko/flow

## 1.2.0

### Minor Changes

- a4f4f09: Notations: `NOTATIONS.epc`, `.dfd` and `.idef0` — node types, palettes and directions for event-driven process chains, data flow diagrams and IDEF0 function models (`notationRegistry(name)` builds the registry); new outlines `hexagon`, `ellipse`, `operator` (with a `glyph`), `store`, `entity` and `document`; `numbered` types show `data.number`. The layout places a node that only feeds (or only takes from) a port across the flow above or below its node, so IDEF0 controls and mechanisms sit over and under their box.

## 1.1.1 — 2026-10-26

- **The icons are bundled.** The Vue components import their lucide icons
  directly and the build bundles them (the ISC notice is kept), instead of
  importing `@dskripchenko/ui/icons` at runtime: the package loads from an ESM
  CDN without `lucide-vue-next` in the import map. `NODE_ICONS`,
  `STATUS_ICONS` and `TRIGGER_ICONS` are unchanged.

## 1.1.0 — 2026-10-26

Statechart building blocks. Everything is additive: graphs and snapshots from
1.0 parse, validate and draw as before.

### Added

- **`parallel` node type** — a state with concurrent regions. Its regions are
  the top-level groups of its inline `subgraph`: the node shows one compartment
  per region under its label, with dashed dividers, and drilling in draws the
  groups as region lanes. New node field **`join: 'all' | 'any'`**, shown on the
  node's top edge and in the navigation bar inside it. `regionsOf(node)` reads
  the regions.
- **`timer` and `wait` node types** — intermediate events (a double circle with a
  stopwatch / an hourglass), label under the shape.
- **`any` node type** — "any state": its edges apply from every state of the
  graph. A source for reachability, but not the process's start
  (`missing-start` still asks for one); an edge into it is a warning.
- **Edge `trigger: 'timer' | 'event'`** — an icon on the edge label instead of
  an emoji in the text; with no label the edge shows the icon alone.
- **Statuses `unknown`** (amber, a question mark — the outcome is not known)
  **and `compensated`** (neutral, an undo glyph) in the default tones, icons
  and labels: no `statusTones` needed.
- Editor: a _Join_ field for parallel nodes, a _Trigger_ field for edges; the
  new types in the palette.
- `NodeTypeDef.regions` and `NodeTypeDef.anyState` for custom types; shapes
  `event` and `any`; `NavigationLevel.type` / `.join`.
- JSON schemas: `node.join`, `edge.trigger`, the new types in `node.type`'s
  description; the snapshot's `status` lists `unknown` and `compensated`
  (still any string).

### Fixed

- Status chips: the tone fill no longer leaks into the icon's own circles, and
  an amber chip has a dark glyph — the `waiting` clock was unreadable in the
  dark theme.

### Not changed

- The deprecated `onToggle`-as-persist-function alias from 1.0.2 stays: its
  removal would break hosts in a minor release; it moves to 2.0.

## 1.0.2 — 2026-10-26

- **`FlowView`: the persist function is now `persistToggle`.** The old prop
  `onToggle` is also the handler Vue calls for the emitted `toggle` event, so
  a host's persist function ran twice per switch (two requests), and a
  rejection on the emit path surfaced as an unhandled error. `persistToggle`
  is called exactly once per switch; a rejection rolls the switch back with
  an error toast and `toggle-error`, as before.
- **`toggle` fires once, after the persist function settles** (at once
  without one), with a second argument `ToggleResult`: `{ ok: true }` or
  `{ ok: false, error, rolledBack }`. It used to fire optimistically before
  the request.
- **Deprecated: `onToggle` as the persist function**, kept until 1.1. Without
  `persistToggle`, a function passed as `onToggle` (or as an `@toggle`
  listener — the same vnode prop) is still the persist function, called once,
  with the rollback; the `toggle` event is then not emitted, since it would
  call it again. From 1.1 `onToggle` is only the `toggle` listener.
- New exported types `ToggleResult` and `PersistToggle`.
- `FlowEditor` has no function prop that collides with an event; unchanged.

## 1.0.1 — 2026-10-26

Requires `@dskripchenko/ui` 1.15 and drops the workarounds for what it fixed.

- **Locale follows the host.** Without a `locale` prop, `FlowView` and
  `FlowEditor` no longer wrap themselves in their own `UidLocaleProvider`:
  the kit's locale stays the host's (e.g. laravel-admin's), and the
  package's strings follow it (`ru-*` → Russian, else English). An explicit
  `locale` still sets both, as before. The default of `locale` is now
  unset instead of `'en'`.
- **Context menus** open with the kit's `UidMenu.openAt(x, y)` at the pointer
  (right click, and long-press on touch) instead of a hidden trigger.
- **Toggle buttons** (minimap, snap to grid) show the pressed state with the
  kit's `secondary` variant again.
- Peer and dev dependency `@dskripchenko/ui` `^1.15.0`.

## 1.0.0 — 2026-10-26

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
