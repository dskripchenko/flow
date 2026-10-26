/**
 * Interface strings. English and Russian ship with the package; a host passes
 * `labels` to override any of them, or a whole dictionary for another language.
 */
export interface FlowLabels {
  graph: string
  zoomIn: string
  zoomOut: string
  fit: string
  minimap: string
  root: string
  back: string
  enter: string
  details: string
  enabled: string
  disabledTag: string
  id: string
  type: string
  status: string
  count: string
  instances: string
  traversed: string
  data: string
  condition: string
  from: string
  to: string
  message: string
  subprocess: string
  updated: string
  updatedJustNow: string
  updatedAgo: (seconds: number) => string
  stale: string
  paused: string
  live: string
  loading: string
  loadError: string
  retry: string
  refresh: string
  toggleFailed: string
  subgraphFailed: string
  currentPath: string
  empty: string
  emptyHint: string
  statuses: Record<string, string>
  types: Record<string, string>
  /** A `parallel` node's join and its regions. */
  join: string
  joinAll: string
  joinAny: string
  joinUnset: string
  regions: string
  /** An edge's trigger (`FlowEdge.trigger`). */
  trigger: string
  triggerNone: string
  triggerTimer: string
  triggerEvent: string
  // Editor
  editor: string
  palette: string
  paletteHint: string
  properties: string
  issues: string
  noIssues: string
  issueCount: (errors: number, warnings: number) => string
  undo: string
  redo: string
  delete: string
  duplicate: string
  copy: string
  paste: string
  cut: string
  selectAll: string
  autoLayout: string
  align: string
  alignLeft: string
  alignCenter: string
  alignRight: string
  alignTop: string
  alignMiddle: string
  alignBottom: string
  distributeH: string
  distributeV: string
  snapToGrid: string
  more: string
  exportJson: string
  importJson: string
  importMermaid: string
  importApply: string
  importPlaceholderJson: string
  importPlaceholderMermaid: string
  importError: string
  cancel: string
  label: string
  description: string
  nodeType: string
  edgeKind: string
  transition: string
  association: string
  subgraphRef: string
  subgraphInline: (nodes: number) => string
  subgraphCreate: string
  subgraphOpen: string
  subgraphRemove: string
  addField: string
  key: string
  value: string
  removeField: string
  locked: string
  nothingSelected: string
  selectedCount: (n: number) => string
  graphTitle: string
  direction: string
  directionLR: string
  directionTB: string
  directionAuto: string
  addStart: string
  enable: string
  transitions: string
  addTransition: string
  disable: string
  addHere: string
  connectHint: string
  emptyEditorTitle: string
  emptyEditorHint: string
  edge: string
  node: string
  group: string
  readOnly: string
}

