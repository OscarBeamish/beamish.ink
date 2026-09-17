/*
 * A static file server over the repo root, so demo pages have a real origin.
 *
 * This is not a convenience. Textures cannot be uploaded from a file:// URL:
 * every file is its own opaque origin, so texImage2D throws a SecurityError on
 * the first image an effect tries to sample. Nothing in the library needed an
 * origin until the first textured effect, which is why both the recorder and
 * the leak test opened demos as files until now.
 */

import { createServer, type Server } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type { Server }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
}

let origin = ''

/** URL for an item's demo.html on the running server. */
export function demoUrl(dir: string): string {
  const rel = path.relative(ROOT, path.join(dir, 'demo.html')).split(path.sep).join('/')
  return `${origin}/${rel}`
}

export function serveRoot(): Promise<Server> {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0]!).replace(/^\/+/, '')

    /*
     * The browser asks for this on its own for any page with a real origin, and
     * a 404 lands in the console as a page error and fails the take. It never
     * came up under file://, which did not request one.
     */
    if (rel === 'favicon.ico') {
      res.writeHead(204)
      res.end()
      return
    }

    const file = path.resolve(ROOT, rel)
    // Nothing outside the repo, however the path is spelled.
    if (!file.startsWith(ROOT) || !existsSync(file)) {
      console.warn(`  serve: 404 ${rel}`)
      res.writeHead(404)
      res.end('not found')
      return
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
    })
    createReadStream(file).pipe(res)
  })

  return new Promise(resolve => {
    // Port 0: the OS picks a free one, so this can never collide with the dev
    // server, the review step, or another take running alongside it.
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') origin = `http://127.0.0.1:${address.port}`
      resolve(server)
    })
  })
}

export function closeServer(server: Server): Promise<void> {
  return new Promise(resolve => server.close(() => resolve()))
}
