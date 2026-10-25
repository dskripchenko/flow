# Vue-Komponenten

```ts
import { FlowView, FlowEditor, mountFlow, mountFlowEditor } from '@dskripchenko/flow/vue'
import '@dskripchenko/flow/style.css'
```

Alle Komponenten bauen auf `@dskripchenko/ui` auf (Buttons, Switch, Drawer,
Breadcrumb, Badges, Tooltips, Menüs, Formulare) und folgen dessen Tokens und
Themes. Die Komponente füllt ihren Container aus: Geben Sie ihr eine Höhe.

## FlowView

Ein schreibgeschützter Prozess oder Zustandsautomat mit Live-Monitoring,
Schaltern zum Aktivieren/Deaktivieren, Drill-down in Teilprozesse und einem
Detail-Drawer.

### Props

| Prop | Typ | Standard | |
|---|---|---|---|
| `graph` | `Graph` | — | das Modell (Wurzelebene) |
| `state` | `MonitorSnapshot \| MonitorState` | — | Monitoring für den angezeigten Graphen |
| `poll` | `{ fetch(signal, context), intervalMs?, backoff?, merge?, visibilityPause? }` | — | stattdessen einen Endpunkt abfragen ([Monitoring](monitoring.md)) |
| `staleAfterMs` | `number` | 3 Intervalle, ≥ 15 s | die Veraltet-Warnung |
| `toggleable` | `boolean` | `false` | Schalter zum Aktivieren/Deaktivieren bei Hover und im Drawer |
| `onToggle` | `(change) => Promise \| void` | — | speichert ein Umschalten; eine Ablehnung macht es mit einem Fehler-Toast rückgängig |
| `subgraphs` | `Record<string, Graph>` | `{}` | Graphen für `subgraph`-Referenzen als Zeichenkette |
| `loadSubgraph` | `(ref, node) => Promise<Graph>` | — | lädt eine Referenz, die nicht in `subgraphs` steht |
| `details` | `boolean` | `true` | der eingebaute Detail-Drawer |
| `minimap` | `boolean` | `true` | die Minimap (auch `v-model:minimap`) |
| `controls` | `boolean` | `true` | die Leiste für Zoom/Einpassen |
| `statusBar` | `boolean` | `true` | letzte Aktualisierung, Aktualität, Zusammenfassung nach Status |
| `direction` | `'LR' \| 'TB' \| 'auto'` | `meta.direction`, sonst `auto` | `auto`: LR in einem Querformat-Container, TB in einem Hochformat-Container |
| `edgeStyle` | `'orthogonal' \| 'smooth'` | `'orthogonal'` | rechte Winkel oder dieselben Routen mit weichen Kurven |
| `registry` | `NodeTypeRegistry` | eingebaute Typen | eigene Knotentypen |
| `nodeRenderers` | `Record<type, Component>` | `{}` | eigene Darstellung von Knoten |
| `nodeIcons` | `Record<type \| icon, Component>` | `{}` | Icons für Typen |
| `statusTones` | `Record<status, tone>` | — | `accent`, `success`, `danger`, `warning`, `info`, `neutral` |
| `locale` | `'en' \| 'ru' \| string` | `'en'` | Sprache der Oberfläche (auch die des Kits) |
| `labels` | `Partial<FlowLabels>` | — | überschreibt beliebige Texte |
| `wheel` | `'zoom' \| 'pan'` | `'zoom'` | was das einfache Mausrad tut (Ctrl/⌘ + Mausrad zoomt immer) |
| `minZoom`, `maxZoom` | `number` | `0.15`, `2.5` | |
| `toastProvider` | `boolean` | `true` | hängt den Toast-Provider des Kits ein; auf `false` setzen, wenn die App bereits einen hat |

### Events

| Event | Payload |
|---|---|
| `select` | `{ kind, id, element, path } \| null` |
| `toggle` | `{ kind: 'node' \| 'edge', id, enabled, path }` — optimistisch ausgelöst |
| `toggle-error` | `(change, error)` — `onToggle` hat abgelehnt; die Änderung wird rückgängig gemacht |
| `navigate` | `NavigationLevel[]` — die betretenen Teilprozesse, Wurzel zuerst |
| `poll-error` | `error` |

### Slots

- `details` — `{ kind, element, state, path }`: zusätzlicher Inhalt im Drawer
  (Verlauf, Aktionen).
- `details-header` — `{ kind, element }`: ersetzt den Titel des Drawers.
- `controls` — zusätzliche Buttons in der Zoom-Leiste.
- `empty` — ersetzt die Meldung für einen leeren Graphen.

### Exponiert

