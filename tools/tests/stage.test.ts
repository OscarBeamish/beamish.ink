/*
 * The stage keeps one context, whatever the page asks for.
 *
 * A page of three sections, each wanting its own WebGL backdrop, scrolled
 * through twice. Between them they want three contexts; the assertion is that
 * at no point during either pass does more than one exist.
 *
 * The count is taken at the moment a context is created, not on a later
 * frame, and that distinction is the test.
 *
 * Sampling canvases once per scroll step does not work, and it took breaking
 * the broker on purpose to find that out: with create-before-destroy the two
 * contexts coexist only inside one synchronous block, so any sample taken
 * afterwards sees one either way and the test passes against a broker doing
 * exactly the thing it forbids. Patching getContext catches it, because that
 * is the instant both canvases are in the document.
 *
 * Every WebGL item in this library
 * creates exactly one canvas on mount and removes it on destroy, which the
 * context-leak test already proves, so the number of canvases on the page is
 * the number of live contexts. The alternative, probing whether a fresh
 * context can still be made, only catches exhaustion at sixteen and would say
 * nothing about holding two.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveRoot, closeServer, urlFor, type Server } from '../serve'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const FIXTURES = path.join(ROOT, 'tools', 'tests', 'fixtures')

let browser: Browser
let server: Server

beforeAll(async () => {
  /*
   * Three cheap backdrops. Any three WebGL items would do: what is being
   * tested is the broker, not the effects, and these are the least expensive
   * to build fifty times over a slow scroll.
   */
  await build({
    stdin: {
      contents: `
        import { createStage } from './shared/stage'
        import paperGrain from './effects/paper-grain/core'
        import registrationMarks from './effects/registration-marks/core'
        import dustMotes from './effects/dust-motes/core'

        const at = id => document.getElementById(id)
        window.__stage = createStage([
          { el: at('a').parentElement, create: () => paperGrain(at('a')) },
          { el: at('b').parentElement, create: () => registrationMarks(at('b')) },
          { el: at('c').parentElement, create: () => dustMotes(at('c')) }
        ])
      `,
      resolveDir: ROOT,
      loader: 'ts',
      sourcefile: 'stage-fixture.ts'
    },
    outfile: path.join(FIXTURES, 'stage.bundle.js'),
    bundle: true,
    format: 'iife',
    target: 'es2022',
    platform: 'browser',
    minify: false,
    logLevel: 'silent'
  })

  server = await serveRoot()
  browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  })
}, 180_000)

afterAll(async () => {
  await browser?.close()
  if (server) await closeServer(server)
})

describe('the stage hands one context along a page', () => {
  it(
    'never holds more than one while scrolling through and back',
    async () => {
      const context = await browser.newContext({
        viewport: { width: 640, height: 480 },
        deviceScaleFactor: 1
      })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))

      /*
       * Before any page script runs, so the stage's first mount is counted
       * too. Each call records how many canvases were in the document at the
       * instant a context was asked for.
       */
      await page.addInitScript(() => {
        const w = window as never as { __peak: number[] }
        w.__peak = []
        const real = HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.getContext = function (
          this: HTMLCanvasElement,
          ...args: never[]
        ) {
          w.__peak.push(document.querySelectorAll('canvas').length)
          return (real as never as (...a: never[]) => unknown).apply(this, args)
        } as never
      })

      await page.goto(urlFor('tools/tests/fixtures/stage.html'), { waitUntil: 'load' })
      await page.waitForFunction(() => Boolean((window as never as { __stage?: unknown }).__stage))

      const counts = await page.evaluate(async () => {
        const seen: number[] = []
        const live = new Set<number>()
        const reach = document.body.scrollHeight - innerHeight

        const sample = async (y: number) => {
          scrollTo(0, y)
          // Two frames: one for the observer to fire, one for the decision.
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
          seen.push(document.querySelectorAll('canvas').length)
          const which = (window as never as { __stage: { live: number } }).__stage.live
          if (which >= 0) live.add(which)
        }

        // Down, then back up. Thirty stops each way is fine enough to land
        // between sections, which is where a thrashing broker shows itself.
        for (let i = 0; i <= 30; i++) await sample((reach * i) / 30)
        for (let i = 30; i >= 0; i--) await sample((reach * i) / 30)

        return { seen, visited: [...live].sort(), max: Math.max(...seen) }
      })

      expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([])

      /*
       * The whole point. At the instant any context was created, how many
       * canvases were in the document? One means the outgoing section had
       * already given its context back. Two means it had not.
       */
      const peak = await page.evaluate(
        () => (window as never as { __peak: number[] }).__peak
      )
      expect(peak.length, 'no context was ever created').toBeGreaterThan(0)
      expect(
        Math.max(...peak),
        `canvases present when a context was created: ${[...new Set(peak)].join(', ')}`
      ).toBeLessThanOrEqual(1)

      // And the settled count between swaps, which is the cheaper check.
      expect(counts.max, `canvases seen: ${[...new Set(counts.seen)].join(', ')}`).toBeLessThanOrEqual(1)

      /*
       * And it has to actually work, not merely stay under the limit by never
       * mounting anything. All three sections must have held the context at
       * some point in the pass.
       */
      expect(counts.visited, 'every section should have had a turn').toEqual([0, 1, 2])

      // Nothing left behind.
      const after = await page.evaluate(() => {
        ;(window as never as { __stage: { destroy(): void } }).__stage.destroy()
        return document.querySelectorAll('canvas').length
      })
      expect(after, 'destroy() should leave no canvas behind').toBe(0)

      await context.close()
    },
    180_000
  )
})
