<script setup lang="ts">
/**
 * The drawing surface shared by FlowView and FlowEditor: an SVG with groups,
 * edges and nodes under a pan/zoom transform, keyboard focus, selection, the
 * hover toolbar, and — when `editable` — dragging, connecting, reconnecting
 * and rubber-band selection. It owns no model: every change is an event.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch, type Component } from 'vue'
import { UidButton, UidSwitch, UidTooltip } from '@dskripchenko/ui'
import { SquareArrowOutUpRight } from '@dskripchenko/ui/icons'
import {
  STATUS_TONES,
  approximateMeasurer,
  boundsOf,
  defaultRegistry,
  isEnabled,
  isVisible,
  layoutGraph,
  nearestInDirection,
  pathEdges,
  portsOf,
  routeEdges,
  sidePoint,
  snap,
  typeOf,
  type EdgeGeometry,
  type ElementRef,
  type FlowEdge,
  type FlowNode,
  type Graph,
  type GraphLayout,
  type MonitorState,
  type NodeBox,
  type NodeGeometry,
  type NodeTypeRegistry,
  type Point,
  type PortSide,
  type TextMeasurer,
  type Viewport,
  type ZoomLimits,
} from '../index'
import FlowNodeShape from './FlowNodeShape.vue'
import FlowMinimap from './FlowMinimap.vue'
import FlowControls from './FlowControls.vue'
import { NODE_ICONS } from './icons'
import type { FlowLabels } from './labels'
import { canvasMeasurer } from './measure'
import { useViewport } from './useViewport'

/** What a custom node renderer receives. */
export interface NodeRendererProps {
  node: FlowNode
  geometry: NodeGeometry
  state?: MonitorState['nodes'][string]
  selected: boolean
  disabled: boolean
  current: boolean
  labels: FlowLabels
}

export interface ConnectPayload {
  from: string
  to: string
  fromPort?: string
  toPort?: string
}
export interface ReconnectPayload {
  id: string
  end: 'from' | 'to'
  node: string
  port?: string
}
export interface ContextPayload {
  target: ElementRef | null
  /** Graph coordinates. */
  point: Point
  /** Client coordinates, for placing a menu. */
  client: Point
}

const props = withDefaults(
  defineProps<{
    graph: Graph
    labels: FlowLabels
    registry?: NodeTypeRegistry
    /** `auto` (the default without `meta.direction`) picks LR for a landscape canvas and TB for a portrait one. */
    direction?: 'TB' | 'LR' | 'auto'
    /** `orthogonal` (right angles, the default) or `smooth` (curves). */
    edgeStyle?: 'orthogonal' | 'smooth'
    monitor?: MonitorState
    /** Room beside edge labels for counters (keeps layout stable once counters arrive). */
    reserveCounters?: boolean
    selection?: readonly string[]
    /** Element id → worst issue severity. */
    issues?: ReadonlyMap<string, 'error' | 'warning'>
    editable?: boolean
    toggleable?: boolean
    /** Ids whose enabled flag is overridden (optimistic toggles). */
    enabledOverrides?: ReadonlyMap<string, boolean>
    /** Node types whose nodes the editor must not change. */
    snapGrid?: number
    minimap?: boolean
    controls?: boolean
    minZoom?: number
    maxZoom?: number
    wheel?: 'zoom' | 'pan'
    nodeRenderers?: Record<string, Component>
    nodeIcons?: Record<string, Component>
    statusTones?: Record<string, string>
    /** Changing it fits the graph to the view (navigation). */
    fitKey?: string | number
    /** Subgraph ids the host can open (drill-down affordance). */
    drillable?: (node: FlowNode) => boolean
    /** Nodes the editor must not move. */
    isLocked?: (node: FlowNode) => boolean
    ariaLabel?: string
  }>(),
  {
    registry: () => defaultRegistry,
    direction: undefined,
    edgeStyle: 'orthogonal',
    monitor: undefined,
    selection: () => [],
    issues: undefined,
    enabledOverrides: undefined,
    snapGrid: 0,
    minimap: true,
    controls: true,
    minZoom: 0.15,
    maxZoom: 2.5,
    wheel: 'zoom',
    nodeRenderers: () => ({}),
    nodeIcons: () => ({}),
    statusTones: () => ({}),
    fitKey: undefined,
    drillable: undefined,
    isLocked: undefined,
    ariaLabel: undefined,
  },
)

const emit = defineEmits<{
  select: [ids: string[], primary: ElementRef | null]
  activate: [ref: ElementRef]
  enter: [nodeId: string]
  toggle: [change: { kind: 'node' | 'edge'; id: string; enabled: boolean }]
  move: [moves: { id: string; position: Point }[], merge?: string]
  connect: [payload: ConnectPayload]
  reconnect: [payload: ReconnectPayload]
  detach: [edgeId: string]
  contextmenu: [payload: ContextPayload]
  'background-dblclick': [point: Point]
  escape: []
  'update:minimap': [value: boolean]
  'focus-change': [id: string | null]
}>()

defineSlots<{
  /** Extra buttons at the end of the controls bar. */
  controls?(): unknown
  /** HTML overlays above the canvas (breadcrumb, status). */
  overlay?(): unknown
  /** Shown instead of the graph when it has no nodes. */
  empty?(): unknown
}>()

const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const root = ref<HTMLElement | null>(null)
const vp = useViewport(root, (): ZoomLimits => ({ min: props.minZoom, max: props.maxZoom }))

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const measure = shallowRef<TextMeasurer>(approximateMeasurer)
/** Decided once the canvas has a size: portrait canvases flow top to bottom. */
const autoDirection = ref<'TB' | 'LR'>('LR')
const direction = computed<'TB' | 'LR'>(() => (props.direction && props.direction !== 'auto' ? props.direction : (props.graph.meta?.direction ?? autoDirection.value)))
const layoutError = ref<string | null>(null)
const layout = computed<GraphLayout>(() => {
  try {
    layoutError.value = null
    return layoutGraph(props.graph, {
      registry: props.registry,
      direction: direction.value,
      routing: props.edgeStyle === 'smooth' ? 'spline' : 'orthogonal',
      measure: measure.value,
      edgeLabelExtra: props.reserveCounters ? 30 : 0,
    })
  } catch (e) {
    layoutError.value = (e as Error).message
    return layoutGraph({ version: 1, nodes: [], edges: [] })
  }
})

const nodesById = computed(() => new Map(props.graph.nodes.map((n) => [n.id, n])))
const edgesById = computed(() => new Map(props.graph.edges.map((e) => [e.id, e])))

/** Live drag: node ids and the offset in graph units. */
const drag = shallowRef<{ ids: Set<string>; dx: number; dy: number } | null>(null)

const nodeBoxes = computed<Map<string, NodeGeometry>>(() => {
  const base = layout.value.nodes
  const d = drag.value
  if (!d || (d.dx === 0 && d.dy === 0)) return base
  const out = new Map(base)
  for (const id of d.ids) {
    const b = base.get(id)
    if (b) out.set(id, { ...b, x: b.x + d.dx, y: b.y + d.dy })
  }
  return out
})

