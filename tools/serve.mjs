// Static file server for the shelf. No deps, no build.
//   node tools/serve.mjs [port]        # plain
//   node tools/serve.mjs [port] --live # inject a live-reload client
//
// `--live` appends a 12-line SSE client to every HTML response and watches the
// source tree. It is opt-in and never ships: without the flag the served bytes
// are exactly the file on disk.
import { createServer } from 'node:http'
import { createReadStream, statSync, readFileSync, watch } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PORT = Number(process.argv[2] || process.env.PORT || 4173)
const LIVE = process.argv.includes('--live')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.woff2':'font/woff2',
  '.ico':  'image/x-icon',
}

const RELOAD = `<script>
(() => {
  let n = 0
  const es = new EventSource('/__reload')
  es.addEventListener('change', () => location.reload())
  es.onerror = () => setTimeout(() => location.reload(), 400)
  addEventListener('beforeunload', () => es.close())
})();
</script>
`

const WATCH = ['src', 'styles', 'content', 'index.html']
  .map(p => join(ROOT, p))
  .filter(p => { try { statSync(p); return true } catch { return false } })

export function serve (port = PORT, { live = false } = {}) {
  /** @type {Set<import('node:http').ServerResponse>} */
  const clients = new Set()

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')

    if (url.pathname === '/__reload') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })
      res.write('retry: 300\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }

    let path = decodeURIComponent(url.pathname)
    if (path.endsWith('/')) path += 'index.html'

    const file = join(ROOT, normalize(path))
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return }

    let st
    try { st = statSync(file) } catch { res.writeHead(404).end('not found'); return }
    if (st.isDirectory()) { res.writeHead(404).end('not found'); return }

    const type = TYPES[extname(file)] || 'application/octet-stream'

    if (live && type.startsWith('text/html')) {
      const html = readFileSync(file, 'utf8').replace('</body>', `${RELOAD}</body>`)
      res.writeHead(200, {
        'content-type': type,
        'content-length': Buffer.byteLength(html),
        'cache-control': 'no-cache',
      })
      res.end(html)
      return
    }

    res.writeHead(200, {
      'content-type': type,
      'content-length': st.size,
      'cache-control': 'no-cache',
    })
    createReadStream(file).pipe(res)
  })

  let timer = 0
  const ping = path => {
    if (!live || clients.size === 0) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      for (const res of clients) res.write(`event: change\ndata: ${path}\n\n`)
    }, 60)                                   // coalesce a multi-file save
  }
  if (live) for (const p of WATCH) watch(p, { recursive: true }, (_, f) => ping(f ?? p))

  return new Promise(ok => server.listen(port, () =>
    ok({ server, port, url: `http://localhost:${port}` })))
}

if (import.meta.filename === process.argv[1]) {
  const { url } = await serve(PORT, { live: LIVE })
  console.log(`shelf served at ${url}${LIVE ? '  (live reload on)' : ''}`)
}
