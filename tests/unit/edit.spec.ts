import { describe, expect, it } from 'vitest'
import {
  CommandError,
  History,
  alignNodes,
  applyCommand,
  copyFragment,
  distributeNodes,
  layoutCommand,
  layoutGraph,
  nextId,
  pasteFragment,
  snap,
  type Graph,
  type NodeBox,
} from '../../src/index'
import { orderProcess } from '../fixtures/order'

const g0: Graph = {
  version: 1,
  groups: [{ id: 'g' }],
  nodes: [
    { id: 'a', type: 'state', label: 'A', group: 'g' },
    { id: 'b', type: 'state', label: 'B' },
  ],
  edges: [{ id: 'e', from: 'a', to: 'b' }],
}

describe('commands', () => {
  it('adds, updates and removes without touching the input', () => {
    const frozen = structuredClone(g0)
    let g = applyCommand(g0, { type: 'addNodes', nodes: [{ id: 'c', type: 'task', label: 'C' }] })
    g = applyCommand(g, { type: 'addEdge', edge: { id: 'e2', from: 'b', to: 'c' } })
    g = applyCommand(g, { type: 'updateNode', id: 'c', patch: { label: 'Charge', description: 'card' } })
    g = applyCommand(g, { type: 'updateNode', id: 'c', patch: { description: null } })
    expect(g.nodes.find((n) => n.id === 'c')).toEqual({ id: 'c', type: 'task', label: 'Charge' })
    g = applyCommand(g, { type: 'removeElements', ids: ['b'] })
    expect(g.nodes.map((n) => n.id)).toEqual(['a', 'c'])
    expect(g.edges).toEqual([])
    expect(g0).toEqual(frozen)
  })

  it('refuses duplicate ids and unknown targets', () => {
    expect(() => applyCommand(g0, { type: 'addNodes', nodes: [{ id: 'e', type: 'state' }] })).toThrow(CommandError)
    expect(() => applyCommand(g0, { type: 'updateEdge', id: 'nope', patch: {} })).toThrow(CommandError)
  })

  it('toggles enabled, keeping the model minimal', () => {
    let g = applyCommand(g0, { type: 'setEnabled', kind: 'edge', id: 'e', enabled: false })
    expect(g.edges[0]!.enabled).toBe(false)
    g = applyCommand(g, { type: 'setEnabled', kind: 'edge', id: 'e', enabled: true })
    expect('enabled' in g.edges[0]!).toBe(false)
  })

  it('lifts members of a removed group to its parent', () => {
    const g = applyCommand(g0, { type: 'removeElements', ids: ['g'] })
    expect(g.groups).toEqual([])
    expect(g.nodes[0]!.group).toBeUndefined()
  })

  it('applies batches in order', () => {
    const g = applyCommand(g0, { type: 'batch', commands: [{ type: 'moveNodes', moves: [{ id: 'a', position: { x: 1, y: 2 } }] }, { type: 'updateMeta', patch: { title: 'T' } }] })
    expect(g.nodes[0]!.position).toEqual({ x: 1, y: 2 })
    expect(g.meta?.title).toBe('T')
  })

  it('makes ids and snaps', () => {
    expect(nextId(g0, 'state')).toBe('state-1')
    expect(nextId({ ...g0, nodes: [...g0.nodes, { id: 'state-1', type: 'state' }] }, 'state')).toBe('state-2')
    expect(snap({ x: 29, y: 31 }, 20)).toEqual({ x: 20, y: 40 })
  })
})

