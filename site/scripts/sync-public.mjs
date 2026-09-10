/*
 * Copies recorded media and the shared fonts into site/public.
 *
 * Media is committed next to the item it belongs to, because that is where it is
 * regenerated from and where a reviewer expects to find it. Astro serves
 * public/. Rather than teach one of them about the other, this runs before dev
 * and before build. The copies are gitignored.
 */

import { cp, mkdir, rm, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '..', '..')
const PUBLIC = path.join(here, '..', 'public')

await rm(path.join(PUBLIC, 'media'), { recursive: true, force: true })
await mkdir(path.join(PUBLIC, 'media'), { recursive: true })

let copied = 0
for (const group of ['effects', 'components']) {
  const base = path.join(ROOT, group)
  if (!existsSync(base)) continue
  for (const entry of await readdir(base, { withFileTypes: true })) {
    const media = path.join(base, entry.name, 'media')
    if (!entry.isDirectory() || !existsSync(media)) continue
    await cp(media, path.join(PUBLIC, 'media', entry.name), { recursive: true })
    copied += 1
  }
}

await mkdir(path.join(PUBLIC, 'fonts'), { recursive: true })
await cp(path.join(ROOT, 'shared', 'fonts'), path.join(PUBLIC, 'fonts'), { recursive: true })

console.log(`sync-public: ${copied} item(s) with media, fonts copied`)
