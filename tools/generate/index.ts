/*
 * pnpm generate rebuilds everything derived from meta.json and recipe.md.
 *
 *   1. validates every meta.json against tools/schema
 *   2. syncs shader sources into the core.ts blocks that publish them
 *   3. writes .generated/<slug>/prompt.md and prompt.inline.md
 *   4. writes .generated/index.json, which the site reads
 *
 * `--check` writes nothing and exits non-zero if any output would change, so a
 * stale prompt cannot be committed.
 *
 * Prompts are written with a {{PIN}} placeholder rather than a tag. The release
 * order is generate → tag → build, so at generate time the tag we want does not
 * exist yet; the site build resolves the placeholder from `git describe`. Pass
 * --pin to bake a real tag in, which is what the paste-test does.
 */

import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  metaSchema,
  gridMetaSchema,
  CATEGORY_LABELS,
  type Meta,
  type GridMeta,
  type OptionSpec
} from '../schema/meta'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = path.join(ROOT, '.generated')
export const REPO = 'OscarBeamish/beamish.ink'
const SITE = 'https://beamish.ink'

const PIN_PLACEHOLDER = '{{PIN}}'

type Item = {
  meta: Meta
  dir: string
  group: 'effects' | 'components'
  /** recipe.md split into H2 sections, keyed by heading. */
  sections: Map<string, string>
}

// --- loading ---------------------------------------------------------------

function splitSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>()
  const lines = markdown.split(/\r?\n/)
  let heading: string | null = null
  let buffer: string[] = []
  const flush = () => {
    if (heading) sections.set(heading, buffer.join('\n').trim())
    buffer = []
  }
  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line)
    if (match) {
      flush()
      heading = match[1]!
    } else if (heading) {
      buffer.push(line)
    }
  }
  flush()
  return sections
}

