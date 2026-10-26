<script setup lang="ts">
/**
 * The properties panel: the selected node or edge on kit form controls,
 * the selection tools for several nodes, the graph settings for none.
 * Every edit is a command; typing in one field merges into one undo step.
 */
import { computed, nextTick, ref } from 'vue'
import { UidAlert, UidButton, UidFormField, UidInput, UidSelect, UidSwitch, UidTextarea } from '@dskripchenko/ui'
import {
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  AlignCenterHorizontal,
  Plus,
  SquareArrowOutUpRight,
  Trash2,
  X,
  ArrowRight,
} from '@dskripchenko/ui/icons'
import { isEnabled, type Alignment, type Command, type DataValue, type FlowEdge, type FlowNode, type Graph, type NodeTypeRegistry } from '../../index'
import type { FlowLabels } from '../labels'
import { NODE_ICONS } from '../icons'

const props = defineProps<{
  graph: Graph
  selection: readonly string[]
  registry: NodeTypeRegistry
  labels: FlowLabels
  readonly?: boolean
  locked: (node: FlowNode) => boolean
}>()
const emit = defineEmits<{
  command: [command: Command, mergeKey?: string]
  align: [how: Alignment]
  distribute: [axis: 'horizontal' | 'vertical']
  delete: []
  'open-subgraph': [nodeId: string]
  connect: [from: string, to: string]
  select: [id: string]
}>()

const node = computed(() => (props.selection.length === 1 ? props.graph.nodes.find((n) => n.id === props.selection[0]) : undefined))
const edge = computed(() => (props.selection.length === 1 ? props.graph.edges.find((e) => e.id === props.selection[0]) : undefined))
const many = computed(() => props.selection.length > 1)
const headIcon = computed(() => {
  const def = node.value ? props.registry.get(node.value.type) : undefined
  return (def?.icon && NODE_ICONS[def.icon]) || (node.value && NODE_ICONS[node.value.type]) || NODE_ICONS.state
})
const isLocked = computed(() => props.readonly || (!!node.value && props.locked(node.value)))

const typeOptions = computed(() => [...props.registry.entries()].map(([value, def]) => ({ value, label: props.labels.types[value] ?? def.title })))
const kindOptions = computed(() => [
  { value: 'transition', label: props.labels.transition },
  { value: 'association', label: props.labels.association },
])
const joinOptions = computed(() => [
  { value: '', label: props.labels.joinUnset },
  { value: 'all', label: props.labels.joinAll },
  { value: 'any', label: props.labels.joinAny },
])
const triggerOptions = computed(() => [
  { value: '', label: props.labels.triggerNone },
  { value: 'timer', label: props.labels.triggerTimer },
  { value: 'event', label: props.labels.triggerEvent },
])
const groupOptions = computed(() => [{ value: '', label: '—' }, ...(props.graph.groups ?? []).map((g) => ({ value: g.id, label: g.label ?? g.id }))])
const directionOptions = computed(() => [
  { value: 'auto', label: props.labels.directionAuto },
  { value: 'LR', label: props.labels.directionLR },
  { value: 'TB', label: props.labels.directionTB },
])
const outgoing = computed(() => (node.value ? props.graph.edges.filter((e) => e.from === node.value!.id) : []))
const targetOptions = computed(() =>
  props.graph.nodes
    .filter((n) => !props.registry.get(n.type)?.noIncoming && !props.registry.get(n.type)?.annotation)
    .map((n) => ({ value: n.id, label: n.label || props.labels.types[n.type] || n.id })),
)
const nodeLabel = (id: string) => props.graph.nodes.find((n) => n.id === id)?.label ?? id

function patchNode(patch: Record<string, unknown>, field?: string): void {
  if (!node.value || isLocked.value) return
  emit('command', { type: 'updateNode', id: node.value.id, patch }, field ? `${field}:${node.value.id}` : undefined)
}
function patchEdge(patch: Record<string, unknown>, field?: string): void {
  if (!edge.value || props.readonly) return
  emit('command', { type: 'updateEdge', id: edge.value.id, patch }, field ? `${field}:${edge.value.id}` : undefined)
}
const text = (v: string) => (v === '' ? null : v)

