/*
 * Is an effect moving, or only changing.
 *
 * "It flickers and does not move" is a precise complaint and none of the
 * other tools can hear it. budget times a draw call, fps times the gaps
 * between frames, and both are happy as long as something is happening.
 * navdemo asked whether any pixel differed between two samples, which flicker
 * satisfies perfectly.
 *
 * Motion has a shape those miss: a frame should resemble the one before it
 * more than it resembles one from a second ago. So this samples the live
 * canvas over a few seconds and prints two curves.
 *
 *   step   how far each sample is from the one before it
 *   from0  how far each sample is from the first
 *
 * An effect that is moving has a small step and a from0 that climbs and then
 * levels off. An effect that is flickering has a step as large as its from0
 * from the very first sample: every frame is equally unlike every other,
 * which is what random looks like. An effect that is stuck has both at zero.
 *
 *   pnpm drift wind-field
 *   FPS_HEADFUL=on pnpm drift wind-field     # the real GPU path
 */

import { chromium } from 'playwright'
import { ensureServer, ORIGIN } from './dev-server'
import { serveRoot, urlFor } from './serve'

/* Downsampled hard, because the question is about the whole frame moving and
   not about any one pixel. A 32x18 thumbnail still carries the streaks. */
const GRAB = `(() => {
  const stage = document.querySelector('[data-stage] canvas') || document.querySelector('canvas')
  if (!stage) return null
  const off = document.createElement('canvas')
  off.width = 32
  off.height = 18
  const ctx = off.getContext('2d')
  ctx.drawImage(stage, 0, 0, 32, 18)
  return {
    px: [...ctx.getImageData(0, 0, 32, 18).data],
    size: stage.width + 'x' + stage.height,
    css: Math.round(stage.getBoundingClientRect().width) + 'x' +
         Math.round(stage.getBoundingClientRect().height)
  }
})()`

const mad = (a: number[], b: number[]) => {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!)
  return sum / a.length
}

async function main() {
  const slug = process.argv[2] ?? 'wind-field'
  await ensureServer()
  const headful = process.env['FPS_HEADFUL'] === 'on'
  const browser = await chromium.launch({
    channel: 'chromium',
    headless: !headful,
    args: headful
      ? ['--enable-gpu', '--ignore-gpu-blocklist']
      : ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  })
  /*
   * DRIFT_BARE=on points at the item's own demo.html instead of its page on
   * the site. Same effect, no panel, no chrome, no router: it separates a
   * fault in the effect from a fault in what the site wraps it in.
   */
  const bare = process.env['DRIFT_BARE'] === 'on'
  const server = bare ? await serveRoot() : null
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(
    bare ? urlFor(`effects/${slug}/demo.html`) : `${ORIGIN}/effects/${slug}/`,
    { waitUntil: 'load' }
  )
  await page.waitForTimeout(2500)

  /*
   * DRIFT_PAUSE=on presses the pause control first.
   *
   * A paused effect draws nothing, so every sample must be identical. If the
   * numbers still move with it paused, what is moving is the readback and not
   * the page, and the whole measurement was about the tool.
   */
  if (process.env['DRIFT_PAUSE'] === 'on') {
    await page.locator('[data-toggle]').first().click({ timeout: 5000 })
    await page.waitForTimeout(800)
  }

  const shots: number[][] = []
  const sizes: string[] = []
  for (let i = 0; i < Number(process.env['DRIFT_N'] ?? 24); i++) {
    const shot = (await page.evaluate(GRAB)) as {
      px: number[]
      size: string
      css: string
    } | null
    if (!shot) {
      console.log('  no canvas in the stage')
      await browser.close()
      return
    }
    shots.push(shot.px)
    sizes.push(`${shot.size} css ${shot.css}`)
    await page.waitForTimeout(125)
  }

  console.log(`\n  /effects/${slug}  sampled every 125ms, 0 to 255\n`)
  console.log('   at      step   from0')
  for (let i = 1; i < shots.length; i++) {
    const step = mad(shots[i]!, shots[i - 1]!)
    const from0 = mad(shots[i]!, shots[0]!)
    /* The buffer size beside the numbers. Setting canvas.width clears the
       drawing buffer, so a resize that lands between two draws shows up as
       exactly one frame unlike its neighbours. */
    const grew = sizes[i] !== sizes[i - 1] ? `  <- RESIZED to ${sizes[i]}` : ''
    console.log(
      `  ${(i * 0.125).toFixed(2).padStart(5)}s ${step.toFixed(2).padStart(7)} ` +
        `${from0.toFixed(2).padStart(7)}  ${'#'.repeat(Math.min(30, Math.round(from0 * 2)))}${grew}`
    )
  }

  const steps = shots.slice(1).map((s, i) => mad(s, shots[i]!))
  const ends = shots.slice(1).map(s => mad(s, shots[0]!))
  const meanStep = steps.reduce((a, b) => a + b, 0) / steps.length
  const maxEnd = Math.max(...ends)
  console.log(
    `\n  mean step ${meanStep.toFixed(2)}, furthest from the first frame ${maxEnd.toFixed(2)}`
  )
  if (meanStep < 0.05 && maxEnd < 0.05) console.log('  STUCK: nothing is changing at all.')
  else if (meanStep > maxEnd * 0.8)
    console.log('  FLICKER: each frame is as unlike its neighbour as the whole run is.')
  else console.log('  Moving: neighbours resemble each other, the run travels.')

  await browser.close()
  server?.close()
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
