# Model

The model is plain JSON, versioned, and independent of layout and of the
monitoring state. A host stores it as is; the viewer and the editor read and
write exactly this shape. A [JSON Schema](../../schema/graph.schema.json) ships
with the package (`@dskripchenko/flow/schema/graph.schema.json`).

```ts
interface Graph {
  version: 1
  nodes: FlowNode[]
  edges: FlowEdge[]
  groups?: FlowGroup[]
  meta?: { title?: string; direction?: 'TB' | 'LR'; [key: string]: DataValue }
}
```

Ids are unique across nodes, edges and groups.

## Nodes

```ts
interface FlowNode {
  id: string
  type: string                 // start | end | state | task | decision | subprocess | parallel | timer | wait | any | note | custom
  label?: string
  description?: string         // a secondary line under the label
  position?: { x: number; y: number } // the centre; laid out automatically when missing
  group?: string
  data?: Record<string, DataValue>    // shown as key/value in the details
  enabled?: boolean            // false: drawn dimmed and struck through
  subgraph?: string | Graph    // an inline graph or a reference: makes the node drillable
  ports?: Port[]               // overrides the type's ports
  join?: 'all' | 'any'         // parallel: done when all regions are, or any of them
}
```

| Type | Drawn as | Notes |
|---|---|---|
| `start` | filled circle with a play glyph | no incoming edges; label under it |
| `end` | ring | no outgoing edges; label under it |
| `state` | rounded rectangle | the default type |
| `task` | rectangle with an icon tile | |
| `decision` | diamond | |
| `subprocess` | rectangle with a sub-process marker | drillable |
| `parallel` | rectangle with region compartments | drillable; regions are the top-level groups of its inline subgraph; `join` shown on the top edge |
| `timer` | double circle with a stopwatch | an intermediate event: waiting for a timer; label under it |
| `wait` | double circle with an hourglass | an intermediate event: waiting for input or a message; label under it |
| `any` | dashed circle with an asterisk | "any state": its edges apply from every state of the graph; a source, but not the start |
| `note` | folded sheet | annotation: not part of the flow checks |

A `parallel` node is a state with concurrent regions. Give it an inline
`subgraph` whose top-level `groups` are the regions (each with its own start):
the node shows one compartment per region, and drilling in draws the groups as
region lanes, with the join (`all regions` / `any region`) in the navigation bar.
With a subgraph reference the node is drawn without compartments.

## Edges

```ts
interface FlowEdge {
  id: string
  from: string
  to: string
  fromPort?: string
  toPort?: string
  label?: string
  condition?: string           // a guard; shown when there is no label
  enabled?: boolean
  kind?: 'transition' | 'association' // association: dashed, no arrow (a note to its node)
  trigger?: 'timer' | 'event' // what fires it: an icon on the edge label (with or without words)
  data?: Record<string, DataValue>
}
```

Cycles are allowed — state machines loop. A self loop (`from === to`) is drawn
beside its node.

## Ports

Without ports an edge attaches where it meets the outline (several edges on one
side of a rectangle are spread along it). A port pins it:

```ts
interface Port { id: string; side: 'top' | 'right' | 'bottom' | 'left'; offset?: number; kind?: 'in' | 'out' | 'both'; label?: string }
```

`offset` is 0…1 along the side (0.5 by default); `kind: 'in'` takes only
incoming edges. Ports come from the node's `ports`, else from its type.

## Groups

```ts
interface FlowGroup { id: string; label?: string; parent?: string }
```

A node joins a group with `group: 'id'`. Groups nest through `parent` and are
drawn as dashed frames.

## Reading and writing

```ts
import { parseGraph, stringifyGraph, emptyGraph, GraphError } from '@dskripchenko/flow'

const graph = parseGraph(jsonTextOrObject) // throws GraphError with a JSON pointer
const text = stringifyGraph(graph)
```

`parseGraph` fills defaults (`version: 1`, `type: 'state'`, `edges: []`),
drops unknown fields of nodes and edges, reads inline sub-processes
recursively, and refuses other model versions.

