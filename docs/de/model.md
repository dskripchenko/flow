# Modell

Das Modell ist reines JSON, versioniert und unabhängig vom Layout und vom
Monitoring-Zustand. Ein Host speichert es unverändert; Viewer und Editor lesen
und schreiben genau diese Form. Ein [JSON Schema](../../schema/graph.schema.json)
wird mit dem Paket ausgeliefert (`@dskripchenko/flow/schema/graph.schema.json`).

```ts
interface Graph {
  version: 1
  nodes: FlowNode[]
  edges: FlowEdge[]
  groups?: FlowGroup[]
  meta?: { title?: string; direction?: 'TB' | 'LR'; [key: string]: DataValue }
}
```

IDs sind über Knoten, Kanten und Gruppen hinweg eindeutig.

## Knoten

```ts
interface FlowNode {
  id: string
  type: string                 // start | end | state | task | decision | subprocess | parallel | timer | wait | any | note | custom
  label?: string
  description?: string         // eine zweite Zeile unter der Beschriftung
  position?: { x: number; y: number } // der Mittelpunkt; fehlt er, wird automatisch angeordnet
  group?: string
  data?: Record<string, DataValue>    // in den Details als Schlüssel/Wert angezeigt
  enabled?: boolean            // false: abgeblendet und durchgestrichen gezeichnet
  subgraph?: string | Graph    // ein Inline-Graph oder eine Referenz: macht den Knoten aufklappbar
  ports?: Port[]               // überschreibt die Ports des Typs
  join?: 'all' | 'any'         // parallel: fertig, wenn alle Regionen fertig sind oder eine davon
}
```

| Typ | Darstellung | Hinweise |
|---|---|---|
| `start` | gefüllter Kreis mit Play-Symbol | keine eingehenden Kanten; Beschriftung darunter |
| `end` | Ring | keine ausgehenden Kanten; Beschriftung darunter |
| `state` | abgerundetes Rechteck | der Standardtyp |
| `task` | Rechteck mit Icon-Kachel | |
| `decision` | Raute | |
| `subprocess` | Rechteck mit Teilprozess-Markierung | aufklappbar |
| `parallel` | Rechteck mit Regionsfächern | aufklappbar; die Regionen sind die Gruppen oberster Ebene seines eingebetteten Teilgraphen; `join` an der Oberkante |
| `timer` | Doppelkreis mit Stoppuhr | ein Zwischenereignis: Warten auf einen Timer; Beschriftung darunter |
| `wait` | Doppelkreis mit Sanduhr | ein Zwischenereignis: Warten auf Eingabe oder eine Nachricht; Beschriftung darunter |
| `any` | gestrichelter Kreis mit Sternchen | „beliebiger Zustand“: seine Kanten gelten aus jedem Zustand des Graphen; eine Quelle, aber nicht der Start |
| `note` | gefaltetes Blatt | Anmerkung: nicht Teil der Ablaufprüfungen |

Ein `parallel`-Knoten ist ein Zustand mit nebenläufigen Regionen. Geben Sie
ihm einen eingebetteten `subgraph`, dessen Gruppen oberster Ebene (`groups`) die
Regionen sind (jede mit eigenem Start): Der Knoten zeigt ein Fach pro Region,
und beim Aufklappen werden die Gruppen als Regionsbahnen gezeichnet, mit der
Join-Regel (`alle Regionen` / `eine Region`) in der Navigationsleiste. Mit einer
Teilgraph-Referenz wird der Knoten ohne Fächer gezeichnet.

## Kanten

```ts
interface FlowEdge {
  id: string
  from: string
  to: string
  fromPort?: string
  toPort?: string
  label?: string
  condition?: string           // eine Bedingung; angezeigt, wenn keine Beschriftung da ist
  enabled?: boolean
  kind?: 'transition' | 'association' // association: gestrichelt, ohne Pfeil (eine Notiz an ihrem Knoten)
  trigger?: 'timer' | 'event' // was den Übergang auslöst: ein Symbol im Kantenlabel (mit oder ohne Text)
  data?: Record<string, DataValue>
}
```

Zyklen sind erlaubt — Zustandsautomaten laufen in Schleifen. Eine Selbstschleife
(`from === to`) wird neben ihrem Knoten gezeichnet.

## Ports

Ohne Ports setzt eine Kante dort an, wo sie auf den Umriss trifft (mehrere
Kanten auf einer Seite eines Rechtecks werden entlang dieser Seite verteilt).
Ein Port legt den Ansatzpunkt fest:

```ts
interface Port { id: string; side: 'top' | 'right' | 'bottom' | 'left'; offset?: number; kind?: 'in' | 'out' | 'both'; label?: string }
```

`offset` ist 0…1 entlang der Seite (standardmäßig 0.5); `kind: 'in'` nimmt nur
eingehende Kanten an. Ports stammen aus den `ports` des Knotens, sonst aus
seinem Typ.

## Gruppen

```ts
interface FlowGroup { id: string; label?: string; parent?: string }
```

Ein Knoten tritt einer Gruppe mit `group: 'id'` bei. Gruppen werden über
`parent` verschachtelt und als gestrichelte Rahmen gezeichnet.

