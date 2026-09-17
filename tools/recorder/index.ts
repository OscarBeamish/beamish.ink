/*
 * pnpm record <slug> | pnpm record --all
 *
 * The video is the only promise we make to someone before they paste a prompt, so
 * it has to be exact. Nothing here screen-records: the page clock is stubbed, the
 * loop is driven one frame at a time, every frame is screenshot at 2× DPR, and
 * ffmpeg encodes the sequence. No dropped frames, no timing jitter, and the same
 * input produces the same bytes.
 *
 * Tier 1 is driven through `renderAtTime`. Tier 2 has no render loop to drive, so
 * its CSS transitions are paused and scrubbed through the Web Animations API
 * instead, while a script from meta.json replays the interaction. See
 * captureTier2.
 */

import { chromium, type Browser, type Page } from 'playwright'
import { execFile } from 'node:child_process'
import { mkdir, rm, readdir, stat, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { metaSchema, type Meta, type InteractionStep } from '../schema/meta'
import { buildItem, listItems, type ItemRef } from '../build-items'
import { serveRoot, demoUrl } from '../serve'

const run = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const FRAMES = path.join(ROOT, 'tools', 'recorder', '.frames')

/*
 * The mp4 is the master: full size, used for social and for the item page. The
 * webm is the site asset and is encoded at the size it is actually displayed,
 * because a card 420px wide has no use for 1200 lines of halftone.
 *
 * 9:16 gets no webm. It is launch marketing for platforms that all take mp4, and
 * a second encode there would double the repo cost for nothing.
 *
 * Every media file is committed and every re-record adds a permanent blob to
 * history, so these numbers are a budget, not a preference.
 */
const RATIOS = [
  // Only 16:9 gets a webm, and it is encoded at the size a card is actually
  // displayed rather than at master resolution. The card is the only place the
  // webm is used, and a 420px card has no use for 1280 lines of detail.
  { key: '16x9', width: 1920, height: 1080, webmWidth: 960 },
  { key: '1x1', width: 1200, height: 1200, webmWidth: 0 },
  { key: '9x16', width: 1080, height: 1920, webmWidth: 0 }
] as const

/**
 * A dense full-frame effect will not fit half a megabyte at any honest quality.
 * The pitch is the video, so the video wins and the warning is loud instead.
 */
const WEBM_BUDGET_BYTES = 1_200 * 1024
const MP4_BUDGET_BYTES = 3_500 * 1024
const POSTER_BUDGET_BYTES = 260 * 1024

type Ratio = (typeof RATIOS)[number]

// --- page setup ------------------------------------------------------------

/*
 * Anything that reads the wall clock is a source of non-determinism, including
 * code we did not write. Freeze all of it before a single script runs.
 */
const CLOCK_STUB = `
  (() => {
    let now = 0
    window.__setClock = ms => { now = ms }
    const origin = performance.timeOrigin
    performance.now = () => now
    Date.now = () => origin + now
    const RealDate = Date
    window.Date = class extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [origin + now]))
      }
      static now() { return origin + now }
    }
    Math.random = (seed => () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    })(0x9e3779b9)
  })()
`

/*
 * Unlink the contents rather than the directory. On Windows a directory that was
 * written to a moment ago is routinely still held open, by the indexer or by a
 * shell sitting in it, and rmdir fails with EBUSY where unlinking does not.
 * Frames are scratch either way, so a failure here must never fail a recording.
 */
async function emptyDir(dir: string) {
  if (!existsSync(dir)) return
  await Promise.all(
    (await readdir(dir)).map(name => rm(path.join(dir, name), { recursive: true, force: true }))
  )
  await rm(dir, { recursive: true, force: true }).catch(() => {})
}

async function openDemo(browser: Browser, item: ItemRef, ratio: Ratio): Promise<Page> {
  const context = await browser.newContext({
    // Half the target in CSS pixels at 2× DPR, so a screenshot lands on the
    // target size exactly and the effect sees the DPR it will see in the wild.
    viewport: { width: ratio.width / 2, height: ratio.height / 2 },
    deviceScaleFactor: 2,
    reducedMotion: 'no-preference'
  })
  await context.addInitScript(CLOCK_STUB)
  await context.addInitScript(ANIMATION_SCRUBBER)

  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })

  /*
   * Served over HTTP rather than opened as a file. Under file:// every image is
   * a separate opaque origin, so texImage2D refuses to upload one and any effect
   * that samples a texture cannot be recorded at all. Nothing else here needs a
   * server, which is why this went unnoticed until the first textured effect.
   */
  const url = `${demoUrl(item.dir)}?record=1`
  await page.goto(url, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)

  if (errors.length > 0) {
    throw new Error(`${item.slug}: the demo page reported errors\n  ${errors.join('\n  ')}`)
  }
  return page
}

