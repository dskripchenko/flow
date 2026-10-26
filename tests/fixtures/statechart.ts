import type { Graph } from '../../src/index'

/** A claim process with the 1.1 types: a parallel state, timers, an "any state" source. */
export const claimProcess: Graph = {
  version: 1,
  meta: { title: 'Claim', direction: 'LR' },
  nodes: [
    { id: 'start', type: 'start' },
    { id: 'any', type: 'any', label: 'any state' },
    { id: 'filing', type: 'state', label: 'Filing' },
    {
      id: 'review',
      type: 'parallel',
      label: 'Review',
      join: 'all',
      subgraph: {
        version: 1,
        groups: [
          { id: 'docs', label: 'Documents' },
          { id: 'approval', label: 'Approval' },
        ],
        nodes: [
          { id: 'docs.start', type: 'start', group: 'docs' },
          { id: 'collect', type: 'state', label: 'Collect', group: 'docs' },
          { id: 'docs.end', type: 'end', group: 'docs' },
          { id: 'approval.start', type: 'start', group: 'approval' },
          { id: 'wait-answer', type: 'wait', label: 'Answer', group: 'approval' },
          { id: 'approval.end', type: 'end', group: 'approval' },
        ],
        edges: [
          { id: 'd1', from: 'docs.start', to: 'collect' },
          { id: 'd2', from: 'collect', to: 'docs.end' },
          { id: 'a1', from: 'approval.start', to: 'wait-answer' },
          { id: 'a2', from: 'wait-answer', to: 'approval.end', trigger: 'event', label: 'approved' },
        ],
      },
    },
    { id: 'reminder', type: 'timer', label: '10 days' },
    { id: 'done', type: 'end', label: 'Settled' },
    { id: 'cancelled', type: 'end', label: 'Cancelled' },
  ],
  edges: [
    { id: 'e1', from: 'start', to: 'filing' },
    { id: 'e2', from: 'filing', to: 'review', label: 'submit' },
    { id: 'e3', from: 'review', to: 'reminder' },
    { id: 'e4', from: 'reminder', to: 'done', trigger: 'timer' },
    { id: 'e5', from: 'any', to: 'cancelled', label: 'cancel', trigger: 'event' },
  ],
}

/** The same process as flow 1.0.x exports drew it: subprocess + data.kind, a start with "(any state)". */
export const claimProcessV10: Graph = {
  version: 1,
  nodes: [
    { id: 'start', type: 'start' },
    { id: 'filing', type: 'state', label: 'Filing', data: { timers: 1 } },
    {
      id: 'review',
      type: 'subprocess',
      label: 'Review',
      data: { kind: 'parallel', join: 'all' },
      subgraph: {
        version: 1,
        groups: [{ id: 'docs', label: 'Documents' }],
        nodes: [
          { id: 'docs.start', type: 'start', group: 'docs' },
          { id: 'docs.end', type: 'end', group: 'docs' },
        ],
        edges: [{ id: 'd1', from: 'docs.start', to: 'docs.end' }],
      },
    },
    { id: 'done', type: 'end' },
  ],
  edges: [
    { id: 'e1', from: 'start', to: 'filing' },
    { id: 'e2', from: 'filing', to: 'review', label: '⏱ 10 days' },
    { id: 'e3', from: 'review', to: 'done' },
    { id: 'e4', from: 'start', to: 'done', label: 'cancel (any state)' },
  ],
}
