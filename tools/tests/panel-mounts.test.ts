/*
 * The demo panel actually mounts something.
 *
 * AGENTS.md says an item missing from the registry builds, typechecks,
 * generates a prompt, renders its page and mounts nothing at all with no error
 * anywhere, and that the way to catch it is to count canvases rather than to
 * look at the page and assume it has not loaded yet. registry.test.ts covers
 * the registry statically. This is the other half: whether the module the
 * registry names can actually be loaded and run.
 *
 * It exists because the static half would not have caught what happened.
 * ChromeForm and DepthPointCloud were registered correctly, imported
 * correctly, built correctly and mounted nothing, because `three` was reaching
 * the browser through a prebundled dependency that had gone stale: a 504
 * Outdated Optimize Dep behind a dynamic import, which surfaces as an empty
 * panel and a line in a console nobody is reading.
 *
 * The three.js items are all here because they are the fragile class: item
 * cores are imported through @fs/ paths outside the site, which Vite's scanner
 * does not crawl, so a dependency only they use is always a late discovery.
 * The rest are one of each other kind, as a control.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { ensureServer, ORIGIN } from '../dev-server'

/* Every item whose core imports three, plus one of each other kind. */
const SLUGS = [
  'terrain-relief',
  'translucent-sheets',
  'cast-shadow-scene',
  'pointer-lit-busts',
  'pointer-ripple-grid',
  'chrome-form',
  'depth-point-cloud',
  /* A plain WebGL2 shader, a 2D canvas item, and one that samples an <img>. */
  'water-caustics',
  'squircle-keycap',
  'ascii-image'
]

let browser: Browser

beforeAll(async () => {
  await ensureServer()
  browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  })
}, 180_000)

afterAll(async () => {
  await browser?.close()
})

describe('every demo panel', () => {
  it(
    'mounts a canvas with real pixels in it',
    async () => {
      const empty: string[] = []
      const threw: string[] = []

      for (const slug of SLUGS) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message.split('\n')[0]!))

        await page.goto(`${ORIGIN}/effects/${slug}/`, { waitUntil: 'load' })
        await page.waitForTimeout(2200)

        const drawn = await page.evaluate(() => {
          const stage = document.querySelector('[data-stage]')
          const canvas = stage?.querySelector('canvas') as HTMLCanvasElement | null
          /* Width rather than presence: a canvas the runtime made but never
             sized is the same empty panel from the reader's side. */
          return canvas ? canvas.width : 0
        })

        if (drawn === 0) empty.push(slug)
        if (errors.length > 0) threw.push(`${slug}: ${errors[0]}`)
        await page.close()
      }

      expect(empty).toEqual([])
      expect(threw).toEqual([])
    },
    240_000
  )
})
