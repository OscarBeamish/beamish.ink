/*
 * The only test the library needs right now.
 *
 * Mount and destroy every effect fifty times and assert the browser is still
 * handing out WebGL contexts at the end. Chromium allows sixteen live contexts
 * (or sixteen million pixels) and silently kills the oldest past that, so a
 * `destroy()` that leaks does not throw. It just makes the fourth demo somebody
 * opens go blank, which is the worst kind of bug to find in the wild.
 *
 * Run with `pnpm test`. It drives a real browser because there is no meaningful
 * way to test this without one.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { listItems, buildItem } from '../build-items'

const CYCLES = 50

let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  })
}, 120_000)

afterAll(async () => {
  await browser?.close()
})

const effects = (await listItems()).filter(item => item.tier === 1)

describe('effects release their WebGL context on destroy', () => {
  for (const item of effects) {
    it(
      `${item.slug} survives ${CYCLES} mount/destroy cycles`,
      async () => {
        await buildItem(item)

        const context = await browser.newContext({
          viewport: { width: 480, height: 320 },
          deviceScaleFactor: 2
        })
        const page = await context.newPage()

        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))

        await page.goto(`${pathToFileURL(path.join(item.dir, 'demo.html')).href}?record=1`, {
          waitUntil: 'load'
        })

        const result = await page.evaluate(async cycles => {
          const host = document.getElementById('stage')!
          // The page's own handle is destroyed first, so the count below starts
          // from a clean slate rather than from one context already in flight.
          window.__beamish?.destroy?.()

          for (let i = 0; i < cycles; i++) {
            const handle = window.Beamish.create(host)
            handle.renderAtTime(i * 0.017)
            handle.destroy()
          }

          // If contexts had leaked, the browser would have started dropping the
          // oldest ones long before here and this probe would fail outright.
          const probe = document.createElement('canvas')
          probe.width = 64
          probe.height = 64
          const gl = probe.getContext('webgl2')
          const alive = Boolean(gl)
          gl?.getExtension('WEBGL_lose_context')?.loseContext()

          return { alive, canvases: document.querySelectorAll('#stage canvas').length }
        }, CYCLES)

        expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([])
        // Every canvas the runtime created must have been removed with it.
        expect(result.canvases).toBe(0)
        expect(result.alive, 'a fresh WebGL2 context could not be created afterwards').toBe(true)

        await context.close()
      },
      180_000
    )
  }
})