/** Edges re-routed during a drag: only those touching moved nodes. */
const edgeGeometry = computed<Map<string, EdgeGeometry>>(() => {
  const base = layout.value.edges
  const d = drag.value
  if (!d || (d.dx === 0 && d.dy === 0)) return base
  const affected = new Set<string>()
  for (const e of props.graph.edges) if (d.ids.has(e.from) || d.ids.has(e.to)) affected.add(e.id)
  if (affected.size === 0) return base
  const labels = new Map<string, { width: number; height: number; lines: string[] } | undefined>()
  for (const [id, g] of base) labels.set(id, g.label ? { width: g.label.width, height: g.label.height, lines: g.label.lines } : undefined)
  const waypoints = new Map([...layout.value.waypoints].filter(([id]) => !affected.has(id)))
  const rerouted = routeEdges(props.graph, nodeBoxes.value, {
    direction: layout.value.direction,
    routing: layout.value.routing,
    registry: props.registry,
    waypoints,
    labelAt: new Map(),
    labels,
    groups: layout.value.groups,
  }, affected)
  const out = new Map(base)
  for (const [id, g] of rerouted) out.set(id, g)
  return out
})

const groupBoxes = computed(() => layout.value.groups)
const bounds = computed(() => (drag.value ? boundsOf(nodeBoxes.value, edgeGeometry.value, groupBoxes.value) : layout.value.bounds))

// ---------------------------------------------------------------------------
// Monitoring and element state
// ---------------------------------------------------------------------------

const selected = computed(() => new Set(props.selection))
const pathEdgeSet = computed(() => new Set(pathEdges(props.graph, props.monitor?.path)))
const pathNodeSet = computed(() => new Set(props.monitor?.path ?? []))
const currentSet = computed(() => new Set(props.monitor?.current ?? []))

function enabledOf(kind: 'node' | 'edge', el: { id: string; enabled?: boolean }): boolean {
  const o = props.enabledOverrides?.get(el.id)
  void kind
  return o ?? isEnabled(el)
}
function toneOf(status: string | undefined): string | undefined {
  if (!status) return undefined
  return props.statusTones[status] ?? STATUS_TONES[status] ?? 'neutral'
}
function nodeDisabled(n: FlowNode): boolean {
  return !enabledOf('node', n)
}
function edgeDisabled(e: FlowEdge): boolean {
  if (!enabledOf('edge', e)) return true
  const a = nodesById.value.get(e.from)
  const b = nodesById.value.get(e.to)
  return (!!a && nodeDisabled(a)) || (!!b && nodeDisabled(b))
}
function edgeClass(e: FlowEdge) {
  const run = props.monitor?.edges[e.id]
  return {
    'is-disabled': edgeDisabled(e),
    'is-selected': selected.value.has(e.id),
    'is-focused': focusedId.value === e.id,
    'is-hovered': hoverId.value === e.id,
    'is-path': pathEdgeSet.value.has(e.id),
    'is-traversed': !!run?.traversed && !pathEdgeSet.value.has(e.id),
    'is-association': e.kind === 'association',
    'has-error': props.issues?.get(e.id) === 'error',
    'has-warning': props.issues?.get(e.id) === 'warning',
  }
}
function markerFor(e: FlowEdge): string | undefined {
  if (e.kind === 'association') return undefined
  const c = edgeClass(e)
  const tone = c['is-selected'] ? 'accent' : c['is-path'] ? 'accent' : c['is-traversed'] ? 'success' : c['is-disabled'] ? 'muted' : 'default'
  return `url(#${uid}-arrow-${tone})`
}
function edgeCount(e: FlowEdge): string {
  const c = props.monitor?.edges[e.id]?.count
  return c === undefined || c === null ? '' : String(c)
}
function isDrillable(n: FlowNode): boolean {
  return props.drillable ? props.drillable(n) : n.subgraph !== undefined
}
function nodeAria(n: FlowNode): string {
  const parts = [n.label || props.labels.types[n.type] || n.type, props.labels.types[n.type] ?? n.type]
  const st = props.monitor?.nodes[n.id]?.status
  if (st) parts.push(props.labels.statuses[st] ?? st)
  const count = props.monitor?.nodes[n.id]?.count
  if (count !== undefined) parts.push(`${props.labels.instances}: ${count}`)
  if (nodeDisabled(n)) parts.push(props.labels.disabledTag)
  if (currentSet.value.has(n.id)) parts.push(props.labels.currentPath)
  return parts.join(', ')
}
function edgeAria(e: FlowEdge): string {
  const a = nodesById.value.get(e.from)
  const b = nodesById.value.get(e.to)
  const parts = [`${a?.label ?? e.from} → ${b?.label ?? e.to}`]
  if (e.label) parts.unshift(e.label)
  if (edgeDisabled(e)) parts.push(props.labels.disabledTag)
  return parts.join(', ')
}

// ---------------------------------------------------------------------------
// Focus, hover, selection
// ---------------------------------------------------------------------------

const focusedId = ref<string | null>(null)
const hoverId = ref<string | null>(null)
let hoverTimer: ReturnType<typeof setTimeout> | undefined

function setHover(id: string | null): void {
  clearTimeout(hoverTimer)
  if (id) hoverId.value = id
  // A short grace period lets the pointer travel to the toolbar.
  else hoverTimer = setTimeout(() => (hoverId.value = null), 160)
}

function elementRef(id: string): ElementRef | null {
  if (nodesById.value.has(id)) return { kind: 'node', id }
  if (edgesById.value.has(id)) return { kind: 'edge', id }
  return null
}

function selectElement(id: string | null, additive = false): void {
  if (!id) {
    if (props.selection.length) emit('select', [], null)
    return
  }
  const ref = elementRef(id)
  if (additive) {
    const next = new Set(props.selection)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    emit('select', [...next], next.has(id) ? ref : null)
  } else {
    emit('select', [id], ref)
  }
}

function focusElement(id: string): void {
  const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&')
  const el = root.value?.querySelector<SVGGElement>(`[data-focus-id="${esc}"]`)
  el?.focus({ preventScroll: true })
}

function onFocusIn(id: string): void {
  focusedId.value = id
  emit('focus-change', id)
  const b = nodeBoxes.value.get(id) ?? edgeGeometry.value.get(id)?.label
  if (b && !isVisible(vp.current(), b, vp.size.value.width, vp.size.value.height)) vp.centre({ x: b.x, y: b.y })
}
function onFocusOut(id: string): void {
  if (focusedId.value === id) {
    focusedId.value = null
    emit('focus-change', null)
  }
}

// ---------------------------------------------------------------------------
// Pointer interaction
// ---------------------------------------------------------------------------