// --- frame capture ---------------------------------------------------------

async function captureTier1(page: Page, meta: Meta, dir: string): Promise<number> {
  const total = Math.round(meta.record.duration * meta.record.fps)

  const ready = await page.evaluate(() => typeof window.__beamish?.renderAtTime === 'function')
  if (!ready) throw new Error('demo.html did not expose window.__beamish.renderAtTime')

  /*
   * A pointer-driven effect has nothing to show if nothing moves the pointer.
   * Rather than synthesising mouse events, which the effect would sample at
   * whatever moment the frame happened to land, the scripted path from meta.json
   * is handed to the runtime, which samples it at exactly the time being drawn.
   * Same contract, no extra API, and deterministic by construction.
   */
  if (meta.cursor) {
    await page.evaluate(
      cursor => window.__beamish.update({
        pointerPath: cursor.keys,
        pointerPathDuration: cursor.duration
      }),
      meta.cursor
    )
  }

  // Same contract for a scroll-driven item. Its velocity comes out of the
  // path's own slope, so it is a function of t like everything else.
  if (meta.scroll) {
    await page.evaluate(
      scroll => window.__beamish.update({
        scrollPath: scroll.keys,
        scrollPathDuration: scroll.duration
      }),
      meta.scroll
    )
  }

  for (let frame = 0; frame < total; frame++) {
    // The last frame is deliberately excluded: at t = duration the effect is back
    // where it started, so including it would repeat frame zero and the loop
    // would stutter once per cycle.
    const t = frame / meta.record.fps
    await page.evaluate(
      ([time, ms]) => {
        window.__setClock?.(ms as number)
        window.__beamish.renderAtTime(time as number)
      },
      [t, t * 1000] as const
    )
    await page.screenshot({ path: path.join(dir, `${String(frame).padStart(5, '0')}.png`) })
  }
  return total
}

async function applyStep(page: Page, step: InteractionStep, ratio: Ratio) {
  const vw = ratio.width / 2
  const vh = ratio.height / 2
  switch (step.action) {
    case 'move':
      await page.mouse.move((step.x ?? 0.5) * vw, (step.y ?? 0.5) * vh)
      break
    case 'click':
      if (step.target) await page.locator(step.target).first().click({ force: true, timeout: 5000 })
      else await page.mouse.click((step.x ?? 0.5) * vw, (step.y ?? 0.5) * vh)
      break
    case 'hover':
      if (step.target) await page.locator(step.target).first().hover({ force: true, timeout: 5000 })
      break
    case 'key':
      await page.keyboard.press(step.key ?? 'Escape')
      break
    case 'scroll':
      await page.mouse.wheel(0, step.by ?? 240)
      break
    case 'wait':
      break
  }
}

