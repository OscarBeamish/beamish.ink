/*
 * pnpm budget <slug> [...]
 *
 * The two numbers AGENTS.md asks for before an ambient item ships, measured in
 * the page rather than judged by looking at it.
 *
 * MEAN ABSOLUTE CHANGE PER FRAME
 *
 * How much the canvas differs from the canvas one sixtieth of a second ago, per
 * channel, on a 0 to 255 scale, averaged over the whole frame. The rule in
 * AGENTS.md is a range rather than a limit: the quiet items here sit between
 * 0.01 and 0.2 and anything past about 1 reads as something happening. A
 * backdrop has to survive being ignored, and this is the only honest way to
 * know whether it does, because the thing you are checking is what the item
 * does at the edge of vision while you are reading something else.
 *
 * It is sampled at several points around the period rather than at one, because
 * most of these are slowest at one phase and quickest at another: a single
 * reading taken at the wrong moment is how an effect that strobes once a cycle
 * passes.
 *
 * DRAW COST
 *
 * Median milliseconds for one renderAtTime followed by a one-pixel readback,
 * taken after a warm-up so shader compilation is not counted.
 *
 * The readback is not incidental, it is the measurement. GL commands are queued
 * rather than executed, so timing renderAtTime on its own times how long it
 * took to write the commands down: the first version of this tool reported 0.00
 * ms for every item in the library, including the most expensive one. Touching
 * the result is the only way to make the pipeline finish where JavaScript can
 * see it. The cost of that touch is in the number, so the floor is a few tenths
 * of a millisecond and an item is best read against another item rather than
 * against zero.
 *
 * WHAT IT CANNOT SEE
 *
 * Whether the item is any good, and whether it loops. The seam is already a
 * test: tools/tests/loop-closes.test.ts renders frame 0 and frame `period` and
 * compares them, which is a different question from this one.
 *
 * Everything that runs in the page below is one body with nothing named inside
 * it, because the transpiler's keep-names helper does not exist there and a
 * named function throws `__name is not defined` on its first call.
 */

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { serveRoot, closeServer, demoUrl } from '../serve'
import { listItems } from '../build-items'

const WIDTH = 1280
const HEIGHT = 720
/** Phases of the period to sample the change at. */
const PHASES = [0, 0.17, 0.33, 0.5, 0.67, 0.83]
/** Frames timed at each phase, after a warm-up of the same length. */
const TIMED = 24

type Reading = {
  slug: string
  /** Null for a DOM effect, which has no canvas to read back. */
  change: number | null
  changeWorst: number | null
  drawMs: number
  period: number
}

