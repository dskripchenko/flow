<script setup lang="ts">
/**
 * FlowView — a process or state machine, read-only, with live monitoring,
 * enable/disable switches, drill-down into sub-processes and a details
 * drawer. Built on @dskripchenko/ui.
 */
import { computed, ref, shallowRef, watch, type Component } from 'vue'
import {
  UidBadge,
  UidBreadcrumb,
  UidBreadcrumbItem,
  UidButton,
  UidDrawer,
  UidLocaleProvider,
  UidSpinner,
  UidToastProvider,
  UidTooltip,
  en as uidEn,
  ru as uidRu,
  useToast,
} from '@dskripchenko/ui'
import { ChevronLeft, RefreshCw } from '@dskripchenko/ui/icons'
import { STATUS_TONES, defaultRegistry, isEnabled, statusSummary, type ElementRef, type FlowEdge, type FlowNode, type Graph, type MonitorSnapshot, type MonitorState, type NodeTypeRegistry, type Routing } from '../index'
import FlowCanvas from './FlowCanvas.vue'
import FlowDetails from './FlowDetails.vue'
import { resolveLabels, type FlowLabels } from './labels'
import { useMonitor, type PollContext, type PollOptions } from './useMonitor'

export interface ToggleChange {
  kind: 'node' | 'edge'
  id: string
  enabled: boolean
  /** Node ids of the sub-processes entered, root first; empty at the root. */
  path: string[]
}

export interface NavigationLevel {
  /** The sub-process node entered (empty for the root). */
  nodeId: string
  label: string
  /** The node's `subgraph` when it is a reference. */
  ref?: string
  graph: Graph
}

// The root is the kit's locale provider (a fragment): attributes go to the real root.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    graph: Graph
    /** Monitoring for the displayed graph: a snapshot or a reduced state. */
    state?: MonitorSnapshot | MonitorState
    /** Poll a monitoring endpoint instead of passing `state`. */
    poll?: PollOptions
    /** After how long without data the overlay warns; 3 poll intervals (min 15 s) by default. */
    staleAfterMs?: number
    toggleable?: boolean
    /** Persists a toggle; a rejection rolls it back and shows an error. */
    onToggle?: (change: ToggleChange) => Promise<unknown> | unknown
    /** Graphs for string `subgraph` references. */
    subgraphs?: Record<string, Graph>
    /** Loads a string `subgraph` reference not found in `subgraphs`. */
    loadSubgraph?: (ref: string, node: FlowNode) => Promise<Graph>
    /** The built-in details drawer; set false to handle `select` yourself. */
    details?: boolean
    minimap?: boolean
    controls?: boolean
    /** Layout direction; `auto` (the default without `meta.direction`) follows the canvas shape. */
    direction?: 'TB' | 'LR' | 'auto'
    routing?: Routing
    registry?: NodeTypeRegistry
    nodeRenderers?: Record<string, Component>
    nodeIcons?: Record<string, Component>
    statusTones?: Record<string, string>
    locale?: 'en' | 'ru' | string
    labels?: Partial<FlowLabels>
    wheel?: 'zoom' | 'pan'
    minZoom?: number
    maxZoom?: number
    /** Mount the kit's toast provider (set false when the app already has one). */
    toastProvider?: boolean
    /** A status line with the last update, staleness and a summary. */
    statusBar?: boolean
  }>(),
  {
    state: undefined,
    poll: undefined,
    staleAfterMs: undefined,
    onToggle: undefined,
    subgraphs: () => ({}),
    loadSubgraph: undefined,
    details: true,
    minimap: true,
    controls: true,
    direction: undefined,
    routing: 'spline',
    registry: () => defaultRegistry,
    nodeRenderers: () => ({}),
    nodeIcons: () => ({}),
    statusTones: () => ({}),
    locale: 'en',
    labels: undefined,
    wheel: 'zoom',
    minZoom: 0.15,
    maxZoom: 2.5,
    toastProvider: true,
    statusBar: true,
  },
)

const emit = defineEmits<{
  select: [element: (ElementRef & { element: FlowNode | FlowEdge; path: string[] }) | null]
  toggle: [change: ToggleChange]
  'toggle-error': [change: ToggleChange, error: unknown]
  navigate: [stack: NavigationLevel[]]
  'poll-error': [error: unknown]
  'update:minimap': [value: boolean]
}>()

defineSlots<{
  /** Extra content in the details drawer (history, actions). */
  details?(props: { kind: 'node' | 'edge'; element: FlowNode | FlowEdge; state?: MonitorState; path: string[] }): unknown
  /** Custom content of the details drawer header. */
  'details-header'?(props: { kind: 'node' | 'edge'; element: FlowNode | FlowEdge }): unknown
  /** Extra controls in the corner bar. */
  controls?(): unknown
  /** Replaces the empty-graph message. */
  empty?(): unknown
}>()

