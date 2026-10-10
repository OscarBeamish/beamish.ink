/*
 * pnpm shot <route> <file>
 *
 * One page, full height, with whatever the console said. The companion to
 * poke: poke answers "what are the numbers", this answers "what does it look
 * like", and between them they cover what a twenty minute review was being
 * used for.
 *
 * It reports a few facts alongside the image because a screenshot alone has
 * fooled me more than once tonight: a page can look settled and still be
 * mid-animation, and a counter that has not scrolled into view reads as a
 * zero rather than as a counter.
 */

import { chromium } from 'playwright'
import { ensureServer, routeFrom, ORIGIN } from '../dev-server'

async function main() {
  const [given = '/', out = 'tools/review/.shots/shot.png'] = process.argv.slice(2)
  /*
   * This used to read any drive-lettered argument as '/'. Git Bash rewrites a
   * leading slash, so `pnpm shot /templates/coil-and-bias/index.html` arrived
   * as a Windows path, became the home page, and was screenshotted and
   * reported as the template, with no error anywhere. The shared recovery
   * gets the route back, or refuses.
   */
  const path = routeFrom(given, 'shot')

  await ensureServer()

  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-unsafe-swiftshader', '--enable-gpu', '--ignore-gpu-blocklist']
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  const problems: string[] = []
  page.on('pageerror', error => problems.push('uncaught: ' + error.message.split('\n')[0]))
  page.on('console', message => {
    if (message.type() === 'error') problems.push('console: ' + message.text().split('\n')[0])
  })
  page.on('response', response => {
    if (response.status() >= 400) {
      problems.push('HTTP ' + response.status() + ': ' + response.url().replace(ORIGIN, ''))
    }
  })

  await page.goto(ORIGIN + path, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)

  /*
   * Scroll the whole page before shooting it.
   *
   * A full-page screenshot does not load `loading="lazy"` images that were
   * never in the viewport, so an index of twelve cards came back with the top
   * four filled in and the rest blank. That reads as eight broken posters and
   * is in fact a screenshot of a page nobody scrolled.
   */
  await page.evaluate(async () => {
    const step = innerHeight * 0.8
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      scrollTo(0, y)
      await new Promise(r => setTimeout(r, 90))
    }
    scrollTo(0, 0)
  })

  await page.waitForTimeout(2600)

  const facts = await page.evaluate(() => {
    const h1 = document.querySelector('h1')
    return {
      ground: document.documentElement.dataset.ground ?? '(none)',
      height: document.body.scrollHeight,
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      canvases: document.querySelectorAll('canvas').length,
      hero: h1 ? getComputedStyle(h1).fontSize : '(no h1)'
    }
  })

  console.log(JSON.stringify(facts))
  console.log(
    problems.length
      ? [...new Set(problems)].slice(0, 4).join('\n')
      : 'no console errors, no dead requests'
  )

  await page.screenshot({ path: out, fullPage: true })
  console.log('wrote ' + out)
  await browser.close()
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