## Node types

```ts
import { createRegistry } from '@dskripchenko/flow'

const registry = createRegistry({
  timer: { title: 'Timer', shape: 'circle', size: { width: 40, height: 40 }, icon: 'clock', labelOutside: true },
  approval: {
    title: 'Approval',
    shape: 'rect',
    minWidth: 160,
    height: 56,
    icon: 'task',
    ports: [
      { id: 'in', side: 'left', kind: 'in' },
      { id: 'approved', side: 'right', offset: 0.3, kind: 'out' },
      { id: 'rejected', side: 'right', offset: 0.7, kind: 'out' },
    ],
  },
})
```

A type definition (`NodeTypeDef`): `title`, `shape` (`rect`, `rounded`,
`circle`, `ring`, `diamond`, `note`, `pill`, `event`, `any`), a fixed `size` or
`minWidth`/`maxWidth`/`height`, `ports`, `icon` (a name from `NODE_ICONS` or a
component through the `nodeIcons` prop), `labelOutside`, `noIncoming`,
`noOutgoing`, `annotation`, `drillable`, `regions` (compartments and join, as `parallel`), `anyState` (a source that is not the start, as `any`) and `locked` (the editor does not let
users change or delete such nodes). Pass the registry to the components and to
`validateGraph` / `layoutGraph`.

## Validation

```ts
import { validateGraph } from '@dskripchenko/flow'

const issues = validateGraph(graph, { registry })
// [{ severity: 'warning', code: 'unreachable', message: 'Node "x" cannot be reached from the start', target: { kind: 'node', id: 'x' } }]
```

| Code | Severity | Meaning |
|---|---|---|
| `duplicate-id` | error | an id is used twice |
| `unknown-node` | error | an edge refers to a missing node |
| `unknown-port` | error | an edge uses a missing port, or a port of the wrong `kind` |
| `unknown-group`, `group-cycle` | error | a broken group tree |
| `unknown-type` | warning | not in the registry (drawn as a state) |
| `missing-start`, `missing-end` | warning | off with `requireStartEnd: false` |
| `start-incoming`, `end-outgoing` | warning | an edge into a start or out of an end |
| `unreachable` | warning | not reachable from any start or "any state" node |
| `dead-end` | warning | a step with no way out |
| `empty-label` | warning | a step without a label |

Errors come first. `issuesByElement(issues)` groups them by element id.

## Layout

```ts
import { layoutGraph } from '@dskripchenko/flow'

const layout = layoutGraph(graph, { direction: 'LR', routing: 'orthogonal', registry })
layout.nodes.get('new')      // { x, y, width, height, lines, descriptionLines }
layout.edges.get('e2')       // { d (SVG path), points, from, to, label? }
layout.groups, layout.bounds
```

- A layered (Sugiyama) layout places nodes without positions; it handles
  cycles, groups and labels, and is deterministic.
- When some nodes have positions, they stay; the others keep their place
  relative to the layout, shifted to line up with the fixed ones and moved off
  any overlap.
- `routing: 'orthogonal'` (the default) draws right-angle segments with
  rounded corners; `'spline'` the same corridors with smooth, wide curves
  (direct curves between ports when there is no layout to follow). Routes
  keep one lane while the way is clear and change lanes only between ranks,
  so they never pass through other nodes or through groups that hold
  neither end.
- **Back edges** — transitions against the flow (retry, resend, give up…) —
  run through a channel beside the graph (below or above in LR, right or
  left in TB, whichever needs no crossing): out of the source, along a lane
  of their own (parallel back edges never share one), back into the target.
  The forward layout is computed without them, so they leave no gaps.
- Edge labels stay in the slot the layout reserved (or in the middle of
  their lane); a label that would cover a node or another label slides
  along its own route.
- Text is measured with a glyph table (deterministic in Node); the Vue
  components pass a canvas measurer in the browser. Pass `measure` to use your own.
- `MAX_NODES` (500) and `MAX_EDGES` (2000) bound the layout; above them it throws.
