/**
 * @dskripchenko/flow — process and state-machine graphs: the model,
 * validation, layout, monitoring state, polling and editing commands. Plain
 * TypeScript with no dependencies and no DOM.
 *
 *     import { parseGraph, validateGraph, layoutGraph } from '@dskripchenko/flow'
 */
export {
  GRAPH_VERSION,
  isEnabled,
  regionsOf,
  type BuiltinNodeType,
  type DataValue,
  type ElementKind,
  type ElementRef,
  type FlowEdge,
  type FlowGroup,
  type FlowNode,
  type Graph,
  type GraphMeta,
  type NodeType,
  type Point,
  type Port,
  type PortSide,
} from './model/types'
export { GraphError, emptyGraph, parseGraph, stringifyGraph } from './model/parse'
export {
  BUILTIN_TYPES,
  createRegistry,
  defaultRegistry,
  portsOf,
  typeOf,
  isLocked,
  type NodeShape,
  type NodeTypeDef,
  type NodeTypeRegistry,
} from './model/registry'
export { issuesByElement, validateGraph, type Issue, type IssueCode, type IssueSeverity, type ValidateOptions } from './model/validate'

export {
  DESCRIPTION_FONT,
  EDGE_FONT,
  LABEL_FONT,
  REGION_FONT,
  REGION_STRIP,
  TRIGGER_ROOM,
  boundsOf,
  frameAround,
  layoutGraph,
  measureEdgeLabel,
  measureNode,
  routeEdges,
  type Direction,
  type EdgeGeometry,
  type GraphLayout,
  type GroupGeometry,
  type LayoutOptions,
  type NodeGeometry,
} from './layout'
export {
  bezierPoint,
  distanceToPolyline,
  facingSide,
  midpoint,
  route,
  sideNormal,
  sidePoint,
  type Anchor,
  type NodeBox,
  type RouteInput,
  type RoutedPath,
  type Routing,
} from './layout/route'
export { approximateMeasurer, wrapText, type FontSpec, type TextMeasurer } from './layout/text'
export { MAX_EDGES, MAX_NODES } from './layout/layered'
export { DiagramError as LayoutError } from './layout/layered/errors'

export {
  STATUS_TONES,
  emptyMonitorState,
  isStale,
  mergeSnapshot,
  pathEdges,
  reduceMonitor,
  statusSummary,
  toEpoch,
  type EdgeRunState,
  type MonitorAction,
  type MonitorSnapshot,
  type MonitorState,
  type NodeRunState,
  type NodeStatus,
} from './monitor/state'
export {
  backoffDelay,
  createPoller,
  type BackoffOptions,
  type Poller,
  type PollerOptions,
  type PollerStatus,
  type VisibilitySource,
} from './monitor/poller'

export { CommandError, applyCommand, describeCommand, nextId, snap, type Command, type Patch } from './edit/commands'
export { History, type HistoryEntry, type HistoryOptions } from './edit/history'
export {
  alignNodes,
  copyFragment,
  distributeNodes,
  findFreeSpot,
  isFragment,
  layoutCommand,
  pasteFragment,
  type Alignment,
  type FreeSpotOptions,
  type Fragment,
} from './edit/selection'

export {
  DEFAULT_LIMITS,
  centreOn,
  clampZoom,
  fitView,
  isVisible,
  nearestInDirection,
  toGraph,
  toScreen,
  zoomAt,
  type Viewport,
  type ZoomLimits,
} from './view/viewport'
