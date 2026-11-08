/*
 * Find CSS the browser throws away.
 *
 * Every gate in this repo checks that a page builds, that it fits, that its
 * contrast holds. None of them checks that the CSS in the file is the CSS that
 * applies, and that gap hid real damage: two templates had their comments
 * written as `/_ ... _/` rather than `/* ... *\/`, markdown emphasis instead of
 * a comment, and `/_` does not open a comment. The parser treats it as garbage
 * and discards whatever follows until it finds its feet again.
 *
 * It cost 55 rules across the two files. recessed-aperture lost the rule that
 * made .finale a clipping, positioned parent, so its decoration escaped and the
 * page scrolled sideways, which is the only reason anybody noticed. The other
 * file lost 29 rules and was never flagged by anything, because losing CSS does
 * not fail a build, a type check or a test. It just renders differently from
 * what the author wrote, and nobody can tell by looking which half is missing.
 *
 * Two passes, because they catch different things.
 *
 * The text pass finds the known damage by its shape and needs no browser, so it
 * can say exactly which line to fix.
 *
 * The browser pass is the general one. It counts the blocks in the source and
 * asks the browser how many rules it ended up with. Those two numbers agree on
 * a healthy file, and a gap means the parser dropped something, whatever the
 * cause. It will not say which rule, but it cannot be fooled by damage nobody
 * has thought of yet.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser } from 'playwright'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const TEMPLATES = path.join(ROOT, 'templates')

/* Every template that is a real item, in the order the directory gives them. */
function templateSlugs(): string[] {
  return readdirSync(TEMPLATES).filter(slug =>
    existsSync(path.join(TEMPLATES, slug, 'meta.json')) &&
    existsSync(path.join(TEMPLATES, slug, 'index.html'))
  )
}

type Finding = { file: string; line: number; what: string }

/* --- the text pass ------------------------------------------------------- */

/*
 * Markdown emphasis in place of a comment, and an escaped close.
 *
 * Both come from the same accident: a file round-tripped through something that
 * treats `*` as emphasis. `/_` is the open, `_/` the close, and `\*\/` turns up
 * where the close survived but got escaped.
 */
const MANGLED: { pattern: RegExp; what: string }[] = [
  { pattern: /\/_/g, what: 'a comment opened with /_ rather than /*' },
  { pattern: /_\//g, what: 'a comment closed with _/ rather than */' },
  { pattern: /\\\*\//g, what: 'a comment closed with an escaped \\*/' }
]

function scanText(file: string): Finding[] {
  const source = readFileSync(path.join(ROOT, file), 'utf8')
  const found: Finding[] = []
  for (const { pattern, what } of MANGLED) {
    pattern.lastIndex = 0
    let hit: RegExpExecArray | null
    while ((hit = pattern.exec(source))) {
      found.push({
        file,
        line: source.slice(0, hit.index).split('\n').length,
        what
      })
    }
  }
  return found
}

/* --- the browser pass ---------------------------------------------------- */

/*
 * How many blocks the source declares.
 *
 * Comments are stripped first, properly, or a `{` inside prose counts as a
 * rule. Strings are stripped for the same reason: `content: "{"` is legal and
 * is not a block.
 *
 * This is an approximation and it is allowed to be. It is compared against the
 * parsed count with a tolerance, because the question is not "is this exactly
 * right" but "did the parser quietly lose a dozen rules".
 */
function blocksInSource(css: string): number {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const withoutStrings = withoutComments.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
  return (withoutStrings.match(/\{/g) ?? []).length
}

export async function run(): Promise<number> {
  const slugs = templateSlugs()

  const textFindings: Finding[] = []
  for (const slug of slugs) {
    textFindings.push(...scanText(`templates/${slug}/index.html`))
  }

  let browser: Browser | null = null
  const drops: { slug: string; declared: number; parsed: number }[] = []

  try {
    browser = await chromium.launch({ channel: 'chromium' })
    for (const slug of slugs) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      /*
       * The source file, handed straight to the parser. Not the built copy over
       * a dev server, which is what this did first and which made the whole
       * pass useless: the served page is whatever was last built, so editing
       * the source changed nothing the browser could see and the check passed
       * on a file that was still broken. Nothing here needs the page to load
       * its images or run its script; it only has to parse the CSS.
       */
      await page.setContent(readFileSync(path.join(TEMPLATES, slug, 'index.html'), 'utf8'), {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })

      const measured = await page.evaluate(() => {
        /*
         * Only the page's own <style> blocks. A linked sheet is somebody
         * else's file and is counted where it lives, and an injected one is
         * not in the source at all.
         */
        let parsed = 0
        let source = ''
        for (const el of Array.from(document.querySelectorAll('style'))) {
          source += el.textContent ?? ''
          const sheet = el.sheet
          if (!sheet) continue
          const stack: CSSRuleList[] = [sheet.cssRules]
          while (stack.length) {
            const rules = stack.pop()!
            for (const rule of Array.from(rules)) {
              parsed += 1
              const nested = (rule as CSSGroupingRule).cssRules
              if (nested) stack.push(nested)
            }
          }
        }
        return { parsed, source }
      })

      const declared = blocksInSource(measured.source)
      /*
       * A small gap is the approximation, not a fault: a declaration list
       * inside an at-rule, a nested selector, all count slightly differently.
       * Five is comfortably below the twenty-six and twenty-nine that the real
       * damage cost, and comfortably above the noise.
       */
      if (declared - measured.parsed > 5) {
        drops.push({ slug, declared, parsed: measured.parsed })
      }
      await page.close()
    }
  } finally {
    await browser?.close()
  }

  /* --- report ------------------------------------------------------------ */

  if (textFindings.length === 0 && drops.length === 0) {
    console.log(`cssdrop: ${slugs.length} template(s), nothing discarded`)
    return 0
  }

  if (textFindings.length > 0) {
    console.log(`\nMANGLED COMMENTS (${textFindings.length})`)
    for (const f of textFindings.slice(0, 40)) {
      console.log(`  ${f.file}:${f.line}  ${f.what}`)
    }
    if (textFindings.length > 40) console.log(`  ... and ${textFindings.length - 40} more`)
  }

  if (drops.length > 0) {
    console.log(`\nRULES DISCARDED BY THE PARSER (${drops.length})`)
    for (const d of drops) {
      console.log(`  ${d.slug}: ${d.declared} block(s) in the source, ${d.parsed} rule(s) parsed, ${d.declared - d.parsed} lost`)
    }
  }

  console.log(
    '\nCSS that does not parse is not a build error and not a test failure.' +
      '\nThe page renders, and it renders differently from what is written.'
  )
  return 1
}

const invoked = process.argv[1] && import.meta.filename === path.resolve(process.argv[1])
if (invoked) {
  run().then(
    code => process.exit(code),
    error => {
      console.error(error)
      process.exit(1)
    }
  )
}
