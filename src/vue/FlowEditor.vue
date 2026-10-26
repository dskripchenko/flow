<script setup lang="ts">
/**
 * FlowEditor — a visual editor of the model: palette, canvas with
 * connecting/moving/selecting, properties, validation, undo/redo, clipboard,
 * align/distribute, auto layout, JSON and Mermaid import. `v-model` holds
 * the model; every change is also emitted as a command.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch, type Component } from 'vue'
import {
  UidBadge,
  UidBreadcrumb,
  UidBreadcrumbItem,
  UidButton,
  UidDrawer,
  UidMenu,
  UidMenuItem,
  UidMenuSeparator,
  UidTab,
  UidTabPanel,
  UidTabs,
  UidToastProvider,
  UidTooltip,
} from '@dskripchenko/ui'
import {
  AlignCenterVertical,
  ChevronLeft,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Download,
  FileCode,
  LayoutGrid,
  Magnet,
  PanelRight,
  Plus,
  Power,
  Scissors,
  Shapes,
  SquareArrowOutUpRight,
  Trash2,
  Undo2,
  Redo2,
  Upload,
  Ellipsis,
} from '@dskripchenko/ui/icons'
import {
  History,
  alignNodes,
  applyCommand,
  copyFragment,
  defaultRegistry,
  describeCommand,
  distributeNodes,
  isEnabled,
  isLocked,
  findFreeSpot,
  layoutCommand,
  layoutGraph,
  measureNode,
  approximateMeasurer,
  nextId,
  pasteFragment,
  snap,
  stringifyGraph,
  typeOf,
  validateGraph,
  CommandError,
  type Alignment,
  type Command,
  type ElementRef,
  type FlowEdge,
  type FlowNode,
  type Fragment,
  type Graph,
  type Issue,
  type NodeTypeRegistry,
  type Point,
} from '../index'
import FlowCanvas, { type ConnectPayload, type ContextPayload, type ReconnectPayload } from './FlowCanvas.vue'
import FlowContextMenu, { type MenuEntry } from './editor/FlowContextMenu.vue'
import FlowImportDialog from './editor/FlowImportDialog.vue'
import FlowIssues from './editor/FlowIssues.vue'
import FlowPalette from './editor/FlowPalette.vue'
import FlowProperties from './editor/FlowProperties.vue'
import { useLocaleScope } from './localeScope'
import { resolveLabels, type FlowLabels } from './labels'

export interface ChangeEvent {
  /** The command at the root of the model (sub-process edits arrive as an `updateNode` of their node). */
  command: Command
  /** The same command at the level it was made, and that level's path of node ids. */
  local: { command: Command; path: string[] }
  description: string
  graph: Graph
  /** `undo` / `redo` when the change came from history. */
  source: 'edit' | 'undo' | 'redo'
}

// The root is a locale scope (a fragment): attributes go to the real root.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    modelValue: Graph
    registry?: NodeTypeRegistry
    /** Node types offered in the palette; all of the registry by default. */
    palette?: string[]
    readonly?: boolean
    /** Node types users cannot move, edit or delete (on top of `locked: true` in the registry). */
    locked?: string[]
    snapGrid?: number
    /** Layout direction; `auto` (the default without `meta.direction`) follows the canvas shape. */
    direction?: 'TB' | 'LR' | 'auto'
    /** `orthogonal` (right angles, the default) or `smooth` (curves). */
    edgeStyle?: 'orthogonal' | 'smooth'
    nodeRenderers?: Record<string, Component>
    nodeIcons?: Record<string, Component>
    /** Interface language; by default the host's kit locale (a parent UidLocaleProvider), else English. Setting it also sets the kit's locale inside. */
    locale?: 'en' | 'ru' | string
    labels?: Partial<FlowLabels>
    minimap?: boolean
    /** Enables "Import Mermaid": pass `fromMermaid` from `@dskripchenko/flow/mermaid`. */
    mermaid?: (source: string) => Graph
    toastProvider?: boolean
    /** File name for "Export JSON". */
    exportName?: string
  }>(),
  {
    registry: () => defaultRegistry,
    palette: undefined,
    readonly: false,
    locked: () => [],
    snapGrid: 20,
    direction: undefined,
    edgeStyle: 'orthogonal',
    nodeRenderers: () => ({}),
    nodeIcons: () => ({}),
    locale: undefined,
    labels: undefined,
    minimap: false,
    mermaid: undefined,
    toastProvider: true,
    exportName: 'process.json',
  },
)

