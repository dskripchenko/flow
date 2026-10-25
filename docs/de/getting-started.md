# Erste Schritte

## Installation

```bash
npm install @dskripchenko/flow
```

Das Paket hat drei Einstiegspunkte:

- `@dskripchenko/flow` — der Kern: das Modell, Validierung, Layout,
  Monitoring-Zustand, der Poller und die Bearbeitungsbefehle. Reines
  TypeScript ohne Abhängigkeiten und ohne DOM; es läuft im Browser, in Node 20+
  und in einem Worker.
- `@dskripchenko/flow/vue` — `FlowView` (Viewer und Monitor) und `FlowEditor`.
  Sie benötigen Vue 3.4+ und [`@dskripchenko/ui`](https://github.com/dskripchenko/ui)
  1.14+, die als optionale Peer-Abhängigkeiten deklariert sind.
- `@dskripchenko/flow/mermaid` — `fromMermaid()`, ein Modell aus einem Mermaid-
  `stateDiagram-v2` oder `flowchart`. Es benötigt
  [`@dskripchenko/diagrams`](https://github.com/dskripchenko/diagrams) 1.1+
  (ebenfalls eine optionale Peer-Abhängigkeit); nichts anderes importiert es.

```bash
npm install vue @dskripchenko/ui            # für die Komponenten
npm install @dskripchenko/diagrams          # für den Mermaid-Import
```

Für eine Seite ohne Build-Schritt gibt es ein eigenständiges Bundle mit Vue,
dem Kit und den Styles darin — siehe [Eigenständig](standalone.md).

## Styles

Importieren Sie die Styles des Kits und die des Pakets einmal im Einstiegspunkt
der App:

```ts
import '@dskripchenko/ui/styles/all.css'
import '@dskripchenko/flow/style.css'
```

Die Komponenten verwenden die Tokens des Kits (`--uid-*`), daher folgen das
helle und das dunkle Theme dem `data-theme` des Kits auf `<html>`.

## Ein erster Graph

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

Knoten ohne `position` werden automatisch angeordnet (ein Schichten-Layout, auf
einem Querformat-Bildschirm von links nach rechts, auf einem Hochformat-Bildschirm
von oben nach unten). Geben Sie der Komponente eine Höhe: Sie füllt ihren
Container aus.

## Live-Zustand

Verweisen Sie den Viewer auf einen Monitoring-Endpunkt, und er fragt ihn
regelmäßig ab und hebt den aktiven Schritt, den Pfad der aktuellen Instanz,
Zähler und Fehler hervor:

```vue
<FlowView
  :graph="graph"
  :poll="{ intervalMs: 5000, fetch: (signal) => fetch('/api/orders/42/state', { signal }).then((r) => r.json()) }"
/>
```

Der Endpunkt liefert einen [Monitoring-Snapshot](monitoring.md#der-snapshot).

## Bearbeiten

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

## Wie es weitergeht

- [Modell](model.md) — Knoten, Kanten, Gruppen, Ports, Typen, Validierung, Layout.
- [Monitoring und Polling](monitoring.md) — der Snapshot, der Reducer, der Poller.
- [Vue-Komponenten](vue.md) — `FlowView`: Props, Events, Slots, eigene Knoten.
- [Editor](editor.md) — `FlowEditor`, Befehle, Rückgängig, Tastenkürzel.
- [Host-Integration](integration.md) — die JSON-Verträge, die ein Backend implementiert.
- [Eigenständig](standalone.md) — ein `<script>`, kein Build.
