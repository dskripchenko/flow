# Без сборки

`dist/standalone.js` — один скрипт, внутри которого Vue, кит, парсер Mermaid
и все стили (скрипт сам внедряет свой CSS; `dist/standalone.css` — то же для
страницы, которой удобнее `<link>`). Он объявляет глобальный `DskFlow`.

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
    theme: 'system', // 'light' | 'dark' | 'system'; если не задано, <html data-theme> не трогается
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

- `DskFlow.mountFlow(target, options)` — FlowView; опции — его свойства,
  обработчики событий в виде `onSelect`, `onToggle`, `onNavigate`…, плюс
  `theme`. Возвращает `{ app, update(props), unmount() }`.
- `DskFlow.mountFlowEditor(target, { modelValue, onChange, theme, … })` —
  FlowEditor с включённым импортом Mermaid; у хэндла есть `getGraph()`.
- Всё ядро тоже доступно: `DskFlow.parseGraph`, `validateGraph`,
  `layoutGraph`, `createRegistry`, `createPoller`, `fromMermaid`, …

Сборка весит около 700 КБ в минифицированном виде (≈ 200 КБ в gzip); если
есть шаг сборки, импортируйте модули — тогда платите только за то, что
используете.
