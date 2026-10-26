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
| `state` | `MonitorSnapshot \| MonitorState` | — | 屏幕上这张图的监控状态；与 `poll` 同用时作为初始值，之后被轮询到的快照替换 |
| `poll` | `{ fetch(signal, context), intervalMs?, backoff?, merge?, visibilityPause? }` | — | 改为轮询端点（[监控](monitoring.md)） |
| `pollParams` | `unknown` | — | 作为 `context.params` 传给 `poll.fetch`（实例 id、过滤条件）；变化时立即重启轮询 |
| `staleAfterMs` | `number` | 3 个间隔，≥ 15 秒 | 过期警告 |
| `toggleable` | `boolean` | `false` | 悬停时和抽屉中的启用/禁用开关 |
| `persistToggle` | `(change) => Promise \| void` | — | 持久化切换；被拒绝时回滚并弹出错误提示 |
| `onToggle` | `(change) => Promise \| void` | — | **已弃用**：`persistToggle` 的别名，将在 2.0 中移除（见下文） |
| `subgraphs` | `Record<string, Graph>` | `{}` | 字符串 `subgraph` 引用对应的图 |
| `loadSubgraph` | `(ref, node) => Promise<Graph>` | — | 加载不在 `subgraphs` 中的引用 |
| `details` | `boolean` | `true` | 内置详情抽屉 |
| `minimap` | `boolean` | `true` | 缩略图（也支持 `v-model:minimap`） |
| `controls` | `boolean` | `true` | 缩放/适应工具条 |
| `statusBar` | `boolean` | `true` | 最近更新时间、是否过期、按状态汇总 |
| `direction` | `'LR' \| 'TB' \| 'auto'` | `meta.direction`，否则 `auto` | `auto`：横向容器用 LR，纵向容器用 TB |
| `edgeStyle` | `'orthogonal' \| 'smooth'` | `'orthogonal'` | 直角，或用平滑曲线绘制相同路线 |
| `registry` | `NodeTypeRegistry` | 内置类型 | 自定义节点类型 |
| `nodeRenderers` | `Record<type, Component>` | `{}` | 自定义节点绘制 |
| `nodeIcons` | `Record<type \| icon, Component>` | `{}` | 类型的图标 |
| `statusTones` | `Record<status, tone>` | — | `accent`、`success`、`danger`、`warning`、`info`、`neutral` |
| `locale` | `'en' \| 'ru' \| string` | 宿主的 kit 语言，否则 `'en'` | 界面语言。未设置：跟随上层 `UidLocaleProvider`（ru-* → 俄语），不覆盖宿主的 kit 语言；设置时：同时设置组件内部的 kit 语言 |
| `labels` | `Partial<FlowLabels>` | — | 覆盖任意文本 |
| `wheel` | `'zoom' \| 'pan'` | `'zoom'` | 普通鼠标滚轮的作用（Ctrl/⌘ + 滚轮始终缩放） |
| `minZoom`、`maxZoom` | `number` | `0.15`、`2.5` | |
| `toastProvider` | `boolean` | `true` | 挂载 kit 的 toast provider；应用已有时设为 `false` |

### 事件

| 事件 | 载荷 |
|---|---|
| `select` | `{ kind, id, element, path } \| null` |
| `toggle` | `(change, result)` —— 每次切换触发一次，在 `persistToggle` 完成之后（没有它时立即触发）；`result` 为 `{ ok: true }` 或 `{ ok: false, error, rolledBack }` |
| `toggle-error` | `(change, error)` —— `persistToggle` 被拒绝；改动已回滚 |
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
改动立即生效（变暗并加删除线；被禁用节点的边也随之变暗），并调用 `persistToggle`：

```ts
async function persistToggle({ kind, id, enabled, path }: ToggleChange) {
  const r = await fetch(`/api/process/${kind}s/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) })
  if (!r.ok) throw new Error((await r.json()).message) // 回滚，并以该消息弹出 toast
}
```

以 `:persist-toggle="persistToggle"` 绑定。每次切换恰好调用一次；完成后再触发
`toggle` 事件。

> **已弃用：`onToggle`。** 1.0.2 之前持久化函数是 `onToggle` prop，而它同时也是
> Vue 为 `toggle` 事件调用的处理函数，因此每次切换会执行两次。在 2.0 之前，若未提供
> `persistToggle`，作为 `onToggle`（或 `@toggle` 监听器）传入的函数仍被视为持久化
> 函数：只调用一次，被拒绝时回滚；此时不再触发 `toggle` 事件。请改用
> `persistToggle`；从 2.0 起 `onToggle` 只是 `toggle` 事件的监听器。

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

### 初始视图

图以 100 % 打开并定位到关键步骤——实例的当前步骤，否则是活动步骤，否则是开始
节点——除非整个图在 85 % 或更大比例下能完整放下，这时整体显示。初始缩放不会更
小；概览由“适应视图”按钮和小地图提供。适应和居中时节点不会被状态栏、面包屑、
控制栏和小地图遮挡，起点之前和终点之后也不会留出空白。

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

在宿主 Vue 应用内部，传入它的上下文，宿主的 provider（组件库的语言和主题、
i18n、路由）就能作用到组件；组件直接渲染进元素，不再创建单独的应用
（`handle.app` 为 undefined）：

```ts
import { getCurrentInstance } from 'vue'

const appContext = getCurrentInstance()!.appContext // 或 app._context
const handle = mountFlow(el, { graph, appContext })
```
