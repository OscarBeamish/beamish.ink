/*
 * What an effect actually costs per frame on the page, at a real pixel ratio.
 *
 * `pnpm budget` times the draw call, which is the wrong number for a heavy
 * fragment shader: drawArrays returns as soon as the command is queued, so a
 * shader that takes 300ms on the GPU can measure 1ms in JS. The number that
 * tells you whether an effect is usable is how long the frames are, and the
 * only honest way to get it is to let the page run and time the gaps.
 *
 * Pixel ratio matters more than anything else here. A per-pixel cost at dpr 1
 * is a quarter of the same cost at dpr 2, which is what a laptop screen
 * actually is, so an effect can measure fine and be unusable on the machine it
 * was written on.
 *
 *   pnpm fps wind-field          # at dpr 1 and dpr 2
 */

import { chromium } from 'playwright'
import { ensureServer, ORIGIN } from './dev-server'

const SAMPLE = `new Promise(resolve => {
  const gaps = []
  let last = performance.now()
  let n = 0
  const step = () => {
    const now = performance.now()
    gaps.push(now - last)
    last = now
    if (++n < 90) requestAnimationFrame(step)
    else {
      gaps.sort((a, b) => a - b)
      const stage = document.querySelector('[data-stage] canvas')
      resolve({
        median: gaps[Math.floor(gaps.length / 2)],
        worst: gaps[gaps.length - 1],
        pixels: stage ? stage.width * stage.height : 0
      })
    }
  }
  requestAnimationFrame(step)
})`

async function main() {
  const slug = process.argv[2] ?? 'wind-field'
  await ensureServer()
  /*
   * FPS_HEADFUL=on for a real window.
   *
   * Headless and headful are different GPU paths on this machine, which is
   * already written down in navcheck.ts: headless crashed its renderer on
   * every view transition over the built site and a real window did not. An
   * effect that somebody is watching flicker in their own browser has to be
   * measured on the path their browser takes, and the swiftshader fallback
   * has to be off, or a failure to reach the GPU at all is silently answered
   * by the CPU and the numbers come back fine.
   */
  const headful = process.env['FPS_HEADFUL'] === 'on'
  const browser = await chromium.launch({
    channel: 'chromium',
    headless: !headful,
    args: headful
      ? ['--enable-gpu', '--ignore-gpu-blocklist']
      : ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  })

  console.log(`\n  /effects/${slug}\n`)
  console.log('  dpr   pixels      median    worst    fps')
  for (const dpr of [1, 2]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: dpr
    })
    await page.goto(`${ORIGIN}/effects/${slug}/`, { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    /*
     * What is actually drawing, and whether the context survived.
     *
     * "Flickers and does not move" is what a lost and restored context looks
     * like from the other side of the screen, and it leaves no exception in
     * the console: the canvas simply stops being painted by the page that
     * owns it. So the renderer string is read as well as the frame times, and
     * a swiftshader string here means the GPU was never reached.
     */
    const who = (await page.evaluate(`(() => {
      const c = document.createElement('canvas').getContext('webgl2')
      if (!c) return 'no webgl2'
      const d = c.getExtension('WEBGL_debug_renderer_info')
      return d ? String(c.getParameter(d.UNMASKED_RENDERER_WEBGL)).slice(0, 64) : 'masked'
    })()`)) as string
    const lost = (await page.evaluate(`(() => {
      const s = document.querySelector('[data-stage] canvas')
      const g = s && (s.getContext('webgl2') || s.getContext('webgl'))
      return g ? g.isContextLost() : 'no context'
    })()`)) as boolean | string

    const out = (await page.evaluate(SAMPLE)) as {
      median: number
      worst: number
      pixels: number
    }
    if (dpr === 1) console.log(`  renderer: ${who}   context lost: ${lost}
`)
    console.log(
      `  ${String(dpr).padEnd(4)}  ${String(out.pixels).padStart(9)}  ` +
        `${out.median.toFixed(1).padStart(7)}ms ${out.worst.toFixed(0).padStart(7)}ms  ` +
        `${(1000 / out.median).toFixed(0).padStart(5)}`
    )
    await page.close()
  }
  console.log(
    '\n  16.7ms is 60Hz. Past about 33ms the motion is visibly stepped, and a\n' +
      '  worst frame far above the median is the flicker somebody reports.'
  )

  await browser.close()
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