const emit = defineEmits<{
  'update:modelValue': [graph: Graph]
  change: [event: ChangeEvent]
  select: [ids: string[]]
  validate: [issues: Issue[]]
  export: [json: string]
}>()

defineSlots<{
  /** Extra content at the end of the toolbar. */
  toolbar?(): unknown
  /** Extra content under the properties of the selection. */
  properties?(props: { selection: string[]; graph: Graph; path: string[] }): unknown
}>()

const { lang, wrapper, wrapperProps } = useLocaleScope(() => props.locale)
const L = computed(() => resolveLabels(lang.value, props.labels))

// ---------------------------------------------------------------------------
// Model, history, navigation
// ---------------------------------------------------------------------------

// A parent's deep ref hands the model back as a reactive proxy: compare and keep raw objects.
const history = new History(toRaw(props.modelValue))
const root = shallowRef<Graph>(toRaw(props.modelValue))
const revision = ref(0)
watch(
  () => props.modelValue,
  (value) => {
    const g = toRaw(value)
    if (g === root.value) return
    history.reset(g)
    root.value = g
    revision.value++
    // Keep the user inside a sub-process only while it still exists.
    path.value = validPath(g, path.value)
  },
)

const path = ref<string[]>([])
function levelOf(g: Graph, p: readonly string[]): Graph {
  let cur = g
  for (const id of p) {
    const n = cur.nodes.find((x) => x.id === id)
    if (!n || typeof n.subgraph !== 'object') return cur
    cur = n.subgraph
  }
  return cur
}
function validPath(g: Graph, p: string[]): string[] {
  const out: string[] = []
  let cur = g
  for (const id of p) {
    const n = cur.nodes.find((x) => x.id === id)
    if (!n || typeof n.subgraph !== 'object') break
    out.push(id)
    cur = n.subgraph
  }
  return out
}
const level = computed(() => levelOf(root.value, path.value))
const crumbs = computed(() => {
  const out = [{ label: root.value.meta?.title ?? L.value.root, depth: 0 }]
  let cur = root.value
  path.value.forEach((id, i) => {
    const n = cur.nodes.find((x) => x.id === id)
    out.push({ label: n?.label ?? id, depth: i + 1 })
    if (n && typeof n.subgraph === 'object') cur = n.subgraph
  })
  return out
})

/** A command at the current level, expressed at the root. */
function atRoot(command: Command, p: readonly string[] = path.value, g: Graph = root.value): Command {
  if (p.length === 0) return command
  const [head, ...rest] = p
  const n = g.nodes.find((x) => x.id === head)
  const sub = n && typeof n.subgraph === 'object' ? n.subgraph : undefined
  if (!sub) return command
  const innerCommand = atRoot(command, rest, sub)
  return { type: 'updateNode', id: head!, patch: { subgraph: applyCommand(sub, innerCommand) } }
}

const selection = ref<string[]>([])
const canvas = ref<InstanceType<typeof FlowCanvas> | null>(null)
const propsPanel = ref<InstanceType<typeof FlowProperties> | null>(null)

/**
 * Runs a command at the current level. The first edit of a graph laid out
 * automatically also fixes every node where it is drawn, so nothing jumps.
 */
