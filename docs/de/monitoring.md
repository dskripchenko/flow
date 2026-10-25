# Monitoring und Polling

Der Monitoring-Zustand wird getrennt vom Modell gehalten: Derselbe Graph wird
für jede Instanz mit einem anderen Zustand gezeichnet oder mit aggregierten
Zählern für alle zusammen.

## Der Snapshot

Was ein Monitoring-Endpunkt liefert ([JSON Schema](../../schema/snapshot.schema.json)):

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

Jedes Feld ist optional.

| Feld | Darstellung |
|---|---|
| `nodes[id].status` | `active`: Akzent-Umriss und pulsierender Halo; `done`: grüner Umriss und ein Häkchen; `error`: roter Umriss und rote Füllung; `waiting`: bernsteinfarbener gestrichelter Umriss; `skipped`: abgeblendet. Andere Zeichenketten sind neutral, sofern `statusTones` sie nicht zuordnet. |
| `nodes[id].count` | ein Zähler an der Ecke des Knotens |
| `nodes[id].badge` | ein Eck-Badge statt des Status-Icons (z. B. eine Fehleranzahl) |
| `nodes[id].message` | eine Zeile im Detailbereich |
| `edges[id].count` | ein Zähler an der Kantenbeschriftung |
| `edges[id].traversed` | eine grüne Linie |
| `path` | die Kanten zwischen aufeinanderfolgenden Knoten hervorgehoben, mit laufenden Strichen |
| `current` | die Position der Instanz: Halo; die Ansicht holt sie einmal ins Blickfeld |

Pulsieren und laufende Striche stoppen bei `prefers-reduced-motion`.

## Zustand übergeben

```vue
<FlowView :graph="graph" :state="snapshot" />
```

`state` nimmt einen Snapshot oder einen reduzierten `MonitorState` an. Ein auf
diese Weise übergebener Snapshot wird beim Eintreffen mit einem Zeitstempel
versehen, sodass „Aktualisiert vor N s“ und die Veraltet-Warnung funktionieren.

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

- Immer nur eine Anfrage; die nächste wird geplant, nachdem die vorherige
  abgeschlossen ist.
- Die laufende Anfrage wird abgebrochen, wenn die Komponente ausgehängt wird,
  die Ebene wechselt (Drill-down) oder das Polling stoppt — übergeben Sie
  `signal` an `fetch`.
- Solange der Tab verborgen ist, pausiert das Polling; bei der Rückkehr fragt
  es sofort ab.
- Nach einem Fehler verdoppelt sich die Wartezeit bis auf 60 s
  (`backoff: { factor, maxMs }` oder `false`); die Statuszeile zeigt den Fehler
  und eine Schaltfläche zum Aktualisieren.
- `context.path` sind die Knoten-IDs der betretenen Teilprozesse (leer auf der
  Wurzelebene) und `context.ref` die Referenz des angezeigten Teilprozesses —
  liefern Sie den Zustand für die Ebene auf dem Bildschirm.
- `merge: true` führt partielle Snapshots mit dem vorherigen Zustand zusammen,
  statt ihn zu ersetzen.
- Kommen für `staleAfterMs` keine Daten (standardmäßig drei Intervalle,
  mindestens 15 s), warnt die Statuszeile, dass die Daten veraltet sind.

## Der Reducer

Framework-unabhängig und rein, für Hosts, die den Zustand selbst halten (ein
Store, ein WebSocket):

```ts
import { reduceMonitor, emptyMonitorState, mergeSnapshot, isStale, pathEdges, statusSummary } from '@dskripchenko/flow'

let state = emptyMonitorState()
state = reduceMonitor(state, { type: 'snapshot', snapshot, at: Date.now() })            // ersetzen
state = reduceMonitor(state, { type: 'snapshot', snapshot: patch, at: Date.now(), merge: true })
state = reduceMonitor(state, { type: 'error', error: 'HTTP 503', at: Date.now() })      // failures + 1, Daten bleiben erhalten
isStale(state, Date.now(), 30_000)
pathEdges(graph, state.path)   // Kanten-IDs entlang des Pfads
statusSummary(state)           // { active: 1, error: 1, ... }
```

## Der Poller

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
poller.refresh() // sofort, bricht die laufende Anfrage ab
poller.stop()
poller.status    // 'idle' | 'running' | 'paused'
```

`visibilityPause` nimmt auch eine eigene Quelle `{ hidden(), subscribe(listener) }`
an (Tests, ein app-weiter „Pause“-Schalter).
