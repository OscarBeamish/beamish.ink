/*
 * pnpm poke <route> [selector ...]
 *
 * The everyday loop. One page, two viewports, real numbers off the live DOM,
 * in a few seconds.
 *
 * This exists because `pnpm review` was being used for a job it is bad at.
 * Review loads seventy-two routes at three widths with three seconds of fixed
 * sleep each, which is eleven minutes of deliberate waiting before it measures
 * anything, and it does the whole sweep again every run. That is the right
 * shape for a gate you run before pushing and the wrong shape entirely for
 * "did the change I just made work", which is the question asked a hundred
 * times a day.
 *
 * Two decisions make this fast.
 *
 * It talks to the dev server, not a build. Preview serves the built site, so
 * checking a CSS change through it costs a rebuild first. Dev reflects the
 * source as saved, which is the whole point of a loop you run constantly.
 *
 * It leaves the server running. The first poke of a session pays to start one;
 * every poke after that reuses it, because a server that shuts down between
 * runs means paying the startup cost once per question.
 *
 * What it reports is deliberately what a screenshot cannot tell you: the real
 * box of a named element, its real computed colour against its real
 * background, how many lines a heading actually broke into, and whether the
 * page threw anything. Looking at a picture and judging is how a nav that
 * wrapped at three common widths survived a full review.
 */

import { chromium, type Browser, type Page } from 'playwright'
import { ensureServer, routeFrom, ORIGIN, PORT } from '../dev-server'

/*
 * Desktop and a phone. Two is the useful number: almost every layout bug this
 * repo has had showed up as one of them disagreeing with the other, and a
 * third width mostly costs time.
 */
const VIEWPORTS = [
  { key: 'desktop', width: 1440, height: 900 },
  { key: 'phone', width: 390, height: 844 }
] as const

/** Real geometry and real colour, resolved, for one selector. */
async function measure(page: Page, selector: string) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel)
    if (!el) return null
    const box = el.getBoundingClientRect()
    const style = getComputedStyle(el)

    // The nearest ancestor that actually paints a background, which is what
    // the element's colour is really being read against.
    let behind = 'transparent'
    for (let node: Element | null = el; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor
      if (bg && bg !== 'transparent' && !bg.startsWith('rgba(0, 0, 0, 0)')) {
        behind = bg
        break
      }
    }

    /*
     * How many lines the text actually broke into, counted off the rects the
     * browser really laid out.
     *
     * Two things have to be skipped or the number is nonsense. Text that is in
     * the DOM only for a screen reader, which several items keep in a clipped
     * span while animating an aria-hidden copy beside it, otherwise gets
     * counted as extra lines: it reported this site's two line hero as four.
     * And the rects of a flex row sit a fraction of a pixel apart, so tops are
     * clustered rather than taken as distinct values, or a one row nav reads
     * as two.
     */
    const rows: number[] = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      let shown = (node.textContent ?? '').trim().length > 0
      for (let up = node.parentElement; shown && up && up !== el.parentElement; up = up.parentElement) {
        const style = getComputedStyle(up)
        const box = up.getBoundingClientRect()
        if (
          style.visibility === 'hidden' ||
          style.display === 'none' ||
          box.width <= 1 ||
          box.height <= 1
        ) {
          shown = false
        }
      }
      if (shown) {
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rect of range.getClientRects()) {
          if (rect.width === 0 && rect.height === 0) continue
          if (!rows.some(top => Math.abs(top - rect.top) <= 4)) rows.push(rect.top)
        }
      }
      node = walker.nextNode()
    }

    return {
      w: Math.round(box.width),
      h: Math.round(box.height),
      x: Math.round(box.left),
      y: Math.round(box.top),
      lines: rows.length,
      colour: style.color,
      behind,
      font: Math.round(parseFloat(style.fontSize)),
      hidden: style.display === 'none' || style.visibility === 'hidden' || box.width === 0
    }
  }, selector)
}

async function poke(browser: Browser, route: string, selectors: string[]) {
  for (const view of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: view.width, height: view.height }
    })
    const problems: string[] = []
    page.on('pageerror', error => problems.push(`uncaught: ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') problems.push(`console: ${message.text()}`)
    })
    page.on('response', response => {
      if (response.status() >= 400) {
        problems.push(`HTTP ${response.status()}: ${response.url().replace(ORIGIN, '')}`)
      }
    })

    await page.goto(ORIGIN + route, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => document.fonts.ready)
    // Enough for a mount and a first frame. Not a substitute for measuring.
    await page.waitForTimeout(600)

    const page_ = await page.evaluate(() => ({
      ground: document.documentElement.dataset.ground ?? '(none declared)',
      sideways:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }))

    console.log(`\n${view.key}  ${view.width}x${view.height}  ground: ${page_.ground}`)
    if (page_.sideways) {
      console.log(`  SIDEWAYS SCROLL: ${page_.scrollWidth}px in ${page_.clientWidth}px`)
    }

    for (const selector of selectors) {
      const found = await measure(page, selector)
      if (!found) {
        console.log(`  ${selector.padEnd(24)} NOT FOUND`)
        continue
      }
      const flags = [found.hidden ? 'HIDDEN' : '', found.lines > 1 ? `${found.lines} lines` : '']
        .filter(Boolean)
        .join(' ')
      console.log(
        `  ${selector.padEnd(24)} ${String(found.w).padStart(5)}x${String(found.h).padEnd(5)} ` +
          `at ${found.x},${found.y}  ${found.font}px  ${found.colour} on ${found.behind} ${flags}`
      )
    }

    if (problems.length) {
      for (const problem of [...new Set(problems)].slice(0, 6)) console.log(`  ${problem}`)
    } else {
      console.log('  no console errors, no dead requests')
    }

    await page.close()
  }
}

async function main() {
  const [given = '/', ...selectors] = process.argv.slice(2)
  const route = routeFrom(given, 'poke')

  const state = await ensureServer()
  console.log(`dev server ${state} on ${PORT}`)

  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-unsafe-swiftshader']
  })
  try {
    await poke(browser, route, selectors)
  } finally {
    await browser.close()
  }
  console.log('\nserver left running. pnpm poke again costs about two seconds.')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
