---
'@dskripchenko/flow': minor
---

FlowView: `toggleable` also takes a predicate `({ kind, element }) => boolean` that chooses which nodes and edges get an enable switch — on hover, in the details drawer and from the keyboard; elements it refuses cannot be toggled. `mayToggle`, `Toggleable` and `ToggleTarget` are exported from `@dskripchenko/flow/vue`.
