/*
 * How long the GPU actually spends on one frame of an effect.
 *
 * Nothing else here can answer this. budget times the JS call, which returns
 * as soon as the command is queued. fps times the gaps between frames, which
 * on a 165Hz display is 6.1ms for everything that keeps up. Both say an
 * effect is fine right up until the machine is busy and it is not.
 *
 * EXT_disjoint_timer_query_webgl2 asks the GPU itself. The result is the
 * number that says whether an effect has headroom on a machine that is doing
 * something else at the same time, which is every machine.
 *
 *   pnpm gputime wind-field mesh-gradient
 */
import { chromium } from 'playwright'
import { serveRoot, urlFor } from './serve'

const MEASURE = `(async () => {
  const canvas = document.querySelector('canvas')
  const gl = canvas.getContext('webgl2')
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  if (!ext) return { error: 'no timer query extension' }
  const driver = window.__beamish
  driver.stop && driver.stop()

  const times = []
  for (let i = 0; i < 24; i++) {
    const q = gl.createQuery()
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
    driver.renderAtTime(5 + i * 0.01)
    gl.endQuery(ext.TIME_ELAPSED_EXT)
    gl.flush()
    for (let w = 0; w < 400; w++) {
      await new Promise(r => setTimeout(r, 4))
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break
    }
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
    if (!disjoint && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
      times.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6)
    }
    gl.deleteQuery(q)
  }
  times.sort((a, b) => a - b)
  return {
    n: times.length,
    median: times[Math.floor(times.length / 2)] || 0,
    worst: times[times.length - 1] || 0,
    pixels: canvas.width * canvas.height
  }
})()`

async function main() {
  const slugs = process.argv.slice(2)
  const list = slugs.length > 0 ? slugs : ['wind-field', 'mesh-gradient', 'aurora-curtain']
  const server = await serveRoot()
  const browser = await chromium.launch({
    channel: 'chromium',
    headless: process.env['FPS_HEADFUL'] !== 'on',
    args: ['--enable-gpu', '--ignore-gpu-blocklist']
  })
  console.log('\n  effect              pixels    GPU median    worst    at 60Hz')
  for (const slug of list) {
    /* GPUTIME_DPR to measure the display somebody actually has. Windows at
       125 or 150 per cent reports 1.25 or 1.5, and cost goes with the square
       of it: an effect that is comfortable at 1 can be over budget at 1.5. */
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: Number(process.env['GPUTIME_DPR'] ?? 1)
    })
    await page.goto(`${urlFor(`effects/${slug}/demo.html`)}?record=1`, { waitUntil: 'load' })
    await page.waitForTimeout(2000)
    const r = (await page.evaluate(MEASURE)) as {
      error?: string
      n: number
      median: number
      worst: number
      pixels: number
    }
    if (r.error) console.log(`  ${slug.padEnd(18)} ${r.error}`)
    else
      console.log(
        `  ${slug.padEnd(18)} ${String(r.pixels).padStart(8)}  ${r.median.toFixed(2).padStart(8)}ms ` +
          `${r.worst.toFixed(2).padStart(8)}ms  ${((r.median / 16.7) * 100).toFixed(0).padStart(6)}%`
      )
    await page.close()
  }
  console.log('\n  The last column is the share of a 60Hz frame this effect uses on its own.')
  await browser.close()
  server.close()
}
main().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
