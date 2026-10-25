# Editor

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { FlowEditor, type ChangeEvent } from '@dskripchenko/flow/vue'
import { fromMermaid } from '@dskripchenko/flow/mermaid'

const graph = ref(initial)
function onChange(e: ChangeEvent) {
  // e.command — was sich geändert hat, als Befehl auf der Wurzelebene des Modells
  // e.local   — dasselbe auf der Ebene, auf der es vorgenommen wurde, mit dem Teilprozess-Pfad
  // e.source  — 'edit' | 'undo' | 'redo'
}
</script>

<template>
  <FlowEditor v-model="graph" :mermaid="fromMermaid" style="height: 720px" @change="onChange" />
</template>
```

## Was der Benutzer tun kann

- **Hinzufügen** — einen Typ aus dem Elementbereich auf die Zeichenfläche
  ziehen oder ihn anklicken (er landet in der Mitte der Ansicht); Doppelklick
  auf den Hintergrund für einen state; „Hier hinzufügen“ im Kontextmenü.
- **Verbinden** — mit der Maus über einen Knoten fahren: An seinen Seiten (oder
  seinen Ports) erscheinen Griffe. Von einem zu einem anderen Knoten ziehen; die
  Linie rastet am nächsten erreichbaren Griff ein, und der neue Übergang wird
  zum Beschriften ausgewählt. Per Tastatur: „Übergang hinzufügen zu…“ in den
  Eigenschaften des Knotens.
- **Neu verbinden / lösen** — einen Übergang auswählen und einen seiner
  Endgriffe auf einen anderen Knoten ziehen; auf freier Fläche loslassen
  entfernt den Übergang.
- **Verschieben** — ziehen; der gegriffene Knoten rastet am Raster ein (der
  Magnet-Button schaltet das Einrasten ab). Pfeiltasten verschieben die Auswahl
  um einen Rasterschritt (Shift: fünf).
- **Auswählen** — klicken; Shift/Ctrl/⌘-Klick fügt hinzu; Shift-Ziehen auf dem
  Hintergrund zieht ein Auswahlrechteck auf; Ctrl/⌘+A wählt alles aus.
- **Anordnen** — ausrichten (links, Mitte, rechts, oben, Mitte, unten) und
  gleichmäßig verteilen über den Eigenschaftenbereich oder das Kontextmenü;
  „Automatisches Layout“ ordnet alles neu an (ein Rückgängig-Schritt).
- **Eigenschaften** — Beschriftung, Beschreibung, Typ, Gruppe, aktiviert,
  Übergänge, Teilprozess (eine Referenz oder ein Inline-Graph zum Öffnen und
  Bearbeiten), Daten als Schlüssel/Wert-Zeilen (Werte, die wie JSON aussehen —
  Zahlen, Booleans, Arrays — werden als solche gespeichert). Für einen
  Übergang: Beschriftung, Bedingung, Art, aktiviert. Ohne Auswahl: der Titel
  des Graphen und die Layout-Richtung.
- **Teilprozesse** — einen Inline-Teilprozess öffnen (Markierung, Doppelklick
  oder die Eigenschaften) und direkt bearbeiten; die Breadcrumb führt zurück.
  Änderungen erreichen den Host als `updateNode` des Teilprozess-Knotens auf
  der Wurzelebene.
- **Validieren** — der Tab „Probleme“ listet Fehler und Warnungen; Elemente
  mit Problemen tragen eine Markierung; ein Klick auf ein Problem wählt sein
  Element aus und zeigt es an.
- **Import / Export** — Menü „JSON / Mermaid“: das Modell als JSON-Datei
  exportieren, JSON importieren, Mermaid `stateDiagram-v2` / `flowchart`
  importieren (mit der Prop `mermaid`). Importe lassen sich rückgängig machen.

## Tastenkürzel

| Tasten | |
|---|---|
| Ctrl/⌘ + Z | rückgängig |
| Ctrl/⌘ + Shift + Z, Ctrl + Y | wiederholen |
| Delete, Backspace | die Auswahl löschen (Kanten gelöschter Knoten werden mitgelöscht) |
| Ctrl/⌘ + C / X / V | kopieren / ausschneiden / einfügen (eingefügte Kopien erhalten neue IDs) |
| Ctrl/⌘ + D | duplizieren |
| Ctrl/⌘ + A | alles auswählen |
| Pfeiltasten (Shift) | verschieben |
| Enter | das fokussierte Element auswählen und seine Beschriftung bearbeiten |
| Escape | die Auswahl aufheben, dann den Teilprozess verlassen |
| Space + Ziehen | Ansicht verschieben |

Während der Eingabe in ein Feld werden Tastenkürzel ignoriert.

## Props

| Prop | Typ | Standard | |
|---|---|---|---|
| `modelValue` | `Graph` | — | `v-model` |
| `registry` | `NodeTypeRegistry` | eingebaut | Typen; `locked: true` macht einen Typ schreibgeschützt |
| `palette` | `string[]` | alle Typen | welche Typen der Elementbereich anbietet, in dieser Reihenfolge |
| `readonly` | `boolean` | `false` | nur ansehen |
| `snapGrid` | `number` | `20` | `0` schaltet das Einrasten ab |
| `direction`, `edgeStyle` | | | wie in FlowView |
| `nodeRenderers`, `nodeIcons` | | | wie in FlowView |
| `mermaid` | `(source) => Graph` | — | aktiviert „Mermaid importieren“: übergeben Sie `fromMermaid` |
| `locale`, `labels` | | `'en'` | |
| `minimap` | `boolean` | `false` | |
| `exportName` | `string` | `'process.json'` | der Name der exportierten Datei |
| `toastProvider` | `boolean` | `true` | |

Events: `update:modelValue`, `change` (`ChangeEvent`), `select` (IDs),
`validate` (Probleme, bei jeder Änderung), `export` (der JSON-Text).
Slots: `toolbar` (zusätzlicher Inhalt der Werkzeugleiste), `properties` (`{ selection, graph, path }`).
Exponiert: `undo()`, `redo()`, `autoLayout()`, `fit()`, `select(ids)`, `history`, `issues`.

Auf schmalen Bildschirmen (unter 760 px) klappen Element- und
Eigenschaftenbereich in Drawer ein, die über die Werkzeugleiste geöffnet
werden; Touch: langes Drücken öffnet das Kontextmenü.

Die erste Bearbeitung eines automatisch angeordneten Graphen fixiert jeden
Knoten dort, wo er gezeichnet ist (im selben Rückgängig-Schritt), sodass nichts
springt.

## Befehle und Verlauf (Kern)

Jede Änderung ist ein `Command`, angewendet durch eine reine Funktion — der
Host kann ihn wiederholen, protokollieren oder senden, statt des ganzen Modells:

```ts
import { applyCommand, History, describeCommand } from '@dskripchenko/flow'

type Command =
  | { type: 'addNodes'; nodes; edges? }
  | { type: 'removeElements'; ids }            // Knoten, Kanten, Gruppen; Kanten entfernter Knoten werden mitentfernt
  | { type: 'updateNode' | 'updateEdge' | 'updateGroup'; id; patch } // null entfernt ein Feld
  | { type: 'moveNodes'; moves: { id, position }[] }
  | { type: 'addEdge'; edge }
  | { type: 'setEnabled'; kind: 'node' | 'edge'; id; enabled }
  | { type: 'addGroup'; group }
  | { type: 'updateMeta'; patch }
  | { type: 'replace'; graph }
  | { type: 'batch'; commands }

const history = new History(graph, { limit: 200, mergeWindowMs: 800 })
history.execute({ type: 'updateNode', id: 'a', patch: { label: 'Paid' } }, 'label:a') // gleicher Schlüssel direkt hintereinander wird zusammengeführt
history.undo()
history.redo()
```

Hilfsfunktionen: `copyFragment` / `pasteFragment` (neue IDs, nur interne Kanten),
`alignNodes`, `distributeNodes`, `layoutCommand(layoutGraph(g, { ignorePositions: true }))`,
`nextId(graph, prefix)`, `snap(point, grid)`.
