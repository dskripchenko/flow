# Monitoring and polling

Monitoring state is kept apart from the model: the same graph is drawn with a
different state for every instance, or with aggregate counters for all of them.

## The snapshot

What a monitoring endpoint returns ([JSON Schema](../../schema/snapshot.schema.json)):

```json
{
  "nodes": {
    "payment": { "status": "active", "count": 1, "updatedAt": "2026-10-25T10:15:00Z" },
    "validate": { "status": "done" },
    "delivery-failed": { "status": "error", "badge": 2, "count": 2, "message": "Carrier API timeout" },
    "backorder": { "status": "waiting", "count": 3 }
  },
  "edges": {
    "e4": { "traversed": true },
    "e13": { "count": 46 }
  },
  "path": ["start", "new", "validate", "valid", "payment"],
  "current": ["payment"],
  "updatedAt": "2026-10-25T10:15:02Z"
}
```

Every field is optional.

| Field | Drawn as |
|---|---|
| `nodes[id].status` | `active`: accent outline and a pulsing halo; `done`: green outline and a check; `error`: red outline and fill; `waiting`: amber dashed outline; `skipped`: dimmed; `unknown` (the outcome is not known — e.g. a side effect awaiting reconciliation): amber, a question mark; `compensated` (undone by compensation): neutral, an undo glyph. Other strings are neutral unless `statusTones` maps them. |
| `nodes[id].count` | a counter on the node's corner |
| `nodes[id].badge` | a corner badge instead of the status icon (e.g. an error count) |
| `nodes[id].message` | a line in the details panel |
| `edges[id].count` | a counter on the edge label |
| `edges[id].traversed` | a green line |
| `path` | the edges between consecutive nodes highlighted, with moving dashes |
| `current` | the instance's position: halo; the view brings it into sight once |

Pulses and moving dashes stop under `prefers-reduced-motion`.

## Passing state

```vue
<FlowView :graph="graph" :state="snapshot" />
```

`state` takes a snapshot or a reduced `MonitorState`. A snapshot passed this
way is stamped when it arrives, so "Updated N s ago" and the stale warning work.

## Polling

```vue
<FlowView
  :graph="graph"
  :poll="{
    intervalMs: 5000,
    merge: false,
    fetch: (signal, context) => fetch(`/api/process/42/state?level=${context.path.join('/')}`, { signal }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }),
  }"
  :stale-after-ms="20000"
/>
```

- One request at a time; the next is scheduled after the previous settles.
- The request in flight is aborted when the component unmounts, the level
  changes (drill-down) or polling stops — pass `signal` to `fetch`.
- While the tab is hidden polling pauses; on return it fetches at once.
- After an error the delay doubles up to 60 s (`backoff: { factor, maxMs }` or
  `false`); the status line shows the error and a refresh button.
- `context.path` is the node ids of the sub-processes entered (empty at the
  root) and `context.ref` the reference of the displayed sub-process — return
  the state for the level on screen.
- `merge: true` folds partial snapshots into the previous state instead of
  replacing it.
- Without data for `staleAfterMs` (by default three intervals, at least 15 s)
  the status line warns that the data is out of date.

## The reducer

Framework-agnostic and pure, for hosts that keep state themselves (a store, a
WebSocket):

```ts
import { reduceMonitor, emptyMonitorState, mergeSnapshot, isStale, pathEdges, statusSummary } from '@dskripchenko/flow'

let state = emptyMonitorState()
state = reduceMonitor(state, { type: 'snapshot', snapshot, at: Date.now() })            // replace
state = reduceMonitor(state, { type: 'snapshot', snapshot: patch, at: Date.now(), merge: true })
state = reduceMonitor(state, { type: 'error', error: 'HTTP 503', at: Date.now() })      // failures + 1, keeps data
isStale(state, Date.now(), 30_000)
pathEdges(graph, state.path)   // edge ids along the path
statusSummary(state)           // { active: 1, error: 1, ... }
```

## The poller

```ts
import { createPoller } from '@dskripchenko/flow'

const poller = createPoller({
  fetch: (signal) => fetch('/state', { signal }).then((r) => r.json()),
  intervalMs: 5000,
  backoff: { factor: 2, maxMs: 60_000 },
  visibilityPause: true,
  onData: (snapshot) => (state = mergeSnapshot(state, snapshot)),
  onError: (error, failures) => console.warn(failures, error),
})
poller.start()
poller.refresh() // now, aborting the request in flight
poller.stop()
poller.status    // 'idle' | 'running' | 'paused'
```

`visibilityPause` also takes a custom `{ hidden(), subscribe(listener) }`
source (tests, an app-level "pause" switch).
