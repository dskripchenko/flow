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

- **添加** —— 从元素面板把类型拖到画布上，或点击它（落在视图中央）；双击背景添加一个
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
  显示其元素。
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
| `snapGrid` | `number` | `20` | `0` 关闭吸附 |
| `direction`、`routing` | | | 同 FlowView |
| `nodeRenderers`、`nodeIcons` | | | 同 FlowView |
| `mermaid` | `(source) => Graph` | — | 启用“导入 Mermaid”：传入 `fromMermaid` |
| `locale`、`labels` | | `'en'` | |
| `minimap` | `boolean` | `false` | |
| `exportName` | `string` | `'process.json'` | 导出文件名 |
| `toastProvider` | `boolean` | `true` | |

事件：`update:modelValue`、`change`（`ChangeEvent`）、`select`（id 列表）、
`validate`（问题列表，每次改动时触发）、`export`（JSON 文本）。
插槽：`toolbar`（工具栏附加内容）、`properties`（`{ selection, graph, path }`）。
暴露的方法：`undo()`、`redo()`、`autoLayout()`、`fit()`、`select(ids)`、`history`、`issues`。

在窄屏（小于 760 px）上，元素面板和属性面板折叠为从工具栏打开的抽屉；触屏：长按打开
上下文菜单。

对自动布局的图进行第一次编辑时，所有节点会固定在当前绘制的位置（在同一撤销步骤中），
因此不会发生跳动。

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
`nextId(graph, prefix)`、`snap(point, grid)`。
