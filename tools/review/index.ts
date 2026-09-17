/*
 * pnpm review
 *
 * The step between "it builds" and "it is done". It loads every page of the built
 * site at three widths, screenshots each one, and runs the checks that are easy
 * to forget and embarrassing to ship: console errors, dead requests, horizontal
 * overflow, unloaded images, missing metadata, em dashes, and headings that wrap
 * badly.
 *
 * Screenshots land in tools/review/.shots for a human to look at. The automated
 * checks cannot tell you a headline is ugly. They can tell you it broke into four
 * lines with one word on the last, which is usually why.
 *
 * Exits non-zero if anything fails, so it can gate a commit.
 */

import { chromium, type Page } from 'playwright'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SHOTS = path.join(ROOT, 'tools', 'review', '.shots')
const PORT = 4489
const ORIGIN = `http://localhost:${PORT}`

const WIDTHS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 }
] as const

type Finding = { route: string; width: string; level: 'fail' | 'warn'; message: string }

// --- the checks ------------------------------------------------------------

/*
 * A heading that breaks with one short word alone on the last line reads as a
 * mistake, and it is the single most common way a good hero goes wrong. This
 * measures the real line boxes rather than guessing from character counts.
 */
async function headingRag(page: Page) {
  return page.evaluate(() => {
    const results: { text: string; lines: string[]; overflow: boolean }[] = []
    for (const heading of document.querySelectorAll('h1')) {
      const range = document.createRange()
      const lines: string[] = []
      /*
       * Walk every text node in the heading character by character and split
       * wherever the client rect's top changes, which is where the browser
       * actually broke the line. Descending into children matters: a heading
       * built as a deliberate multi-line lockup has no direct text node at all.
       */
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT)
      const nodes: Text[] = []
      let cursor = walker.nextNode()
      while (cursor) {
        nodes.push(cursor as Text)
        cursor = walker.nextNode()
      }
      if (nodes.length === 0) continue

      const text = nodes.map(n => n.textContent ?? '').join(' ')
      let current = ''
      let top: number | null = null
      for (const node of nodes) {
        const value = node.textContent ?? ''
        for (let i = 0; i < value.length; i++) {
          range.setStart(node, i)
          range.setEnd(node, i + 1)
          const rect = range.getBoundingClientRect()
          if (top === null) top = rect.top
          else if (Math.abs(rect.top - top) > 2) {
            lines.push(current.trim())
            current = ''
            top = rect.top
          }
          current += value[i]
        }
      }
      lines.push(current.trim())
      results.push({
        text: text.replace(/\s+/g, ' ').trim(),
        // Whitespace between elements is its own text node and would otherwise
        // count as a line.
        lines: lines.filter(line => line.length > 0),
        overflow: heading.scrollWidth > heading.clientWidth + 1
      })
    }
    return results
  })
}

async function pageFacts(page: Page) {
  return page.evaluate(() => ({
    title: document.title,
    description:
      document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    // documentElement, not body: a wide child stretches the root, and that is
    // exactly the sideways scroll people complain about on phones.
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    brokenImages: [...document.querySelectorAll('img')]
      .filter(img => !img.complete || img.naturalWidth === 0)
      /*
       * A lazy image below the fold has not loaded because it was told not to,
       * which is the loading strategy working rather than a broken file. Only
       * count one as broken once it is somewhere near the viewport.
       */
      .filter(img => {
        if (img.loading !== 'lazy') return true
        const box = img.getBoundingClientRect()
        return box.top < window.innerHeight * 1.5 && box.bottom > 0
      })
      .map(img => img.getAttribute('src') ?? '(no src)'),
    unlabelledImages: [...document.querySelectorAll('img')].filter(
      img => img.getAttribute('alt') === null
    ).length,
    dashes: (document.body.innerText.match(/[—–]/g) ?? []).length,
    // Anything that is focusable should show something when focused.
    controls: document.querySelectorAll('button, a[href], input, select').length
  }))
}

// --- driver ----------------------------------------------------------------

async function routes(): Promise<string[]> {
  const generated = path.join(ROOT, '.generated', 'index.json')
  const items: { slug: string; group: string }[] = existsSync(generated)
    ? JSON.parse(await readFile(generated, 'utf8'))
    : []
  return ['/', '/how-it-works/', ...items.map(item => `/${item.group}/${item.slug}/`)]
}

/*
 * Runs astro's entry point through node directly rather than through npx and a
 * shell. On Windows a shell-spawned child means kill() reaches the shell and
 * leaves the server running, which then poisons the next run: it answers on the
 * port, the review connects to a stale build, and reports on the wrong site.
 */
function serve(): ChildProcess {
  return spawn(
    process.execPath,
    [
      path.join(ROOT, 'site', 'node_modules', 'astro', 'astro.js'),
      'preview',
      '--port',
      String(PORT),
      '--host',
      '127.0.0.1'
    ],
    { cwd: path.join(ROOT, 'site'), stdio: 'ignore' }
  )
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(ORIGIN)
      if (response.ok) return
    } catch {
      // Not up yet.
    }
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  throw new Error(`preview server never came up on ${ORIGIN}. Run \`pnpm build\` first.`)
}

