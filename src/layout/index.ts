/**
 * Graph layout: node sizes from types and labels, positions from the layered
 * layout (or the model's own positions), and routed edges with label boxes.
 * Deterministic: the same model and options give the same geometry.
 */
import { layout as layered, type LayoutCluster, type LayoutEdge, type LayoutNode, type LayoutResult } from './layered'
import { portsOf, typeOf, defaultRegistry, type NodeTypeRegistry } from '../model/registry'
import { approximateMeasurer, wrapText, type FontSpec, type TextMeasurer } from './text'
import { facingSide, midpoint, route, sidePoint, spreadable, bezierPoint, clipToShape, type Anchor, type NodeBox, type Routing } from './route'
import type { FlowEdge, FlowNode, Graph, Point, PortSide } from '../model/types'

export type { NodeBox, Anchor, Routing } from './route'

export type Direction = 'TB' | 'LR'

export interface LayoutOptions {
  /** `LR` by default (or the model's `meta.direction`). */
  direction?: Direction
  routing?: Routing
  registry?: NodeTypeRegistry
  measure?: TextMeasurer
  /** Ignore the model's positions and lay out everything. */
  ignorePositions?: boolean
  /** Space between neighbouring nodes in a rank, and between ranks. */
  nodeSep?: number
  rankSep?: number
  /** Extra room beside edge labels (the monitoring counter pill). */
  edgeLabelExtra?: number
}

export const LABEL_FONT: FontSpec = { size: 13, weight: 500 }
export const DESCRIPTION_FONT: FontSpec = { size: 11 }
export const EDGE_FONT: FontSpec = { size: 11, weight: 500 }
const LINE = 17
const DESC_LINE = 14
const PAD_X = 14
const ICON_ROOM = 26

export interface NodeGeometry extends NodeBox {
  id: string
  lines: string[]
  descriptionLines: string[]
}

export interface EdgeGeometry {
  id: string
  d: string
  /** The polyline the path follows. */
  points: Point[]
  from: Anchor
  to: Anchor
  label?: { x: number; y: number; width: number; height: number; lines: string[] }
  selfLoop?: boolean
}

export interface GroupGeometry extends NodeBox {
  id: string
  label?: string
}

export interface GraphLayout {
  direction: Direction
  routing: Routing
  nodes: Map<string, NodeGeometry>
  edges: Map<string, EdgeGeometry>
  groups: Map<string, GroupGeometry>
  /** Waypoints the layered layout chose, by edge; valid while both ends stay put. */
  waypoints: Map<string, Point[]>
  bounds: { x: number; y: number; width: number; height: number }
}

/** A node's size and wrapped label, before it is placed. */
export function measureNode(node: FlowNode, registry: NodeTypeRegistry, measure: TextMeasurer): Omit<NodeGeometry, 'x' | 'y'> {
  const def = typeOf(registry, node.type)
  const label = node.label ?? ''
  if (def.size) {
    return { id: node.id, width: def.size.width, height: def.size.height, lines: label ? wrapText(label, 160, LABEL_FONT, measure, 2) : [], descriptionLines: [] }
  }
  const min = def.minWidth ?? 120
  const max = def.maxWidth ?? 220
  const icon = def.icon && def.shape !== 'diamond' ? ICON_ROOM : 0
  const diamond = def.shape === 'diamond'
  // A diamond's text sits in its middle half.
  const room = diamond ? max * 0.62 : max - PAD_X * 2 - icon - 10
  const lines = wrapText(label, room, LABEL_FONT, measure, diamond ? 2 : 3)
  const descriptionLines = node.description && !diamond ? wrapText(node.description, room, DESCRIPTION_FONT, measure, 2) : []
  const textWidth = Math.max(0, ...lines.map((l) => measure(l, LABEL_FONT)), ...descriptionLines.map((l) => measure(l, DESCRIPTION_FONT)))
  const width = diamond
    ? Math.min(max, Math.max(min, textWidth / 0.62 + 8))
    : Math.min(max, Math.max(min, Math.ceil(textWidth + PAD_X * 2 + icon + 10)))
  const textHeight = lines.length * LINE + descriptionLines.length * DESC_LINE
  const height = Math.max(def.height ?? 44, diamond ? textHeight * 2 + 16 : textHeight + 22)
  return { id: node.id, width: Math.round(width), height: Math.round(height), lines, descriptionLines }
}

