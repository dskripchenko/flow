/**
 * Icon names used by node types and statuses, mapped to the kit's icon set
 * (lucide, through `@dskripchenko/ui/icons`). A custom type names one of
 * these, or passes its own component through `nodeIcons`.
 */
import type { Component } from 'vue'
import {
  Activity,
  Check,
  CircleAlert,
  Clock,
  Cog,
  Diamond,
  Layers,
  MessageSquare,
  Play,
  SkipForward,
  Square,
  StickyNote,
  Workflow,
} from '@dskripchenko/ui/icons'

export const NODE_ICONS: Readonly<Record<string, Component>> = {
  play: Play,
  stop: Square,
  task: Cog,
  decision: Diamond,
  subprocess: Layers,
  note: StickyNote,
  state: Activity,
  workflow: Workflow,
  message: MessageSquare,
  clock: Clock,
}

export const STATUS_ICONS: Readonly<Record<string, Component>> = {
  done: Check,
  error: CircleAlert,
  waiting: Clock,
  skipped: SkipForward,
}
