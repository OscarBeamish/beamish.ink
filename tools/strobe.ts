/*
 * How much of the frame flips back and forth rather than travelling.
 *
 * The in-page probe counted A/B/A/B on a single pixel, the centre one. That
 * was a mistake: two machines with the same canvas at different x positions
 * have that pixel over different content, so one reporting 14 and the other 0
 * says nothing about whether the effect strobes. This samples a grid and
 * reports what share of it alternates.
 *
 * A pattern of fine, regular, slowly travelling detail is the classic thing
 * that strobes: between one frame and the next a strand moves a fraction of a
 * pixel, the sample lands on the other side of a noise cell, and the pixel
 * flips between two values rather than easing between them. It is invisible
 * in a still, invisible in a step test, and the whole screen does it at once.
 *
 *   pnpm strobe wind-field mesh-gradient
 */
import { chromium } from 'playwright'
import { serveRoot, urlFor } from './serve'

const GRID = `(() => {
  const c = document.querySelector('canvas')
  const gl = c.getContext('webgl2') || c.getContext('webgl')
  const W = 20, H = 12, out = []
  const b = new Uint8Array(4)
  for (let y = 1; y < H; y++) {
    for (let x = 1; x < W; x++) {
      gl.readPixels((c.width * x / W) | 0, (c.height * y / H) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b)
      out.push(b[0])
    }
  }
  return out
})()`

async function main() {
  const slugs = process.argv.slice(2)
  const list = slugs.length ? slugs : ['wind-field', 'mesh-gradient', 'aurora-curtain']
  const server = await serveRoot()
  const browser = await chromium.launch({
    channel: 'chromium',
    headless: process.env['FPS_HEADFUL'] !== 'on',
    args: ['--enable-gpu', '--ignore-gpu-blocklist']
  })
  console.log('\n  effect            strobing pixels   mean |step|   mean |2-frame|')
  for (const slug of list) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(urlFor(`effects/${slug}/demo.html`), { waitUntil: 'load' })
    await page.waitForTimeout(2500)

    /*
     * STROBE_PAUSE=on stops the clock before sampling.
     *
     * The control that should have come first. A paused effect is given the
     * same inputs every frame, so every sample must be identical; anything
     * left over is the renderer or the measurement, not the effect's motion.
     */
    if (process.env['STROBE_PAUSE'] === 'on') {
      await page.evaluate('window.__beamish && window.__beamish.stop()')
      await page.waitForTimeout(400)
    }

    const frames: number[][] = []
    for (let i = 0; i < 90; i++) {
      frames.push((await page.evaluate(GRID)) as number[])
      await page.evaluate('new Promise(r => requestAnimationFrame(r))')
    }

    /*
     * Per pixel: how far it moves between neighbouring frames, against how
     * far it has moved after two. A pixel that is travelling covers roughly
     * twice as much ground in two frames as in one. A pixel that is flipping
     * between two values covers the same ground in one frame and none in two.
     */
    const n = frames[0]!.length
    let strobing = 0
    let sum1 = 0
    let sum2 = 0
    for (let p = 0; p < n; p++) {
      let d1 = 0
      let d2 = 0
      for (let f = 2; f < frames.length; f++) {
        d1 += Math.abs(frames[f]![p]! - frames[f - 1]![p]!)
        d2 += Math.abs(frames[f]![p]! - frames[f - 2]![p]!)
      }
      sum1 += d1 / (frames.length - 2)
      sum2 += d2 / (frames.length - 2)
      /* Moving every frame and nowhere over two: that is a flip, not travel. */
      if (d1 > 6 && d2 < d1 * 0.6) strobing++
    }
    console.log(
      `  ${slug.padEnd(18)} ${String(strobing).padStart(4)} of ${n} ` +
        `${((strobing / n) * 100).toFixed(0).padStart(4)}%   ` +
        `${(sum1 / n).toFixed(2).padStart(8)}   ${(sum2 / n).toFixed(2).padStart(10)}`
    )
    await page.close()
  }
  console.log('\n  Travelling detail has the two-frame distance about twice the one-frame.')
  await browser.close()
  server.close()
}
main().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