function edgeLabelText(e: FlowEdge): string {
  return e.label ?? e.condition ?? ''
}

export function measureEdgeLabel(e: FlowEdge, measure: TextMeasurer, extra = 0): { width: number; height: number; lines: string[] } | undefined {
  const text = edgeLabelText(e)
  if (!text) return undefined
  const lines = wrapText(text, 150, EDGE_FONT, measure, 2)
  const width = Math.max(...lines.map((l) => measure(l, EDGE_FONT))) + 14 + extra
  return { width: Math.ceil(width), height: lines.length * 14 + 8, lines }
}

/** Lays out a graph. */
export function layoutGraph(graph: Graph, options: LayoutOptions = {}): GraphLayout {
  const registry = options.registry ?? defaultRegistry
  const measure = options.measure ?? approximateMeasurer
  const direction: Direction = options.direction ?? graph.meta?.direction ?? 'LR'
  const routing = options.routing ?? 'spline'
  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  const groupIds = new Set((graph.groups ?? []).map((g) => g.id))

  const sized = new Map(graph.nodes.map((n) => [n.id, measureNode(n, registry, measure)]))
  const edges = graph.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
  const labels = new Map(edges.map((e) => [e.id, measureEdgeLabel(e, measure, options.edgeLabelExtra ?? 0)]))

  const fixed = options.ignorePositions ? [] : graph.nodes.filter((n) => n.position)
  const centres = new Map<string, Point>()
  let waypoints = new Map<string, Point[]>()
  let labelAt = new Map<string, Point>()
  let groupBoxes = new Map<string, NodeBox>()

  if (fixed.length < graph.nodes.length) {
    const result = runLayered(graph, sized, edges, labels, direction, groupIds, options)
    for (const [id, b] of result.nodes) centres.set(id, { x: b.x, y: b.y })
    for (const [id, r] of result.edges) {
      waypoints.set(id, r.points)
      if (r.label) labelAt.set(id, r.label)
    }
    groupBoxes = new Map([...result.clusters].map(([id, b]) => [id, b]))
    if (fixed.length > 0) {
      // Partial layout: fixed nodes keep their place; the rest keep their
      // place relative to the layout, shifted to line up with the fixed ones.
      let dx = 0
      let dy = 0
      for (const n of fixed) {
        const c = centres.get(n.id)!
        dx += n.position!.x - c.x
        dy += n.position!.y - c.y
      }
      dx /= fixed.length
      dy /= fixed.length
      const placed: NodeBox[] = []
      for (const n of fixed) {
        centres.set(n.id, { ...n.position! })
        placed.push({ ...n.position!, width: sized.get(n.id)!.width, height: sized.get(n.id)!.height })
      }
      for (const n of graph.nodes) {
        if (n.position) continue
        const c = centres.get(n.id)!
        const box: NodeBox = { x: c.x + dx, y: c.y + dy, width: sized.get(n.id)!.width, height: sized.get(n.id)!.height }
        // Step along the cross axis until it no longer overlaps a placed node.
        let guard = 0
        while (placed.some((p) => overlaps(p, box, 16)) && guard++ < 400) {
          if (direction === 'LR') box.y += 12
          else box.x += 12
        }
        centres.set(n.id, { x: box.x, y: box.y })
        placed.push(box)
      }
      // The layout's bends no longer fit; edges go direct.
      waypoints = new Map()
      labelAt = new Map()
      groupBoxes = new Map()
    }
  } else {
    for (const n of graph.nodes) centres.set(n.id, { ...n.position! })
  }

  const nodes = new Map<string, NodeGeometry>()
  for (const n of graph.nodes) {
    const s = sized.get(n.id)!
    const c = centres.get(n.id)!
    nodes.set(n.id, { ...s, x: c.x, y: c.y })
  }

  const routed = routeEdges(graph, nodes, { direction, routing, registry, waypoints, labelAt, labels })

  // Group frames: from the layout, or around the members.
  const groups = new Map<string, GroupGeometry>()
  for (const g of graph.groups ?? []) {
    const fromLayout = groupBoxes.get(g.id)
    const box = fromLayout ?? frameAround(g.id, graph, nodes)
    if (box) groups.set(g.id, { id: g.id, label: g.label, ...box })
  }

  return { direction, routing, nodes, edges: routed, groups, waypoints, bounds: boundsOf(nodes, routed, groups) }
}