async function main() {
  if (!existsSync(path.join(ROOT, 'site', 'dist', 'index.html'))) {
    throw new Error('site/dist is missing. Run `pnpm build` first.')
  }

  /*
   * Refuse to run if something already answers on the port. Astro's preview
   * silently increments when a port is taken, so without this the review would
   * quietly test whatever else happened to be listening and report on the wrong
   * site. It did exactly that once.
   */
  try {
    await fetch(ORIGIN, { signal: AbortSignal.timeout(1500) })
    throw new Error(
      `Something is already serving ${ORIGIN}. Stop it, or the review will test the wrong site.`
    )
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Something is already')) throw error
    // Connection refused is what we want: the port is free.
  }

  await rm(SHOTS, { recursive: true, force: true }).catch(() => {})
  await mkdir(SHOTS, { recursive: true })

  const server = serve()
  const findings: Finding[] = []

  try {
    await waitForServer()
    const list = await routes()
    const browser = await chromium.launch({
      channel: 'chromium',
      args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
    })

    for (const size of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: 2
      })

      for (const route of list) {
        const page = await context.newPage()
        const problems: string[] = []
        page.on('pageerror', error => problems.push(`uncaught: ${error.message}`))
        page.on('console', message => {
          if (message.type() === 'error') problems.push(`console: ${message.text()}`)
        })
        page.on('response', response => {
          if (response.status() >= 400) {
            problems.push(`HTTP ${response.status()}: ${response.url().replace(ORIGIN, '')}`)
          }
        })

        await page.goto(ORIGIN + route, { waitUntil: 'networkidle' })
        // Let the demos mount and the fonts settle before anything is measured.
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(2200)

        /*
         * Scroll the whole page before measuring. Posters are loading="lazy", so
         * an unscrolled page reports every card below the fold as a broken
         * image. Sweeping also matches what a visitor does, which is the point.
         */
        const height = await page.evaluate(() => document.body.scrollHeight)
        for (let y = 0; y < height; y += size.height) {
          await page.evaluate(offset => window.scrollTo(0, offset), y)
          await page.waitForTimeout(220)
        }
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(900)

        const facts = await pageFacts(page)
        const headings = await headingRag(page)

        const name = route === '/' ? 'index' : route.replace(/^\/|\/$/g, '').replace(/\//g, '-')
        await page.screenshot({
          path: path.join(SHOTS, `${name}--${size.key}.png`),
          fullPage: size.key === 'desktop'
        })

        const add = (level: Finding['level'], message: string) =>
          findings.push({ route, width: size.key, level, message })

        for (const problem of problems) add('fail', problem)
        if (facts.overflows) {
          add('fail', `scrolls sideways: ${facts.scrollWidth}px in a ${facts.clientWidth}px viewport`)
        }
        for (const src of facts.brokenImages) add('fail', `image did not load: ${src}`)
        if (facts.dashes > 0) add('fail', `${facts.dashes} em or en dash in the visible text`)
        if (facts.unlabelledImages > 0) {
          add('fail', `${facts.unlabelledImages} img with no alt attribute`)
        }
        if (!facts.title) add('fail', 'no <title>')
        if (facts.title.length > 62) add('warn', `title is ${facts.title.length} characters, over 62`)
        if (!facts.description) add('fail', 'no meta description')
        if (facts.description.length > 165) {
          add('warn', `description is ${facts.description.length} characters, over 165`)
        }

        for (const heading of headings) {
          if (heading.overflow) add('fail', `h1 overflows its box: "${heading.text.slice(0, 40)}"`)
          const last = heading.lines[heading.lines.length - 1] ?? ''
          if (heading.lines.length > 1 && last.split(/\s+/).length === 1 && last.length <= 6) {
            add('warn', `h1 leaves "${last}" alone on the last line`)
          }
          if (heading.lines.length > 3) {
            add('warn', `h1 breaks into ${heading.lines.length} lines: ${heading.lines.join(' / ')}`)
          }
        }

        await page.close()
      }

      await context.close()
    }

    await browser.close()
  } finally {
    server.kill()
  }

  // --- report --------------------------------------------------------------

  const fails = findings.filter(f => f.level === 'fail')
  const warns = findings.filter(f => f.level === 'warn')

  const show = (list: Finding[], label: string) => {
    if (list.length === 0) return
    console.log(`\n${label}`)
    for (const finding of list) {
      console.log(`  ${finding.route.padEnd(26)} ${finding.width.padEnd(8)} ${finding.message}`)
    }
  }

  show(fails, `FAIL (${fails.length})`)
  show(warns, `WARN (${warns.length})`)

  const shots = (await readdir(SHOTS)).length
  console.log(`\n${shots} screenshots in tools/review/.shots. Look at them.`)

  if (fails.length === 0 && warns.length === 0) console.log('No findings.')
  if (fails.length > 0) process.exit(1)
}

await main()
