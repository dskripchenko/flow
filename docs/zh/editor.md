# 编辑器

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { FlowEditor, type ChangeEvent } from '@dskripchenko/flow/vue'
import { fromMermaid } from '@dskripchenko/flow/mermaid'

const graph = ref(initial)
function onChange(e: ChangeEvent) {
  // e.command —— 改动内容，表示为模型根层级上的命令
  // e.local   —— 同一改动，位于其发生的层级，附带子流程路径
  // e.source  —— 'edit' | 'undo' | 'redo'
}
</script>

<template>
  <FlowEditor v-model="graph" :mermaid="fromMermaid" style="height: 720px" @change="onChange" />
</template>
```

## 用户可以做什么

- **添加** —— 从元素面板把类型拖到画布上，或点击它（放在所选节点沿流程方向的下一个位置，或视图中央——取最近的空闲网格位置——并滚动到可见处、被选中）；双击背景添加一个
  state；上下文菜单中的“在此添加”。
- **连接** —— 悬停在节点上：其各边（或端口）出现手柄。从手柄拖到另一个节点；连线会吸附
  到范围内最近的手柄，新建的转换会被选中以便填写标签。用键盘：在节点属性中选择
  “添加转换到…”。
- **重新连接 / 断开** —— 选中一个转换，把它的一个端点手柄拖到另一个节点；拖到空白处
  则删除该转换。
- **移动** —— 拖动；被拖动的节点吸附到网格（磁铁按钮可关闭吸附）。方向键按一个网格步长
  微调选中内容（Shift：五个步长）。
- **选择** —— 单击；Shift/Ctrl/⌘ + 单击追加选择；在背景上 Shift + 拖动画出框选区域；
  Ctrl/⌘+A 全选。
- **排列** —— 在属性面板或上下文菜单中对齐（左、中、右、上、中线、下）和均匀分布；
  “自动布局”重新排布全部元素（一个撤销步骤）。
- **属性** —— 标签、描述、类型、分组、启用状态、转换、子流程（引用，或可打开编辑的内联
  图）、以键/值行表示的数据（看起来像 JSON 的值——数字、布尔值、数组——按其本来类型
  存储）。对于转换：标签、条件、种类、启用状态。未选中任何内容时：图的标题和布局方向。
- **子流程** —— 打开内联子流程（标记、双击或属性面板）并就地编辑；面包屑可返回。改动以
  根层级上该子流程节点的 `updateNode` 传给宿主。
- **校验** —— “问题”标签页列出错误和警告；有问题的元素带有标记；点击某个问题会选中并
  显示其元素。问题以界面语言显示，并用元素的名称指代元素（`issue*` 标签，每个代码一个，
  接收 `IssueText`）。
- **导入 / 导出** —— “JSON / Mermaid” 菜单：把模型导出为 JSON 文件、导入 JSON、导入
  Mermaid `stateDiagram-v2` / `flowchart`（需配合 `mermaid` prop）。导入可以撤销。

## 快捷键

| 按键 | |
|---|---|
| Ctrl/⌘ + Z | 撤销 |
| Ctrl/⌘ + Shift + Z, Ctrl + Y | 重做 |
| Delete, Backspace | 删除选中内容（被删除节点的边一并删除） |
| Ctrl/⌘ + C / X / V | 复制 / 剪切 / 粘贴（粘贴的副本获得新 id） |
| Ctrl/⌘ + D | 创建副本 |
| Ctrl/⌘ + A | 全选 |
| Arrows (Shift) | 微调 |
| Enter | 选中获得焦点的元素并编辑其标签 |
| Escape | 清除选择，然后离开子流程 |
| Space + drag | 平移 |

在输入框中输入时，快捷键不生效。

## Prop

| Prop | 类型 | 默认值 | |
|---|---|---|---|
| `modelValue` | `Graph` | — | `v-model` |
| `registry` | `NodeTypeRegistry` | 内置 | 类型；`locked: true` 使类型只读 |
| `palette` | `string[]` | 全部类型 | 元素面板提供哪些类型及其顺序 |
| `readonly` | `boolean` | `false` | 仅浏览 |
| `locked` | `string[]` | `[]` | 用户不能移动、编辑或删除的节点类型（在注册表 `locked: true` 之外） |
| `snapGrid` | `number` | `20` | `0` 关闭吸附 |
| `direction`、`edgeStyle` | | | 同 FlowView |
| `nodeRenderers`、`nodeIcons` | | | 同 FlowView |
| `mermaid` | `(source) => Graph` | — | 启用“导入 Mermaid”：传入 `fromMermaid` |
| `locale`、`labels` | | `'en'` | |
| `minimap` | `boolean` | `false` | |
| `exportName` | `string` | `'process.json'` | 导出文件名 |
| `toastProvider` | `boolean` | `true` | |
| `fields` | `PropertyFields` | 全部 | 属性面板显示哪些内置字段：`{ node?, edge?, graph? }`，每项是字段键列表（见下文）；不给列表即全部，`[]` 即一个都不显示 |
| `io` | `boolean` | `true` | `false` 隐藏 JSON / Mermaid 菜单（导出与导入）以及空画布上的导入按钮 |
| `ignoreIssues` | `IssueCode[]` | `[]` | 从校验中排除的问题代码：问题标签页及其计数、元素上的标记、`validate` 事件和暴露的 `issues` |
| `toolbar` | `'top' \| 'floating'` | `'top'` | `floating`：画布左上角的紧凑图标工具栏，不含撤销和重做——宿主通过暴露的 `undo`、`redo`、`canUndo`、`canRedo` 显示自己的按钮 |

事件：`update:modelValue`、`change`（`ChangeEvent`）、`select`（id 列表）、
`validate`（问题列表，每次改动时触发）、`export`（JSON 文本）。
插槽：`toolbar`（工具栏附加内容）、`properties`（`{ selection, graph, path }`）。
暴露的方法：`undo()`、`redo()`、`canUndo`、`canRedo`、`autoLayout()`、`fit()`、`select(ids)`、`history`、`issues`。

在窄屏（小于 760 px）上，元素面板和属性面板折叠为从工具栏打开的抽屉；触屏：长按打开
上下文菜单。

对自动布局的图进行第一次编辑时，所有节点会固定在当前绘制的位置（在同一撤销步骤中），
因此不会发生跳动。

## 作为领域编辑器嵌入

当图描述的是宿主自己的东西——节点是状态，边是状态之间的转换——宿主通常带来自己的字段，
而通用字段需要得更少。三个 prop 收窄编辑器，`properties` 插槽在选中内容下补充其余部分：

```vue
<FlowEditor
  v-model="graph"
  :palette="['start', 'state', 'end']"
  :locked="['start']"
  :fields="{ node: ['label', 'transitions'], edge: ['label'], graph: ['title'] }"
  :io="false"
  :ignore-issues="['dead-end']"
