/*
 * The examples catalogue.
 *
 * Read straight from examples/*\/meta.json, like grids and for the same
 * reason: there is nothing to derive. An example has no prompt to compose and
 * no defaults to check against a core, because nobody pastes a brand site.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { exampleMetaSchema, type ExampleMeta } from '../../../tools/schema/meta'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '..', '..', '..')
const EXAMPLES = path.join(ROOT, 'examples')

export type Example = ExampleMeta

export function loadExamples(): Example[] {
  if (!existsSync(EXAMPLES)) return []
  const out: Example[] = []
  for (const entry of readdirSync(EXAMPLES, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue
    const metaPath = path.join(EXAMPLES, entry.name, 'meta.json')
    if (!existsSync(metaPath)) continue

    const parsed = exampleMetaSchema.safeParse(JSON.parse(readFileSync(metaPath, 'utf8')))
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map(issue => `    ${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n')
      throw new Error(`examples/${entry.name}/meta.json is invalid:\n${detail}`)
    }
    if (parsed.data.slug !== entry.name) {
      throw new Error(`examples/${entry.name}: slug is "${parsed.data.slug}"`)
    }
    out.push(parsed.data)
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug))
}

/** Which media exist, so a card never renders a broken video. */
export function loadExampleMedia(slug: string) {
  const dir = path.join(EXAMPLES, slug, 'media')
  const at = (name: string) =>
    existsSync(path.join(dir, name)) ? `/media/${slug}/${name}` : null
  return {
    poster: at('poster.jpg'),
    mp4: at('16x9.mp4'),
    webm: at('16x9.webm')
  }
}