type Gesture =
  | { kind: 'pan'; startX: number; startY: number; vx: number; vy: number; moved: boolean; tap?: { id: string; additive: boolean } }
  | { kind: 'band'; start: Point; end: Point; additive: boolean; base: string[] }
  | { kind: 'drag'; id: string; ids: Set<string>; start: Point; moved: boolean; additive: boolean }
  | { kind: 'connect'; from: string; fromPort?: string; side: PortSide; start: Point; pointer: Point; target: { node: string; port?: string; point: Point } | null; reconnect?: { id: string; end: 'from' | 'to'; fixed: string; fixedPort?: string } }

const gesture = shallowRef<Gesture | null>(null)
const pointers = new Map<number, Point>()
let pinch: { dist: number; mid: Point } | null = null
let spaceDown = false
let longPress: ReturnType<typeof setTimeout> | undefined
let moveFrame = 0
let lastMove: PointerEvent | null = null
let tapTimer: ReturnType<typeof setTimeout> | undefined
/** A pointer to capture once the gesture really moves. */
let deferredCapture: number | null = null

const band = computed(() => {
  const g = gesture.value
  if (!g || g.kind !== 'band') return null
  return { x: Math.min(g.start.x, g.end.x), y: Math.min(g.start.y, g.end.y), width: Math.abs(g.end.x - g.start.x), height: Math.abs(g.end.y - g.start.y) }
})
const connectPreview = computed(() => {
  const g = gesture.value
  if (!g || g.kind !== 'connect') return null
  const end = g.target?.point ?? g.pointer
  const dx = end.x - g.start.x
  const dy = end.y - g.start.y
  const k = Math.max(30, Math.hypot(dx, dy) * 0.4)
  const n = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[g.side]
  return {
    d: `M ${g.start.x} ${g.start.y} C ${g.start.x + n[0]! * k} ${g.start.y + n[1]! * k} ${end.x - dx * 0.2} ${end.y - dy * 0.2} ${end.x} ${end.y}`,
    target: g.target?.node ?? null,
    end,
  }
})

function hitElement(target: EventTarget | null): { kind: 'node' | 'edge' | 'port' | 'end' | 'ui'; id: string; side?: PortSide; port?: string; end?: 'from' | 'to' } | null {
  let el = target as Element | null
  while (el && el !== root.value) {
    const ds = (el as HTMLElement).dataset ?? {}
    if (ds.flUi !== undefined) return { kind: 'ui', id: '' }
    if (ds.portNode) return { kind: 'port', id: ds.portNode, side: ds.portSide as PortSide, port: ds.portId || undefined }
    if (ds.edgeEnd) return { kind: 'end', id: ds.edgeEnd, end: ds.end as 'from' | 'to' }
    if (ds.nodeId) return { kind: 'node', id: ds.nodeId }
    if (ds.edgeId) return { kind: 'edge', id: ds.edgeId }
    el = el.parentElement
  }
  return null
}

function onPointerDown(e: PointerEvent): void {
  const hit = hitElement(e.target)
  if (hit?.kind === 'ui') return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2) {
    // Second finger: pinch replaces whatever the first one started.
    cancelGesture()
    const [a, b] = [...pointers.values()]
    pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 } }
    return
  }
  if (e.button === 2) return
  const local = vp.clientToGraph(e.clientX, e.clientY)
  if (e.pointerType === 'touch') {
    clearTimeout(longPress)
    longPress = setTimeout(() => {
      const g = gesture.value
      if (g && ((g.kind === 'pan' && g.moved) || (g.kind === 'drag' && g.moved))) return
      cancelGesture()
      emit('contextmenu', { target: hit && (hit.kind === 'node' || hit.kind === 'edge') ? { kind: hit.kind, id: hit.id } : null, point: local, client: { x: e.clientX, y: e.clientY } })
    }, 550)
  }
  const panAnyway = e.button === 1 || spaceDown
  if (!panAnyway && props.editable && hit?.kind === 'port') {
    const node = nodesById.value.get(hit.id)!
    const box = nodeBoxes.value.get(hit.id)!
    const start = portPoint(node, box, hit.side!, hit.port)
    gesture.value = { kind: 'connect', from: hit.id, fromPort: hit.port, side: hit.side!, start, pointer: local, target: null }
    capture(e)
    e.preventDefault()
    return
  }
  if (!panAnyway && props.editable && hit?.kind === 'end') {
    const edge = edgesById.value.get(hit.id)!
    const geo = edgeGeometry.value.get(hit.id)!
    const fixedEnd = hit.end === 'from' ? geo.to : geo.from
    gesture.value = {
      kind: 'connect',
      from: hit.end === 'from' ? edge.to : edge.from,
      fromPort: hit.end === 'from' ? edge.toPort : edge.fromPort,
      side: fixedEnd.side,
      start: fixedEnd.point,
      pointer: local,
      target: null,
      reconnect: { id: edge.id, end: hit.end!, fixed: hit.end === 'from' ? edge.to : edge.from, fixedPort: hit.end === 'from' ? edge.toPort : edge.fromPort },
    }
    capture(e)
    e.preventDefault()
    return
  }
  // The viewer selects on a tap (released without moving): a pan or a pinch
  // that starts over a node must not open its details.
  if (!panAnyway && !props.editable && (hit?.kind === 'node' || hit?.kind === 'edge')) {
    const v = vp.current()
    gesture.value = { kind: 'pan', startX: e.clientX, startY: e.clientY, vx: v.x, vy: v.y, moved: false, tap: { id: hit.id, additive: e.shiftKey || e.metaKey || e.ctrlKey } }
    // Captured once it moves: capturing now would retarget click/dblclick to the canvas.
    deferredCapture = e.pointerId
    return
  }
  if (!panAnyway && hit?.kind === 'node') {
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    const alreadySelected = selected.value.has(hit.id)
    if (!alreadySelected || additive) selectElement(hit.id, additive)
    if (props.editable && !(additive && alreadySelected)) {
      const ids = new Set(alreadySelected && !additive ? props.selection.filter((id) => nodesById.value.has(id)) : additive ? [...props.selection.filter((id) => nodesById.value.has(id)), hit.id] : [hit.id])
      for (const id of ids) {
        const n = nodesById.value.get(id)
        if (n && props.isLocked?.(n)) ids.delete(id)
      }
      gesture.value = { kind: 'drag', id: hit.id, ids, start: local, moved: false, additive }
      deferredCapture = e.pointerId
    }
    return
  }
  if (!panAnyway && hit?.kind === 'edge') {
    selectElement(hit.id, e.shiftKey || e.metaKey || e.ctrlKey)
    return
  }
  if (!panAnyway && props.editable && e.shiftKey) {
    gesture.value = { kind: 'band', start: local, end: local, additive: true, base: [...props.selection] }
    capture(e)
    return
  }
  const v = vp.current()
  gesture.value = { kind: 'pan', startX: e.clientX, startY: e.clientY, vx: v.x, vy: v.y, moved: false }
  capture(e)
}

function capture(e: PointerEvent): void {
  try {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  } catch {
    // Synthetic events in tests have no active pointer.
  }
}