function run(command: Command, mergeKey?: string): boolean {
  if (props.readonly) return false
  let local = command
  const g = level.value
  if (g.nodes.some((n) => !n.position) && command.type !== 'replace') {
    const boxes = canvas.value?.layout.nodes
    if (boxes) {
      const fix: Command = { type: 'moveNodes', moves: g.nodes.filter((n) => !n.position && boxes.has(n.id)).map((n) => ({ id: n.id, position: { x: Math.round(boxes.get(n.id)!.x), y: Math.round(boxes.get(n.id)!.y) } })) }
      local = { type: 'batch', commands: [fix, command] }
    }
  }
  const cmd = atRoot(local)
  try {
    const next = history.execute(cmd, mergeKey)
    commit(next, { command: cmd, local: { command: local, path: [...path.value] }, description: describeCommand(command), graph: next, source: 'edit' })
    return true
  } catch (e) {
    if (e instanceof CommandError) return false
    throw e
  }
}
function commit(next: Graph, event: ChangeEvent): void {
  root.value = next
  revision.value++
  path.value = validPath(next, path.value)
  const g = levelOf(next, path.value)
  const ids = new Set([...g.nodes.map((n) => n.id), ...g.edges.map((e) => e.id)])
  selection.value = selection.value.filter((id) => ids.has(id))
  emit('update:modelValue', next)
  emit('change', event)
}
function undo(): void {
  const entry = history.undo()
  if (!entry) return
  commit(history.graph, { command: entry.command, local: { command: entry.command, path: [] }, description: describeCommand(entry.command), graph: history.graph, source: 'undo' })
}
function redo(): void {
  const entry = history.redo()
  if (!entry) return
  commit(history.graph, { command: entry.command, local: { command: entry.command, path: [] }, description: describeCommand(entry.command), graph: history.graph, source: 'redo' })
}
const canUndo = computed(() => (revision.value, history.canUndo))
const canRedo = computed(() => (revision.value, history.canRedo))
const undoTitle = computed(() => (revision.value, history.last ? `${L.value.undo}: ${describeCommand(history.last.command)}` : L.value.undo))
const redoTitle = computed(() => (revision.value, history.next ? `${L.value.redo}: ${describeCommand(history.next.command)}` : L.value.redo))

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const issues = computed(() => validateGraph(level.value, { registry: props.registry }))
watch(issues, (v) => emit('validate', v), { immediate: true })
const issueMap = computed(() => {
  const m = new Map<string, 'error' | 'warning'>()
  for (const i of issues.value) {
    if (!i.target) continue
    if (i.severity === 'error' || !m.has(i.target.id)) m.set(i.target.id, i.severity)
  }
  return m
})
const errorCount = computed(() => issues.value.filter((i) => i.severity === 'error').length)
const warningCount = computed(() => issues.value.length - errorCount.value)

// ---------------------------------------------------------------------------
// Selection and editing operations
// ---------------------------------------------------------------------------

const nodeLocked = (n: FlowNode) => props.locked.includes(n.type) || isLocked(props.registry, n)
const selectedNodes = computed(() => level.value.nodes.filter((n) => selection.value.includes(n.id)))

function select(ids: string[]): void {
  selection.value = ids
  emit('select', ids)
}

function deletable(ids: string[]): string[] {
  const g = level.value
  return ids.filter((id) => {
    const n = g.nodes.find((x) => x.id === id)
    return !n || !nodeLocked(n)
  })
}
function deleteSelection(): void {
  const ids = deletable(selection.value)
  if (!ids.length) return
  if (run({ type: 'removeElements', ids })) select([])
}

const clipboard = shallowRef<Fragment | null>(null)
function copy(): void {
  const nodes = selection.value.filter((id) => level.value.nodes.some((n) => n.id === id))
  if (!nodes.length) return
  clipboard.value = copyFragment(level.value, nodes, canvas.value?.layout)
  try {
    void navigator.clipboard?.writeText(JSON.stringify(clipboard.value)).catch(() => {})
  } catch {
    // No clipboard access: the internal copy still works.
  }
}
function cut(): void {
  copy()
  deleteSelection()
}
function paste(fragment: Fragment | null = clipboard.value, at?: Point): void {
  if (!fragment || !fragment.nodes.length) return
  const { command, ids } = pasteFragment(level.value, fragment, at ? { at } : { offset: { x: props.snapGrid * 2 || 32, y: props.snapGrid * 2 || 32 } })
  if (run(command)) {
    select(ids)
    // A second paste lands further along, not on top of the first.
    if (!at) clipboard.value = { ...fragment, nodes: fragment.nodes.map((n) => (n.position ? { ...n, position: { x: n.position.x + (props.snapGrid * 2 || 32), y: n.position.y + (props.snapGrid * 2 || 32) } } : n)) }
  }
}
function duplicate(): void {
  const nodes = selection.value.filter((id) => level.value.nodes.some((n) => n.id === id))
  if (!nodes.length) return
  paste(copyFragment(level.value, nodes, canvas.value?.layout))
}
function selectAll(): void {
  select(level.value.nodes.map((n) => n.id))
}
function nudge(dx: number, dy: number): void {
  const boxes = canvas.value?.layout.nodes
  const moves = selectedNodes.value
    .filter((n) => !nodeLocked(n))
    .map((n) => {
      const b = boxes?.get(n.id)
      const p = n.position ?? (b ? { x: b.x, y: b.y } : { x: 0, y: 0 })
      return { id: n.id, position: { x: p.x + dx, y: p.y + dy } }
    })
  if (moves.length) run({ type: 'moveNodes', moves }, 'nudge')
}
function align(how: Alignment): void {
  const c = canvas.value && alignNodes(canvas.value.layout.nodes, selectedNodes.value.filter((n) => !nodeLocked(n)).map((n) => n.id), how)
  if (c) run(c)
}
function distribute(axis: 'horizontal' | 'vertical'): void {
  const c = canvas.value && distributeNodes(canvas.value.layout.nodes, selectedNodes.value.filter((n) => !nodeLocked(n)).map((n) => n.id), axis)
  if (c) run(c)
}
function autoLayout(): void {
  const g = level.value
  const fresh = layoutGraph(g, { registry: props.registry, direction: canvas.value?.layout.direction ?? 'LR', routing: props.edgeStyle === 'smooth' ? 'spline' : 'orthogonal', ignorePositions: true })
  if (run(layoutCommand(fresh))) setTimeout(() => canvas.value?.fit(true), 30)
}
function toggleEnabled(): void {
  const ids = selection.value
  if (!ids.length) return
  const g = level.value
  type Sel = { kind: 'node' | 'edge'; el: FlowNode | FlowEdge }
  const els = ids
    .map((id): Sel | null => {
      const n = g.nodes.find((x) => x.id === id)
      if (n) return nodeLocked(n) ? null : { kind: 'node' as const, el: n }
      const e = g.edges.find((x) => x.id === id)
      return e ? { kind: 'edge' as const, el: e } : null
    })
    .filter((x): x is Sel => !!x)
  if (!els.length) return
  const enable = !els.every((x) => isEnabled(x.el))
  run({ type: 'batch', commands: els.map((x) => ({ type: 'setEnabled', kind: x.kind, id: x.el.id, enabled: enable }) as Command) })
}

