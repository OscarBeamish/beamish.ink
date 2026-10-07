/*
 * The grids catalogue.
 *
 * Read straight from grids/*\/meta.json rather than from .generated, because a
 * grid has no prompt to compose out of shader sources and no defaults to check
 * against a core: meta.json is the source of truth and there is nothing to
 * derive from it. The effects pipeline earns its generate step; this does not.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gridMetaSchema, type GridMeta } from '../../../tools/schema/meta'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '..', '..', '..')
const GRIDS = path.join(ROOT, 'grids')

export type Grid = GridMeta

export function loadGrids(): Grid[] {
  if (!existsSync(GRIDS)) return []
  const grids: Grid[] = []
  for (const entry of readdirSync(GRIDS, { withFileTypes: true })) {
    // _media holds the shared photographs and is not an item.
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue
    const metaPath = path.join(GRIDS, entry.name, 'meta.json')
    if (!existsSync(metaPath)) continue

    const parsed = gridMetaSchema.safeParse(JSON.parse(readFileSync(metaPath, 'utf8')))
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map(issue => `    ${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n')
      throw new Error(`grids/${entry.name}/meta.json is invalid:\n${detail}`)
    }
    if (parsed.data.slug !== entry.name) {
      throw new Error(`grids/${entry.name}: slug is "${parsed.data.slug}"`)
    }
    grids.push(parsed.data)
  }
  return grids.sort((a, b) => a.slug.localeCompare(b.slug))
}

/** Which media exist, so a card never renders a broken <video>. */
export function loadGridMedia(slug: string) {
  const dir = path.join(GRIDS, slug, 'media')
  const at = (name: string) =>
    existsSync(path.join(dir, name)) ? `/media/${slug}/${name}` : null
  return {
    poster: at('poster.jpg'),
    mp4: at('16x9.mp4'),
    webm: at('16x9.webm')
  }
}

/** The stylesheet itself, which is the whole of what a paste copies. */
export function loadGridSource(slug: string): string {
  return readFileSync(path.join(GRIDS, slug, 'grid.css'), 'utf8').trimEnd()
}

export const GRID_CATEGORY_LABELS: Record<Grid['category'], string> = {
  editorial: 'Editorial',
  tiles: 'Tiles',
  baseline: 'Baseline',
  asymmetric: 'Asymmetric',
  marginalia: 'Marginalia',
  overlap: 'Overlap',
  masonry: 'Masonry'
}