const L = computed(() => resolveLabels(props.locale, props.labels))
const kitLocale = computed(() => (props.locale === 'ru' ? uidRu : uidEn))
const toast = useToast()

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const stack = shallowRef<NavigationLevel[]>([])
const loadingSub = ref(false)
watch(
  () => props.graph,
  () => {
    // A new root keeps the user where they are only if the path still exists.
    const next: NavigationLevel[] = []
    let g = props.graph
    for (const level of stack.value) {
      const n = g.nodes.find((x) => x.id === level.nodeId)
      if (!n || n.subgraph === undefined) break
      const sub = typeof n.subgraph === 'string' ? (props.subgraphs[n.subgraph] ?? (n.subgraph === level.ref ? level.graph : undefined)) : n.subgraph
      if (!sub) break
      next.push({ ...level, graph: sub })
      g = sub
    }
    stack.value = next
    overrides.value = new Map()
  },
)
const shown = computed<Graph>(() => stack.value[stack.value.length - 1]?.graph ?? props.graph)
const path = computed(() => stack.value.map((l) => l.nodeId))
const levelKey = computed(() => path.value.join('/'))

function canEnter(n: FlowNode): boolean {
  if (n.subgraph === undefined) return false
  if (typeof n.subgraph !== 'string') return true
  return !!props.subgraphs[n.subgraph] || !!props.loadSubgraph
}

async function enter(nodeId: string): Promise<void> {
  const n = shown.value.nodes.find((x) => x.id === nodeId)
  if (!n || !canEnter(n) || loadingSub.value) return
  let g: Graph | undefined
  const ref = typeof n.subgraph === 'string' ? n.subgraph : undefined
  if (ref === undefined) g = n.subgraph as Graph
  else if (props.subgraphs[ref]) g = props.subgraphs[ref]
  else if (props.loadSubgraph) {
    loadingSub.value = true
    try {
      g = await props.loadSubgraph(ref, n)
    } catch (e) {
      toast.error({ title: L.value.subgraphFailed, message: e instanceof Error ? e.message : String(e) })
      return
    } finally {
      loadingSub.value = false
    }
  }
  if (!g) return
  drawerOpen.value = false
  selection.value = []
  stack.value = [...stack.value, { nodeId: n.id, label: n.label ?? n.id, ref, graph: g }]
  emit('navigate', stack.value)
}

function goTo(depth: number): void {
  if (depth >= stack.value.length) return
  drawerOpen.value = false
  const leaving = stack.value[depth]?.nodeId
  stack.value = stack.value.slice(0, depth)
  selection.value = leaving ? [leaving] : []
  emit('navigate', stack.value)
  // Back on the parent level, focus the sub-process node we came from.
  if (leaving) setTimeout(() => canvas.value?.focusElement(leaving), 50)
}
function back(): void {
  goTo(stack.value.length - 1)
}

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

const monitor = useMonitor({
  state: () => props.state,
  poll: () => props.poll,
  context: (): PollContext => ({ path: path.value, ref: stack.value[stack.value.length - 1]?.ref }),
  staleAfterMs: () => props.staleAfterMs,
  onError: (e) => emit('poll-error', e),
})
const monitoring = computed(() => !!props.state || !!props.poll)
const summary = computed(() => statusSummary(monitor.state.value))
const summaryItems = computed(() =>
  Object.entries(summary.value)
    .filter(([s]) => s !== 'skipped')
    .map(([status, n]) => {
      const tone = props.statusTones[status] ?? STATUS_TONES[status] ?? 'neutral'
      return { status, n, variant: tone === 'accent' ? 'info' : tone === 'neutral' ? 'default' : tone, label: L.value.statuses[status] ?? status }
    }),
)
const updatedText = computed(() => {
  const s = monitor.ageSeconds.value
  if (s === undefined) return ''
  return s < 3 ? L.value.updatedJustNow : L.value.updatedAgo(s)
})
const updatedExact = computed(() => {
  const t = monitor.state.value?.updatedAt ?? monitor.state.value?.receivedAt
  return t ? new Date(t).toLocaleString(props.locale) : ''
})

// ---------------------------------------------------------------------------
// Selection, details, toggles
// ---------------------------------------------------------------------------

const canvas = ref<InstanceType<typeof FlowCanvas> | null>(null)
const selection = ref<string[]>([])
const drawerOpen = ref(false)
const minimapOn = ref(props.minimap)
watch(
  () => props.minimap,
  (v) => (minimapOn.value = v),
)

