<script setup lang="ts">
/**
 * The playground: the order process with live monitoring from the fake
 * backend (?view=monitor), the editor (?view=editor), a 500-node graph
 * (?view=large), an empty graph (?view=empty), a statechart with the 1.1
 * types (?view=statechart) and the EPC, DFD and IDEF0 notations
 * (?view=epc, dfd, idef0; ?view=editor&notation=epc for the editor). ?theme=dark, ?locale=ru.
 */
import { computed, defineAsyncComponent, ref } from 'vue'
import { FlowView, type ToggleChange } from '../src/vue'
import { emptyGraph, type Graph, type MonitorSnapshot } from '../src/index'
import { orderProcess } from '../tests/fixtures/order'
import { largeGraph } from '../tests/fixtures/large'
import { claimProcess } from '../tests/fixtures/statechart'
import { dfdShop, epcOrder, idef0Make } from '../tests/fixtures/notations'
import { notationRegistry } from '../src/index'

const FlowEditorDemo = defineAsyncComponent(() => import('./EditorDemo.vue'))

const params = new URLSearchParams(location.search)
const view = params.get('view') ?? 'monitor'
const locale = params.get('locale') === 'ru' ? 'ru' : 'en'
const interval = Number(params.get('interval') ?? 2000)
const staleAfter = params.get('stale') ? Number(params.get('stale')) : undefined
const edgeStyle = params.get('edges') === 'smooth' ? 'smooth' : 'orthogonal'
const direction = (params.get('direction') as 'TB' | 'LR' | null) ?? undefined
// ?view=epc | dfd | idef0: a diagram in that notation.
const notation = view === 'epc' || view === 'dfd' || view === 'idef0' ? view : undefined
const registry = notation ? notationRegistry(notation) : undefined
const graph = ref<Graph>(notation ? { epc: epcOrder, dfd: dfdShop, idef0: idef0Make }[notation] : view === 'large' ? largeGraph(Number(params.get('n') ?? 500)) : view === 'empty' ? emptyGraph() : view === 'statechart' ? claimProcess : orderProcess)

/** A run of the claim process: one effect of unknown outcome, one compensated. */
const claimState: MonitorSnapshot = {
  nodes: {
    start: { status: 'done' },
    filing: { status: 'compensated', count: 3 },
    review: { status: 'unknown', count: 12, message: 'Outcome unknown: ChargeDeposit' },
    reminder: { status: 'waiting', count: 4 },
  },
  edges: { e1: { count: 19, traversed: true }, e2: { count: 16, traversed: true } },
}

const events = ref<string[]>([])
function log(line: string): void {
  events.value = [line, ...events.value].slice(0, 6)
}

const poll = computed(() =>
  view === 'monitor'
    ? {
        intervalMs: interval,
        fetch: async (signal: AbortSignal): Promise<MonitorSnapshot> => {
          const r = await fetch('/api/state', { signal })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        },
      }
    : undefined,
)

async function persistToggle(change: ToggleChange): Promise<void> {
  const r = await fetch('/api/toggle', { method: 'POST', body: JSON.stringify(change) })
  if (!r.ok) throw new Error((await r.json()).error)
  log(`toggle ${change.id} → ${change.enabled}`)
}
</script>

<template>
  <div class="pg">
    <FlowEditorDemo
      v-if="view === 'editor'"
      :locale="locale"
    />
    <FlowView
      v-else
      class="pg-flow"
      :graph="graph"
      :registry="registry"
      :poll="poll"
      :state="view === 'statechart' ? claimState : undefined"
      :stale-after-ms="staleAfter"
      :locale="locale"
      :edge-style="edgeStyle"
      :direction="direction"
      toggleable
      :persist-toggle="persistToggle"
      @select="(s) => log(s ? `select ${s.kind} ${s.id}` : 'select none')"
      @navigate="(s) => log(`navigate ${s.map((l) => l.nodeId).join(' / ') || 'root'}`)"
    />
    <output
      class="pg-log"
      data-testid="log"
    >{{ events.join('\n') }}</output>
  </div>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}
body {
  background: var(--uid-surface-base);
}
.pg {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.pg > :first-child {
  flex: 1 1 auto;
  min-height: 0;
}
.pg-log {
  display: none;
}
</style>
