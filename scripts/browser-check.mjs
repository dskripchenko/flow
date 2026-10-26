// Browser check of the viewer and the editor: renders the order process in
// both themes and at phone width, checks the geometry (no overlapping nodes or
// labels), drives monitoring against the playground's fake endpoint, toggles
// with rollback, drill-down, zoom/pan/fit and the keyboard, then the editor's
// real interactions (palette drag, drag-to-connect, undo/redo, multi-select,
// delete, properties, context menu, Mermaid import), a 500-node graph, and the
// standalone bundle. Screenshots go to tests/browser/output (and to
// FLOW_SHOTS_DIR when set). Builds dist/standalone.js first unless
// FLOW_CHECK_SKIP_BUILD=1 and the bundle exists.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { build, createServer } from 'vite'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const out = resolve(root, 'tests/browser/output')
mkdirSync(out, { recursive: true })

if (!process.env.FLOW_CHECK_SKIP_BUILD || !existsSync(resolve(root, 'dist/standalone.js'))) {
  await build({ configFile: resolve(root, 'vite.standalone.config.ts'), root, logLevel: 'warn' })
}

const port = Number(process.env.FLOW_CHECK_PORT ?? 5321)
const server = await createServer({ configFile: resolve(root, 'playground/vite.config.ts'), server: { host: '127.0.0.1', port, strictPort: true, forwardConsole: false }, logLevel: 'warn' })
await server.listen()
// IPv4 on both ends: in a container `localhost` may resolve to ::1 for the server and 127.0.0.1 for fetch.
const base = `http://127.0.0.1:${port}/`
const browser = await chromium.launch()
const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

async function open(url, viewport = DESKTOP, { touch = false } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()))
  await page.goto(base + url)
  await page.waitForSelector('[data-node-id], .fl-empty')
  await page.waitForTimeout(500)
  return { page, errors, close: () => context.close() }
}

