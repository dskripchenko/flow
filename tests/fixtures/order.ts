/**
 * A realistic order process: 19 steps with cycles (payment retry, backorder,
 * delivery retry), an error state, a sub-process with its own graph, a
 * group and a note. Used by the tests, the playground and the browser check.
 */
import type { Graph, MonitorSnapshot } from '../../src/index'

export const paymentProcess: Graph = {
  version: 1,
  meta: { title: 'Payment' },
  nodes: [
    { id: 'p-start', type: 'start' },
    { id: 'authorize', type: 'task', label: 'Authorize card', data: { provider: 'acquirer' } },
    { id: 'three-ds', type: 'decision', label: '3-D Secure?' },
    { id: 'challenge', type: 'state', label: 'Customer challenge', description: 'Waiting for the bank' },
    { id: 'capture', type: 'task', label: 'Capture funds' },
    { id: 'declined', type: 'state', label: 'Declined' },
    { id: 'p-end', type: 'end', label: 'Paid' },
    { id: 'p-fail', type: 'end', label: 'Failed' },
  ],
  edges: [
    { id: 'pe1', from: 'p-start', to: 'authorize' },
    { id: 'pe2', from: 'authorize', to: 'three-ds' },
    { id: 'pe3', from: 'three-ds', to: 'challenge', label: 'required' },
    { id: 'pe4', from: 'three-ds', to: 'capture', label: 'frictionless' },
    { id: 'pe5', from: 'challenge', to: 'capture', label: 'passed' },
    { id: 'pe6', from: 'challenge', to: 'declined', label: 'failed' },
    { id: 'pe7', from: 'authorize', to: 'declined', label: 'refused' },
    { id: 'pe8', from: 'capture', to: 'p-end' },
    { id: 'pe9', from: 'declined', to: 'p-fail' },
  ],
}

export const orderProcess: Graph = {
  version: 1,
  meta: { title: 'Order' },
  groups: [{ id: 'fulfilment', label: 'Fulfilment' }],
  nodes: [
    { id: 'start', type: 'start', label: 'Order placed' },
    { id: 'new', type: 'state', label: 'New', data: { sla: '15 min' } },
    { id: 'validate', type: 'task', label: 'Validate order', description: 'Address, limits, fraud' },
    { id: 'valid', type: 'decision', label: 'Valid?' },
    { id: 'rejected', type: 'state', label: 'Rejected' },
    { id: 'payment', type: 'subprocess', label: 'Payment', subgraph: paymentProcess, description: 'Card or wallet' },
    { id: 'payment-failed', type: 'state', label: 'Payment failed' },
    { id: 'reserve', type: 'task', label: 'Reserve stock', group: 'fulfilment' },
    { id: 'in-stock', type: 'decision', label: 'In stock?', group: 'fulfilment' },
    { id: 'backorder', type: 'state', label: 'Backorder', group: 'fulfilment' },
    { id: 'packing', type: 'state', label: 'Packing', group: 'fulfilment' },
    { id: 'shipped', type: 'state', label: 'Shipped', group: 'fulfilment' },
    { id: 'delivery-failed', type: 'state', label: 'Delivery failed' },
    { id: 'delivered', type: 'state', label: 'Delivered' },
    { id: 'returned', type: 'state', label: 'Return requested' },
    { id: 'refund', type: 'task', label: 'Refund' },
    { id: 'cancelled', type: 'state', label: 'Cancelled' },
    { id: 'completed', type: 'end', label: 'Completed' },
    { id: 'closed', type: 'end', label: 'Closed' },
    { id: 'sla-note', type: 'note', label: 'Ship within 48 h of payment' },
  ],
  edges: [
    { id: 'e1', from: 'start', to: 'new' },
    { id: 'e2', from: 'new', to: 'validate' },
    { id: 'e3', from: 'validate', to: 'valid' },
    { id: 'e4', from: 'valid', to: 'payment', label: 'yes' },
    { id: 'e5', from: 'valid', to: 'rejected', label: 'no' },
    { id: 'e6', from: 'rejected', to: 'closed' },
    { id: 'e7', from: 'payment', to: 'reserve', label: 'paid' },
    { id: 'e8', from: 'payment', to: 'payment-failed', label: 'failed' },
    { id: 'e9', from: 'payment-failed', to: 'payment', label: 'retry', condition: 'attempts < 3' },
    { id: 'e10', from: 'payment-failed', to: 'cancelled', label: 'give up' },
    { id: 'e11', from: 'new', to: 'cancelled', label: 'customer cancels' },
    { id: 'e12', from: 'reserve', to: 'in-stock' },
    { id: 'e13', from: 'in-stock', to: 'packing', label: 'yes' },
    { id: 'e14', from: 'in-stock', to: 'backorder', label: 'no' },
    { id: 'e15', from: 'backorder', to: 'reserve', label: 'restocked' },
    { id: 'e16', from: 'packing', to: 'shipped' },
    { id: 'e17', from: 'shipped', to: 'delivered' },
    { id: 'e18', from: 'shipped', to: 'delivery-failed', label: 'lost' },
    { id: 'e19', from: 'delivery-failed', to: 'shipped', label: 'resend' },
    { id: 'e20', from: 'delivered', to: 'completed' },
    { id: 'e21', from: 'delivered', to: 'returned', label: 'return' },
    { id: 'e22', from: 'returned', to: 'refund' },
    { id: 'e23', from: 'refund', to: 'closed' },
    { id: 'e24', from: 'cancelled', to: 'closed' },
    { id: 'e25', from: 'sla-note', to: 'packing', kind: 'association' },
  ],
}

/** The path of one instance, step by step: what a fake endpoint replays. */
export const instancePath = ['start', 'new', 'validate', 'valid', 'payment', 'payment-failed', 'payment', 'reserve', 'in-stock', 'packing', 'shipped']

/** A monitoring snapshot at `step` of the instance (0-based), with aggregate counts. */
export function snapshotAt(step: number, at = Date.now()): MonitorSnapshot {
  const k = Math.max(0, Math.min(step, instancePath.length - 1))
  const visited = instancePath.slice(0, k + 1)
  const current = visited[visited.length - 1]!
  const nodes: MonitorSnapshot['nodes'] = {}
  for (const id of visited) nodes[id] = { status: 'done', count: 1 }
  nodes[current] = { status: 'active', count: 1, updatedAt: at }
  // Aggregates over all instances: counts on busy steps, an error hotspot.
  nodes['packing'] = { ...(nodes['packing'] ?? {}), count: 12 + step }
  nodes['backorder'] = { status: 'waiting', count: 3 }
  nodes['delivery-failed'] = { status: 'error', badge: 2, count: 2, message: 'Carrier API timeout' }
  nodes['rejected'] = { ...(nodes['rejected'] ?? {}), status: 'skipped' }
  const edges: MonitorSnapshot['edges'] = {
    e13: { count: 40 + step },
    e14: { count: 3 },
    e18: { count: 2 },
    e9: { count: 5 },
  }
  for (let i = 1; i < visited.length; i++) {
    const from = visited[i - 1]
    const to = visited[i]
    const e = orderProcess.edges.find((x) => x.from === from && x.to === to)
    if (e) edges[e.id] = { ...(edges[e.id] ?? {}), traversed: true }
  }
  return { nodes, edges, path: visited, current: [current], updatedAt: at }
}
