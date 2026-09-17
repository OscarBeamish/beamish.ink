/*
 * Fetch every file every prompt asks for, at the pin the site is about to ship,
 * and fail on anything that is not a 200.
 *
 * This exists because the pin broke silently twice. A prompt is a list of raw
 * GitHub URLs; if the tag does not contain one of those files the agent gets a
 * 404 and the paste fails, but nothing about the site looks wrong, because the
 * site never fetches them. The only way to know is to ask GitHub.
 *
 * Run it after pushing a tag. Before the tag is pushed it will fail, correctly,
 * because the tag does not exist yet.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadItems, REPO } from '../generate/index.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function resolvePin(): string {
  const fromArg = process.argv.slice(2).find(arg => !arg.startsWith('-'))
  if (fromArg) return fromArg
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    version?: string
  }
  if (!pkg.version) throw new Error('package.json has no version, so there is no pin to verify')
  return `v${pkg.version}`
}

const pin = resolvePin()
const items = await loadItems()

/*
 * Every file every item copies, plus the runtime, which is fetched by every
 * tier 1 prompt and belongs to no single item. A Set because most items list
 * the same shared files.
 */
const paths = new Set<string>(['shared/runtime.ts', 'shared/tokens.css'])
for (const item of items) {
  for (const file of item.meta.files) paths.add(file.from)
}

const base = `https://raw.githubusercontent.com/${REPO}/${pin}`

console.log(`verifying ${paths.size} file(s) at ${pin}\n`)

const missing: string[] = []

// Serial on purpose. This runs once per release against a CDN that rate-limits,
// and forty requests take about four seconds.
for (const file of [...paths].sort()) {
  const url = `${base}/${file}`
  let status: number | string
  try {
    const response = await fetch(url, { method: 'HEAD' })
    status = response.status
  } catch (error) {
    status = error instanceof Error ? error.message : 'request failed'
  }

  if (status === 200) continue
  missing.push(`${file}  ${status}`)
}

if (missing.length === 0) {
  console.log(`  all ${paths.size} file(s) resolve at ${pin}`)
  process.exit(0)
}

console.error(`\n  ${missing.length} of ${paths.size} file(s) are not in ${pin}:\n`)
for (const line of missing) console.error(`    ${line}`)
console.error(
  [
    '',
    '  Every prompt for those items 404s when it is pasted.',
    '  Either the tag was cut before the files existed, or it was never pushed.',
    '  Cut a tag from the current commit and let the site rebuild.',
    ''
  ].join('\n')
)
process.exit(1)
