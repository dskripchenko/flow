<script setup lang="ts">
/**
 * The built-in drawing of a node, in the node's own coordinates (0,0 is its
 * top-left corner). Outline by the type's shape, an icon tile, the wrapped
 * label, and the monitoring decorations: status chip, badge, counter, halo.
 */
import { computed, type Component } from 'vue'
import { Layers } from '@dskripchenko/ui/icons'
import type { FlowNode, NodeGeometry, NodeRunState, NodeTypeDef } from '../index'
import { NODE_ICONS, STATUS_ICONS } from './icons'
import type { FlowLabels } from './labels'

const props = defineProps<{
  node: FlowNode
  geometry: NodeGeometry
  def: NodeTypeDef
  run?: NodeRunState
  tone?: string
  disabled?: boolean
  selected?: boolean
  focused?: boolean
  current?: boolean
  onPath?: boolean
  issue?: 'error' | 'warning'
  drillable?: boolean
  icon?: Component
  labels: FlowLabels
  /** Where a start/end label goes: under the circle (LR) or to its right (TB). */
  labelSide?: 'below' | 'right'
}>()

const emit = defineEmits<{ enter: [] }>()

const w = computed(() => props.geometry.width)
const h = computed(() => props.geometry.height)
const shape = computed(() => props.def.shape)
const round = computed(() => shape.value === 'circle' || shape.value === 'ring')
const iconComp = computed<Component | undefined>(() => props.icon ?? (props.def.icon ? NODE_ICONS[props.def.icon] : undefined))
const showTile = computed(() => !!iconComp.value && (shape.value === 'rect' || shape.value === 'rounded' || shape.value === 'pill'))
const status = computed(() => props.run?.status)
const statusIcon = computed(() => (status.value ? STATUS_ICONS[status.value] : undefined))
const lineH = 17
const descH = 14

const outline = computed(() => {
  const W = w.value
  const H = h.value
  switch (shape.value) {
    case 'diamond':
      return `M ${W / 2} 0 L ${W} ${H / 2} L ${W / 2} ${H} L 0 ${H / 2} Z`
    case 'note': {
      const f = 12
      return `M 0 0 H ${W - f} L ${W} ${f} V ${H} H 0 Z`
    }
    default:
      return ''
  }
})
const radius = computed(() => (shape.value === 'pill' ? h.value / 2 : shape.value === 'rounded' ? 12 : shape.value === 'note' ? 0 : 8))

/** Where the text block starts and how it is aligned. */
const text = computed(() => {
  const lines = props.geometry.lines
  const desc = props.geometry.descriptionLines
  const total = lines.length * lineH + desc.length * descH
  if (round.value) {
    if (props.labelSide === 'right') return { x: w.value + 8, y: h.value / 2 + 4 - ((lines.length - 1) * lineH) / 2, anchor: 'start' as const }
    return { x: w.value / 2, y: h.value + 16, anchor: 'middle' as const }
  }
  const left = showTile.value ? 46 : 14
  const centred = shape.value === 'diamond' || (!showTile.value && shape.value !== 'note')
  return {
    x: centred ? w.value / 2 : left,
    y: (h.value - total) / 2 + 13,
    anchor: centred ? ('middle' as const) : ('start' as const),
  }
})

const chip = computed(() => {
  const r = props.run
  if (!r) return null
  if (r.badge !== undefined && r.badge !== '') return { kind: 'badge' as const, text: String(r.badge) }
  if (status.value === 'active') return { kind: 'pulse' as const, text: '' }
  if (statusIcon.value) return { kind: 'icon' as const, text: '' }
  return null
})
const chipPos = computed(() => {
  if (round.value) return { x: w.value * 0.85, y: h.value * 0.15 }
  if (shape.value === 'diamond') return { x: w.value * 0.75, y: h.value * 0.25 }
  return { x: w.value - 2, y: 2 }
})
const badgeWidth = computed(() => (chip.value?.kind === 'badge' ? Math.max(20, chip.value.text.length * 7 + 10) : 20))
const count = computed(() => (props.run?.count !== undefined && props.run.count !== null ? String(props.run.count) : ''))
const countWidth = computed(() => Math.max(22, count.value.length * 7 + 12))
const statusTitle = computed(() => (status.value ? (props.labels.statuses[status.value] ?? status.value) : ''))
</script>