function onPointerMove(e: PointerEvent): void {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()]
    const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }
    const local = vp.clientToLocal(mid.x, mid.y)
    vp.panBy(mid.x - pinch.mid.x, mid.y - pinch.mid.y)
    if (pinch.dist > 0) vp.zoomBy(dist / pinch.dist, local)
    pinch = { dist, mid }
    userMoved = true
    return
  }
  if (!gesture.value) return
  if (deferredCapture === e.pointerId) {
    const g = gesture.value
    const start = g.kind === 'pan' ? { x: g.startX, y: g.startY } : null
    const far = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) > 3 : true
    if (far) {
      deferredCapture = null
      try {
        root.value?.setPointerCapture(e.pointerId)
      } catch {
        // The pointer is gone.
      }
    }
  }
  lastMove = e
  if (moveFrame) return
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number
  moveFrame = raf(() => {
    moveFrame = 0
    if (lastMove) applyMove(lastMove)
  })
}

function applyMove(e: PointerEvent): void {
  const g = gesture.value
  if (!g) return
  const p = vp.clientToGraph(e.clientX, e.clientY)
  if (g.kind === 'pan') {
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (Math.hypot(dx, dy) > 3) {
      g.moved = true
      userMoved = true
      clearTimeout(longPress)
    }
    vp.set({ ...vp.current(), x: g.vx + dx, y: g.vy + dy })
  } else if (g.kind === 'band') {
    gesture.value = { ...g, end: p }
  } else if (g.kind === 'drag') {
    let dx = p.x - g.start.x
    let dy = p.y - g.start.y
    if (!g.moved && Math.hypot(dx, dy) * vp.current().k < 4) return
    g.moved = true
    clearTimeout(longPress)
    if (props.snapGrid > 0) {
      // Snap the grabbed node; the rest of the selection moves with it.
      const b = layout.value.nodes.get(g.id)
      if (b) {
        const s = snap({ x: b.x + dx, y: b.y + dy }, props.snapGrid)
        dx = s.x - b.x
        dy = s.y - b.y
      }
    }
    drag.value = { ids: g.ids, dx, dy }
  } else if (g.kind === 'connect') {
    gesture.value = { ...g, pointer: p, target: findTarget(p, g) }
  }
}

/** The nearest node/port to drop a connection on, within a snapping radius. */
function findTarget(p: Point, g: Extract<Gesture, { kind: 'connect' }>): { node: string; port?: string; point: Point } | null {
  const radius = 28 / vp.current().k
  let best: { node: string; port?: string; point: Point; d: number } | null = null
  for (const n of props.graph.nodes) {
    const box = nodeBoxes.value.get(n.id)
    if (!box) continue
    const inside = Math.abs(p.x - box.x) <= box.width / 2 + radius && Math.abs(p.y - box.y) <= box.height / 2 + radius
    if (!inside) continue
    const def = typeOf(props.registry, n.type)
    const incoming = g.reconnect ? g.reconnect.end === 'to' : true
    if (incoming && def.noIncoming) continue
    if (!incoming && def.noOutgoing) continue
    if (n.id === g.from && !g.reconnect) continue
    for (const h of handlesOf(n, box)) {
      if (h.port && portKindBlocks(n, h.port, incoming)) continue
      const d = Math.hypot(h.point.x - p.x, h.point.y - p.y)
      if (!best || d < best.d) best = { node: n.id, port: h.port, point: h.point, d }
    }
  }
  return best ? { node: best.node, port: best.port, point: best.point } : null
}

function portKindBlocks(n: FlowNode, portId: string, incoming: boolean): boolean {
  const port = portsOf(props.registry, n).find((p) => p.id === portId)
  return !!port && ((incoming && port.kind === 'out') || (!incoming && port.kind === 'in'))
}

function onPointerUp(e: PointerEvent): void {
  pointers.delete(e.pointerId)
  deferredCapture = null
  clearTimeout(longPress)
  if (pinch) {
    if (pointers.size < 2) pinch = null
    return
  }
  if (lastMove && gesture.value) applyMove(e)
  lastMove = null
  const g = gesture.value
  gesture.value = null
  if (!g) return
  if (g.kind === 'pan') {
    if (!g.moved) {
      const tap = g.tap
      const n = tap ? nodesById.value.get(tap.id) : undefined
      clearTimeout(tapTimer)
      // A drillable node waits a moment: a second click enters it instead.
      if (n && isDrillable(n)) tapTimer = setTimeout(() => selectElement(tap!.id, tap!.additive), 230)
      else selectElement(tap?.id ?? null, tap?.additive)
    }
  } else if (g.kind === 'band') {
    const b = band.value ?? { x: g.start.x, y: g.start.y, width: Math.abs(g.end.x - g.start.x), height: Math.abs(g.end.y - g.start.y) }
    const x0 = Math.min(g.start.x, g.end.x)
    const y0 = Math.min(g.start.y, g.end.y)
    const x1 = x0 + b.width
    const y1 = y0 + b.height
    const hits = props.graph.nodes
      .filter((n) => {
        const nb = nodeBoxes.value.get(n.id)
        return nb && nb.x + nb.width / 2 >= x0 && nb.x - nb.width / 2 <= x1 && nb.y + nb.height / 2 >= y0 && nb.y - nb.height / 2 <= y1
      })
      .map((n) => n.id)
    const ids = [...new Set([...g.base, ...hits])]
    emit('select', ids, ids.length ? elementRef(ids[ids.length - 1]!) : null)
  } else if (g.kind === 'drag') {
    const d = drag.value
    drag.value = null
    if (g.moved && d && (d.dx !== 0 || d.dy !== 0)) {
      const moves = [...d.ids].map((id) => {
        const b = layout.value.nodes.get(id)!
        return { id, position: { x: Math.round(b.x + d.dx), y: Math.round(b.y + d.dy) } }
      })
      emit('move', moves)
    } else if (!g.moved && !g.additive && props.selection.length > 1) {
      // A click on one of several selected nodes selects just it.
      selectElement(g.id)
    }
  } else if (g.kind === 'connect') {
    const t = g.target
    if (g.reconnect) {
      if (t) emit('reconnect', { id: g.reconnect.id, end: g.reconnect.end, node: t.node, port: t.port })
      else emit('detach', g.reconnect.id)
    } else if (t) {
      const payload: ConnectPayload = { from: g.from, to: t.node }
      if (g.fromPort) payload.fromPort = g.fromPort
      if (t.port) payload.toPort = t.port
      emit('connect', payload)
    }
  }
}

function cancelGesture(): void {
  if (gesture.value?.kind === 'drag') drag.value = null
  gesture.value = null
  clearTimeout(longPress)
}

function onWheel(e: WheelEvent): void {
  if (props.graph.nodes.length === 0) return
  e.preventDefault()
  userMoved = true
  const at = vp.clientToLocal(e.clientX, e.clientY)
  if (e.ctrlKey || e.metaKey || props.wheel === 'zoom') {
    const scale = e.ctrlKey ? 0.01 : 0.0015
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
    vp.zoomBy(Math.exp(-dy * scale), at)
  } else {
    vp.panBy(-e.deltaX, -e.deltaY)
  }
}

