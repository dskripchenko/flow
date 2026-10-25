# Начало работы

## Установка

```bash
npm install @dskripchenko/flow
```

У пакета три точки входа:

- `@dskripchenko/flow` — ядро: модель, проверка, раскладка, состояние
  мониторинга, поллер и команды редактирования. Чистый TypeScript без
  зависимостей и без DOM; работает в браузере, в Node 20+ и в воркере.
- `@dskripchenko/flow/vue` — `FlowView` (просмотр и мониторинг) и `FlowEditor`.
  Им нужны Vue 3.4+ и [`@dskripchenko/ui`](https://github.com/dskripchenko/ui)
  1.14+, объявленные как необязательные peer-зависимости.
- `@dskripchenko/flow/mermaid` — `fromMermaid()`: модель из Mermaid
  `stateDiagram-v2` или `flowchart`. Нужен
  [`@dskripchenko/diagrams`](https://github.com/dskripchenko/diagrams) 1.1+
  (тоже необязательная peer-зависимость); больше никто его не импортирует.

```bash
npm install vue @dskripchenko/ui            # для компонентов
npm install @dskripchenko/diagrams          # для импорта Mermaid
```

Для страницы без шага сборки есть отдельная сборка, внутри которой Vue, кит
и стили, — см. [Без сборки](standalone.md).

## Стили

Подключите стили кита и пакета один раз, в точке входа приложения:

```ts
import '@dskripchenko/ui/styles/all.css'
import '@dskripchenko/flow/style.css'
```

Компоненты используют токены кита (`--uid-*`), поэтому светлая и тёмная темы
следуют за `data-theme` кита на `<html>`.

## Первый граф

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

Узлы без `position` раскладываются автоматически (послойная раскладка: слева
направо на горизонтальном экране и сверху вниз на вертикальном). Задайте
компоненту высоту: он заполняет свой блок.

## Живое состояние

Укажите просмотру эндпоинт мониторинга — он будет опрашивать его и подсвечивать
активный шаг, путь текущего экземпляра, счётчики и ошибки:

```vue
<FlowView
  :graph="graph"
  :poll="{ intervalMs: 5000, fetch: (signal) => fetch('/api/orders/42/state', { signal }).then((r) => r.json()) }"
/>
```

Эндпоинт возвращает [снимок мониторинга](monitoring.md#снимок).

## Редактирование

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

## Дальше

- [Модель](model.md) — узлы, переходы, группы, порты, типы, проверка, раскладка.
- [Мониторинг и опрос](monitoring.md) — снимок, редьюсер, поллер.
- [Компоненты Vue](vue.md) — `FlowView`: свойства, события, слоты, свои узлы.
- [Редактор](editor.md) — `FlowEditor`, команды, отмена, горячие клавиши.
- [Интеграция с хостом](integration.md) — JSON-контракты, которые реализует бэкенд.
- [Без сборки](standalone.md) — один `<script>`, без сборки.
