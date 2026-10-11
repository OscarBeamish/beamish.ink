/*
 * How long a client-side navigation takes, and whether the fonts survive it.
 *
 * Written because "it takes a second and the fonts reload" is a claim about
 * the production site that was observed on the dev server, and those are
 * different machines wearing the same URL: `astro dev` compiles a page the
 * first time it is asked for, and serves the site's CSS as inline <style>
 * blocks that the router does not preserve, so an @font-face rule really is
 * re-evaluated on every navigation there.
 *
 * So this measures both, against whichever origin it is pointed at. Point it
 * at the dev server and at `astro preview` and compare before changing
 * anything. Check what the origin is actually serving first: this repo had
 * seventeen stale servers listening across 4321-4340 at one point, every one
 * of them answering 200, and a dev server wearing the preview port made the
 * build look like it had a problem that only dev has.
 *
 *   pnpm navcheck http://127.0.0.1:4321     # whatever is on 4321
 *
 * NAVCHECK_HOVER=off clicks without pointing at the link first, which is the
 * path a keyboard or touch reader takes and the one the prefetch strategy is
 * chosen on: under 'hover' nothing is fetched until the pointer arrives.
 *
 * NAVCHECK_REQUESTS=on adds the three slowest requests per navigation and a
 * count of the font files fetched after the first page. It is off by default
 * only to keep the output short. It was briefly blamed for hanging this walk,
 * which it never did: the hang was the race described further down.
 */

import { chromium } from 'playwright'

const WALK = ['/templates', '/grids', '/effects', '/']

/* The two faces the site declares. A flash is one of these not being ready. */
const FACES: [string, string][] = [
  ['Archivo', '700 1rem Archivo'],
  ['JetBrains Mono', '400 1rem "JetBrains Mono"']
]

