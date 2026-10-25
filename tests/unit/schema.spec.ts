import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BUILTIN_TYPES } from '../../src/index'

const read = (f: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../schema', f), 'utf8'))

describe('JSON schemas', () => {
  it('describe every built-in node type and the snapshot fields', () => {
    const graph = read('graph.schema.json')
    const text = graph.$defs.node.properties.type.description as string
    for (const t of Object.keys(BUILTIN_TYPES)) expect(text).toContain(t)
    expect(graph.$defs.edge.required).toEqual(['id', 'from', 'to'])
    const snap = read('snapshot.schema.json')
    expect(Object.keys(snap.properties)).toEqual(['nodes', 'edges', 'path', 'current', 'updatedAt'])
  })
})
