# Security policy

A process graph is often authored by someone other than the person viewing it,
and monitoring data comes from a server. The package is built so that neither
becomes active content in the page.

## What is guaranteed

- **Text is text.** Labels, descriptions, conditions, data values, status
  messages and Mermaid source are rendered as text nodes (Vue interpolation
  inside SVG `<text>` and the kit's components); no model or snapshot field is
  inserted as HTML.
- **No evaluation.** Conditions are displayed, never evaluated. Imported JSON
  goes through `parseGraph`, which keeps only known fields of nodes and edges.
- **No requests of its own.** The components fetch nothing by themselves:
  monitoring, toggles and sub-process loading go through functions the host
  passes (`poll.fetch`, `onToggle`, `loadSubgraph`), with the host's own
  credentials and URLs.
- **Custom renderers are the host's code.** Components given in
  `nodeRenderers` run with the host's trust; render model text with
  interpolation, not `v-html`.

## Reporting a vulnerability

Please report security issues privately to the author through GitHub's
"Report a vulnerability" on the repository, not in public issues.
