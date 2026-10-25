# Vue 组件

```ts
import { FlowView, FlowEditor, mountFlow, mountFlowEditor } from '@dskripchenko/flow/vue'
import '@dskripchenko/flow/style.css'
```

所有组件都构建在 `@dskripchenko/ui` 之上（按钮、开关、抽屉、面包屑、徽标、提示、菜单、
表单），并遵循它的设计令牌和主题。组件会填满自己的容器：请给它设置高度。

## FlowView

只读的流程或状态机，带实时监控、启用/禁用开关、子流程下钻和详情抽屉。

### Prop

| Prop | 类型 | 默认值 | |
|---|---|---|---|
| `graph` | `Graph` | — | 模型（根层级） |
| `state` | `MonitorSnapshot \| MonitorState` | — | 屏幕上这张图的监控状态 |
| `poll` | `{ fetch(signal, context), intervalMs?, backoff?, merge?, visibilityPause? }` | — | 改为轮询端点（[监控](monitoring.md)） |
| `staleAfterMs` | `number` | 3 个间隔，≥ 15 秒 | 过期警告 |
| `toggleable` | `boolean` | `false` | 悬停时和抽屉中的启用/禁用开关 |
| `onToggle` | `(change) => Promise \| void` | — | 持久化切换；被拒绝时回滚并弹出错误提示 |
| `subgraphs` | `Record<string, Graph>` | `{}` | 字符串 `subgraph` 引用对应的图 |
| `loadSubgraph` | `(ref, node) => Promise<Graph>` | — | 加载不在 `subgraphs` 中的引用 |
| `details` | `boolean` | `true` | 内置详情抽屉 |
| `minimap` | `boolean` | `true` | 缩略图（也支持 `v-model:minimap`） |
| `controls` | `boolean` | `true` | 缩放/适应工具条 |
| `statusBar` | `boolean` | `true` | 最近更新时间、是否过期、按状态汇总 |
| `direction` | `'LR' \| 'TB' \| 'auto'` | `meta.direction`，否则 `auto` | `auto`：横向容器用 LR，纵向容器用 TB |
| `routing` | `'spline' \| 'orthogonal'` | `'spline'` | |
| `registry` | `NodeTypeRegistry` | 内置类型 | 自定义节点类型 |
| `nodeRenderers` | `Record<type, Component>` | `{}` | 自定义节点绘制 |
| `nodeIcons` | `Record<type \| icon, Component>` | `{}` | 类型的图标 |
| `statusTones` | `Record<status, tone>` | — | `accent`、`success`、`danger`、`warning`、`info`、`neutral` |
| `locale` | `'en' \| 'ru' \| string` | `'en'` | 界面语言（同时也是 kit 的语言） |
| `labels` | `Partial<FlowLabels>` | — | 覆盖任意文本 |
| `wheel` | `'zoom' \| 'pan'` | `'zoom'` | 普通鼠标滚轮的作用（Ctrl/⌘ + 滚轮始终缩放） |
| `minZoom`、`maxZoom` | `number` | `0.15`、`2.5` | |
| `toastProvider` | `boolean` | `true` | 挂载 kit 的 toast provider；应用已有时设为 `false` |

### 事件

| 事件 | 载荷 |
|---|---|
| `select` | `{ kind, id, element, path } \| null` |
| `toggle` | `{ kind: 'node' \| 'edge', id, enabled, path }` —— 乐观地触发 |
| `toggle-error` | `(change, error)` —— `onToggle` 被拒绝；改动已回滚 |
| `navigate` | `NavigationLevel[]` —— 已进入的子流程，根在前 |
| `poll-error` | `error` |

### 插槽

- `details` —— `{ kind, element, state, path }`：抽屉中的附加内容（历史、操作）。
- `details-header` —— `{ kind, element }`：替换抽屉标题。
- `controls` —— 缩放工具条中的附加按钮。
- `empty` —— 替换空图提示。

### 暴露的方法

`fit()`、`enter(nodeId)`、`back()`、`refresh()`（立即轮询）、`select(id | null)`、`stack`。

### 启用与禁用

开启 `toggleable` 后，悬停在节点或边上时其上方会出现 kit 的开关，详情抽屉中也有一个。
改动立即生效（变暗并加删除线；被禁用节点的边也随之变暗），并调用 `onToggle`：

```ts
async function onToggle({ kind, id, enabled, path }: ToggleChange) {
  const r = await fetch(`/api/process/${kind}s/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) })
  if (!r.ok) throw new Error((await r.json()).message) // 回滚，并以该消息弹出 toast
}
```

这一覆盖状态会保留到 `graph` prop 变化为止（把更新后的模型传回来）——之后以模型为准。

### 下钻

带 `subgraph` 的节点下方有一个标记；点击它、双击节点或点击抽屉中的“打开子流程”按钮
即可打开子流程。面包屑显示返回路径（还有返回按钮和 Escape）。内联图会立即打开；
字符串引用先在 `subgraphs` 中查找，然后通过 `loadSubgraph(ref, node)` 加载（期间显示
加载指示，失败时弹出 toast）。轮询会针对该层级以 `context.path` / `context.ref` 重新开始。

### 自定义节点绘制

按类型提供一个组件，在节点的框内绘制（SVG，原点在左上角）：

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

Prop：`node`、`geometry`（`{ width, height, lines, … }`）、`state`（该节点的监控条目）、
`selected`、`disabled`、`current`、`labels`。尺寸取自注册表中的类型定义。
HTML 内容请使用 `<foreignObject>`。

### 键盘与无障碍

- 每个节点都是可聚焦的 `role="button"`，其标签包含类型、状态、计数器和“已禁用”；
  当图可切换或可编辑时，边也可以聚焦。
- Tab 在节点间移动；方向键移动到该方向上最近的节点（视图跟随焦点）。
- Enter 或 Space 选中并打开详情；Escape 关闭抽屉、清除选择，然后返回上一级子流程。
- `+` / `-` 缩放，`0` 适应画布。
- 指针：拖动背景（或 Space + 拖动）平移；滚轮或双指捏合缩放；触摸操作相同。

## mountFlow

无需自己的 Vue 应用：

```ts
import { mountFlow } from '@dskripchenko/flow/vue'

const handle = mountFlow('#flow', { graph, poll, onSelect: (s) => console.log(s) })
handle.update({ graph: nextGraph })
handle.unmount()
```

`mountFlowEditor(el, { modelValue, onChange })` 对编辑器做同样的事；
`handle.getGraph()` 返回编辑后的模型。
