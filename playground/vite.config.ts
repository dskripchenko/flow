import { createReadStream, existsSync } from 'fs'
import { basename, resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { snapshotAt } from '../tests/fixtures/order'

const root = resolve(import.meta.dirname, '..')

/**
 * A fake backend: GET /api/state advances the sample instance one step per
 * call (`?reset` starts over, `?fail=1` makes the next calls fail);
 * POST /api/toggle refuses to disable "cancelled" and "e10" (409), so the
 * rollback can be seen. /standalone/* serves the built bundle.
 */
function fakeBackend(): Plugin {
  let step = 0
  let failing = false
  return {
    name: 'flow-playground-backend',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://x')
        if (url.pathname === '/api/state') {
          if (url.searchParams.has('reset')) step = 0
          if (url.searchParams.has('fail')) failing = url.searchParams.get('fail') === '1'
          res.setHeader('Cache-Control', 'no-store')
          if (failing) {
            res.statusCode = 503
            return res.end('{"error":"unavailable"}')
          }
          const body = JSON.stringify(snapshotAt(step++))
          res.setHeader('Content-Type', 'application/json')
          return res.end(body)
        }
        if (url.pathname === '/api/toggle' && req.method === 'POST') {
          let raw = ''
          req.on('data', (c) => (raw += c))
          req.on('end', () => {
            const change = JSON.parse(raw || '{}') as { id?: string }
            setTimeout(() => {
              if (change.id === 'cancelled' || change.id === 'e10') {
                res.statusCode = 409
                res.end('{"error":"This step is required by policy"}')
              } else {
                res.setHeader('Content-Type', 'application/json')
                res.end('{"ok":true}')
              }
            }, 250)
          })
          return
        }
        if (url.pathname.startsWith('/standalone/')) {
          const file = resolve(root, 'dist', basename(url.pathname))
          if (!existsSync(file)) {
            res.statusCode = 404
            return res.end('run pnpm build first')
          }
          res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript')
          return createReadStream(file).pipe(res)
        }
        next()
      })
    },
  }
}

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [vue(), fakeBackend()],
  server: { port: 5320, fs: { allow: [root] } },
})
