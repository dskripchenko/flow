import type { FlowEdge, FlowNode } from '../model/types'

/** An element the viewer may offer to enable or disable. */
export type ToggleTarget = { kind: 'node'; element: FlowNode } | { kind: 'edge'; element: FlowEdge }

/** `true` for every node and edge, or a predicate choosing which ones get a switch. */
export type Toggleable = boolean | ((target: ToggleTarget) => boolean)

/** Whether `target` gets an enable switch under `toggleable`. */
export function mayToggle(toggleable: Toggleable | undefined, target: ToggleTarget): boolean {
  return typeof toggleable === 'function' ? toggleable(target) : toggleable === true
}
