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
import { connect } from 'node:net'
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

export async function alive(ms = 900): Promise<boolean> {
  try {
    const response = await fetch(ORIGIN, { signal: AbortSignal.timeout(ms) })
    return response.ok
  } catch {
    return false
  }
}

/*
 * Is anything holding the port, answering or not.
 *
 * alive() asks a different question: whether a server replies to an HTTP
 * request inside 900ms. A dev server part way through compiling a page does
 * not, and the gap between those two questions is what filled this machine
 * with orphaned servers. A tool polled, got no answer in time, concluded the
 * port was free and started another one, which took the next port up and
 * stayed there. Thirteen in an afternoon, 14.7GB between them, and the renderer
 * crashes they caused were read as site bugs for about two hours.
 *
 * A TCP connect cannot be slow in that way. Either something is listening or
 * nothing is.
 */
export function portHeld(): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ port: PORT, host: '127.0.0.1' })
    const done = (held: boolean) => {
      socket.destroy()
      resolve(held)
    }
    socket.setTimeout(1500)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

/*
 * Start one and let it outlive this process. `detached` plus unref is the part
 * that makes the next run cheap, and on Windows it also means the handle is
 * not tied to a shell that has already exited.
 */
export async function ensureServer(): Promise<'reused' | 'started'> {
  if (await alive()) return 'reused'

  /*
   * Held but not answering: somebody else's server is booting or busy. Wait
   * for it rather than starting a rival. Starting one here is what orphans
   * them, and an orphan is invisible: it answers 200 on a port no tool asks
   * about and shows up only as a gigabyte in Task Manager.
   */
  if (await portHeld()) {
    const waitUntil = Date.now() + 40_000
    while (Date.now() < waitUntil) {
      if (await alive(3000)) return 'reused'
      await new Promise(resolve => setTimeout(resolve, 400))
    }
    throw new Error(
      [
        `something is holding ${PORT} and not answering HTTP.`,
        'Stop it before running this again. In PowerShell:',
        "  Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" |",
        "    Where-Object { $_.CommandLine -like '*astro*' } | Stop-Process -Force"
      ].join('\n')
    )
  }

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
