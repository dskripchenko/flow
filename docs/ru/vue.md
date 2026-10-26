# Компоненты Vue

```ts
import { FlowView, FlowEditor, mountFlow, mountFlowEditor } from '@dskripchenko/flow/vue'
import '@dskripchenko/flow/style.css'
```

Все компоненты построены на `@dskripchenko/ui` (кнопки, переключатель,
выдвижная панель, хлебные крошки, бейджи, подсказки, меню, формы) и следуют
его токенам и темам. Компонент заполняет свой блок: задайте ему высоту.

## FlowView

Процесс или машина состояний только для чтения: живой мониторинг,
переключатели включения/выключения, провал в подпроцессы и панель деталей.

### Свойства

| Свойство | Тип | По умолчанию | |
|---|---|---|---|
| `graph` | `Graph` | — | модель (корневой уровень) |
| `state` | `MonitorSnapshot \| MonitorState` | — | мониторинг для графа на экране; вместе с `poll` — начальное значение, которое заменяют опрошенные снимки |
| `poll` | `{ fetch(signal, context), intervalMs?, backoff?, merge?, visibilityPause? }` | — | опрашивать эндпоинт ([мониторинг](monitoring.md)) |
| `pollParams` | `unknown` | — | передаётся в `poll.fetch` как `context.params` (id экземпляра, фильтр); изменение сразу перезапускает опрос |
| `staleAfterMs` | `number` | 3 интервала, ≥ 15 с | предупреждение об устаревании |
| `toggleable` | `boolean` | `false` | переключатели при наведении и в панели деталей |
| `persistToggle` | `(change) => Promise \| void` | — | сохраняет переключение; отказ откатывает его и показывает тост с ошибкой |
| `onToggle` | `(change) => Promise \| void` | — | **устарело**: псевдоним `persistToggle`, будет удалён в 1.1 (см. ниже) |
| `subgraphs` | `Record<string, Graph>` | `{}` | графы для строковых ссылок `subgraph` |
| `loadSubgraph` | `(ref, node) => Promise<Graph>` | — | загружает ссылку, которой нет в `subgraphs` |
| `details` | `boolean` | `true` | встроенная панель деталей |
| `minimap` | `boolean` | `true` | миникарта (также `v-model:minimap`) |
| `controls` | `boolean` | `true` | панель масштаба и вписывания |
| `statusBar` | `boolean` | `true` | последнее обновление, устаревание, сводка по статусам |
| `direction` | `'LR' \| 'TB' \| 'auto'` | `meta.direction`, иначе `auto` | `auto`: LR в горизонтальном блоке, TB в вертикальном |
| `edgeStyle` | `'orthogonal' \| 'smooth'` | `'orthogonal'` | прямые углы или те же маршруты плавными кривыми |
| `registry` | `NodeTypeRegistry` | встроенные типы | свои типы узлов |
| `nodeRenderers` | `Record<type, Component>` | `{}` | своя отрисовка узлов |
| `nodeIcons` | `Record<type \| icon, Component>` | `{}` | иконки для типов |
| `statusTones` | `Record<status, tone>` | — | `accent`, `success`, `danger`, `warning`, `info`, `neutral` |
| `locale` | `'en' \| 'ru' \| string` | локаль кита у хоста, иначе `'en'` | язык интерфейса. Не задан — следует родительскому `UidLocaleProvider` (ru-* → русский) и не трогает локаль кита хоста; задан — задаёт и локаль кита внутри |
| `labels` | `Partial<FlowLabels>` | — | замена любой строки |
| `wheel` | `'zoom' \| 'pan'` | `'zoom'` | что делает обычное колесо мыши (Ctrl/⌘ + колесо всегда масштабирует) |
| `minZoom`, `maxZoom` | `number` | `0.15`, `2.5` | |
| `toastProvider` | `boolean` | `true` | монтирует провайдер тостов кита; `false`, если в приложении он уже есть |

### События

| Событие | Данные |
|---|---|
| `select` | `{ kind, id, element, path } \| null` |
| `toggle` | `(change, result)` — один раз на переключение, после завершения `persistToggle` (без него — сразу); `result` — `{ ok: true }` или `{ ok: false, error, rolledBack }` |
| `toggle-error` | `(change, error)` — `persistToggle` отказал; изменение откачено |
| `navigate` | `NavigationLevel[]` — подпроцессы, в которые вошли, начиная с корня |
| `poll-error` | `error` |

### Слоты

- `details` — `{ kind, element, state, path }`: дополнительное содержимое
  панели деталей (история, действия).
