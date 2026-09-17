/*
 * Everything the site knows about an item comes from here, and everything here
 * comes from .generated, which comes from meta.json and recipe.md. Nothing on a
 * page is hand-maintained a second time.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Meta } from '../../../tools/schema/meta'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const GENERATED = path.join(ROOT, '.generated')

export type Item = Meta & {
  group: 'effects' | 'components'
  intro: string
}

/**
 * The tag every prompt on this build points at.
 *
 * The release order is generate → tag → build, so the generator cannot know the
 * tag; it writes {{PIN}} and this resolves it. The one thing a prompt URL must
 * never be is `main`.
 *
 * The version in package.json is the source of truth, because it is the only
 * one that travels with the commit. `git describe` looked like the obvious
 * answer and it is the wrong one: a host that shallow-clones has no tags, so it
 * fell through to a commit SHA, the URLs still resolved, nothing errored, and
 * the mistake only surfaced when somebody pasted a prompt. This build of the
 * site knows its own version whatever the host did to the checkout.
 */
export function resolvePin(): string {
  // An escape hatch for building a preview against some other tag. Nothing in
  // the normal release path sets it.
  const fromEnv = process.env['BEAMISH_PIN']
  if (fromEnv) return fromEnv

  try {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      version?: string
    }
    if (pkg.version) return `v${pkg.version}`
  } catch {
    // Falls through to git below.
  }

  try {
    return execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
      cwd: ROOT,
      encoding: 'utf8'
    }).trim()
  } catch {
    try {
      return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
    } catch {
      return 'main'
    }
  }
}

export const PIN = resolvePin()

/*
 * Only reachable if package.json has lost its version, which would mean the
 * pin has fallen through to a SHA or to `main`. Loud, because the URLs would
 * still resolve and nothing else would complain.
 */
if (!/^v[0-9]+\.[0-9]+\.[0-9]+/.test(PIN)) {
  console.warn(
    [
      '',
      `  Prompts are pinning to "${PIN}", which is not a version tag.`,
      '  package.json needs a version field. See DEPLOY.md.',
      ''
    ].join('\n')
  )
}

export function loadCatalogue(): Item[] {
  const indexPath = path.join(GENERATED, 'index.json')
  if (!existsSync(indexPath)) {
    throw new Error('.generated/index.json is missing. Run `pnpm generate` first')
  }
  return JSON.parse(readFileSync(indexPath, 'utf8')) as Item[]
}

/** Both prompt variants for an item, with the pin already substituted. */
export function loadPrompts(slug: string): { linked: string; inlined: string } {
  const read = (name: string) => {
    const file = path.join(GENERATED, slug, name)
    if (!existsSync(file)) throw new Error(`${slug}: ${name} is missing. Run \`pnpm generate\``)
    return readFileSync(file, 'utf8').replaceAll('{{PIN}}', PIN)
  }
  return { linked: read('prompt.md'), inlined: read('prompt.inline.md') }
}

/** Which media files actually exist, so a page never renders a broken <video>. */
export function loadMedia(item: Item) {
  const dir = path.join(ROOT, item.group, item.slug, 'media')
  const at = (name: string) =>
    existsSync(path.join(dir, name)) ? `/media/${item.slug}/${name}` : null
  return {
    poster: at('poster.jpg'),
    mp4: at('16x9.mp4'),
    webm: at('16x9.webm')
  }
}

export const CATEGORY_ORDER = [
  'backdrops',
  'reveals',
  'pointer',
  'type',
  'surfaces',
  'navigation'
] as const
