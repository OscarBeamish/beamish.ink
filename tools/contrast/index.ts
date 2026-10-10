/*
 * pnpm contrast <route> [...]
 *
 * Every distinct text style on a page, measured against what is actually
 * behind it, with the ratio it really has.
 *
 * This exists because judging contrast by looking is not a skill anybody has.
 * The three templates in this repo were rebuilt with care by somebody who
 * thought they looked fine, and the first run of this reported 14, 11 and 12
 * text styles below their threshold on the three pages, the worst of them at
 * 1.37:1. Not one of those was visible in a screenshot. Several were made by a
 * colour change three rules away from the text it broke.
 *
 * WHAT IT READS, AND WHY IT HAS TO BE THE PAGE
 *
 * Colours come from `getComputedStyle` on the live DOM, never from parsing the
 * stylesheet. By the time a colour reaches the screen it has been through
 * color-mix, custom property inheritance, a ground selector that may have
 * outranked the page's own `:root`, and whatever the cascade did with the
 * order the stylesheets happened to load in. A checker that reads the source
 * is checking what somebody meant; this checks what the browser did.
 *
 * Translucent text is flattened onto what is behind it, and a translucent
 * background is composited down onto the first opaque layer under it, in
 * order. Skipping either is how a quiet label written as `rgba(…, 0.7)` goes
 * unmeasured, which is exactly how a theme writes one.
 *
 * Pseudo-element text is read too. On these pages the smallest type is a
 * `::before` carrying a frame number or a stamped legend, and a checker that
 * only walks elements never sees it.
 *
 * WHAT IT DOES NOT CHECK
 *
 * Text over an image or a canvas. The ratio there depends on the pixel, and a
 * number averaged over a photograph is a number that is wrong everywhere. If a
 * page puts reading matter on a picture, that is a judgement a person has to
 * make about that picture, so these are counted and named rather than passed.
 *
 * Text the page marks `data-decoration`. WCAG 1.4.3 exempts pure decoration,
 * but the page has to say which of its text that is, in the markup, where a
 * reviewer sees the claim. Guessing from a class name, or from `aria-hidden`,
 * would have exempted small print that people do read.
 *
 * HOW IT IS SPLIT
 *
 * The page collects strings and returns them. Every bit of parsing, alpha
 * compositing and arithmetic happens here, in Node. That is not only tidier:
 * the collector is serialised into the browser, where the transpiler's
 * keep-names helper does not exist, so a named function inside it throws
 * `__name is not defined` on its first call. Keeping the page side to one loop
 * with no helpers in it is what makes that impossible rather than remembered.
 */

import { chromium, type Browser } from 'playwright'
import { ensureServer, routeFrom, ORIGIN } from '../dev-server'

/** What the page hands back for one text style. Strings, not numbers. */
type Raw = {
  sel: string
  px: number
  weight: number
  colour: string
  /** Every background from the element up, nearest first, as written. */
  grounds: string[]
  onMedia: boolean
}

type Rgba = [number, number, number, number]

/**
 * A computed colour as four channels in 0..1.
 *
 * Chrome returns `rgb()`/`rgba()` for most things and `color(srgb …)` for
 * anything that came out of a `color-mix`, which is most of this library.
 */
function parse(value: string): Rgba | null {
  const parts = value.match(/[\d.]+/g)
  if (!parts) return null
  const n = parts.map(Number)
  if (value.startsWith('color(srgb')) {
    return [n[0]!, n[1]!, n[2]!, n[3] ?? 1]
  }
  return [n[0]! / 255, n[1]! / 255, n[2]! / 255, n[3] ?? 1]
}

/** Source over destination, both opaque-backed by the time this is used. */
function over(fg: Rgba, bg: number[]): number[] {
  return [0, 1, 2].map(i => fg[i]! * fg[3] + bg[i]! * (1 - fg[3]))
}

