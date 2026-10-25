# 快速上手

## 安装

```bash
npm install @dskripchenko/flow
```

本包有三个入口：

- `@dskripchenko/flow` —— 核心：模型、校验、布局、监控状态、轮询器和编辑命令。
  纯 TypeScript，没有任何依赖，也不依赖 DOM；可在浏览器、Node 20+ 和 worker 中运行。
- `@dskripchenko/flow/vue` —— `FlowView`（查看器与监控）和 `FlowEditor`。
  它们需要 Vue 3.4+ 和 [`@dskripchenko/ui`](https://github.com/dskripchenko/ui)
  1.14+，二者声明为可选的 peer 依赖。
- `@dskripchenko/flow/mermaid` —— `fromMermaid()`，从 Mermaid 的
  `stateDiagram-v2` 或 `flowchart` 生成模型。它需要
  [`@dskripchenko/diagrams`](https://github.com/dskripchenko/diagrams) 1.1+
  （同样是可选的 peer 依赖）；其他入口都不会引入它。

```bash
npm install vue @dskripchenko/ui            # 用于组件
npm install @dskripchenko/diagrams          # 用于 Mermaid 导入
```

对于不经过构建步骤的页面，还有一个独立包，内含 Vue、组件库（kit）和样式——见
[独立页面](standalone.md)。

## 样式

在应用入口处一次性引入 kit 的样式和本包的样式：

```ts
import '@dskripchenko/ui/styles/all.css'
import '@dskripchenko/flow/style.css'
```

组件使用 kit 的设计令牌（`--uid-*`），因此浅色和深色主题跟随 `<html>` 上 kit 的
`data-theme`。

## 第一张图

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

没有 `position` 的节点会自动布局（分层布局：横屏时从左到右，竖屏时从上到下）。
请给组件设置高度：它会填满自己的容器。

## 实时状态

把查看器指向一个监控端点，它就会轮询，并高亮当前步骤、当前实例的路径、计数器和错误：

```vue
<FlowView
  :graph="graph"
  :poll="{ intervalMs: 5000, fetch: (signal) => fetch('/api/orders/42/state', { signal }).then((r) => r.json()) }"
/>
```

端点返回一个[监控快照](monitoring.md#快照)。

## 编辑

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

## 下一步

- [模型](model.md) —— 节点、边、分组、端口、类型、校验、布局。
- [监控与轮询](monitoring.md) —— 快照、归约器（reducer）、轮询器。
- [Vue 组件](vue.md) —— `FlowView`：prop、事件、插槽、自定义节点。
- [编辑器](editor.md) —— `FlowEditor`、命令、撤销、快捷键。
- [宿主集成](integration.md) —— 后端需要实现的 JSON 约定。
- [独立页面](standalone.md) —— 一个 `<script>`，无需构建。
