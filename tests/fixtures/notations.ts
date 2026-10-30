import type { Graph } from '../../src/index'

/** An EPC: order handling, events and functions alternating, an XOR split and join. */
export const epcOrder: Graph = {
  version: 1,
  meta: { title: 'Order handling (EPC)', direction: 'TB' },
  nodes: [
    { id: 'received', type: 'epc-event', label: 'Order received' },
    { id: 'check', type: 'epc-function', label: 'Check order' },
    { id: 'sales', type: 'epc-org', label: 'Sales' },
    { id: 'crm', type: 'epc-system', label: 'CRM' },
    { id: 'xor1', type: 'epc-xor' },
    { id: 'ok', type: 'epc-event', label: 'Order is valid' },
    { id: 'bad', type: 'epc-event', label: 'Order is invalid' },
    { id: 'invoice', type: 'epc-function', label: 'Issue invoice' },
    { id: 'inv-doc', type: 'epc-document', label: 'Invoice' },
    { id: 'reject', type: 'epc-function', label: 'Reject order' },
    { id: 'xor2', type: 'epc-xor' },
    { id: 'done', type: 'epc-event', label: 'Order handled' },
    { id: 'shipping', type: 'epc-path', label: 'Shipping' },
  ],
  edges: [
    { id: 'e1', from: 'received', to: 'check' },
    { id: 'e2', from: 'sales', to: 'check', kind: 'association' },
    { id: 'e3', from: 'crm', to: 'check', kind: 'association' },
    { id: 'e4', from: 'check', to: 'xor1' },
    { id: 'e5', from: 'xor1', to: 'ok' },
    { id: 'e6', from: 'xor1', to: 'bad' },
    { id: 'e7', from: 'ok', to: 'invoice' },
    { id: 'e8', from: 'invoice', to: 'inv-doc', kind: 'association' },
    { id: 'e9', from: 'bad', to: 'reject' },
    { id: 'e10', from: 'invoice', to: 'xor2' },
    { id: 'e11', from: 'reject', to: 'xor2' },
    { id: 'e12', from: 'xor2', to: 'done' },
    { id: 'e13', from: 'done', to: 'shipping' },
  ],
}

/** A DFD: a context-level view of an online shop. */
export const dfdShop: Graph = {
  version: 1,
  meta: { title: 'Online shop (DFD)', direction: 'LR' },
  nodes: [
    { id: 'customer', type: 'dfd-entity', label: 'Customer' },
    { id: 'p1', type: 'dfd-process', label: 'Take order', data: { number: '1' } },
    { id: 'p2', type: 'dfd-process', label: 'Charge payment', data: { number: '2' } },
    { id: 'bank', type: 'dfd-entity', label: 'Bank' },
    { id: 'orders', type: 'dfd-store', label: 'Orders', data: { number: 'D1' } },
  ],
  edges: [
    { id: 'f1', from: 'customer', to: 'p1', label: 'order' },
    { id: 'f2', from: 'p1', to: 'orders', label: 'order record' },
    { id: 'f3', from: 'p1', to: 'p2', label: 'amount due' },
    { id: 'f4', from: 'p2', to: 'bank', label: 'charge' },
    { id: 'f5', from: 'bank', to: 'p2', label: 'confirmation' },
    { id: 'f6', from: 'p2', to: 'customer', label: 'receipt' },
  ],
}

/** An IDEF0 decomposition: two functions with their inputs, controls, outputs and mechanisms. */
export const idef0Make: Graph = {
  version: 1,
  meta: { title: 'Make to order (IDEF0)', direction: 'LR' },
  nodes: [
    { id: 'in-order', type: 'idef0-boundary', label: 'Customer order' },
    { id: 'policy', type: 'idef0-boundary', label: 'Sales policy' },
    { id: 'staff', type: 'idef0-boundary', label: 'Sales staff' },
    { id: 'a1', type: 'idef0-function', label: 'Plan production', data: { number: 'A1' } },
    { id: 'a2', type: 'idef0-function', label: 'Build product', data: { number: 'A2' } },
    { id: 'workshop', type: 'idef0-boundary', label: 'Workshop' },
    { id: 'product', type: 'idef0-boundary', label: 'Product' },
  ],
  edges: [
    { id: 'i1', from: 'in-order', to: 'a1', toPort: 'input', label: 'order' },
    { id: 'c1', from: 'policy', to: 'a1', toPort: 'control', label: 'policy' },
    { id: 'm1', from: 'staff', to: 'a1', toPort: 'mechanism', label: 'staff' },
    { id: 'o1', from: 'a1', to: 'a2', fromPort: 'output', toPort: 'input', label: 'production plan' },
    { id: 'm2', from: 'workshop', to: 'a2', toPort: 'mechanism', label: 'workshop' },
    { id: 'o2', from: 'a2', to: 'product', fromPort: 'output', label: 'product' },
  ],
}
