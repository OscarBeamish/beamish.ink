/*
 * The dev server the measuring tools share, and the argument handling they
 * all need before they can use it.
 *
 * poke, sweep, shot and contrast each had their own copy of this. Three copies
 * is survivable; the route recovery below is what made it worth merging. poke
 * had it and shot did not, so `pnpm shot /templates/coil-and-bias/index.html`
 * silently screenshotted the home page and reported it as the template. The
 * fix belongs in one place that every tool reads, not in whichever tool was
 * being used when somebody noticed.
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/*
 * Not astro.config's 4488. These tools start their own server and leave it
 * running between invocations; keeping it off the configured port means a dev
 * server somebody already has open is never the thing being measured, and
 * never the thing one of these shuts down.
 */
export const PORT = 4321
export const ORIGIN = `http://127.0.0.1:${PORT}`

export async function alive(): Promise<boolean> {
  try {
    const response = await fetch(ORIGIN, { signal: AbortSignal.timeout(900) })
    return response.ok
  } catch {
    return false
  }
}

/*
 * Start one and let it outlive this process. `detached` plus unref is the part
 * that makes the next run cheap, and on Windows it also means the handle is
 * not tied to a shell that has already exited.
 */
export async function ensureServer(): Promise<'reused' | 'started'> {
  if (await alive()) return 'reused'

  const child = spawn(
    process.execPath,
    [
      path.join(ROOT, 'site', 'node_modules', 'astro', 'astro.js'),
      'dev',
      '--port',
      String(PORT),
      /*
       * Bind IPv4 explicitly. Without this astro listens on localhost, which
       * Windows resolves to ::1, and a poll of 127.0.0.1 gets nothing back
       * from a server that is running perfectly.
       */
      '--host',
      '127.0.0.1'
    ],
    { cwd: path.join(ROOT, 'site'), stdio: 'ignore', detached: true }
  )
  child.unref()

  const deadline = Date.now() + 40_000
  while (Date.now() < deadline) {
    if (await alive()) return 'started'
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error(`dev server did not come up on ${PORT}`)
}

/**
 * The route a tool was actually asked for, recovered from what the shell did
 * to it.
 *
 * Git Bash rewrites an argument that looks like an absolute POSIX path before
 * the process ever sees it, so `/` arrives as C:/Program Files/Git/ and
 * `/templates/x` as C:/Program Files/Git/templates/x.
 *
 * The first version of this quietly read anything with a drive letter as the
 * home page, which is worse than useless: asked for a template it measured the
 * home page instead and reported every selector missing, which looks exactly
 * like a broken template. Recover the route where the shell left it
 * recoverable, and refuse rather than guess where it did not.
 */
export function routeFrom(given: string, tool: string): string {
  let route = given

  if (/^[A-Za-z]:/.test(given)) {
    const tail = given.replace(/\\/g, '/').match(/\/Git\/(.*)$/)
    if (!tail) {
      throw new Error(
        `"${given}" is a filesystem path, not a route.\n` +
          'Git Bash rewrites a leading slash. Pass the route without one:\n' +
          `  pnpm ${tool} templates/coil-and-bias/index.html`
      )
    }
    route = '/' + tail[1]
    console.log(`the shell rewrote the route; reading it as ${route || '/'}`)
  }

  return route.startsWith('/') ? route : `/${route}`
}
