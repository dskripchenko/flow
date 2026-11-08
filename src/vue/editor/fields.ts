/**
 * The built-in fields of the editor's properties panel, by what is selected.
 * A host that brings its own fields (through the `properties` slot) picks
 * which of these stay.
 */

/** Fields shown for one selected node; `heading` is its kind and id at the top. */
export const NODE_FIELDS = ['heading', 'label', 'description', 'type', 'join', 'group', 'enabled', 'transitions', 'subgraph', 'data'] as const
/** Fields shown for one selected edge; `heading` is its kind, id and route at the top. */
export const EDGE_FIELDS = ['heading', 'label', 'condition', 'kind', 'trigger', 'enabled', 'data'] as const
/** Fields shown with nothing selected: the graph's own settings. */
export const GRAPH_FIELDS = ['title', 'direction'] as const

export type NodeField = (typeof NODE_FIELDS)[number]
export type EdgeField = (typeof EDGE_FIELDS)[number]
export type GraphField = (typeof GRAPH_FIELDS)[number]

/**
 * Which built-in fields the properties panel shows. A missing list shows all
 * of its fields; an empty list shows none (the `properties` slot still renders).
 */
export interface PropertyFields {
  node?: readonly NodeField[]
  edge?: readonly EdgeField[]
  graph?: readonly GraphField[]
}

/** Whether a field is shown under the given list (undefined: all are). */
export function showsField<F extends string>(list: readonly F[] | undefined, field: F): boolean {
  return list === undefined || list.includes(field)
}