function runLayered(
  graph: Graph,
  sized: Map<string, Omit<NodeGeometry, 'x' | 'y'>>,
  edges: FlowEdge[],
  labels: Map<string, { width: number; height: number } | undefined>,
  direction: Direction,
  groupIds: Set<string>,
  options: LayoutOptions,
): LayoutResult {
  const registry = options.registry ?? defaultRegistry
  const nodes: LayoutNode[] = graph.nodes.map((n) => {
    const s = sized.get(n.id)!
    const def = typeOf(registry, n.type)
    // Room for a label drawn under a circle.
    const extra = def.labelOutside && s.lines.length ? s.lines.length * LINE + 4 : 0
    const node: LayoutNode = { id: n.id, width: s.width, height: s.height + extra * 2 }
    if (n.group && groupIds.has(n.group)) node.cluster = n.group
    return node
  })
  const layoutEdges: LayoutEdge[] = edges.map((e) => {
    const l = labels.get(e.id)
    const le: LayoutEdge = { id: e.id, from: e.from, to: e.to }
    if (l) le.label = { width: l.width, height: l.height }
    // Associations (notes) should not stretch the flow.
    if (e.kind === 'association') le.weight = 0.2
    return le
  })
  const clusters: LayoutCluster[] = (graph.groups ?? []).map((g) => {
    const c: LayoutCluster = { id: g.id }
    if (g.parent && groupIds.has(g.parent)) c.parent = g.parent
    if (g.label) c.label = { width: approximateMeasurer(g.label, { size: 12, weight: 600 }) + 8, height: 18 }
    return c
  })
  try {
    return layered({
      direction,
      nodes,
      edges: layoutEdges,
      clusters,
      nodeSep: options.nodeSep ?? 36,
      rankSep: options.rankSep ?? (direction === 'LR' ? 26 : 22),
      edgeSep: 16,
      clusterPadding: 18,
      transpose: true,
    })
  } catch {
    // A broken group tree (reported by validation) must not stop the drawing.
    return layered({ direction, nodes: nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })), edges: layoutEdges, nodeSep: 36, rankSep: 24, transpose: true })
  }
}

interface RouteContext {
  direction: Direction
  routing: Routing
  registry: NodeTypeRegistry
  waypoints: Map<string, Point[]>
  labelAt: Map<string, Point>
  labels: Map<string, { width: number; height: number; lines: string[] } | undefined>
}

/**
 * Routes edges between placed nodes. Anchors on one side of a rectangular
 * node are spread along it so parallel edges do not merge.
 */
