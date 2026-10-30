/**
 * Notations of business and systems analysis as sets of node types: EPC
 * (event-driven process chains), DFD (data flow diagrams) and IDEF0
 * (function models). Each comes with the palette an editor offers and the
 * direction its diagrams are usually drawn in.
 *
 *     const { types, palette, direction } = NOTATIONS.epc
 *     <FlowEditor :registry="createRegistry(types)" :palette="palette" />
 */
import { createRegistry, type NodeTypeDef, type NodeTypeRegistry } from './registry'
import type { Port } from './types'

export interface Notation {
  title: string
  /** The node types of the notation, to pass to `createRegistry`. */
  types: Record<string, NodeTypeDef>
  /** The types an editor's palette offers, in order (with `note` for comments). */
  palette: string[]
  /** How diagrams of the notation usually run. */
  direction: 'TB' | 'LR'
}

const operator = (title: string, glyph: string): NodeTypeDef => ({ title, shape: 'operator', size: { width: 40, height: 40 }, glyph, labelOutside: true })

export const EPC_TYPES: Record<string, NodeTypeDef> = {
  'epc-event': { title: 'Event', shape: 'hexagon', minWidth: 150, maxWidth: 230, height: 56 },
  'epc-function': { title: 'Function', shape: 'rounded', minWidth: 150, maxWidth: 230, height: 56 },
  'epc-and': operator('AND', '∧'),
  'epc-or': operator('OR', '∨'),
  'epc-xor': operator('XOR', '×'),
  'epc-org': { title: 'Organisational unit', shape: 'ellipse', minWidth: 140, maxWidth: 220, height: 56 },
  'epc-info': { title: 'Information object', shape: 'rect', minWidth: 140, maxWidth: 220, height: 50 },
  'epc-document': { title: 'Document', shape: 'document', minWidth: 130, maxWidth: 220, height: 56 },
  'epc-system': { title: 'Application system', shape: 'rect', minWidth: 140, maxWidth: 220, height: 50, icon: 'system' },
  'epc-path': { title: 'Process path', shape: 'hexagon', minWidth: 150, maxWidth: 230, height: 56, icon: 'subprocess', drillable: true },
}

export const DFD_TYPES: Record<string, NodeTypeDef> = {
  'dfd-process': { title: 'Process', shape: 'ellipse', minWidth: 130, maxWidth: 210, height: 76, numbered: true, drillable: true },
  'dfd-entity': { title: 'External entity', shape: 'entity', minWidth: 130, maxWidth: 220, height: 56 },
  'dfd-store': { title: 'Data store', shape: 'store', minWidth: 150, maxWidth: 240, height: 44, numbered: true },
}

/** The four sides of an IDEF0 box: what comes in, what governs it, what it makes, what does it. */
export const IDEF0_PORTS: Port[] = [
  { id: 'input', side: 'left', kind: 'in', label: 'Input' },
  { id: 'control', side: 'top', kind: 'in', label: 'Control' },
  { id: 'output', side: 'right', kind: 'out', label: 'Output' },
  { id: 'mechanism', side: 'bottom', kind: 'in', label: 'Mechanism' },
]

export const IDEF0_TYPES: Record<string, NodeTypeDef> = {
  'idef0-function': { title: 'Function', shape: 'rect', minWidth: 180, maxWidth: 240, height: 96, numbered: true, ports: IDEF0_PORTS, drillable: true },
  // Arrows that cross the diagram's boundary start or end at a named point.
  'idef0-boundary': { title: 'Boundary arrow', shape: 'pill', minWidth: 90, maxWidth: 180, height: 32 },
}

export const NOTATIONS: Readonly<Record<'epc' | 'dfd' | 'idef0', Notation>> = Object.freeze({
  epc: { title: 'EPC', types: EPC_TYPES, palette: [...Object.keys(EPC_TYPES), 'note'], direction: 'TB' },
  dfd: { title: 'DFD', types: DFD_TYPES, palette: [...Object.keys(DFD_TYPES), 'note'], direction: 'LR' },
  idef0: { title: 'IDEF0', types: IDEF0_TYPES, palette: [...Object.keys(IDEF0_TYPES), 'note'], direction: 'LR' },
})

/** A registry with the built-in types and a notation's. */
export function notationRegistry(name: keyof typeof NOTATIONS): NodeTypeRegistry {
  return createRegistry(NOTATIONS[name].types)
}
