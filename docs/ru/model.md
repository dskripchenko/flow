# Модель

Модель — обычный версионированный JSON, независимый от раскладки и от
состояния мониторинга. Хост хранит её как есть; просмотр и редактор читают и
пишут ровно эту структуру. Вместе с пакетом поставляется
[JSON Schema](../../schema/graph.schema.json)
(`@dskripchenko/flow/schema/graph.schema.json`).

```ts
interface Graph {
  version: 1
  nodes: FlowNode[]
  edges: FlowEdge[]
  groups?: FlowGroup[]
  meta?: { title?: string; direction?: 'TB' | 'LR'; [key: string]: DataValue }
}
```

Идентификаторы уникальны среди всех узлов, переходов и групп.

## Узлы

```ts
interface FlowNode {
  id: string
  type: string                 // start | end | state | task | decision | subprocess | note | custom
  label?: string
  description?: string         // вторая строка под подписью
  position?: { x: number; y: number } // центр; если не задан, узел раскладывается автоматически
  group?: string
  data?: Record<string, DataValue>    // показываются как ключ/значение в деталях
  enabled?: boolean            // false: рисуется приглушённым и зачёркнутым
  subgraph?: string | Graph    // встроенный граф или ссылка: в узел можно провалиться
  ports?: Port[]               // переопределяет порты типа
}
```

| Тип | Как рисуется | Примечания |
|---|---|---|
| `start` | закрашенный круг со значком «play» | без входящих переходов; подпись под ним |
| `end` | кольцо | без исходящих переходов; подпись под ним |
| `state` | скруглённый прямоугольник | тип по умолчанию |
| `task` | прямоугольник с плашкой-иконкой | |
| `decision` | ромб | |
| `subprocess` | прямоугольник с маркером подпроцесса | можно провалиться |
| `note` | лист с загнутым углом | аннотация: не участвует в проверках потока |

## Переходы

```ts
interface FlowEdge {
  id: string
  from: string
  to: string
  fromPort?: string
  toPort?: string
  label?: string
  condition?: string           // условие; показывается, если нет подписи
  enabled?: boolean
  kind?: 'transition' | 'association' // association: пунктир без стрелки (заметка к своему узлу)
  data?: Record<string, DataValue>
}
```

Циклы допустимы — машины состояний зацикливаются. Петля (`from === to`)
рисуется рядом со своим узлом.

## Порты

Без портов переход крепится там, где встречает контур узла (несколько
переходов на одной стороне прямоугольника распределяются вдоль неё). Порт
закрепляет точку:

```ts
interface Port { id: string; side: 'top' | 'right' | 'bottom' | 'left'; offset?: number; kind?: 'in' | 'out' | 'both'; label?: string }
```

`offset` — положение вдоль стороны, 0…1 (по умолчанию 0.5); `kind: 'in'`
принимает только входящие переходы. Порты берутся из `ports` узла, иначе из
его типа.

## Группы

```ts
interface FlowGroup { id: string; label?: string; parent?: string }
```

Узел входит в группу через `group: 'id'`. Группы вкладываются друг в друга
через `parent` и рисуются пунктирными рамками.

## Чтение и запись

```ts
import { parseGraph, stringifyGraph, emptyGraph, GraphError } from '@dskripchenko/flow'

const graph = parseGraph(jsonTextOrObject) // бросает GraphError с JSON-указателем
const text = stringifyGraph(graph)
```

`parseGraph` подставляет значения по умолчанию (`version: 1`, `type: 'state'`,
`edges: []`), отбрасывает неизвестные поля узлов и переходов, рекурсивно
читает встроенные подпроцессы и отказывается от других версий модели.

## Типы узлов

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

Определение типа (`NodeTypeDef`): `title`, `shape` (`rect`, `rounded`,
`circle`, `ring`, `diamond`, `note`, `pill`), фиксированный `size` или
`minWidth`/`maxWidth`/`height`, `ports`, `icon` (имя из `NODE_ICONS` или
компонент через свойство `nodeIcons`), `labelOutside`, `noIncoming`,
`noOutgoing`, `annotation`, `drillable` и `locked` (редактор не даёт менять и
удалять такие узлы). Передайте реестр в компоненты и в
`validateGraph` / `layoutGraph`.

## Проверка

```ts
import { validateGraph } from '@dskripchenko/flow'

const issues = validateGraph(graph, { registry })
// [{ severity: 'warning', code: 'unreachable', message: 'Node "x" cannot be reached from the start', target: { kind: 'node', id: 'x' } }]
```

| Код | Уровень | Значение |
|---|---|---|
| `duplicate-id` | error | идентификатор использован дважды |
| `unknown-node` | error | переход ссылается на несуществующий узел |
| `unknown-port` | error | переход использует несуществующий порт или порт не того `kind` |
| `unknown-group`, `group-cycle` | error | сломанное дерево групп |
| `unknown-type` | warning | типа нет в реестре (рисуется как state) |
| `missing-start`, `missing-end` | warning | отключается через `requireStartEnd: false` |
| `start-incoming`, `end-outgoing` | warning | переход в start или из end |
| `unreachable` | warning | узел недостижим ни из одного start |
| `dead-end` | warning | шаг, из которого нет выхода |
| `empty-label` | warning | шаг без подписи |

Ошибки идут первыми. `issuesByElement(issues)` группирует их по
идентификатору элемента.

## Раскладка

```ts
import { layoutGraph } from '@dskripchenko/flow'

const layout = layoutGraph(graph, { direction: 'LR', routing: 'spline', registry })
layout.nodes.get('new')      // { x, y, width, height, lines, descriptionLines }
layout.edges.get('e2')       // { d (SVG-путь), points, from, to, label? }
layout.groups, layout.bounds
```

- Узлы без позиций расставляет послойная раскладка (Сугияма); она
  справляется с циклами, группами и подписями и детерминирована.
- Если у части узлов есть позиции, они остаются на месте; остальные сохраняют
  своё положение относительно раскладки, сдвигаются, чтобы выровняться с
  закреплёнными, и разводятся при наложении.
- `routing: 'spline'` рисует плавные кривые (через изгибы раскладки);
  `'orthogonal'` — отрезки под прямым углом со скруглёнными углами.
- Текст измеряется по таблице глифов (детерминированно в Node); в браузере
  компоненты Vue передают измеритель на canvas. Свой можно передать через
  `measure`.
- `MAX_NODES` (500) и `MAX_EDGES` (2000) ограничивают раскладку; сверх них она
  бросает исключение.