export const en: FlowLabels = {
  graph: 'Process graph',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit to view',
  minimap: 'Minimap',
  root: 'Process',
  back: 'Back',
  enter: 'Open sub-process',
  details: 'Details',
  enabled: 'Enabled',
  disabledTag: 'Disabled',
  id: 'ID',
  type: 'Type',
  status: 'Status',
  count: 'Count',
  instances: 'Instances',
  traversed: 'Traversed',
  data: 'Data',
  condition: 'Condition',
  from: 'From',
  to: 'To',
  message: 'Message',
  subprocess: 'Sub-process',
  updated: 'Updated',
  updatedJustNow: 'Updated just now',
  updatedAgo: (s) => (s < 60 ? `Updated ${s} s ago` : `Updated ${Math.floor(s / 60)} min ago`),
  stale: 'Data is out of date',
  paused: 'Paused',
  live: 'Live',
  loading: 'Loading…',
  loadError: 'Could not load the state',
  retry: 'Retry',
  refresh: 'Refresh now',
  toggleFailed: 'Could not change the element; the change was undone',
  subgraphFailed: 'Could not open the sub-process',
  currentPath: 'Current path',
  empty: 'Nothing to show',
  emptyHint: 'The process has no steps yet.',
  join: 'Join',
  joinAll: 'all regions',
  joinAny: 'any region',
  joinUnset: 'Not set',
  regions: 'Regions',
  trigger: 'Trigger',
  triggerNone: 'None',
  triggerTimer: 'Timer',
  triggerEvent: 'Event',
  statuses: { active: 'Active', done: 'Done', error: 'Error', waiting: 'Waiting', skipped: 'Skipped', unknown: 'Unknown', compensated: 'Compensated' },
  types: { start: 'Start', end: 'End', state: 'State', task: 'Task', decision: 'Decision', subprocess: 'Sub-process', parallel: 'Parallel', timer: 'Timer', wait: 'Wait', any: 'Any state', note: 'Note' },
  editor: 'Process editor',
  palette: 'Elements',
  paletteHint: 'Drag onto the canvas or press to add',
  properties: 'Properties',
  issues: 'Issues',
  noIssues: 'No issues found',
  issueCount: (e, w) => [e ? `${e} error${e === 1 ? '' : 's'}` : '', w ? `${w} warning${w === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ') || 'No issues',
  undo: 'Undo',
  redo: 'Redo',
  delete: 'Delete',
  duplicate: 'Duplicate',
  copy: 'Copy',
  paste: 'Paste',
  cut: 'Cut',
  selectAll: 'Select all',
  autoLayout: 'Auto layout',
  align: 'Align',
  alignLeft: 'Align left',
  alignCenter: 'Align centres',
  alignRight: 'Align right',
  alignTop: 'Align top',
  alignMiddle: 'Align middles',
  alignBottom: 'Align bottom',
  distributeH: 'Distribute horizontally',
  distributeV: 'Distribute vertically',
  snapToGrid: 'Snap to grid',
  more: 'More',
  exportJson: 'Export JSON',
  importJson: 'Import JSON',
  importMermaid: 'Import Mermaid',
  importApply: 'Import',
  importPlaceholderJson: 'Paste the model JSON: { "version": 1, "nodes": [...], "edges": [...] }',
  importPlaceholderMermaid: 'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review: submit',
  importError: 'Could not import',
  cancel: 'Cancel',
  label: 'Label',
  description: 'Description',
  nodeType: 'Type',
  edgeKind: 'Kind',
  transition: 'Transition',
  association: 'Association',
  subgraphRef: 'Sub-process reference',
  subgraphInline: (n) => `Inline sub-process, ${n} step${n === 1 ? '' : 's'}`,
  subgraphCreate: 'Create inline sub-process',
  subgraphOpen: 'Open',
  subgraphRemove: 'Remove',
  addField: 'Add field',
  key: 'Key',
  value: 'Value',
  removeField: 'Remove field',
  locked: 'This element is locked',
  nothingSelected: 'Select a step or a transition to edit it.',
  selectedCount: (n) => `${n} selected`,
  graphTitle: 'Title',
  direction: 'Layout direction',
  directionLR: 'Left to right',
  directionTB: 'Top to bottom',
  directionAuto: 'Automatic (fits the screen)',
  addStart: 'Add a start node',
  enable: 'Enable',
  transitions: 'Transitions',
  addTransition: 'Add a transition to…',
  disable: 'Disable',
  addHere: 'Add here',
  connectHint: 'Drag from a handle to connect',
  emptyEditorTitle: 'Start your process',
  emptyEditorHint: 'Drag a start node from the elements panel, or import a Mermaid state diagram.',
  edge: 'Transition',
  node: 'Step',
  group: 'Group',
  readOnly: 'Read only',
}

export const ru: FlowLabels = {
  graph: 'Граф процесса',
  zoomIn: 'Приблизить',
  zoomOut: 'Отдалить',
  fit: 'Показать целиком',
  minimap: 'Миникарта',
  root: 'Процесс',
  back: 'Назад',
  enter: 'Открыть подпроцесс',
  details: 'Подробности',
  enabled: 'Включено',
  disabledTag: 'Отключено',
  id: 'ID',
  type: 'Тип',
  status: 'Статус',
  count: 'Количество',
  instances: 'Экземпляры',
  traversed: 'Пройден',
  data: 'Данные',
  condition: 'Условие',
  from: 'Откуда',
  to: 'Куда',
  message: 'Сообщение',
  subprocess: 'Подпроцесс',
  updated: 'Обновлено',
  updatedJustNow: 'Обновлено только что',
  updatedAgo: (s) => (s < 60 ? `Обновлено ${s} с назад` : `Обновлено ${Math.floor(s / 60)} мин назад`),
  stale: 'Данные устарели',
  paused: 'Пауза',
  live: 'В реальном времени',
  loading: 'Загрузка…',
  loadError: 'Не удалось загрузить состояние',
  retry: 'Повторить',
  refresh: 'Обновить сейчас',
  toggleFailed: 'Не удалось изменить элемент, изменение отменено',
  subgraphFailed: 'Не удалось открыть подпроцесс',
  currentPath: 'Текущий путь',
  empty: 'Нечего показать',
  emptyHint: 'В процессе пока нет шагов.',
  join: 'Завершение',
  joinAll: 'все регионы',
  joinAny: 'любой регион',
  joinUnset: 'Не задано',
  regions: 'Регионы',
  trigger: 'Триггер',
  triggerNone: 'Нет',
  triggerTimer: 'Таймер',
  triggerEvent: 'Событие',
  statuses: { active: 'Активен', done: 'Завершён', error: 'Ошибка', waiting: 'Ожидание', skipped: 'Пропущен', unknown: 'Неизвестно', compensated: 'Компенсирован' },
  types: { start: 'Начало', end: 'Конец', state: 'Состояние', task: 'Задача', decision: 'Развилка', subprocess: 'Подпроцесс', parallel: 'Параллельно', timer: 'Таймер', wait: 'Ожидание', any: 'Любое состояние', note: 'Заметка' },
  editor: 'Редактор процесса',
  palette: 'Элементы',
  paletteHint: 'Перетащите на холст или нажмите, чтобы добавить',
  properties: 'Свойства',
  issues: 'Проблемы',
  noIssues: 'Проблем не найдено',
  issueCount: (e, w) => [e ? `ошибок: ${e}` : '', w ? `предупреждений: ${w}` : ''].filter(Boolean).join(', ') || 'Проблем нет',
  undo: 'Отменить',
  redo: 'Повторить',
  delete: 'Удалить',
  duplicate: 'Дублировать',
  copy: 'Копировать',
  paste: 'Вставить',
  cut: 'Вырезать',
  selectAll: 'Выделить всё',
  autoLayout: 'Авторасстановка',
  align: 'Выровнять',
  alignLeft: 'По левому краю',
  alignCenter: 'По центру',
  alignRight: 'По правому краю',
  alignTop: 'По верху',
  alignMiddle: 'По середине',
  alignBottom: 'По низу',
  distributeH: 'Распределить по горизонтали',
  distributeV: 'Распределить по вертикали',
  snapToGrid: 'Привязка к сетке',
  more: 'Ещё',
  exportJson: 'Экспорт JSON',
  importJson: 'Импорт JSON',
  importMermaid: 'Импорт Mermaid',
  importApply: 'Импортировать',
  importPlaceholderJson: 'Вставьте JSON модели: { "version": 1, "nodes": [...], "edges": [...] }',
  importPlaceholderMermaid: 'stateDiagram-v2\n  [*] --> Черновик\n  Черновик --> Проверка: отправить',
  importError: 'Не удалось импортировать',
  cancel: 'Отмена',
  label: 'Название',
  description: 'Описание',
  nodeType: 'Тип',
  edgeKind: 'Вид',
  transition: 'Переход',
  association: 'Связь',
  subgraphRef: 'Ссылка на подпроцесс',
  subgraphInline: (n) => `Встроенный подпроцесс, шагов: ${n}`,
  subgraphCreate: 'Создать встроенный подпроцесс',
  subgraphOpen: 'Открыть',
  subgraphRemove: 'Убрать',
  addField: 'Добавить поле',
  key: 'Ключ',
  value: 'Значение',
  removeField: 'Удалить поле',
  locked: 'Этот элемент заблокирован',
  nothingSelected: 'Выберите шаг или переход, чтобы изменить его.',
  selectedCount: (n) => `Выделено: ${n}`,
  graphTitle: 'Название',
  direction: 'Направление',
  directionLR: 'Слева направо',
  directionTB: 'Сверху вниз',
  directionAuto: 'Автоматически (по экрану)',
  addStart: 'Добавить начало',
  enable: 'Включить',
  transitions: 'Переходы',
  addTransition: 'Добавить переход в…',
  disable: 'Отключить',
  addHere: 'Добавить сюда',
  connectHint: 'Потяните за точку, чтобы соединить',
  emptyEditorTitle: 'Начните процесс',
  emptyEditorHint: 'Перетащите начальный узел из панели элементов или импортируйте диаграмму состояний Mermaid.',
  edge: 'Переход',
  node: 'Шаг',
  group: 'Группа',
  readOnly: 'Только чтение',
}

export const LOCALES: Readonly<Record<'en' | 'ru', FlowLabels>> = { en, ru }

/** The dictionary for a locale, with the host's overrides on top. */
export function resolveLabels(locale: string | undefined, overrides?: Partial<FlowLabels>): FlowLabels {
  const base = locale === 'ru' ? ru : en
  return overrides ? { ...base, ...overrides, statuses: { ...base.statuses, ...overrides.statuses }, types: { ...base.types, ...overrides.types } } : base
}
