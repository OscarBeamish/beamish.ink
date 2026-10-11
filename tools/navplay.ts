/*
 * Do the cards still play after a client-side navigation.
 *
 * They play on a hard load and not after clicking between walls, which is the
 * shape of a listener that is registered once against a document the router
 * then replaces under it. A hard refresh hides exactly this class of bug, so
 * it needs a walk rather than a page load.
 *
 *   pnpm navplay
 */

import { chromium } from 'playwright'
import { ensureServer, ORIGIN } from './dev-server'

const WALK = ['/effects', '/templates', '/grids', '/']

async function main() {
  await ensureServer()
  const browser = await chromium.launch({ channel: 'chromium' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message.split('\n')[0]!))

  const count = () =>
    page.evaluate(() => {
      const videos = [...document.querySelectorAll<HTMLVideoElement>('[data-video]')]
      /* Only the ones on screen should be playing, so the number to compare is
         playing against on-screen rather than against the whole wall. */
      const onScreen = videos.filter(v => {
        const box = v.getBoundingClientRect()
        return box.bottom > 0 && box.top < innerHeight
      })
      return {
        onScreen: onScreen.length,
        playing: onScreen.filter(v => !v.paused).length,
        total: videos.length
      }
    })

  await page.goto(ORIGIN + WALK[0]!, { waitUntil: 'load' })
  await page.waitForTimeout(3000)
  let state = await count()
  console.log(
    `\n  ${WALK[0]!.padEnd(12)} fresh load   ${state.playing} of ${state.onScreen} on screen playing`
  )

  for (const next of WALK.slice(1)) {
    const link = page.locator(`a[href="${next}"]`).first()
    if ((await link.count()) === 0) {
      console.log(`  ${next.padEnd(12)} no link to it from the page before`)
      continue
    }
    await link.click({ timeout: 5000 })
    await page.waitForTimeout(3000)
    state = await count()
    const verdict = state.onScreen > 0 && state.playing === 0 ? '   <-- NOTHING PLAYING' : ''
    console.log(
      `  ${next.padEnd(12)} after click  ${state.playing} of ${state.onScreen} on screen playing${verdict}`
    )
  }

  if (errors.length > 0) console.log(`\n  page errors: ${errors.join('; ')}`)
  await browser.close()
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
