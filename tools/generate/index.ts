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
  templateMetaSchema,
  CATEGORY_LABELS,
  type Meta,
  type GridMeta,
  type TemplateMeta,
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
      /*
       * Underscore means parked. The grids and templates loaders further down
       * this file already skip those; this one did not, which made the
       * convention two thirds true and meant a work in progress under
       * effects/ broke the build rather than sitting out of it.
       */
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue
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

// --- templates -------------------------------------------------------------

/*
 * A template is a whole page rather than an item, so its prompt is a different
 * shape: there is nothing to configure and no adapter to choose. What somebody
 * taking one needs is the page's three files, every library item it is built
 * from, and permission to throw the words away.
 */
type TemplateItem = { meta: TemplateMeta; dir: string }

export async function loadTemplates(): Promise<TemplateItem[]> {
  const base = path.join(ROOT, 'templates')
  if (!existsSync(base)) return []
  const templates: TemplateItem[] = []
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue
    const dir = path.join(base, entry.name)
    const metaPath = path.join(dir, 'meta.json')
    if (!existsSync(metaPath)) continue
    const meta = templateMetaSchema.parse(JSON.parse(await readFile(metaPath, 'utf8')))
    if (meta.slug !== entry.name) {
      throw new Error(`templates/${entry.name}: slug is "${meta.slug}"`)
    }
    templates.push({ meta, dir })
  }
  return templates.sort((a, b) => a.meta.slug.localeCompare(b.meta.slug))
}

/*
 * Every repo file one use needs.
 *
 * An effect is its core and nothing else; a grid is its stylesheet; a
 * component is whatever its own meta calls the core and the style, because
 * the two tiers do not have the same shape and guessing at it here would be
 * the sort of drift meta.json exists to prevent.
 */
function filesForUse(
  use: TemplateMeta['uses'][number],
  byItemSlug: Map<string, Meta>
): string[] {
  if (use.kind === 'effect') return [`effects/${use.slug}/core.ts`]
  if (use.kind === 'grid') return [`grids/${use.slug}/grid.css`]
  if (use.kind === 'shared') return use.name === 'Stage' ? ['shared/stage.ts'] : []

  const meta = byItemSlug.get(use.slug)
  if (!meta) throw new Error(`no component called ${use.slug}`)
  return meta.files
    .filter(f => f.role === 'core' || f.role === 'style')
    .map(f => f.from)
}

function templatePrompt(
  template: TemplateItem,
  pin: string,
  byItemSlug: Map<string, Meta>
): string {
  const { meta } = template
  /*
   * Two kinds of template, and almost every section below differs between
   * them. One is composed from library items and is ours. The other is
   * adapted from somebody else's work under its licence, is a single file,
   * and mounts nothing from the library at all.
   */
  const adapted = meta.source !== undefined
  const parts: string[] = []

  parts.push(
    `You are building **${meta.name}** from Beamish into this project.

> ${meta.description}. A whole page, MIT.
> ${SITE}/templates/${meta.slug}

This is a page, not a component. It is one HTML file, one stylesheet and one
entry script, built out of ${meta.uses.length} pieces of the library, and the
brand on it is invented so that you can throw it away. Take the layout and the
wiring; replace the words, the colours and the pictures with the real ones.

Beamish is not a package and there is nothing to install from npm.

Assume you have not seen this library before. Everything you need is below.`
  )

  /*
   * What the page actually imports, which is not what its items list. A
   * component declares react and vue because it ships adapters for them; a
   * template uses the framework-free core underneath and mounts nothing, so
   * naming a framework here sends somebody to install one the page never
   * calls.
   */
  const FRAMEWORKS = new Set(['react', 'react-dom', 'vue'])
  const deps = new Set<string>()
  for (const use of meta.uses) {
    const item = byItemSlug.get(use.slug)
    for (const dep of Object.keys(item?.peerDependencies ?? {})) {
      if (!FRAMEWORKS.has(dep)) deps.add(dep)
    }
  }

  parts.push(
    `## What it needs

- **npm dependencies:** ${deps.size === 0 ? 'None.' : [...deps].map(d => `\`${d}\``).join(', ') + '.'}
- **Ground:** this page is built for a ${meta.ground} background. ${
      meta.ground === 'dark'
        ? 'Its items are tuned for a near-black page; on paper it will look wrong.'
        : meta.ground === 'paper'
          ? 'Its items are tuned for a light page; on black it will look wrong.'
          : 'It has been looked at on both.'
    }