function nodeAt(type: string, at: Point): FlowNode {
  const g = level.value
  const def = typeOf(props.registry, type)
  const node: FlowNode = { id: nextId(g, type), type, position: snap(at, props.snapGrid) }
  if (!def.labelOutside) node.label = L.value.types[type] ?? def.title
  if (def.drillable) node.subgraph = { version: 1, nodes: [{ id: 'start', type: 'start' }, { id: 'end', type: 'end' }], edges: [{ id: 'e-1', from: 'start', to: 'end' }] }
  return node
}
/**
 * Where a node added without a drop point goes: next along the flow from the
 * selected node (to its right in LR, below in TB), else the middle of the
 * view — moved outward to the nearest spot that overlaps nothing.
 */
function freeSpotFor(type: string): Point {
  const layout = canvas.value?.layout
  const boxes = layout?.nodes ?? new Map()
  const size = measureNode({ id: '', type, label: L.value.types[type] ?? typeOf(props.registry, type).title }, props.registry, approximateMeasurer)
  const one = selection.value.length === 1 ? boxes.get(selection.value[0]!) : undefined
  let near = canvas.value?.viewCentre() ?? { x: 0, y: 0 }
  if (one) {
    const gap = 72
    near = layout?.direction === 'TB' ? { x: one.x, y: one.y + one.height / 2 + gap + size.height / 2 } : { x: one.x + one.width / 2 + gap + size.width / 2, y: one.y }
  }
  return findFreeSpot(boxes.values(), size, near, { grid: grid.value, padding: 32 })
}
function addNode(type: string, at?: Point): void {
  const p = at ?? freeSpotFor(type)
  const node = nodeAt(type, p)
  if (run({ type: 'addNodes', nodes: [node] })) {
    select([node.id])
    void nextTick(() => canvas.value?.focusElement(node.id))
  }
}
function dropNode(type: string, client: Point): void {
  const el = canvas.value?.root
  if (!el) return
  const r = el.getBoundingClientRect()
  if (client.x < r.left || client.x > r.right || client.y < r.top || client.y > r.bottom) return
  addNode(type, canvas.value!.clientToGraph(client.x, client.y))
}

function onConnect(p: ConnectPayload): void {
  const edge: FlowEdge = { id: nextId(level.value, 'e'), from: p.from, to: p.to }
  if (p.fromPort) edge.fromPort = p.fromPort
  if (p.toPort) edge.toPort = p.toPort
  if (run({ type: 'addEdge', edge })) select([edge.id])
}
function onReconnect(p: ReconnectPayload): void {
  const patch: Record<string, unknown> = p.end === 'from' ? { from: p.node, fromPort: p.port ?? null } : { to: p.node, toPort: p.port ?? null }
  run({ type: 'updateEdge', id: p.id, patch })
}
function onDetach(id: string): void {
  if (run({ type: 'removeElements', ids: [id] })) select([])
}
function onMove(moves: { id: string; position: Point }[]): void {
  const allowed = moves.filter((m) => {
    const n = level.value.nodes.find((x) => x.id === m.id)
    return n && !nodeLocked(n)
  })
  if (allowed.length) run({ type: 'moveNodes', moves: allowed })
}