// Data rows: key/value strings; values are read back as JSON when they look like it.
type Row = { key: string; value: string }
function rowsOf(el: FlowNode | FlowEdge | undefined): Row[] {
  return Object.entries(el?.data ?? {}).map(([key, v]) => ({ key, value: typeof v === 'string' ? v : JSON.stringify(v) }))
}
function parseValue(v: string): DataValue {
  const t = v.trim()
  if (/^(true|false|null|-?\d+(\.\d+)?|[[{].*[\]}])$/s.test(t)) {
    try {
      return JSON.parse(t) as DataValue
    } catch {
      return v
    }
  }
  return v
}
function writeRows(rows: Row[], field: string): void {
  const data: Record<string, DataValue> = {}
  for (const r of rows) if (r.key.trim()) data[r.key.trim()] = parseValue(r.value)
  const patch = { data: Object.keys(data).length ? data : null }
  if (node.value) patchNode(patch, field)
  else patchEdge(patch, field)
}
const rows = computed(() => rowsOf(node.value ?? edge.value))
/** A row being added that has no key yet (not part of the model). */
const draft = ref<Row | null>(null)
function setRow(i: number, part: 'key' | 'value', v: string): void {
  const next = rows.value.map((r) => ({ ...r }))
  next[i]![part] = v
  writeRows(next, `data-${i}-${part}`)
}
function removeRow(i: number): void {
  writeRows(rows.value.filter((_, j) => j !== i), 'data-remove')
}
async function addRow(): Promise<void> {
  draft.value = { key: '', value: '' }
  await nextTick()
  document.querySelector<HTMLInputElement>('.fl-props__draft input')?.focus()
}
function onDraftFocusOut(e: FocusEvent): void {
  const row = e.currentTarget as HTMLElement
  if (!row.contains(e.relatedTarget as Node | null)) commitDraft()
}
function commitDraft(): void {
  const d = draft.value
  if (!d || !d.key.trim()) return
  draft.value = null
  writeRows([...rows.value, d], 'data-add')
}

const subgraphKind = computed(() => (node.value?.subgraph === undefined ? 'none' : typeof node.value.subgraph === 'string' ? 'ref' : 'inline'))
const drillableType = computed(() => !!node.value && (props.registry.get(node.value.type)?.drillable ?? false))
function createInline(): void {
  patchNode({ subgraph: { version: 1, nodes: [{ id: 'start', type: 'start' }, { id: 'end', type: 'end' }], edges: [] } })
}

defineExpose({
  focusLabel: () => document.querySelector<HTMLInputElement>('.fl-props__label input')?.focus(),
})
</script>

