/*
 * pnpm generate — rebuilds everything derived from meta.json + recipe.md.
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
import { fileURLToPath } from 'node:url'
import { metaSchema, CATEGORY_LABELS, type Meta, type OptionSpec } from '../schema/meta'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = path.join(ROOT, '.generated')
const REPO = 'oscarbeamish/beamish'
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

async function loadItems(): Promise<Item[]> {
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
const SHADER_BLOCK = /(\/\/ beamish:shader-begin (\S+)\n)([\s\S]*?)(\/\/ beamish:shader-end)/g

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
        // openers in GLSL comments have to be escaped rather than banned —
        // prose in comments is worth more than the inconvenience.
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

  return next === original ? null : { file: corePath, contents: next }
}

// --- defaults drift --------------------------------------------------------

/*
 * The defaults exist twice: in meta.json, which the prompt and prop table are
 * built from, and in core.ts, so the published file stands alone. That is the one
 * duplication in the repo and it is deliberate — but it has to be checked, or the
 * prompt will confidently document a number the code does not use.
 */
const DEFAULTS_BLOCK = /export const \w+Defaults[^=]*=\s*\{([\s\S]*?)\n\}/
const DEFAULT_ENTRY = /^\s*(\w+):\s*(.+?),?\s*$/

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

// --- prompt assembly -------------------------------------------------------

const rawUrl = (pin: string, repoPath: string) =>
  `https://raw.githubusercontent.com/${REPO}/${pin}/${repoPath}`

function formatRange(spec: OptionSpec): string {
  if (spec.type === 'number') {
    const range = `${spec.min} – ${spec.max}${spec.unit ? ` ${spec.unit}` : ''}`
    return spec.sensible ? `${range} (looks right between ${spec.sensible[0]} and ${spec.sensible[1]})` : range
  }
  if (spec.type === 'enum') return (spec.values ?? []).map(v => `\`${v}\``).join(' · ')
  if (spec.type === 'boolean') return '`true` · `false`'
  if (spec.type === 'color') return 'any CSS hex'
  return '—'
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

function header(item: Item, pin: string): string {
  const { meta } = item
  const webgl =
    meta.browser.webgl === 'none'
      ? null
      : meta.browser.webgl === 'webgl2'
        ? 'WebGL2 — there is no WebGL1 fallback'
        : 'WebGL1 or better'

  const requirements = [
    webgl,
    ...meta.browser.notes,
    meta.tier === 1
      ? 'A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.'
      : 'React 18+ or Vue 3. This one is a component, not an imperative effect.'
  ].filter(Boolean) as string[]

  return `You are adding **${meta.name}** from Beamish to this project.

> ${meta.description}. ${CATEGORY_LABELS[meta.category]} · ${meta.tier === 1 ? 'effect' : 'component'} · MIT.
> ${SITE}/${item.group}/${meta.slug}

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses — that is the point of
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

  // 1 — the files
  if (inline) {
    const blocks = requiredFiles(meta).map(file => {
      const lang = file.to.endsWith('.tsx') ? 'tsx' : file.to.endsWith('.ts') ? 'ts' : 'text'
      return `**\`${file.to}\`**\n\n\`\`\`${lang}\n${sources.get(file.from) ?? ''}\n\`\`\``
    })
    parts.push(`## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement — the
import between them is relative.

${blocks.join('\n\n')}`)
  } else {
    const rows = requiredFiles(meta).map(
      file => `| \`${file.to}\` | ${rawUrl(pin, file.from)} |`
    )
    parts.push(`## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement — the
import between them is relative.

| Save as | Fetch from |
| --- | --- |
${rows.join('\n')}

If you cannot fetch URLs, say so rather than writing the file from memory — there
is a version of this prompt with the source inlined, and guessing at a shader
produces something that compiles and looks wrong.`)
  }

  const what = section(item, 'What it is')
  if (what) parts.push(`## 2. What it is\n\n${what}`)

  const wiring = section(item, 'Wiring')
  if (wiring) parts.push(`## 3. Wire it in\n\n${wiring}`)

  parts.push(`## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument${meta.tier === 2 ? '' : ' to the create function'}; anything omitted takes its default.

${optionTable(meta)}`)

  const cleanup = section(item, 'Cleanup and SSR')
  if (cleanup) parts.push(`## 5. Cleanup and SSR\n\n${cleanup}`)

  const pausing = section(item, 'Pausing')
  const reduced = section(item, 'Reduced motion')
  if (pausing || reduced) {
    parts.push(
      `## 6. Pausing and reduced motion\n\n${[pausing, reduced].filter(Boolean).join('\n\n')}`
    )
  }

  const mistakes = section(item, 'Common mistakes')
  if (mistakes) {
    parts.push(`## 7. The three mistakes most likely to be made here\n\n${mistakes}`)
  }

  const adapters = meta.files.filter(file => file.role === 'adapter')
  if (adapters.length > 0 && !inline) {
    parts.push(`## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

${adapters.map(file => `- ${rawUrl(pin, file.from)}`).join('\n')}`)
  }

  if (meta.credit) {
    parts.push(`---

Concept credit: ${meta.credit.what} — ${meta.credit.author}, ${meta.credit.url}. The
implementation here is written from scratch.`)
  }

  parts.push(`---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.`)

  return parts.join('\n\n')
}

// --- writing ---------------------------------------------------------------

type Output = { file: string; contents: string }

async function generate(check: boolean, pin: string) {
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
      contents: `${header(item, pin)}\n\n${body(item, pin, false, sources)}\n`
    })
    outputs.push({
      file: path.join(dir, 'prompt.inline.md'),
      contents: `${header(item, pin)}\n\n${body(item, pin, true, sources)}\n`
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
    const slugs = new Set(items.map(item => item.meta.slug))
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
    console.log(`generate:check — ${items.length} item(s), everything current`)
    return
  }

  console.log(`generated ${items.length} item(s), pin ${pin}`)
  for (const item of items) {
    console.log(`  ${item.meta.slug.padEnd(14)} ${Object.keys(item.meta.options).length} options`)
  }
}

const args = process.argv.slice(2)
const pinArg = args.indexOf('--pin')
const pin = pinArg >= 0 ? args[pinArg + 1]! : process.env['BEAMISH_PIN'] || PIN_PLACEHOLDER

await generate(args.includes('--check'), pin)
