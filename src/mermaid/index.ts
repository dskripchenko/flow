/**
 * @dskripchenko/flow/mermaid — a model from Mermaid `stateDiagram-v2` or
 * `flowchart` source, through the parser of @dskripchenko/diagrams (an
 * optional peer dependency: only this entry imports it).
 *
 *     import { fromMermaid } from '@dskripchenko/flow/mermaid'
 *     const graph = fromMermaid('stateDiagram-v2\n  [*] --> Idle')
 *
 * Composite states become sub-process nodes with their own inline graph;
 * flowchart subgraphs become groups.
 */
import { parse as parseDiagram } from '@dskripchenko/diagrams'
import { GraphError } from '../model/parse'
import { GRAPH_VERSION, type FlowEdge, type FlowGroup, type FlowNode, type Graph, type NodeType } from '../model/types'

// The AST shapes of @dskripchenko/diagrams 1.1.0. Its `parse()` is public but
// typed `unknown`; these mirror src/diagrams/{state,flowchart}/parser.ts and
// are checked at runtime before use.
type Direction = 'TB' | 'BT' | 'LR' | 'RL'

interface StateNodeAst {
  id: string
  kind: 'state' | 'start' | 'end' | 'choice' | 'fork' | 'join'
  name: string
  descriptions: string[]
  parent?: string
}
interface StateCompositeAst {
  id: string
  name: string
  parent?: string
  region: boolean
}
interface StateDiagramAst {
  type: 'state'
  direction: Direction
  states: Map<string, StateNodeAst>
  composites: Map<string, StateCompositeAst>
  transitions: { from: string; to: string; label?: string }[]
  notes: { target: string; side: 'left' | 'right'; text: string }[]
}
interface FlowchartAst {
  type: 'flowchart'
  direction: Direction
  nodes: Map<string, { id: string; text: string; shape: string; subgraph?: string }>
  edges: { from: string; to: string; stroke: string; end: string; text?: string }[]
  subgraphs: Map<string, { id: string; title: string; parent?: string }>
}

export interface MermaidImportOptions {
  /** Overrides the diagram's direction (TB/BT → TB, LR/RL → LR). */
  direction?: 'TB' | 'LR'
}

const flowDirection = (d: Direction): 'TB' | 'LR' => (d === 'LR' || d === 'RL' ? 'LR' : 'TB')

/** Whether a source is one this importer reads. */
export function isMermaidFlow(source: string): boolean {
  const head = source.replace(/^\s*(%%[^\n]*\n\s*)*/, '').split(/\s/, 1)[0] ?? ''
  return /^(stateDiagram(-v2)?|flowchart|graph)$/.test(head)
}

/**
 * Converts Mermaid source to a model.
 *
 * @throws GraphError for other diagram types; the diagrams parser's own
 *   `DiagramError` (with line and column) for syntax errors.
 */
export function fromMermaid(source: string, options: MermaidImportOptions = {}): Graph {
  const ast = parseDiagram(source) as { type?: string }
  if (ast && ast.type === 'state' && (ast as StateDiagramAst).states instanceof Map) return fromState(ast as StateDiagramAst, options)
  if (ast && ast.type === 'flowchart' && (ast as FlowchartAst).nodes instanceof Map) return fromFlowchart(ast as FlowchartAst, options)
  throw new GraphError(`Only stateDiagram-v2 and flowchart can be imported, not "${ast?.type ?? 'unknown'}"`)
}

/** Readable ids for pseudo states: `\0start:root` → `start`, `\0end:Billing` → `Billing-end`. */
function pseudoId(id: string): string {
  // The diagrams parser marks pseudo states with a NUL prefix.
  // eslint-disable-next-line no-control-regex
  const m = /^\u0000(start|end):(.*)$/.exec(id)
  if (!m) return id
  return m[2] === 'root' ? m[1]! : `${m[2]}-${m[1]}`
}

