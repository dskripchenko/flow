# Notations: EPC, DFD, IDEF0

Three notations of business and systems analysis come as sets of node types:
EPC (event-driven process chains), DFD (data flow diagrams) and IDEF0
(function models). Each set brings its palette and the direction its
diagrams usually run in.

```vue
<script setup lang="ts">
import { NOTATIONS, notationRegistry } from '@dskripchenko/flow'
import { FlowEditor } from '@dskripchenko/flow/vue'

const notation = NOTATIONS.epc
</script>

<template>
  <FlowEditor v-model="graph" :registry="notationRegistry('epc')" :palette="notation.palette" />
</template>
```

`FlowView` takes the same `registry`. A graph's `meta.direction` can follow
`notation.direction`.

## EPC

| Type            | Shape                               |
| --------------- | ----------------------------------- |
| `epc-event`     | Hexagon                             |
| `epc-function`  | Rounded box                         |
| `epc-and`, `epc-or`, `epc-xor` | Connector circle with ∧, ∨ or × |
| `epc-org`       | Ellipse (organisational unit)       |
| `epc-info`      | Box (information object)            |
| `epc-document`  | Document                            |
| `epc-system`    | Box with a computer icon            |
| `epc-path`      | Hexagon that drills into a process  |

Organisational units, systems and documents attach to functions with
association edges (`kind: 'association'`). EPCs run top to bottom.

## DFD

| Type          | Shape                                                   |
| ------------- | ------------------------------------------------------- |
| `dfd-process` | Ellipse with its number on top; drills into a lower level |
| `dfd-entity`  | Box with a second outline (external entity)             |
| `dfd-store`   | Store open on the right, its number in a compartment    |

Edges are data flows; their labels name the data. Numbers come from
`data.number` (`1`, `1.2`, `D1`).

## IDEF0

| Type             | Shape                                                             |
| ---------------- | ----------------------------------------------------------------- |
| `idef0-function` | Box numbered in the bottom right corner (`A0`, `A1`…), drills down |
| `idef0-boundary` | Pill: the end of an arrow at the diagram's boundary               |

A function box has the four IDEF0 ports (`IDEF0_PORTS`): `input` on the left,
`control` on top, `output` on the right and `mechanism` at the bottom. An edge
names the port it uses (`toPort: 'control'`).

The layout places a node that only feeds a port on the top or bottom of
another node (or only takes from one) above or below that node rather than in
the flow — so controls sit over their box and mechanisms under it, as IDEF0
draws them. This applies to any type with such ports, not only to IDEF0.
