/*
 * Does an item's demo survive being navigated into and away from.
 *
 * AGENTS.md allows one live WebGL context at a time, and the router swaps
 * documents without reloading, so a demo that does not tear itself down on
 * astro:before-swap leaves its context behind. The next page then mounts a
 * second one, and on a machine that is already holding a few the driver
 * starts dropping them: the symptom is an effect that renders wrong, or
 * stutters, or stops, only after clicking rather than after a refresh.
 *
 *   pnpm navdemo wind-field
 */

import { chromium } from 'playwright'
import { ensureServer, ORIGIN } from './dev-server'

async function main() {
  const slug = process.argv[2] ?? 'wind-field'
  await ensureServer()
  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message.split('\n')[0]!))
  page.on('console', m => {
    if (m.type() === 'error' || m.text().includes('WebGL')) errors.push(m.text().slice(0, 120))
  })

  /* Canvases anywhere in the document, not just the one in the stage: a
     context left behind by a page the router swapped out is the thing being
     looked for, and it will not be in the stage. */
  const look = async (label: string) => {
    /*
     * Two reads a beat apart. A frozen effect is the failure a single
     * screenshot cannot tell from a slow one.
     *
     * Written as a string rather than a function, because tsx compiles with
     * esbuild's keepNames and that injects a __name helper into any named
     * function it sends into the page, where the helper does not exist.
     */
    const SAMPLE = `(() => {
      const stage = document.querySelector('[data-stage] canvas')
      if (!stage) return ''
      const off = document.createElement('canvas')
      off.width = 64
      off.height = 36
      const ctx = off.getContext('2d')
      ctx.drawImage(stage, 0, 0, 64, 36)
      return [...ctx.getImageData(0, 0, 64, 36).data].join(',')
    })()`
    const first = (await page.evaluate(SAMPLE)) as string
    await page.waitForTimeout(450)
    const second = (await page.evaluate(SAMPLE)) as string
    const state = (await page.evaluate(`(() => {
      const stage = document.querySelector('[data-stage] canvas')
      return {
        canvases: document.querySelectorAll('canvas').length,
        sized: stage ? stage.width + 'x' + stage.height : 'none'
      }
    })()`)) as { canvases: number; sized: string }
    const moving = first !== '' && first !== second
    console.log(
      `  ${label.padEnd(26)} canvases ${state.canvases}  stage ${state.sized.padEnd(11)} ` +
        `${moving ? 'moving' : 'STILL'}`
    )
  }

  await page.goto(`${ORIGIN}/effects/${slug}/`, { waitUntil: 'load' })
  await page.waitForTimeout(2500)
  await look('fresh load')

  /* Out to the wall and back in by clicking, three times. One round trip can
     look clean while the third is where a leak shows. */
  for (let i = 1; i <= 3; i++) {
    await page.locator('a[href="/effects"]').first().click({ timeout: 5000 })
    await page.waitForTimeout(1800)
    await page.locator(`a[href="/effects/${slug}"]`).first().click({ timeout: 5000 })
    await page.waitForTimeout(2500)
    await look(`after round trip ${i}`)
  }

  if (errors.length > 0) {
    console.log('\n  errors:')
    for (const error of [...new Set(errors)].slice(0, 8)) console.log(`    ${error}`)
  } else {
    console.log('\n  no console errors')
  }
  await browser.close()
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
