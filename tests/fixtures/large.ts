/**
 * A large generated process for performance checks: `n` steps in chains
 * with branches, joins and back edges, deterministic for a given `n`.
 */
import type { FlowEdge, FlowNode, Graph } from '../../src/index'

export function largeGraph(n = 500): Graph {
  const nodes: FlowNode[] = [{ id: 'start', type: 'start' }]
  const edges: FlowEdge[] = []
  const types = ['state', 'task', 'state', 'decision', 'state', 'task'] as const
  // A cheap deterministic generator.
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 1; i < n - 1; i++) {
    nodes.push({ id: `s${i}`, type: types[i % types.length]!, label: `Step ${i}` })
    const prev = i === 1 ? 'start' : `s${Math.max(1, i - 1 - Math.floor(rnd() * Math.min(i - 1, 6)))}`
    edges.push({ id: `e${i}`, from: prev, to: `s${i}` })
    if (i > 10 && rnd() < 0.08) edges.push({ id: `b${i}`, from: `s${i}`, to: `s${i - 5 - Math.floor(rnd() * 5)}`, label: 'retry' })
  }
  nodes.push({ id: 'end', type: 'end' })
  edges.push({ id: 'e-end', from: `s${n - 2}`, to: 'end' })
  return { version: 1, meta: { title: `${n} steps` }, nodes, edges }
}
