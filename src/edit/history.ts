/**
 * Undo/redo over commands. Each entry keeps the graph before and after the
 * command: graphs are immutable and share unchanged nodes, so this costs
 * little and undo never depends on computing an inverse correctly.
 */
import { applyCommand, type Command } from './commands'
import type { Graph } from '../model/types'

export interface HistoryEntry {
  command: Command
  before: Graph
  after: Graph
  /** Entries with the same key in a row merge into one (a drag, arrow nudges). */
  mergeKey?: string
  at: number
}

export interface HistoryOptions {
  /** Entries kept; 200 by default. */
  limit?: number
  /** Merge window for entries with the same `mergeKey`, ms; 800 by default. */
  mergeWindowMs?: number
  now?: () => number
}

export class History {
  private past: HistoryEntry[] = []
  private future: HistoryEntry[] = []
  private readonly limit: number
  private readonly mergeWindow: number
  private readonly now: () => number

  constructor(
    private current: Graph,
    options: HistoryOptions = {},
  ) {
    this.limit = options.limit ?? 200
    this.mergeWindow = options.mergeWindowMs ?? 800
    this.now = options.now ?? Date.now
  }

  get graph(): Graph {
    return this.current
  }
  get canUndo(): boolean {
    return this.past.length > 0
  }
  get canRedo(): boolean {
    return this.future.length > 0
  }
  /** The entry `undo` would revert. */
  get last(): HistoryEntry | undefined {
    return this.past[this.past.length - 1]
  }
  get next(): HistoryEntry | undefined {
    return this.future[this.future.length - 1]
  }

  /** Applies a command and records it. Throws CommandError and records nothing when it does not apply. */
  execute(command: Command, mergeKey?: string): Graph {
    const before = this.current
    const after = applyCommand(before, command)
    const at = this.now()
    const last = this.last
    if (mergeKey && last && last.mergeKey === mergeKey && at - last.at <= this.mergeWindow && this.future.length === 0) {
      last.after = after
      last.command = last.command.type === 'batch' ? { type: 'batch', commands: [...last.command.commands, command] } : { type: 'batch', commands: [last.command, command] }
      last.at = at
    } else {
      this.past.push({ command, before, after, mergeKey, at })
      if (this.past.length > this.limit) this.past.shift()
    }
    this.future = []
    this.current = after
    return after
  }

  undo(): HistoryEntry | undefined {
    const entry = this.past.pop()
    if (!entry) return undefined
    this.future.push(entry)
    this.current = entry.before
    return entry
  }

  redo(): HistoryEntry | undefined {
    const entry = this.future.pop()
    if (!entry) return undefined
    this.past.push(entry)
    this.current = entry.after
    return entry
  }

  /**
   * Takes a graph from outside (the host changed the model). When it is the
   * one history already holds, nothing happens; otherwise history restarts.
   */
  reset(graph: Graph): void {
    if (graph === this.current) return
    this.current = graph
    this.past = []
    this.future = []
  }

  /** Ends merging: the next command starts a new entry even with the same key. */
  seal(): void {
    const last = this.last
    if (last) last.mergeKey = undefined
  }
}