const selectedRef = computed<ElementRef | null>(() => {
  const id = selection.value[0]
  if (!id) return null
  if (shown.value.nodes.some((n) => n.id === id)) return { kind: 'node', id }
  if (shown.value.edges.some((e) => e.id === id)) return { kind: 'edge', id }
  return null
})
const selectedElement = computed(() => {
  const r = selectedRef.value
  if (!r) return undefined
  return r.kind === 'node' ? shown.value.nodes.find((n) => n.id === r.id) : shown.value.edges.find((e) => e.id === r.id)
})

function onSelect(ids: string[], primary: ElementRef | null): void {
  selection.value = ids.slice(0, 1)
  const el = primary ? (primary.kind === 'node' ? shown.value.nodes.find((n) => n.id === primary.id) : shown.value.edges.find((e) => e.id === primary.id)) : undefined
  emit('select', primary && el ? { ...primary, element: el, path: path.value } : null)
  if (props.details) drawerOpen.value = !!primary && primary.kind !== 'group'
}
function onActivate(ref: ElementRef): void {
  if (ref.kind === 'node') {
    const n = shown.value.nodes.find((x) => x.id === ref.id)
    if (n && canEnter(n) && !props.details) {
      void enter(n.id)
      return
    }
  }
  if (props.details) drawerOpen.value = true
}
function onEscape(): void {
  if (drawerOpen.value) drawerOpen.value = false
  else if (selection.value.length) onSelect([], null)
  else if (stack.value.length) back()
}

/** Optimistic toggles at the displayed level: id → enabled. */
const overrides = shallowRef(new Map<string, boolean>())
const levelOverrides = computed(() => {
  const prefix = `${levelKey.value}\u0000`
  const out = new Map<string, boolean>()
  for (const [k, v] of overrides.value) if (k.startsWith(prefix)) out.set(k.slice(prefix.length), v)
  return out
})
function enabledOf(kind: 'node' | 'edge', el: FlowNode | FlowEdge): boolean {
  void kind
  return levelOverrides.value.get(el.id) ?? isEnabled(el)
}
const pending = new Map<string, number>()

async function toggle(change: { kind: 'node' | 'edge'; id: string; enabled: boolean }): Promise<void> {
  const full: ToggleChange = { ...change, path: path.value }
  const key = `${levelKey.value}\u0000${change.id}`
  const before = overrides.value.get(key)
  const set = (v: boolean | undefined) => {
    const next = new Map(overrides.value)
    if (v === undefined) next.delete(key)
    else next.set(key, v)
    overrides.value = next
  }
  set(change.enabled)
  emit('toggle', full)
  if (!props.onToggle) return
  // The last toggle of an element wins; an older reply must not roll back a newer one.
  const ticket = (pending.get(key) ?? 0) + 1
  pending.set(key, ticket)
  try {
    await props.onToggle(full)
  } catch (error) {
    if (pending.get(key) !== ticket) return
    set(before)
    toast.error({ title: L.value.toggleFailed, message: error instanceof Error ? error.message : String(error) })
    emit('toggle-error', full, error)
  }
}

const crumbs = computed(() => [{ label: props.graph.meta?.title ?? L.value.root, depth: 0 }, ...stack.value.map((l, i) => ({ label: l.label, depth: i + 1 }))])

defineExpose({
  fit: () => canvas.value?.fit(true),
  enter,
  back,
  refresh: () => monitor.refresh(),
  select: (id: string | null) => onSelect(id ? [id] : [], id ? (shown.value.nodes.some((n) => n.id === id) ? { kind: 'node', id } : { kind: 'edge', id }) : null),
  stack,
})
</script>

