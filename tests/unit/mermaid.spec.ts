import { describe, expect, it } from 'vitest'
import { fromMermaid, isMermaidFlow } from '../../src/mermaid'
import { validateGraph, type Graph } from '../../src/index'

describe('fromMermaid', () => {
  it('imports a state diagram with a composite as a sub-process', () => {
    const g = fromMermaid(`stateDiagram-v2
      [*] --> Draft
      Draft --> Review: submit
      Review --> Draft: changes requested
      state Review {
        [*] --> Legal
        Legal --> Finance
        Finance --> [*]
      }
      Review --> Published: approve
      Published --> [*]
      note right of Draft: Authors only`)
    expect(g.nodes.map((n) => `${n.id}:${n.type}`).sort()).toEqual(['Draft:state', 'Published:state', 'Review:subprocess', 'end:end', 'note-1:note', 'start:start'].sort())
    const review = g.nodes.find((n) => n.id === 'Review')!
    const sub = review.subgraph as Graph
    expect(sub.nodes.map((n) => n.id).sort()).toEqual(['Finance', 'Legal', 'Review-end', 'Review-start'].sort())
    expect(sub.edges).toHaveLength(3)
    expect(g.edges.find((e) => e.label === 'changes requested')).toMatchObject({ from: 'Review', to: 'Draft' })
    expect(g.edges.find((e) => e.kind === 'association')).toMatchObject({ from: 'note-1', to: 'Draft' })
    expect(validateGraph(g)).toEqual([])
    expect(g.meta?.direction).toBe('TB')
  })

  it('lifts transitions into a composite to the composite', () => {
    const g = fromMermaid(`stateDiagram-v2
      direction LR
      state Box {
        Inner --> [*]
      }
      [*] --> A
      A --> Inner
      Box --> [*]`)
    expect(g.edges.find((e) => e.from === 'A')!.to).toBe('Box')
    expect(g.meta?.direction).toBe('LR')
  })

  it('imports a flowchart with shapes and subgraphs', () => {
    const g = fromMermaid(`flowchart LR
      S((Start)) --> V[Validate]
      V --> D{OK?}
      D -->|yes| P[[Pay]]
      D -->|no| X(Rejected)
      P --> E(((Done)))
      subgraph Back office
        V
      end`)
    const type = Object.fromEntries(g.nodes.map((n) => [n.id, n.type]))
    expect(type).toMatchObject({ S: 'start', V: 'task', D: 'decision', P: 'subprocess', X: 'state', E: 'end' })
    expect(g.groups).toHaveLength(1)
    expect(g.edges.find((e) => e.from === 'D' && e.to === 'P')!.label).toBe('yes')
  })

  it('refuses other diagram types and reports syntax errors', () => {
    expect(() => fromMermaid('pie\n "a": 1')).toThrow(/Only stateDiagram/)
    expect(() => fromMermaid('stateDiagram-v2\n A --> ')).toThrow()
    expect(isMermaidFlow('stateDiagram-v2\n')).toBe(true)
    expect(isMermaidFlow('%% c\nflowchart TD\n')).toBe(true)
    expect(isMermaidFlow('sequenceDiagram')).toBe(false)
  })
})