- **One WebGL context.** Several of these items each want one, and the budget
  is one for the whole page, so the stage hands it between them as you scroll.
  That is already wired; do not mount two backdrops without it.

Pinned to \`${pin}\`. These URLs do not move; a future refactor gets a new tag.`
  )

  /*
   * Only the files the page actually has.
   *
   * An adapted page is one self-contained index.html with its CSS inline, so
   * naming styles.css in its prompt sends whoever pasted it to a 404. Read
   * off disk rather than assumed, which also means a template that gains or
   * loses a file does not need this function edited.
   */
  const pageFiles = ['index.html', 'styles.css', 'entry.ts', 'meta.json']
    .filter(name => existsSync(path.join(template.dir, name)))
    .map(
      name =>
        `| \`${name}\` | ${rawUrl(pin, `templates/${meta.slug}/${name}`)} |`
    )
    .join('\n')

  parts.push(
    `## 1. Fetch the page

| Save as | Fetch from |
| --- | --- |
${pageFiles}

${
  adapted
    ? `Everything this page draws with is inside \`index.html\`: its CSS, its SVG
and its script are all in the one file. \`entry.ts\` adds nothing you will see;
it exposes the handle a recording is driven with, and you can drop it.`
    : `\`entry.ts\` imports the library by relative path and imports \`meta.json\`
for the colophon, which is why that file is in the list: without it the page
does not build. Keep that shape, or fix the imports when you move things.`
}`
  )

  const seen = new Set<string>()
  const libRows: string[] = []
  for (const use of meta.uses) {
    for (const from of filesForUse(use, byItemSlug)) {
      if (seen.has(from)) continue
      seen.add(from)
      libRows.push(`| \`${use.name}\` | \`${from}\` | ${rawUrl(pin, from)} |`)
    }
  }
  if (adapted) {
    /*
     * An adapted page imports one thing, and only so it can be recorded.
     * Listing the runtime, the ground resolver and the tokens here would tell
     * somebody to fetch four files the page never loads.
     */
    libRows.push(
      `| shared | \`templates/_shared/scroll-driver.ts\` | ${rawUrl(pin, 'templates/_shared/scroll-driver.ts')} |`
    )
  } else {
    // Every effect core imports the runtime, and the runtime imports the ground
    // resolver. Tokens and fonts are what the page is drawn with.
    for (const from of [
      'shared/runtime.ts',
      'shared/ground.ts',
      'shared/tokens.css',
      'shared/fonts.css'
    ]) {
      if (!seen.has(from)) libRows.push(`| shared | \`${from}\` | ${rawUrl(pin, from)} |`)
    }
  }

  parts.push(
    adapted
      ? `## 2. Where this page came from

This one is not ours. It is adapted from **${meta.source!.title}** by
${meta.source!.author}, used under the ${meta.source!.licence} licence:

${meta.source!.url}

${meta.source!.changed}.

The licence notice is in the comment at the top of \`index.html\` and it has to
travel with the file. Keep it there when you edit the page, and keep it there
if you ship it.

| Item | Save as | Fetch from |
| --- | --- | --- |
${libRows.join('\n')}`
      : `## 2. Fetch what it is built from

| Item | Save as | Fetch from |
| --- | --- | --- |
${libRows.join('\n')}

Keep the paths. \`entry.ts\` imports \`../../effects/<name>/core\` and the page
links \`../../shared/tokens.css\`, so the tree has to mirror the repo or every
import has to be rewritten.`
  )

  if (!adapted) {
    parts.push(
      `## 3. The ground is declared, not assumed

The page sets \`<html data-ground="${meta.ground === 'either' ? 'paper' : meta.ground}">\`
and \`tokens.css\` has no fallback palette. Drop that attribute and the page
loses every colour it has, which is deliberate: a ground is a decision, and a
value you have to fill in cannot quietly be wrong.`
    )

    const colophon = meta.uses
      .map(use =>
        use.slug
          ? `- [${use.name}](${SITE}/${use.kind === 'grid' ? 'grids' : use.kind === 'component' ? 'components' : 'effects'}/${use.slug})`
          : `- ${use.name}`
      )
      .join('\n')

    parts.push(
      `## 4. What is on the page

${colophon}

The page writes that list into its own footer from \`meta.json\`, so if you drop
an item, drop it from \`uses\` too and the colophon follows.`
    )
  }

  parts.push(
    adapted
      ? `## 3. Make it yours

The brand is invented. There is no such company, the copy is written for this
page and every figure on it is made up, so none of it is precious. The licence
is the one thing on the page that is not yours to change.

- Replace the words first. The layout was built around real sentences rather
  than lorem, which is why it holds, and it will hold around yours.
- Every tone on the page derives from a handful of custom properties at the top
  of the \`<style>\` block. Retune those rather than hunting hex values, and
  check the result: small labels on a dark panel fail a contrast threshold long
  before they look wrong.
- Nothing here is a photograph. Every mark on the page is CSS or inline SVG, so
  there are no assets to swap and nothing to license but the page itself.
- Keep the licence comment at the top of the file, and keep the line that says
  the brand is fictional.
- Keep the reduced-motion handling. WCAG 2.2.2 is Level A, and this page
  already does the work.

## 4. Devices that are spent

These pages have been through a pass that took these out, and putting them back
is the fastest way to make the result look machine-made. None of them is wrong
in itself. The test is whether the subject earns it, and the answer is usually
no:

- **Tracked all-caps mono labels** on navigation, eyebrows, buttons and badges.
  A machine's front panel really is stencilled and a terminal really is
  monospaced. A pricing table is neither.
- **01 / 02 / 03 as ornament.** Keep a number where it is a real index: a rack
  unit, a frame, a step the copy refers to by number. A three-item list of
  reasons is not an index.
- **One accented word in the headline**, unless the accented words are what the
  sentence is about.
- **A highlighter bar behind two words of your own headline.** Annotation is a
  device for a page with something to annotate.
- **Gradient-clipped headline text**, unless the gradient is the subject.
- **Indigo and violet between 245 and 290 degrees**, which is where the whole
  genre lives. Take the hue from the subject instead.
- **Glass on everything.** Keep it on the one surface meant to read as glass. A
  backdrop blur under a 92% opaque panel is a compositing layer you are paying
  for and cannot see, and two of those were measured on one page here.
- **Three dots in a row at the top of a panel**, on a page that has no window.
- **"Trusted by 4,000+ teams"** and the logo strip under it.

If the page does earn one, say so in the markup with
\`data-earned="why"\`. Writing the reason is the point: it makes you say out
loud what gives the page the right to the device.`
      : `## 5. Make it yours

The brand is invented. There is no such company, the copy is written for this
page and every figure on it is made up, so none of it is precious.

- Replace the words first. The layout was built around real sentences rather
  than lorem, which is why it holds, and it will hold around yours.
- The page's own stylesheet carries the brand: its type scale, its colours and
  its chrome. No class in it uses the \`g-\` prefix, so the line between the
  library and the page using it stays visible while you edit.
- The photographs are from Unsplash and credited in the repo. Swap them.
- Keep the pause control on anything ambient. WCAG 2.2.2 is Level A.`
  )

  return parts.join('\n\n')
}

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

  /*
   * Templates. One prompt each, and no inline variant: the page is three files
   * and a dozen library ones, which is far past the size where inlining the
   * source into the prompt is kinder than fetching it.
   */
  const byItemSlug = new Map(items.map(item => [item.meta.slug, item.meta]))
  const templates = await loadTemplates()
  for (const template of templates) {
    outputs.push({
      file: path.join(OUT, template.meta.slug, 'prompt.md'),
      contents: templatePrompt(template, pin, byItemSlug) + '\n'
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
    /*
     * Templates belong in this set too. They were left out when the collection
     * was added, so their prompts were written and then deleted again on the
     * same run, and `generate` reported success having produced nothing.
     */
    const slugs = new Set([
      ...items.map(item => item.meta.slug),
      ...grids.map(grid => grid.meta.slug),
      ...templates.map(template => template.meta.slug)
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
