/**
 * Icon names used by node types and statuses, mapped to the kit's icon set
 * (lucide, bundled into the build). A custom type names one of
 * these, or passes its own component through `nodeIcons`.
 */
import type { Component } from 'vue'
import {
  Activity,
  Asterisk,
  Check,
  CircleAlert,
  CircleHelp,
  Clock,
  Cog,
  Columns3,
  Diamond,
  Hourglass,
  Layers,
  MessageSquare,
  Monitor,
  Play,
  SkipForward,
  Square,
  StickyNote,
  Timer,
  Undo2,
  Workflow,
  Zap,
} from 'lucide-vue-next'

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
  parallel: Columns3,
  timer: Timer,
  wait: Hourglass,
  any: Asterisk,
  system: Monitor,
}

export const STATUS_ICONS: Readonly<Record<string, Component>> = {
  done: Check,
  error: CircleAlert,
  waiting: Clock,
  skipped: SkipForward,
  unknown: CircleHelp,
  compensated: Undo2,
}

/** Edge trigger icons (`FlowEdge.trigger`). */
export const TRIGGER_ICONS: Readonly<Record<string, Component>> = {
  timer: Timer,
  event: Zap,
}
