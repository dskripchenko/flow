---
'@dskripchenko/flow': minor
---

FlowEditor: three opt-in props for hosts that embed it as an editor of their own domain. `fields` picks which built-in fields the properties panel shows for a node, an edge or the graph (`PropertyFields`; the keys are exported as `NODE_FIELDS`, `EDGE_FIELDS`, `GRAPH_FIELDS`); `io: false` hides the JSON / Mermaid import and export; `ignoreIssues` drops issue codes from validation (the Issues tab, its badge, the element markers and `validate`). The defaults keep the current behaviour.
