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
for (const group of ['effects', 'components', 'grids', 'examples']) {
  const base = path.join(ROOT, group)
  if (!existsSync(base)) continue
  for (const entry of await readdir(base, { withFileTypes: true })) {
    const media = path.join(base, entry.name, 'media')
    if (!entry.isDirectory() || !existsSync(media)) continue
    await cp(media, path.join(PUBLIC, 'media', entry.name), { recursive: true })
    copied += 1
  }
}

/*
 * Demo photographs, for the two items whose demos need real pictures rather
 * than a canvas they fill themselves. Copied rather than duplicated in the
 * repo, so the standalone demo page and the site panel read the same files.
 */
await rm(path.join(PUBLIC, 'plates'), { recursive: true, force: true })
for (const group of ['effects', 'components']) {
  const base = path.join(ROOT, group)
  if (!existsSync(base)) continue
  for (const entry of await readdir(base, { withFileTypes: true })) {
    const plates = path.join(base, entry.name, 'demo-plates')
    if (!entry.isDirectory() || !existsSync(plates)) continue
    await cp(plates, path.join(PUBLIC, 'plates', entry.name), { recursive: true })
  }
}

/*
 * Grid demos, served whole.
 *
 * A grid is a stylesheet and a page using it, and the page is the product: it
 * is shown on the site in an iframe rather than rebuilt in Astro, because the
 * demo sets its own custom properties on :root and lays out full-bleed bands.
 * Rendered inside the site's own document those two would fight, and what the
 * reader saw would not be what the prompt hands out.
 *
 * The shared stylesheets go with them, because the demo links them by the same
 * relative path it uses on disk, and fonts.css asks for ./fonts.
 */
await rm(path.join(PUBLIC, 'grid-demos'), { recursive: true, force: true })
const gridsDir = path.join(ROOT, 'grids')
if (existsSync(gridsDir)) {
  for (const entry of await readdir(gridsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dest = path.join(PUBLIC, 'grid-demos', entry.name)
    await cp(path.join(gridsDir, entry.name), dest, { recursive: true })
    /*
     * Served as a directory index rather than by its own name.
     *
     * Astro normalises a request for `/x.html` by redirecting to `/x`, which
     * then does not exist: an iframe pointed at demo.html gets a redirect and
     * a 404. A directory URL sidesteps the rewrite entirely, and the relative
     * paths inside the page are unchanged because it sits at the same depth.
     */
    if (existsSync(path.join(dest, 'demo.html'))) {
      await cp(path.join(dest, 'demo.html'), path.join(dest, 'index.html'))
    }
  }
  await mkdir(path.join(PUBLIC, 'shared'), { recursive: true })
  for (const file of ['tokens.css', 'fonts.css']) {
    await cp(path.join(ROOT, 'shared', file), path.join(PUBLIC, 'shared', file))
  }
  await cp(path.join(ROOT, 'shared', 'fonts'), path.join(PUBLIC, 'shared', 'fonts'), {
    recursive: true
  })
}

/*
 * Examples, served whole, with the library files they link.
 *
 * An example is a standalone page: it has its own head, its own chrome and no
 * site furniture, because the whole point is that it reads as somebody's own
 * site. It links the library by the same relative paths it uses on disk, so
 * the public tree has to mirror the repo for those paths to resolve:
 * ../../shared and ../../grids from examples/<slug>/.
 *
 * grids/ is copied here as well as to grid-demos/. The two serve different
 * jobs and must not be merged: grid-demos carries an index.html per grid so a
 * directory URL works, and an index.html under /grids/<slug>/ would collide
 * with the Astro route that already generates one.
 */
await rm(path.join(PUBLIC, 'examples'), { recursive: true, force: true })
await rm(path.join(PUBLIC, 'grids'), { recursive: true, force: true })
const examplesDir = path.join(ROOT, 'examples')
if (existsSync(examplesDir)) {
  for (const entry of await readdir(examplesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    await cp(
      path.join(examplesDir, entry.name),
      path.join(PUBLIC, 'examples', entry.name),
      { recursive: true }
    )
  }
  if (existsSync(gridsDir)) {
    await cp(gridsDir, path.join(PUBLIC, 'grids'), { recursive: true })
  }
}

await mkdir(path.join(PUBLIC, 'fonts'), { recursive: true })
await cp(path.join(ROOT, 'shared', 'fonts'), path.join(PUBLIC, 'fonts'), { recursive: true })

console.log(`sync-public: ${copied} item(s) with media, fonts copied`)
