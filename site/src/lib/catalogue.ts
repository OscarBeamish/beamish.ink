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
  const items = JSON.parse(readFileSync(indexPath, 'utf8')) as Item[]

  /*
   * A slug in WALL_ORDER that no longer exists sorts nothing and says
   * nothing, which is the same symptom as a rename nobody noticed. Said out
   * loud, the way an invalid meta.json is.
   */
  const have = new Set(items.map(item => item.slug))
  const missing = WALL_ORDER.filter(slug => !have.has(slug))
  if (missing.length > 0) {
    throw new Error(`catalogue: WALL_ORDER names ${missing.join(', ')}, which do not exist`)
  }

  const last = WALL_ORDER.length
  return items.sort((a, b) => {
    const section = (CATEGORY_RANK.get(a.category) ?? 99) - (CATEGORY_RANK.get(b.category) ?? 99)
    if (section !== 0) return section
    const rank = (WALL_RANK.get(a.slug) ?? last) - (WALL_RANK.get(b.slug) ?? last)
    return rank !== 0 ? rank : a.slug.localeCompare(b.slug)
  })
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

export type CardMedia = {
  poster: string | null
  mp4: string | null
  webm: string | null
}

/**
 * Which media files actually exist, so a page never renders a broken <video>.
 *
 * One take per item. There used to be a second against the other ground,
 * which the cards swapped to when the theme toggle moved; that behaviour is
 * gone, because a toggle that turns a third of the wall into different
 * effects is not what a theme toggle is for. Nothing read the second take
 * after that, so loading it was building a path for a file no page asked for.
 */
export function loadMedia(item: Item): CardMedia {
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

/*
 * The order of the wall, chosen rather than sorted.
 *
 * It was alphabetical, which is not an order so much as the absence of one:
 * AsciiImage led the surfaces because of its first letter, and the first
 * thing anybody saw of the library was whatever happened to start with an A.
 *
 * Grouped by CATEGORY_ORDER and ranked inside each group, and the ranking is
 * a judgement made by looking at the posters as a contact sheet rather than
 * at the items one at a time. A wall is read as a wall: what earns the top of
 * a section is a card that survives being two inches wide, which is not the
 * same quality as being a good effect. PaperGrain is a fine item and a nearly
 * blank rectangle at card size, so it goes last among the backdrops and loses
 * nothing by it.
 *
 * The first five backdrops are set deliberately and are the first five things
 * anybody sees of this library.
 *
 * An item not named here falls to the end of its own category, alphabetically,
 * so adding one never breaks the build. It does mean a new item arrives at the
 * bottom of its section until somebody decides where it belongs, which is the
 * right default: a position on this wall is a claim about the item.
 */
export const WALL_ORDER: string[] = [
  // Backdrops
  'mesh-gradient',
  'water-caustics',
  'stipple-field',
  'halftone-backdrop',
  'metaball-field',
  'prism-spectrum',
  'wind-field',
  'chrome-form',
  'terrain-relief',
  'marbled-paper',
  'moire-screens',
  'cast-shadow-scene',
  'lightning-vein',
  'aurora-curtain',
  'guilloche-lines',
  'woven-threads',
  'light-shafts',
  'translucent-sheets',
  'dust-motes',
  'paper-grain',

  // Reveals
  'halftone-reveal',
  'iris-reveal',
  'masked-heading',
  'gradual-blur',
  'scroll-reveal-rows',

  // Pointer
  'pointer-lit-busts',
  'pointer-ripple-grid',
  'pointer-filings',
  'crosshair-cursor',
  'click-spark',
  'variable-weight-text',
  'magnetic-button',
  'pointer-smoke',

  // Type
  'split-fountain-text',
  'highlighter-mark',
  'split-flap-text',
  'stroke-text',
  'misprint-text',
  'rotating-words',
  'circular-text',
  'embossed-text',
  'odometer-number',
  'count-up-number',
  'decode-text',
  'scramble-text',
  'typewriter-text',
  'scroll-marquee',
  'ink-bleed-text',
  'falling-letters',

  // Surfaces
  'halftone-magnifier',
  'glass-search-bar',
  'panel-gauge',
  'relight-image',
  'image-gallery-lightbox',
  'depth-point-cloud',
  'scroll-warp-image',
  'scroll-slideshow',
  'squircle-keycap',
  'card-stack',
  'ascii-image',
  'spotlight-card',
  'tilt-card',
  'ember-rise',

  // Navigation
  'glass-nav',
  'expanding-tiles',
  'fullscreen-menu',
  'sheen-button'
]

const CATEGORY_RANK = new Map(CATEGORY_ORDER.map((category, i) => [category, i]))
const WALL_RANK = new Map(WALL_ORDER.map((slug, i) => [slug, i]))
