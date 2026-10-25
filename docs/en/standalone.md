# Standalone

`dist/standalone.js` is one script with Vue, the kit, the Mermaid parser and
all styles inside (the script injects its CSS; `dist/standalone.css` is the same
for a page that prefers a `<link>`). It exposes the global `DskFlow`.

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
    theme: 'system', // 'light' | 'dark' | 'system'; unset leaves <html data-theme> alone
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

- `DskFlow.mountFlow(target, options)` — a FlowView; options are its props,
  event handlers as `onSelect`, `onToggle`, `onNavigate`…, plus `theme`.
  Returns `{ app, update(props), unmount() }`.
- `DskFlow.mountFlowEditor(target, { modelValue, onChange, theme, … })` — a
  FlowEditor with Mermaid import on; the handle has `getGraph()`.
- The whole core is there too: `DskFlow.parseGraph`, `validateGraph`,
  `layoutGraph`, `createRegistry`, `createPoller`, `fromMermaid`, …

The bundle is about 700 KB minified (≈ 200 KB gzipped); with a build step,
import the modules instead and pay only for what you use.
