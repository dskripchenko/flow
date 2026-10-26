# 宿主集成

后端（或 laravel-admin 这样的管理面板）为展示、监控和编辑流程需要实现的内容。所有载荷
都是 JSON。

## 模型

原样存储——`GET` 返回它，编辑器的 `v-model` / `change` 产出它。
Schema：`@dskripchenko/flow/schema/graph.schema.json`（JSON Schema 2020-12）。
在服务器上用任意 JSON Schema 校验器校验，然后执行 `validateGraph` 的语义检查（相同规则
也可以在服务端重新实现：id 唯一、边连接已存在的节点、端口的 kind 正确）。

位置是可选的。在服务器上编写、没有位置的流程会在客户端布局；在编辑器中第一次编辑时会
保存位置。

## 监控快照

`GET /…/state` → 一个快照
（`@dskripchenko/flow/schema/snapshot.schema.json`）：

```json
{
  "nodes": { "<nodeId>": { "status": "active|done|error|waiting|skipped|<custom>", "count": 3, "badge": 2, "message": "…", "updatedAt": "ISO or ms" } },
  "edges": { "<edgeId>": { "count": 10, "traversed": true } },
  "path": ["<nodeId>", "…"],
  "current": ["<nodeId>"],
  "updatedAt": "ISO or ms"
}
```

- 针对单个实例：沿其历史的状态、`path` 和 `current`。
- 针对流程总览：每个节点/边的 `count`（处于各状态的实例数），出问题的地方用
  `status: "error"` 和 `badge` 标出。
- 下钻时，查看器传入 `context.path`（已进入的子流程的节点 id）和 `context.ref`
  （子流程引用）；请返回该层级的状态。HTTP 错误请以非 2xx 状态码响应：查看器会显示错误、
  保留最后的数据并退避重试。
- 服务器渲染的第一份快照放在 `state` 中；设置了 `poll` 时，轮询到的快照会替换它
  ——第一次请求之前也不会空白。
- 宿主参数（屏幕上的实例、过滤条件）放在 `pollParams` 中；它们作为
  `context.params` 传给 `fetch`，变化时立即重启轮询（旧数据被丢弃，除非随变化
  一起传入了新的 `state`）。公开的 `refresh()` 会立即轮询。

## 切换

查看器在每次切换时调用一次 `persistToggle(change)`；把它发送到服务器：

```json
{ "kind": "node", "id": "cancelled", "enabled": false, "path": [] }
```

`path` 是从根开始的子流程节点 id（在根层级为空）。拒绝（非 2xx，在 `persistToggle` 中抛出
异常）即可让开关回滚；错误消息会显示在 toast 中。之后把更新后的模型作为 `graph` 传入
（或保持不变：乐观状态会保留到 `graph` 变化为止）。

`onToggle` 是 `persistToggle` 的已弃用名称（保留到 2.0）：它同样只调用一次，但请使用
`persistToggle` —— `onToggle` 是 `toggle` 事件的处理函数，该事件在持久化函数完成后触发。

## 子流程

`node.subgraph` 要么是内联图，要么是字符串引用。对于引用，可以传入
`subgraphs: { ref: Graph }`，也可以传入
`loadSubgraph(ref, node) => Promise<Graph>`（例如 `GET /processes/{ref}`）。

## 编辑

`FlowEditor` 触发 `change`，载荷为：

```ts
{
  command: Command        // 根层级：可通过 applyCommand(rootGraph, command) 重放
  local: { command, path } // 原始形式，位于 `path` 处的子流程内
  description: string     // "add task-1"、"move 3 nodes"……
  graph: Graph            // 改动后的完整模型
  source: 'edit' | 'undo' | 'redo'
}
```

最简单的后端存储 `graph`（加防抖）。需要协作或审计的后端存储 `command`。被锁定的节点
类型（编辑器的 `locked: ['type', …]` 属性，或注册表中 `locked: true`）在编辑器中不能移动、修改或删除——请在服务器上执行同样的约束。
