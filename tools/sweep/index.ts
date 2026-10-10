/*
 * pnpm sweep
 *
 * Opens every page and reports what the console said. Nothing else: no
 * screenshots, no layout measuring, no fixed sleeps worth speaking of.
 *
 * This exists because the honest answer to "are any pages broken" was
 * previously a twenty minute review, and because a stale dev server can break
 * a dozen pages at once in a way that no source file explains. A sweep that
 * takes under a minute gets run; one that takes twenty does not, and the
 * errors sit there.
 *
 * It talks to the dev server rather than a build, for the same reason poke
 * does: the question is usually about the code as it is saved right now.
 *
 * Extension noise is dropped. A browser with a password manager in it reports
 * that manager's exceptions on every page, and a tool that cannot tell those
 * from the site's own errors trains you to ignore it.
 */

import { chromium, type Browser } from 'playwright'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureServer, ORIGIN } from '../dev-server'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const AT_ONCE = 6

/* Errors that belong to the browser rather than to this site. */
const NOT_OURS = [
  'chrome-extension://',
  'autofill.bundle.js',
  'content.js',
  'Feature is disabled',
  // Vite's own noise when a page is opened mid-reload.
  'Failed to fetch dynamically imported module: http://localhost:4321/@vite'
]

function slugsIn(collection: string): string[] {
  const dir = path.join(ROOT, collection)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_'))
    .filter(e => existsSync(path.join(dir, e.name, 'meta.json')))
    .map(e => e.name)
    .sort()
}

function routes(): string[] {
  const generated = path.join(ROOT, '.generated', 'index.json')
  const items: { slug: string; group: string }[] = existsSync(generated)
    ? JSON.parse(readFileSync(generated, 'utf8'))
    : []
  return [
    '/',
    '/effects/',
    '/how-it-works/',
    ...items.map(i => `/${i.group}/${i.slug}/`),
    '/grids/',
    ...slugsIn('grids').map(s => `/grids/${s}/`),
    '/templates/',
    ...slugsIn('templates').map(s => `/templates/${s}/`),
    // The standalone page as well as the page about it. They are different
    // documents at different URLs and either can break on its own.
    ...slugsIn('templates').map(s => `/template-demos/${s}/index.html`)
  ]
}

async function check(browser: Browser, route: string) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const problems: string[] = []
  const keep = (text: string) => {
    if (NOT_OURS.some(noise => text.includes(noise))) return
    if (!problems.includes(text)) problems.push(text)
  }

  page.on('pageerror', e => keep(`uncaught: ${e.message.split('\n')[0]}`))
  page.on('console', m => {
    if (m.type() === 'error') keep(`console: ${m.text().split('\n')[0]}`)
  })
  page.on('requestfailed', r => keep(`dead request: ${r.url().replace(ORIGIN, '')}`))
  page.on('response', r => {
    if (r.status() >= 400) keep(`HTTP ${r.status()}: ${r.url().replace(ORIGIN, '')}`)
  })

  try {
    await page.goto(ORIGIN + route, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    await page.evaluate(() => document.fonts.ready)
    // Long enough for a module to import and an effect to mount and throw.
    await page.waitForTimeout(1200)
  } catch (error) {
    keep(`load failed: ${error instanceof Error ? error.message.split('\n')[0] : error}`)
  }

  await page.close()
  return { route, problems: problems.slice(0, 4) }
}

async function main() {
  await ensureServer()
  const list = routes()
  const filter = process.argv.slice(2).filter(a => !/^[A-Za-z]:/.test(a))
  const wanted = filter.length ? list.filter(r => filter.some(f => r.includes(f))) : list

  console.log(`sweeping ${wanted.length} routes\n`)
  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-unsafe-swiftshader', '--enable-gpu', '--ignore-gpu-blocklist']
  })

  const results: { route: string; problems: string[] }[] = []
  try {
    for (let i = 0; i < wanted.length; i += AT_ONCE) {
      const batch = wanted.slice(i, i + AT_ONCE)
      results.push(...(await Promise.all(batch.map(route => check(browser, route)))))
      process.stdout.write(`  ${Math.min(i + AT_ONCE, wanted.length)}/${wanted.length}\r`)
    }
  } finally {
    await browser.close()
  }

  const broken = results.filter(r => r.problems.length > 0)
  console.log(`\n`)
  for (const { route, problems } of broken) {
    console.log(route)
    for (const problem of problems) console.log(`    ${problem}`)
  }
  console.log(
    broken.length === 0
      ? `all ${results.length} pages clean`
      : `\n${broken.length} of ${results.length} pages have something to say`
  )
  process.exitCode = broken.length === 0 ? 0 : 1
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
