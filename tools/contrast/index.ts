/*
 * pnpm contrast <route> [...]
 *
 * Every distinct text style on a page, measured against what is actually
 * behind it, with the ratio it really has.
 *
 * This exists because judging contrast by looking is not a skill anybody has.
 * Its first run across three pages that had just been built carefully and
 * screenshotted found 37 text styles below their threshold, the worst at
 * 1.37:1. Not one of them was visible as a problem in a picture, and half were
 * made by a colour change three rules away from the text they broke.
 *
 * WHAT IT READS, AND WHY IT HAS TO BE THE PAGE
 *
 * Colours come from `getComputedStyle` on the live DOM, never from parsing the
 * stylesheet. By the time a colour reaches the screen it has been through
 * color-mix, custom property inheritance, a ground selector that may have
 * outranked the page's own `:root`, and whatever the cascade did with the order
 * the stylesheets happened to load in. A checker that reads the source is
 * checking what somebody meant; this checks what the browser did.
 *
 * Translucent text is flattened onto what is behind it, and a translucent
 * background is composited down onto the first opaque layer under it, in order.
 * Skipping either is how a quiet label written as `rgba(…, 0.7)` goes
 * unmeasured, which is exactly how a theme writes one.
 *
 * Pseudo-element text is read too. On some of these pages the smallest type is
 * a `::before` carrying a frame number or a stamped legend, and a checker that
 * only walks elements never sees it.
 *
 * GROUNDS THAT ARE NOT A COLOUR
 *
 * Walking up the tree for the first opaque background only works while the
 * background is a colour. A panel painted with a gradient has
 * `background-color: transparent`, so the walk sails past it and finds whatever
 * is behind the panel: on a dark page with a pale plate on it, that reported
 * 1.12:1 for near-black text sitting on a light background. Not a near miss, an
 * inversion.
 *
 * So anything painted — a gradient, an image, a canvas — is measured from the
 * rendered pixels instead. The page is screenshot once with every glyph made
 * transparent, which leaves only what is behind the text, and that picture is
 * handed back to the browser to be read with a canvas. For each element the
 * lightest and darkest pixel in its own box are found and the text is scored
 * against the worse of the two, because text that clears both ends of a
 * gradient clears everywhere along it.
 *
 * All of that happens in the page and only numbers come back, which is the
 * house rule about not shipping a framebuffer across the protocol. One
 * screenshot, one transfer, every element sampled from it.
 *
 * WHAT IT STILL DOES NOT CHECK
 *
 * Text the page marks `data-decoration`. WCAG 1.4.3 exempts pure decoration,
 * but the page has to say which of its text that is, in the markup, where a
 * reviewer sees the claim. Guessing from a class name, or from `aria-hidden`,
 * would have exempted small print that people do read.
 */

import { chromium, type Browser, type Page } from 'playwright'
import { ensureServer, routeFrom, ORIGIN } from '../dev-server'

/** What the page hands back for one text style. Strings, not numbers. */
type Raw = {
  /** Index into the tagged elements, so a sampled ground can be matched back. */
  id: number
  sel: string
  px: number
  weight: number
  colour: string
  /** A few words of the text itself, so a reported failure can be found. */
  text: string
  /** Backgrounds from the element up to the first opaque one, nearest first. */
  grounds: string[]
  /** True when the ground is painted rather than a colour, so it must be sampled. */
  painted: boolean
}

/** The lightest and darkest pixel behind one element, as `r,g,b` triples. */
type Sampled = { id: number; light: number[]; dark: number[] } | { id: number; light: null }

type Rgba = [number, number, number, number]

/** A computed colour as four channels in 0..1. Chrome returns `color(srgb …)`
 *  for anything that came out of a `color-mix`, which is most of this library. */
function parse(value: string): Rgba | null {
  const parts = value.match(/[\d.]+/g)
  if (!parts) return null
  const n = parts.map(Number)
  if (value.startsWith('color(srgb')) return [n[0]!, n[1]!, n[2]!, n[3] ?? 1]
  return [n[0]! / 255, n[1]! / 255, n[2]! / 255, n[3] ?? 1]
}

