<script setup lang="ts">
/**
 * The palette of node types: drag an item onto the canvas, or press it
 * (click, Enter, Space) to add the node in the middle of the view.
 */
import { computed, onBeforeUnmount, ref, type Component } from 'vue'
import { UidButton } from '@dskripchenko/ui'
import type { NodeTypeRegistry } from '../../index'
import { NODE_ICONS } from '../icons'
import type { FlowLabels } from '../labels'

const props = defineProps<{
  registry: NodeTypeRegistry
  types: string[]
  labels: FlowLabels
  nodeIcons?: Record<string, Component>
  disabled?: boolean
}>()
const emit = defineEmits<{ add: [type: string]; drop: [type: string, client: { x: number; y: number }] }>()

const items = computed(() =>
  props.types
    .filter((t) => props.registry.has(t))
    .map((t) => {
      const def = props.registry.get(t)!
      return { type: t, title: props.labels.types[t] ?? def.title, icon: props.nodeIcons?.[t] ?? (def.icon ? NODE_ICONS[def.icon] : undefined) ?? NODE_ICONS[t] ?? NODE_ICONS.state, shape: def.shape }
    }),
)

/** A drag in progress: a ghost follows the pointer until it is released. */
const ghost = ref<{ type: string; title: string; x: number; y: number; moved: boolean } | null>(null)
let start = { x: 0, y: 0 }
let dragged = false

function down(e: PointerEvent, type: string, title: string): void {
  if (props.disabled || e.button !== 0) return
  start = { x: e.clientX, y: e.clientY }
  dragged = false
  ghost.value = { type, title, x: e.clientX, y: e.clientY, moved: false }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up, { once: true })
  window.addEventListener('pointercancel', cancel, { once: true })
}
function move(e: PointerEvent): void {
  const g = ghost.value
  if (!g) return
  const moved = g.moved || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5
  ghost.value = { ...g, x: e.clientX, y: e.clientY, moved }
}
function up(e: PointerEvent): void {
  const g = ghost.value
  cleanup()
  if (!g) return
  if (g.moved) {
    // Swallow the click that may follow this pointerup (only when released over the button).
    dragged = true
    setTimeout(() => (dragged = false), 0)
    emit('drop', g.type, { x: e.clientX, y: e.clientY })
  }
}
/** Pointer press, Enter and Space all end in a click; a finished drag does not add twice. */
function click(type: string): void {
  if (dragged) return
  emit('add', type)
}
function cancel(): void {
  cleanup()
}
function cleanup(): void {
  ghost.value = null
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', up)
  window.removeEventListener('pointercancel', cancel)
}
onBeforeUnmount(cleanup)
</script>

<template>
  <div
    class="fl-palette"
    role="list"
    :aria-label="labels.palette"
  >
    <div
      v-for="item in items"
      :key="item.type"
      role="listitem"
      class="fl-palette__item-wrap"
    >
      <UidButton
        variant="secondary"
        size="sm"
        class="fl-palette__item"
        :class="`fl-palette__item--${item.shape}`"
        :icon="item.icon"
        :disabled="disabled"
        :data-type="item.type"
        :aria-label="`${item.title}: ${labels.paletteHint}`"
        @pointerdown="down($event, item.type, item.title)"
        @click="click(item.type)"
      >
        {{ item.title }}
      </UidButton>
    </div>
    <p class="fl-palette__hint">
      {{ labels.paletteHint }}
    </p>
    <Teleport to="body">
      <div
        v-if="ghost?.moved"
        class="fl-palette-ghost"
        :style="{ left: `${ghost.x}px`, top: `${ghost.y}px` }"
      >
        {{ ghost.title }}
      </div>
    </Teleport>
  </div>
</template>
