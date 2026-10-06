import { chromium } from 'playwright'
const slug = process.argv[2]
const times = (process.argv[3] ?? '0,11,24').split(',').map(Number)
let b
try {
  b = await chromium.launch({ args: ['--use-angle=gl'] })
  const page = await b.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(String(e).slice(0, 400)))
  await page.setViewportSize({ width: 960, height: 540 })
  await page.goto(`http://127.0.0.1:5311/effects/${slug}/demo.html?record`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => typeof window.__beamish?.renderAtTime === 'function', null, { timeout: 15000 })
  for (const t of times) {
    await page.evaluate(time => window.__beamish.renderAtTime(time), t)
    await page.waitForTimeout(120)
    await page.screenshot({ path: `.shots/${slug}-${t}.png` })
  }
  console.log('errors:', errs.slice(0, 1).join(' | ') || 'none')
} finally {
  await b?.close()
}