>
  <template #properties="{ selection, graph }">
    <StateSettings v-if="selection.length === 1" :id="selection[0]" :graph="graph" />
  </template>
</FlowEditor>
```

字段键（`NODE_FIELDS`、`EDGE_FIELDS`、`GRAPH_FIELDS`；类型 `NodeField`、`EdgeField`、
`GraphField`、`PropertyFields`，来自 `@dskripchenko/flow/vue`）：

| 选中内容 | 键 |
|---|---|
| 一个节点 | `heading`（类型和 id）、`label`、`description`、`type`、`join`（带区域的类型）、`group`（图中有分组时）、`enabled`、`transitions`（出边列表和“添加转换到…”）、`subgraph`、`data` |
| 一条边 | `heading`（类型、id 和路径）、`label`、`condition`、`kind`、`trigger`、`enabled`、`data` |
| 无 | `title`、`direction` |

删除以及多个节点的对齐工具属于操作，始终保留。没有 `enabled` 时，上下文菜单也不提供启用或停用。
宿主的字段保存在它自己的存储中（按元素 id），或通过 `v-model` 写入 `data`——从外部设置的模型会重置撤销历史。

## 命令与历史（核心）

每个改动都是一个 `Command`，由纯函数应用——宿主可以重放、记录或发送它，而不必发送整个
模型：

```ts
import { applyCommand, History, describeCommand } from '@dskripchenko/flow'

type Command =
  | { type: 'addNodes'; nodes; edges? }
  | { type: 'removeElements'; ids }            // 节点、边、分组；被删除节点的边一并删除
  | { type: 'updateNode' | 'updateEdge' | 'updateGroup'; id; patch } // null 删除字段
  | { type: 'moveNodes'; moves: { id, position }[] }
  | { type: 'addEdge'; edge }
  | { type: 'setEnabled'; kind: 'node' | 'edge'; id; enabled }
  | { type: 'addGroup'; group }
  | { type: 'updateMeta'; patch }
  | { type: 'replace'; graph }
  | { type: 'batch'; commands }

const history = new History(graph, { limit: 200, mergeWindowMs: 800 })
history.execute({ type: 'updateNode', id: 'a', patch: { label: 'Paid' } }, 'label:a') // 连续相同的 key 会合并
history.undo()
history.redo()
```

辅助函数：`copyFragment` / `pasteFragment`（新 id，仅保留内部边）、
`alignNodes`、`distributeNodes`、`layoutCommand(layoutGraph(g, { ignorePositions: true }))`、
`nextId(graph, prefix)`, `findFreeSpot(boxes, size, near, { grid })`、`snap(point, grid)`。
