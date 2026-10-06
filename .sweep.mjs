import { chromium } from 'playwright'
const variants = {
  e: { metal: '#3f4652', scale: 0.8, flow: 0.3, relief: 0.6, film: 320, variation: 0.35, iridescence: 1.2, sheen: 0.35, shine: 26 },
  f: { metal: '#454c58', scale: 0.6, flow: 0.25, relief: 0.5, film: 420, variation: 0.3, iridescence: 1.0, sheen: 0.3, shine: 20 },
  g: { metal: '#363c47', scale: 0.9, flow: 0.4, relief: 0.75, film: 260, variation: 0.4, iridescence: 1.5, sheen: 0.45, shine: 30 },
  h: { metal: '#2e333d', scale: 0.7, flow: 0.35, relief: 0.55, film: 520, variation: 0.3, iridescence: 1.3, sheen: 0.4, shine: 24 }
}

let b
try {
  b = await chromium.launch({ args: ['--use-angle=gl'] })
  const page = await b.newPage()
  await page.setViewportSize({ width: 960, height: 540 })
  await page.goto('http://127.0.0.1:5311/effects/molten-metal/demo.html?record', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => typeof window.__beamish?.renderAtTime === 'function')
  for (const [name, opts] of Object.entries(variants)) {
    await page.evaluate(o => window.__beamish.update(o), opts)
    await page.evaluate(() => window.__beamish.renderAtTime(11))
    await page.waitForTimeout(120)
    await page.screenshot({ path: `.shots/mm-${name}.png` })
  }
} finally {
  await b?.close()
}
console.log('rendered')
