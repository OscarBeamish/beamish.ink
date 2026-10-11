/*
 * Every tier-1 item is in the demo panel's registry, under its own slug.
 *
 * AGENTS.md calls the registry the step that gets forgotten, and describes the
 * failure exactly: an item missing from it builds, passes the typecheck,
 * generates a prompt, renders its page and mounts nothing at all, with no
 * error anywhere. The only sign is an empty panel.
 *
 * This test exists because that happened by a route the warning does not
 * cover. PaperGrain was registered, correctly, under the name it had before it
 * shipped: the key said `tooth`. The lookup is EFFECTS[slug], so it never
 * matched, and the panel on its page had been mounting nothing for as long as
 * the item had been called PaperGrain. Forgetting the step is one way to get
 * there; renaming the item is another, and renaming leaves a line in the file
 * that looks right.
 *
 * Reading the registry as text rather than importing it, because it lives in
 * an .astro component's frontmatter and the keys are what is being checked
 * rather than the imports they point at.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PANEL = path.join(ROOT, 'site', 'src', 'components', 'DemoPanel.astro')

function tierOneSlugs(): string[] {
  const dir = path.join(ROOT, 'effects')
  const slugs: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const meta = path.join(dir, entry.name, 'meta.json')
    if (!existsSync(meta)) continue
    const parsed = JSON.parse(readFileSync(meta, 'utf8')) as { slug: string; tier: number }
    if (parsed.tier === 1) slugs.push(parsed.slug)
  }
  return slugs.sort()
}

describe('the demo panel registry', () => {
  const source = readFileSync(PANEL, 'utf8')

  it('has an entry for every tier-1 item, keyed by slug', () => {
    const missing = tierOneSlugs().filter(slug => {
      /* Quoted or bare, since a slug with no hyphen in it needs no quotes. */
      return !(
        source.includes(`'${slug}':`) ||
        new RegExp(`(^|[\\s{,])${slug}:`, 'm').test(source)
      )
    })
    expect(missing).toEqual([])
  })

  it('imports each entry from the item its key names', () => {
    /*
     * The other half of the same fault. A key can match the slug and still
     * point at the wrong core, which is what a copied line does, and that
     * mounts the wrong item rather than nothing: harder to notice, because the
     * panel does show something.
     */
    const wrong: string[] = []
    for (const match of source.matchAll(
      /'([a-z0-9-]+)':\s*\(\)\s*=>\s*import\('@items\/effects\/([a-z0-9-]+)\/core'\)/g
    )) {
      const [, key, imported] = match
      if (key !== imported) wrong.push(`${key} imports ${imported}`)
    }
    expect(wrong).toEqual([])
  })
})
