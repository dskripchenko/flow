<script setup lang="ts">
/**
 * The playground: the order process with live monitoring from the fake
 * backend (?view=monitor), the editor (?view=editor), a 500-node graph
 * (?view=large), and an empty graph (?view=empty). ?theme=dark, ?locale=ru.
 */
import { computed, defineAsyncComponent, ref } from 'vue'
import { FlowView, type ToggleChange } from '../src/vue'
import { emptyGraph, type Graph, type MonitorSnapshot } from '../src/index'
import { orderProcess } from '../tests/fixtures/order'
import { largeGraph } from '../tests/fixtures/large'

const FlowEditorDemo = defineAsyncComponent(() => import('./EditorDemo.vue'))

const params = new URLSearchParams(location.search)
const view = params.get('view') ?? 'monitor'
const locale = params.get('locale') === 'ru' ? 'ru' : 'en'
const interval = Number(params.get('interval') ?? 2000)
const routing = params.get('routing') === 'orthogonal' ? 'orthogonal' : 'spline'
const direction = (params.get('direction') as 'TB' | 'LR' | null) ?? undefined
const graph = ref<Graph>(view === 'large' ? largeGraph(Number(params.get('n') ?? 500)) : view === 'empty' ? emptyGraph() : orderProcess)

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

async function onToggle(change: ToggleChange): Promise<void> {
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
      :poll="poll"
      :locale="locale"
      :routing="routing"
      :direction="direction"
      toggleable
      :on-toggle="onToggle"
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
