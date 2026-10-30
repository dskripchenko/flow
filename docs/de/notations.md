# Notationen: EPK, DFD, IDEF0

Drei Notationen der Geschäfts- und Systemanalyse kommen als Sätze von
Knotentypen: EPK (ereignisgesteuerte Prozessketten, engl. EPC),
Datenflussdiagramme (DFD) und IDEF0 (Funktionsmodelle). Jeder Satz bringt
seine Palette und die Richtung mit, in der solche Diagramme meist laufen.

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

`FlowView` nimmt dieselbe `registry`. `meta.direction` eines Graphen kann
`notation.direction` folgen.

## EPK

| Typ             | Form                                      |
| --------------- | ----------------------------------------- |
| `epc-event`     | Sechseck                                  |
| `epc-function`  | Abgerundeter Kasten                       |
| `epc-and`, `epc-or`, `epc-xor` | Konnektor-Kreis mit ∧, ∨ oder × |
| `epc-org`       | Ellipse (Organisationseinheit)            |
| `epc-info`      | Kasten (Informationsobjekt)               |
| `epc-document`  | Dokument                                  |
| `epc-system`    | Kasten mit Computersymbol                 |
| `epc-path`      | Sechseck, das in einen Prozess führt      |

Organisationseinheiten, Systeme und Dokumente hängen über
Assoziationskanten (`kind: 'association'`) an Funktionen. EPKs laufen von oben
nach unten.

## DFD

| Typ           | Form                                                          |
| ------------- | ------------------------------------------------------------- |
| `dfd-process` | Ellipse mit Nummer oben; führt in eine tiefere Ebene          |
| `dfd-entity`  | Kasten mit zweitem Umriss (externe Entität)                   |
| `dfd-store`   | Datenspeicher, rechts offen, Nummer in eigenem Fach           |

Kanten sind Datenflüsse; ihre Beschriftungen nennen die Daten. Nummern
stammen aus `data.number` (`1`, `1.2`, `D1`).

## IDEF0

| Typ              | Form                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| `idef0-function` | Kasten mit Nummer rechts unten (`A0`, `A1`…), führt in die Tiefe      |
| `idef0-boundary` | Pille: das Ende eines Pfeils am Rand des Diagramms                    |

Ein Funktionskasten hat die vier IDEF0-Ports (`IDEF0_PORTS`): `input` links,
`control` oben, `output` rechts und `mechanism` unten. Eine Kante nennt den
Port, den sie nutzt (`toPort: 'control'`).

Das Layout setzt einen Knoten, der nur einen Port oben oder unten eines
anderen Knotens speist (oder nur aus einem nimmt), über oder unter diesen
Knoten statt in den Fluss — so stehen Steuerungen über ihrem Kasten und
Mechanismen darunter, wie IDEF0 sie zeichnet. Das gilt für jeden Typ mit
solchen Ports, nicht nur für IDEF0.
