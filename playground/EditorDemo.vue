<script setup lang="ts">
/** The editor on the order process; the model and the last change are shown for checks. */
import { ref } from 'vue'
import { FlowEditor, type ChangeEvent } from '../src/vue'
import { fromMermaid } from '../src/mermaid'
import { emptyGraph, stringifyGraph, type Graph } from '../src/index'
import { orderProcess } from '../tests/fixtures/order'
import { largeGraph } from '../tests/fixtures/large'

defineProps<{ locale: string }>()
const params = new URLSearchParams(location.search)
const start = params.get('graph')
const graph = ref<Graph>(start === 'empty' ? emptyGraph() : start === 'large' ? largeGraph(Number(params.get('n') ?? 500)) : structuredClone(orderProcess))
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
