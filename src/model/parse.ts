/**
 * Reading a model from untrusted JSON: shape checks, defaults, and the
 * version gate. Semantic problems (unknown references, unreachable nodes)
 * are left to `validateGraph`, which reports instead of throwing.
 */
import { GRAPH_VERSION, type FlowEdge, type FlowGroup, type FlowNode, type Graph, type Port } from './types'

export class GraphError extends Error {
  override readonly name = 'GraphError'
  constructor(
    message: string,
    /** Where in the input, as a JSON pointer. */
    readonly pointer = '',
  ) {
    super(pointer ? `${message} (at ${pointer})` : message)
  }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function str(o: Obj, key: string, at: string, required = false): string | undefined {
  const v = o[key]
  if (v === undefined || v === null) {
    if (required) throw new GraphError(`"${key}" is required`, `${at}/${key}`)
    return undefined
  }
  if (typeof v === 'number') return String(v)
  if (typeof v !== 'string') throw new GraphError(`"${key}" must be a string`, `${at}/${key}`)
  return v
}

function bool(o: Obj, key: string, at: string): boolean | undefined {
  const v = o[key]
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'boolean') throw new GraphError(`"${key}" must be true or false`, `${at}/${key}`)
  return v
}

function point(v: unknown, at: string): { x: number; y: number } | undefined {
  if (v === undefined || v === null) return undefined
  if (!isObj(v) || typeof v.x !== 'number' || typeof v.y !== 'number' || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
    throw new GraphError('"position" must be { x: number, y: number }', at)
  }
  return { x: v.x, y: v.y }
}

const SIDES = new Set(['top', 'right', 'bottom', 'left'])

function ports(v: unknown, at: string): Port[] | undefined {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) throw new GraphError('"ports" must be an array', at)
  return v.map((p, i) => {
    const here = `${at}/${i}`
    if (!isObj(p)) throw new GraphError('A port must be an object', here)
    const side = str(p, 'side', here, true)!
    if (!SIDES.has(side)) throw new GraphError(`"side" must be one of top, right, bottom, left`, `${here}/side`)
    const port: Port = { id: str(p, 'id', here, true)!, side: side as Port['side'] }
    if (typeof p.offset === 'number') port.offset = Math.min(1, Math.max(0, p.offset))
    if (p.kind === 'in' || p.kind === 'out' || p.kind === 'both') port.kind = p.kind
    const label = str(p, 'label', here)
    if (label !== undefined) port.label = label
    return port
  })
}

function data(v: unknown, at: string): FlowNode['data'] {
  if (v === undefined || v === null) return undefined
  if (!isObj(v)) throw new GraphError('"data" must be an object', at)
  return v as FlowNode['data']
}

function node(v: unknown, at: string): FlowNode {
  if (!isObj(v)) throw new GraphError('A node must be an object', at)
  const n: FlowNode = { id: str(v, 'id', at, true)!, type: str(v, 'type', at) ?? 'state' }
  const label = str(v, 'label', at)
  if (label !== undefined) n.label = label
  const description = str(v, 'description', at)
  if (description !== undefined) n.description = description
  const position = point(v.position, `${at}/position`)
  if (position) n.position = position
  const group = str(v, 'group', at)
  if (group !== undefined) n.group = group
  const d = data(v.data, `${at}/data`)
  if (d) n.data = d
  const enabled = bool(v, 'enabled', at)
  if (enabled !== undefined) n.enabled = enabled
  if (v.subgraph !== undefined && v.subgraph !== null) {
    n.subgraph = typeof v.subgraph === 'string' ? v.subgraph : parseGraph(v.subgraph, `${at}/subgraph`)
  }
  const p = ports(v.ports, `${at}/ports`)
  if (p) n.ports = p
  if (v.join === 'all' || v.join === 'any') n.join = v.join
  return n
}

function edge(v: unknown, at: string): FlowEdge {
  if (!isObj(v)) throw new GraphError('An edge must be an object', at)
  const e: FlowEdge = { id: str(v, 'id', at, true)!, from: str(v, 'from', at, true)!, to: str(v, 'to', at, true)! }
  for (const key of ['fromPort', 'toPort', 'label', 'condition'] as const) {
    const s = str(v, key, at)
    if (s !== undefined) e[key] = s
  }
  const enabled = bool(v, 'enabled', at)
  if (enabled !== undefined) e.enabled = enabled
  if (v.kind === 'association' || v.kind === 'transition') e.kind = v.kind
  if (v.trigger === 'timer' || v.trigger === 'event') e.trigger = v.trigger
  const d = data(v.data, `${at}/data`)
  if (d) e.data = d
  return e
}

function group(v: unknown, at: string): FlowGroup {
  if (!isObj(v)) throw new GraphError('A group must be an object', at)
  const g: FlowGroup = { id: str(v, 'id', at, true)! }
  const label = str(v, 'label', at)
  if (label !== undefined) g.label = label
  const parent = str(v, 'parent', at)
  if (parent !== undefined) g.parent = parent
  return g
}

/**
 * Reads a model from parsed JSON (or a JSON string). Fills defaults, drops
 * unknown fields of nodes and edges, and throws `GraphError` with a JSON
 * pointer when the shape is wrong.
 */
export function parseGraph(input: unknown, at = ''): Graph {
  let v = input
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch (e) {
      throw new GraphError(`Not valid JSON: ${(e as Error).message}`, at)
    }
  }
  if (!isObj(v)) throw new GraphError('A graph must be an object', at)
  const version = v.version ?? GRAPH_VERSION
  if (version !== GRAPH_VERSION) {
    throw new GraphError(`Unsupported model version ${String(version)}; this package reads version ${GRAPH_VERSION}`, `${at}/version`)
  }
  if (!Array.isArray(v.nodes)) throw new GraphError('"nodes" must be an array', `${at}/nodes`)
  const edges = v.edges ?? []
  if (!Array.isArray(edges)) throw new GraphError('"edges" must be an array', `${at}/edges`)
  const g: Graph = {
    version: GRAPH_VERSION,
    nodes: v.nodes.map((n, i) => node(n, `${at}/nodes/${i}`)),
    edges: edges.map((e, i) => edge(e, `${at}/edges/${i}`)),
  }
  if (v.groups !== undefined && v.groups !== null) {
    if (!Array.isArray(v.groups)) throw new GraphError('"groups" must be an array', `${at}/groups`)
    g.groups = v.groups.map((x, i) => group(x, `${at}/groups/${i}`))
  }
  if (isObj(v.meta)) {
    const meta = { ...(v.meta as Graph['meta']) }
    if (meta!.direction !== undefined && meta!.direction !== 'TB' && meta!.direction !== 'LR') delete meta!.direction
    g.meta = meta
  }
  return g
}

/** The model as stable JSON text (2-space indent). */
export function stringifyGraph(graph: Graph): string {
  return JSON.stringify(graph, null, 2)
}

/** An empty model. */
export function emptyGraph(meta?: Graph['meta']): Graph {
  return meta ? { version: GRAPH_VERSION, nodes: [], edges: [], meta } : { version: GRAPH_VERSION, nodes: [], edges: [] }
}