<template>
  <UidLocaleProvider :locale="kitLocale">
    <div
      v-bind="$attrs"
      class="fl-view"
      :class="{ 'is-monitoring': monitoring }"
      :lang="locale"
    >
      <FlowCanvas
        ref="canvas"
        :graph="shown"
        :labels="L"
        :registry="registry"
        :direction="direction"
        :routing="routing"
        :monitor="monitor.state.value"
        :reserve-counters="monitoring"
        :selection="selection"
        :toggleable="toggleable"
        :enabled-overrides="levelOverrides"
        :minimap="minimapOn"
        :controls="controls"
        :min-zoom="minZoom"
        :max-zoom="maxZoom"
        :wheel="wheel"
        :node-renderers="nodeRenderers"
        :node-icons="nodeIcons"
        :status-tones="statusTones"
        :fit-key="levelKey"
        :drillable="canEnter"
        @select="onSelect"
        @activate="onActivate"
        @enter="enter"
        @toggle="toggle"
        @escape="onEscape"
        @update:minimap="(v: boolean) => { minimapOn = v; emit('update:minimap', v) }"
      >
        <template #overlay>
          <div
            v-if="stack.length"
            class="fl-nav"
            data-fl-ui
          >
            <UidTooltip
              :content="L.back"
              placement="bottom"
            >
              <UidButton
                size="sm"
                variant="ghost"
                :icon="ChevronLeft"
                :aria-label="L.back"
                class="fl-nav__back"
                @click="back"
              />
            </UidTooltip>
            <UidBreadcrumb
              :label="L.root"
              collapse
              class="fl-nav__crumbs"
            >
              <UidBreadcrumbItem
                v-for="c in crumbs"
                :key="c.depth"
                :current="c.depth === stack.length"
                @click="goTo(c.depth)"
              >
                {{ c.label }}
              </UidBreadcrumbItem>
            </UidBreadcrumb>
          </div>

          <div
            v-if="statusBar && monitoring"
            class="fl-status"
            data-fl-ui
            role="status"
            aria-live="polite"
          >
            <template v-if="monitor.loading.value && !monitor.state.value">
              <UidSpinner size="sm" />
              <span class="fl-status__text">{{ L.loading }}</span>
            </template>
            <template v-else>
              <span
                class="fl-status__dot"
                :class="{
                  'is-live': poll && !monitor.paused.value && !monitor.stale.value && !monitor.state.value?.error,
                  'is-stale': monitor.stale.value,
                  'is-error': !!monitor.state.value?.error,
                }"
                aria-hidden="true"
              />
              <UidTooltip
                v-if="updatedText"
                :content="updatedExact"
                placement="bottom"
              >
                <span
                  class="fl-status__text"
                  tabindex="0"
                >{{ updatedText }}</span>
              </UidTooltip>
              <UidBadge
                v-if="monitor.paused.value"
                size="sm"
              >
                {{ L.paused }}
              </UidBadge>
              <UidBadge
                v-if="monitor.state.value?.error"
                variant="danger"
                size="sm"
                class="fl-status__error"
                :title="monitor.state.value.error"
              >
                {{ L.loadError }}
              </UidBadge>
              <UidBadge
                v-else-if="monitor.stale.value"
                variant="warning"
                size="sm"
                class="fl-status__stale"
              >
                {{ L.stale }}
              </UidBadge>
              <span
                v-if="summaryItems.length"
                class="fl-status__summary"
              >
                <UidBadge
                  v-for="s in summaryItems"
                  :key="s.status"
                  :variant="s.variant as 'default'"
                  size="sm"
                  :class="`fl-status__chip fl-status__chip--${s.status}`"
                >
                  {{ s.label }} {{ s.n }}
                </UidBadge>
              </span>
              <UidTooltip
                v-if="poll"
                :content="L.refresh"
                placement="bottom"
              >
                <UidButton
                  size="sm"
                  variant="ghost"
                  :icon="RefreshCw"
                  :aria-label="L.refresh"
                  class="fl-status__refresh"
                  @click="monitor.refresh()"
                />
              </UidTooltip>
            </template>
          </div>

          <div
            v-if="loadingSub"
            class="fl-busy"
            data-fl-ui
          >
            <UidSpinner :label="L.loading" />
          </div>
        </template>
        <template
          v-if="$slots.controls"
          #controls
        >
          <slot name="controls" />
        </template>
        <template
          v-if="$slots.empty"
          #empty
        >
          <slot name="empty" />
        </template>
      </FlowCanvas>

      <UidDrawer
        v-if="details"
        v-model="drawerOpen"
        :title="selectedElement ? (('label' in selectedElement && selectedElement.label) || selectedElement.id) : ''"
        width="min(400px, 100vw)"
      >
        <template
          v-if="$slots['details-header'] && selectedElement && selectedRef"
          #header
        >
          <slot
            name="details-header"
            :kind="selectedRef.kind as 'node' | 'edge'"
            :element="selectedElement"
          />
        </template>
        <FlowDetails
          v-if="selectedElement && selectedRef"
          :graph="shown"
          :kind="selectedRef.kind as 'node' | 'edge'"
          :element="selectedElement"
          :enabled="enabledOf(selectedRef.kind as 'node', selectedElement)"
          :state="monitor.state.value"
          :labels="L"
          :toggleable="toggleable"
          :drillable="selectedRef.kind === 'node' && canEnter(selectedElement as FlowNode)"
          :status-tones="statusTones"
          :locale="locale"
          @toggle="(v: boolean) => toggle({ kind: selectedRef!.kind as 'node', id: selectedRef!.id, enabled: v })"
          @enter="enter(selectedRef!.id)"
        >
          <slot
            name="details"
            :kind="selectedRef.kind as 'node' | 'edge'"
            :element="selectedElement"
            :state="monitor.state.value"
            :path="path"
          />
        </FlowDetails>
      </UidDrawer>
      <UidToastProvider v-if="toastProvider" />
    </div>
  </UidLocaleProvider>
</template>