/** Source over destination. */
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

/** The first opaque colour behind an element, with translucent layers over it. */
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
 * A bold line at `clamp(1.1rem, 3vw, 2.1rem)` is 33.6px at 1440, which is large
 * text and needs 3:1, and 17.6px on a phone, which is not and needs 4.5.
 * Checking one width passes a page that fails on the other, and it is always
 * the phone that fails.
 */
const VIEWPORTS = [
  { key: 'desktop', width: 1440, height: 900 },
  { key: 'phone', width: 390, height: 844 }
] as const

/*
 * Collects one row per piece of text, and tags each element so a sampled
 * ground can be matched back to it.
 *
 * Everything in here runs in the browser, where the transpiler's keep-names
 * helper does not exist: a named function inside this body throws
 * `__name is not defined` on its first call. One loop, nothing named.
 */
async function collect(page: Page): Promise<Raw[]> {
  return page.evaluate(() => {
    const out: Raw[] = []
    let id = 0

    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const style = getComputedStyle(el)

      /*
       * Walk up until something stops the light, and stop there. A gradient on
       * <body> says nothing about text on an opaque panel three levels down,
       * so not stopping marked every element on a gradient-heavy page as
       * unmeasurable. A painted layer is checked before the colour on the same
       * element, because where both exist the image paints over the colour.
       */
      const grounds: string[] = []
      let painted = false
      for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n)
        const hasImage =
          cs.backgroundImage !== 'none' &&
          (cs.backgroundImage.includes('url(') || cs.backgroundImage.includes('gradient('))
        if (hasImage || n.querySelector(':scope > img, :scope > canvas, :scope > video')) {
          painted = true
          break
        }
        const colour = cs.backgroundColor
        grounds.push(colour)
        const alpha = colour.startsWith('rgba') ? Number(colour.split(',')[3]) : 1
        if (alpha === 1) break
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

      /*
       * `closest`, not `hasAttribute`. Marking a container as decoration has to
       * cover what is inside it: the digit wheel marks the cell, and the glyph
       * that needs excusing is a span two levels down inside it.
       */
      const decoration =
        el.closest('[data-decoration]') !== null ||
        // An outlined display word: the fill is transparent and the shape is a
        // stroke, so there is no text colour to measure in the first place.
        (style.webkitTextStrokeWidth !== '0px' && style.color.includes('rgba(0, 0, 0, 0)'))

      /*
       * Visible also means not clipped away by an ancestor.
       *
       * An odometer is a tall strip of digits behind a one-digit window, and
       * every digit not currently showing is still in the DOM with a real box.
       * Without this the checker reports the dim ones nobody can see, and the
       * only way to make it quiet is to change a colour that is not on screen.
       */
      const box = el.getBoundingClientRect()
      let clipped = false
      for (let n: HTMLElement | null = el.parentElement; n; n = n.parentElement) {
        const cs = getComputedStyle(n)
        if (cs.overflow === 'visible' && cs.overflowX === 'visible' && cs.overflowY === 'visible') {
          continue
        }
        const outer = n.getBoundingClientRect()
        if (
          box.bottom <= outer.top + 1 ||
          box.top >= outer.bottom - 1 ||
          box.right <= outer.left + 1 ||
          box.left >= outer.right - 1
        ) {
          clipped = true
          break
        }
      }
      const visible =
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        box.width > 0 &&
        box.height > 0 &&
        !clipped

      if (ownText && !decoration && visible) {
        el.setAttribute('data-contrast-id', String(id))
        out.push({
          id: id++,
          sel,
          px: parseFloat(style.fontSize),
          weight: Number(style.fontWeight),
          colour: style.color,
          text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32),
          grounds,
          painted
        })
      }

      for (const which of ['::before', '::after']) {
        const cs = getComputedStyle(el, which)
        const content = cs.content
        if (!content || content === 'none' || content === 'normal') continue
        if (content === '""' || content === "''") continue
        if (decoration || !visible) continue
        // A pseudo-element cannot carry its own attribute, so it is sampled
        // against its host's box, which is where it is painted anyway.
        el.setAttribute('data-contrast-id', String(id))
        out.push({
          id: id++,
          sel: sel + which,
          px: parseFloat(cs.fontSize),
          weight: Number(cs.fontWeight),
          colour: cs.color,
          text: cs.content.replace(/^"|"$/g, '').slice(0, 32),
          grounds,
          painted
        })
      }
    }

    return out
  })
}

