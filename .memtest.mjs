/*
 * Which half of my measurement habit costs the memory: the readback itself, or
 * shipping the framebuffer across the CDP boundary as a JS array?
 */
import { chromium } from 'playwright'

const mode = process.argv[2] // 'transfer' | 'reduce'
const peak = { node: 0 }
const watch = setInterval(() => {
  const mb = process.memoryUsage().rss / 1048576
  if (mb > peak.node) peak.node = mb
}, 50)

let b
try {
  b = await chromium.launch({ args: ['--use-angle=gl'] })
  const page = await b.newPage()
  await page.setViewportSize({ width: 960, height: 540 })
  await page.goto('http://127.0.0.1:5311/effects/aurora-curtain/demo.html?record', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => typeof window.__beamish?.renderAtTime === 'function')

  for (let i = 0; i < 3; i++) {
    if (mode === 'transfer') {
      // What I was doing: 2.07 million bytes, boxed into a JS array and then
      // serialised through the protocol as JSON. Twice per comparison.
      const a = await page.evaluate(t => {
        window.__beamish.renderAtTime(t)
        const c = document.querySelector('canvas')
        const gl = c.getContext('webgl2')
        const buf = new Uint8Array(c.width * c.height * 4)
        gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, buf)
        return Array.from(buf)
      }, i)
      const b2 = await page.evaluate(t => {
        window.__beamish.renderAtTime(t + 1 / 60)
        const c = document.querySelector('canvas')
        const gl = c.getContext('webgl2')
        const buf = new Uint8Array(c.width * c.height * 4)
        gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, buf)
        return Array.from(buf)
      }, i)
      let sum = 0
      for (let k = 0; k < a.length; k += 4) sum += Math.abs(a[k] - b2[k])
      if (i === 0) console.log('  (sanity, one channel sum:', Math.round(sum), ')')
    } else {
      // The same measurement, reduced in the page. One number comes back.
      const d = await page.evaluate(t => {
        const c = document.querySelector('canvas')
        const gl = c.getContext('webgl2')
        const a = new Uint8Array(c.width * c.height * 4)
        const b2 = new Uint8Array(c.width * c.height * 4)
        window.__beamish.renderAtTime(t)
        gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, a)
        window.__beamish.renderAtTime(t + 1 / 60)
        gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, b2)
        let sum = 0, n = 0
        for (let k = 0; k < a.length; k += 4) {
          sum += Math.abs(a[k] - b2[k]) + Math.abs(a[k + 1] - b2[k + 1]) + Math.abs(a[k + 2] - b2[k + 2])
          n += 3
        }
        return sum / n
      }, i)
      if (i === 0) console.log('  (sanity, mean change:', d.toFixed(3), ')')
    }
  }
} finally {
  clearInterval(watch)
  await b?.close()
}
console.log(`${mode}: node peak RSS ${peak.node.toFixed(0)} MB`)
