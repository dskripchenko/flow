# Host integration

What a backend (or an admin panel such as laravel-admin) implements to show,
monitor and edit processes. All payloads are JSON.

## The model

Stored as is — `GET` returns it, the editor's `v-model` / `change` produce it.
Schema: `@dskripchenko/flow/schema/graph.schema.json` (JSON Schema 2020-12).
Validate on the server with any JSON Schema validator, then apply the semantic
checks of `validateGraph` (the same rules can be reimplemented server-side:
unique ids, edges between existing nodes, ports of the right kind).

Positions are optional. A process authored on the server without positions is
laid out on the client; the first edit in the editor stores positions.

## Monitoring snapshot

`GET /…/state` → a snapshot
(`@dskripchenko/flow/schema/snapshot.schema.json`):

```json
{
  "nodes": { "<nodeId>": { "status": "active|done|error|waiting|skipped|<custom>", "count": 3, "badge": 2, "message": "…", "updatedAt": "ISO or ms" } },
  "edges": { "<edgeId>": { "count": 10, "traversed": true } },
  "path": ["<nodeId>", "…"],
  "current": ["<nodeId>"],
  "updatedAt": "ISO or ms"
}
```

- For one instance: statuses along its history, `path` and `current`.
- For a process overview: `count` per node/edge (instances in each state),
  `status: "error"` and `badge` where something fails.
- With drill-down the viewer passes `context.path` (node ids of the entered
  sub-processes) and `context.ref` (the sub-process reference); return the
  state for that level. Answer HTTP errors with a non-2xx status: the viewer
  shows the error, keeps the last data and backs off.
- A first snapshot rendered by the server goes in `state`; with `poll` set,
  polled snapshots replace it — no blank state before the first request.
- Host parameters (the instance on screen, a filter) go in `pollParams`; they
  reach `fetch` as `context.params`, and a change restarts polling at once
  (old data is dropped unless a new `state` comes with the change). The
  exposed `refresh()` polls immediately.

## Toggle

The viewer calls `persistToggle(change)` once per switch; send it to the server:

```json
{ "kind": "node", "id": "cancelled", "enabled": false, "path": [] }
```

`path` is the sub-process node ids from the root (empty at the root). Reject
(non-2xx, throw in `persistToggle`) to roll the switch back; the error message is
shown in a toast. Then pass the updated model as `graph` (or keep it: the
optimistic state stays until `graph` changes).

`onToggle` is the deprecated name of `persistToggle` (until 1.1): it is called
once as well, but use `persistToggle` — `onToggle` is the handler of the
`toggle` event, which fires after the persist function settles.

## Sub-processes

`node.subgraph` is either an inline graph or a string reference. For
references, either pass `subgraphs: { ref: Graph }` or
`loadSubgraph(ref, node) => Promise<Graph>` (e.g. `GET /processes/{ref}`).

## Editing

`FlowEditor` emits `change` with:

```ts
{
  command: Command        // at the root: replayable with applyCommand(rootGraph, command)
  local: { command, path } // as made, inside the sub-process at `path`
  description: string     // "add task-1", "move 3 nodes", …
  graph: Graph            // the whole model after the change
  source: 'edit' | 'undo' | 'redo'
}
```

The simplest backend stores `graph` (debounced). A collaborative or audited
backend stores `command`s. Locked node types (the editor's `locked: ['type', …]` prop, or `locked: true`
in the registry) cannot be moved, changed or deleted in the editor — enforce
the same on the server.