export function routeEdges(graph: Graph, nodes: Map<string, NodeGeometry | NodeBox>, ctx: RouteContext, only?: Set<string>): Map<string, EdgeGeometry> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const prefer = ctx.direction === 'TB' ? 'vertical' : 'horizontal'
  interface Pending {
    edge: FlowEdge
    ends: [{ node: FlowNode; box: NodeBox; side: PortSide; offset?: number; fixed: boolean; toward: Point }, { node: FlowNode; box: NodeBox; side: PortSide; offset?: number; fixed: boolean; toward: Point }]
    wps: Point[]
  }
  const pending: Pending[] = []
  const out = new Map<string, EdgeGeometry>()
  for (const e of graph.edges) {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    const ab = nodes.get(e.from)
    const bb = nodes.get(e.to)
    if (!a || !b || !ab || !bb) continue
    if (e.from === e.to) {
      if (only && !only.has(e.id)) continue
      out.set(e.id, selfLoop(e, ab, ctx))
      continue
    }
    const wps = ctx.waypoints.get(e.id) ?? []
    const end = (node: FlowNode, box: NodeBox, portId: string | undefined, toward: Point) => {
      const port = portId ? portsOf(ctx.registry, node).find((p) => p.id === portId) : undefined
      if (port) return { node, box, side: port.side, offset: port.offset ?? 0.5, fixed: true, toward }
      return { node, box, side: facingSide(box, toward, prefer), fixed: false, toward }
    }
    pending.push({
      edge: e,
      ends: [end(a, ab, e.fromPort, wps[0] ?? bb), end(b, bb, e.toPort, wps[wps.length - 1] ?? ab)],
      wps,
    })
  }
  // Spread anchors: group by node and side, order by where the other end lies.
  const slots = new Map<string, { p: Pending; i: 0 | 1 }[]>()
  for (const p of pending) {
    for (const i of [0, 1] as const) {
      const end = p.ends[i]
      if (end.fixed) continue
      const key = `${end.node.id}\u0000${end.side}`
      const list = slots.get(key) ?? []
      list.push({ p, i })
      slots.set(key, list)
    }
  }
  for (const list of slots.values()) {
    const first = list[0]!.p.ends[list[0]!.i]
    const shape = typeOf(ctx.registry, first.node.type).shape
    if (list.length === 1 || !spreadable(shape)) {
      for (const { p, i } of list) p.ends[i].offset = 0.5
      continue
    }
    const horizontalSide = first.side === 'top' || first.side === 'bottom'
    list.sort((u, v) => {
      const a = u.p.ends[u.i].toward
      const b = v.p.ends[v.i].toward
      return horizontalSide ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x
    })
    const span = Math.min(0.7, 0.18 * (list.length - 1))
    list.forEach(({ p, i }, k) => (p.ends[i].offset = 0.5 - span / 2 + (span * k) / (list.length - 1)))
  }
  for (const p of pending) {
    if (only && !only.has(p.edge.id)) continue
    const [s, t] = p.ends
    // Splines through layout bends leave the outline towards the first bend;
    // everything else attaches to a side (spread when several share it).
    const clipped = ctx.routing === 'spline' && p.wps.length > 0
    const from: Anchor = { point: clipped && !s.fixed ? clipToShape(s.box, typeOf(ctx.registry, s.node.type).shape, s.toward) : anchorPoint(s.box, s.side, s.offset ?? 0.5, ctx, s.node), side: s.side }
    const to: Anchor = { point: clipped && !t.fixed ? clipToShape(t.box, typeOf(ctx.registry, t.node.type).shape, t.toward) : anchorPoint(t.box, t.side, t.offset ?? 0.5, ctx, t.node), side: t.side }
    const r = route({ from, to, waypoints: p.wps, routing: ctx.routing })
    const geo: EdgeGeometry = { id: p.edge.id, d: r.d, points: r.points, from, to }
    const l = ctx.labels.get(p.edge.id)
    if (l) {
      let at = ctx.labelAt.get(p.edge.id)
      if (!at) {
        at = ctx.routing === 'spline' && p.wps.length === 0 && r.points.length === 4 ? bezierPoint(r.points[0]!, r.points[1]!, r.points[2]!, r.points[3]!, 0.5) : midpoint(r.points)
      }
      geo.label = { x: at.x, y: at.y, width: l.width, height: l.height, lines: l.lines }
    }
    out.set(p.edge.id, geo)
  }
  return out
}