## Lesen und Schreiben

```ts
import { parseGraph, stringifyGraph, emptyGraph, GraphError } from '@dskripchenko/flow'

const graph = parseGraph(jsonTextOrObject) // wirft GraphError mit einem JSON Pointer
const text = stringifyGraph(graph)
```

`parseGraph` ergänzt Standardwerte (`version: 1`, `type: 'state'`, `edges: []`),
verwirft unbekannte Felder von Knoten und Kanten, liest Inline-Teilprozesse
rekursiv und lehnt andere Modellversionen ab.

## Knotentypen

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

Eine Typdefinition (`NodeTypeDef`): `title`, `shape` (`rect`, `rounded`,
`circle`, `ring`, `diamond`, `note`, `pill`, `event`, `any`), eine feste `size` oder
`minWidth`/`maxWidth`/`height`, `ports`, `icon` (ein Name aus `NODE_ICONS` oder
eine Komponente über die Prop `nodeIcons`), `labelOutside`, `noIncoming`,
`noOutgoing`, `annotation`, `drillable`, `regions` (Fächer und Join, wie `parallel`), `anyState` (eine Quelle, die nicht als Start zählt, wie `any`) und `locked` (der Editor lässt Benutzer
solche Knoten weder ändern noch löschen). Übergeben Sie die Registry an die
Komponenten und an `validateGraph` / `layoutGraph`.

## Validierung

```ts
import { validateGraph } from '@dskripchenko/flow'

const issues = validateGraph(graph, { registry })
// [{ severity: 'warning', code: 'unreachable', message: 'Node "x" cannot be reached from the start', target: { kind: 'node', id: 'x' } }]
```

| Code | Schweregrad | Bedeutung |
|---|---|---|
| `duplicate-id` | error | eine ID wird doppelt verwendet |
| `unknown-node` | error | eine Kante verweist auf einen fehlenden Knoten |
| `unknown-port` | error | eine Kante verwendet einen fehlenden Port oder einen Port mit falschem `kind` |
| `unknown-group`, `group-cycle` | error | ein defekter Gruppenbaum |
| `unknown-type` | warning | nicht in der Registry (als state gezeichnet) |
| `missing-start`, `missing-end` | warning | abschaltbar mit `requireStartEnd: false` |
| `start-incoming`, `end-outgoing` | warning | eine Kante in einen Start oder aus einem Ende |
| `unreachable` | warning | von keinem Start und keinem „beliebiger Zustand“-Knoten aus erreichbar |
| `dead-end` | warning | ein Schritt ohne Ausgang |
| `empty-label` | warning | ein Schritt ohne Beschriftung |

Fehler kommen zuerst. `issuesByElement(issues)` gruppiert sie nach Element-ID.

## Layout

```ts
import { layoutGraph } from '@dskripchenko/flow'

const layout = layoutGraph(graph, { direction: 'LR', routing: 'orthogonal', registry })
layout.nodes.get('new')      // { x, y, width, height, lines, descriptionLines }
layout.edges.get('e2')       // { d (SVG-Pfad), points, from, to, label? }
layout.groups, layout.bounds
```

- Ein Schichten-Layout (Sugiyama) platziert Knoten ohne Position; es kommt mit
  Zyklen, Gruppen und Beschriftungen zurecht und ist deterministisch.
- Haben einige Knoten Positionen, bleiben diese erhalten; die übrigen behalten
  ihre Lage relativ zum Layout, werden an den fixierten ausgerichtet und aus
  jeder Überlappung herausgeschoben.
- `routing: 'orthogonal'` (Standard) zeichnet rechtwinklige Segmente mit
  abgerundeten Ecken; `'spline'` dieselben Korridore mit weichen, weiten
  Kurven (direkte Kurven zwischen Ports, wenn es kein Layout gibt). Routen
  behalten ihre Spur, solange der Weg frei ist, und wechseln sie nur zwischen
  Rängen – sie laufen nie durch fremde Knoten oder durch Gruppen, die keines
  der Enden enthalten.
- **Rückkanten** – Übergänge gegen den Fluss (Retry, erneut senden,
  aufgeben …) – laufen durch einen Kanal neben dem Graphen (unten oder oben
  bei LR, rechts oder links bei TB, je nachdem, wo nichts gekreuzt wird):
  aus der Quelle, über eine eigene Spur (parallele Rückkanten teilen sich
  keine), zurück ins Ziel. Das Vorwärts-Layout wird ohne sie berechnet, sie
  hinterlassen also keine Lücken.
- Kantenbeschriftungen bleiben am vom Layout reservierten Platz (oder in der
  Mitte ihrer Spur); eine Beschriftung, die einen Knoten oder eine andere
  Beschriftung verdecken würde, rutscht entlang ihrer eigenen Route.
- Text wird mit einer Glyphentabelle gemessen (deterministisch in Node); die
  Vue-Komponenten übergeben im Browser einen Canvas-Messer. Übergeben Sie
  `measure`, um einen eigenen zu verwenden.
- `MAX_NODES` (500) und `MAX_EDGES` (2000) begrenzen das Layout; darüber wirft es
  einen Fehler.
