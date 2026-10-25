import { afterEach, describe, expect, it, vi } from 'vitest'
import { backoffDelay, createPoller, emptyMonitorState, isStale, mergeSnapshot, pathEdges, reduceMonitor, statusSummary, type VisibilitySource } from '../../src/index'
import { orderProcess, snapshotAt } from '../fixtures/order'

describe('monitor reducer', () => {
  it('replaces state with a snapshot by default', () => {
    let s = mergeSnapshot(undefined, { nodes: { a: { status: 'active' } }, path: ['x'], updatedAt: '2026-01-01T00:00:00Z' }, 100)
    expect(s.nodes.a!.status).toBe('active')
    expect(s.receivedAt).toBe(100)
    expect(s.updatedAt).toBe(Date.parse('2026-01-01T00:00:00Z'))
    s = mergeSnapshot(s, { nodes: { b: { status: 'done' } } }, 200)
    expect(s.nodes).toEqual({ b: { status: 'done' } })
    expect(s.path).toBeUndefined()
    expect(s.updatedAt).toBeUndefined()
  })

  it('merges partial snapshots', () => {
    let s = mergeSnapshot(undefined, { nodes: { a: { status: 'active', count: 1 } }, edges: { e: { count: 1 } }, path: ['a'] }, 1)
    s = reduceMonitor(s, { type: 'snapshot', snapshot: { nodes: { a: { count: 2 }, b: { status: 'waiting' } } }, at: 2, merge: true })
    expect(s.nodes).toEqual({ a: { status: 'active', count: 2 }, b: { status: 'waiting' } })
    expect(s.edges).toEqual({ e: { count: 1 } })
    expect(s.path).toEqual(['a'])
  })

  it('counts errors and clears them with data', () => {
    const before = mergeSnapshot(undefined, { nodes: {} }, 1)
    let s = reduceMonitor(before, { type: 'error', error: 'boom', at: 2 })
    s = reduceMonitor(s, { type: 'error', error: 'boom', at: 3 })
    expect(s.failures).toBe(2)
    expect(s.error).toBe('boom')
    expect(s.receivedAt).toBe(1)
    s = reduceMonitor(s, { type: 'snapshot', snapshot: {}, at: 4 })
    expect(s.failures).toBe(0)
    expect(s.error).toBeUndefined()
    expect(reduceMonitor(s, { type: 'reset' })).toEqual(emptyMonitorState())
  })

  it('does not mutate its input', () => {
    const s = Object.freeze(mergeSnapshot(undefined, { nodes: { a: { status: 'done' } } }, 1))
    expect(() => reduceMonitor(s, { type: 'snapshot', snapshot: { nodes: { a: { count: 1 } } }, at: 2, merge: true })).not.toThrow()
  })

  it('detects stale data', () => {
    const s = mergeSnapshot(undefined, {}, 1000)
    expect(isStale(s, 5000, 10_000)).toBe(false)
    expect(isStale(s, 20_000, 10_000)).toBe(true)
    expect(isStale(emptyMonitorState(), 1e9, 1)).toBe(false)
  })

  it('maps a path to edges and summarises statuses', () => {
    const snap = snapshotAt(6)
    expect(pathEdges(orderProcess, snap.path)).toEqual(['e1', 'e2', 'e3', 'e4', 'e8', 'e9'])
    const sum = statusSummary(mergeSnapshot(undefined, snap, 1))
    expect(sum.active).toBe(1)
    expect(sum.error).toBe(1)
  })
})

describe('createPoller', () => {
  afterEach(() => vi.useRealTimers())

  const visibility = () => {
    let hidden = false
    const listeners = new Set<() => void>()
    const source: VisibilitySource = { hidden: () => hidden, subscribe: (l) => (listeners.add(l), () => listeners.delete(l)) }
    return { source, set: (h: boolean) => ((hidden = h), listeners.forEach((l) => l())) }
  }

  it('polls on an interval, one request at a time', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async () => 'ok')
    const data = vi.fn()
    const p = createPoller({ fetch, intervalMs: 1000, onData: data, visibilityPause: false })
    p.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(data).toHaveBeenCalledWith('ok')
    p.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('backs off after errors and recovers', async () => {
    vi.useFakeTimers()
    let fail = true
    const fetch = vi.fn(async () => {
      if (fail) throw new Error('down')
      return 1
    })
    const errors: number[] = []
    const p = createPoller({ fetch, intervalMs: 1000, backoff: { factor: 2, maxMs: 5000 }, onError: (_e, n) => errors.push(n), visibilityPause: false })
    p.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(p.nextDelay).toBe(2000)
    await vi.advanceTimersByTimeAsync(2000)
    expect(p.nextDelay).toBe(4000)
    await vi.advanceTimersByTimeAsync(4000)
    expect(p.nextDelay).toBe(5000)
    fail = false
    await vi.advanceTimersByTimeAsync(5000)
    expect(p.failures).toBe(0)
    expect(p.nextDelay).toBe(1000)
    expect(errors).toEqual([1, 2, 3])
    p.stop()
  })

  it('pauses while hidden and fetches on return', async () => {
    vi.useFakeTimers()
    const v = visibility()
    const fetch = vi.fn(async () => 1)
    const p = createPoller({ fetch, intervalMs: 1000, visibilityPause: v.source })
    p.start()
    await vi.advanceTimersByTimeAsync(0)
    v.set(true)
    expect(p.status).toBe('paused')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetch).toHaveBeenCalledTimes(1)
    v.set(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(p.status).toBe('running')
    expect(fetch).toHaveBeenCalledTimes(2)
    p.stop()
  })

  it('aborts the request in flight on stop and ignores its result', async () => {
    let signal: AbortSignal | undefined
    let resolve: (v: number) => void = () => {}
    const data = vi.fn()
    const p = createPoller({
      fetch: (s) => {
        signal = s
        return new Promise<number>((r) => (resolve = r))
      },
      intervalMs: 1000,
      onData: data,
      visibilityPause: false,
    })
    p.start()
    p.stop()
    expect(signal?.aborted).toBe(true)
    resolve(1)
    await Promise.resolve()
    expect(data).not.toHaveBeenCalled()
  })

  it('computes backoff delays', () => {
    expect(backoffDelay(1000, 0)).toBe(1000)
    expect(backoffDelay(1000, 3)).toBe(8000)
    expect(backoffDelay(1000, 10)).toBe(60_000)
    expect(backoffDelay(1000, 3, false)).toBe(1000)
  })
})
