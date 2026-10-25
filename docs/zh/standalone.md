# 独立页面

`dist/standalone.js` 是一个内含 Vue、kit、Mermaid 解析器和全部样式的脚本（脚本会自行
注入 CSS；`dist/standalone.css` 内容相同，供偏好使用 `<link>` 的页面使用）。它暴露全局
变量 `DskFlow`。

```html
<div id="flow" style="height: 600px"></div>
<script src="https://unpkg.com/@dskripchenko/flow/dist/standalone.js"></script>
<script>
  const graph = DskFlow.fromMermaid(`stateDiagram-v2
    [*] --> Draft
    Draft --> Review: submit
    Review --> Draft: changes requested
    Review --> [*]: approve`)

  const handle = DskFlow.mountFlow('#flow', {
    graph,
    theme: 'system', // 'light' | 'dark' | 'system'；不设置则不改动 <html data-theme>
    locale: 'en',
    toggleable: true,
    onToggle: (change) => fetch('/api/toggle', { method: 'POST', body: JSON.stringify(change) }).then((r) => {
      if (!r.ok) throw new Error('Refused')
    }),
    poll: {
      intervalMs: 5000,
      fetch: (signal) => fetch('/api/state', { signal }).then((r) => r.json()),
    },
    onSelect: (s) => console.log(s),
  })
</script>
```

- `DskFlow.mountFlow(target, options)` —— 一个 FlowView；options 即它的 prop，事件处理器
  写作 `onSelect`、`onToggle`、`onNavigate`…，另加 `theme`。
  返回 `{ app, update(props), unmount() }`。
- `DskFlow.mountFlowEditor(target, { modelValue, onChange, theme, … })` —— 一个开启了
  Mermaid 导入的 FlowEditor；句柄带有 `getGraph()`。
- 整个核心也都在其中：`DskFlow.parseGraph`、`validateGraph`、`layoutGraph`、
  `createRegistry`、`createPoller`、`fromMermaid`……

该包压缩后约 700 KB（gzip 后 ≈ 200 KB）；如果有构建步骤，请改为导入各模块，只为用到的
部分付出体积。