function onContextMenu(e: MouseEvent): void {
  const hit = hitElement(e.target)
  if (hit?.kind === 'ui') return
  e.preventDefault()
  const target = hit && (hit.kind === 'node' || hit.kind === 'edge') ? ({ kind: hit.kind, id: hit.id } as ElementRef) : null
  if (target && !selected.value.has(target.id)) selectElement(target.id)
  emit('contextmenu', { target, point: vp.clientToGraph(e.clientX, e.clientY), client: { x: e.clientX, y: e.clientY } })
}

function onDblClick(e: MouseEvent): void {
  const hit = hitElement(e.target)
  if (hit?.kind === 'node') {
    const n = nodesById.value.get(hit.id)
    clearTimeout(tapTimer)
    if (n && !props.editable && isDrillable(n)) emit('enter', n.id)
    else emit('activate', { kind: 'node', id: hit.id })
    return
  }
  if (hit?.kind === 'edge') {
    emit('activate', { kind: 'edge', id: hit.id })
    return
  }
  if (!hit) emit('background-dblclick', vp.clientToGraph(e.clientX, e.clientY))
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

function onKeyDown(e: KeyboardEvent): void {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (e.key === ' ' && !(e.target as Element)?.closest?.('[data-focus-id]')) {
    spaceDown = true
    root.value?.classList.add('is-space')
    e.preventDefault()
    return
  }
  const id = focusedId.value
  if (e.key === 'Escape') {
    if (gesture.value) {
      cancelGesture()
      e.preventDefault()
      return
    }
    emit('escape')
    return
  }
  if ((e.key === 'Enter' || e.key === ' ') && id) {
    e.preventDefault()
    const ref = elementRef(id)
    if (!ref) return
    selectElement(id, e.shiftKey)
    if (!e.shiftKey) emit('activate', ref)
    return
  }
  if (e.key.startsWith('Arrow')) {
    const dir = e.key.slice(5).toLowerCase() as 'up' | 'down' | 'left' | 'right'
    if (props.editable && props.selection.some((s) => nodesById.value.has(s)) && !e.altKey) return // the editor nudges
    const from = id ? (nodeBoxes.value.get(id) ?? edgeGeometry.value.get(id)?.label) : undefined
    const start = from ?? { x: bounds.value.x, y: bounds.value.y + bounds.value.height / 2 }
    const next = from
      ? nearestInDirection(start, [...nodeBoxes.value.values()].filter((b) => b.id !== id), dir)
      : props.graph.nodes[0]?.id
    if (next) {
      e.preventDefault()
      focusElement(next)
    }
    return
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === '+' || e.key === '=') {
    vp.zoomBy(1.2, undefined, true)
    e.preventDefault()
  } else if (e.key === '-' || e.key === '_') {
    vp.zoomBy(1 / 1.2, undefined, true)
    e.preventDefault()
  } else if (e.key === '0') {
    fit(true)
    e.preventDefault()
  }
}
function onKeyUp(e: KeyboardEvent): void {
  if (e.key === ' ') {
    spaceDown = false
    root.value?.classList.remove('is-space')
  }
}

// ---------------------------------------------------------------------------
// Ports (editor)
// ---------------------------------------------------------------------------

const SIDES: PortSide[] = ['top', 'right', 'bottom', 'left']

function portPoint(node: FlowNode, box: NodeBox, side: PortSide, portId?: string): Point {
  const port = portId ? portsOf(props.registry, node).find((p) => p.id === portId) : undefined
  const def = typeOf(props.registry, node.type)
  const spreadable = def.shape === 'rect' || def.shape === 'rounded' || def.shape === 'note' || def.shape === 'pill'
  return sidePoint(box, port?.side ?? side, spreadable ? (port?.offset ?? 0.5) : 0.5)
}

function handlesOf(node: FlowNode, box: NodeBox): { side: PortSide; port?: string; point: Point; kind: 'in' | 'out' | 'both' }[] {
  const ports = portsOf(props.registry, node)
  if (ports.length) return ports.map((p) => ({ side: p.side, port: p.id, point: portPoint(node, box, p.side, p.id), kind: p.kind ?? 'both' }))
  return SIDES.map((side) => ({ side, point: sidePoint(box, side, 0.5), kind: 'both' as const }))
}

const handleNodes = computed(() => {
  if (!props.editable) return []
  const ids = new Set<string>()
  if (hoverId.value && nodesById.value.has(hoverId.value)) ids.add(hoverId.value)
  const g = gesture.value
  if (g?.kind === 'connect') {
    ids.add(g.from)
    if (g.target) ids.add(g.target.node)
  }
  if (props.selection.length === 1 && nodesById.value.has(props.selection[0]!)) ids.add(props.selection[0]!)
  if (g?.kind === 'drag' && g.moved) return []
  return [...ids]
    .map((id) => nodesById.value.get(id)!)
    .map((n) => ({ node: n, handles: handlesOf(n, nodeBoxes.value.get(n.id)!), def: typeOf(props.registry, n.type) }))
})

const selectedEdgeEnds = computed(() => {
  if (!props.editable || props.selection.length !== 1) return null
  const id = props.selection[0]!
  const geo = edgeGeometry.value.get(id)
  if (!geo || gesture.value?.kind === 'connect') return null
  return { id, from: geo.from.point, to: geo.to.point }
})

// ---------------------------------------------------------------------------
// Hover toolbar (viewer): enable switch and the way into a sub-process
// ---------------------------------------------------------------------------

const toolbar = computed(() => {
  if (props.editable || gesture.value) return null
  const id = hoverId.value
  if (!id) return null
  const v = vp.view.value
  const n = nodesById.value.get(id)
  if (n) {
    const drill = isDrillable(n)
    if (!props.toggleable && !drill) return null
    const b = nodeBoxes.value.get(id)
    if (!b) return null
    return { kind: 'node' as const, id, x: b.x * v.k + v.x, y: (b.y - b.height / 2) * v.k + v.y, enabled: !nodeDisabled(n), drill, label: n.label ?? n.id }
  }
  const e = edgesById.value.get(id)
  if (e && props.toggleable) {
    const geo = edgeGeometry.value.get(id)
    if (!geo) return null
    const at = geo.label ?? geo.points[Math.floor(geo.points.length / 2)]!
    return { kind: 'edge' as const, id, x: at.x * v.k + v.x, y: (at.y - (geo.label ? geo.label.height / 2 : 0)) * v.k + v.y, enabled: enabledOf('edge', e), drill: false, label: e.label ?? `${e.from} → ${e.to}` }
  }
  return null
})

// ---------------------------------------------------------------------------
// Fit and lifecycle
// ---------------------------------------------------------------------------

/** Screen space taken by overlays (status line, breadcrumb, controls, minimap), measured from the DOM. */
function insets(): { top: number; right: number; bottom: number; left: number } {
  const el = root.value
  const out = { top: 16, right: 16, bottom: 16, left: 16 }
  if (!el) return out
  const r = el.getBoundingClientRect()
  for (const o of el.querySelectorAll<HTMLElement>('.fl-status, .fl-nav')) {
    const b = o.getBoundingClientRect()
    if (b.height > 0 && b.top - r.top < r.height / 3) out.top = Math.max(out.top, b.bottom - r.top + 12)
  }
  for (const o of el.querySelectorAll<HTMLElement>('.fl-controls, .fl-minimap, .fl-hint')) {
    const b = o.getBoundingClientRect()
    if (b.height > 0 && r.bottom - b.bottom < r.height / 3) out.bottom = Math.max(out.bottom, r.bottom - b.top + 12)
  }
  return out
}

/**
 * The offset along one axis: the graph centred when it fits, else `focus`
 * centred but clamped so no empty space shows before the graph's start or
 * after its end.
 */
function place(k: number, focus: number, g0: number, g1: number, a: number, len: number): number {
  if ((g1 - g0) * k <= len) return a + len / 2 - ((g0 + g1) / 2) * k
  const t = a + len / 2 - focus * k
  return Math.min(a - g0 * k, Math.max(a + len - g1 * k, t))
}

function viewAt(k: number, focus: { x: number; y: number }): Viewport {
  const { width, height } = vp.size.value
  const b = layout.value.bounds
  const i = insets()
  return {
    k,
    x: place(k, focus.x, b.x, b.x + b.width, i.left, width - i.left - i.right),
    y: place(k, focus.y, b.y, b.y + b.height, i.top, height - i.top - i.bottom),
  }
}

/** The zoom that shows the whole graph between the overlays (never above 100 %). */
function wholeZoom(): number {
  const { width, height } = vp.size.value
  const b = layout.value.bounds
  const i = insets()
  const k = Math.min((width - i.left - i.right) / Math.max(1, b.width), (height - i.top - i.bottom) / Math.max(1, b.height), 1)
  return Math.min(props.maxZoom, Math.max(props.minZoom, k))
}

/** Shows the whole graph (the fit button). */
function fit(smooth = false): void {
  const b = layout.value.bounds
  if ((b.width === 0 && b.height === 0) || !vp.size.value.width) return
  vp.set(viewAt(wholeZoom(), { x: b.x + b.width / 2, y: b.y + b.height / 2 }), smooth)
}

/** Below this zoom labels are hard to read: the first view never opens smaller. */
const READABLE = 0.85
/** The user has panned or zoomed: automatic moves stop. */
let userMoved = false

/** Where a reader starts: the current step, else an active one, else a start node, else the first node along the flow. */
function focusNode(): NodeGeometry | undefined {
  const boxes = nodeBoxes.value
  for (const id of props.monitor?.current ?? []) if (boxes.has(id)) return boxes.get(id)
  for (const [id, st] of Object.entries(props.monitor?.nodes ?? {})) if (st.status === 'active' && boxes.has(id)) return boxes.get(id)
  const start = props.graph.nodes.find((n) => typeOf(props.registry, n.type).noIncoming && boxes.has(n.id))
  if (start) return boxes.get(start.id)
  const lr = layout.value.direction === 'LR'
  let best: NodeGeometry | undefined
  for (const b of boxes.values()) if (!best || (lr ? b.x < best.x : b.y < best.y)) best = b
  return best
}

/** The first view: the whole graph when it fits at a readable zoom, else 100 % on the step that matters. */
function autoFit(): void {
  const b = layout.value.bounds
  if ((b.width === 0 && b.height === 0) || !vp.size.value.width) return
  const whole = wholeZoom()
  if (whole >= READABLE) {
    fit()
    return
  }
  const f = focusNode() ?? { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  vp.set(viewAt(Math.min(1, props.maxZoom), f))
}

let ro: ResizeObserver | undefined
let fitted = false
onMounted(() => {
  const el = root.value!
  const family = typeof getComputedStyle === 'function' ? getComputedStyle(el).fontFamily : ''
  measure.value = canvasMeasurer(family)
  const update = () => {
    const r = el.getBoundingClientRect()
    const first = vp.size.value.width === 0
    vp.size.value = { width: r.width, height: r.height }
    if (first && r.width > 0) autoDirection.value = r.height > r.width * 1.1 ? 'TB' : 'LR'
    if (first || !fitted) {
      // After the measurer and the direction have re-laid the graph.
      void nextTick(() => {
        autoFit()
        fitted = vp.size.value.width > 0 && props.graph.nodes.length > 0
      })
    }
  }
  update()
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(update)
    ro.observe(el)
  }
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
})
function onWindowBlur(): void {
  spaceDown = false
  root.value?.classList.remove('is-space')
}
onBeforeUnmount(() => {
  ro?.disconnect()
  vp.dispose()
  clearTimeout(hoverTimer)
  clearTimeout(longPress)
  clearTimeout(tapTimer)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onWindowBlur)
})