describe('History', () => {
  it('undoes and redoes', () => {
    const h = new History(g0)
    h.execute({ type: 'updateNode', id: 'a', patch: { label: 'A1' } })
    h.execute({ type: 'removeElements', ids: ['b'] })
    expect(h.graph.nodes).toHaveLength(1)
    h.undo()
    expect(h.graph.nodes).toHaveLength(2)
    h.undo()
    expect(h.graph).toBe(g0)
    expect(h.canUndo).toBe(false)
    h.redo()
    expect(h.graph.nodes[0]!.label).toBe('A1')
    // A new command drops the redo branch.
    h.execute({ type: 'updateMeta', patch: { title: 'x' } })
    expect(h.canRedo).toBe(false)
  })

  it('merges commands with the same key inside the window', () => {
    let now = 0
    const h = new History(g0, { now: () => now })
    for (const label of ['P', 'Pa', 'Pay']) {
      h.execute({ type: 'updateNode', id: 'a', patch: { label } }, 'label:a')
      now += 100
    }
    now += 2000
    h.execute({ type: 'updateNode', id: 'a', patch: { label: 'Paid' } }, 'label:a')
    h.undo()
    expect(h.graph.nodes[0]!.label).toBe('Pay')
    h.undo()
    expect(h.graph.nodes[0]!.label).toBe('A')
  })

  it('records nothing when a command fails', () => {
    const h = new History(g0)
    expect(() => h.execute({ type: 'updateNode', id: 'zz', patch: {} })).toThrow()
    expect(h.canUndo).toBe(false)
  })

  it('restarts on an outside graph', () => {
    const h = new History(g0)
    h.execute({ type: 'updateMeta', patch: { title: 'x' } })
    h.reset(h.graph)
    expect(h.canUndo).toBe(true)
    h.reset(orderProcess)
    expect(h.canUndo).toBe(false)
  })
})

describe('selection operations', () => {
  const boxes = new Map<string, NodeBox>([
    ['a', { x: 0, y: 0, width: 100, height: 40 }],
    ['b', { x: 150, y: 70, width: 60, height: 40 }],
    ['c', { x: 400, y: 20, width: 100, height: 40 }],
  ])

  it('aligns', () => {
    const c = alignNodes(boxes, ['a', 'b'], 'left')!
    expect(c).toEqual({ type: 'moveNodes', moves: [{ id: 'a', position: { x: 0, y: 0 } }, { id: 'b', position: { x: -20, y: 70 } }] })
    expect(alignNodes(boxes, ['a'], 'left')).toBeNull()
    const top = alignNodes(boxes, ['a', 'b', 'c'], 'top')!
    expect(top.type === 'moveNodes' && top.moves.every((m) => m.position.y === 0)).toBe(true)
  })

  it('distributes gaps evenly', () => {
    const c = distributeNodes(boxes, ['c', 'a', 'b'], 'horizontal')!
    if (c.type !== 'moveNodes') throw new Error()
    const x = Object.fromEntries(c.moves.map((m) => [m.id, m.position.x]))
    // Gaps: (450 - (-50) - 260) / 2 = 120.
    expect(x.a).toBe(0)
    expect(x.b).toBe(50 + 120 + 30)
    expect(x.c).toBe(400)
  })

  it('copies and pastes with fresh ids and internal edges only', () => {
    const layout = layoutGraph(orderProcess)
    const f = copyFragment(orderProcess, ['packing', 'shipped', 'delivered'], layout)
    expect(f.nodes).toHaveLength(3)
    expect(f.edges.map((e) => e.id).sort()).toEqual(['e16', 'e17'])
    const { command, ids } = pasteFragment(orderProcess, f)
    const g = applyCommand(orderProcess, command)
    expect(ids).toHaveLength(3)
    expect(g.nodes).toHaveLength(orderProcess.nodes.length + 3)
    expect(g.edges).toHaveLength(orderProcess.edges.length + 2)
    const pasted = g.nodes.find((n) => n.id === ids[0])!
    expect(pasted.position!.x).toBeCloseTo(layout.nodes.get('packing')!.x + 32)
  })

  it('fixes an auto layout as one move', () => {
    const c = layoutCommand(layoutGraph(orderProcess))
    const g = applyCommand(orderProcess, c)
    expect(g.nodes.every((n) => n.position)).toBe(true)
    const again = layoutGraph(g)
    expect(again.nodes.get('new')!.x).toBeCloseTo(layoutGraph(orderProcess).nodes.get('new')!.x, 0)
  })
})