function openSubgraph(nodeId: string): void {
  const n = level.value.nodes.find((x) => x.id === nodeId)
  if (!n || typeof n.subgraph !== 'object') return
  path.value = [...path.value, nodeId]
  select([])
}
function goTo(depth: number): void {
  const leaving = path.value[depth]
  path.value = path.value.slice(0, depth)
  select(leaving ? [leaving] : [])
}
function onActivate(ref: ElementRef): void {
  select([ref.id])
  panelTab.value = 'properties'
  if (narrow.value) sideOpen.value = true
  void nextTick(() => propsPanel.value?.focusLabel())
}
function onEscape(): void {
  if (selection.value.length) select([])
  else if (path.value.length) goTo(path.value.length - 1)
}

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

const importOpen = ref(false)
const importMode = ref<'json' | 'mermaid'>('json')
function openImport(mode: 'json' | 'mermaid'): void {
  importMode.value = mode
  importOpen.value = true
}
function onImport(g: Graph): void {
  run({ type: 'replace', graph: g })
  select([])
  setTimeout(() => canvas.value?.fit(true), 30)
}
function exportJson(): void {
  const json = stringifyGraph(root.value)
  emit('export', json)
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = props.exportName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    // No download in this environment; the `export` event carries the JSON.
  }
}

// ---------------------------------------------------------------------------
// Keyboard and context menu
// ---------------------------------------------------------------------------

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const mod = isMac ? '⌘' : 'Ctrl+'

function onKeyDown(e: KeyboardEvent): void {
  const t = e.target as HTMLElement
  if (t.closest('input, textarea, select, [contenteditable="true"], .uid-modal, .uid-menu, .fl-props')) return
  const cmd = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  if (cmd && key === 'z') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
  } else if (cmd && key === 'y') {
    e.preventDefault()
    redo()
  } else if (cmd && key === 'c') {
    copy()
  } else if (cmd && key === 'x') {
    e.preventDefault()
    cut()
  } else if (cmd && key === 'v') {
    e.preventDefault()
    paste()
  } else if (cmd && key === 'd') {
    e.preventDefault()
    duplicate()
  } else if (cmd && key === 'a') {
    e.preventDefault()
    selectAll()
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection.value.length) {
    e.preventDefault()
    deleteSelection()
  } else if (e.key.startsWith('Arrow') && !e.altKey && selectedNodes.value.length) {
    e.preventDefault()
    const step = e.shiftKey ? (props.snapGrid || 10) * 5 : props.snapGrid || 1
    const d = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[e.key] as [number, number] | undefined
    if (d) nudge(d[0], d[1])
  }
}

const menu = ref<InstanceType<typeof FlowContextMenu> | null>(null)
function onContextMenu(p: ContextPayload): void {
  const entries: MenuEntry[] = []
  const t = p.target
  if (t && !props.readonly) {
    const multi = selection.value.length > 1
    const n = t.kind === 'node' ? level.value.nodes.find((x) => x.id === t.id) : undefined
    const locked = n ? nodeLocked(n) : false
    if (n && typeof n.subgraph === 'object' && !multi) entries.push({ label: L.value.subgraphOpen, icon: SquareArrowOutUpRight, action: () => openSubgraph(n.id) })
    if (t.kind === 'node') {
      entries.push({ label: L.value.duplicate, icon: CopyPlus, shortcut: `${mod}D`, action: duplicate })
      entries.push({ label: L.value.copy, icon: Copy, shortcut: `${mod}C`, action: copy })
      entries.push({ label: L.value.cut, icon: Scissors, shortcut: `${mod}X`, action: cut, disabled: locked })
    }
    const el = n ?? level.value.edges.find((x) => x.id === t.id)
    entries.push({ label: el && isEnabled(el) ? L.value.disable : L.value.enable, icon: Power, action: toggleEnabled, disabled: locked })
    if (multi) {
      entries.push({ separator: true })
      entries.push({
        label: L.value.align,
        icon: AlignCenterVertical,
        children: [
          { label: L.value.alignLeft, action: () => align('left') },
          { label: L.value.alignCenter, action: () => align('center') },
          { label: L.value.alignRight, action: () => align('right') },
          { label: L.value.alignTop, action: () => align('top') },
          { label: L.value.alignMiddle, action: () => align('middle') },
          { label: L.value.alignBottom, action: () => align('bottom') },
          { label: L.value.distributeH, action: () => distribute('horizontal'), disabled: selection.value.length < 3 },
          { label: L.value.distributeV, action: () => distribute('vertical'), disabled: selection.value.length < 3 },
        ],
      })
    }
    entries.push({ separator: true })
    entries.push({ label: L.value.delete, icon: Trash2, danger: true, shortcut: 'Del', action: deleteSelection, disabled: locked })
  } else if (!props.readonly) {
    entries.push({
      label: L.value.addHere,
      icon: Plus,
      children: paletteTypes.value.map((type) => ({ label: L.value.types[type] ?? typeOf(props.registry, type).title, action: () => addNode(type, p.point) })),
    })
    entries.push({ label: L.value.paste, icon: ClipboardPaste, shortcut: `${mod}V`, disabled: !clipboard.value, action: () => paste(clipboard.value, p.point) })
    entries.push({ separator: true })
    entries.push({ label: L.value.selectAll, shortcut: `${mod}A`, action: selectAll })
    entries.push({ label: L.value.autoLayout, icon: LayoutGrid, action: autoLayout })
  }
  if (entries.length) void menu.value?.open(p.client, entries)
}

