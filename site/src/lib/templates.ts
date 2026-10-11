/*
 * The templates catalogue.
 *
 * The metadata is read straight from templates/*\/meta.json, like grids: there
 * are no options to derive and no defaults to check against a core.
 *
 * There is a prompt, though, and there did not used to be. While these were
 * examples the comment here said nobody pastes a brand site, which was true of
 * an example and is the whole point of a template.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { templateMetaSchema, type TemplateMeta } from '../../../tools/schema/meta'
import { PIN } from './catalogue'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '..', '..', '..')
const TEMPLATES = path.join(ROOT, 'templates')
const GENERATED = path.join(ROOT, '.generated')

export type Template = TemplateMeta

/*
 * The front of the wall, chosen rather than sorted.
 *
 * Alphabetical order put ClayConstellation and ClaySurfaces in the first two
 * slots because of the letter they start with, which is not a reason. These
 * eight are the ones worth meeting first, in this order, and everything after
 * them stays alphabetical: a named order is a judgement that has to be
 * maintained, and there is no judgement to express about the twelfth card.
 *
 * It lives in the loader rather than in the page so the wall and the front
 * door agree. A reader who sees a different first template on each is being
 * told the order means nothing.
 */
const WALL_FRONT = [
  'editorial-portfolio',
  'glossy-orbs',
  'holographic-ticket',
  'refracted-glass',
  'squircle-keycaps',
  'wind-field-routing',
  'icon-cut-cards',
  'highlighter-markup'
]

function byWallOrder(a: Template, b: Template) {
  const at = WALL_FRONT.indexOf(a.slug)
  const bt = WALL_FRONT.indexOf(b.slug)
  if (at !== -1 && bt !== -1) return at - bt
  if (at !== -1) return -1
  if (bt !== -1) return 1
  return a.slug.localeCompare(b.slug)
}

export function loadTemplates(): Template[] {
  if (!existsSync(TEMPLATES)) return []
  const out: Template[] = []
  for (const entry of readdirSync(TEMPLATES, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue
    const metaPath = path.join(TEMPLATES, entry.name, 'meta.json')
    if (!existsSync(metaPath)) continue

    const parsed = templateMetaSchema.safeParse(JSON.parse(readFileSync(metaPath, 'utf8')))
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map(issue => `    ${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n')
      throw new Error(`templates/${entry.name}/meta.json is invalid:\n${detail}`)
    }
    if (parsed.data.slug !== entry.name) {
      throw new Error(`templates/${entry.name}: slug is "${parsed.data.slug}"`)
    }
    out.push(parsed.data)
  }
  /*
   * A slug in WALL_FRONT that no longer exists would sort to the back of the
   * list silently, which is the same symptom as a rename nobody noticed. Said
   * out loud instead, the way an invalid meta.json is.
   */
  const missing = WALL_FRONT.filter(slug => !out.some(template => template.slug === slug))
  if (missing.length > 0) {
    throw new Error(`templates: WALL_FRONT names ${missing.join(', ')}, which do not exist`)
  }

  return out.sort(byWallOrder)
}

/** Which media exist, so a card never renders a broken video. */
export function loadTemplateMedia(slug: string) {
  const dir = path.join(TEMPLATES, slug, 'media')
  const at = (name: string) =>
    existsSync(path.join(dir, name)) ? `/media/${slug}/${name}` : null
  return {
    poster: at('poster.jpg'),
    mp4: at('16x9.mp4'),
    webm: at('16x9.webm')
  }
}

/**
 * The prompt that builds a template, with the pin resolved.
 *
 * One variant, not two. An item ships a second prompt with its source pasted
 * in, for agents with no web access; a template is four of its own files plus
 * a dozen library ones, so there is nothing sane to inline and the card shows
 * one button rather than one button and a dead one.
 */
export function loadTemplatePrompt(slug: string): string {
  const file = path.join(GENERATED, slug, 'prompt.md')
  if (!existsSync(file)) {
    throw new Error(`${slug}: prompt.md is missing. Run \`pnpm generate\``)
  }
  return readFileSync(file, 'utf8').replaceAll('{{PIN}}', PIN)
}
