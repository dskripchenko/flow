/**
 * Node types: how big a node is, what outline it has, where its ports sit.
 * The core uses this for layout and validation; the Vue renderer draws the
 * outline. A host adds its own types to a registry.
 */
import type { FlowNode, Port } from './types'

/** Outlines the built-in renderer can draw. */
export type NodeShape =
  | 'rect'
  | 'rounded'
  | 'circle'
  | 'ring'
  | 'diamond'
  | 'note'
  | 'pill'
  /** A double circle: an intermediate event (timer, wait). */
  | 'event'
  /** A dashed circle: the "any state" source. */
  | 'any'
  /** An EPC event. */
  | 'hexagon'
  /** A DFD process, an EPC organisational unit. */
  | 'ellipse'
  /** A small circle with a glyph (`glyph`): an EPC connector (AND, OR, XOR). */
  | 'operator'
  /** A DFD data store: open on the right. */
  | 'store'
  /** A DFD external entity: a box with a second outline behind it. */
  | 'entity'
  /** A document with a wavy bottom edge (EPC). */
  | 'document'

export interface NodeTypeDef {
  /** The type's name in the UI (palette, details). */
  title: string
  shape: NodeShape
  /** A fixed size; otherwise the label decides the width between min and max. */
  size?: { width: number; height: number }
  minWidth?: number
  maxWidth?: number
  /** Minimum height; grows with wrapped label lines. */
  height?: number
  /** Default ports; without them edges attach where they meet the outline. */
  ports?: Port[]
  /** An icon name the renderer maps to a glyph (`play`, `square`, `cog`, …). */
  icon?: string
  /** A short text drawn in the middle of an `operator` (`∧`, `∨`, `×`). */
  glyph?: string
  /** Shows the node's number (`data.number`: A1, P2, D3…) in a corner, as IDEF0 and DFD number boxes. */
  numbered?: boolean
  /** The label is drawn outside the outline (start/end circles). */
  labelOutside?: boolean
  /** Edges cannot end here (`start`) or start here (`end`). */
  noIncoming?: boolean
  noOutgoing?: boolean
  /** Not part of the flow: no reachability or dead-end checks (`note`). */
  annotation?: boolean
  /** The editor does not let a user change or delete nodes of this type. */
  locked?: boolean
  /** The node can be drilled into (gets a "subgraph" field in the editor). */
  drillable?: boolean
  /** The node shows its inline subgraph's regions (top-level groups) and its `join` (`parallel`). */
  regions?: boolean
  /**
   * Edges from the node apply from every state of its graph (`any`): it is a
   * source like a start, but does not count as the process's start.
   */
  anyState?: boolean
}

export type NodeTypeRegistry = ReadonlyMap<string, NodeTypeDef>

export const BUILTIN_TYPES: Readonly<Record<string, NodeTypeDef>> = Object.freeze({
  start: { title: 'Start', shape: 'circle', size: { width: 40, height: 40 }, icon: 'play', labelOutside: true, noIncoming: true },
  end: { title: 'End', shape: 'ring', size: { width: 40, height: 40 }, icon: 'stop', labelOutside: true, noOutgoing: true },
  state: { title: 'State', shape: 'rounded', minWidth: 160, maxWidth: 240, height: 44 },
  task: { title: 'Task', shape: 'rect', minWidth: 176, maxWidth: 260, height: 60, icon: 'task' },
  decision: { title: 'Decision', shape: 'diamond', minWidth: 124, maxWidth: 200, height: 80, icon: 'decision' },
  subprocess: { title: 'Sub-process', shape: 'rect', minWidth: 192, maxWidth: 260, height: 64, icon: 'subprocess', drillable: true },
  parallel: { title: 'Parallel', shape: 'rect', minWidth: 208, maxWidth: 320, height: 64, icon: 'parallel', drillable: true, regions: true },
  timer: { title: 'Timer', shape: 'event', size: { width: 40, height: 40 }, icon: 'timer', labelOutside: true },
  wait: { title: 'Wait', shape: 'event', size: { width: 40, height: 40 }, icon: 'wait', labelOutside: true },
  any: { title: 'Any state', shape: 'any', size: { width: 32, height: 32 }, icon: 'any', labelOutside: true, noIncoming: true, anyState: true },
  note: { title: 'Note', shape: 'note', minWidth: 140, maxWidth: 240, height: 48, annotation: true },
})

/** A registry with the built-in types plus `custom` (which may override them). */
export function createRegistry(custom: Record<string, NodeTypeDef> = {}): NodeTypeRegistry {
  return new Map(Object.entries({ ...BUILTIN_TYPES, ...custom }))
}

export const defaultRegistry: NodeTypeRegistry = createRegistry()

/** The definition for a node's type; an unknown type is drawn as a state. */
export function typeOf(registry: NodeTypeRegistry, type: string): NodeTypeDef {
  return registry.get(type) ?? registry.get('state') ?? BUILTIN_TYPES.state!
}

/** The ports a node offers: its own, else its type's. */
export function portsOf(registry: NodeTypeRegistry, node: FlowNode): readonly Port[] {
  return node.ports ?? typeOf(registry, node.type).ports ?? []
}

/** Whether the editor must leave a node alone (its type is locked). */
export function isLocked(registry: NodeTypeRegistry, node: FlowNode): boolean {
  return typeOf(registry, node.type).locked === true
}