<template>
  <div class="fl-props">
    <!-- Several nodes: layout tools. -->
    <template v-if="many">
      <p class="fl-props__count">
        {{ labels.selectedCount(selection.length) }}
      </p>
      <div
        class="fl-props__tools"
        role="group"
        :aria-label="labels.align"
      >
        <UidButton
          v-for="a in ([
            ['left', AlignStartVertical, labels.alignLeft],
            ['center', AlignCenterVertical, labels.alignCenter],
            ['right', AlignEndVertical, labels.alignRight],
            ['top', AlignStartHorizontal, labels.alignTop],
            ['middle', AlignCenterHorizontal, labels.alignMiddle],
            ['bottom', AlignEndHorizontal, labels.alignBottom],
          ] as const)"
          :key="a[0]"
          size="sm"
          variant="secondary"
          :icon="a[1]"
          :aria-label="a[2]"
          :title="a[2]"
          :disabled="readonly"
          :data-align="a[0]"
          @click="emit('align', a[0])"
        />
        <UidButton
          size="sm"
          variant="secondary"
          :icon="AlignHorizontalSpaceAround"
          :aria-label="labels.distributeH"
          :title="labels.distributeH"
          :disabled="readonly || selection.length < 3"
          @click="emit('distribute', 'horizontal')"
        />
        <UidButton
          size="sm"
          variant="secondary"
          :icon="AlignVerticalSpaceAround"
          :aria-label="labels.distributeV"
          :title="labels.distributeV"
          :disabled="readonly || selection.length < 3"
          @click="emit('distribute', 'vertical')"
        />
      </div>
      <UidButton
        variant="danger"
        size="sm"
        :icon="Trash2"
        :disabled="readonly"
        class="fl-props__delete"
        @click="emit('delete')"
      >
        {{ labels.delete }}
      </UidButton>
    </template>

    <!-- One node. -->
    <template v-else-if="node">
      <div class="fl-props__head">
        <component
          :is="headIcon"
          :size="16"
          aria-hidden="true"
        />
        <span class="fl-props__kind">{{ labels.types[node.type] ?? registry.get(node.type)?.title ?? node.type }}</span>
        <code
          class="fl-props__id"
          :title="node.id"
        >{{ node.id }}</code>
      </div>
      <UidAlert
        v-if="isLocked && !readonly"
        variant="info"
      >
        {{ labels.locked }}
      </UidAlert>
      <UidInput
        class="fl-props__label"
        :label="labels.label"
        :model-value="node.label ?? ''"
        :disabled="isLocked"
        @update:model-value="(v: string) => patchNode({ label: text(v) }, 'label')"
      />
      <UidTextarea
        :label="labels.description"
        :rows="2"
        auto-grow
        :max-rows="5"
        :model-value="node.description ?? ''"
        :disabled="isLocked"
        @update:model-value="(v: string) => patchNode({ description: text(v) }, 'description')"
      />
      <UidFormField :label="labels.nodeType">
        <UidSelect
          :options="typeOptions"
          :model-value="node.type"
          :disabled="isLocked"
          @update:model-value="(v) => patchNode({ type: String(v) })"
        />
      </UidFormField>
      <UidFormField
        v-if="registry.get(node.type)?.regions"
        :label="labels.join"
      >
        <UidSelect
          :options="joinOptions"
          :model-value="node.join ?? ''"
          :disabled="isLocked"
          @update:model-value="(v) => patchNode({ join: v === 'all' || v === 'any' ? v : null })"
        />
      </UidFormField>
      <UidFormField
        v-if="graph.groups?.length"
        :label="labels.group"
      >
        <UidSelect
          :options="groupOptions"
          :model-value="node.group ?? ''"
          :disabled="isLocked"
          @update:model-value="(v) => patchNode({ group: v ? String(v) : null })"
        />
      </UidFormField>
      <UidSwitch
        :label="labels.enabled"
        :model-value="isEnabled(node)"
        :disabled="isLocked"
        @update:model-value="(v: boolean) => emit('command', { type: 'setEnabled', kind: 'node', id: node!.id, enabled: v })"
      />

      <section
        v-if="!registry.get(node.type)?.annotation"
        class="fl-props__section fl-props__transitions"
      >
        <h4>{{ labels.transitions }}</h4>
        <UidButton
          v-for="e in outgoing"
          :key="e.id"
          size="sm"
          variant="ghost"
          :icon="ArrowRight"
          class="fl-props__transition"
          @click="emit('select', e.id)"
        >
          {{ nodeLabel(e.to) }}<span
            v-if="e.label"
            class="fl-props__muted"
          > · {{ e.label }}</span>
        </UidButton>
        <UidSelect
          v-if="!isLocked && !registry.get(node.type)?.noOutgoing"
          class="fl-props__connect"
          :options="targetOptions"
          :model-value="''"
          :placeholder="labels.addTransition"
          searchable
          size="sm"
          @update:model-value="(v) => v && emit('connect', node!.id, String(v))"
        />
      </section>

      <section
        v-if="drillableType || subgraphKind !== 'none'"
        class="fl-props__section"
      >
        <h4>{{ labels.subprocess }}</h4>
        <template v-if="subgraphKind === 'inline'">
          <p class="fl-props__muted">
            {{ labels.subgraphInline((node.subgraph as Graph).nodes.length) }}
          </p>
          <div class="fl-props__row">
            <UidButton
              size="sm"
              variant="secondary"
              :icon="SquareArrowOutUpRight"
              @click="emit('open-subgraph', node!.id)"
            >
              {{ labels.subgraphOpen }}
            </UidButton>
            <UidButton
              size="sm"
              variant="ghost"
              :disabled="isLocked"
              @click="patchNode({ subgraph: null })"
            >
              {{ labels.subgraphRemove }}
            </UidButton>
          </div>
        </template>
        <template v-else>
          <UidInput
            :label="labels.subgraphRef"
            :model-value="(node.subgraph as string | undefined) ?? ''"
            :disabled="isLocked"
            placeholder="payment-v2"
            @update:model-value="(v: string) => patchNode({ subgraph: text(v) }, 'subgraph')"
          />
          <UidButton
            v-if="subgraphKind === 'none'"
            size="sm"
            variant="secondary"
            :icon="Plus"
            :disabled="isLocked"
            @click="createInline"
          >
            {{ labels.subgraphCreate }}
          </UidButton>
        </template>
      </section>
    </template>

    <!-- One edge. -->
    <template v-else-if="edge">
      <div class="fl-props__head">
        <component
          :is="ArrowRight"
          :size="16"
          aria-hidden="true"
        />
        <span class="fl-props__kind">{{ labels.edge }}</span>
        <code
          class="fl-props__id"
          :title="edge.id"
        >{{ edge.id }}</code>
      </div>
      <p class="fl-props__muted fl-props__route">
        {{ nodeLabel(edge.from) }} → {{ nodeLabel(edge.to) }}
      </p>
      <UidInput
        class="fl-props__label"
        :label="labels.label"
        :model-value="edge.label ?? ''"
        :disabled="readonly"
        @update:model-value="(v: string) => patchEdge({ label: text(v) }, 'label')"
      />
      <UidInput
        class="fl-props__condition"
        :label="labels.condition"
        :model-value="edge.condition ?? ''"
        :disabled="readonly"
        placeholder="attempts < 3"
        @update:model-value="(v: string) => patchEdge({ condition: text(v) }, 'condition')"
      />
      <UidFormField :label="labels.edgeKind">
        <UidSelect
          :options="kindOptions"
          :model-value="edge.kind ?? 'transition'"
          :disabled="readonly"
          @update:model-value="(v) => patchEdge({ kind: v === 'association' ? 'association' : null })"
        />
      </UidFormField>
      <UidFormField
        v-if="edge.kind !== 'association'"
        :label="labels.trigger"
      >
        <UidSelect
          :options="triggerOptions"
          :model-value="edge.trigger ?? ''"
          :disabled="readonly"
          @update:model-value="(v) => patchEdge({ trigger: v === 'timer' || v === 'event' ? v : null })"
        />
      </UidFormField>
      <UidSwitch
        :label="labels.enabled"
        :model-value="isEnabled(edge)"
        :disabled="readonly"
        @update:model-value="(v: boolean) => emit('command', { type: 'setEnabled', kind: 'edge', id: edge!.id, enabled: v })"
      />
    </template>

    <!-- Nothing: the graph's own settings. -->
    <template v-else>
      <p class="fl-props__muted">
        {{ labels.nothingSelected }}
      </p>
      <UidInput
        :label="labels.graphTitle"
        :model-value="graph.meta?.title ?? ''"
        :disabled="readonly"
        @update:model-value="(v: string) => emit('command', { type: 'updateMeta', patch: { title: text(v) } }, 'meta-title')"
      />
      <UidFormField :label="labels.direction">
        <UidSelect
          :options="directionOptions"
          :model-value="graph.meta?.direction ?? 'auto'"
          :disabled="readonly"
          @update:model-value="(v) => emit('command', { type: 'updateMeta', patch: { direction: v === 'auto' ? null : v } })"
        />
      </UidFormField>
    </template>

    <!-- Data, for a node or an edge. -->
    <section
      v-if="(node || edge) && !many"
      class="fl-props__section"
    >
      <h4>{{ labels.data }}</h4>
      <div
        v-for="(r, i) in rows"
        :key="i"
        class="fl-props__kv"
      >
        <UidInput
          size="sm"
          :model-value="r.key"
          :aria-label="labels.key"
          :placeholder="labels.key"
          :disabled="isLocked"
          @update:model-value="(v: string) => setRow(i, 'key', v)"
        />
        <UidInput
          size="sm"
          :model-value="r.value"
          :aria-label="labels.value"
          :placeholder="labels.value"
          :disabled="isLocked"
          @update:model-value="(v: string) => setRow(i, 'value', v)"
        />
        <UidButton
          size="sm"
          variant="ghost"
          :icon="X"
          :aria-label="labels.removeField"
          :disabled="isLocked"
          @click="removeRow(i)"
        />
      </div>
      <div
        v-if="draft"
        class="fl-props__kv fl-props__draft"
        @focusout="onDraftFocusOut"
      >
        <UidInput
          v-model="draft.key"
          size="sm"
          :aria-label="labels.key"
          :placeholder="labels.key"
          @keydown.enter="commitDraft"
        />
        <UidInput
          v-model="draft.value"
          size="sm"
          :aria-label="labels.value"
          :placeholder="labels.value"
          @keydown.enter="commitDraft"
        />
        <UidButton
          size="sm"
          variant="ghost"
          :icon="X"
          :aria-label="labels.cancel"
          @click="draft = null"
        />
      </div>
      <UidButton
        size="sm"
        variant="ghost"
        :icon="Plus"
        :disabled="isLocked"
        class="fl-props__add"
        @click="addRow"
      >
        {{ labels.addField }}
      </UidButton>
    </section>

    <UidButton
      v-if="(node || edge) && !many"
      variant="ghost"
      size="sm"
      :icon="Trash2"
      :disabled="isLocked"
      class="fl-props__delete"
      @click="emit('delete')"
    >
      {{ labels.delete }}
    </UidButton>
  </div>
</template>
