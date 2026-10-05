/*
 * Every periodic effect has to come back to where it started.
 *
 * An effect with a `period` option promises that `renderAtTime(0)` and
 * `renderAtTime(period)` draw the same frame. The recorder is built on that
 * promise: `pnpm record` captures exactly one period and the result is looped
 * in a `<video>`, so an effect that does not close shows a jump once a cycle,
 * forever, on the homepage.
 *
 * The schema already checks that `record.duration` is a whole number of
 * periods. It cannot check what the shader does with the phase, and that is
 * where both of the failures were: GuillocheLines advanced three gears at 1,
 * -1.5 and 0.5 turns per period, and TranslucentSheets wobbled its sheets at
 * 0.7, 1.3, 1.1 and 0.6. In each case one family came back and the rest were
 * part way through a turn. Both carried a comment claiming the loop was
 * seamless.
 *
 * The threshold is the size of one ordinary frame of the same effect, which is
 * the only honest yardstick: a seam you cannot distinguish from one frame of
 * motion is not a seam. Run with `pnpm test`.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { serveRoot, closeServer, demoUrl, type Server } from '../serve'
import { listItems, buildItem } from '../build-items'

let browser: Browser
let server: Server

beforeAll(async () => {
  server = await serveRoot()
  browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  })
}, 120_000)

afterAll(async () => {
  await browser?.close()
  if (server) await closeServer(server)
})

/* meta.json is the source of truth, so the period is read from it rather than
   from the compiled defaults, which are the thing it is checking. */
const periodOf = (dir: string): number | null => {
  const meta = JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as {
    options: Record<string, { default?: unknown }>
  }
  const value = meta.options['period']?.default
  return typeof value === 'number' ? value : null
}

const periodic = (await listItems())
  .filter(item => item.tier === 1)
  .map(item => ({ item, period: periodOf(item.dir) }))
  .filter((entry): entry is { item: (typeof entry)['item']; period: number } => entry.period !== null)

describe('periodic effects return to their first frame', () => {
  for (const { item, period } of periodic) {

    it(
      `${item.slug} closes its ${period}s loop`,
      async () => {
        await buildItem(item)

        const context = await browser.newContext({
          viewport: { width: 480, height: 320 },
          deviceScaleFactor: 1
        })
        const page = await context.newPage()

        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))

        await page.goto(`${demoUrl(item.dir)}?record=1`, { waitUntil: 'load' })

        const result = await page.evaluate(async p => {
          const handle = window.__beamish!
          const canvas = document.querySelector<HTMLCanvasElement>('#stage canvas')
          // A DOM effect has no canvas to read back. Nothing to measure, and
          // nothing the recorder loops either.
          if (!canvas) return null
          const gl = canvas.getContext('webgl2')
          if (!gl) return null

          const w = Math.min(canvas.width, 320)
          const h = Math.min(canvas.height, 240)
          const grab = () => {
            const px = new Uint8Array(w * h * 4)
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
            return px
          }
          const mean = (a: Uint8Array, b: Uint8Array) => {
            let sum = 0
            for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i]! - b[i]!)
            return sum / (w * h)
          }

          handle.renderAtTime(0)
          const first = grab()
          handle.renderAtTime(p)
          const last = grab()
          // One ordinary frame of the same effect, for scale.
          handle.renderAtTime(1 / 60)
          const next = grab()

          return { seam: mean(first, last), frame: mean(first, next) }
        }, period)

        expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([])
        if (!result) return

        expect(
          result.seam,
          `the frame at t=${period} differs from t=0 by ${result.seam.toFixed(3)}, ` +
            `against ${result.frame.toFixed(3)} for one frame of ordinary motion. ` +
            'The loop does not close, so the recorded video jumps once a cycle. ' +
            'Phase multipliers have to be whole turns.'
        ).toBeLessThanOrEqual(result.frame + 0.05)

        await context.close()
      },
      180_000
    )
  }
})
