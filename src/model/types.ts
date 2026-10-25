/**
 * The graph model: plain JSON, versioned, independent of layout and of the
 * monitoring state. A host stores it as is; the viewer and the editor read
 * and write exactly this shape.
 */

/** The model format this package reads and writes. */
export const GRAPH_VERSION = 1

/** Built-in node types; any other string is a custom type from a registry. */
export type BuiltinNodeType = 'start' | 'end' | 'state' | 'task' | 'decision' | 'subprocess' | 'note'

export type NodeType = BuiltinNodeType | (string & {})

export type PortSide = 'top' | 'right' | 'bottom' | 'left'

/** A named connection point on a node's side. */
export interface Port {
  id: string
  side: PortSide
  /** Position along the side, 0…1 from its start (left or top); 0.5 by default. */
  offset?: number
  /** `in` takes incoming edges only, `out` outgoing only; both by default. */
  kind?: 'in' | 'out' | 'both'
  label?: string
}

export interface Point {
  x: number
  y: number
}

/** Data values a node or an edge carries for the host: shown as key/value. */
export type DataValue = string | number | boolean | null | DataValue[] | { [key: string]: DataValue }

export interface FlowNode {
  id: string
  type: NodeType
  label?: string
  /** The node's centre. Nodes without one are placed by the auto layout. */
  position?: Point
  /** The group (frame) the node sits in. */
  group?: string
  data?: Record<string, DataValue>
  /** `false` disables the node: drawn dimmed and struck through. Enabled by default. */
  enabled?: boolean
  /**
   * The node's own process: an inline graph, or a reference the host resolves
   * (`subgraphs` prop or `loadSubgraph`). Makes the node drillable.
   */
  subgraph?: string | Graph
  /** Overrides the type's ports. */
  ports?: Port[]
  /** A short secondary line under the label. */
  description?: string
}

export interface FlowEdge {
  id: string
  from: string
  to: string
  fromPort?: string
  toPort?: string
  label?: string
  /** A guard or condition, shown in the details and, when there is no label, on the edge. */
  condition?: string
  enabled?: boolean
  /** `association` is a dashed line without an arrow (a note to its node). */
  kind?: 'transition' | 'association'
  data?: Record<string, DataValue>
}

export interface FlowGroup {
  id: string
  label?: string
  /** The enclosing group. */
  parent?: string
}

export interface GraphMeta {
  title?: string
  /** Auto-layout direction; `LR` by default. */
  direction?: 'TB' | 'LR'
  [key: string]: DataValue | undefined
}

export interface Graph {
  version: typeof GRAPH_VERSION
  nodes: FlowNode[]
  edges: FlowEdge[]
  groups?: FlowGroup[]
  meta?: GraphMeta
}

export type ElementKind = 'node' | 'edge' | 'group'

/** A reference to one element of a graph. */
export interface ElementRef {
  kind: ElementKind
  id: string
}

/** `enabled` treats a missing flag as enabled. */
export function isEnabled(el: { enabled?: boolean }): boolean {
  return el.enabled !== false
}
