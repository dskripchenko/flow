# Host-Integration

Was ein Backend (oder ein Admin-Panel wie laravel-admin) implementiert, um
Prozesse anzuzeigen, zu überwachen und zu bearbeiten. Alle Payloads sind JSON.

## Das Modell

Wird unverändert gespeichert — `GET` liefert es, `v-model` / `change` des
Editors erzeugen es. Schema: `@dskripchenko/flow/schema/graph.schema.json`
(JSON Schema 2020-12). Validieren Sie auf dem Server mit einem beliebigen
JSON-Schema-Validator und wenden Sie dann die semantischen Prüfungen von
`validateGraph` an (dieselben Regeln lassen sich serverseitig nachbauen:
eindeutige IDs, Kanten zwischen existierenden Knoten, Ports der richtigen Art).

Positionen sind optional. Ein auf dem Server ohne Positionen erstellter
Prozess wird auf dem Client angeordnet; die erste Bearbeitung im Editor
speichert Positionen.

## Monitoring-Snapshot

`GET /…/state` → ein Snapshot
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

- Für eine einzelne Instanz: Status entlang ihres Verlaufs, `path` und `current`.
- Für eine Prozessübersicht: `count` pro Knoten/Kante (Instanzen in jedem
  Zustand), `status: "error"` und `badge`, wo etwas fehlschlägt.
- Beim Drill-down übergibt der Viewer `context.path` (Knoten-IDs der betretenen
  Teilprozesse) und `context.ref` (die Referenz des Teilprozesses); liefern Sie
  den Zustand für diese Ebene. Beantworten Sie HTTP-Fehler mit einem Status
  außerhalb von 2xx: Der Viewer zeigt den Fehler an, behält die letzten Daten
  und verlängert die Wartezeit.
- Einen vom Server gerenderten ersten Snapshot in `state` übergeben; mit
  `poll` ersetzen ihn die abgefragten Snapshots – vor der ersten Anfrage
  bleibt nichts leer.
- Host-Parameter (die angezeigte Instanz, ein Filter) gehören in
  `pollParams`; sie erreichen `fetch` als `context.params`, und eine Änderung
  startet das Polling sofort neu (alte Daten werden verworfen, sofern mit der
  Änderung kein neuer `state` kommt). Das bereitgestellte `refresh()` fragt
  sofort ab.

## Umschalten

Der Viewer ruft `onToggle(change)` auf; senden Sie es an den Server:

```json
{ "kind": "node", "id": "cancelled", "enabled": false, "path": [] }
```

`path` sind die Knoten-IDs der Teilprozesse ab der Wurzel (leer auf der
Wurzelebene). Lehnen Sie ab (Status außerhalb von 2xx, Exception in
`onToggle`), um den Schalter zurückzusetzen; die Fehlermeldung wird in einem
Toast angezeigt. Übergeben Sie danach das aktualisierte Modell als `graph`
(oder behalten Sie es: Der optimistische Zustand bleibt, bis sich `graph` ändert).

## Teilprozesse

`node.subgraph` ist entweder ein Inline-Graph oder eine Referenz als
Zeichenkette. Für Referenzen übergeben Sie entweder `subgraphs: { ref: Graph }`
oder `loadSubgraph(ref, node) => Promise<Graph>` (z. B. `GET /processes/{ref}`).

## Bearbeiten

`FlowEditor` löst `change` aus mit:

```ts
{
  command: Command        // auf der Wurzelebene: wiederholbar mit applyCommand(rootGraph, command)
  local: { command, path } // wie vorgenommen, innerhalb des Teilprozesses unter `path`
  description: string     // "add task-1", "move 3 nodes", …
  graph: Graph            // das ganze Modell nach der Änderung
  source: 'edit' | 'undo' | 'redo'
}
```

Das einfachste Backend speichert `graph` (mit Debounce). Ein kollaboratives
oder auditiertes Backend speichert die `command`s. Gesperrte Knotentypen
(Prop `locked: ['typ', …]` des Editors oder `locked: true` in der Registry)
können im Editor weder verschoben, geändert noch gelöscht werden — setzen Sie dasselbe auf dem Server durch.