async function measure(slug: string, dir: string): Promise<Reading> {
  const meta = JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as {
    options?: Record<string, { default?: unknown }>
    record?: { duration?: number }
  }
  /*
   * The window to sample across. A looping item has a period and that is the
   * whole of its behaviour. A one shot has no period option at all, and
   * sampling a default ten seconds of it would read six phases of an animation
   * that finished in the first second and report that nothing moves.
   */
  const declared = meta.options?.['period']?.default
  const period =
    typeof declared === 'number'
      ? declared
      : typeof meta.record?.duration === 'number'
        ? meta.record.duration
        : 10

  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  })
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
    /* ?record, so the demo page hands over the handle and never starts a RAF
       loop of its own. A loop running underneath this would be measuring two
       clocks at once. */
    await page.goto(`${demoUrl(dir)}?record`, { waitUntil: 'load' })
    await page.waitForFunction(() => Boolean((window as never as { __beamish?: unknown }).__beamish))

    const result = await page.evaluate(
      async ([phases, period, timed]) => {
        const handle = (window as never as {
          __beamish: { renderAtTime(t: number): void }
        }).__beamish
        /*
         * A DOM effect has no canvas, because it clips, filters or restyles the
         * element it was given. There is nothing to read back, so it is timed
         * and not measured for change: the frame is whatever the compositor
         * made of it, and the only honest way to diff that from in here would
         * be to screenshot the page, which costs more than the thing it is
         * measuring. Both of the DOM items this was written for are one shots
         * meant to be watched rather than ignored, which is the case the change
         * number exists to police.
         */
        const canvas = document.querySelector('canvas')
        const stage = document.getElementById('stage')

        const read = document.createElement('canvas')
        const ctx = read.getContext('2d', { willReadFrequently: true })!
        if (canvas) {
          read.width = canvas.width
          read.height = canvas.height
        }

        // One pixel, for the timing. Copying the whole frame to force a flush
        // would put the cost of the copy in the number.
        const tiny = document.createElement('canvas')
        tiny.width = 1
        tiny.height = 1
        const tinyCtx = tiny.getContext('2d', { willReadFrequently: true })!

        const changes: number[] = []
        const times: number[] = []

        for (const phase of phases as number[]) {
          const base = (phase as number) * (period as number)

          // Warm up at this phase first. The first draw after a shader is
          // linked includes the link, and the first readback allocates.
          for (let i = 0; i < (timed as number); i++) handle.renderAtTime(base + i / 60)

          handle.renderAtTime(base)
          let previous = new Uint8ClampedArray(0)
          if (canvas) {
            ctx.drawImage(canvas, 0, 0)
            previous = ctx.getImageData(0, 0, read.width, read.height).data
          }

          let sum = 0
          for (let i = 1; i <= (timed as number); i++) {
            const started = performance.now()
            handle.renderAtTime(base + i / 60)
            if (canvas) {
              tinyCtx.drawImage(canvas, 0, 0, 1, 1, 0, 0, 1, 1)
              tinyCtx.getImageData(0, 0, 1, 1)
            } else if (stage) {
              /*
               * Reading a geometry property is what forces style and layout to
               * be recomputed, which is where a DOM effect's cost actually is.
               * Without it this times a few property writes.
               */
              void stage.getBoundingClientRect().width
              void getComputedStyle(stage).clipPath
            }
            times.push(performance.now() - started)

            if (!canvas) continue

            ctx.drawImage(canvas, 0, 0)
            const now = ctx.getImageData(0, 0, read.width, read.height).data

            let diff = 0
            // Every fourth byte is alpha and the canvas is opaque, so it is
            // skipped rather than averaged in as a column of zeroes.
            for (let p = 0; p < now.length; p += 4) {
              diff += Math.abs(now[p]! - previous[p]!)
              diff += Math.abs(now[p + 1]! - previous[p + 1]!)
              diff += Math.abs(now[p + 2]! - previous[p + 2]!)
            }
            sum += diff / ((now.length / 4) * 3)
            previous = now
          }
          if (canvas) changes.push(sum / (timed as number))
        }

        times.sort((a, b) => a - b)
        return {
          change: changes.length > 0 ? changes.reduce((a, b) => a + b, 0) / changes.length : null,
          changeWorst: changes.length > 0 ? Math.max(...changes) : null,
          drawMs: times[Math.floor(times.length / 2)] ?? 0
        }
      },
      [PHASES, period, TIMED] as const
    )

    await page.close()
    return { slug, period, ...result }
  } finally {
    await browser.close()
  }
}

async function main() {
  const wanted = process.argv.slice(2)
  if (wanted.length === 0) {
    console.error('pnpm budget <slug> [slug ...]')
    process.exit(1)
  }

  const items = await listItems()
  const server = await serveRoot()
  const readings: Reading[] = []
  try {
    for (const slug of wanted) {
      const item = items.find(i => i.slug === slug && i.kind === 'item')
      if (!item) {
        console.error(`${slug}: not an item in effects/ or components/`)
        continue
      }
      readings.push(await measure(slug, item.dir))
    }
  } finally {
    await closeServer(server)
  }

  console.log(`\n${WIDTH}x${HEIGHT}, change per frame at 60Hz on a 0 to 255 scale\n`)
  console.log('  item                   change   worst   draw+flush   period')
  for (const r of readings) {
    console.log(
      `  ${r.slug.padEnd(22)} ${(r.change === null ? '  dom' : r.change.toFixed(3)).padStart(6)}  ${(
        r.changeWorst === null ? '  dom' : r.changeWorst.toFixed(3)
      ).padStart(6)}  ${r.drawMs.toFixed(2).padStart(10)}  ${String(r.period).padStart(7)}`
    )
  }
  /*
   * The range, repeated here rather than left in AGENTS.md, because the number
   * means nothing on its own and the person reading it is about to decide
   * whether to ship.
   */
  console.log('\n  quiet sits between 0.01 and 0.2. Past about 1 reads as something happening.')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