`fit()`, `enter(nodeId)`, `back()`, `refresh()` (jetzt abfragen), `select(id | null)`, `stack`.

### Aktivieren und Deaktivieren

Mit `toggleable` zeigt das Überfahren eines Knotens oder einer Kante einen
Switch des Kits darüber an, und auch der Detail-Drawer hat einen. Die Änderung
wird sofort angewendet (abgeblendet, durchgestrichen; die Kanten eines
deaktivierten Knotens werden mit abgeblendet) und `onToggle` wird aufgerufen:

```ts
async function onToggle({ kind, id, enabled, path }: ToggleChange) {
  const r = await fetch(`/api/process/${kind}s/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) })
  if (!r.ok) throw new Error((await r.json()).message) // rückgängig gemacht, Toast mit der Meldung
}
```

Die Überschreibung bleibt bestehen, bis sich die Prop `graph` ändert (geben Sie
das aktualisierte Modell zurück) — dann entscheidet das Modell.

### Drill-down

Ein Knoten mit `subgraph` erhält eine Markierung darunter; ein Klick darauf,
ein Doppelklick auf den Knoten oder die Schaltfläche „Teilprozess öffnen“ im
Drawer öffnet den Teilprozess. Die Breadcrumb zeigt den Weg zurück (ebenso der
Zurück-Button und Escape). Ein Inline-Graph öffnet sich sofort; eine Referenz
als Zeichenkette wird in `subgraphs` nachgeschlagen und dann mit
`loadSubgraph(ref, node)` geladen (währenddessen ein Spinner, bei einem Fehler
ein Toast). Das Polling startet für die Ebene mit `context.path` /
`context.ref` neu.

### Eigene Darstellung von Knoten

Pro Typ eine Komponente, die innerhalb des Knotenrahmens zeichnet (SVG,
Ursprung in der linken oberen Ecke):

```vue
<!-- ApprovalNode.vue -->
<script setup lang="ts">
import type { NodeRendererProps } from '@dskripchenko/flow/vue'
defineProps<NodeRendererProps>()
</script>
<template>
  <rect :width="geometry.width" :height="geometry.height" rx="10" :class="['approval', state?.status, { selected }]" />
  <text :x="geometry.width / 2" :y="geometry.height / 2 + 4" text-anchor="middle">{{ node.label }}</text>
</template>
```

```vue
<FlowView :graph="graph" :registry="registry" :node-renderers="{ approval: ApprovalNode }" />
```

Props: `node`, `geometry` (`{ width, height, lines, … }`), `state` (der
Monitoring-Eintrag des Knotens), `selected`, `disabled`, `current`, `labels`.
Die Größe stammt aus der Typdefinition in der Registry. Für HTML-Inhalte
verwenden Sie `<foreignObject>`.

### Erste Ansicht

Der Graph öffnet bei 100 % auf dem relevanten Schritt – dem aktuellen Schritt
der Instanz, sonst einem aktiven, sonst dem Start –, es sei denn, der ganze
Graph passt bei 85 % oder mehr; dann wird er vollständig gezeigt. Kleiner
öffnet er nie; den Überblick geben die Einpassen-Schaltfläche und die
Minimap. Beim Einpassen und Zentrieren bleiben Knoten frei von Statuszeile,
Breadcrumb, Steuerleiste und Minimap, und vor dem Start oder nach dem Ende
bleibt kein leerer Raum.

### Tastatur und Barrierefreiheit

- Jeder Knoten ist ein fokussierbarer `role="button"` mit einer Beschriftung,
  die Typ, Status, Zähler und „deaktiviert“ enthält; Kanten sind fokussierbar,
  wenn der Graph umschaltbar oder bearbeitbar ist.
- Tab wechselt zwischen den Knoten; die Pfeiltasten springen zum nächsten
  Knoten in dieser Richtung (die Ansicht folgt dem Fokus).
- Enter oder Space wählt aus und öffnet die Details; Escape schließt den
  Drawer, hebt die Auswahl auf und geht dann eine Teilprozess-Ebene zurück.
- `+` / `-` zoomen, `0` passt ein.
- Zeiger: Ziehen des Hintergrunds (oder Space + Ziehen) verschiebt; Mausrad
  oder Pinch-Geste zoomen; Touch funktioniert genauso.

## mountFlow

Ohne eigene Vue-App:

```ts
import { mountFlow } from '@dskripchenko/flow/vue'

const handle = mountFlow('#flow', { graph, poll, onSelect: (s) => console.log(s) })
handle.update({ graph: nextGraph })
handle.unmount()
```

`mountFlowEditor(el, { modelValue, onChange })` tut dasselbe für den Editor;
`handle.getGraph()` liefert das bearbeitete Modell.