watch(
  () => props.fitKey,
  async () => {
    userMoved = false
    await nextTick()
    autoFit()
    fitted = props.graph.nodes.length > 0
  },
)
watch(
  () => props.graph.nodes.length > 0,
  async (has) => {
    if (has && !fitted) {
      await nextTick()
      autoFit()
      fitted = vp.size.value.width > 0
    }
  },
)
// The first time an instance shows up, bring it into view (unless the user has moved the view).
watch(
  () => props.monitor?.current?.[0],
  (id, before) => {
    if (!id || userMoved || !fitted) return
    const b = nodeBoxes.value.get(id)
    if (b && (!before || !isVisible(vp.current(), b, vp.size.value.width, vp.size.value.height, 32))) vp.set(viewAt(vp.current().k, b), true)
  },
)

const transform = computed(() => {
  const v = vp.view.value
  return `translate(${v.x} ${v.y}) scale(${v.k})`
})
const gridSize = computed(() => {
  const step = props.snapGrid > 0 ? props.snapGrid : 20
  let s = step * vp.view.value.k
  while (s < 10) s *= 2
  return s
})
function userZoomReset(): void {
  userMoved = true
  vp.zoomTo(1)
}
function userZoom(f: number): void {
  userMoved = true
  vp.zoomBy(f, undefined, true)
}
const zoomPercent = computed(() => Math.round(vp.view.value.k * 100))

defineExpose({
  fit,
  zoomIn: () => vp.zoomBy(1.2, undefined, true),
  zoomOut: () => vp.zoomBy(1 / 1.2, undefined, true),
  zoomTo: (k: number) => vp.zoomTo(k),
  centreOn: (id: string) => {
    const b = nodeBoxes.value.get(id) ?? edgeGeometry.value.get(id)?.label
    if (b) vp.centre({ x: b.x, y: b.y })
  },
  focusElement,
  clientToGraph: vp.clientToGraph,
  viewCentre: () => {
    const { width, height } = vp.size.value
    const v = vp.current()
    return { x: (width / 2 - v.x) / v.k, y: (height / 2 - v.y) / v.k }
  },
  layout,
  nodeBoxes,
  root,
})

