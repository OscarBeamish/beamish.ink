/*
 * Builds each item's demo.bundle.js.
 *
 * demo.html has no build step of its own by design. It has to be openable from
 * disk and screenshot-able by the recorder without a dev server in the way. That
 * means the TypeScript has to be compiled to a plain script first, which is this.
 *
 * Output is gitignored. It is a build artefact, reproducible from source.
 */

import { build } from 'esbuild'
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export type ItemRef = { slug: string; dir: string; tier: 1 | 2 }

export async function listItems(): Promise<ItemRef[]> {
  const items: ItemRef[] = []
  for (const [group, tier] of [
    ['effects', 1],
    ['components', 2]
  ] as const) {
    const base = path.join(ROOT, group)
    if (!existsSync(base)) continue
    for (const entry of await readdir(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = path.join(base, entry.name)
      if (!existsSync(path.join(dir, 'meta.json'))) continue
      items.push({ slug: entry.name, dir, tier })
    }
  }
  return items.sort((a, b) => a.slug.localeCompare(b.slug))
}

/**
 * Tier 1 exposes the imperative handle directly. Tier 2 is a React component, so
 * the bundle exposes a mount/unmount pair over a root instead. Same shape of
 * contract for the recorder, different thing underneath. This is the one place
 * the two tiers are deliberately bridged, and it is a build detail, not runtime.
 */
function entryFor(item: ItemRef): string {
  if (item.tier === 1) {
    return `
      import create from './core'
      window.Beamish = {
        tier: 1,
        create: (el, opts) => create(el, opts)
      }
    `
  }
  return `
    import { createElement } from 'react'
    import { createRoot } from 'react-dom/client'
    import Component from './react'
    window.Beamish = {
      tier: 2,
      mount: (el, props) => {
        const root = createRoot(el)
        root.render(createElement(Component, props ?? {}))
        return { unmount: () => root.unmount() }
      }
    }
  `
}

export async function buildItem(item: ItemRef): Promise<void> {
  await build({
    stdin: {
      contents: entryFor(item),
      resolveDir: item.dir,
      loader: 'tsx',
      sourcefile: `${item.slug}-demo-entry.tsx`
    },
    outfile: path.join(item.dir, 'demo.bundle.js'),
    bundle: true,
    format: 'iife',
    target: 'es2022',
    platform: 'browser',
    // Demos are for looking at, not shipping. Readable output makes a broken
    // shader far quicker to diagnose in devtools.
    minify: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"development"' }
  })
}

async function main() {
  const only = process.argv.slice(2).filter(arg => !arg.startsWith('-'))
  const items = (await listItems()).filter(item => only.length === 0 || only.includes(item.slug))
  if (items.length === 0) {
    console.error(only.length ? `No item matched: ${only.join(', ')}` : 'No items found')
    process.exit(1)
  }
  for (const item of items) {
    await buildItem(item)
    const bytes = (await readFile(path.join(item.dir, 'demo.bundle.js'))).byteLength
    console.log(`  ${item.slug.padEnd(14)} ${(bytes / 1024).toFixed(1)} kB`)
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  await main()
}