- `details-header` — `{ kind, element }`: заменяет заголовок панели.
- `controls` — дополнительные кнопки на панели масштаба.
- `empty` — заменяет сообщение о пустом графе.

### Доступно снаружи

`fit()`, `enter(nodeId)`, `back()`, `refresh()` (опросить сейчас), `select(id | null)`, `stack`.

### Включение и выключение

С `toggleable` при наведении на узел или переход над ним появляется
переключатель кита; ещё один есть в панели деталей. Изменение применяется
сразу (приглушение, зачёркивание; переходы выключенного узла приглушаются
вместе с ним), и вызывается `persistToggle`:

```ts
async function persistToggle({ kind, id, enabled, path }: ToggleChange) {
  const r = await fetch(`/api/process/${kind}s/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) })
  if (!r.ok) throw new Error((await r.json()).message) // откат, тост с сообщением
}
```

Передайте её как `:persist-toggle="persistToggle"`. Она вызывается ровно один
раз на переключение; событие `toggle` приходит после её завершения.

> **Устарело: `onToggle`.** До 1.0.2 функцией сохранения было свойство
> `onToggle`, но это же обработчик, который Vue вызывает для события `toggle`,
> поэтому она выполнялась дважды на переключение. До 1.1 функция, переданная
> как `onToggle` (или как слушатель `@toggle`) без `persistToggle`, по-прежнему
> считается функцией сохранения: вызывается один раз, отказ откатывает
> переключение; событие `toggle` при этом не отправляется. Переходите на
> `persistToggle`; с 1.1 `onToggle` — просто слушатель события `toggle`.

Переопределение держится, пока не изменится свойство `graph` (передайте
обновлённую модель обратно), — дальше решает модель.

### Провал в подпроцесс

У узла с `subgraph` под ним появляется маркер; нажатие на него, двойной клик
по узлу или кнопка «Открыть подпроцесс» в панели деталей открывают
подпроцесс. Хлебные крошки показывают путь назад (а также кнопка «назад» и
Escape). Встроенный граф открывается сразу; строковая ссылка ищется в
`subgraphs`, затем загружается через `loadSubgraph(ref, node)` (пока идёт
загрузка — спиннер, при ошибке — тост). Опрос перезапускается для уровня с
`context.path` / `context.ref`.

### Своя отрисовка узлов

Для каждого типа — компонент, который рисует внутри блока узла (SVG, начало
координат в левом верхнем углу):

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

Свойства: `node`, `geometry` (`{ width, height, lines, … }`), `state` (запись
мониторинга узла), `selected`, `disabled`, `current`, `labels`. Размер берётся
из определения типа в реестре. Для HTML-содержимого используйте
`<foreignObject>`.

### Первый вид

Граф открывается в масштабе 100 % на важном шаге — текущем шаге экземпляра,
иначе на активном, иначе на начале, — если только весь граф не помещается при
85 % и больше: тогда он показывается целиком. Мельче граф не открывается;
обзор дают кнопка «вписать» и миникарта. При вписывании и центрировании узлы
не уходят под строку статуса, хлебные крошки, панель управления и миникарту, а
перед началом и после конца не остаётся пустого места.

### Клавиатура и доступность

- Каждый узел — фокусируемый `role="button"` с подписью, в которой есть его
  тип, статус, счётчики и «выключен»; переходы фокусируемы, когда граф
  переключаемый или редактируемый.
- Tab переходит по узлам; стрелки — к ближайшему узлу в этом направлении
  (вид следует за фокусом).
- Enter или Space выделяет и открывает детали; Escape закрывает панель,
  снимает выделение, затем поднимается из подпроцесса.
- `+` / `-` масштабируют, `0` вписывает.
- Указатель: перетаскивание фона (или Space + перетаскивание) сдвигает вид;
  колесо или щипок масштабирует; на тач-экранах всё так же.

## mountFlow

Без собственного Vue-приложения:

```ts
import { mountFlow } from '@dskripchenko/flow/vue'

const handle = mountFlow('#flow', { graph, poll, onSelect: (s) => console.log(s) })
handle.update({ graph: nextGraph })
handle.unmount()
```

`mountFlowEditor(el, { modelValue, onChange })` делает то же для редактора;
`handle.getGraph()` возвращает отредактированную модель.

Внутри Vue-приложения хоста передайте его контекст — тогда провайдеры хоста
(локаль и тема кита, i18n, роутер) доходят до компонента; он рендерится в
элемент без отдельного приложения (`handle.app` не определён):

```ts
import { getCurrentInstance } from 'vue'

const appContext = getCurrentInstance()!.appContext // или app._context
const handle = mountFlow(el, { graph, appContext })
```