/** The node's group and its ancestors, space-separated (for tests and host styling). */
function groupChain(id: string | undefined): string | undefined {
  const parent = new Map((props.graph.groups ?? []).map((g) => [g.id, g.parent]))
  const out: string[] = []
  let g = id
  while (g !== undefined && !out.includes(g) && out.length < 50) {
    out.push(g)
    g = parent.get(g)
  }
  return out.length ? out.join(' ') : undefined
}

function iconFor(n: FlowNode): Component | undefined {
  const def = typeOf(props.registry, n.type)
  return props.nodeIcons[n.type] ?? (def.icon ? (props.nodeIcons[def.icon] ?? NODE_ICONS[def.icon]) : undefined)
}
</script>

<template>
  <div
    ref="root"
    class="fl-canvas"
    :class="{
      'is-editable': editable,
      'is-panning': gesture?.kind === 'pan' && gesture.moved,
      'is-dragging': gesture?.kind === 'drag' && gesture.moved,
      'is-connecting': gesture?.kind === 'connect',
      'is-animating': vp.animate.value,
    }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
    @contextmenu="onContextMenu"
    @dblclick="onDblClick"
    @keydown="onKeyDown"
  >
    <svg
      class="fl-svg"
      role="group"
      :aria-label="ariaLabel ?? graph.meta?.title ?? labels.graph"
      :aria-roledescription="labels.graph"
    >
      <defs>
        <pattern
          :id="`${uid}-grid`"
          :width="gridSize"
          :height="gridSize"
          patternUnits="userSpaceOnUse"
          :x="vp.view.value.x % gridSize"
          :y="vp.view.value.y % gridSize"
        >
          <circle
            class="fl-grid-dot"
            :cx="1"
            :cy="1"
            r="1"
          />
        </pattern>
        <marker
          v-for="tone in ['default', 'accent', 'success', 'muted', 'danger']"
          :id="`${uid}-arrow-${tone}`"
          :key="tone"
          :class="`fl-arrow fl-arrow--${tone}`"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path d="M 1 1.5 L 9 5 L 1 8.5 Q 2.5 5 1 1.5 Z" />
        </marker>
      </defs>
      <rect
        class="fl-bg"
        width="100%"
        height="100%"
        :fill="`url(#${uid}-grid)`"
      />
      <g
        class="fl-viewport"
        :transform="transform"
      >
        <!-- Groups -->
        <g class="fl-groups">
          <g
            v-for="g in groupBoxes.values()"
            :key="g.id"
            class="fl-group"
            :data-group-id="g.id"
          >
            <rect
              :x="g.x - g.width / 2"
              :y="g.y - g.height / 2"
              :width="g.width"
              :height="g.height"
              rx="14"
            />
            <text
              v-if="g.label"
              class="fl-group__label"
              :x="g.x - g.width / 2 + 14"
              :y="g.y - g.height / 2 + 20"
            >{{ g.label }}</text>
          </g>
        </g>

        <!-- Edge lines -->
        <g class="fl-edges">
          <template
            v-for="e in graph.edges"
            :key="e.id"
          >
            <g
              v-if="edgeGeometry.get(e.id)"
              class="fl-edge"
              :class="edgeClass(e)"
              :data-edge-id="e.id"
              :data-from="e.from"
              :data-to="e.to"
              @pointerenter="setHover(e.id)"
              @pointerleave="setHover(null)"
            >
              <path
                class="fl-edge__hit"
                :d="edgeGeometry.get(e.id)!.d"
              />
              <path
                class="fl-edge__line"
                :d="edgeGeometry.get(e.id)!.d"
                :marker-end="markerFor(e)"
              />
              <path
                v-if="pathEdgeSet.has(e.id)"
                class="fl-edge__flow"
                :d="edgeGeometry.get(e.id)!.d"
              />
            </g>
          </template>
        </g>

        <!-- Nodes -->
        <g class="fl-nodes">
          <g
            v-for="n in graph.nodes"
            :key="n.id"
            class="fl-node-wrap"
            :class="{ 'is-hovered': hoverId === n.id, 'is-drop-target': connectPreview?.target === n.id }"
            :data-node-id="n.id"
            :data-focus-id="n.id"
            :data-groups="groupChain(n.group)"
            :transform="`translate(${nodeBoxes.get(n.id)!.x - nodeBoxes.get(n.id)!.width / 2} ${nodeBoxes.get(n.id)!.y - nodeBoxes.get(n.id)!.height / 2})`"
            tabindex="0"
            role="button"
            :aria-label="nodeAria(n)"
            :aria-pressed="selected.has(n.id)"
            :aria-disabled="nodeDisabled(n) || undefined"
            @focus="onFocusIn(n.id)"
            @blur="onFocusOut(n.id)"
            @pointerenter="setHover(n.id)"
            @pointerleave="setHover(null)"
          >
            <component
              :is="nodeRenderers[n.type]"
              v-if="nodeRenderers[n.type]"
              :node="n"
              :geometry="nodeBoxes.get(n.id)!"
              :state="monitor?.nodes[n.id]"
              :selected="selected.has(n.id)"
              :disabled="nodeDisabled(n)"
              :current="currentSet.has(n.id)"
              :labels="labels"
            />
            <FlowNodeShape
              v-else
              :node="n"
              :geometry="nodeBoxes.get(n.id)!"
              :def="typeOf(registry, n.type)"
              :run="monitor?.nodes[n.id]"
              :tone="toneOf(monitor?.nodes[n.id]?.status)"
              :disabled="nodeDisabled(n)"
              :selected="selected.has(n.id)"
              :focused="focusedId === n.id"
              :current="currentSet.has(n.id)"
              :on-path="pathNodeSet.has(n.id)"
              :issue="issues?.get(n.id)"
              :drillable="isDrillable(n)"
              :icon="iconFor(n)"
              :labels="labels"
              :label-side="layout.direction === 'TB' ? 'right' : 'below'"
              @enter="emit('enter', n.id)"
            />
          </g>
        </g>

        <!-- Edge labels and focus targets, above the nodes. -->
        <g class="fl-edge-labels">
          <template
            v-for="e in graph.edges"
            :key="e.id"
          >
            <g
              v-if="edgeGeometry.get(e.id)"
              class="fl-edge-label"
              :class="edgeClass(e)"
              :data-edge-id="e.id"
              :data-focus-id="e.id"
              :tabindex="editable || toggleable ? 0 : -1"
              role="button"
              :aria-label="edgeAria(e)"
              :aria-pressed="selected.has(e.id)"
              @focus="onFocusIn(e.id)"
              @blur="onFocusOut(e.id)"
              @pointerenter="setHover(e.id)"
              @pointerleave="setHover(null)"
            >
              <template v-if="edgeGeometry.get(e.id)!.label">
                <rect
                  class="fl-edge-label__bg"
                  :x="edgeGeometry.get(e.id)!.label!.x - edgeGeometry.get(e.id)!.label!.width / 2"
                  :y="edgeGeometry.get(e.id)!.label!.y - edgeGeometry.get(e.id)!.label!.height / 2"
                  :width="edgeGeometry.get(e.id)!.label!.width"
                  :height="edgeGeometry.get(e.id)!.label!.height"
                  rx="6"
                />
                <text
                  class="fl-edge-label__text"
                  :x="edgeGeometry.get(e.id)!.label!.x - (edgeCount(e) || reserveCounters ? 15 : 0)"
                  :y="edgeGeometry.get(e.id)!.label!.y - (edgeGeometry.get(e.id)!.label!.lines.length - 1) * 7.5 + 4.5"
                  text-anchor="middle"
                >
                  <tspan
                    v-for="(line, i) in edgeGeometry.get(e.id)!.label!.lines"
                    :key="i"
                    :x="edgeGeometry.get(e.id)!.label!.x - (edgeCount(e) || reserveCounters ? 15 : 0)"
                    :dy="i === 0 ? 0 : 15"
                  >{{ line }}</tspan>
                </text>
                <g
                  v-if="edgeCount(e)"
                  class="fl-edge-count"
                  :transform="`translate(${edgeGeometry.get(e.id)!.label!.x + edgeGeometry.get(e.id)!.label!.width / 2 - 16} ${edgeGeometry.get(e.id)!.label!.y})`"
                >
                  <rect
                    x="-12"
                    y="-8"
                    width="24"
                    height="16"
                    rx="8"
                  />
                  <text
                    x="0"
                    y="3.5"
                    text-anchor="middle"
                  >{{ edgeCount(e) }}</text>
                </g>
              </template>
              <g
                v-else-if="edgeCount(e)"
                class="fl-edge-count fl-edge-count--alone"
                :transform="`translate(${edgeGeometry.get(e.id)!.points[Math.floor(edgeGeometry.get(e.id)!.points.length / 2)]!.x} ${edgeGeometry.get(e.id)!.points[Math.floor(edgeGeometry.get(e.id)!.points.length / 2)]!.y})`"
              >
                <rect
                  x="-13"
                  y="-9"
                  width="26"
                  height="18"
                  rx="9"
                />
                <text
                  x="0"
                  y="4"
                  text-anchor="middle"
                >{{ edgeCount(e) }}</text>
              </g>
            </g>
          </template>
        </g>

        <!-- Editor: ports, edge ends, connection preview, rubber band. -->
        <g
          v-if="editable"
          class="fl-edit-layer"
        >
          <g
            v-for="h in handleNodes"
            :key="h.node.id"
            class="fl-handles"
          >
            <template
              v-for="p in h.handles"
              :key="p.side + (p.port ?? '')"
            >
              <g
                v-if="!(h.def.noOutgoing && p.kind !== 'in' && gesture?.kind !== 'connect') || connectPreview?.target === h.node.id"
                class="fl-handle"
                :class="{ 'is-snapped': connectPreview?.target === h.node.id && connectPreview.end.x === p.point.x && connectPreview.end.y === p.point.y }"
                :data-port-node="h.node.id"
                :data-port-side="p.side"
                :data-port-id="p.port ?? ''"
              >
                <circle
                  class="fl-handle__hit"
                  :cx="p.point.x"
                  :cy="p.point.y"
                  r="11"
                />
                <circle
                  class="fl-handle__dot"
                  :cx="p.point.x"
                  :cy="p.point.y"
                  r="5"
                />
              </g>
            </template>
          </g>
          <g
            v-if="selectedEdgeEnds"
            class="fl-edge-ends"
          >
            <circle
              v-for="end in (['from', 'to'] as const)"
              :key="end"
              class="fl-edge-end"
              :data-edge-end="selectedEdgeEnds.id"
              :data-end="end"
              :cx="selectedEdgeEnds[end].x"
              :cy="selectedEdgeEnds[end].y"
              r="6"
            />
          </g>
          <path
            v-if="connectPreview"
            class="fl-connect-preview"
            :class="{ 'is-snapped': !!connectPreview.target }"
            :d="connectPreview.d"
            :marker-end="`url(#${uid}-arrow-accent)`"
          />
          <rect
            v-if="band"
            class="fl-band"
            :x="band.x"
            :y="band.y"
            :width="band.width"
            :height="band.height"
          />
        </g>
      </g>
    </svg>

    <div
      v-if="graph.nodes.length === 0"
      class="fl-empty"
      data-fl-ui
    >
      <slot name="empty">
        <p class="fl-empty__title">
          {{ labels.empty }}
        </p>
        <p class="fl-empty__hint">
          {{ labels.emptyHint }}
        </p>
      </slot>
    </div>
    <div
      v-if="layoutError"
      class="fl-layout-error"
      data-fl-ui
      role="alert"
    >
      {{ layoutError }}
    </div>

    <!-- Hover toolbar -->
    <div
      v-if="toolbar"
      class="fl-hovebar"
      :class="`fl-hovebar--${toolbar.kind}`"
      data-fl-ui
      :style="{ left: `${toolbar.x}px`, top: `${toolbar.y}px` }"
      @pointerenter="setHover(toolbar.id)"
      @pointerleave="setHover(null)"
    >
      <UidSwitch
        v-if="toggleable"
        size="sm"
        :model-value="toolbar.enabled"
        :label="labels.enabled"
        :aria-label="`${labels.enabled}: ${toolbar.label}`"
        @update:model-value="(v: boolean) => emit('toggle', { kind: toolbar!.kind, id: toolbar!.id, enabled: v })"
      />
      <UidTooltip
        v-if="toolbar.drill"
        :content="labels.enter"
      >
        <UidButton
          size="sm"
          variant="ghost"
          :icon="SquareArrowOutUpRight"
          :aria-label="`${labels.enter}: ${toolbar.label}`"
          @click="emit('enter', toolbar!.id)"
        />
      </UidTooltip>
    </div>

    <slot name="overlay" />

    <FlowControls
      v-if="controls && graph.nodes.length > 0"
      :labels="labels"
      :zoom="zoomPercent"
      :minimap="minimap"
      @zoom-in="userZoom(1.2)"
      @zoom-out="userZoom(1 / 1.2)"
      @zoom-reset="userZoomReset"
      @fit="fit(true)"
      @update:minimap="(v: boolean) => emit('update:minimap', v)"
    >
      <slot name="controls" />
    </FlowControls>

    <FlowMinimap
      v-if="minimap && graph.nodes.length > 0"
      :nodes="nodeBoxes"
      :groups="groupBoxes"
      :bounds="bounds"
      :view="vp.view.value"
      :size="vp.size.value"
      :selection="selected"
      :current="currentSet"
      :label="labels.minimap"
      @centre="(p: Point) => vp.centre(p, false)"
    />
  </div>
</template>
