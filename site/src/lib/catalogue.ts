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
 * tag; it writes {{PIN}} and this resolves it. A build with no tags at all falls
 * back to the commit SHA, which is still immutable. The one thing a prompt URL
 * must never be is `main`.
 */
export function resolvePin(): string {
  const fromEnv = process.env['BEAMISH_PIN']
  if (fromEnv) return fromEnv
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
