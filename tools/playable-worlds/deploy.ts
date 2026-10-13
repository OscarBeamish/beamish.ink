/*
 * Put the Playable Worlds mirror on a live URL, without putting it in git.
 *
 * The mirror is 717MB and gitignored, so Cloudflare cannot build this page
 * from the repo: a Git build clones the source, finds no games.json, and ships
 * the "mirror is not on this machine" notice. The only way the assets reach a
 * CDN is to upload a build that already has them, from the machine that has
 * them.
 *
 * So this is a direct upload to a Pages project of its own, deliberately not
 * the beamish.ink project. Two reasons. The live site keeps building itself
 * from main the way it always has, with nothing 717MB in the way. And a
 * project of its own can carry a blanket noindex, which the real site must
 * never have.
 *
 * Cloudflare Pages caps a deployment at 20,000 files and 25MiB per file. The
 * build is about 2,600 files and the largest is a 22.7MB glb, so it fits, but
 * the check below runs anyway because the day it stops fitting the failure
 * would otherwise arrive halfway through a one gigabyte upload.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const DIST = path.join(ROOT, 'site', 'dist')
const PROJECT = process.env.PW_PROJECT ?? 'beamish-worlds-mirror'

/* Cloudflare's published limits, as of the last deploy. */
const MAX_FILES = 20000
const MAX_BYTES = 25 * 1024 * 1024

function fail(message: string): never {
  console.error(`\n${message}\n`)
  process.exit(1)
}

/* --- 1. is there a build, and does it have the mirror in it --- */

if (!fs.existsSync(DIST)) fail('No site/dist. Run `pnpm build` first.')

const manifest = path.join(DIST, 'playable-worlds', 'games.json')
if (!fs.existsSync(manifest)) {
  fail(
    'site/dist has no playable-worlds/games.json.\n' +
      'The build ran without the mirror, so the deployed page would show the\n' +
      '"not on this machine" notice. Run `python tools/playable-worlds/mirror.py`\n' +
      'to fetch it into site/public/playable-worlds, then `pnpm build` again.'
  )
}

/* --- 2. does it fit --- */

let files = 0
let bytes = 0
let biggest = { file: '', size: 0 }

function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    const { size } = fs.statSync(full)
    files += 1
    bytes += size
    if (size > biggest.size) biggest = { file: path.relative(DIST, full), size }
  }
}
walk(DIST)

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`
console.log(`build: ${files} files, ${mb(bytes)}`)
console.log(`largest: ${biggest.file}, ${mb(biggest.size)}`)

if (files > MAX_FILES) {
  fail(`${files} files, over the Cloudflare Pages limit of ${MAX_FILES}.`)
}
if (biggest.size > MAX_BYTES) {
  fail(
    `${biggest.file} is ${mb(biggest.size)}, over the Cloudflare Pages limit of ${mb(MAX_BYTES)}.\n` +
      'Shrink it or drop that game from the mirror.'
  )
}

/* --- 3. noindex, on everything, for this deployment only --- */

/*
 * The header rather than a robots.txt Disallow, and this is the one part worth
 * being careful about. Disallow stops a crawler fetching the page at all,
 * which also stops it reading the noindex, so a URL somebody links to can
 * still end up listed with no description. Letting the crawler in and telling
 * it noindex is the combination Google documents as the one that actually
 * keeps a page out.
 *
 * It is written into dist rather than into site/public, because site/public is
 * the real site and the real site must never carry this header. dist is
 * rebuilt from scratch every time, so there is nothing to undo.
 */
const headersFile = path.join(DIST, '_headers')
const original = fs.existsSync(headersFile) ? fs.readFileSync(headersFile, 'utf8') : ''

if (!original.includes('X-Robots-Tag')) {
  const marker = '/*\n'
  const at = original.lastIndexOf(marker)
  const line = '  X-Robots-Tag: noindex, nofollow, noarchive\n'
  const patched =
    at === -1
      ? `${original}\n/*\n${line}`
      : `${original.slice(0, at + marker.length)}${line}${original.slice(at + marker.length)}`
  fs.writeFileSync(headersFile, patched)
  console.log('noindex: added to the /* block in dist/_headers')
} else {
  console.log('noindex: already in dist/_headers')
}

/* --- 4. the root of this host is the site, not the page --- */

/*
 * No root redirect, and it was tried the other way first.
 *
 * Sending `/` to /playable-worlds makes the URL to say out loud the bare
 * subdomain, which is tidy, and it costs more than it buys: it swallows
 * /index.html as well, so the front door is unreachable on this host and the
 * logo in the nav lands a reader back on the mirror they were trying to leave.
 *
 * The whole build goes up, so what this host is is a copy of the site with one
 * extra page in it, and that page is reached the way every other page is.
 */
const stale = path.join(DIST, '_redirects')
if (fs.existsSync(stale)) {
  fs.unlinkSync(stale)
  console.log('root: redirect removed')
}

/* --- 5. the project has to exist before anything can be pushed into it --- */

/*
 * `pages deploy` against a project that does not exist offers to create one,
 * which is a prompt, and a prompt is a hang when nobody is at the terminal.
 * So ask first and create it explicitly. Both commands are harmless to repeat.
 *
 * `--force` on the create is not optional. Wrangler now hands `pages` over to
 * the Workers version of Pages, which starts by working out what kind of
 * application it is looking at, and in the root of a pnpm workspace it refuses
 * on the grounds that it found a workspace rather than a project. There is no
 * project to point it at: what is being uploaded is a directory of built
 * files, not an application. `--force` keeps it on the older Pages API, which
 * only wants the directory.
 *
 * It belongs on the create alone. Once the project exists wrangler stops
 * delegating and says so, and passing it to the deploy as well is the kind of
 * flag that gets copied forward until somebody wonders what it was for.
 */
const wrangler = (args: string[], capture = false) =>
  spawnSync('npx', ['wrangler', ...args], {
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32'
  })

const list = wrangler(['pages', 'project', 'list'], true)
if (list.status !== 0) {
  fail(
    `Could not reach Cloudflare.\n${(list.stderr ?? '').trim()}\n\n` +
      'If it says you are not authenticated, run `npx wrangler login`.'
  )
}

if (!(list.stdout ?? '').includes(PROJECT)) {
  console.log(`\ncreating the Pages project ${PROJECT}`)
  const made = wrangler([
    'pages',
    'project',
    'create',
    PROJECT,
    '--production-branch=main',
    '--force'
  ])
  if (made.status !== 0) fail(`Could not create ${PROJECT}.`)
}

/* --- 6. upload --- */

console.log(`\nuploading to ${PROJECT}.pages.dev, this takes a while at ${mb(bytes)}\n`)

const run = spawnSync(
  'npx',
  [
    'wrangler',
    'pages',
    'deploy',
    DIST,
    `--project-name=${PROJECT}`,
    /*
     * Named so the dashboard does not call it a preview of some branch that
     * does not exist. This project has one deployment that matters and it is
     * whatever went up last.
     */
    '--branch=main',
    '--commit-dirty=true'
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' }
)

process.exit(run.status ?? 1)