/*
 * Tier 2 is CSS transitions and React state, neither of which can be stepped by
 * hand the way `renderAtTime` steps a shader.
 *
 * Chromium's virtual time clock looks like the answer and is not: with the clock
 * paused the browser surface never advances, so every screenshot blocks until it
 * times out, and capturing from the renderer instead loses the device pixel
 * ratio. Both were tried.
 *
 * What works is the Web Animations API. Every CSS transition is a real
 * `CSSTransition` in `document.getAnimations()`, so they can all be paused and
 * scrubbed to an exact time, which makes the wall clock irrelevant, leaves
 * screenshots on the fast path, and is deterministic for the same reason
 * `renderAtTime` is.
 */
const ANIMATION_SCRUBBER = `
  (() => {
    const born = new WeakMap()
    window.__beamishScrub = seconds => {
      for (const animation of document.getAnimations()) {
        // An animation's own zero is the moment it was created, which is
        // whichever frame the interaction that triggered it landed on.
        if (!born.has(animation)) born.set(animation, seconds)
        try {
          animation.pause()
          animation.currentTime = Math.max(0, (seconds - born.get(animation)) * 1000)
        } catch {
          // A finished or replaced animation throws on currentTime. Nothing to do.
        }
      }
    }
  })()
`

async function captureTier2(page: Page, meta: Meta, dir: string, ratio: Ratio): Promise<number> {
  const total = Math.round(meta.record.duration * meta.record.fps)
  const steps = [...(meta.record.interactions ?? [])].sort((a, b) => a.at - b.at)

  let next = 0
  for (let frame = 0; frame < total; frame++) {
    const t = frame / meta.record.fps

    while (next < steps.length && steps[next]!.at <= t) {
      await applyStep(page, steps[next]!, ratio)
      next += 1
    }

    await page.evaluate(
      ([seconds, ms]) => {
        window.__setClock?.(ms as number)
        window.__beamishScrub?.(seconds as number)
      },
      [t, t * 1000] as const
    )
    await page.screenshot({ path: path.join(dir, `${String(frame).padStart(5, '0')}.png`) })
  }

  return total
}

// --- encoding --------------------------------------------------------------

async function ffmpeg(args: string[]) {
  try {
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      maxBuffer: 1024 * 1024 * 32
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`ffmpeg failed\n${message}`)
  }
}

async function encode(framesDir: string, outDir: string, ratio: Ratio, meta: Meta) {
  const fps = meta.record.fps
  const pattern = path.join(framesDir, '%05d.png')
  const base = path.join(outDir, ratio.key)

  await ffmpeg([
    '-framerate', String(fps),
    '-i', pattern,
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-crf', String(meta.record.crf ?? 26),
    '-preset', 'slow',
    // yuv420p and even dimensions, or Safari and half of social will refuse it.
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-an',
    `${base}.mp4`
  ])

  if (ratio.webmWidth > 0) {
    const height = Math.round((ratio.webmWidth * ratio.height) / ratio.width / 2) * 2
    await ffmpeg([
      '-framerate', String(fps),
      '-i', pattern,
      '-vf', `scale=${ratio.webmWidth}:${height}:flags=lanczos`,
      '-c:v', 'libvpx-vp9',
      '-crf', String(meta.record.webmCrf ?? 40),
      '-b:v', '0',
      '-row-mt', '1',
      '-deadline', 'good',
      '-cpu-used', '2',
      '-auto-alt-ref', '1',
      '-lag-in-frames', '25',
      '-pix_fmt', 'yuv420p',
      '-an',
      `${base}.webm`
    ])
  }
}

async function poster(framesDir: string, outDir: string, meta: Meta) {
  const frame = Math.min(
    Math.round(meta.record.posterAt * meta.record.fps),
    Math.round(meta.record.duration * meta.record.fps) - 1
  )
  await ffmpeg([
    '-i', path.join(framesDir, `${String(frame).padStart(5, '0')}.png`),
    '-vf', 'scale=1440:-2',
    '-q:v', '6',
    path.join(outDir, 'poster.jpg')
  ])
}

// --- driver ----------------------------------------------------------------