// ---------------------------------------------------------------------------
// Panels and responsiveness
// ---------------------------------------------------------------------------

const paletteTypes = computed(() => props.palette ?? [...props.registry.keys()])
const panelTab = ref<'properties' | 'issues'>('properties')
const snapOn = ref(props.snapGrid > 0)
const grid = computed(() => (snapOn.value ? props.snapGrid : 0))
const minimapOn = ref(props.minimap)
const rootEl = ref<HTMLElement | null>(null)
const narrow = ref(false)
const paletteOpen = ref(false)
const sideOpen = ref(false)
let ro: ResizeObserver | undefined
onMounted(() => {
  const update = () => {
    const w = rootEl.value?.clientWidth ?? 0
    // 0 means not laid out (tests, hidden tabs): keep the wide layout.
    narrow.value = w > 0 && w < 760
  }
  update()
  if (typeof ResizeObserver === 'function' && rootEl.value) {
    ro = new ResizeObserver(update)
    ro.observe(rootEl.value)
  }
})
onBeforeUnmount(() => ro?.disconnect())

function focusIssue(issue: Issue): void {
  if (!issue.target) return
  select([issue.target.id])
  canvas.value?.centreOn(issue.target.id)
  if (narrow.value) sideOpen.value = false
  void nextTick(() => canvas.value?.focusElement(issue.target!.id))
}

defineExpose({ undo, redo, autoLayout, fit: () => canvas.value?.fit(true), select, history, issues })
</script>