/** sRGB channel to linear light, per WCAG 2.x relative luminance. */
function channel(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function luminance(rgb: number[]): number {
  return 0.2126 * channel(rgb[0]!) + 0.7152 * channel(rgb[1]!) + 0.0722 * channel(rgb[2]!)
}

function ratio(a: number[], b: number[]): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The ground behind an element: the first opaque layer, with every translucent
 * layer above it composited back down onto it, nearest last.
 *
 * White is the fallback rather than the page's background, because a page that
 * never declares an opaque background anywhere is showing the browser's, and
 * the browser's is white.
 */
function flatten(grounds: string[]): number[] {
  const layers: Rgba[] = []
  for (const value of grounds) {
    const colour = parse(value)
    if (!colour || colour[3] === 0) continue
    layers.push(colour)
    if (colour[3] === 1) break
  }
  let ground: number[] = [1, 1, 1]
  for (const layer of layers.reverse()) ground = over(layer, ground)
  return ground
}

/*
 * Desktop and a phone, because `clamp()` moves text across the boundary.
 *
 * A bold line at `clamp(1.1rem, 3vw, 2.1rem)` is 33.6px at 1440, which is
 * large text and needs 3:1, and 17.6px on a phone, which is not and needs 4.5.
 * Checking one width passes a page that fails on the other, and it is always
 * the phone that fails.
 */
const VIEWPORTS = [
  { key: 'desktop', width: 1440, height: 900 },
  { key: 'phone', width: 390, height: 844 }
] as const

async function check(
  browser: Browser,
  route: string,
  viewport: (typeof VIEWPORTS)[number]
): Promise<number> {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height }
  })
  try {
    await page.goto(ORIGIN + route, { waitUntil: 'networkidle', timeout: 30_000 })

    /*
     * One loop, no helpers, nothing named. See the note at the top of the file:
     * this body runs in the browser, where a named function does not survive
     * the transpiler.
     */
    const rows: Raw[] = await page.evaluate(() => {
      const out: Raw[] = []

      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        const style = getComputedStyle(el)

        const grounds: string[] = []
        let onMedia = false
        for (let n: HTMLElement | null = el; n; n = n.parentElement) {
          const cs = getComputedStyle(n)
          if (cs.backgroundImage !== 'none' && cs.backgroundImage.includes('url(')) {
            onMedia = true
          }
          if (n.querySelector(':scope > img, :scope > canvas, :scope > video')) {
            onMedia = true
          }
          grounds.push(cs.backgroundColor)
        }

        const classes =
          typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
            : ''
        const sel = el.tagName.toLowerCase() + classes

        let ownText = false
        for (const node of el.childNodes) {
          if (node.nodeType === 3 && (node.textContent ?? '').trim().length > 0) ownText = true
        }

        const decoration =
          el.hasAttribute('data-decoration') ||
          // An outlined display word: the fill is transparent and the shape is
          // a stroke, so there is no text colour to measure in the first place.
          (style.webkitTextStrokeWidth !== '0px' && style.color.includes('rgba(0, 0, 0, 0)'))

        if (ownText && !decoration && style.visibility !== 'hidden' && style.display !== 'none') {
          out.push({
            sel,
            px: parseFloat(style.fontSize),
            weight: Number(style.fontWeight),
            colour: style.color,
            grounds,
            onMedia
          })
        }

        for (const which of ['::before', '::after']) {
          const cs = getComputedStyle(el, which)
          const content = cs.content
          if (!content || content === 'none' || content === 'normal') continue
          if (content === '""' || content === "''") continue
          if (decoration) continue
          out.push({
            sel: sel + which,
            px: parseFloat(cs.fontSize),
            weight: Number(cs.fontWeight),
            colour: cs.color,
            grounds,
            onMedia
          })
        }
      }

      return out
    })

    /*
     * One line per distinct style, not per element. Forty identical labels is
     * one decision, and reporting it forty times buries the other thirty-nine.
     */
    const seen = new Map<string, { row: Raw; ratio: number; need: number }>()
    for (const row of rows) {
      const key = `${row.sel}|${row.px}`
      if (seen.has(key)) continue
      const colour = parse(row.colour)
      if (!colour || colour[3] === 0) continue
      const ground = flatten(row.grounds)
      const large = row.px >= 24 || (row.weight >= 700 && row.px >= 18.66)
      seen.set(key, {
        row,
        ratio: ratio(over(colour, ground), ground),
        need: large ? 3 : 4.5
      })
    }

    const fails: string[] = []
    const skipped: string[] = []
    for (const { row, ratio: value, need } of seen.values()) {
      if (row.onMedia) {
        skipped.push(`${row.px}px ${row.sel}`)
        continue
      }
      if (value < need) {
        fails.push(`  ${value.toFixed(2)}:1  needs ${need}  ${row.px}px  ${row.sel}`)
      }
    }

    console.log(`\n${route}  ${viewport.key} ${viewport.width}x${viewport.height}`)
    console.log(`  ${seen.size} distinct text styles`)
    if (skipped.length > 0) {
      console.log(`  ${skipped.length} over media, not measured: ${skipped.join(', ')}`)
    }
    if (fails.length === 0) {
      console.log('  all pass')
      return 0
    }
    console.log(`  ${fails.length} below threshold:`)
    for (const line of fails.sort()) console.log(line)
    return fails.length
  } finally {
    await page.close()
  }
}

async function main() {
  const given = process.argv.slice(2)
  if (given.length === 0) {
    console.error('pnpm contrast <route> [route ...]')
    process.exit(1)
  }
  const routes = given.map(arg => routeFrom(arg, 'contrast'))

  const state = await ensureServer()
  console.log(`dev server ${state}`)

  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-unsafe-swiftshader']
  })

  let failed = 0
  try {
    for (const route of routes) {
      for (const viewport of VIEWPORTS) failed += await check(browser, route, viewport)
    }
  } finally {
    await browser.close()
  }

  console.log('\nserver left running.')
  /*
   * A non-zero exit, so this can be a gate rather than only a report. A
   * checker that always succeeds is a checker somebody stops reading.
   */
  if (failed > 0) process.exitCode = 1
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