function anchorPoint(box: NodeBox, side: PortSide, offset: number, ctx: RouteContext, node: FlowNode): Point {
  const shape = typeOf(ctx.registry, node.type).shape
  if (!spreadable(shape)) return sidePoint(box, side, 0.5)
  return sidePoint(box, side, offset)
}

function selfLoop(e: FlowEdge, box: NodeBox, ctx: RouteContext): EdgeGeometry {
  // Out of one side and back into the neighbouring one, away from the flow.
  const lr = ctx.direction === 'LR'
  const fromSide: PortSide = lr ? 'top' : 'right'
  const toSide: PortSide = lr ? 'top' : 'right'
  const a = sidePoint(box, fromSide, 0.7)
  const b = sidePoint(box, toSide, 0.3)
  const k = 34
  const d = lr
    ? `M ${a.x} ${a.y} C ${a.x} ${a.y - k} ${b.x} ${b.y - k} ${b.x} ${b.y}`
    : `M ${a.x} ${a.y} C ${a.x + k} ${a.y} ${b.x + k} ${b.y} ${b.x} ${b.y}`
  const apex = lr ? { x: (a.x + b.x) / 2, y: a.y - k * 0.75 } : { x: a.x + k * 0.75, y: (a.y + b.y) / 2 }
  const geo: EdgeGeometry = { id: e.id, d, points: [a, apex, b], from: { point: a, side: fromSide }, to: { point: b, side: toSide }, selfLoop: true }
  const l = ctx.labels.get(e.id)
  if (l) geo.label = { x: lr ? apex.x : apex.x + l.width / 2 + 4, y: lr ? apex.y - l.height / 2 - 4 : apex.y, width: l.width, height: l.height, lines: l.lines }
  return geo
}

function overlaps(a: NodeBox, b: NodeBox, gap = 0): boolean {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap
}

/** A group frame around its member nodes and nested groups. */
export function frameAround(groupId: string, graph: Graph, nodes: Map<string, NodeBox>, pad = 18, title = 24): NodeBox | undefined {
  const members = new Set<string>([groupId])
  let grew = true
  while (grew) {
    grew = false
    for (const g of graph.groups ?? []) {
      if (g.parent && members.has(g.parent) && !members.has(g.id)) {
        members.add(g.id)
        grew = true
      }
    }
  }
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const n of graph.nodes) {
    if (!n.group || !members.has(n.group)) continue
    const b = nodes.get(n.id)
    if (!b) continue
    x0 = Math.min(x0, b.x - b.width / 2)
    y0 = Math.min(y0, b.y - b.height / 2)
    x1 = Math.max(x1, b.x + b.width / 2)
    y1 = Math.max(y1, b.y + b.height / 2)
  }
  if (!Number.isFinite(x0)) return undefined
  // Outer frames a little larger, so nested frames stay visibly inside.
  const nested = [...members].filter((m) => m !== groupId).length > 0 ? 10 : 0
  x0 -= pad + nested
  x1 += pad + nested
  y0 -= pad + title + nested
  y1 += pad + nested
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, width: x1 - x0, height: y1 - y0 }
}

/** Everything drawn: nodes, edge bends and labels, frames. */
export function boundsOf(nodes: Map<string, NodeBox>, edges: Map<string, EdgeGeometry>, groups: Map<string, NodeBox>, outsideLabels = 40): GraphLayout['bounds'] {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const box = (b: NodeBox, extraBottom = 0) => {
    x0 = Math.min(x0, b.x - b.width / 2)
    y0 = Math.min(y0, b.y - b.height / 2)
    x1 = Math.max(x1, b.x + b.width / 2)
    y1 = Math.max(y1, b.y + b.height / 2 + extraBottom)
  }
  for (const b of nodes.values()) box(b, b.width <= 40 ? outsideLabels : 0)
  for (const g of groups.values()) box(g)
  for (const e of edges.values()) {
    for (const p of e.points) box({ x: p.x, y: p.y, width: 0, height: 0 })
    if (e.label) box(e.label)
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}
