/**
 * Editing commands: every change the editor makes is one of these, applied
 * by a pure function. A host receives the command with each `change` event
 * and may replay it, log it, or send it to a server instead of the whole
 * model.
 */
import type { ElementKind, FlowEdge, FlowGroup, FlowNode, Graph, Point } from '../model/types'

/** A patch sets fields; a field set to `null` is removed. */
export type Patch<T> = { [K in keyof T]?: T[K] | null }

export type Command =
  | { type: 'addNodes'; nodes: FlowNode[]; edges?: FlowEdge[] }
  | { type: 'removeElements'; ids: string[] }
  | { type: 'updateNode'; id: string; patch: Patch<Omit<FlowNode, 'id'>> }
  | { type: 'moveNodes'; moves: { id: string; position: Point }[] }
  | { type: 'addEdge'; edge: FlowEdge }
  | { type: 'updateEdge'; id: string; patch: Patch<Omit<FlowEdge, 'id'>> }
  | { type: 'setEnabled'; kind: Exclude<ElementKind, 'group'>; id: string; enabled: boolean }
  | { type: 'addGroup'; group: FlowGroup }
  | { type: 'updateGroup'; id: string; patch: Patch<Omit<FlowGroup, 'id'>> }
  | { type: 'updateMeta'; patch: Record<string, unknown> }
  | { type: 'replace'; graph: Graph }
  | { type: 'batch'; commands: Command[] }

/** Thrown when a command does not fit the graph (unknown id, duplicate id…). */
export class CommandError extends Error {
  override readonly name = 'CommandError'
}

function patched<T extends object>(obj: T, patch: object): T {
  const out = { ...obj } as Record<string, unknown>
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'id') continue
    if (v === null || v === undefined) delete out[k]
    else out[k] = v
  }
  return out as T
}

function ids(graph: Graph): Set<string> {
  return new Set([...graph.nodes.map((n) => n.id), ...graph.edges.map((e) => e.id), ...(graph.groups ?? []).map((g) => g.id)])
}

/** Applies a command; returns a new graph and leaves the old one untouched. */
export function applyCommand(graph: Graph, command: Command): Graph {
  switch (command.type) {
    case 'addNodes': {
      const taken = ids(graph)
      for (const el of [...command.nodes, ...(command.edges ?? [])]) {
        if (taken.has(el.id)) throw new CommandError(`The id "${el.id}" is already used`)
        taken.add(el.id)
      }
      return { ...graph, nodes: [...graph.nodes, ...command.nodes], edges: command.edges?.length ? [...graph.edges, ...command.edges] : graph.edges }
    }
    case 'removeElements': {
      const gone = new Set(command.ids)
      const nodes = graph.nodes.filter((n) => !gone.has(n.id))
      // Edges of removed nodes go with them.
      const edges = graph.edges.filter((e) => !gone.has(e.id) && !gone.has(e.from) && !gone.has(e.to))
      const next: Graph = { ...graph, nodes, edges }
      if (graph.groups) {
        // A removed group's members move to its parent.
        const parentOf = new Map(graph.groups.map((g) => [g.id, g.parent]))
        const lift = (id: string | undefined): string | undefined => {
          let p = id
          let guard = 0
          while (p !== undefined && gone.has(p) && guard++ < 100) p = parentOf.get(p)
          return p
        }
        next.groups = graph.groups.filter((g) => !gone.has(g.id)).map((g) => (g.parent && gone.has(g.parent) ? patched(g, { parent: lift(g.parent) ?? null }) : g))
        next.nodes = nodes.map((n) => (n.group && gone.has(n.group) ? patched(n, { group: lift(n.group) ?? null }) : n))
      }
      return next
    }
    case 'updateNode': {
      const i = graph.nodes.findIndex((n) => n.id === command.id)
      if (i < 0) throw new CommandError(`No node "${command.id}"`)
      const nodes = graph.nodes.slice()
      nodes[i] = patched(nodes[i]!, command.patch)
      return { ...graph, nodes }
    }
    case 'moveNodes': {
      const to = new Map(command.moves.map((m) => [m.id, m.position]))
      return { ...graph, nodes: graph.nodes.map((n) => (to.has(n.id) ? { ...n, position: { ...to.get(n.id)! } } : n)) }
    }
    case 'addEdge': {
      if (ids(graph).has(command.edge.id)) throw new CommandError(`The id "${command.edge.id}" is already used`)
      return { ...graph, edges: [...graph.edges, command.edge] }
    }
    case 'updateEdge': {
      const i = graph.edges.findIndex((e) => e.id === command.id)
      if (i < 0) throw new CommandError(`No edge "${command.id}"`)
      const edges = graph.edges.slice()
      edges[i] = patched(edges[i]!, command.patch)
      return { ...graph, edges }
    }
    case 'setEnabled': {
      const patch = { enabled: command.enabled ? null : false }
      return command.kind === 'node'
        ? applyCommand(graph, { type: 'updateNode', id: command.id, patch })
        : applyCommand(graph, { type: 'updateEdge', id: command.id, patch })
    }
    case 'addGroup': {
      if (ids(graph).has(command.group.id)) throw new CommandError(`The id "${command.group.id}" is already used`)
      return { ...graph, groups: [...(graph.groups ?? []), command.group] }
    }
    case 'updateGroup': {
      const groups = graph.groups ?? []
      const i = groups.findIndex((g) => g.id === command.id)
      if (i < 0) throw new CommandError(`No group "${command.id}"`)
      const next = groups.slice()
      next[i] = patched(next[i]!, command.patch)
      return { ...graph, groups: next }
    }
    case 'updateMeta':
      return { ...graph, meta: patched(graph.meta ?? {}, command.patch) }
    case 'replace':
      return command.graph
    case 'batch':
      return command.commands.reduce(applyCommand, graph)
  }
}

/** A fresh id with a prefix: `state-3`. */
export function nextId(graph: Graph, prefix: string, taken: Set<string> = ids(graph)): string {
  const base = prefix.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'n'
  for (let i = 1; ; i++) {
    const id = `${base}-${i}`
    if (!taken.has(id)) return id
  }
}

/** Snaps a point to a grid. */
export function snap(p: Point, grid: number): Point {
  if (grid <= 0) return p
  return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid }
}

/** A short human description of a command, for undo tooltips and logs. */
export function describeCommand(c: Command): string {
  switch (c.type) {
    case 'addNodes':
      return c.nodes.length === 1 ? `add ${c.nodes[0]!.id}` : `add ${c.nodes.length} nodes`
    case 'removeElements':
      return c.ids.length === 1 ? `delete ${c.ids[0]}` : `delete ${c.ids.length} elements`
    case 'updateNode':
    case 'updateEdge':
    case 'updateGroup':
      return `edit ${c.id}`
    case 'moveNodes':
      return c.moves.length === 1 ? `move ${c.moves[0]!.id}` : `move ${c.moves.length} nodes`
    case 'addEdge':
      return `connect ${c.edge.from} → ${c.edge.to}`
    case 'setEnabled':
      return `${c.enabled ? 'enable' : 'disable'} ${c.id}`
    case 'addGroup':
      return `add group ${c.group.id}`
    case 'updateMeta':
      return 'edit settings'
    case 'replace':
      return 'replace graph'
    case 'batch':
      return c.commands.length === 1 ? describeCommand(c.commands[0]!) : `${c.commands.length} changes`
  }
}
