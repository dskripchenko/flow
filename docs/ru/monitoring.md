# Мониторинг и опрос

Состояние мониторинга хранится отдельно от модели: один и тот же граф
рисуется со своим состоянием для каждого экземпляра или со сводными
счётчиками по всем сразу.

## Снимок

Что возвращает эндпоинт мониторинга ([JSON Schema](../../schema/snapshot.schema.json)):

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

Все поля необязательны.

| Поле | Как рисуется |
|---|---|
| `nodes[id].status` | `active`: акцентный контур и пульсирующий ореол; `done`: зелёный контур и галочка; `error`: красный контур и заливка; `waiting`: янтарный пунктирный контур; `skipped`: приглушённо. Остальные строки нейтральны, если их не сопоставить через `statusTones`. |
| `nodes[id].count` | счётчик в углу узла |
| `nodes[id].badge` | бейдж в углу вместо значка статуса (например, число ошибок) |
| `nodes[id].message` | строка в панели деталей |
| `edges[id].count` | счётчик на подписи перехода |
| `edges[id].traversed` | зелёная линия |
| `path` | переходы между соседними узлами подсвечены, с бегущим пунктиром |
| `current` | положение экземпляра: ореол; просмотр один раз прокручивает к нему |

Пульсация и бегущий пунктир останавливаются при `prefers-reduced-motion`.

## Передача состояния

```vue
<FlowView :graph="graph" :state="snapshot" />
```

`state` принимает снимок или свёрнутый `MonitorState`. Снимок, переданный
так, получает отметку времени при поступлении, поэтому «Обновлено N с назад»
и предупреждение об устаревании работают.

## Опрос

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

- Один запрос за раз; следующий планируется после завершения предыдущего.
- Запрос в полёте прерывается, когда компонент размонтируется, меняется
  уровень (провал в подпроцесс) или опрос останавливается, — передавайте
  `signal` в `fetch`.
- Пока вкладка скрыта, опрос на паузе; при возврате запрос уходит сразу.
- После ошибки задержка удваивается до 60 с (`backoff: { factor, maxMs }` или
  `false`); строка состояния показывает ошибку и кнопку обновления.
- `context.path` — идентификаторы узлов подпроцессов, в которые вошли (на
  корне пусто), `context.ref` — ссылка показанного подпроцесса; возвращайте
  состояние для уровня, который на экране.
- `merge: true` сливает частичные снимки с предыдущим состоянием вместо
  замены.
- Если данных нет дольше `staleAfterMs` (по умолчанию три интервала, но не
  меньше 15 с), строка состояния предупреждает, что данные устарели.

## Редьюсер

Чистый и не зависящий от фреймворка — для хостов, которые сами хранят
состояние (стор, WebSocket):

```ts
import { reduceMonitor, emptyMonitorState, mergeSnapshot, isStale, pathEdges, statusSummary } from '@dskripchenko/flow'

let state = emptyMonitorState()
state = reduceMonitor(state, { type: 'snapshot', snapshot, at: Date.now() })            // замена
state = reduceMonitor(state, { type: 'snapshot', snapshot: patch, at: Date.now(), merge: true })
state = reduceMonitor(state, { type: 'error', error: 'HTTP 503', at: Date.now() })      // failures + 1, данные сохраняются
isStale(state, Date.now(), 30_000)
pathEdges(graph, state.path)   // идентификаторы переходов вдоль пути
statusSummary(state)           // { active: 1, error: 1, ... }
```

## Поллер

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
poller.refresh() // сейчас, прерывая запрос в полёте
poller.stop()
poller.status    // 'idle' | 'running' | 'paused'
```

`visibilityPause` принимает и свой источник `{ hidden(), subscribe(listener) }`
(тесты, переключатель «пауза» на уровне приложения).
