/*
 * Motion budget, loop seam and draw cost. Every pixel comparison happens inside
 * the page and one number comes back: see AGENTS.md.
 */
import { chromium } from 'playwright'
const slug = process.argv[2]
const period = Number(process.argv[3])
let b
try {
  b = await chromium.launch({ args: ['--use-angle=gl'] })
  const page = await b.newPage()
  await page.setViewportSize({ width: 960, height: 540 })
  await page.goto(`http://127.0.0.1:5311/effects/${slug}/demo.html?record`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => typeof window.__beamish?.renderAtTime === 'function')
  await page.waitForTimeout(300)

  const compare = (a, b2) => page.evaluate(([t1, t2]) => {
    const c = document.querySelector('canvas')
    const gl = c.getContext('webgl2')
    const n = c.width * c.height * 4
    const one = new Uint8Array(n)
    const two = new Uint8Array(n)
    window.__beamish.renderAtTime(t1)
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, one)
    window.__beamish.renderAtTime(t2)
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, two)
    let sum = 0, count = 0
    for (let i = 0; i < n; i += 4) {
      sum += Math.abs(one[i] - two[i]) + Math.abs(one[i + 1] - two[i + 1]) + Math.abs(one[i + 2] - two[i + 2])
      count += 3
    }
    return sum / count
  }, [a, b2])

  let worst = 0, total = 0, n = 0
  for (const t of [0, period * 0.17, period * 0.41, period * 0.63, period * 0.88]) {
    const d = await compare(t, t + 1 / 60)
    worst = Math.max(worst, d); total += d; n++
  }
  console.log(`per frame at 60Hz: mean ${(total / n).toFixed(3)}  worst ${worst.toFixed(3)}  (quiet items sit 0.01 to 0.2)`)
  console.log(`loop seam: ${(await compare(0, period)).toFixed(3)}  (should be 0)`)

  const ms = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const gl = c.getContext('webgl2')
    const px = new Uint8Array(4)
    for (let i = 0; i < 5; i++) { window.__beamish.renderAtTime(i); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) }
    const runs = 30
    const t0 = performance.now()
    for (let i = 0; i < runs; i++) {
      window.__beamish.renderAtTime(i * 0.37)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    }
    return (performance.now() - t0) / runs
  })
  const size = await page.evaluate(() => { const c = document.querySelector('canvas'); return `${c.width}x${c.height}` })
  console.log(`draw: ${ms.toFixed(2)} ms at ${size}`)
} finally {
  await b?.close()
}
