/*
 * How fast a template preview actually scrolls.
 *
 * The scroll driver takes a page from the top to the bottom and back inside
 * the take's duration, so the velocity is whatever the page's height makes it
 * and nobody chose it. A long landing page and a short take is a blur. This
 * prints the number so the choice can be made against something.
 *
 * Peak rather than average, because the driver eases: it is slow at the top,
 * slow at the turn and fastest halfway down each leg, and the fast part is the
 * part that reads as a blur.
 *
 * It drives the page's own renderAtTime and reads scrollY back rather than
 * recomputing the driver's arithmetic. An earlier version did the arithmetic
 * here, and when the driver changed it went on reporting the old numbers with
 * complete confidence.
 *
 *   pnpm scrollspeed                 # every template
 *   pnpm scrollspeed editorial-portfolio
 */

import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { serveRoot, urlFor } from './serve'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..')

async function main() {
  const only = process.argv.slice(2)
  const slugs = fs
    .readdirSync(path.join(ROOT, 'templates'))
    .filter(name => !name.startsWith('_'))
    .filter(name => fs.existsSync(path.join(ROOT, 'templates', name, 'meta.json')))
    .filter(name => only.length === 0 || only.includes(name))

  /* The recorder's own static server, serving templates/<slug>/index.html.
     Pointed at the site's dev route instead, this measured nineteen identical
     heights, because /templates/<slug>/ is the detail page about a template
     and not the template. */
  const server = await serveRoot()
  const browser = await chromium.launch({ channel: 'chromium' })
  /* The ratio the cards show. A phone take scrolls a taller page through a
     shorter window and is always the worse number, but the wall is 16:9. */
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })

  console.log('\n  slug                      height   reach    secs   peak px/s')
  const rows: [string, number][] = []
  for (const slug of slugs) {
    const meta = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'templates', slug, 'meta.json'), 'utf8')
    )
    const secs = meta.record?.duration ?? 14
    await page.goto(`${urlFor(`templates/${slug}/index.html`)}?record=1&span=${secs}`, {
      waitUntil: 'load'
    })
    await page.waitForTimeout(1400)

    /*
     * Driven rather than modelled.
     *
     * The first version recomputed the driver's own arithmetic here, and when
     * the driver changed it went on reporting the old numbers with complete
     * confidence. renderAtTime is pure in t and the recorder calls it exactly
     * this way, so stepping it and reading scrollY back is the same scroll the
     * take will have, whatever the driver decides to do next.
     */
    const measured = await page.evaluate(
      async ([span, steps]) => {
        const driver = (window as never as { __beamish?: { renderAtTime(t: number): void } })
          .__beamish
        if (!driver) return null
        const ys: number[] = []
        for (let i = 0; i <= steps!; i++) {
          driver.renderAtTime((i / steps!) * span!)
          /* A frame between samples, so a page with reveals has grown the way
             it will have grown for the recorder. */
          await new Promise(r => requestAnimationFrame(() => r(null)))
          ys.push(scrollY)
        }
        let peak = 0
        const dt = span! / steps!
        for (let i = 1; i < ys.length; i++) peak = Math.max(peak, Math.abs(ys[i]! - ys[i - 1]!) / dt)
        return { peak, reach: Math.max(...ys), height: document.body.scrollHeight }
      },
      [secs, 160] as const
    )
    if (!measured) {
      console.log(`  ${slug.padEnd(24)} no scroll driver on the page`)
      continue
    }
    rows.push([slug, measured.peak])
    console.log(
      `  ${slug.padEnd(24)} ${String(measured.height).padStart(6)}  ` +
        `${String(Math.round(measured.reach)).padStart(6)}  ` +
        `${String(secs).padStart(4)}  ${String(Math.round(measured.peak)).padStart(8)}`
    )
  }
  await browser.close()
  server.close()

  const sorted = rows.sort((a, b) => b[1] - a[1])
  console.log(
    `\n  fastest: ${sorted[0]?.[0]} at ${Math.round(sorted[0]?.[1] ?? 0)} px/s\n` +
      `  slowest: ${sorted.at(-1)?.[0]} at ${Math.round(sorted.at(-1)?.[1] ?? 0)} px/s\n` +
      '\n  A reader scrolling to read a page moves at roughly 300 to 600 px/s.\n' +
      '  Past about 900 the type stops being type and the take is a blur.'
  )
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
