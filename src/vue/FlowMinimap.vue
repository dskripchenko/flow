<script setup lang="ts">
/** An overview of the whole graph with the visible area; click or drag to move there. */
import { computed, ref } from 'vue'
import type { NodeBox, Point, Viewport } from '../index'

const props = defineProps<{
  nodes: ReadonlyMap<string, NodeBox & { id: string }>
  groups: ReadonlyMap<string, NodeBox>
  bounds: { x: number; y: number; width: number; height: number }
  view: Viewport
  size: { width: number; height: number }
  selection: ReadonlySet<string>
  current: ReadonlySet<string>
  label: string
}>()
const emit = defineEmits<{ centre: [p: Point] }>()

const W = 168
const H = 112
const PAD = 8

/** The minimap shows the graph and the visible area together. */
const frame = computed(() => {
  const v = props.view
  const vis = { x: -v.x / v.k, y: -v.y / v.k, width: props.size.width / v.k, height: props.size.height / v.k }
  const b = props.bounds
  const x0 = Math.min(b.x, vis.x)
  const y0 = Math.min(b.y, vis.y)
  const x1 = Math.max(b.x + b.width, vis.x + vis.width)
  const y1 = Math.max(b.y + b.height, vis.y + vis.height)
  const s = Math.min((W - PAD * 2) / Math.max(1, x1 - x0), (H - PAD * 2) / Math.max(1, y1 - y0))
  const ox = PAD + ((W - PAD * 2) - (x1 - x0) * s) / 2 - x0 * s
  const oy = PAD + ((H - PAD * 2) - (y1 - y0) * s) / 2 - y0 * s
  return { s, ox, oy, vis }
})

const el = ref<SVGSVGElement | null>(null)
let dragging = false
function toGraph(e: PointerEvent): Point {
  const r = el.value!.getBoundingClientRect()
  const f = frame.value
  return { x: (e.clientX - r.left - f.ox) / f.s, y: (e.clientY - r.top - f.oy) / f.s }
}
function down(e: PointerEvent): void {
  dragging = true
  try {
    el.value?.setPointerCapture(e.pointerId)
  } catch {
    // Synthetic events in tests.
  }
  emit('centre', toGraph(e))
}
function move(e: PointerEvent): void {
  if (dragging) emit('centre', toGraph(e))
}
function up(): void {
  dragging = false
}
</script>

<template>
  <div
    class="fl-minimap"
    data-fl-ui
  >
    <svg
      ref="el"
      :width="W"
      :height="H"
      role="img"
      :aria-label="label"
      @pointerdown.stop="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
    >
      <g :transform="`translate(${frame.ox} ${frame.oy}) scale(${frame.s})`">
        <rect
          v-for="[id, g] in groups"
          :key="id"
          class="fl-minimap__group"
          :x="g.x - g.width / 2"
          :y="g.y - g.height / 2"
          :width="g.width"
          :height="g.height"
          :rx="10"
        />
        <rect
          v-for="n in nodes.values()"
          :key="n.id"
          class="fl-minimap__node"
          :class="{ 'is-selected': selection.has(n.id), 'is-current': current.has(n.id) }"
          :x="n.x - n.width / 2"
          :y="n.y - n.height / 2"
          :width="n.width"
          :height="n.height"
          :rx="6"
        />
        <rect
          class="fl-minimap__view"
          :x="frame.vis.x"
          :y="frame.vis.y"
          :width="frame.vis.width"
          :height="frame.vis.height"
          :stroke-width="1.5 / frame.s"
          :rx="4 / frame.s"
        />
      </g>
    </svg>
  </div>
</template>
