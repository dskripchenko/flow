<script setup lang="ts">
/** Import a model from pasted JSON or Mermaid source, in a kit modal. */
import { computed, ref, watch } from 'vue'
import { UidAlert, UidButton, UidModal, UidTextarea } from '@dskripchenko/ui'
import { parseGraph, type Graph } from '../../index'
import type { FlowLabels } from '../labels'

const props = defineProps<{
  open: boolean
  mode: 'json' | 'mermaid'
  labels: FlowLabels
  mermaid?: (source: string) => Graph
}>()
const emit = defineEmits<{ 'update:open': [v: boolean]; import: [graph: Graph] }>()

const source = ref('')
const error = ref('')
watch(
  () => props.open,
  (o) => {
    if (o) {
      source.value = ''
      error.value = ''
    }
  },
)
const title = computed(() => (props.mode === 'json' ? props.labels.importJson : props.labels.importMermaid))

function apply(): void {
  try {
    const graph = props.mode === 'json' ? parseGraph(source.value) : props.mermaid!(source.value)
    emit('import', graph)
    emit('update:open', false)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <UidModal
    :model-value="open"
    :title="title"
    size="lg"
    @update:model-value="(v: boolean) => emit('update:open', v)"
  >
    <div class="fl-import">
      <UidTextarea
        v-model="source"
        class="fl-import__source"
        :rows="12"
        :placeholder="mode === 'json' ? labels.importPlaceholderJson : labels.importPlaceholderMermaid"
        :aria-label="title"
      />
      <UidAlert
        v-if="error"
        variant="danger"
        :title="labels.importError"
      >
        {{ error }}
      </UidAlert>
    </div>
    <template #footer>
      <UidButton
        variant="ghost"
        @click="emit('update:open', false)"
      >
        {{ labels.cancel }}
      </UidButton>
      <UidButton
        variant="primary"
        class="fl-import__apply"
        :disabled="!source.trim()"
        @click="apply"
      >
        {{ labels.importApply }}
      </UidButton>
    </template>
  </UidModal>
</template>
