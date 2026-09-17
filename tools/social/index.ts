/*
 * pnpm social
 *
 * Renders the GitHub social preview from tools/social/card.html, which mounts a
 * live Contour rather than pasting a screenshot of one. The card is therefore
 * made by the library it advertises and cannot drift from what the site ships.
 *
 * GitHub wants 1280×640 and refuses anything over 1MB. This renders at 2× and
 * downsamples, because text at 1× through a headless browser is noticeably
 * softer than text downsampled from 2×.
 */

import { chromium } from 'playwright'
import { execFile } from 'node:child_process'
import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildItem, listItems } from '../build-items'

const run = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = path.join(ROOT, 'site', 'public', 'social')

const WIDTH = 1280
const HEIGHT = 640
/** GitHub's hard ceiling. */
const MAX_BYTES = 1024 * 1024

/** The frame of the loop the card is taken at. Chosen, not arbitrary. */
const AT_SECONDS = 3.1

async function main() {
  // The card loads the item's demo bundle, so it has to exist and be current.
  const relief = (await listItems()).find(item => item.slug === 'terrain-relief')
  if (!relief) throw new Error('effects/terrain-relief is missing')
  await buildItem(relief)

  await mkdir(OUT, { recursive: true })

  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  })
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2
  })
  const page = await context.newPage()

  const problems: string[] = []
  page.on('pageerror', error => problems.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') problems.push(message.text())
  })

  await page.goto(pathToFileURL(path.join(ROOT, 'tools', 'social', 'card.html')).href, {
    waitUntil: 'load'
  })
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(seconds => window.__beamish.renderAtTime(seconds), AT_SECONDS)
  await page.waitForTimeout(700)

  if (problems.length > 0) {
    throw new Error(`the card reported errors\n  ${problems.join('\n  ')}`)
  }

  const raw = path.join(OUT, 'preview@2x.png')
  await page.screenshot({ path: raw })
  await context.close()
  await browser.close()

  const final = path.join(OUT, 'preview.png')
  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', raw,
    '-vf', `scale=${WIDTH}:${HEIGHT}:flags=lanczos`,
    final
  ])
  await rm(raw, { force: true })

  const bytes = (await stat(final)).size
  console.log(`social: ${path.relative(ROOT, final)}  ${WIDTH}×${HEIGHT}  ${(bytes / 1024).toFixed(0)} kB`)
  if (bytes > MAX_BYTES) {
    throw new Error(`over GitHub's 1MB ceiling by ${((bytes - MAX_BYTES) / 1024).toFixed(0)} kB`)
  }
}

await main()