<template>
  <g
    class="fl-node"
    :class="[
      `fl-node--${shape}`,
      tone ? `fl-tone--${tone}` : '',
      {
        'is-disabled': disabled,
        'is-selected': selected,
        'is-focused': focused,
        'is-current': current,
        'is-on-path': onPath,
        'has-error': issue === 'error',
        'has-warning': issue === 'warning',
        'has-status': !!status,
      },
    ]"
  >
    <!-- Halo for an active or current node; pulses unless motion is reduced. -->
    <template v-if="current || status === 'active'">
      <circle
        v-if="round"
        class="fl-node__halo"
        :cx="w / 2"
        :cy="h / 2"
        :r="w / 2 + 6"
      />
      <rect
        v-else
        class="fl-node__halo"
        :x="-6"
        :y="-6"
        :width="w + 12"
        :height="h + 12"
        :rx="radius + 6"
      />
    </template>

    <!-- Selection / focus ring. -->
    <template v-if="selected || focused">
      <circle
        v-if="round"
        class="fl-node__ring"
        :cx="w / 2"
        :cy="h / 2"
        :r="w / 2 + 4"
      />
      <path
        v-else-if="outline"
        class="fl-node__ring"
        :d="outline"
        :transform="`translate(${w / 2} ${h / 2}) scale(${(w + 12) / w} ${(h + 12) / h}) translate(${-w / 2} ${-h / 2})`"
      />
      <rect
        v-else
        class="fl-node__ring"
        :x="-4"
        :y="-4"
        :width="w + 8"
        :height="h + 8"
        :rx="radius + 4"
      />
    </template>

    <!-- Shadow and outline. -->
    <template v-if="shape === 'circle'">
      <circle
        class="fl-node__body fl-node__body--start"
        :cx="w / 2"
        :cy="h / 2"
        :r="w / 2"
      />
    </template>
    <template v-else-if="shape === 'ring'">
      <circle
        class="fl-node__body fl-node__body--end"
        :cx="w / 2"
        :cy="h / 2"
        :r="w / 2 - 1.5"
      />
      <circle
        class="fl-node__end-core"
        :cx="w / 2"
        :cy="h / 2"
        :r="w / 2 - 8"
      />
    </template>
    <template v-else-if="outline">
      <path
        class="fl-node__shadow"
        :d="outline"
        transform="translate(0 2)"
      />
      <path
        class="fl-node__body"
        :d="outline"
      />
    </template>
    <template v-else>
      <rect
        class="fl-node__shadow"
        :y="2"
        :width="w"
        :height="h"
        :rx="radius"
      />
      <rect
        class="fl-node__body"
        :width="w"
        :height="h"
        :rx="radius"
      />
    </template>

    <!-- Start/end glyphs. -->
    <component
      :is="iconComp"
      v-if="round && iconComp"
      class="fl-node__glyph"
      :x="w / 2 - 7"
      :y="h / 2 - 7"
      :width="14"
      :height="14"
      :stroke-width="2.4"
      aria-hidden="true"
    />

    <!-- Icon tile. -->
    <g
      v-if="showTile"
      class="fl-node__tile"
    >
      <rect
        :x="10"
        :y="h / 2 - 14"
        width="28"
        height="28"
        rx="7"
      />
      <component
        :is="iconComp"
        :x="16"
        :y="h / 2 - 8"
        :width="16"
        :height="16"
        :stroke-width="2"
        aria-hidden="true"
      />
    </g>

    <!-- Label. -->
    <text
      class="fl-node__label"
      :class="{ 'fl-node__label--outside': round }"
      :x="text.x"
      :y="text.y"
      :text-anchor="text.anchor"
    >
      <tspan
        v-for="(line, i) in geometry.lines"
        :key="i"
        :x="text.x"
        :dy="i === 0 ? 0 : lineH"
      >{{ line }}</tspan>
      <tspan
        v-for="(line, i) in geometry.descriptionLines"
        :key="`d${i}`"
        class="fl-node__desc"
        :x="text.x"
        :dy="i === 0 ? lineH - 1 : descH"
      >{{ line }}</tspan>
    </text>

    <!-- Sub-process marker: the way in. -->
    <g
      v-if="drillable"
      class="fl-node__enter"
      role="button"
      tabindex="-1"
      :aria-label="labels.enter"
      @click.stop="emit('enter')"
      @pointerdown.stop
    >
      <title>{{ labels.enter }}</title>
      <rect
        :x="w / 2 - 11"
        :y="h - 9"
        width="22"
        height="18"
        rx="5"
      />
      <component
        :is="Layers"
        :x="w / 2 - 6"
        :y="h - 6"
        :width="12"
        :height="12"
        :stroke-width="2.2"
        aria-hidden="true"
      />
    </g>

    <!-- Status chip or badge, top-right corner. -->
    <g
      v-if="chip"
      class="fl-node__chip"
      :class="`fl-node__chip--${chip.kind}`"
      :transform="`translate(${chipPos.x} ${chipPos.y})`"
    >
      <title>{{ statusTitle }}</title>
      <template v-if="chip.kind === 'badge'">
        <rect
          :x="-badgeWidth / 2"
          y="-10"
          :width="badgeWidth"
          height="20"
          rx="10"
        />
        <text
          x="0"
          y="4"
          text-anchor="middle"
        >{{ chip.text }}</text>
      </template>
      <template v-else-if="chip.kind === 'pulse'">
        <circle
          class="fl-node__pulse"
          r="9"
        />
        <circle r="5" />
      </template>
      <template v-else>
        <circle r="10" />
        <component
          :is="statusIcon"
          x="-6"
          y="-6"
          width="12"
          height="12"
          :stroke-width="2.6"
          aria-hidden="true"
        />
      </template>
    </g>

    <!-- Instance counter, bottom-right corner. -->
    <g
      v-if="count"
      class="fl-node__count"
      :transform="`translate(${round ? w * 0.12 : shape === 'diamond' ? w * 0.75 : w - countWidth / 2 - 6} ${round ? h * 0.12 : shape === 'diamond' ? h * 0.75 : h})`"
    >
      <title>{{ labels.instances }}: {{ count }}</title>
      <rect
        :x="-countWidth / 2"
        y="-9"
        :width="countWidth"
        height="18"
        rx="9"
      />
      <text
        x="0"
        y="4"
        text-anchor="middle"
      >{{ count }}</text>
    </g>

    <!-- Validation marker, top-left corner. -->
    <g
      v-if="issue"
      class="fl-node__issue"
      :transform="`translate(${round || shape === 'diamond' ? w * 0.2 : 2} ${round || shape === 'diamond' ? h * 0.2 : 2})`"
    >
      <circle r="8" />
      <text
        x="0"
        y="4"
        text-anchor="middle"
      >!</text>
    </g>
  </g>
</template>
