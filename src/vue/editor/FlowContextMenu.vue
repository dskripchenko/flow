<script setup lang="ts">
/**
 * A context menu at a screen point, on the kit's UidMenu. The kit menu opens
 * from a trigger, so the trigger here is an invisible 1×1 button placed at
 * the point and clicked programmatically (see docs/internal/design.md: the
 * kit could grow a controlled/context mode).
 */
import { nextTick, ref, type Component } from 'vue'
import { UidMenu, UidMenuItem, UidMenuSeparator, UidSubMenu } from '@dskripchenko/ui'

export interface MenuEntry {
  label?: string
  icon?: Component
  danger?: boolean
  disabled?: boolean
  /** A separator when true (label ignored). */
  separator?: boolean
  shortcut?: string
  children?: MenuEntry[]
  action?: () => void
}

const items = ref<MenuEntry[]>([])
const pos = ref({ x: 0, y: 0 })
const visible = ref(false)
const anchor = ref<HTMLElement | null>(null)

async function open(point: { x: number; y: number }, entries: MenuEntry[]): Promise<void> {
  items.value = entries
  pos.value = point
  visible.value = true
  await nextTick()
  // Let the opening pointer event finish first: the menu closes on outside mousedown.
  setTimeout(() => anchor.value?.querySelector<HTMLElement>('.uid-menu-trigger')?.click(), 0)
}

defineExpose({ open })
</script>

<template>
  <div
    v-if="visible"
    ref="anchor"
    class="fl-context-anchor"
    data-fl-ui
    :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
  >
    <UidMenu>
      <template #trigger>
        <span
          class="fl-context-anchor__trigger"
          aria-hidden="true"
        />
      </template>
      <template
        v-for="(item, i) in items"
        :key="i"
      >
        <UidMenuSeparator v-if="item.separator" />
        <UidSubMenu
          v-else-if="item.children"
          :label="item.label ?? ''"
          :icon="item.icon"
        >
          <UidMenuItem
            v-for="(child, j) in item.children"
            :key="j"
            :icon="child.icon"
            :disabled="child.disabled"
            @click="child.action?.()"
          >
            {{ child.label }}
          </UidMenuItem>
        </UidSubMenu>
        <UidMenuItem
          v-else
          :icon="item.icon"
          :disabled="item.disabled"
          :variant="item.danger ? 'danger' : 'default'"
          @click="item.action?.()"
        >
          <span class="fl-menu-label">{{ item.label }}</span>
          <kbd
            v-if="item.shortcut"
            class="fl-menu-shortcut"
          >{{ item.shortcut }}</kbd>
        </UidMenuItem>
      </template>
    </UidMenu>
  </div>
</template>
