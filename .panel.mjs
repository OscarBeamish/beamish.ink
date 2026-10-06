const PORT='4488'
import { chromium } from 'playwright'
let b
try {
  b = await chromium.launch({ args: ['--use-angle=gl'] })
  const page = await b.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)))
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })
  await page.setViewportSize({ width: 1280, height: 950 })
  await page.goto(`http://localhost:${PORT}/effects/molten-metal`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: '.shots/panel-molten.png' })
  const state = await page.evaluate(() => {
    const panel = document.querySelector('[data-demo]')
    return { ground: panel?.getAttribute('data-ground'), bg: getComputedStyle(panel).backgroundColor }
  })
  console.log(JSON.stringify(state), 'errors:', errs.slice(0, 2).join(' | ') || 'none')
} finally {
  await b?.close()
}
