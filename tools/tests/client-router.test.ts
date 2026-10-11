/*
 * The site navigates without reloading, and must still hold one WebGL context.
 *
 * Adding Astro's ClientRouter put the hardest constraint in this repo at risk
 * in a way that does not throw and does not show up in a screenshot. The demo
 * panels released their contexts on `pagehide`, and `pagehide` does not fire
 * when the router swaps a document: every item page a reader visited would
 * have kept its context until Chromium silently force-lost the oldest, which
 * is the exact failure context-leak.test.ts exists to catch one level down.
 *
 * So this walks the site the way a reader does, clicking from item page to
 * item page, and counts. Every context the runtime releases goes through
 * `WEBGL_lose_context`, so patching that and patching `getContext` gives both
 * halves of the ledger: created, and given back.
 *
 * It also asserts the navigation was a swap rather than a load, because a test
 * that passes by quietly doing full page loads would be worse than no test.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { ensureServer, ORIGIN } from '../dev-server'

/* WebGL items, so each page really does take a context. */
const WALK = [
  '/effects/dust-motes/',
  '/effects/mesh-gradient/',
  '/effects/aurora-curtain/',
  '/effects/moire-screens/',
  '/effects/wind-field/'
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

async function counts(page: Page) {
  return page.evaluate(() => {
    const w = window as never as { __gl?: { made: number; lost: number } }
    return w.__gl ?? { made: 0, lost: 0 }
  })
}

describe('the client router', () => {
  it(
    'gives every WebGL context back before the next page takes one',
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

      /*
       * Patched before any of the site's own script runs, and re-applied on
       * nothing: an init script runs once per real document, and the whole
       * point of the router is that there is only ever one.
       */
      await page.addInitScript(() => {
        const w = window as never as { __gl: { made: number; lost: number }; __loads: number }
        w.__gl = { made: 0, lost: 0 }
        w.__loads = (w.__loads ?? 0) + 1

        const getContext = HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: never[]) {
          const context = (getContext as never as (...a: never[]) => unknown).apply(this, args)
          if (context && String(args[0]).startsWith('webgl')) {
            w.__gl.made += 1
            const gl = context as WebGLRenderingContext
            const getExtension = gl.getExtension.bind(gl)
            gl.getExtension = (name: string) => {
              const extension = getExtension(name)
              if (name === 'WEBGL_lose_context' && extension) {
                const lose = extension as { loseContext(): void }
                const original = lose.loseContext.bind(lose)
                return {
                  ...lose,
                  loseContext: () => {
                    w.__gl.lost += 1
                    original()
                  }
                } as never
              }
              return extension
            }
          }
          return context as never
        } as never
      })

      await page.goto(ORIGIN + WALK[0]!, { waitUntil: 'networkidle' })

      for (const next of WALK.slice(1)) {
        await page.evaluate(href => {
          const link = document.createElement('a')
          link.href = href
          document.body.appendChild(link)
          link.click()
        }, next)
        await page.waitForFunction(
          path => location.pathname === path,
          next,
          { timeout: 20_000 }
        )
        // The swap is done when the router says so; the mount happens on the
        // same event this waits behind.
        await page.waitForTimeout(900)
      }

      const { made, lost } = await counts(page)
      const loads = await page.evaluate(
        () => (window as never as { __loads: number }).__loads
      )

      /*
       * One real document for the whole walk. If this is five, the links did
       * full page loads and everything below passes for the wrong reason.
       */
      expect(loads).toBe(1)

      /*
       * Every context but the one on screen has been given back. Not an
       * inequality: a leak of one per page is exactly the bug, and it would
       * sail past `lost > 0`.
       */
      expect(made).toBeGreaterThanOrEqual(WALK.length)
      expect(made - lost).toBeLessThanOrEqual(1)

      await page.close()
    },
    180_000
  )

  it(
    'keeps the chosen ground across a swap',
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
      await page.addInitScript(() => {
        try {
          localStorage.setItem('beamish-ground', 'dark')
        } catch {
          /* Private windows throw. The assertion below will say so. */
        }
      })

      await page.goto(ORIGIN + '/templates', { waitUntil: 'networkidle' })
      expect(await page.evaluate(() => document.documentElement.dataset['ground'])).toBe('dark')

      await page.evaluate(() => {
        const link = document.createElement('a')
        link.href = '/grids'
        document.body.appendChild(link)
        link.click()
      })
      await page.waitForFunction(() => location.pathname === '/grids', undefined, {
        timeout: 20_000
      })

      /*
       * Every page is built carrying the static default, and the router copies
       * the incoming <html> element's attributes over the live one. Without
       * putting the stored choice back before the swap lands, a reader who
       * chose dark gets paper the moment they click anything.
       */
      expect(await page.evaluate(() => document.documentElement.dataset['ground'])).toBe('dark')

      await page.close()
    },
    120_000
  )

  it(
    'has both faces ready on every swapped page, not just the first',
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
      await page.goto(ORIGIN + '/templates', { waitUntil: 'load' })
      await page.waitForTimeout(1500)

      /*
       * Two swaps, not one, and that is the whole reason this test is shaped
       * the way it is. With the fault present the first swap comes through
       * with both faces ready and the second does not, so a one-swap version
       * of this test passed against the very state it was written to catch.
       *
       * Read at astro:page-load, not afterwards: a face that becomes ready a
       * tick later has already had the fallback painted under it, which is the
       * flash, and every heading on this site is in the display face.
       *
       * It fails on the dev server, which is where the fault lives. Vite
       * serves the site's CSS as inline <style> blocks, the router preserves
       * only stylesheets that are present on the next page, and a re-appended
       * @font-face is a new face in the unloaded state. The declarations live
       * in site/public/fonts.css for that reason: one href, the same string in
       * dev and in a build, so the router keeps it in both.
       */
      const missing: Record<string, string[]> = {}
      for (const next of ['/grids', '/effects']) {
        missing[next] = await page.evaluate(href => {
          const faces: [string, string][] = [
            ['Archivo', '700 1rem Archivo'],
            ['JetBrains Mono', '400 1rem "JetBrains Mono"']
          ]
          /* Armed before the click: a prefetched swap lands in about 80ms and
             a listener attached afterwards misses the event it waits for. */
          const ready = new Promise<string[]>(resolve => {
            document.addEventListener(
              'astro:page-load',
              () => resolve(faces.filter(f => !document.fonts.check(f[1])).map(f => f[0])),
              { once: true }
            )
          })
          const link = document.createElement('a')
          link.href = href
          document.body.appendChild(link)
          link.click()
          return ready
        }, next)
        await page.waitForTimeout(400)
      }

      expect(missing).toEqual({ '/grids': [], '/effects': [] })

      await page.close()
    },
    120_000
  )

  it(
    'wires the page controls after a swap',
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
      await page.goto(ORIGIN + '/templates', { waitUntil: 'networkidle' })

      await page.evaluate(() => {
        const link = document.createElement('a')
        link.href = '/effects/dust-motes/'
        document.body.appendChild(link)
        link.click()
      })
      await page.waitForFunction(() => location.pathname === '/effects/dust-motes/', undefined, {
        timeout: 20_000
      })
      await page.waitForTimeout(900)

      /*
       * Copy prompt is the one control this site exists to offer, and it binds
       * its handler when its script runs. A script runs once per real load, so
       * without a page-load hook the button on every page after the first is a
       * button that does nothing. The flag is what the binder sets, so it is
       * proof the binder ran against this document rather than the one before.
       */
      expect(
        await page.evaluate(
          () => document.querySelector<HTMLElement>('.prompt-buttons')?.dataset['promptBound']
        )
      ).toBe('')

      // And the demo mounted, which is the panel's own page-load hook.
      expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBeGreaterThan(0)

      await page.close()
    },
    120_000
  )
})