function fromState(ast: StateDiagramAst, options: MermaidImportOptions): Graph {
  const composites = ast.composites
  /** The graph a state belongs to: its nearest composite that is not a region (or the root). */
  const scopeOf = (parent: string | undefined): string => {
    let p = parent
    while (p !== undefined) {
      const c = composites.get(p)
      if (!c) return ''
      if (!c.region) return p
      p = c.parent
    }
    return ''
  }
  /** The region (as a group) a state sits in directly, if any. */
  const regionOf = (parent: string | undefined): string | undefined => (parent !== undefined && composites.get(parent)?.region ? parent : undefined)
  const parentOf = (id: string): string | undefined => ast.states.get(id)?.parent ?? composites.get(id)?.parent
  /** The element that stands for `id` inside graph `scope`: itself, or its ancestor composite in that scope. */
  const representative = (id: string, scope: string): string | undefined => {
    let cur: string | undefined = id
    for (let guard = 0; cur !== undefined && guard < 1000; guard++) {
      if (!composites.get(cur)?.region && scopeOf(parentOf(cur)) === scope) return cur
      cur = parentOf(cur)
    }
    return undefined
  }

  const graphs = new Map<string, Graph>()
  const graphFor = (scope: string): Graph => {
    let g = graphs.get(scope)
    if (!g) {
      g = { version: GRAPH_VERSION, nodes: [], edges: [] }
      if (scope === '') g.meta = { direction: options.direction ?? flowDirection(ast.direction) }
      else g.meta = { title: composites.get(scope)?.name ?? scope, direction: options.direction ?? flowDirection(ast.direction) }
      graphs.set(scope, g)
    }
    return g
  }
  graphFor('')

  const typeFor: Record<StateNodeAst['kind'], NodeType> = { state: 'state', start: 'start', end: 'end', choice: 'decision', fork: 'state', join: 'state' }
  for (const s of ast.states.values()) {
    const g = graphFor(scopeOf(s.parent))
    const n: FlowNode = { id: pseudoId(s.id), type: typeFor[s.kind] }
    if (s.kind === 'state' || s.kind === 'choice') n.label = s.name
    if (s.kind === 'fork' || s.kind === 'join') {
      n.label = s.name || s.kind
      n.data = { pseudo: s.kind }
    }
    if (s.descriptions.length) n.description = s.descriptions.join(' ')
    const region = regionOf(s.parent)
    if (region) n.group = region
    g.nodes.push(n)
  }
  for (const c of composites.values()) {
    if (c.region) {
      const g = graphFor(scopeOf(c.parent))
      const group: FlowGroup = { id: c.id }
      const parentRegion = regionOf(c.parent)
      if (parentRegion) group.parent = parentRegion
      ;(g.groups ??= []).push(group)
      continue
    }
    const g = graphFor(scopeOf(c.parent))
    const n: FlowNode = { id: c.id, type: 'subprocess', label: c.name, subgraph: graphFor(c.id) }
    const region = regionOf(c.parent)
    if (region) n.group = region
    g.nodes.push(n)
  }

  let edgeNo = 0
  for (const t of ast.transitions) {
    // The deepest graph that holds both ends (or the composites around them).
    let scope: string | undefined = scopeOf(parentOf(t.from))
    let from: string | undefined
    let to: string | undefined
    for (let guard = 0; scope !== undefined && guard < 1000; guard++) {
      from = representative(t.from, scope)
      to = representative(t.to, scope)
      if (from !== undefined && to !== undefined) break
      scope = scope === '' ? undefined : scopeOf(composites.get(scope)?.parent)
    }
    if (scope === undefined || from === undefined || to === undefined) continue
    const e: FlowEdge = { id: `t${++edgeNo}`, from: pseudoId(from), to: pseudoId(to) }
    if (t.label) e.label = t.label
    graphFor(scope).edges.push(e)
  }
  let noteNo = 0
  for (const note of ast.notes) {
    const scope = scopeOf(parentOf(note.target))
    const g = graphFor(scope)
    const id = `note-${++noteNo}`
    g.nodes.push({ id, type: 'note', label: note.text })
    g.edges.push({ id: `${id}-link`, from: id, to: pseudoId(note.target), kind: 'association' })
  }
  return graphFor('')
}

function fromFlowchart(ast: FlowchartAst, options: MermaidImportOptions): Graph {
  const incoming = new Set(ast.edges.map((e) => e.to))
  const outgoing = new Set(ast.edges.map((e) => e.from))
  const typeFor = (id: string, shape: string): NodeType => {
    switch (shape) {
      case 'rhombus':
      case 'choice':
      case 'hexagon':
        return 'decision'
      case 'subroutine':
        return 'subprocess'
      case 'doublecircle':
      case 'end':
        return 'end'
      case 'start':
        return 'start'
      case 'circle':
        return !incoming.has(id) ? 'start' : !outgoing.has(id) ? 'end' : 'state'
      case 'round':
      case 'stadium':
        return 'state'
      case 'asymmetric':
        return 'note'
      default:
        return 'task'
    }
  }
  const g: Graph = { version: GRAPH_VERSION, nodes: [], edges: [], meta: { direction: options.direction ?? flowDirection(ast.direction) } }
  for (const n of ast.nodes.values()) {
    const node: FlowNode = { id: n.id, type: typeFor(n.id, n.shape) }
    if (n.text && !(node.type === 'start' && n.text === n.id) && !(node.type === 'end' && n.text === n.id)) node.label = n.text
    if (n.subgraph) node.group = n.subgraph
    g.nodes.push(node)
  }
  if (ast.subgraphs.size) {
    g.groups = [...ast.subgraphs.values()].map((s) => {
      const group: FlowGroup = { id: s.id }
      if (s.title) group.label = s.title
      if (s.parent) group.parent = s.parent
      return group
    })
  }
  let i = 0
  for (const e of ast.edges) {
    if (e.stroke === 'invisible') continue
    const edge: FlowEdge = { id: `e${++i}`, from: e.from, to: e.to }
    if (e.text) edge.label = e.text
    if (e.end === 'none' && e.stroke === 'dotted') edge.kind = 'association'
    g.edges.push(edge)
  }
  return g
}
