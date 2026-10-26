# Eigenständig

`dist/standalone.js` ist ein einziges Skript mit Vue, dem Kit, dem
Mermaid-Parser und allen Styles darin (das Skript injiziert sein CSS;
`dist/standalone.css` enthält dasselbe für eine Seite, die ein `<link>`
bevorzugt). Es stellt das globale `DskFlow` bereit.

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
    theme: 'system', // 'light' | 'dark' | 'system'; nicht gesetzt lässt <html data-theme> unberührt
    locale: 'en',
    toggleable: true,
    persistToggle: (change) => fetch('/api/toggle', { method: 'POST', body: JSON.stringify(change) }).then((r) => {
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

- `DskFlow.mountFlow(target, options)` — ein FlowView; die Optionen sind seine
  Props, Event-Handler als `onSelect`, `onToggle`, `onNavigate`…, dazu `theme`.
  Liefert `{ app, update(props), unmount() }`.
- `DskFlow.mountFlowEditor(target, { modelValue, onChange, theme, … })` — ein
  FlowEditor mit aktiviertem Mermaid-Import; das Handle hat `getGraph()`.
- Auch der gesamte Kern ist enthalten: `DskFlow.parseGraph`, `validateGraph`,
  `layoutGraph`, `createRegistry`, `createPoller`, `fromMermaid`, …

Das Bundle ist minifiziert etwa 700 KB groß (≈ 200 KB gzip-komprimiert); mit
einem Build-Schritt importieren Sie stattdessen die Module und zahlen nur für
das, was Sie verwenden.