/**
 * The lightest and darkest pixel actually behind each painted-ground element.
 *
 * The page is screenshot with every glyph transparent, so the picture is the
 * background alone, and that picture goes back into the browser to be read
 * through a canvas. Only the extremes come back.
 */
async function sampleGrounds(page: Page, ids: number[]): Promise<Map<number, number[][]>> {
  const sampled = new Map<number, number[][]>()
  if (ids.length === 0) return sampled

  // Hide the text, not the elements. Hiding elements would reflow the page and
  // every box measured a moment ago would be wrong.
  /*
   * `fill` as well as `color`, and that is not belt and braces.
   *
   * SVG text paints with `fill`, so `color: transparent` leaves it on the
   * screen. The sampler then read the glyphs it was supposed to have removed
   * and reported the text against itself: four labels in the diagrams came back
   * at 1.00:1 and 1.49:1, which looked like a catastrophic failure and was a
   * measurement of nothing.
   *
   * Scoped to text elements. Putting `fill: transparent` on `*` would empty
   * every icon and diagram on the page, and the ground behind a label would
   * become whatever was under the drawing rather than the drawing.
   */
  const hide = await page.addStyleTag({
    content:
      '*, *::before, *::after { color: transparent !important; text-shadow: none !important; }' +
      'text, tspan, textPath { fill: transparent !important; stroke: none !important; }'
  })
  const shot = await page.screenshot({ fullPage: true, type: 'png' })
  await hide.evaluate(node => (node as HTMLStyleElement).remove())

  const rows: Sampled[] = await page.evaluate(
    async ({ data, wanted }) => {
      const image = new Image()
      image.src = 'data:image/png;base64,' + data
      await image.decode()

      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(image, 0, 0)

      // The shot is a full-page capture in CSS pixels, so a box has to be put
      // back into page coordinates before it indexes into it.
      const scale = image.naturalWidth / document.documentElement.clientWidth
      const out: Sampled[] = []

      for (const id of wanted) {
        const el = document.querySelector<HTMLElement>(`[data-contrast-id="${id}"]`)
        if (!el) {
          out.push({ id, light: null })
          continue
        }
        // Inset by two pixels, so the element's own border is not sampled as
        // the thing behind its text.
        const r = el.getBoundingClientRect()
        const inset = 2
        const x = Math.max(0, Math.round((r.left + scrollX + inset) * scale))
        const y = Math.max(0, Math.round((r.top + scrollY + inset) * scale))
        const w = Math.min(Math.round((r.width - inset * 2) * scale), canvas.width - x)
        const h = Math.min(Math.round((r.height - inset * 2) * scale), canvas.height - y)
        if (w < 1 || h < 1) {
          out.push({ id, light: null })
          continue
        }

        const px = ctx.getImageData(x, y, w, h).data

        /*
         * Percentiles, not the extremes, and that is not a fudge.
         *
         * A bounding box is not only what is behind the glyphs. It takes in the
         * element's own border, the shadow under it and whatever sits in the
         * corners, and on a plate with a hard inset shade that pulled the
         * darkest pixel two stops below anything the text actually crosses. The
         * fifth and ninety-fifth percentiles describe the ground the text sits
         * on; the absolute min and max describe its edges.
         */
        const lums: number[] = []
        const seenPx: number[][] = []
        for (let i = 0; i < px.length; i += 4 * 8) {
          const r8 = px[i]!
          const g8 = px[i + 1]!
          const b8 = px[i + 2]!
          lums.push(0.2126 * r8 + 0.7152 * g8 + 0.0722 * b8)
          seenPx.push([r8, g8, b8])
        }
        if (lums.length === 0) {
          out.push({ id, light: null })
          continue
        }
        // Indexed inline rather than through a helper: a named function in this
        // body does not survive the transpiler, which is the note at the top of
        // the file and was written after this exact mistake.
        const order = lums.map((l, i) => [l, i]).sort((a, b2) => a[0]! - b2[0]!)
        /*
         * Quartiles, not the fifth and ninety-fifth.
         *
         * A box is not pure background even with the glyphs removed: it can
         * hold an inline icon, a rule, a border or part of a mark printed on
         * the plate. At the fifth percentile a 34px icon well on a pale plate
         * came back as 1.00:1 against its own near-black label, because a small
         * dark shape inside the box dragged the low end down to meet the text.
         * The quartiles tolerate a quarter of the box being something else at
         * each end, and still span a real gradient.
         */
        const loAt = Math.min(order.length - 1, Math.floor(0.25 * order.length))
        const hiAt = Math.min(order.length - 1, Math.floor(0.75 * order.length))
        out.push({
          id,
          light: seenPx[order[hiAt]![1]!]!,
          dark: seenPx[order[loAt]![1]!]!
        })
      }
      return out
    },
    { data: shot.toString('base64'), wanted: ids }
  )

  for (const row of rows) {
    if (row.light === null) continue
    const both = row as { id: number; light: number[]; dark: number[] }
    sampled.set(row.id, [
      both.light.map(c => c / 255),
      both.dark.map(c => c / 255)
    ])
  }
  return sampled
}

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
    const rows = await collect(page)
    const sampled = await sampleGrounds(
      page,
      rows.filter(row => row.painted).map(row => row.id)
    )

    /*
     * One line per distinct style, not per element. Forty identical labels is
     * one decision, and reporting it forty times buries the other thirty-nine.
     */
    const seen = new Map<string, { row: Raw; ratio: number; need: number; sampledGround: boolean }>()
    for (const row of rows) {
      /*
       * Keyed on the decision rather than on the tag.
       *
       * `${sel}|${px}` collapsed every 11px <i> on the page into one row, and
       * the one that got reported was whichever came first in the document
       * rather than the one that failed. Chasing a reported failure led to an
       * element that passed comfortably, twice. Colour and ground are what make
       * two pieces of text the same decision; the tag is not.
       */
      const key = `${row.sel}|${row.px}|${row.colour}|${row.grounds[0] ?? ''}|${row.painted}`
      if (seen.has(key)) continue
      const colour = parse(row.colour)
      if (!colour || colour[3] === 0) continue

      const grounds = sampled.get(row.id) ?? [flatten(row.grounds)]
      // Against the worst of them: text that clears both ends of a gradient
      // clears everywhere along it.
      let worst = Infinity
      for (const ground of grounds) {
        worst = Math.min(worst, ratio(over(colour, ground), ground))
      }

      const large = row.px >= 24 || (row.weight >= 700 && row.px >= 18.66)
      seen.set(key, {
        row,
        ratio: worst,
        need: large ? 3 : 4.5,
        sampledGround: sampled.has(row.id)
      })
    }

    const fails: string[] = []
    const unknown: string[] = []
    for (const { row, ratio: value, need, sampledGround } of seen.values()) {
      if (row.painted && !sampledGround) {
        unknown.push(`${row.px}px ${row.sel}`)
        continue
      }
      if (value < need) {
        const how = sampledGround ? ' (sampled)' : ''
        fails.push(
          `  ${value.toFixed(2)}:1  needs ${need}  ${row.px}px  ${row.sel}${how}  "${row.text}"`
        )
      }
    }

    console.log(`\n${route}  ${viewport.key} ${viewport.width}x${viewport.height}`)
    const painted = [...seen.values()].filter(v => v.sampledGround).length
    console.log(`  ${seen.size} distinct text styles, ${painted} sampled off a painted ground`)
    if (unknown.length > 0) {
      console.log(`  ${unknown.length} could not be sampled: ${unknown.join(', ')}`)
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
   * A non-zero exit, so this can be a gate rather than only a report. A checker
   * that always succeeds is a checker somebody stops reading.
   */
  if (failed > 0) process.exitCode = 1
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