async function main() {
  const origin = process.argv[2] ?? 'http://127.0.0.1:4321'
  const browser = await chromium.launch({
    channel: 'chromium',
    /*
     * NAVCHECK_GPU=off, and NAVCHECK_HEADFUL=on for a real window. Headless
     * Chromium's GPU stack crashed its renderer on every view transition over
     * the built site on this machine, and a headful browser did not, which is
     * the difference between a local quirk and a tab crash for a reader. Run
     * both before believing either.
     */
    headless: process.env['NAVCHECK_HEADFUL'] !== 'on',
    args: process.env['NAVCHECK_GPU'] === 'off' ? ['--disable-gpu'] : []
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  /*
   * NAVCHECK_LATENCY=<ms> puts a round trip on every request.
   *
   * Without it this tool cannot see what a prefetch strategy is for. On
   * localhost the HTML for the next page arrives in about a millisecond, so
   * prefetching it early and prefetching it late measure the same, and the
   * choice between strategies looked like it did not matter. A reader has an
   * RTT: 150ms is an ordinary mobile one.
   */
  const latency = Number(process.env['NAVCHECK_LATENCY'] ?? 0)
  if (latency > 0) {
    const session = await page.context().newCDPSession(page)
    await session.send('Network.enable')
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency,
      downloadThroughput: (4 * 1024 * 1024) / 8,
      uploadThroughput: (1024 * 1024) / 8
    })
  }

  /*
   * Said out loud rather than surfacing as a puzzling "Target crashed" from
   * whichever evaluate happened to be in flight. A renderer dies for reasons
   * that have nothing to do with the site, and orphaned browsers from earlier
   * runs of this very tool are one of them.
   */
  let crashed = false
  page.on('crash', () => {
    crashed = true
    console.log('  !! the renderer crashed: what follows is missing, not fast')
  })

  let costs: { url: string; ms: number }[] = []
  const fonts: { url: string; after: boolean }[] = []
  let firstPageDone = false
  const requests = process.env['NAVCHECK_REQUESTS'] === 'on'
  if (requests) {
    page.on('request', request => {
      if (request.url().includes('.woff2')) {
        fonts.push({ url: request.url(), after: firstPageDone })
      }
    })
    page.on('requestfinished', request => {
      const timing = request.timing()
      if (timing.responseEnd > 0) {
        costs.push({ url: request.url(), ms: Math.round(timing.responseEnd) })
      }
    })
  }

  /*
   * 'load' and a settle, not 'networkidle'. The walls prefetch as the reader
   * scrolls, so the network on /templates does not go quiet and networkidle
   * waits for a state the page is designed never to reach.
   */
  await page.goto(origin + WALK[0]!, { waitUntil: 'load' })
  await page.waitForTimeout(2000)
  firstPageDone = true

  console.log(`\n${origin}`)
  for (const next of WALK.slice(1)) {
    if (crashed) break

    /*
     * Hover, then click, with a pause between.
     *
     * The default prefetch strategy is 'hover', so a link clicked without ever
     * being pointed at is a link that was never prefetched. The first version
     * measured exactly that and made the built site look four times slower
     * than dev, which is not a thing that can be true: it was measuring a path
     * no reader with a mouse takes.
     */
    const link = page.locator(`a[href="${next}"]`).first()
    if ((await link.count()) === 0) {
      console.log(`  ${next.padEnd(12)} no link to it from the page before`)
      continue
    }

    /*
     * Armed before the click, and timed inside the page.
     *
     * The first version attached the astro:page-load listener in an evaluate
     * AFTER clicking, which is a race it lost whenever the swap was fast: a
     * prefetched page swaps in about 80ms and the round trip to attach the
     * listener can take longer than that, so the event had already fired and
     * the wait never ended. It failed on one run in three, and the runs it
     * failed were the fast ones, so every number it did report was biased
     * towards slow. Two hours went on reading that as a renderer crash.
     *
     * astro:before-preparation is the start of the navigation, so t0 and t1
     * are both taken in the page and the measurement never includes a round
     * trip at all.
     */
    await page.evaluate(faces => {
      const w = window as never as { __nav?: Promise<unknown> }
      w.__nav = new Promise(resolve => {
        let t0 = performance.now()
        document.addEventListener('astro:before-preparation', () => (t0 = performance.now()), {
          once: true
        })
        document.addEventListener(
          'astro:page-load',
          () =>
            resolve({
              ms: Math.round(performance.now() - t0),
              status: document.fonts.status,
              missing: faces.filter(f => !document.fonts.check(f[1]!)).map(f => f[0]!)
            }),
          { once: true }
        )
      })
    }, FACES)

    /*
     * Hover, then click, with a pause between.
     *
     * The default prefetch strategy is 'hover', so a link clicked without ever
     * being pointed at is a link that was never prefetched. An early version
     * measured exactly that and made the built site look four times slower
     * than dev, which is not a thing that can be true: it was measuring a path
     * no reader with a mouse takes.
     */
    if (process.env['NAVCHECK_HOVER'] !== 'off') {
      await link.hover({ timeout: 5000 }).catch(() => undefined)
      await page.waitForTimeout(350)
    }
    await link.click({ timeout: 5000 })

    let ready: { ms: number; status: string; missing: string[] }
    try {
      ready = (await Promise.race([
        page.evaluate(() => (window as never as { __nav: Promise<unknown> }).__nav),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('astro:page-load never came')), 10_000)
        )
      ])) as { ms: number; status: string; missing: string[] }
    } catch (error) {
      console.log(
        `  ${next.padEnd(12)}    -- ${error instanceof Error ? error.message : error}`
      )
      costs = []
      continue
    }

    /*
     * page-load rather than the URL changing: the URL changes at the start of
     * the swap and the page is not usable until styles and scripts are in,
     * which is the moment a reader would call it loaded. The faces are read at
     * that same moment, because a face that is ready a tick later has already
     * had the fallback painted under it.
     */
    const faces =
      ready.missing.length === 0 ? 'both faces ready' : `NOT READY: ${ready.missing.join(', ')}`
    console.log(`  ${next.padEnd(12)} ${String(ready.ms).padStart(5)} ms  ${faces}`)

    for (const r of costs.sort((a, b) => b.ms - a.ms).slice(0, 3)) {
      console.log(`      ${String(r.ms).padStart(5)} ms  ${r.url.replace(origin, '').slice(0, 72)}`)
    }
    costs = []
  }

  console.log(
    '\n  A font request in the network log is not a flash: the browser logs one\n' +
      '  even when it answers from cache, and a preload that hits cache costs\n' +
      '  nothing. A face that is NOT READY at page-load is the flash, because\n' +
      '  that is the moment the fallback gets painted under the headings.'
  )

  if (requests) {
    const after = fonts.filter(f => f.after).length
    console.log(`  font files fetched: ${fonts.length} in total, ${after} after the first page`)
  }

  await browser.close()
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
