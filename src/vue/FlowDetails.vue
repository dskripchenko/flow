<script setup lang="ts">
/**
 * The body of the details drawer: what an element is, its monitoring state,
 * its data, and the host's slot for history or actions.
 */
import { computed } from 'vue'
import { UidBadge, UidButton, UidDescriptionItem, UidDescriptionList, UidSwitch, UidTag } from '@dskripchenko/ui'
import { SquareArrowOutUpRight } from 'lucide-vue-next'
import { STATUS_TONES, toEpoch, type DataValue, type FlowEdge, type FlowNode, type Graph, type MonitorState } from '../index'
import type { FlowLabels } from './labels'

const props = defineProps<{
  graph: Graph
  kind: 'node' | 'edge'
  element: FlowNode | FlowEdge
  enabled: boolean
  state?: MonitorState
  labels: FlowLabels
  toggleable?: boolean
  drillable?: boolean
  statusTones?: Record<string, string>
  locale?: string
}>()
const emit = defineEmits<{ toggle: [enabled: boolean]; enter: [] }>()

const node = computed(() => (props.kind === 'node' ? (props.element as FlowNode) : undefined))
const edge = computed(() => (props.kind === 'edge' ? (props.element as FlowEdge) : undefined))
const run = computed(() => (node.value ? props.state?.nodes[node.value.id] : undefined))
const edgeRun = computed(() => (edge.value ? props.state?.edges[edge.value.id] : undefined))
const nodeLabel = (id: string) => props.graph.nodes.find((n) => n.id === id)?.label ?? id

const badgeVariant = computed(() => {
  const s = run.value?.status
  if (!s) return 'default'
  const tone = props.statusTones?.[s] ?? STATUS_TONES[s] ?? 'neutral'
  return tone === 'accent' ? 'info' : tone === 'neutral' ? 'default' : tone
})
const updated = computed(() => {
  const t = toEpoch(run.value?.updatedAt)
  return t === undefined ? '' : new Date(t).toLocaleString(props.locale)
})
const data = computed(() => Object.entries(props.element.data ?? {}))
function show(v: DataValue): string {
  return v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v)
}
</script>

<template>
  <div class="fl-details">
    <div class="fl-details__head">
      <UidTag size="sm">
        {{ node ? (labels.types[node.type] ?? node.type) : labels.edge }}
      </UidTag>
      <UidBadge
        v-if="run?.status"
        :variant="badgeVariant as 'default'"
        class="fl-details__status"
      >
        {{ labels.statuses[run.status] ?? run.status }}
      </UidBadge>
      <UidBadge
        v-if="!enabled"
        variant="warning"
      >
        {{ labels.disabledTag }}
      </UidBadge>
    </div>

    <p
      v-if="node?.description"
      class="fl-details__desc"
    >
      {{ node.description }}
    </p>

    <UidSwitch
      v-if="toggleable"
      class="fl-details__toggle"
      :model-value="enabled"
      :label="labels.enabled"
      @update:model-value="(v: boolean) => emit('toggle', v)"
    />

    <UidButton
      v-if="drillable"
      class="fl-details__enter"
      variant="secondary"
      size="sm"
      :icon="SquareArrowOutUpRight"
      @click="emit('enter')"
    >
      {{ labels.enter }}
    </UidButton>

    <UidDescriptionList
      size="sm"
      direction="horizontal"
      :columns="1"
      label-width="40%"
    >
      <UidDescriptionItem
        :label="labels.id"
        copyable
      >
        <code>{{ element.id }}</code>
      </UidDescriptionItem>
      <template v-if="edge">
        <UidDescriptionItem :label="labels.from">
          {{ nodeLabel(edge.from) }}
        </UidDescriptionItem>
        <UidDescriptionItem :label="labels.to">
          {{ nodeLabel(edge.to) }}
        </UidDescriptionItem>
        <UidDescriptionItem
          v-if="edge.condition"
          :label="labels.condition"
        >
          <code>{{ edge.condition }}</code>
        </UidDescriptionItem>
        <UidDescriptionItem
          v-if="edgeRun?.count !== undefined"
          :label="labels.count"
        >
          {{ edgeRun.count }}
        </UidDescriptionItem>
        <UidDescriptionItem
          v-if="edgeRun?.traversed !== undefined"
          :label="labels.traversed"
        >
          {{ edgeRun.traversed ? '✓' : '—' }}
        </UidDescriptionItem>
      </template>
      <template v-if="run">
        <UidDescriptionItem
          v-if="run.count !== undefined"
          :label="labels.instances"
        >
          {{ run.count }}
        </UidDescriptionItem>
        <UidDescriptionItem
          v-if="run.message"
          :label="labels.message"
        >
          {{ run.message }}
        </UidDescriptionItem>
        <UidDescriptionItem
          v-if="updated"
          :label="labels.updated"
        >
          {{ updated }}
        </UidDescriptionItem>
      </template>
    </UidDescriptionList>

    <template v-if="data.length">
      <h3 class="fl-details__section">
        {{ labels.data }}
      </h3>
      <UidDescriptionList
        size="sm"
        direction="horizontal"
        :columns="1"
        label-width="40%"
      >
        <UidDescriptionItem
          v-for="[k, v] in data"
          :key="k"
          :label="k"
        >
          {{ show(v) }}
        </UidDescriptionItem>
      </UidDescriptionList>
    </template>

    <slot />
  </div>
</template>
