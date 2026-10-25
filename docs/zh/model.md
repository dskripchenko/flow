# 模型

模型是纯 JSON，带版本号，独立于布局和监控状态。宿主原样存储它；查看器和编辑器读写的
正是这一结构。本包附带一份 [JSON Schema](../../schema/graph.schema.json)
（`@dskripchenko/flow/schema/graph.schema.json`）。

```ts
interface Graph {
  version: 1
  nodes: FlowNode[]
  edges: FlowEdge[]
  groups?: FlowGroup[]
  meta?: { title?: string; direction?: 'TB' | 'LR'; [key: string]: DataValue }
}
```

id 在节点、边和分组之间全局唯一。

## 节点

```ts
interface FlowNode {
  id: string
  type: string                 // start | end | state | task | decision | subprocess | note | custom
  label?: string
  description?: string         // 标签下方的第二行文字
  position?: { x: number; y: number } // 中心点；缺省时自动布局
  group?: string
  data?: Record<string, DataValue>    // 在详情中以键/值显示
  enabled?: boolean            // false：变暗并加删除线
  subgraph?: string | Graph    // 内联图或引用：使节点可下钻
  ports?: Port[]               // 覆盖类型的端口
}
```

| 类型 | 绘制为 | 说明 |
|---|---|---|
| `start` | 带播放图标的实心圆 | 没有入边；标签在下方 |
| `end` | 圆环 | 没有出边；标签在下方 |
| `state` | 圆角矩形 | 默认类型 |
| `task` | 带图标块的矩形 | |
| `decision` | 菱形 | |
| `subprocess` | 带子流程标记的矩形 | 可下钻 |
| `note` | 折角纸片 | 注释：不参与流程检查 |

## 边

```ts
interface FlowEdge {
  id: string
  from: string
  to: string
  fromPort?: string
  toPort?: string
  label?: string
  condition?: string           // 守卫条件；没有标签时显示
  enabled?: boolean
  kind?: 'transition' | 'association' // association：虚线、无箭头（注释连到其节点）
  data?: Record<string, DataValue>
}
```

允许出现环——状态机本来就会循环。自环（`from === to`）画在节点旁边。

## 端口

没有端口时，边连接在它与节点轮廓的交点处（矩形同一侧的多条边会沿该侧分散）。
端口则把它固定住：

```ts
interface Port { id: string; side: 'top' | 'right' | 'bottom' | 'left'; offset?: number; kind?: 'in' | 'out' | 'both'; label?: string }
```

`offset` 是沿该侧的 0…1 位置（默认 0.5）；`kind: 'in'` 只接受入边。端口取自节点的
`ports`，否则取自其类型。

## 分组

```ts
interface FlowGroup { id: string; label?: string; parent?: string }
```

节点通过 `group: 'id'` 加入分组。分组通过 `parent` 嵌套，绘制为虚线框。

## 读取与写入

```ts
import { parseGraph, stringifyGraph, emptyGraph, GraphError } from '@dskripchenko/flow'

const graph = parseGraph(jsonTextOrObject) // 抛出带 JSON pointer 的 GraphError
const text = stringifyGraph(graph)
```

`parseGraph` 填充默认值（`version: 1`、`type: 'state'`、`edges: []`），丢弃节点和边
的未知字段，递归读取内联子流程，并拒绝其他版本的模型。

## 节点类型

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

类型定义（`NodeTypeDef`）：`title`、`shape`（`rect`、`rounded`、`circle`、`ring`、
`diamond`、`note`、`pill`）、固定的 `size` 或 `minWidth`/`maxWidth`/`height`、
`ports`、`icon`（`NODE_ICONS` 中的名称，或通过 `nodeIcons` prop 传入的组件）、
`labelOutside`、`noIncoming`、`noOutgoing`、`annotation`、`drillable` 以及 `locked`
（编辑器不允许用户修改或删除此类节点）。把注册表传给组件以及
`validateGraph` / `layoutGraph`。

## 校验

```ts
import { validateGraph } from '@dskripchenko/flow'

const issues = validateGraph(graph, { registry })
// [{ severity: 'warning', code: 'unreachable', message: 'Node "x" cannot be reached from the start', target: { kind: 'node', id: 'x' } }]
```

| 代码 | 级别 | 含义 |
|---|---|---|
| `duplicate-id` | error | 某个 id 被使用了两次 |
| `unknown-node` | error | 边引用了不存在的节点 |
| `unknown-port` | error | 边使用了不存在的端口，或 `kind` 不符的端口 |
| `unknown-group`、`group-cycle` | error | 分组树损坏 |
| `unknown-type` | warning | 不在注册表中（按 state 绘制） |
| `missing-start`、`missing-end` | warning | 用 `requireStartEnd: false` 关闭 |
| `start-incoming`、`end-outgoing` | warning | 有边进入 start 或从 end 出发 |
| `unreachable` | warning | 从任何 start 都无法到达 |
| `dead-end` | warning | 步骤没有出路 |
| `empty-label` | warning | 步骤没有标签 |

错误排在前面。`issuesByElement(issues)` 按元素 id 对它们分组。

## 布局

```ts
import { layoutGraph } from '@dskripchenko/flow'

const layout = layoutGraph(graph, { direction: 'LR', routing: 'orthogonal', registry })
layout.nodes.get('new')      // { x, y, width, height, lines, descriptionLines }
layout.edges.get('e2')       // { d (SVG path), points, from, to, label? }
layout.groups, layout.bounds
```

- 分层（Sugiyama）布局负责放置没有位置的节点；它能处理环、分组和标签，结果是确定的。
- 当部分节点有位置时，这些节点保持不动；其余节点保持在布局中的相对位置，平移后与固定
  节点对齐，并避开重叠。
- `routing: 'orthogonal'`（默认）绘制带圆角的直角线段；`'spline'` 沿相同的
  通道绘制平滑、宽弧的曲线（没有布局可循时为端口之间的直接曲线）。路线在路径
  畅通时保持同一车道，只在层级之间换道，因此不会穿过其他节点，也不会穿过两端
  都不在其中的分组。
- **回边**——逆着流程的转移（重试、重发、放弃……）——走图旁边的通道（LR 时在
  下方或上方，TB 时在右侧或左侧，选择无需穿越的一侧）：从源节点出来，沿各自的
  车道（并行的回边不会共用车道），回到目标节点。正向布局在计算时不包含它们，
  因此不会留下空隙。
- 边标签放在布局预留的位置（或其车道的中间）；会遮挡节点或其他标签的标签会沿
  自身路线滑动。
- 文本用字形表测量（在 Node 中结果确定）；在浏览器中 Vue 组件传入基于 canvas 的测量器。
  传入 `measure` 可使用自己的测量器。
- `MAX_NODES`（500）和 `MAX_EDGES`（2000）限制布局规模；超出时抛出异常。
