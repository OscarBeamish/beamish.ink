/*
 * What a wall of autoplaying cards costs to scroll.
 *
 * The cards used to play on hover, which cost nothing until touched and meant
 * the walls never moved on a phone. They play on screen now, and that trade is
 * only worth making if the numbers are survivable, so this prints them rather
 * than leaving it to an opinion about how heavy video feels.
 *
 * Three numbers, in the order they matter:
 *
 *   first screen   bytes before the reader has scrolled at all. This is the
 *                  one that decides whether the page is slow to arrive.
 *   whole wall     bytes after scrolling to the bottom. The worst case for a
 *                  reader who reads everything, and the number that says
 *                  whether the observer's load ring is too generous.
 *   playing        how many videos are decoding at the bottom of the wall. A
 *                  decoder running for a card nobody can see is the cost that
 *                  makes an autoplay wall bad, so this should be about a
 *                  screenful and never the whole catalogue.
 *
 *   pnpm wallcost /effects
 */

import { chromium } from 'playwright'
import { ensureServer, ORIGIN, routeFrom } from './dev-server'

async function main() {
  const route = routeFrom(process.argv[2] ?? '/effects', 'wallcost')
  await ensureServer()
  const browser = await chromium.launch({ channel: 'chromium' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  let media = 0
  let total = 0
  const seen = new Set<string>()
  page.on('response', async response => {
    const url = response.url()
    if (seen.has(url)) return
    seen.add(url)
    const length = Number(response.headers()['content-length'] ?? 0)
    total += length
    if (/\.(mp4|webm)$/.test(new URL(url).pathname)) media += length
  })

  await page.goto(ORIGIN + route, { waitUntil: 'load' })
  await page.waitForTimeout(3500)

  const firstScreen = media
  const cards = await page.evaluate(() => document.querySelectorAll('[data-card]').length)

  /*
   * Scrolled in screenfuls with a pause, not jumped to the bottom. A jump
   * never intersects the middle of the wall, so the observer never fires for
   * it and the worst case comes out looking like the best one.
   */
  let last = -1
  for (let i = 0; i < 60; i++) {
    const at = await page.evaluate(() => {
      scrollBy(0, innerHeight * 0.9)
      return Math.round(scrollY)
    })
    await page.waitForTimeout(700)
    if (at === last) break
    last = at
  }
  await page.waitForTimeout(1500)

  const state = await page.evaluate(() => {
    const videos = [...document.querySelectorAll<HTMLVideoElement>('[data-video]')]
    return {
      playing: videos.filter(v => !v.paused).length,
      loaded: videos.filter(v => v.readyState > 0).length,
      videos: videos.length
    }
  })

  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
  console.log(`\n  ${route}  ${cards} cards, ${state.videos} with video\n`)
  console.log(`  first screen   ${mb(firstScreen).padStart(8)} of video`)
  console.log(`  whole wall     ${mb(media).padStart(8)} of video, ${mb(total)} of everything`)
  console.log(`  loaded         ${String(state.loaded).padStart(8)} of ${state.videos}`)
  console.log(`  playing        ${String(state.playing).padStart(8)} at the bottom`)
  console.log(
    '\n  Playing should be about a screenful. Every one past that is a decoder\n' +
      '  running for a card nobody can see.'
  )

  await browser.close()
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