export async function loadItems(): Promise<Item[]> {
  const items: Item[] = []
  for (const group of ['effects', 'components'] as const) {
    const base = path.join(ROOT, group)
    if (!existsSync(base)) continue
    for (const entry of await readdir(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = path.join(base, entry.name)
      const metaPath = path.join(dir, 'meta.json')
      if (!existsSync(metaPath)) continue

      const parsed = metaSchema.safeParse(JSON.parse(await readFile(metaPath, 'utf8')))
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map(issue => `    ${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('\n')
        throw new Error(`${group}/${entry.name}/meta.json is invalid:\n${detail}`)
      }
      if (parsed.data.slug !== entry.name) {
        throw new Error(`${group}/${entry.name}: slug is "${parsed.data.slug}", expected "${entry.name}"`)
      }

      const recipePath = path.join(dir, 'recipe.md')
      if (!existsSync(recipePath)) throw new Error(`${group}/${entry.name}: recipe.md is missing`)

      items.push({
        meta: parsed.data,
        dir,
        group,
        sections: splitSections(await readFile(recipePath, 'utf8'))
      })
    }
  }
  return items.sort((a, b) => a.meta.slug.localeCompare(b.meta.slug))
}

// --- shader sync -----------------------------------------------------------

/*
 * A shader lives in shaders/*.frag so it can be edited with syntax highlighting,
 * and is published inlined in core.ts so an agent fetches one file that runs with
 * no bundler plugin. Both, from one source, synced here.
 */
const SHADER_BLOCK = /(\/\/ beamish:shader-begin (\S+)\r?\n)([\s\S]*?)(\/\/ beamish:shader-end)/g

async function syncShaders(item: Item): Promise<{ file: string; contents: string } | null> {
  const corePath = path.join(item.dir, 'core.ts')
  if (!existsSync(corePath)) return null
  const original = await readFile(corePath, 'utf8')
  if (!original.includes('beamish:shader-begin')) return null

  const replacements: Array<Promise<void>> = []
  const sources = new Map<string, string>()
  for (const match of original.matchAll(SHADER_BLOCK)) {
    const rel = match[2]!
    replacements.push(
      readFile(path.join(item.dir, rel), 'utf8').then(text => {
        // The shader becomes a template literal, so backticks and interpolation
        // openers in GLSL comments have to be escaped rather than banned.
        // Prose in comments is worth more than the inconvenience.
        sources.set(rel, text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${'))
      })
    )
  }
  await Promise.all(replacements)

  const next = original.replace(SHADER_BLOCK, (_all, begin: string, rel: string, _body, end: string) => {
    const name = rel.split('/').pop()!.replace(/\W/g, '_').toUpperCase().replace(/_(FRAG|VERT)$/, '')
    const varName = rel.endsWith('.vert') ? 'VERT' : 'FRAG'
    void name
    return `${begin}const ${varName} = \`${sources.get(rel)!}\`\n${end}`
  })

  /*
   * Belt and braces. A marker that matched nothing, or a block that came out
   * different from the file it names, means the published file is about to ship
   * a shader nobody edited. Fail rather than generate a lie.
   */
  for (const [rel, source] of sources) {
    if (!next.includes(source)) {
      throw new Error(
        `${item.meta.slug}: ${rel} did not make it into core.ts.
` +
          '  The shader-begin marker is present but its block was not replaced.'
      )
    }
  }
  if (sources.size === 0) {
    throw new Error(`${item.meta.slug}: core.ts has shader markers but none of them matched`)
  }

  return next === original ? null : { file: corePath, contents: next }
}

// --- defaults drift --------------------------------------------------------

/*
 * The defaults exist twice: in meta.json, which the prompt and prop table are
 * built from, and in core.ts, so the published file stands alone. That is the one
 * duplication in the repo and it is deliberate, but it has to be checked, or
 * the prompt will confidently document a number the code does not use.
 */
const DEFAULTS_BLOCK = /export const \w+Defaults[^=]*=\s*\{([\s\S]*?)\n\}/
const DEFAULT_ENTRY = /^\s*(\w+):\s*(.+?),?\s*$/

/*
 * Whether the core draws into a canvas or works on the markup it is given. The
 * runtime defaults to a canvas, so only the DOM ones say so, and the prompt has
 * to know: telling an agent that the canvas fills its host, for an effect with
 * no canvas in it, sends it looking for a bug that is not there.
 */
const DOM_KIND = /\bkind:\s*'dom'/

function assertDefaultsMatch(item: Item, coreSource: string): void {
  const block = DEFAULTS_BLOCK.exec(coreSource)
  if (!block) return

  const declared = new Map<string, string>()
  for (const line of block[1]!.split('\n')) {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue
    const entry = DEFAULT_ENTRY.exec(line)
    if (entry) declared.set(entry[1]!, entry[2]!.replace(/,$/, '').trim())
  }

  const problems: string[] = []
  for (const [name, spec] of Object.entries(item.meta.options)) {
    if (!declared.has(name)) {
      problems.push(`  core.ts has no default for "${name}"`)
      continue
    }
    const inCode = declared.get(name)!.replace(/^['"]|['"]$/g, '')
    const inMeta = String(spec.default)
    if (inCode !== inMeta) {
      problems.push(`  "${name}": meta.json says ${inMeta}, core.ts says ${inCode}`)
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `${item.meta.slug}: defaults have drifted between meta.json and core.ts\n${problems.join('\n')}`
    )
  }
}

// --- grids -----------------------------------------------------------------

/*
 * A grid's prompt is a shorter thing than an effect's, because a grid is a
 * shorter thing: one stylesheet, the custom properties that are its interface,
 * and the rules for using it. There is no runtime to wire, nothing to mount and
 * no adapter to choose, so the prompt says so rather than carrying sections
 * that would read as boilerplate.
 */
type GridItem = { meta: GridMeta; dir: string; sections: Map<string, string> }

export async function loadGrids(): Promise<GridItem[]> {
  const base = path.join(ROOT, 'grids')
  if (!existsSync(base)) return []
  const grids: GridItem[] = []
  for (const entry of await readdir(base, { withFileTypes: true })) {
    // _media holds the shared photographs and is not an item.
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue
    const dir = path.join(base, entry.name)
    const metaPath = path.join(dir, 'meta.json')
    if (!existsSync(metaPath)) continue

    const parsed = gridMetaSchema.safeParse(JSON.parse(await readFile(metaPath, 'utf8')))
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map(issue => `    ${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n')
      throw new Error(`grids/${entry.name}/meta.json is invalid:\n${detail}`)
    }
    if (parsed.data.slug !== entry.name) {
      throw new Error(`grids/${entry.name}: slug is "${parsed.data.slug}"`)
    }

    const recipePath = path.join(dir, 'recipe.md')
    if (!existsSync(recipePath)) throw new Error(`grids/${entry.name}: recipe.md is missing`)

    grids.push({
      meta: parsed.data,
      dir,
      sections: splitSections(await readFile(recipePath, 'utf8'))
    })
  }
  return grids.sort((a, b) => a.meta.slug.localeCompare(b.meta.slug))
}

/*
 * The sections of the recipe a paste actually needs: how to use it, and where
 * it goes wrong. Taken from the recipe rather than written twice, so the page
 * and the prompt cannot drift.
 */
/*
 * Everything the recipe says except the opening summary, which the
 * description and the notes already carry.
 *
 * A fixed list of headings was worse: a grid whose recipe called a section
 * something else lost it from the prompt silently, and the only sign was a
 * prompt that happened to be short.
 */
const GRID_SKIP = new Set(['What it is'])

/*
 * The sections an item prompt lays out itself, by name and in its own order,
 * so they are not carried a second time by the sweep that takes the rest.
 */
const ITEM_SKIP = new Set([
  'What it is',
  'Wiring',
  'Accessibility',
  'Cleanup and SSR',
  'Pausing',
  'Reduced motion',
  'Common mistakes'
])

function gridPrompt(item: GridItem, pin: string, inline: boolean, css: string): string {
  const { meta } = item
  const parts: string[] = []
  const fence = '```'

  parts.push(
    `You are adding **${meta.name}** from Beamish to this project.

> ${meta.description}. A grid system, CSS, MIT.
> ${SITE}/grids/${meta.slug}

Beamish is not a package and there is nothing to install from npm. This one is
a single stylesheet: put it in the project, link it, and use the class names.
There is no runtime, nothing to mount and nothing to destroy.

Assume you have not seen this library before. Everything you need is below.`
  )

  parts.push(
    `## What it needs

- **npm dependencies:** None.
- **Browser support:** CSS grid and custom properties. The nested-alignment
  helper uses subgrid; without it that one rule does nothing and the rest is
  unaffected.
- Every class carries a \`g-\` prefix. That is deliberate: \`col-6\` and
  \`start-8\` are Tailwind utilities, and \`.band\` and \`.measure\` are words a
  project may already be using.

${meta.notes.map(note => `- ${note}`).join('\n')}

Pinned to \`${pin}\`. These URLs do not move; a future refactor gets a new tag.`
  )

  if (inline) {
    parts.push(
      `## 1. Save this file

Save it at \`${meta.files[0]!.to}\`, or wherever this project keeps its CSS.

${fence}css
${css}
${fence}`
    )
  } else {
    const rows = meta.files
      .map(file => `| \`${file.to}\` | ${rawUrl(pin, file.from)} |`)
      .join('\n')
    parts.push(
      `## 1. Fetch this file

| Save as | Fetch from |
| --- | --- |
${rows}`
    )
  }

  const props = Object.entries(meta.properties)
    .map(([name, spec]) => `| \`${name}\` | \`${spec.default}\` | ${spec.description} |`)
    .join('\n')
  parts.push(
    `## 2. The custom properties are the interface

Override these in the project's own stylesheet rather than editing the file, so
a later version is a clean replacement.

| Property | Default | What it is |
| --- | --- | --- |
${props}`
  )

  let next = 3
  for (const [heading, body] of item.sections) {
    if (GRID_SKIP.has(heading) || !body.trim()) continue
    parts.push(`## ${next}. ${heading}\n\n${body.trim()}`)
    next += 1
  }

  return parts.join('\n\n')
}

// --- prompt assembly -------------------------------------------------------

const rawUrl = (pin: string, repoPath: string) =>
  `https://raw.githubusercontent.com/${REPO}/${pin}/${repoPath}`

function formatRange(spec: OptionSpec): string {
  if (spec.type === 'number') {
    const range = `${spec.min} to ${spec.max}${spec.unit ? ` ${spec.unit}` : ''}`
    return spec.sensible ? `${range} (looks right between ${spec.sensible[0]} and ${spec.sensible[1]})` : range
  }
  if (spec.type === 'enum') return (spec.values ?? []).map(v => `\`${v}\``).join(' · ')
  if (spec.type === 'boolean') return '`true` · `false`'
  if (spec.type === 'color') return 'any CSS hex'
  return 'any value'
}

function optionTable(meta: Meta): string {
  const rows = Object.entries(meta.options).map(([name, spec]) => {
    const value = typeof spec.default === 'string' ? `\`${spec.default}\`` : `\`${String(spec.default)}\``
    return `| \`${name}\` | ${spec.type} | ${value} | ${formatRange(spec)} | ${spec.description} |`
  })
  return ['| Option | Type | Default | Range | What it does |', '| --- | --- | --- | --- | --- |', ...rows].join('\n')
}

function dependencyLine(meta: Meta): string {
  const deps = Object.entries(meta.peerDependencies)
  if (deps.length === 0) return 'None. This file has no npm dependencies at all.'
  return deps.map(([name, range]) => `\`${name}@${range}\``).join(', ')
}

function section(item: Item, heading: string): string | null {
  const body = item.sections.get(heading)
  return body && body.length > 0 ? body : null
}

function requiredFiles(meta: Meta) {
  return meta.files.filter(file => file.role !== 'adapter')
}

function header(item: Item, pin: string, sources: Map<string, string>): string {
  const { meta } = item
  const core = meta.files.find(file => file.role === 'core')
  const dom = DOM_KIND.test((core && sources.get(core.from)) ?? '')
  const webgl =
    meta.browser.webgl === 'none'
      ? null
      : meta.browser.webgl === 'webgl2'
        ? 'WebGL2. There is no WebGL1 fallback'
        : 'WebGL1 or better'

  const requirements = [
    webgl,
    ...meta.browser.notes,
    meta.tier !== 1
      ? 'React 18+ or Vue 3. This one is a component, not an imperative effect.'
      : dom
        ? 'A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.'
        : 'A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.'
  ].filter(Boolean) as string[]

  return `You are adding **${meta.name}** from Beamish to this project.

> ${meta.description}. ${CATEGORY_LABELS[meta.category]} · ${meta.tier === 1 ? 'effect' : 'component'} · MIT.
> ${SITE}/${item.group}/${meta.slug}

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** ${dependencyLine(meta)}
${requirements.map(line => `- ${line}`).join('\n')}

Pinned to \`${pin}\`. These URLs do not move; a future refactor gets a new tag.`
}

function body(item: Item, pin: string, inline: boolean, sources: Map<string, string>): string {
  const { meta } = item
  const parts: string[] = []

  // Step 1: the files
  if (inline) {
    const blocks = requiredFiles(meta).map(file => {
      const lang = file.to.endsWith('.tsx') ? 'tsx' : file.to.endsWith('.ts') ? 'ts' : 'text'
      return `**\`${file.to}\`**\n\n\`\`\`${lang}\n${sources.get(file.from) ?? ''}\n\`\`\``
    })
    parts.push(`## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

${blocks.join('\n\n')}`)
  } else {
    const rows = requiredFiles(meta).map(
      file => `| \`${file.to}\` | ${rawUrl(pin, file.from)} |`
    )
    parts.push(`## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
${rows.join('\n')}

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.`)
  }

  const what = section(item, 'What it is')
  if (what) parts.push(`## 2. What it is\n\n${what}`)

  const wiring = section(item, 'Wiring')
  if (wiring) parts.push(`## 3. Wire it in\n\n${wiring}`)

  parts.push(`## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument${meta.tier === 2 ? '' : ' to the create function'}; anything omitted takes its default.

${optionTable(meta)}`)

  // Tier 2 is where semantics, focus and keyboard live, and an agent wiring a nav
  // into someone's app will get all three wrong unless told plainly.
  /*
   * The rest of the sections are numbered by a counter rather than by hand,
   * because every one of them is conditional on the recipe having that
   * heading. Hardcoded, they collided: an item with accessibility, cleanup
   * and reduced motion all present got two sections numbered 6, and that
   * shipped in the prompts for a good while before anybody counted them.
   */
  let next = 5
  const numbered = (title: string, body: string) => {
    parts.push(`## ${next}. ${title}\n\n${body}`)
    next += 1
  }

  /*
   * Everything else the recipe says, in the order it says it, before the
   * sections below that close every prompt the same way.
   *
   * This was a fixed list of headings, and anything an author wrote outside
   * it was dropped without a word: 155 sections and eighteen thousand words,
   * including every "Tuning it" in the library, written and never shipped.
   * The prompt is the distribution, so a section that does not reach it does
   * not exist. Grids already learned this and skip by exception instead.
   */
  for (const [heading, body] of item.sections) {
    if (ITEM_SKIP.has(heading) || !body.trim()) continue
    numbered(heading, body.trim())
  }

  const a11y = section(item, 'Accessibility')
  if (a11y) numbered('Accessibility. Do not skip this', a11y)

  const cleanup = section(item, 'Cleanup and SSR')
  if (cleanup) numbered('Cleanup and SSR', cleanup)

  const pausing = section(item, 'Pausing')
  const reduced = section(item, 'Reduced motion')
  if (pausing || reduced) {
    numbered('Pausing and reduced motion', [pausing, reduced].filter(Boolean).join('\n\n'))
  }

  const mistakes = section(item, 'Common mistakes')
  if (mistakes) numbered('The three mistakes most likely to be made here', mistakes)

  const adapters = meta.files.filter(file => file.role === 'adapter')
  if (adapters.length > 0 && !inline) {
    parts.push(`## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

${adapters.map(file => `- ${rawUrl(pin, file.from)}`).join('\n')}`)
  }

  if (meta.credit) {
    parts.push(`---

Concept credit: ${meta.credit.what}, by ${meta.credit.author}, ${meta.credit.url}.
The implementation here is written from scratch.`)
  }

  parts.push(`---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.`)

  return parts.join('\n\n')
}

// --- writing ---------------------------------------------------------------

type Output = { file: string; contents: string }

/*
 * A literal script tag written inside an Astro comment.
 *
 * Astro's compiler finds script elements by scanning the file, and it does not
 * know a comment from markup. One written in prose opens a script block that
 * runs to the next closing tag, so the rest of the comment becomes JavaScript
 * and esbuild's dependency scan fails on the first word that is not a
 * statement. `astro build` survives it. `astro dev` does not, which is the
 * worst way round: it goes unnoticed until somebody tries to work on the site.
 *
 * This has now broken the dev server twice, once in PromptButtons and once in
 * DemoPanel, so it is a check rather than a thing to remember. Write "script
 * tag" in prose.
 */
async function checkAstroComments(): Promise<void> {
  const dir = path.join(ROOT, 'site', 'src')
  if (!existsSync(dir)) return

  const found: string[] = []

  async function walk(at: string): Promise<void> {
    for (const entry of await readdir(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.name.endsWith('.astro')) {
        const source = await readFile(full, 'utf8')
        for (const comment of source.match(/\/\*[\s\S]*?\*\//g) ?? []) {
          if (!/<\/?script/i.test(comment)) continue
          const line = source.slice(0, source.indexOf(comment)).split('\n').length
          found.push(`${path.relative(ROOT, full)}:${line}`)
        }
      }
    }
  }

  await walk(dir)

  if (found.length > 0) {
    throw new Error(
      'A literal script tag inside an Astro comment breaks the dev server, ' +
        'though not the build. Write "script tag" in prose instead.\n  ' +
        found.join('\n  ')
    )
  }
}

async function generate(check: boolean, pin: string) {
  await checkAstroComments()

  const items = await loadItems()
  if (items.length === 0) throw new Error('No items found under effects/ or components/')

  const outputs: Output[] = []

  for (const item of items) {
    const synced = await syncShaders(item)
    if (synced) outputs.push(synced)

    const sources = new Map<string, string>()
    for (const file of requiredFiles(item.meta)) {
      const abs = path.join(ROOT, file.from)
      if (!existsSync(abs)) {
        throw new Error(`${item.meta.slug}: meta.json lists ${file.from}, which does not exist`)
      }
      // Read post-sync so an inlined prompt never carries a stale shader.
      const fresh = synced && synced.file === abs ? synced.contents : await readFile(abs, 'utf8')
      sources.set(file.from, fresh.trimEnd())
      if (file.role === 'core') assertDefaultsMatch(item, fresh)
    }

    const dir = path.join(OUT, item.meta.slug)
    outputs.push({
      file: path.join(dir, 'prompt.md'),
      contents: `${header(item, pin, sources)}\n\n${body(item, pin, false, sources)}\n`
    })
    outputs.push({
      file: path.join(dir, 'prompt.inline.md'),
      contents: `${header(item, pin, sources)}\n\n${body(item, pin, true, sources)}\n`
    })
  }

  /*
   * Grids. The same two files out of a shorter contract: there is no shader to
   * inline and no core whose defaults have to be checked, so this is a read and
   * a format rather than the assembly above.
   */
  const grids = await loadGrids()
  for (const grid of grids) {
    const from = grid.meta.files[0]!.from
    const cssPath = path.join(ROOT, from)
    if (!existsSync(cssPath)) {
      throw new Error(grid.meta.slug + ': meta.json lists ' + from + ', which does not exist')
    }
    const css = (await readFile(cssPath, 'utf8')).trimEnd()
    const dir = path.join(OUT, grid.meta.slug)
    outputs.push({
      file: path.join(dir, 'prompt.md'),
      contents: gridPrompt(grid, pin, false, css) + '\n'
    })
    outputs.push({
      file: path.join(dir, 'prompt.inline.md'),
      contents: gridPrompt(grid, pin, true, css) + '\n'
    })
  }

  const index = items.map(item => ({
    ...item.meta,
    group: item.group,
    /** Prose the site renders above the demo, taken from the recipe. */
    intro: item.sections.get('What it is') ?? ''
  }))
  outputs.push({
    file: path.join(OUT, 'index.json'),
    contents: `${JSON.stringify(index, null, 2)}\n`
  })

  let stale = 0
  for (const output of outputs) {
    const current = existsSync(output.file) ? await readFile(output.file, 'utf8') : null
    if (current === output.contents) continue
    stale += 1
    if (check) {
      console.error(`stale: ${path.relative(ROOT, output.file)}`)
      continue
    }
    await mkdir(path.dirname(output.file), { recursive: true })
    await writeFile(output.file, output.contents, 'utf8')
  }

  // Drop prompt directories for items that no longer exist, so a deleted effect
  // cannot leave a live prompt behind on the site.
  if (!check && existsSync(OUT)) {
    const slugs = new Set([
      ...items.map(item => item.meta.slug),
      ...grids.map(grid => grid.meta.slug)
    ])
    for (const entry of await readdir(OUT, { withFileTypes: true })) {
      if (entry.isDirectory() && !slugs.has(entry.name)) {
        await rm(path.join(OUT, entry.name), { recursive: true, force: true })
      }
    }
  }

  if (check) {
    if (stale > 0) {
      console.error(`\n${stale} generated file(s) are stale. Run \`pnpm generate\`.`)
      process.exit(1)
    }
    console.log(`generate:check: ${items.length} item(s), everything current`)
    return
  }

  console.log(`generated ${items.length} item(s) and ${grids.length} grid(s), pin ${pin}`)
  for (const item of items) {
    console.log(`  ${item.meta.slug.padEnd(14)} ${Object.keys(item.meta.options).length} options`)
  }
}

/*
 * Only when run directly. verify-pin imports loadItems from here, and without
 * this guard that import would quietly regenerate everything as a side effect.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const pinArg = args.indexOf('--pin')
  const pin = pinArg >= 0 ? args[pinArg + 1]! : process.env['BEAMISH_PIN'] || PIN_PLACEHOLDER

  await generate(args.includes('--check'), pin)
}