async function recordItem(browser: Browser, item: ItemRef, only: string[], keepFrames: boolean) {
  const meta = metaSchema.parse(JSON.parse(await readFile(path.join(item.dir, 'meta.json'), 'utf8')))
  const outDir = path.join(item.dir, 'media')
  await mkdir(outDir, { recursive: true })
  await buildItem(item)

  const ratios = RATIOS.filter(ratio => only.length === 0 || only.includes(ratio.key))

  for (const ratio of ratios) {
    const framesDir = path.join(FRAMES, item.slug, ratio.key)
    const cached = keepFrames && existsSync(framesDir) && (await readdir(framesDir)).length > 0
    if (!cached) {
      // Empty the directory rather than removing it. On Windows a directory that
      // was recently written to is often still held open by the indexer, and
      // rmdir fails with EBUSY where unlinking the files does not.
      await emptyDir(framesDir)
      await mkdir(framesDir, { recursive: true })
    }

    const started = Date.now()
    let frames = cached ? (await readdir(framesDir)).length : 0
    if (!cached) {
      const page = await openDemo(browser, item, ratio)
      frames =
        item.tier === 1
          ? await captureTier1(page, meta, framesDir)
          : await captureTier2(page, meta, framesDir, ratio)
      await page.context().close()
    }

    await encode(framesDir, outDir, ratio, meta)
    if (ratio.key === '16x9') await poster(framesDir, outDir, meta)

    const seconds = ((Date.now() - started) / 1000).toFixed(0)
    console.log(`  ${item.slug} ${ratio.key.padEnd(5)} ${frames} frames in ${seconds}s${cached ? ' (cached)' : ''}`)
    if (!keepFrames) await emptyDir(framesDir)
  }

  // Budgets are not advisory. Media is committed to the repo, and every
  // re-record adds a permanent blob to history.
  for (const entry of await readdir(outDir)) {
    const bytes = (await stat(path.join(outDir, entry))).size
    const budget = entry.endsWith('.webm')
      ? WEBM_BUDGET_BYTES
      : entry.endsWith('.mp4')
        ? MP4_BUDGET_BYTES
        : entry.endsWith('.jpg')
          ? POSTER_BUDGET_BYTES
          : null
    const flag = budget && bytes > budget ? '  OVER BUDGET' : ''
    console.log(`    ${entry.padEnd(14)} ${(bytes / 1024).toFixed(0)} kB${flag}`)
  }

  await writeFile(
    path.join(outDir, 'README.md'),
    `Generated by \`pnpm record ${item.slug}\`. Do not edit by hand. Re-record instead.\n`,
    'utf8'
  )
}

async function main() {
  const args = process.argv.slice(2)
  const all = args.includes('--all')
  const ratioArg = args.indexOf('--ratio')
  const only = ratioArg >= 0 ? [args[ratioArg + 1]!] : []
  const consumed = new Set(ratioArg >= 0 ? [ratioArg, ratioArg + 1] : [])
  const slugs = args.filter((arg, i) => !arg.startsWith('--') && !consumed.has(i))

  const items = (await listItems()).filter(item => all || slugs.includes(item.slug))
  if (items.length === 0) {
    console.error('Nothing to record. Pass a slug, or --all.')
    process.exit(1)
  }

  if (!existsSync(FRAMES)) await mkdir(FRAMES, { recursive: true })

  const server = await serveRoot()
  const browser = await chromium.launch({
    // The full browser rather than the headless shell: the shell has no GPU, and
    // software rasterising a shader at 1920×1080 for 300 frames is the difference
    // between two minutes and forty.
    channel: 'chromium',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  })

  // --keep-frames leaves the PNG sequence on disk so encoder settings can be
  // tuned without recapturing, which is the slow half.
  const keepFrames = args.includes('--keep-frames')

  try {
    for (const item of items) await recordItem(browser, item, only, keepFrames)
  } finally {
    await browser.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
    if (!keepFrames) await emptyDir(FRAMES)
  }
}

await main()
