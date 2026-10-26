/**
 * Semantic checks of a model. Cycles are legal (state machines loop); what
 * is reported is what makes a process wrong (errors) or suspicious
 * (warnings). The viewer renders a graph with errors as far as it can; the
 * editor lists the issues and highlights the elements.
 */
import { portsOf, typeOf, defaultRegistry, type NodeTypeRegistry } from './registry'
import type { ElementKind, Graph } from './types'

export type IssueSeverity = 'error' | 'warning'

export type IssueCode =
  | 'duplicate-id'
  | 'unknown-node'
  | 'unknown-port'
  | 'unknown-group'
  | 'group-cycle'
  | 'unknown-type'
  | 'missing-start'
  | 'missing-end'
  | 'start-incoming'
  | 'end-outgoing'
  | 'unreachable'
  | 'dead-end'
  | 'empty-label'

export interface Issue {
  severity: IssueSeverity
  code: IssueCode
  message: string
  /** The element the issue is about, when there is one. */
  target?: { kind: ElementKind; id: string }
}

export interface ValidateOptions {
  registry?: NodeTypeRegistry
  /** Report a missing start/end node (on by default; off for fragments). */
  requireStartEnd?: boolean
}

/** All issues of a graph, errors first, then in model order. */
export function validateGraph(graph: Graph, options: ValidateOptions = {}): Issue[] {
  const registry = options.registry ?? defaultRegistry
  const issues: Issue[] = []
  const add = (severity: IssueSeverity, code: IssueCode, message: string, kind?: ElementKind, id?: string) =>
    issues.push(kind && id !== undefined ? { severity, code, message, target: { kind, id } } : { severity, code, message })

  // Ids are unique across nodes, edges and groups: one selection, one namespace.
  const seen = new Map<string, ElementKind>()
  const claim = (kind: ElementKind, id: string) => {
    if (seen.has(id)) add('error', 'duplicate-id', `The id "${id}" is used more than once`, kind, id)
    else seen.set(id, kind)
  }
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]))
  const groups = new Map((graph.groups ?? []).map((g) => [g.id, g]))
  for (const n of graph.nodes) claim('node', n.id)
  for (const e of graph.edges) claim('edge', e.id)
  for (const g of graph.groups ?? []) claim('group', g.id)

  for (const g of graph.groups ?? []) {
    if (g.parent !== undefined && !groups.has(g.parent)) add('error', 'unknown-group', `Group "${g.id}" is inside an unknown group "${g.parent}"`, 'group', g.id)
    let p = g.parent
    let steps = 0
    while (p !== undefined && groups.has(p)) {
      if (p === g.id || ++steps > groups.size) {
        add('error', 'group-cycle', `Group "${g.id}" contains itself`, 'group', g.id)
        break
      }
      p = groups.get(p)!.parent
    }
  }

  for (const n of graph.nodes) {
    if (!registry.has(n.type)) add('warning', 'unknown-type', `Node "${n.id}" has an unknown type "${n.type}"; it is drawn as a state`, 'node', n.id)
    if (n.group !== undefined && !groups.has(n.group)) add('error', 'unknown-group', `Node "${n.id}" is in an unknown group "${n.group}"`, 'node', n.id)
    const def = typeOf(registry, n.type)
    if (!def.labelOutside && !def.annotation && !(n.label ?? '').trim() && n.type !== 'decision') {
      add('warning', 'empty-label', `Node "${n.id}" has no label`, 'node', n.id)
    }
  }

  const live = graph.edges.filter((e) => e.kind !== 'association')
  for (const e of graph.edges) {
    for (const end of ['from', 'to'] as const) {
      const id = e[end]
      const n = nodes.get(id)
      if (!n) {
        add('error', 'unknown-node', `Edge "${e.id}" ${end === 'from' ? 'starts at' : 'ends at'} an unknown node "${id}"`, 'edge', e.id)
        continue
      }
      const portId = end === 'from' ? e.fromPort : e.toPort
      if (portId !== undefined) {
        const port = portsOf(registry, n).find((p) => p.id === portId)
        if (!port) add('error', 'unknown-port', `Edge "${e.id}" uses an unknown port "${portId}" of "${id}"`, 'edge', e.id)
        else if ((end === 'from' && port.kind === 'in') || (end === 'to' && port.kind === 'out')) {
          add('error', 'unknown-port', `Port "${portId}" of "${id}" does not take ${end === 'from' ? 'outgoing' : 'incoming'} edges`, 'edge', e.id)
        }
      }
    }
  }

  const flowNodes = graph.nodes.filter((n) => !typeOf(registry, n.type).annotation)
  // An "any state" node is a source but not the process's start.
  const starts = flowNodes.filter((n) => typeOf(registry, n.type).noIncoming && !typeOf(registry, n.type).anyState)
  const anyStates = flowNodes.filter((n) => typeOf(registry, n.type).anyState)
  const ends = flowNodes.filter((n) => typeOf(registry, n.type).noOutgoing)
  const requireStartEnd = options.requireStartEnd ?? true
  if (requireStartEnd && flowNodes.length > 0) {
    if (starts.length === 0) add('warning', 'missing-start', 'The process has no start node')
    if (ends.length === 0) add('warning', 'missing-end', 'The process has no end node')
  }
  for (const e of live) {
    const to = nodes.get(e.to)
    const from = nodes.get(e.from)
    if (to && typeOf(registry, to.type).noIncoming) add('warning', 'start-incoming', `Edge "${e.id}" leads into the ${typeOf(registry, to.type).anyState ? '"any state"' : 'start'} node "${to.id}"`, 'edge', e.id)
    if (from && typeOf(registry, from.type).noOutgoing) add('warning', 'end-outgoing', `Edge "${e.id}" leaves the end node "${from.id}"`, 'edge', e.id)
  }

  // Reachability from every start. Without a start there is nothing to measure against.
  if (starts.length > 0) {
    const out = new Map<string, string[]>()
    for (const e of live) {
      if (!nodes.has(e.from) || !nodes.has(e.to)) continue
      const list = out.get(e.from) ?? []
      list.push(e.to)
      out.set(e.from, list)
    }
    const reached = new Set<string>()
    const queue = [...starts, ...anyStates].map((s) => s.id)
    for (const id of queue) reached.add(id)
    while (queue.length) {
      const id = queue.shift()!
      for (const next of out.get(id) ?? []) {
        if (!reached.has(next)) {
          reached.add(next)
          queue.push(next)
        }
      }
    }
    for (const n of flowNodes) {
      if (!reached.has(n.id)) add('warning', 'unreachable', `Node "${n.id}" cannot be reached from the start`, 'node', n.id)
    }
  }

  // A dead end: a flow node other than an end with no way out.
  const hasOut = new Set(live.filter((e) => nodes.has(e.to)).map((e) => e.from))
  for (const n of flowNodes) {
    if (typeOf(registry, n.type).noOutgoing) continue
    if (!hasOut.has(n.id)) add('warning', 'dead-end', `Node "${n.id}" has no outgoing transition`, 'node', n.id)
  }

  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
}

/** Issues grouped by element id, for highlighting. */
export function issuesByElement(issues: readonly Issue[]): Map<string, Issue[]> {
  const map = new Map<string, Issue[]>()
  for (const i of issues) {
    if (!i.target) continue
    const list = map.get(i.target.id) ?? []
    list.push(i)
    map.set(i.target.id, list)
  }
  return map
}