<template>
  <component
    :is="wrapper"
    v-bind="wrapperProps"
  >
    <div
      ref="rootEl"
      v-bind="$attrs"
      class="fl-editor"
      :class="{ 'is-narrow': narrow, 'is-readonly': readonly }"
      :lang="lang"
      role="application"
      :aria-label="L.editor"
      @keydown="onKeyDown"
    >
      <!-- Toolbar -->
      <div
        class="fl-toolbar"
        role="toolbar"
        :aria-label="L.editor"
      >
        <UidButton
          v-if="narrow && !readonly"
          size="sm"
          variant="ghost"
          :icon="Shapes"
          :aria-label="L.palette"
          class="fl-toolbar__palette"
          @click="paletteOpen = true"
        />
        <UidTooltip
          :content="undoTitle"
          placement="bottom"
        >
          <UidButton
            size="sm"
            variant="ghost"
            :icon="Undo2"
            :aria-label="L.undo"
            :disabled="!canUndo || readonly"
            class="fl-toolbar__undo"
            @click="undo"
          />
        </UidTooltip>
        <UidTooltip
          :content="redoTitle"
          placement="bottom"
        >
          <UidButton
            size="sm"
            variant="ghost"
            :icon="Redo2"
            :aria-label="L.redo"
            :disabled="!canRedo || readonly"
            class="fl-toolbar__redo"
            @click="redo"
          />
        </UidTooltip>
        <span
          class="fl-toolbar__sep"
          aria-hidden="true"
        />
        <UidTooltip
          :content="`${L.duplicate} (${mod}D)`"
          placement="bottom"
        >
          <UidButton
            size="sm"
            variant="ghost"
            :icon="CopyPlus"
            :aria-label="L.duplicate"
            :disabled="!selectedNodes.length || readonly"
            class="fl-toolbar__duplicate"
            @click="duplicate"
          />
        </UidTooltip>
        <UidTooltip
          :content="`${L.delete} (Del)`"
          placement="bottom"
        >
          <UidButton
            size="sm"
            variant="ghost"
            :icon="Trash2"
            :aria-label="L.delete"
            :disabled="!selection.length || readonly"
            class="fl-toolbar__delete"
            @click="deleteSelection"
          />
        </UidTooltip>
        <span
          class="fl-toolbar__sep"
          aria-hidden="true"
        />
        <UidTooltip
          :content="L.autoLayout"
          placement="bottom"
        >
          <UidButton
            size="sm"
            variant="ghost"
            :icon="LayoutGrid"
            :aria-label="L.autoLayout"
            :disabled="readonly || !level.nodes.length"
            class="fl-toolbar__layout"
            @click="autoLayout"
          >
            <span
              v-if="!narrow"
              class="fl-toolbar__text"
            >{{ L.autoLayout }}</span>
          </UidButton>
        </UidTooltip>
        <UidTooltip
          :content="L.snapToGrid"
          placement="bottom"
        >
          <UidButton
            size="sm"
            :variant="snapOn ? 'secondary' : 'ghost'"
            :icon="Magnet"
            :aria-label="L.snapToGrid"
            :aria-pressed="snapOn"
            class="fl-toolbar__snap fl-toggle"
            :class="{ 'is-active': snapOn }"
            @click="snapOn = !snapOn"
          />
        </UidTooltip>
        <span class="fl-toolbar__spacer" />
        <UidMenu>
          <template #trigger>
            <UidButton
              size="sm"
              variant="ghost"
              :icon="narrow ? Ellipsis : FileCode"
              :aria-label="L.more"
              class="fl-toolbar__file"
            >
              <span
                v-if="!narrow"
                class="fl-toolbar__text"
              >JSON / Mermaid</span>
            </UidButton>
          </template>
          <UidMenuItem
            :icon="Download"
            class="fl-menu-export"
            @click="exportJson"
          >
            {{ L.exportJson }}
          </UidMenuItem>
          <UidMenuSeparator />
          <UidMenuItem
            :icon="Upload"
            :disabled="readonly"
            class="fl-menu-import-json"
            @click="openImport('json')"
          >
            {{ L.importJson }}
          </UidMenuItem>
          <UidMenuItem
            v-if="mermaid"
            :icon="FileCode"
            :disabled="readonly"
            class="fl-menu-import-mermaid"
            @click="openImport('mermaid')"
          >
            {{ L.importMermaid }}
          </UidMenuItem>
        </UidMenu>
        <slot name="toolbar" />
        <UidButton
          v-if="narrow"
          size="sm"
          variant="ghost"
          :icon="PanelRight"
          :aria-label="L.properties"
          class="fl-toolbar__side"
          @click="sideOpen = true"
        >
          <UidBadge
            v-if="errorCount"
            variant="danger"
            size="sm"
          >
            {{ errorCount }}
          </UidBadge>
        </UidButton>
      </div>

      <div class="fl-editor__body">
        <!-- Palette -->
        <aside
          v-if="!narrow && !readonly"
          class="fl-editor__palette"
          :aria-label="L.palette"
        >
          <h3 class="fl-panel-title">
            {{ L.palette }}
          </h3>
          <FlowPalette
            :registry="registry"
            :types="paletteTypes"
            :labels="L"
            :node-icons="nodeIcons"
            @add="(t: string) => addNode(t)"
            @drop="dropNode"
          />
        </aside>

        <!-- Canvas -->
        <div class="fl-editor__canvas">
          <FlowCanvas
            ref="canvas"
            :graph="level"
            :labels="L"
            :registry="registry"
            :direction="direction"
            :edge-style="edgeStyle"
            :selection="selection"
            :issues="issueMap"
            :editable="!readonly"
            :snap-grid="grid"
            :minimap="minimapOn"
            :node-renderers="nodeRenderers"
            :node-icons="nodeIcons"
            :fit-key="path.join('/')"
            :drillable="(n: FlowNode) => typeof n.subgraph === 'object'"
            :is-locked="nodeLocked"
            :aria-label="L.editor"
            @select="(ids: string[]) => select(ids)"
            @activate="onActivate"
            @enter="openSubgraph"
            @move="onMove"
            @connect="onConnect"
            @reconnect="onReconnect"
            @detach="onDetach"
            @contextmenu="onContextMenu"
            @background-dblclick="(p: Point) => !readonly && addNode('state', p)"
            @escape="onEscape"
            @update:minimap="(v: boolean) => (minimapOn = v)"
          >
            <template #overlay>
              <div
                v-if="path.length"
                class="fl-nav"
                data-fl-ui
              >
                <UidButton
                  size="sm"
                  variant="ghost"
                  :icon="ChevronLeft"
                  :aria-label="L.back"
                  class="fl-nav__back"
                  @click="goTo(path.length - 1)"
                />
                <UidBreadcrumb
                  :label="L.root"
                  collapse
                  class="fl-nav__crumbs"
                >
                  <UidBreadcrumbItem
                    v-for="c in crumbs"
                    :key="c.depth"
                    :current="c.depth === path.length"
                    @click="goTo(c.depth)"
                  >
                    {{ c.label }}
                  </UidBreadcrumbItem>
                </UidBreadcrumb>
              </div>
              <p
                v-if="level.nodes.length && !readonly && !selection.length"
                class="fl-hint"
                data-fl-ui
              >
                {{ L.connectHint }}
              </p>
            </template>
            <template #empty>
              <div class="fl-editor-empty">
                <p class="fl-empty__title">
                  {{ L.emptyEditorTitle }}
                </p>
                <p class="fl-empty__hint">
                  {{ L.emptyEditorHint }}
                </p>
                <div
                  v-if="!readonly"
                  class="fl-editor-empty__actions"
                >
                  <UidButton
                    variant="primary"
                    size="sm"
                    :icon="Plus"
                    class="fl-empty__add-start"
                    @click="addNode('start')"
                  >
                    {{ L.addStart }}
                  </UidButton>
                  <UidButton
                    v-if="mermaid"
                    variant="secondary"
                    size="sm"
                    :icon="FileCode"
                    @click="openImport('mermaid')"
                  >
                    {{ L.importMermaid }}
                  </UidButton>
                  <UidButton
                    variant="ghost"
                    size="sm"
                    :icon="Upload"
                    @click="openImport('json')"
                  >
                    {{ L.importJson }}
                  </UidButton>
                </div>
              </div>
            </template>
          </FlowCanvas>
        </div>

        <!-- Properties and issues -->
        <component
          :is="narrow ? UidDrawer : 'aside'"
          v-bind="narrow ? { modelValue: sideOpen, 'onUpdate:modelValue': (v: boolean) => (sideOpen = v), title: L.properties, width: 'min(360px, 100vw)' } : { class: 'fl-editor__side', 'aria-label': L.properties }"
        >
          <UidTabs v-model="panelTab">
            <template #list>
              <UidTab value="properties">
                {{ L.properties }}
              </UidTab>
              <UidTab
                value="issues"
                class="fl-tab-issues"
              >
                {{ L.issues }}
                <UidBadge
                  v-if="issues.length"
                  :variant="errorCount ? 'danger' : 'warning'"
                  size="sm"
                  class="fl-tab-issues__count"
                >
                  {{ issues.length }}
                </UidBadge>
              </UidTab>
            </template>
            <UidTabPanel value="properties">
              <FlowProperties
                ref="propsPanel"
                :graph="level"
                :selection="selection"
                :registry="registry"
                :labels="L"
                :readonly="readonly"
                :locked="nodeLocked"
                @command="run"
                @align="align"
                @distribute="distribute"
                @delete="deleteSelection"
                @open-subgraph="openSubgraph"
                @connect="(from: string, to: string) => onConnect({ from, to })"
                @select="(id: string) => { select([id]); canvas?.centreOn(id) }"
              />
              <slot
                name="properties"
                :selection="selection"
                :graph="level"
                :path="path"
              />
            </UidTabPanel>
            <UidTabPanel value="issues">
              <p class="fl-issues__summary">
                {{ L.issueCount(errorCount, warningCount) }}
              </p>
              <FlowIssues
                :issues="issues"
                :labels="L"
                @focus="focusIssue"
              />
            </UidTabPanel>
          </UidTabs>
        </component>
      </div>

      <UidDrawer
        v-if="narrow && !readonly"
        v-model="paletteOpen"
        side="left"
        :title="L.palette"
        width="min(280px, 85vw)"
      >
        <FlowPalette
          :registry="registry"
          :types="paletteTypes"
          :labels="L"
          :node-icons="nodeIcons"
          @add="(t: string) => { addNode(t); paletteOpen = false }"
          @drop="(t: string, c: Point) => { dropNode(t, c); paletteOpen = false }"
        />
      </UidDrawer>

      <FlowImportDialog
        v-model:open="importOpen"
        :mode="importMode"
        :labels="L"
        :mermaid="mermaid"
        @import="onImport"
      />
      <FlowContextMenu ref="menu" />
      <UidToastProvider v-if="toastProvider" />
    </div>
  </component>
</template>
