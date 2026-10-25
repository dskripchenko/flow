<script setup lang="ts">
/** The zoom/fit/minimap bar in the canvas corner, on kit buttons. */
import { UidButton, UidTooltip } from '@dskripchenko/ui'
import { Map as MapIcon, Maximize, Minus, Plus } from '@dskripchenko/ui/icons'
import type { FlowLabels } from './labels'

defineProps<{ labels: FlowLabels; zoom: number; minimap: boolean }>()
const emit = defineEmits<{
  'zoom-in': []
  'zoom-out': []
  'zoom-reset': []
  fit: []
  'update:minimap': [value: boolean]
}>()
</script>

<template>
  <div
    class="fl-controls"
    role="toolbar"
    :aria-label="labels.graph"
    data-fl-ui
  >
    <UidTooltip
      :content="labels.zoomOut"
      placement="top"
    >
      <UidButton
        size="sm"
        variant="ghost"
        :icon="Minus"
        :aria-label="labels.zoomOut"
        class="fl-controls__zoom-out"
        @click="emit('zoom-out')"
      />
    </UidTooltip>
    <UidButton
      size="sm"
      variant="ghost"
      class="fl-controls__zoom"
      :aria-label="`${zoom}%`"
      @click="emit('zoom-reset')"
    >
      {{ zoom }}%
    </UidButton>
    <UidTooltip
      :content="labels.zoomIn"
      placement="top"
    >
      <UidButton
        size="sm"
        variant="ghost"
        :icon="Plus"
        :aria-label="labels.zoomIn"
        class="fl-controls__zoom-in"
        @click="emit('zoom-in')"
      />
    </UidTooltip>
    <span
      class="fl-controls__sep"
      aria-hidden="true"
    />
    <UidTooltip
      :content="labels.fit"
      placement="top"
    >
      <UidButton
        size="sm"
        variant="ghost"
        :icon="Maximize"
        :aria-label="labels.fit"
        class="fl-controls__fit"
        @click="emit('fit')"
      />
    </UidTooltip>
    <UidTooltip
      :content="labels.minimap"
      placement="top"
    >
      <UidButton
        size="sm"
        :variant="minimap ? 'secondary' : 'ghost'"
        :icon="MapIcon"
        :aria-label="labels.minimap"
        :aria-pressed="minimap"
        class="fl-controls__minimap"
        @click="emit('update:minimap', !minimap)"
      />
    </UidTooltip>
    <slot />
  </div>
</template>
