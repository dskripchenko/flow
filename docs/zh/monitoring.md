# 监控与轮询

监控状态与模型分开保存：同一张图可以为每个实例绘制不同的状态，也可以为全部实例绘制
汇总计数器。

## 快照

监控端点返回的内容（[JSON Schema](../../schema/snapshot.schema.json)）：

```json
{
  "nodes": {
    "payment": { "status": "active", "count": 1, "updatedAt": "2026-10-25T10:15:00Z" },
    "validate": { "status": "done" },
    "delivery-failed": { "status": "error", "badge": 2, "count": 2, "message": "Carrier API timeout" },
    "backorder": { "status": "waiting", "count": 3 }
  },
  "edges": {
    "e4": { "traversed": true },
    "e13": { "count": 46 }
  },
  "path": ["start", "new", "validate", "valid", "payment"],
  "current": ["payment"],
  "updatedAt": "2026-10-25T10:15:02Z"
}
```

所有字段都是可选的。

| 字段 | 绘制为 |
|---|---|
| `nodes[id].status` | `active`：强调色描边和脉动光晕；`done`：绿色描边和对勾；`error`：红色描边和填充；`waiting`：琥珀色虚线描边；`skipped`：变暗；`unknown`（结果未知——例如副作用等待核对）：琥珀色、问号；`compensated`（已被补偿撤销）：中性色、撤销图标。其他字符串为中性色，除非 `statusTones` 为其指定了色调。 |
| `nodes[id].count` | 节点角上的计数器 |
| `nodes[id].badge` | 代替状态图标的角标（例如错误数） |
| `nodes[id].message` | 详情面板中的一行文字 |
| `edges[id].count` | 边标签上的计数器 |
| `edges[id].traversed` | 绿色线条 |
| `path` | 相邻节点之间的边被高亮，并带有流动的虚线 |
| `current` | 实例所在位置：光晕；视图会将其滚动到可见区域一次 |

在 `prefers-reduced-motion` 下，脉动和流动虚线会停止。

## 传入状态

```vue
<FlowView :graph="graph" :state="snapshot" />
```

`state` 接受快照或归约后的 `MonitorState`。以这种方式传入的快照会在到达时打上时间戳，
因此“N 秒前更新”和过期警告都能正常工作。

## 轮询

```vue
<FlowView
  :graph="graph"
  :poll="{
    intervalMs: 5000,
    merge: false,
    fetch: (signal, context) => fetch(`/api/process/42/state?level=${context.path.join('/')}`, { signal }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }),
  }"
  :stale-after-ms="20000"
/>
```

- 同一时间只有一个请求；上一个请求结束后才安排下一个。
- 组件卸载、层级变化（下钻）或轮询停止时，进行中的请求会被中止——请把 `signal`
  传给 `fetch`。
- 标签页隐藏时轮询暂停；返回时立即请求一次。
- 出错后延迟翻倍，最长 60 秒（`backoff: { factor, maxMs }` 或 `false`）；状态栏显示
  错误和刷新按钮。
- `context.path` 是已进入的子流程的节点 id（在根层级为空），`context.ref` 是当前显示的
  子流程的引用——请返回屏幕上这一层级的状态。
- `merge: true` 把部分快照合并进先前的状态，而不是替换它。
- 在 `staleAfterMs`（默认为三个间隔，至少 15 秒）内没有数据时，状态栏会提示数据已过期。

## 归约器

与框架无关的纯函数，适用于自行管理状态的宿主（store、WebSocket）：

```ts
import { reduceMonitor, emptyMonitorState, mergeSnapshot, isStale, pathEdges, statusSummary } from '@dskripchenko/flow'

let state = emptyMonitorState()
state = reduceMonitor(state, { type: 'snapshot', snapshot, at: Date.now() })            // 替换
state = reduceMonitor(state, { type: 'snapshot', snapshot: patch, at: Date.now(), merge: true })
state = reduceMonitor(state, { type: 'error', error: 'HTTP 503', at: Date.now() })      // failures + 1，保留数据
isStale(state, Date.now(), 30_000)
pathEdges(graph, state.path)   // 路径上的边 id
statusSummary(state)           // { active: 1, error: 1, ... }
```

## 轮询器

```ts
import { createPoller } from '@dskripchenko/flow'

const poller = createPoller({
  fetch: (signal) => fetch('/state', { signal }).then((r) => r.json()),
  intervalMs: 5000,
  backoff: { factor: 2, maxMs: 60_000 },
  visibilityPause: true,
  onData: (snapshot) => (state = mergeSnapshot(state, snapshot)),
  onError: (error, failures) => console.warn(failures, error),
})
poller.start()
poller.refresh() // 立即请求，并中止进行中的请求
poller.stop()
poller.status    // 'idle' | 'running' | 'paused'
```

`visibilityPause` 也接受自定义的 `{ hidden(), subscribe(listener) }` 来源（用于测试，
或应用级的“暂停”开关）。
