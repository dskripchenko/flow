<script setup lang="ts">
/** The editor on the order process; the model and the last change are shown for checks. */
import { ref } from 'vue'
import { FlowEditor, type ChangeEvent } from '../src/vue'
import { fromMermaid } from '../src/mermaid'
import { emptyGraph, NOTATIONS, notationRegistry, stringifyGraph, type Graph } from '../src/index'
import { dfdShop, epcOrder, idef0Make } from '../tests/fixtures/notations'
import { orderProcess } from '../tests/fixtures/order'
import { largeGraph } from '../tests/fixtures/large'

defineProps<{ locale: string }>()
const params = new URLSearchParams(location.search)
const start = params.get('graph')
const n = params.get('notation')
const notation = n === 'epc' || n === 'dfd' || n === 'idef0' ? n : undefined
const graph = ref<Graph>(notation ? structuredClone({ epc: epcOrder, dfd: dfdShop, idef0: idef0Make }[notation]) : start === 'empty' ? emptyGraph() : start === 'large' ? largeGraph(Number(params.get('n') ?? 500)) : structuredClone(orderProcess))
const last = ref('')
function onChange(e: ChangeEvent): void {
  last.value = `${e.source}: ${e.description}`
}
;(window as unknown as { __flow: () => string }).__flow = () => stringifyGraph(graph.value)
</script>

<template>
  <div class="pg-editor">
    <FlowEditor
      v-model="graph"
      :locale="locale"
      :mermaid="fromMermaid"
      :registry="notation ? notationRegistry(notation) : undefined"
      :palette="notation ? NOTATIONS[notation].palette : undefined"
      @change="onChange"
    />
    <output
      class="pg-last"
      data-testid="last-change"
    >{{ last }}</output>
  </div>
</template>

<style>
.pg-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 12px;
  box-sizing: border-box;
}
.pg-editor > .fl-editor {
  flex: 1 1 auto;
  min-height: 0;
}
.pg-last {
  display: none;
}
</style>
