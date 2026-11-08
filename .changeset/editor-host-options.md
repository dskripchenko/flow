---
'@dskripchenko/flow': minor
---

FlowEditor: three opt-in props for hosts that embed it as an editor of their own domain. `fields` picks which built-in fields the properties panel shows for a node, an edge or the graph (`PropertyFields`; the keys are exported as `NODE_FIELDS`, `EDGE_FIELDS`, `GRAPH_FIELDS`); `io: false` hides the JSON / Mermaid import and export; `ignoreIssues` drops issue codes from validation (the Issues tab, its badge, the element markers and `validate`). The defaults keep the current behaviour.

Issues in the editor read in the interface language (en, ru): one label per issue code (`issueDuplicateId`, `issueUnknownNode`, `issueUnknownPort`, `issueUnknownGroup`, `issueGroupCycle`, `issueUnknownType`, `issueMissingStart`, `issueMissingEnd`, `issueStartIncoming`, `issueEndOutgoing`, `issueUnreachable`, `issueDeadEnd`, `issueEmptyLabel`) takes an `IssueText` and names elements by their label, falling back to the id; hosts override them through `labels`. `validateGraph` keeps its English `message` and adds `params` (`IssueParams`) with what the message is made of; `issueMessage(issue, graph, labels)` words an issue the same way outside the editor.

The "add a transition to…" select in the properties panel now has an accessible name.
