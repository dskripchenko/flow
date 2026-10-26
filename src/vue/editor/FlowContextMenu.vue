<script setup lang="ts">
/** A context menu at a screen point: the kit's UidMenu, opened with `openAt`. */
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
const menu = ref<InstanceType<typeof UidMenu> | null>(null)

async function open(point: { x: number; y: number }, entries: MenuEntry[]): Promise<void> {
  items.value = entries
  await nextTick()
  menu.value?.openAt(point.x, point.y)
}

defineExpose({ open })
</script>

<template>
  <UidMenu
    ref="menu"
    class="fl-context-menu"
  >
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
</template>
