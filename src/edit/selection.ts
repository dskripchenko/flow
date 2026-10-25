/**
 * Operations over a selection that produce commands: copy/paste/duplicate,
 * align, distribute, and applying an auto layout as one undoable move.
 */
import { nextId, type Command } from './commands'
import type { GraphLayout, NodeBox } from '../layout'
import type { FlowEdge, FlowNode, Graph, Point } from '../model/types'

/** What the editor's clipboard holds: nodes and the edges among them. */
export interface Fragment {
  kind: 'dskripchenko-flow/fragment'
  version: 1
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export function isFragment(v: unknown): v is Fragment {
  return typeof v === 'object' && v !== null && (v as Fragment).kind === 'dskripchenko-flow/fragment' && Array.isArray((v as Fragment).nodes)
}

/**
 * Copies the selected nodes, with positions from the layout, and the edges
 * whose both ends are selected (plus selected edges between them).
 */
export function copyFragment(graph: Graph, selected: Iterable<string>, layout?: GraphLayout): Fragment {
  const set = new Set(selected)
  const nodes = graph.nodes
    .filter((n) => set.has(n.id))
    .map((n) => {
      const box = layout?.nodes.get(n.id)
      const copy: FlowNode = structuredClone(n)
      if (box) copy.position = { x: box.x, y: box.y }
      return copy
    })
  const inside = new Set(nodes.map((n) => n.id))
  const edges = graph.edges.filter((e) => inside.has(e.from) && inside.has(e.to)).map((e) => structuredClone(e))
  return { kind: 'dskripchenko-flow/fragment', version: 1, nodes, edges }
}

/**
 * The command that pastes a fragment with fresh ids, shifted by `offset`
 * (or centred on `at`). Returns the new node ids for the selection.
 */
export function pasteFragment(graph: Graph, fragment: Fragment, place: { offset?: Point; at?: Point } = {}): { command: Command; ids: string[] } {
  const taken = new Set([...graph.nodes.map((n) => n.id), ...graph.edges.map((e) => e.id), ...(graph.groups ?? []).map((g) => g.id)])
  const groups = new Set((graph.groups ?? []).map((g) => g.id))
  const map = new Map<string, string>()
  let shift = place.offset ?? { x: 32, y: 32 }
  if (place.at) {
    const ps = fragment.nodes.map((n) => n.position).filter((p): p is Point => !!p)
    if (ps.length) {
      const cx = (Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x))) / 2
      const cy = (Math.min(...ps.map((p) => p.y)) + Math.max(...ps.map((p) => p.y))) / 2
      shift = { x: place.at.x - cx, y: place.at.y - cy }
    }
  }
  const nodes = fragment.nodes.map((n) => {
    const id = nextId(graph, n.type === 'state' ? 'state' : n.type, taken)
    taken.add(id)
    map.set(n.id, id)
    const copy: FlowNode = { ...structuredClone(n), id }
    if (n.position) copy.position = { x: n.position.x + shift.x, y: n.position.y + shift.y }
    if (copy.group && !groups.has(copy.group)) delete copy.group
    return copy
  })
  const edges = fragment.edges
    .filter((e) => map.has(e.from) && map.has(e.to))
    .map((e) => {
      const id = nextId(graph, 'e', taken)
      taken.add(id)
      return { ...structuredClone(e), id, from: map.get(e.from)!, to: map.get(e.to)! }
    })
  return { command: { type: 'addNodes', nodes, edges }, ids: nodes.map((n) => n.id) }
}

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

/** Aligns the boxes' edges or centres; returns a move command (or null for < 2 nodes). */
export function alignNodes(boxes: ReadonlyMap<string, NodeBox>, ids: readonly string[], how: Alignment): Command | null {
  const list = ids.map((id) => [id, boxes.get(id)] as const).filter((x): x is readonly [string, NodeBox] => !!x[1])
  if (list.length < 2) return null
  const lefts = list.map(([, b]) => b.x - b.width / 2)
  const rights = list.map(([, b]) => b.x + b.width / 2)
  const tops = list.map(([, b]) => b.y - b.height / 2)
  const bottoms = list.map(([, b]) => b.y + b.height / 2)
  const moves = list.map(([id, b]) => {
    let { x, y } = b
    switch (how) {
      case 'left':
        x = Math.min(...lefts) + b.width / 2
        break
      case 'right':
        x = Math.max(...rights) - b.width / 2
        break
      case 'center':
        x = (Math.min(...lefts) + Math.max(...rights)) / 2
        break
      case 'top':
        y = Math.min(...tops) + b.height / 2
        break
      case 'bottom':
        y = Math.max(...bottoms) - b.height / 2
        break
      case 'middle':
        y = (Math.min(...tops) + Math.max(...bottoms)) / 2
        break
    }
    return { id, position: { x, y } }
  })
  return { type: 'moveNodes', moves }
}

/** Spaces the boxes evenly between the outermost two (gaps, not centres). */
export function distributeNodes(boxes: ReadonlyMap<string, NodeBox>, ids: readonly string[], axis: 'horizontal' | 'vertical'): Command | null {
  const list = ids.map((id) => [id, boxes.get(id)] as const).filter((x): x is readonly [string, NodeBox] => !!x[1])
  if (list.length < 3) return null
  const h = axis === 'horizontal'
  const size = (b: NodeBox) => (h ? b.width : b.height)
  const pos = (b: NodeBox) => (h ? b.x : b.y)
  list.sort((a, b) => pos(a[1]) - pos(b[1]))
  const first = list[0]![1]
  const last = list[list.length - 1]![1]
  const start = pos(first) - size(first) / 2
  const end = pos(last) + size(last) / 2
  const total = list.reduce((s, [, b]) => s + size(b), 0)
  const gap = (end - start - total) / (list.length - 1)
  let cursor = start
  const moves = list.map(([id, b]) => {
    const c = cursor + size(b) / 2
    cursor += size(b) + gap
    return { id, position: h ? { x: c, y: b.y } : { x: b.x, y: c } }
  })
  return { type: 'moveNodes', moves }
}

/** Fixes every node where a layout put it: auto layout as one undoable command. */
export function layoutCommand(layout: GraphLayout): Command {
  return { type: 'moveNodes', moves: [...layout.nodes.values()].map((b) => ({ id: b.id, position: { x: Math.round(b.x), y: Math.round(b.y) } })) }
}
