/**
 * Node types: how big a node is, what outline it has, where its ports sit.
 * The core uses this for layout and validation; the Vue renderer draws the
 * outline. A host adds its own types to a registry.
 */
import type { FlowNode, Port } from './types'

/** Outlines the built-in renderer can draw. */
export type NodeShape = 'rect' | 'rounded' | 'circle' | 'ring' | 'diamond' | 'note' | 'pill'

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
}

export type NodeTypeRegistry = ReadonlyMap<string, NodeTypeDef>

export const BUILTIN_TYPES: Readonly<Record<string, NodeTypeDef>> = Object.freeze({
  start: { title: 'Start', shape: 'circle', size: { width: 36, height: 36 }, icon: 'play', labelOutside: true, noIncoming: true },
  end: { title: 'End', shape: 'ring', size: { width: 36, height: 36 }, icon: 'stop', labelOutside: true, noOutgoing: true },
  state: { title: 'State', shape: 'rounded', minWidth: 132, maxWidth: 220, height: 44 },
  task: { title: 'Task', shape: 'rect', minWidth: 156, maxWidth: 240, height: 56, icon: 'task' },
  decision: { title: 'Decision', shape: 'diamond', minWidth: 104, maxWidth: 180, height: 72, icon: 'decision' },
  subprocess: { title: 'Sub-process', shape: 'rect', minWidth: 172, maxWidth: 240, height: 60, icon: 'subprocess', drillable: true },
  note: { title: 'Note', shape: 'note', minWidth: 120, maxWidth: 220, height: 44, annotation: true },
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
