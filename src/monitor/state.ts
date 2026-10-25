/**
 * Monitoring state: what is happening in running instances of a process,
 * kept apart from the model. A host polls (or pushes) snapshots; the pure
 * reducer folds them into the state the viewer draws.
 */
import type { Graph } from '../model/types'

/** Built-in statuses; any other string is shown as a neutral status. */
export type NodeStatus = 'active' | 'done' | 'error' | 'waiting' | 'skipped' | (string & {})

export interface NodeRunState {
  status?: NodeStatus
  /** How many instances are in (or went through) the node. */
  count?: number
  /** A short text or number on the node's corner (e.g. an error count). */
  badge?: string | number
  /** A line for the details panel (e.g. the last error). */
  message?: string
  /** ISO string or epoch milliseconds. */
  updatedAt?: string | number
}

export interface EdgeRunState {
  count?: number
  traversed?: boolean
}

/** One snapshot from the host: the JSON a monitoring endpoint returns. */
export interface MonitorSnapshot {
  nodes?: Record<string, NodeRunState>
  edges?: Record<string, EdgeRunState>
  /** The current instance's path: node ids in the order visited. */
  path?: string[]
  /** Nodes the current instance is in now. */
  current?: string[]
  /** When the host produced the snapshot (ISO or epoch ms). */
  updatedAt?: string | number
}

export interface MonitorState extends Required<Pick<MonitorSnapshot, 'nodes' | 'edges'>> {
  path?: string[]
  current?: string[]
  /** Epoch ms of the last snapshot received. */
  receivedAt?: number
  /** Epoch ms the host stamped on the last snapshot, if it did. */
  updatedAt?: number
  /** The last polling error, cleared by the next snapshot. */
  error?: string
  /** Errors in a row. */
  failures: number
}

export type MonitorAction =
  /** Replaces everything with the snapshot (`merge: false`, the default) or merges into it. */
  | { type: 'snapshot'; snapshot: MonitorSnapshot; at: number; merge?: boolean }
  | { type: 'error'; error: string; at: number }
  | { type: 'reset' }

export function emptyMonitorState(): MonitorState {
  return { nodes: {}, edges: {}, failures: 0 }
}

export function toEpoch(v: string | number | undefined): number | undefined {
  if (v === undefined) return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const t = Date.parse(v)
  return Number.isNaN(t) ? undefined : t
}

function mergeRecord<T extends object>(prev: Record<string, T>, next: Record<string, T> | undefined): Record<string, T> {
  if (!next) return prev
  const out: Record<string, T> = { ...prev }
  for (const [id, v] of Object.entries(next)) out[id] = { ...(prev[id] ?? {}), ...v } as T
  return out
}

/** The pure reducer. Never mutates `state`. */
export function reduceMonitor(state: MonitorState, action: MonitorAction): MonitorState {
  switch (action.type) {
    case 'reset':
      return emptyMonitorState()
    case 'error':
      return { ...state, error: action.error, failures: state.failures + 1 }
    case 'snapshot': {
      const s = action.snapshot
      const base: MonitorState = action.merge
        ? { ...state, nodes: mergeRecord(state.nodes, s.nodes), edges: mergeRecord(state.edges, s.edges) }
        : { nodes: { ...(s.nodes ?? {}) }, edges: { ...(s.edges ?? {}) }, failures: 0 }
      const next: MonitorState = { ...base, failures: 0, receivedAt: action.at }
      delete next.error
      const stamped = toEpoch(s.updatedAt)
      if (stamped !== undefined) next.updatedAt = stamped
      else delete next.updatedAt
      if (s.path !== undefined || !action.merge) {
        if (s.path) next.path = [...s.path]
        else delete next.path
      }
      if (s.current !== undefined || !action.merge) {
        if (s.current) next.current = [...s.current]
        else delete next.current
      }
      return next
    }
  }
}

/** Folds a snapshot into a state: the shorthand for the common case. */
export function mergeSnapshot(state: MonitorState | undefined, snapshot: MonitorSnapshot, at = Date.now(), merge = false): MonitorState {
  return reduceMonitor(state ?? emptyMonitorState(), { type: 'snapshot', snapshot, at, merge })
}

/**
 * Whether the state is too old to trust: nothing received for `staleAfterMs`.
 * A state that never received anything is not stale (it is loading).
 */
export function isStale(state: MonitorState | undefined, now: number, staleAfterMs: number): boolean {
  if (!state?.receivedAt) return false
  return now - state.receivedAt > staleAfterMs
}

/**
 * The edges of a path: for each consecutive pair of nodes, the first enabled
 * edge between them (then any edge). Pairs without an edge are skipped.
 */
export function pathEdges(graph: Graph, path: readonly string[] | undefined): string[] {
  if (!path || path.length < 2) return []
  const out: string[] = []
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1]
    const to = path[i]
    const candidates = graph.edges.filter((e) => e.from === from && e.to === to)
    const pick = candidates.find((e) => e.enabled !== false) ?? candidates[0]
    if (pick) out.push(pick.id)
  }
  return out
}

/** Built-in statuses and the kit tone each is drawn with. */
export const STATUS_TONES: Readonly<Record<string, 'accent' | 'success' | 'danger' | 'warning' | 'info' | 'neutral'>> = Object.freeze({
  active: 'accent',
  done: 'success',
  error: 'danger',
  waiting: 'warning',
  skipped: 'neutral',
})

/** Counts of nodes by status: the summary line of a monitor. */
export function statusSummary(state: MonitorState | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const n of Object.values(state?.nodes ?? {})) {
    if (!n.status) continue
    out[n.status] = (out[n.status] ?? 0) + 1
  }
  return out
}
