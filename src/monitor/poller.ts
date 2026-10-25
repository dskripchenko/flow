/**
 * A framework-agnostic poller: calls `fetch` every `intervalMs`, pauses while
 * the page is hidden, backs off after errors, and aborts the request in
 * flight on stop. One request at a time; the next one is scheduled after the
 * previous settles, so a slow endpoint is never hit twice at once.
 */

export interface BackoffOptions {
  /** Multiplier per consecutive failure; 2 by default. */
  factor?: number
  /** Upper bound of the delay; 60 s by default. */
  maxMs?: number
}

/** Where the poller learns about page visibility; the document by default. */
export interface VisibilitySource {
  hidden(): boolean
  subscribe(listener: () => void): () => void
}

export interface PollerOptions<T> {
  fetch: (signal: AbortSignal) => Promise<T>
  intervalMs: number
  /** `false` keeps the interval after errors. On by default. */
  backoff?: BackoffOptions | false
  /** Pause while the page is hidden (on by default); or a custom source. */
  visibilityPause?: boolean | VisibilitySource
  onData?: (data: T) => void
  onError?: (error: unknown, failures: number) => void
  /** Fetch at start instead of after the first interval (default true). */
  immediate?: boolean
}

export type PollerStatus = 'idle' | 'running' | 'paused'

export interface Poller {
  start(): void
  stop(): void
  /** Fetches now (aborting a request in flight) and reschedules. */
  refresh(): void
  readonly status: PollerStatus
  /** Errors in a row. */
  readonly failures: number
  /** The delay before the next fetch, as scheduled now. */
  readonly nextDelay: number
}

function documentVisibility(): VisibilitySource | undefined {
  const doc = (globalThis as { document?: Document }).document
  if (!doc || typeof doc.addEventListener !== 'function') return undefined
  return {
    hidden: () => doc.visibilityState === 'hidden',
    subscribe(listener) {
      doc.addEventListener('visibilitychange', listener)
      return () => doc.removeEventListener('visibilitychange', listener)
    },
  }
}

/** The delay after `failures` errors in a row. */
export function backoffDelay(intervalMs: number, failures: number, backoff: BackoffOptions | false = {}): number {
  if (backoff === false || failures === 0) return intervalMs
  const factor = backoff.factor ?? 2
  const max = backoff.maxMs ?? 60_000
  return Math.min(max, intervalMs * factor ** failures)
}

export function createPoller<T>(options: PollerOptions<T>): Poller {
  const visibility = options.visibilityPause === false ? undefined : options.visibilityPause === true || options.visibilityPause === undefined ? documentVisibility() : options.visibilityPause
  let status: PollerStatus = 'idle'
  // Read through a function: TypeScript would narrow `status` across awaits.
  const current = (): PollerStatus => status
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let failures = 0
  let unsubscribe: (() => void) | undefined
  let nextDelay = options.intervalMs
  /** Bumped on every stop/refresh, so a late response of an old run is ignored. */
  let generation = 0

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  const abort = () => {
    controller?.abort()
    controller = undefined
  }
  const schedule = (delay: number) => {
    clear()
    nextDelay = delay
    if (status !== 'running') return
    timer = setTimeout(tick, delay)
  }
  const tick = async () => {
    timer = undefined
    if (status !== 'running') return
    const gen = ++generation
    abort()
    const c = new AbortController()
    controller = c
    try {
      const data = await options.fetch(c.signal)
      if (gen !== generation || current() === 'idle') return
      failures = 0
      options.onData?.(data)
    } catch (error) {
      if (gen !== generation || current() === 'idle' || c.signal.aborted) return
      failures++
      options.onError?.(error, failures)
    } finally {
      if (controller === c) controller = undefined
    }
    if (gen === generation && status === 'running') schedule(backoffDelay(options.intervalMs, failures, options.backoff))
  }
  const onVisibility = () => {
    if (!visibility || status === 'idle') return
    if (visibility.hidden()) {
      if (status === 'running') {
        status = 'paused'
        generation++
        clear()
        abort()
      }
    } else if (status === 'paused') {
      status = 'running'
      // Coming back: the data is old, fetch right away.
      void tick()
    }
  }

  return {
    start() {
      if (status !== 'idle') return
      unsubscribe = visibility?.subscribe(onVisibility)
      if (visibility?.hidden()) {
        status = 'paused'
        return
      }
      status = 'running'
      if (options.immediate ?? true) void tick()
      else schedule(options.intervalMs)
    },
    stop() {
      status = 'idle'
      generation++
      clear()
      abort()
      unsubscribe?.()
      unsubscribe = undefined
    },
    refresh() {
      if (status !== 'running') return
      clear()
      void tick()
    },
    get status() {
      return status
    },
    get failures() {
      return failures
    },
    get nextDelay() {
      return nextDelay
    },
  }
}
