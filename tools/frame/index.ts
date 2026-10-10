/*
 * pnpm frame <slug> <t> [file]
 *
 * One frame of an item, at the second you ask for.
 *
 * `pnpm shot` screenshots a route, which for an animated item means whatever
 * moment the page happened to be at when the capture ran. `pnpm record
 * --poster-only` takes the frame at `posterAt`, which means editing meta.json
 * and regenerating to look at a different one, and the recorder caches its
 * output: two posters taken at 0.25s and 0.70s came back byte-identical, which
 * is a cache doing its job and an answer to nothing.
 *
 * This opens the item's own demo page with ?record, so nothing starts a loop of
 * its own, drives renderAtTime to the time given, and screenshots that. It is
 * how you check that a card is in front of the pile a quarter of the way
 * through its travel and behind it three quarters of the way through, which is
 * the kind of question a still of an arbitrary moment cannot answer.
 */

import { chromium } from 'playwright'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { serveRoot, closeServer, demoUrl } from '../serve'
import { listItems } from '../build-items'

async function main() {
  const [slug, at, out] = process.argv.slice(2)
  if (!slug || at === undefined) {
    console.error('pnpm frame <slug> <t-in-seconds> [file]')
    process.exit(1)
  }
  const t = Number(at)
  if (!Number.isFinite(t)) {
    console.error(`${at} is not a number of seconds`)
    process.exit(1)
  }

  const items = await listItems()
  const item = items.find(i => i.slug === slug)
  if (!item) {
    console.error(`${slug}: not an item, a grid or a template`)
    process.exit(1)
  }

  const file = out ?? path.join('tools', 'review', '.shots', `${slug}-${t}.png`)
  await mkdir(path.dirname(file), { recursive: true })

  const server = await serveRoot()
  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await page.goto(`${demoUrl(item.dir)}?record`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => Boolean((window as never as { __beamish?: unknown }).__beamish))
    /*
     * Pictures first. An item that samples an <img> draws a blank texture if it
     * is asked for a frame before the decode finishes, which is a bug this repo
     * has already shipped once on a live page.
     */
    await page.evaluate(async () => {
      await Promise.all(
        [...document.querySelectorAll('img')].map(img => img.decode().catch(() => undefined))
      )
    })
    await page.evaluate(seconds => {
      const handle = (window as never as {
        __beamish: { renderAtTime(t: number): void }
      }).__beamish
      // Twice: the first call on some items builds what the second one draws.
      handle.renderAtTime(seconds)
      handle.renderAtTime(seconds)
    }, t)
    await page.screenshot({ path: file })
    await page.close()
    console.log(`${slug} at ${t}s -> ${file}`)
  } finally {
    await browser.close()
    await closeServer(server)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
