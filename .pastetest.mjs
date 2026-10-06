import { chromium } from 'playwright'
let b
try {
  b = await chromium.launch({ args: ['--use-angle=gl'] })
  const page = await b.newPage()
  const errs = []
  page.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 200)))
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 200)) })
  await page.setViewportSize({ width: 1000, height: 640 })
  await page.goto('http://localhost:5315/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: '.shots/paste-molten.png' })
  const state = await page.evaluate(() => {
    const c = document.querySelector('#bg canvas')
    return { canvas: c ? `${c.width}x${c.height}` : 'none', running: typeof window.__m?.stop === 'function' }
  })
  console.log(JSON.stringify(state), 'console:', errs.slice(0, 3).join(' | ') || 'clean')
} finally {
  await b?.close()
}
