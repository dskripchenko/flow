/**
 * Monitoring for a view: a given state, or a poller folding snapshots
 * through the core reducer. Also a one-second clock for "updated N s ago"
 * and the stale check.
 */
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { createPoller, emptyMonitorState, isStale, reduceMonitor, type BackoffOptions, type MonitorSnapshot, type MonitorState, type Poller } from '../index'

/** Where the viewer is: the node ids of the sub-processes entered, and the reference opened last. */
export interface PollContext {
  /** Node ids from the root to the displayed graph; empty at the root. */
  path: string[]
  /** The `subgraph` reference of the displayed graph, when it was a string. */
  ref?: string
}

export interface PollOptions {
  fetch: (signal: AbortSignal, context: PollContext) => Promise<MonitorSnapshot>
  intervalMs?: number
  backoff?: BackoffOptions | false
  /** Merge snapshots into the state instead of replacing it (for partial updates). */
  merge?: boolean
  /** Pause while the page is hidden; on by default. */
  visibilityPause?: boolean
}

function isState(v: MonitorSnapshot | MonitorState): v is MonitorState {
  return typeof (v as MonitorState).failures === 'number'
}

export function useMonitor(options: {
  state: () => MonitorSnapshot | MonitorState | undefined
  poll: () => PollOptions | undefined
  context: () => PollContext
  staleAfterMs: () => number | undefined
  onError?: (error: unknown) => void
}) {
  const polled = shallowRef<MonitorState | undefined>()
  const loading = ref(false)
  const paused = ref(false)
  const now = ref(Date.now())
  let poller: Poller | undefined
  let clock: ReturnType<typeof setInterval> | undefined

  // A snapshot given as a prop is stamped when it arrives, not on every tick.
  const given = shallowRef<MonitorState | undefined>()
  watch(
    () => options.state(),
    (v) => {
      given.value = v ? (isState(v) ? v : reduceMonitor(emptyMonitorState(), { type: 'snapshot', snapshot: v, at: Date.now() })) : undefined
    },
    { immediate: true },
  )
  const state = computed<MonitorState | undefined>(() => given.value ?? polled.value)

  const interval = computed(() => options.poll()?.intervalMs ?? 5000)
  const stale = computed(() => {
    const after = options.staleAfterMs() ?? (options.poll() ? Math.max(interval.value * 3, 15_000) : undefined)
    if (after === undefined || !state.value?.receivedAt) return false
    return isStale(state.value, now.value, after)
  })
  const ageSeconds = computed(() => {
    const t = state.value?.updatedAt ?? state.value?.receivedAt
    return t === undefined ? undefined : Math.max(0, Math.round((now.value - t) / 1000))
  })

  function stop(): void {
    poller?.stop()
    poller = undefined
  }
  function start(): void {
    stop()
    const p = options.poll()
    if (!p) {
      polled.value = undefined
      return
    }
    const ctx = options.context()
    polled.value = undefined
    loading.value = true
    poller = createPoller<MonitorSnapshot>({
      // The latest fetch, so a host passing a new function each render does not restart polling.
      fetch: (signal) => (options.poll() ?? p).fetch(signal, ctx),
      intervalMs: p.intervalMs ?? 5000,
      backoff: p.backoff,
      visibilityPause: p.visibilityPause ?? true,
      onData(snapshot) {
        loading.value = false
        polled.value = reduceMonitor(polled.value ?? emptyMonitorState(), { type: 'snapshot', snapshot, at: Date.now(), merge: p.merge })
        now.value = Date.now()
      },
      onError(error) {
        loading.value = false
        polled.value = reduceMonitor(polled.value ?? emptyMonitorState(), { type: 'error', error: error instanceof Error ? error.message : String(error), at: Date.now() })
        options.onError?.(error)
      },
    })
    poller.start()
  }

  const contextKey = computed(() => JSON.stringify(options.context()))
  const pollKey = computed(() => {
    const p = options.poll()
    return p ? `${p.intervalMs ?? 5000}|${p.merge ? 1 : 0}|${p.visibilityPause === false ? 0 : 1}` : ''
  })
  watch([pollKey, contextKey], start, { immediate: true })

  if (typeof setInterval === 'function') {
    clock = setInterval(() => {
      now.value = Date.now()
      paused.value = poller?.status === 'paused'
    }, 1000)
  }
  onBeforeUnmount(() => {
    stop()
    clearInterval(clock)
  })

  return {
    state,
    loading,
    paused,
    stale,
    ageSeconds,
    now,
    refresh: () => poller?.refresh(),
    polling: computed(() => !!options.poll()),
  }
}

export type MonitorApi = ReturnType<typeof useMonitor>