/** Overlaps between node outlines, node labels outside their node, and edge labels over nodes or each other. */
async function geometry(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.left, y: r.top, w: r.width, h: r.height }
    }
    const overlap = (a, b, pad = 0) => a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad
    const inside = (a, b, pad = 1.5) => a.x >= b.x - pad && a.y >= b.y - pad && a.x + a.w <= b.x + b.w + pad && a.y + a.h <= b.y + b.h + pad
    const nodes = [...document.querySelectorAll('[data-node-id]')].map((g) => ({
      id: g.dataset.nodeId,
      body: rect(g.querySelector('.fl-node__body')),
      label: g.querySelector('.fl-node__label:not(.fl-node__label--outside)'),
    }))
    const problems = []
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) if (overlap(nodes[i].body, nodes[j].body, 1)) problems.push(`nodes ${nodes[i].id} × ${nodes[j].id}`)
      const n = nodes[i]
      if (n.label && n.label.textContent.trim() && !inside(rect(n.label), n.body)) problems.push(`label outside ${n.id}`)
    }
    const labels = [...document.querySelectorAll('.fl-edge-label__bg')].map((r) => ({ id: r.closest('[data-edge-id]').dataset.edgeId, r: rect(r) }))
    for (const l of labels) for (const n of nodes) if (overlap(l.r, n.body, 1)) problems.push(`edge label ${l.id} over ${n.id}`)
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (overlap(labels[i].r, labels[j].r, 1)) problems.push(`edge labels ${labels[i].id} × ${labels[j].id}`)
    // Edges: not through other nodes, not through groups holding neither end.
    const groups = [...document.querySelectorAll('[data-group-id]')].map((g) => ({ id: g.dataset.groupId, r: rect(g.querySelector('rect')) }))
    const groupsOf = (id) => (document.querySelector(`[data-node-id="${CSS.escape(id)}"]`)?.dataset.groups ?? '').split(' ').filter(Boolean)
    const shrink = (r, d) => ({ x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d })
    const inRect = (p, r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h
    for (const g of document.querySelectorAll('.fl-edge')) {
      if (g.classList.contains('is-association')) continue
      const path = g.querySelector('.fl-edge__line')
      const m = path.getScreenCTM()
      const len = path.getTotalLength()
      const pts = []
      for (let d = 0; d <= len; d += 4) {
        const p = path.getPointAtLength(d)
        pts.push({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })
      }
      const { edgeId, from, to } = g.dataset
      for (const n of nodes) {
        if (n.id === from || n.id === to) continue
        if (pts.some((p) => inRect(p, shrink(n.body, 2)))) problems.push(`edge ${edgeId} through node ${n.id}`)
      }
      const own = new Set([...groupsOf(from), ...groupsOf(to)])
      for (const gr of groups) {
        if (own.has(gr.id)) continue
        if (pts.some((p) => inRect(p, shrink(gr.r, 2)))) problems.push(`edge ${edgeId} through group ${gr.id}`)
      }
    }
    return { problems, nodes: nodes.length, labels: labels.length }
  })
}
const transform = (page) => page.$eval('.fl-viewport', (g) => g.getAttribute('transform'))
const zoomOf = async (page) => Number(/scale\(([\d.]+)\)/.exec(await transform(page))?.[1] ?? 'NaN')
const currentNodes = (page) => page.$$eval('[data-node-id] .fl-node.is-current', (els) => els.map((e) => e.closest('[data-node-id]').dataset.nodeId))
const centre = async (page, selector) => {
  const b = await page.locator(selector).first().boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
// Let transitions (drawers, menus, the viewport) settle first.
/** Node rectangles against the overlay rectangles (status line, controls, minimap, breadcrumb). */
const overlayHits = (page, ids) =>
  page.evaluate((ids) => {
    const r = (el) => el.getBoundingClientRect()
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    const overlays = [...document.querySelectorAll('.fl-status, .fl-controls, .fl-minimap, .fl-nav')].map(r)
    const canvas = r(document.querySelector('.fl-canvas'))
    return [...document.querySelectorAll('[data-node-id]')]
      .filter((n) => !ids || ids.includes(n.dataset.nodeId))
      .filter((n) => {
        const b = r(n)
        const inside = b.left >= canvas.left && b.right <= canvas.right && b.top >= canvas.top && b.bottom <= canvas.bottom
        return !inside || overlays.some((o) => hit(b, o))
      })
      .map((n) => n.dataset.nodeId)
  }, ids)
const nodesClear = async (page) => (await overlayHits(page)).length === 0
const currentClear = async (page) => {
  const ids = await currentNodes(page)
  return ids.length > 0 && (await overlayHits(page, ids)).length === 0
}
const shot = async (page, name) => {
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${out}/${name}.png` })
}

try {
  // ------------------------------------------------------------------ viewer
  for (const theme of ['light', 'dark']) {
    for (const routing of ['orthogonal', 'smooth']) {
      const { page, errors, close } = await open(`?view=monitor&theme=${theme}&edges=${routing}&interval=700`)
      await page.waitForSelector('.fl-node.is-current')
      await page.waitForTimeout(600)
      check(`monitor/${theme}/${routing}: renders without errors`, errors.length === 0, errors.join('; '))
      check(`monitor/${theme}/${routing}: opens at a readable zoom`, (await zoomOf(page)) >= 0.85, String(await zoomOf(page)))
      check(`monitor/${theme}/${routing}: the current step is in view, clear of overlays`, await currentClear(page))
      const geo = await geometry(page)
      check(`monitor/${theme}/${routing}: no overlapping nodes or labels, no edges through nodes or foreign groups`, geo.problems.length === 0, geo.problems.slice(0, 6).join('; '))
      if (routing === 'orthogonal') await shot(page, `view-${theme}-desktop`)
      await page.locator('.fl-controls__fit').click()
      await page.waitForTimeout(400)
      check(`monitor/${theme}/${routing}: fit keeps every node clear of the overlays`, await nodesClear(page))
      if (routing === 'orthogonal') await shot(page, `view-${theme}-desktop-fit`)
      await close()
    }
    for (const routing of ['orthogonal']) {
      const { page, errors, close } = await open(`?view=monitor&theme=${theme}&edges=${routing}`, PHONE, { touch: true })
      await page.waitForSelector('.fl-node.is-current')
      await page.waitForTimeout(400)
      check(`monitor/${theme}/phone: renders without errors`, errors.length === 0, errors.join('; '))
      check(`monitor/${theme}/phone: portrait canvas flows top to bottom`, await page.evaluate(() => {
        const y = (id) => document.querySelector(`[data-node-id="${id}"]`).getBoundingClientRect().top
        return y('validate') > y('new')
      }))
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      check(`monitor/${theme}/phone: no horizontal page scroll`, scroll)
      await shot(page, `view-${theme}-phone`)
      await close()
    }
  }

  // Monitoring: polled updates move the instance along; errors and staleness show.
  {
    await fetch(`${base}api/state?reset&fail=0`)
    const { page, errors, close } = await open('?view=monitor&interval=500&stale=1500')
    await page.waitForSelector('.fl-node.is-current')
    const first = await currentNodes(page)
    await page.waitForTimeout(1300)
    const later = await currentNodes(page)
    check('monitoring: polled snapshots move the current node', first.join() !== later.join() && later.length === 1, `${first} → ${later}`)
    check('monitoring: the path is highlighted', (await page.locator('.fl-edge.is-path').count()) > 0)
    check('monitoring: counters on nodes and edges', (await page.locator('.fl-node__count').count()) > 0 && (await page.locator('.fl-edge-count').count()) > 0)
    check('monitoring: error badge on the error state', (await page.locator('[data-node-id="delivery-failed"] .fl-node__chip--badge').count()) === 1)
    check('monitoring: last update shown', /Updated/.test(await page.locator('.fl-status').innerText()))
    check('monitoring: summary by status', /Active 1/.test(await page.locator('.fl-status__summary').innerText()))
    await fetch(`${base}api/state?fail=1`)
    await page.waitForSelector('.fl-status__error', { timeout: 4000 })
    check('monitoring: a failing endpoint is reported', true)
    await page.waitForSelector('.fl-status__dot.is-stale, .fl-status__dot.is-error', { timeout: 4000 })
    await shot(page, 'view-error-state')
    await fetch(`${base}api/state?fail=0`)
    await page.locator('.fl-status__refresh').click()
    await page.waitForSelector('.fl-status__error', { state: 'detached', timeout: 4000 }).catch(() => {})
    check('monitoring: recovers after the endpoint does', (await page.locator('.fl-status__error').count()) === 0)
    check('monitoring: no page errors', errors.length === 0, errors.join('; '))
    await close()
  }

  // Toggle with rollback, drill-down, keyboard, zoom/pan/fit.
  {
    const { page, errors, close } = await open('?view=monitor&interval=60000')
    // Rejected by the server: rolled back with an error toast.
    await page.hover('[data-node-id="cancelled"]')
    await page.waitForSelector('.fl-hovebar')
    await page.locator('.fl-hovebar .uid-switch input, .fl-hovebar input[type="checkbox"]').first().click({ force: true })
    check('toggle: optimistic disable', (await page.locator('[data-node-id="cancelled"] .fl-node.is-disabled').count()) === 1)
    await page.waitForSelector('.uid-toast', { timeout: 3000 })
    await page.waitForTimeout(150)
    check('toggle: rejected change is rolled back', (await page.locator('[data-node-id="cancelled"] .fl-node.is-disabled').count()) === 0)
    check('toggle: error toast shown', /could not change/i.test(await page.locator('.uid-toast').first().innerText()))
    await shot(page, 'view-toggle-rollback')
    // Accepted: stays disabled.
    await page.mouse.move(5, 5)
    await page.waitForTimeout(250)
    await page.locator('.fl-controls__fit').click()
    await page.waitForTimeout(350)
    await page.hover('[data-node-id="refund"]')
    await page.waitForSelector('.fl-hovebar')
    await page.locator('.fl-hovebar input[type="checkbox"]').first().click({ force: true })
    await page.waitForTimeout(500)
    check('toggle: accepted change stays', (await page.locator('[data-node-id="refund"] .fl-node.is-disabled').count()) === 1)

    // Zoom buttons, wheel, drag-pan, fit.
    await page.mouse.move(5, 5)
    const k0 = await zoomOf(page)
    await page.locator('.fl-controls__zoom-in').click()
    await page.waitForTimeout(300)
    const k1 = await zoomOf(page)
    check('zoom: the button zooms in', k1 > k0 * 1.1, `${k0} → ${k1}`)
    await page.mouse.move(700, 600)
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(200)
    check('zoom: the wheel zooms out', (await zoomOf(page)) < k1)
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 600)
    await page.waitForTimeout(200)
    check('zoom: limited at the minimum', (await zoomOf(page)) >= 0.15 - 1e-6, String(await zoomOf(page)))
    await page.locator('.fl-controls__fit').click()
    await page.waitForTimeout(400)
    const t0 = await transform(page)
    await page.mouse.move(720, 820)
    await page.mouse.down()
    await page.mouse.move(820, 760, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(100)
    check('pan: dragging the background pans', (await transform(page)) !== t0)
    await page.locator('.fl-controls__fit').click()
    await page.waitForTimeout(400)
    const fits = await page.evaluate(() => {
      const c = document.querySelector('.fl-canvas').getBoundingClientRect()
      return [...document.querySelectorAll('[data-node-id]')].every((n) => {
        const r = n.getBoundingClientRect()
        return r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1
      })
    })
    check('fit: every node in view', fits)
    const minimapOn = await page.locator('.fl-minimap').count()
    await page.locator('.fl-controls__minimap').click()
    check('minimap: toggles', (await page.locator('.fl-minimap').count()) !== minimapOn)
    await page.locator('.fl-controls__minimap').click()

    // Keyboard: Tab into the graph, arrows move focus, Enter opens details, Escape closes.
    await page.locator('[data-node-id="new"]').focus()
    await page.keyboard.press('ArrowRight')
    const focused = await page.evaluate(() => document.activeElement?.dataset?.nodeId)
    check('keyboard: arrows move focus between nodes', !!focused && focused !== 'new', focused)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.uid-drawer')
    check('keyboard: Enter opens the details', true)
    await page.keyboard.press('Escape')
    await page.waitForSelector('.uid-drawer', { state: 'detached' })
    check('keyboard: Escape closes the details', true)

    // Details drawer from a click, with status and data.
    await page.locator('[data-node-id="new"]').click()
    await page.waitForSelector('.uid-drawer')
    check('details: shows data', /sla/i.test(await page.locator('.uid-drawer').innerText()))
    await shot(page, 'view-details')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.uid-drawer', { state: 'detached' })

    // Drill-down into the payment sub-process and back.
    await page.locator('[data-node-id="payment"] .fl-node__enter').click()
    await page.waitForSelector('[data-node-id="authorize"]')
    check('drill-down: opens the sub-process', /Payment/.test(await page.locator('.fl-nav').innerText()))
    const geo = await geometry(page)
    check('drill-down: sub-process geometry', geo.problems.length === 0, geo.problems.join('; '))
    await shot(page, 'view-subprocess')
    await page.locator('.fl-nav__back').click()
    await page.waitForSelector('[data-node-id="validate"]')
    check('drill-down: back to the parent', (await page.locator('.fl-nav').count()) === 0)
    await page.locator('[data-node-id="payment"]').dblclick()
    await page.waitForSelector('[data-node-id="authorize"]')
    await page.locator('.fl-canvas').focus()
    await page.locator('[data-node-id="authorize"]').focus()
    await page.keyboard.press('Escape')
    await page.waitForSelector('[data-node-id="validate"]')
    check('drill-down: double click enters, Escape goes back', true)
    check('viewer interactions: no page errors', errors.length === 0, errors.join('; '))
    await close()
  }

  // Touch: pinch zoom on a phone.
  {
    const { page, close } = await open('?view=monitor&interval=60000', PHONE, { touch: true })
    const k0 = await zoomOf(page)
    const cdp = await page.context().newCDPSession(page)
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) })
    await touch('touchStart', [[150, 400], [240, 400]])
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[150 - i * 12, 400], [240 + i * 12, 400]])
    await touch('touchEnd', [])
    await page.waitForTimeout(150)
    check('touch: pinch zooms in', (await zoomOf(page)) > k0 * 1.2, `${k0} → ${await zoomOf(page)}`)
    await close()
  }

  // ------------------------------------------------------------------ editor
  for (const theme of ['light', 'dark']) {
    const { page, errors, close } = await open(`?view=editor&theme=${theme}`)
    check(`editor/${theme}: renders without errors`, errors.length === 0, errors.join('; '))
    // Focusing a node off screen brings it into view.
    await page.locator('[data-node-id="packing"]').focus()
    await page.waitForTimeout(350)
    await page.locator('[data-node-id="packing"]').click()
    await page.waitForTimeout(200)
    await shot(page, `editor-${theme}-desktop`)
    await close()
    const phone = await open(`?view=editor&theme=${theme}`, PHONE, { touch: true })
    check(`editor/${theme}/phone: renders without errors`, phone.errors.length === 0, phone.errors.join('; '))
    check(`editor/${theme}/phone: side panels fold into drawers`, (await phone.page.locator('.fl-toolbar__side').count()) === 1 && (await phone.page.locator('.fl-editor__side').count()) === 0)
    await shot(phone.page, `editor-${theme}-phone`)
    await phone.close()
  }

  {
    const { page, errors, close } = await open('?view=editor')
    // The whole graph in view: the steps below point at nodes on screen.
    await page.locator('.fl-controls__fit').click()
    await page.waitForTimeout(350)
    const nodes = () => page.locator('[data-node-id]').count()
    const edges = () => page.locator('.fl-edge').count()
    const model = () => page.evaluate(() => JSON.parse(window.__flow()))

    // Palette: drag a State onto the canvas.
    const n0 = await nodes()
    const item = await centre(page, '.fl-palette__item[data-type="state"]')
    await page.mouse.move(item.x, item.y)
    await page.mouse.down()
    await page.mouse.move(item.x + 60, item.y + 20, { steps: 4 })
    await page.mouse.move(640, 760, { steps: 10 })
    check('editor: a ghost follows a palette drag', (await page.locator('.fl-palette-ghost').count()) === 1)
    await page.mouse.up()
    await page.waitForTimeout(150)
    check('editor: palette drag adds a node', (await nodes()) === n0 + 1)
    const added = (await model()).nodes.at(-1)
    check('editor: the new node snaps to the grid', added.position.x % 20 === 0 && added.position.y % 20 === 0, JSON.stringify(added.position))
    // Palette click adds in the middle of the view.
    await page.locator('.fl-palette__item[data-type="task"]').click()
    check('editor: palette click adds a node', (await nodes()) === n0 + 2)

    // Drag from a handle of the new state to "Refund" to connect them.
    const stateId = added.id
    const e0 = await edges()
    await page.hover(`[data-node-id="${stateId}"]`)
    await page.waitForSelector(`[data-port-node="${stateId}"][data-port-side="right"]`)
    const handle = await centre(page, `[data-port-node="${stateId}"][data-port-side="right"] .fl-handle__dot`)
    const target = await centre(page, '[data-node-id="refund"]')
    await page.mouse.move(handle.x, handle.y)
    await page.mouse.down()
    await page.mouse.move(handle.x + 30, handle.y - 10, { steps: 3 })
    await page.mouse.move(target.x + 10, target.y + 6, { steps: 10 })
    await page.waitForTimeout(50)
    check('editor: connection preview snaps to the target', (await page.locator('.fl-connect-preview.is-snapped').count()) === 1)
    await shot(page, 'editor-connecting')
    await page.mouse.up()
    await page.waitForTimeout(100)
    check('editor: drag to connect adds an edge', (await edges()) === e0 + 1)
    const newEdge = (await model()).edges.at(-1)
    check('editor: the edge links the two nodes', newEdge.from === stateId && newEdge.to === 'refund', JSON.stringify(newEdge))

    // Properties: the new edge is selected; give it a label.
    await page.locator('.fl-props__label input').fill('escalate')
    await page.waitForTimeout(100)
    check('editor: properties edit the edge label', (await page.locator(`.fl-edge-label[data-edge-id="${newEdge.id}"]`).textContent()).includes('escalate'))

    // Undo / redo with the keyboard (focus on the canvas, not in the input).
    await page.locator(`[data-node-id="${stateId}"]`).focus()
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(80)
    check('editor: Ctrl+Z undoes the label', (await model()).edges.at(-1).label === undefined)
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(80)
    check('editor: Ctrl+Z undoes the connection', (await edges()) === e0)
    await page.keyboard.press('Control+Shift+z')
    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(80)
    check('editor: Ctrl+Shift+Z redoes both', (await edges()) === e0 + 1 && (await model()).edges.at(-1).label === 'escalate')

    // Move a node by dragging; it snaps to the grid.
    const p = await centre(page, '[data-node-id="refund"]')
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
    await page.mouse.move(p.x + 47, p.y + 33, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(80)
    const moved = (await model()).nodes.find((n) => n.id === 'refund').position
    check('editor: dragging moves the node onto the grid', moved.x % 20 === 0 && moved.y % 20 === 0, JSON.stringify(moved))

    // Multi-select: shift+click, then rubber band.
    await page.locator('[data-node-id="packing"]').click()
    await page.locator('[data-node-id="shipped"]').click({ modifiers: ['Shift'] })
    check('editor: shift+click adds to the selection', /2 selected/.test(await page.locator('.fl-props').innerText()))
    const a = await page.locator('[data-node-id="reserve"]').boundingBox()
    const b = await page.locator('[data-node-id="backorder"]').boundingBox()
    await page.mouse.click(5 + 210, 5 + 70)
    await page.keyboard.down('Shift')
    await page.mouse.move(a.x - 12, Math.min(a.y, b.y) - 30)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width + 12, Math.max(a.y + a.height, b.y + b.height) + 20, { steps: 8 })
    check('editor: a rubber band is drawn', (await page.locator('.fl-band').count()) === 1)
    await page.mouse.up()
    await page.keyboard.up('Shift')
    const banded = await page.locator('.fl-props__count').innerText().catch(() => '')
    check('editor: rubber band selects several nodes', /([3-9]|\d\d) selected/.test(banded), banded)
    await shot(page, 'editor-multiselect')
    // Align them from the panel; one undo step.
    await page.locator('[data-align="top"]').click()
    await page.waitForTimeout(80)
    const ys = await page.$$eval('.fl-node-wrap', (els) => els.filter((e) => e.querySelector('.fl-node.is-selected')).map((e) => Math.round(e.getBoundingClientRect().top)))
    check('editor: align top lines the selection up', ys.length >= 3 && new Set(ys.map((y) => Math.round(y / 3))).size <= 2, ys.join(','))
    await page.locator('[data-node-id="reserve"]').focus()
    await page.keyboard.press('Control+z')

    // Delete with the keyboard.
    const before = await nodes()
    await page.locator('[data-node-id="backorder"]').click()
    await page.keyboard.press('Delete')
    check('editor: Delete removes the node', (await nodes()) === before - 1 && (await page.locator('[data-node-id="backorder"]').count()) === 0)

    // Copy/paste and duplicate.
    await page.locator('[data-node-id="packing"]').click()
    await page.keyboard.press('Control+d')
    check('editor: Ctrl+D duplicates', (await nodes()) === before)

    // Context menu on a node: Delete.
    const cm = await centre(page, '[data-node-id="packing"]')
    await page.mouse.click(cm.x, cm.y, { button: 'right' })
    await page.waitForSelector('.uid-menu')
    check('editor: right click opens a context menu', /Duplicate/.test(await page.locator('.uid-menu').innerText()))
    await shot(page, 'editor-context-menu')
    await page.locator('.uid-menu .uid-menu-item', { hasText: 'Delete' }).click()
    check('editor: context menu deletes', (await page.locator('[data-node-id="packing"]').count()) === 0)

    // Validation: the deletions left issues; clicking one focuses its node.
    await page.locator('.fl-tab-issues').click()
    const issues = await page.locator('.fl-issue').count()
    check('editor: issues listed', issues > 0, String(issues))
    await page.locator('.fl-issue').first().click()
    check('editor: an issue selects its element', (await page.locator('.fl-node.is-selected, .fl-edge.is-selected').count()) >= 1)
    await shot(page, 'editor-issues')

    // Auto layout is one undo step.
    const t = await model()
    await page.locator('.fl-toolbar__layout').click()
    await page.waitForTimeout(200)
    const laid = await model()
    check('editor: auto layout repositions', JSON.stringify(laid.nodes.map((n) => n.position)) !== JSON.stringify(t.nodes.map((n) => n.position)))
    await page.locator('.fl-toolbar__undo').click()
    check('editor: auto layout undoes in one step', JSON.stringify((await model()).nodes.map((n) => n.position)) === JSON.stringify(t.nodes.map((n) => n.position)))

    // Mermaid import from the toolbar menu.
    await page.locator('.fl-toolbar__file').click()
    await page.locator('.fl-menu-import-mermaid').click()
    await page.locator('.fl-import__source textarea').fill('stateDiagram-v2\n  direction LR\n  [*] --> Draft\n  Draft --> Review: submit\n  Review --> Draft: rework\n  Review --> [*]: approve')
    await page.locator('.fl-import__apply').click()
    await page.waitForTimeout(200)
    check('editor: Mermaid import replaces the model', (await nodes()) === 4 && (await page.locator('[data-node-id="Review"]').count()) === 1)
    await page.locator('[data-node-id="Draft"]').focus()
    await page.keyboard.press('Control+z')
    check('editor: the import is undoable', (await page.locator('[data-node-id="Review"]').count()) === 0)

    // Keyboard nudge.
    await page.locator('[data-node-id="new"]').click()
    const x0 = (await model()).nodes.find((n) => n.id === 'new').position.x
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    check('editor: arrows nudge the selection', (await model()).nodes.find((n) => n.id === 'new').position.x === x0 + 40)
    check('editor interactions: no page errors', errors.length === 0, errors.join('; '))
    await close()
  }

  // Palette clicks land on free spots: five in a row, no overlapping nodes.
  {
    const { page, errors, close } = await open('?view=editor')
    await page.locator('[data-node-id="new"]').focus()
    await page.locator('[data-node-id="new"]').click()
    const before = await page.locator('[data-node-id]').count()
    for (const type of ['state', 'task', 'state', 'decision', 'state']) {
      await page.locator(`.fl-palette__item[data-type="${type}"]`).click()
      await page.waitForTimeout(120)
    }
    check('editor: five palette clicks add five nodes', (await page.locator('[data-node-id]').count()) === before + 5)
    const overlaps = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('[data-node-id]')].map((g) => ({ id: g.dataset.nodeId, r: g.querySelector('.fl-node__body').getBoundingClientRect() }))
      const out = []
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].r
          const b = boxes[j].r
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`${boxes[i].id} × ${boxes[j].id}`)
        }
      return out
    })
    check('editor: palette-added nodes overlap no node', overlaps.length === 0, overlaps.join('; '))
    const last = await page.evaluate(() => JSON.parse(window.__flow()).nodes.at(-1).id)
    check('editor: the added node is selected and in view', (await page.locator(`[data-node-id="${last}"] .fl-node.is-selected`).count()) === 1 && (await page.locator(`[data-node-id="${last}"]`).isVisible()))
    await shot(page, 'editor-palette-adds')
    check('editor palette adds: no page errors', errors.length === 0, errors.join('; '))
    await close()
  }

  // Empty editor.
  {
    const { page, errors, close } = await open('?view=editor&graph=empty')
    check('editor: empty state offers a start', (await page.locator('.fl-empty__add-start').count()) === 1)
    await shot(page, 'editor-empty')
    await page.locator('.fl-empty__add-start').click()
    check('editor: the empty state adds a start node', (await page.locator('[data-node-id]').count()) === 1)
    check('editor empty: no page errors', errors.length === 0, errors.join('; '))
    await close()
  }

  // ------------------------------------------------------------- 500 nodes
  {
    const t = Date.now()
    const { page, errors, close } = await open('?view=editor&graph=large&n=500')
    const ready = Date.now() - t
    check('large: 500 nodes render', (await page.locator('[data-node-id]').count()) === 500, `${ready} ms to first render`)
    // Pan: frames while dragging the background.
    const frames = await page.evaluate(async () => {
      const el = document.querySelector('.fl-canvas')
      const r = el.getBoundingClientRect()
      const opts = (x, y) => ({ bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true })
      const x0 = r.left + 10
      const y0 = r.top + r.height - 10
      el.dispatchEvent(new PointerEvent('pointerdown', opts(x0, y0)))
      const times = []
      let last = performance.now()
      for (let i = 0; i < 30; i++) {
        el.dispatchEvent(new PointerEvent('pointermove', opts(x0 + i * 6, y0 - i * 3)))
        await new Promise((res) => requestAnimationFrame(res))
        const now = performance.now()
        times.push(now - last)
        last = now
      }
      el.dispatchEvent(new PointerEvent('pointerup', opts(x0 + 180, y0 - 90)))
      times.sort((a, b) => a - b)
      return { median: times[15], p90: times[27] }
    })
    check('large: panning stays smooth', frames.median < 40, `median ${frames.median.toFixed(1)} ms, p90 ${frames.p90.toFixed(1)} ms per frame`)
    // Drag one node: only its edges are re-routed.
    const id = await page.$eval('[data-node-id="s250"]', (e) => e.dataset.nodeId).catch(() => null)
    if (id) {
      await page.evaluate(() => document.querySelector('[data-node-id="s250"]').scrollIntoView())
      const drag = await page.evaluate(async () => {
        const el = document.querySelector('[data-node-id="s250"]')
        const r = el.getBoundingClientRect()
        const opts = (x, y) => ({ bubbles: true, clientX: x, clientY: y, pointerId: 2, button: 0, isPrimary: true })
        el.dispatchEvent(new PointerEvent('pointerdown', opts(r.left + 5, r.top + 5)))
        const times = []
        let last = performance.now()
        for (let i = 1; i <= 30; i++) {
          el.dispatchEvent(new PointerEvent('pointermove', opts(r.left + 5 + i * 4, r.top + 5 + i * 2)))
          await new Promise((res) => requestAnimationFrame(res))
          const now = performance.now()
          times.push(now - last)
          last = now
        }
        el.dispatchEvent(new PointerEvent('pointerup', opts(r.left + 125, r.top + 65)))
        times.sort((a, b) => a - b)
        return { median: times[15], p90: times[27] }
      })
      check('large: dragging a node stays smooth', drag.median < 50, `median ${drag.median.toFixed(1)} ms, p90 ${drag.p90.toFixed(1)} ms per frame`)
    }
    await shot(page, 'editor-large')
    check('large: no page errors', errors.length === 0, errors.join('; '))
    await close()
  }

  // ------------------------------------------------------------ standalone
  for (const theme of ['light', 'dark']) {
    const { page, errors, close } = await open(`standalone.html?theme=${theme}`)
    await page.waitForSelector('.fl-node.is-current')
    check(`standalone/${theme}: renders and polls`, errors.length === 0 && (await page.locator('[data-node-id]').count()) === 6, errors.join('; ') || String(await page.locator('[data-node-id]').count()))
    await shot(page, `standalone-${theme}`)
    await close()
  }
} finally {
  await browser.close()
  await server.close()
}

const dir = process.env.FLOW_SHOTS_DIR
if (dir) {
  mkdirSync(dir, { recursive: true })
  // The "after" half of the before/after pair (the "before" was kept by hand).
  if (existsSync(resolve(out, 'view-light-desktop.png'))) copyFileSync(resolve(out, 'view-light-desktop.png'), resolve(dir, 'after-view-light-desktop.png'))
  if (existsSync(resolve(out, 'editor-dark-desktop.png'))) copyFileSync(resolve(out, 'editor-dark-desktop.png'), resolve(dir, 'after-editor-dark-desktop.png'))
  for (const f of readdirSync(out)) if (f.endsWith('.png')) copyFileSync(resolve(out, f), resolve(dir, f))
}
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('\nAll browser checks passed')
