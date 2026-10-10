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
 * WHERE IT IS STILL WRONG
 *
 * The ground is sampled from the element's own box, and a box is not always
 * what the text sits on. Two cases on these pages, both reported as failures
 * and both verified by hand to be fine:
 *
 *   - a button carrying a bright glow as a ::before. The glow is inside the
 *     box, so the upper quartile of the sample is the glow rather than the
 *     dark pill, and a pale label on a dark button came back at 1.42:1 where
 *     the arithmetic says twelve.
 *   - a readout whose box overlaps the pale bar beside it. The sample mixes
 *     the bar with the dark page the text is actually on.
 *
 * Both would need the sample restricted to the glyph runs rather than the box,
 * which means laying out the text to find them. Until then: check a surprising
 * failure against the computed colour and the real background before changing
 * anything, because changing a page to satisfy a wrong number makes it worse.
 * Both of these were briefly "fixed" into genuinely failing states.
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
  /** Cumulative CSS opacity, folded into the colour's alpha before scoring. */
  opacity: number
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
  if (value.startsWith('#')) {
    const hex = value.slice(1)
    const wide = hex.length >= 6
    const at = (i: number) =>
      wide
        ? parseInt(hex.slice(i * 2, i * 2 + 2), 16) / 255
        : parseInt(hex[i]! + hex[i]!, 16) / 255
    return [at(0), at(1), at(2), 1]
  }
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

    /*
     * Every colour is put through a canvas before it leaves the page.
     *
     * getComputedStyle hands back whatever notation the stylesheet used, and
     * this library's pages use several: rgb, rgba, color(srgb ...) from
     * color-mix, and oklch. Parsing each one here means a format nobody
     * thought of is read as the wrong numbers rather than rejected, and that
     * is not hypothetical: a page written in oklch had 75 of its 76 text
     * styles reported as failures, because three oklch components were being
     * divided by 255.
     *
     * So each one is painted onto a one-pixel canvas and read back. That is
     * the browser's own conversion to sRGB, it works for every notation it can
     * parse including ones that do not exist yet, and it costs one fill per
     * distinct colour. Assigning to fillStyle and reading it back is not
     * enough: Chrome hands oklch() straight back unchanged.
     */
    const probe = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true
    })!

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
        /*
         * Painted here, not later, because the alpha decides whether to stop.
         *
         * The test used to be `startsWith('rgba')`, which reads a layer
         * written as `color(srgb r g b / 0.26)` as opaque. The walk then
         * stopped on a translucent purple and composited it over white, so
         * light text on a dark navy panel was scored against a pale ground
         * and came back at 1.09:1. Every translucent panel on a dark page hit
         * it.
         */
        probe.clearRect(0, 0, 1, 1)
        probe.fillStyle = cs.backgroundColor
        probe.fillRect(0, 0, 1, 1)
        const d = probe.getImageData(0, 0, 1, 1).data
        const alpha = d[3]! / 255
        if (alpha > 0) grounds.push(`rgba(${d[0]}, ${d[1]}, ${d[2]}, ${alpha.toFixed(4)})`)
        if (alpha >= 0.999) break
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
      /*
       * Opacity counts as well as visibility.
       *
       * These pages hide hover tooltips with `opacity: 0` rather than with
       * display or visibility, so four bar-chart labels came back at 1.00:1
       * against the bars they sit over: white on white, correctly measured and
       * completely invisible. Cumulative, because the zero is often on an
       * ancestor. Partial opacity is not skipped; it is folded into the text's
       * own alpha further down, because half-opaque text really is harder to
       * read and should be scored that way.
       */
      let opacity = 1
      for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
        opacity *= Number(getComputedStyle(n).opacity)
      }

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
        opacity > 0.02 &&
        box.width > 0 &&
        box.height > 0 &&
        !clipped

      if (ownText && !decoration && visible) {
        /*
         * Accumulate ids, never overwrite.
         *
         * An element with its own text and a ::before produces two rows, and
         * setting the attribute twice left the first row pointing at an id no
         * element carried. The re-measure then looked up the wrong element, or
         * none, and reported a ratio belonging to something else: a badge that
         * is plainly 15:1 came back at 4.00:1. Queried with ~= to match one id
         * in the list.
         */
        el.setAttribute(
          'data-contrast-id',
          [el.getAttribute('data-contrast-id'), String(id)].filter(Boolean).join(' ')
        )
        out.push({
          id: id++,
          sel,
          px: parseFloat(style.fontSize),
          weight: Number(style.fontWeight),
          colour: style.color,
          text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32),
          opacity,
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
        el.setAttribute(
          'data-contrast-id',
          [el.getAttribute('data-contrast-id'), String(id)].filter(Boolean).join(' ')
        )
        out.push({
          id: id++,
          sel: sel + which,
          px: parseFloat(cs.fontSize),
          weight: Number(cs.fontWeight),
          colour: cs.color,
          text: cs.content.replace(/^"|"$/g, '').slice(0, 32),
          opacity,
          grounds,
          painted
        })
      }
    }

    /*
     * One pass, at the end, so there is exactly one place a colour is turned
     * into numbers. Painting is deferred to here rather than done inline three
     * times above, because the loop above is already the part that has to stay
     * free of helpers.
     */
    for (const row of out) {
      probe.clearRect(0, 0, 1, 1)
      probe.fillStyle = row.colour
      probe.fillRect(0, 0, 1, 1)
      const d = probe.getImageData(0, 0, 1, 1).data
      const alpha = (d[3]! / 255) * row.opacity
      row.colour = `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${alpha.toFixed(4)})`
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
        const el = document.querySelector<HTMLElement>(`[data-contrast-id~="${id}"]`)
        if (!el) {
          out.push({ id, light: null })
          continue
        }
        /*
         * Inset proportionally, not by a fixed two pixels.
         *
         * A small rounded chip shows the page through its corners, and on a
         * pill the corners are a large share of the box: a near-black label on
         * a green chip scored 1.92:1 because a quarter of what was sampled was
         * the dark page outside the curve, not the chip under the glyphs. A
         * share of the smaller side follows the radius closely enough, and two
         * pixels stays the floor for anything large.
         */
        const r = el.getBoundingClientRect()
        const inset = Math.max(2, Math.min(r.width, r.height) * 0.16)
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

/**
 * Re-measure a handful of elements one at a time, from their own screenshots.
 *
 * The bulk pass samples every painted ground out of one full-page capture,
 * which is fast and is right almost always. It is wrong when the picture and
 * the element's box stop agreeing: a page with scroll-driven reveals moves
 * things while a full-page capture scrolls through it, and then a chip that is
 * plainly near-black on green is scored against whatever the dark page had at
 * those coordinates. That reported 1.92:1 for a label measuring 11.4:1.
 *
 * So anything about to be reported as a failure is checked again properly:
 * scrolled into view, captured on its own, and sampled from that. It runs over
 * a few elements rather than hundreds, which is what makes the cost bearable.
 */
async function resample(
  page: Page,
  ids: number[]
): Promise<Map<number, { grounds: number[][]; colour: string }>> {
  const out = new Map<number, { grounds: number[][]; colour: string }>()
  if (ids.length === 0) return out

  /*
   * Colours first, one element at a time, each scrolled into view.
   *
   * Two passes rather than one batch, and the scrolling is the reason. These
   * pages reveal text as you reach it, so an element still above the fold is
   * sitting at its pre-reveal colour: a footer link read in a batch from the
   * top of the page came back part-faded, and the ratio moved between 1.91
   * and 2.16 across runs while the settled colour measures 4.62. Scroll to it,
   * let the reveal finish, then read.
   *
   * And before the hide style goes on, not after: the computed colour is
   * transparent once the text is hidden, which scores every element against
   * itself at 1.00:1.
   */
  const colours = new Map<number, string>()
  for (const id of ids) {
    const handle = await page.$(`[data-contrast-id~="${id}"]`)
    if (!handle) continue
    try {
      await handle.scrollIntoViewIfNeeded({ timeout: 2000 })
      await page.waitForTimeout(260)
      colours.set(
        id,
        await handle.evaluate(el => {
          const probe = document.createElement('canvas').getContext('2d', {
            willReadFrequently: true
          })!
          probe.clearRect(0, 0, 1, 1)
          probe.fillStyle = getComputedStyle(el as HTMLElement).color
          probe.fillRect(0, 0, 1, 1)
          const d = probe.getImageData(0, 0, 1, 1).data
          let opacity = 1
          for (
            let n: HTMLElement | null = el as HTMLElement;
            n && n !== document.body;
            n = n.parentElement
          ) {
            opacity *= Number(getComputedStyle(n).opacity)
          }
          return `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${((d[3]! / 255) * opacity).toFixed(4)})`
        })
      )
    } catch {
      // Left out; the bulk pass's colour stands.
    }
  }

  const hide = await page.addStyleTag({
    content:
      '*, *::before, *::after { color: transparent !important; text-shadow: none !important; }' +
      'text, tspan, textPath { fill: transparent !important; stroke: none !important; }'
  })

  for (const id of ids) {
    const handle = await page.$(`[data-contrast-id~="${id}"]`)
    if (!handle) continue
    const nowColour = colours.get(id)
    if (!nowColour) continue
    try {
      await handle.scrollIntoViewIfNeeded({ timeout: 2000 })

      /*
       * Hide the element's own children while capturing its ground.
       *
       * What is wanted is what sits behind the glyphs, and a child element is
       * not that: a status badge with a bright dot in it had the dot sampled
       * as part of its background, and light text on a near-black pill came
       * back at 3.97:1 where the arithmetic says fifteen. Visibility rather
       * than display, so the box does not collapse and the capture still
       * covers the same pixels.
       */
      await handle.evaluate(el => {
        for (const kid of el.children) {
          ;(kid as HTMLElement).dataset['contrastHidden'] = (kid as HTMLElement).style.visibility
          ;(kid as HTMLElement).style.visibility = 'hidden'
        }
      })
      const radius = await handle.evaluate(el => {
        const r = getComputedStyle(el as HTMLElement).borderTopLeftRadius
        const box = (el as HTMLElement).getBoundingClientRect()
        const n = parseFloat(r) || 0
        // A "fully rounded" radius is written as something huge; cap it at
        // half the height, which is what the browser actually paints.
        return Math.min(n, box.height / 2)
      })
      await page.evaluate(r => {
        ;(window as never as { __contrastRadius: number }).__contrastRadius = r
      }, radius)
      const shot = await handle.screenshot({ type: 'png', timeout: 5000 })
      await handle.evaluate(el => {
        for (const kid of el.children) {
          const was = (kid as HTMLElement).dataset['contrastHidden'] ?? ''
          ;(kid as HTMLElement).style.visibility = was
          delete (kid as HTMLElement).dataset['contrastHidden']
        }
      })
      const pair: number[][] | null = await page.evaluate(
        async data => {
          const image = new Image()
          image.src = 'data:image/png;base64,' + data
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = image.naturalWidth
          canvas.height = image.naturalHeight
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!
          ctx.drawImage(image, 0, 0)
          /*
           * Inset by the corner radius as well as by a share of the box.
           *
           * A pill does not paint its own corners, so the box corners hold
           * whatever is behind it. On a badge 104 by 34 with a fully rounded
           * end, enough of the orange panel behind showed inside the sample
           * for the upper quartile to be that orange rather than the badge:
           * light text on a near-black pill was scored against the panel it
           * sits on and came back at 4.00:1 where the arithmetic says fifteen.
           */
          const radius = Number(
            (window as never as { __contrastRadius?: number }).__contrastRadius || 0
          )
          const base = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) * 0.16))
          const insetX = Math.max(base, Math.round(radius * 0.8))
          const insetY = base
          const w = Math.max(1, canvas.width - insetX * 2)
          const h = Math.max(1, canvas.height - insetY * 2)
          const px = ctx.getImageData(insetX, insetY, w, h).data
          const lums: number[] = []
          const seenPx: number[][] = []
          for (let i = 0; i < px.length; i += 4 * 4) {
            const r8 = px[i]!
            const g8 = px[i + 1]!
            const b8 = px[i + 2]!
            lums.push(0.2126 * r8 + 0.7152 * g8 + 0.0722 * b8)
            seenPx.push([r8 / 255, g8 / 255, b8 / 255])
          }
          if (lums.length === 0) return null
          const order = lums.map((l, i) => [l, i]).sort((a, b2) => a[0]! - b2[0]!)
          const lo = Math.min(order.length - 1, Math.floor(0.25 * order.length))
          const hi = Math.min(order.length - 1, Math.floor(0.75 * order.length))
          return [seenPx[order[hi]![1]!]!, seenPx[order[lo]![1]!]!]
        },
        shot.toString('base64')
      )
      if (pair) out.set(id, { grounds: pair, colour: nowColour })
    } catch {
      // An element that cannot be scrolled to or captured keeps the ratio the
      // bulk pass gave it, which is the conservative answer.
    }
  }

  await hide.evaluate(node => (node as HTMLStyleElement).remove())
  return out
}

async function check(
  browser: Browser,
  route: string,
  viewport: (typeof VIEWPORTS)[number]
): Promise<number> {
  /*
   * Measured with reduced motion, which is the settled page.
   *
   * These pages reveal text by animating opacity, and a checker that arrives
   * mid-reveal measures a frame nobody reads: the eight letters of one button
   * came back at eight different ratios between 1.58 and 2.68 because the
   * stagger was still running. Reduced motion is the state the page itself
   * defines as finished.
   */
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: 'reduce'
  })
  try {
    await page.goto(ORIGIN + route, { waitUntil: 'networkidle', timeout: 30_000 })

    /*
     * Freeze every animation into one defined state before measuring.
     *
     * A page with a running marquee gives a different answer every run,
     * because the ground sampled under a word depends on where the band had
     * got to: the same page came back with 15 failures and then 19, and
     * neither number was wrong. Finite animations are run to their end, which
     * is the settled state a reveal is meant to arrive at. Endless ones cannot
     * end, so they are held at their first frame, which is at least the same
     * frame every time.
     */
    await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        const iterations = a.effect?.getTiming?.().iterations
        if (iterations === Infinity) {
          a.pause()
          a.currentTime = 0
        } else {
          try {
            a.finish()
          } catch {
            a.pause()
          }
        }
      }
    })
    await page.waitForTimeout(120)

    const rows = await collect(page)
    const sampled = await sampleGrounds(
      page,
      rows.filter(row => row.painted).map(row => row.id)
    )

    /*
     * One line per distinct style, not per element. Forty identical labels is
     * one decision, and reporting it forty times buries the other thirty-nine.
     */
    const seen = new Map<
      string,
      { row: Raw; ratio: number; need: number; sampledGround: boolean; ground: number[] }
    >()
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
      let darkest = grounds[0]!
      for (const g of grounds) if (luminance(g) < luminance(darkest)) darkest = g
      seen.set(key, {
        row,
        ratio: worst,
        need: large ? 3 : 4.5,
        sampledGround: sampled.has(row.id),
        ground: darkest
      })
    }

    /*
     * Failures are checked for being visible at all before they are reported.
     *
     * A page can paint something over its own text. One of these has a
     * paragraph sitting behind a stack of illustrated rings: it is in the DOM,
     * it has a box and a colour, and nobody will ever see it. Reporting a
     * ratio for it asks somebody to fix the legibility of text that is not on
     * the screen.
     *
     * Only failures are checked, because the test needs the element scrolled
     * into view and that is far too slow to do for every piece of text on the
     * page. Everything that passes is left alone: a covered element that
     * passes costs nothing.
     */
    /*
     * Anything about to be reported is measured again from its own capture,
     * because the bulk pass can disagree with the page on a layout that moves.
     */
    const suspects = [...seen.values()].filter(
      v => v.ratio < v.need && !(v.row.painted && !v.sampledGround)
    )
    /*
     * Every failure, not only the pixel-sampled ones.
     *
     * Scroll-triggered reveals have not fired while the page sits at the top,
     * so their text is still at its pre-reveal colour: six styles on one page
     * came back at exactly 1.00:1 because the text was the same light grey as
     * the ground it was about to animate out of. Resampling scrolls the
     * element into view, which fires the reveal, and reads the colour and the
     * ground together afterwards.
     */
    const exact = await resample(page, suspects.map(v => v.row.id))
    for (const v of suspects) {
      const fresh = exact.get(v.row.id)
      if (!fresh) continue
      const grounds = fresh.grounds
      const colour = parse(fresh.colour)
      if (!colour) continue
      v.row.colour = fresh.colour
      let worst = Infinity
      for (const g of grounds) worst = Math.min(worst, ratio(over(colour, g), g))
      v.ratio = worst
      let darkest = grounds[0]!
      for (const g of grounds) if (luminance(g) < luminance(darkest)) darkest = g
      v.ground = darkest
    }

    const coveredIds = new Set<number>(
      await page.evaluate(
        ids =>
          ids.filter(id => {
            const el = document.querySelector<HTMLElement>(`[data-contrast-id~="${id}"]`)
            if (!el) return false
            el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
            const r = el.getBoundingClientRect()
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
            return top !== null && top !== el && !el.contains(top)
          }),
        [...seen.values()]
          .filter(v => v.ratio < v.need && !(v.row.painted && !v.sampledGround))
          .map(v => v.row.id)
      )
    )

    const fails: string[] = []
    const covered: string[] = []
    const unknown: string[] = []
    for (const { row, ratio: value, need, sampledGround, ground } of seen.values()) {
      if (row.painted && !sampledGround) {
        unknown.push(`${row.px}px ${row.sel}`)
        continue
      }
      if (value < need) {
        if (coveredIds.has(row.id)) {
          covered.push(`${row.px}px ${row.sel} "${row.text}"`)
          continue
        }
        const how = sampledGround ? ' (sampled)' : ''
        /*
         * Which way has more room, not which way it already leans.
         *
         * The first version of this said "move it the way it already is",
         * which is right for text well clear of its ground and wrong at the
         * middle: a near-white label on a mid green is nominally the lighter
         * of the two and can only reach 1.74:1 by going whiter, where going
         * dark reaches 11.4:1. Comparing the two ends says so.
         */
        const toWhite = ratio([1, 1, 1], ground)
        const toBlack = ratio([0, 0, 0], ground)
        const way = toWhite > toBlack ? 'lighter' : 'darker'
        fails.push(
          `  ${value.toFixed(2)}:1  needs ${need}  ${row.px}px  ${row.sel}${how}  "${row.text}"` +
            `  [${way}; on rgb(${ground.map(c => Math.round(c * 255)).join(',')})]`
        )
      }
    }

    console.log(`\n${route}  ${viewport.key} ${viewport.width}x${viewport.height}`)
    const painted = [...seen.values()].filter(v => v.sampledGround).length
    console.log(`  ${seen.size} distinct text styles, ${painted} sampled off a painted ground`)
    if (unknown.length > 0) {
      console.log(`  ${unknown.length} could not be sampled: ${unknown.join(', ')}`)
    }
    if (covered.length > 0) {
      console.log(`  ${covered.length} would fail but are painted over, so nobody reads them:`)
      for (const line of covered.sort()) console.log(`    ${line}`)
    }
    if (fails.length === 0) {
      console.log('  all pass')
      return 0
    }
    console.log(`  ${fails.length} below threshold:`)
    for (const line of fails.sort()) console.log(line)

    /*
     * Which colours are responsible, worst first.
     *
     * Failures come in families: one token used in thirty places is one
     * decision and thirty lines of report. Fixing the colour fixes the lot,
     * and this is the line that says which colour to fix.
     */
    const byColour = new Map<string, { n: number; worst: number }>()
    for (const { row, ratio: value, need, sampledGround } of seen.values()) {
      if (row.painted && !sampledGround) continue
      if (value >= need) continue
      const hit = byColour.get(row.colour) ?? { n: 0, worst: Infinity }
      hit.n += 1
      hit.worst = Math.min(hit.worst, value)
      byColour.set(row.colour, hit)
    }
    const families = [...byColour.entries()].sort((a, b) => b[1].n - a[1].n)
    console.log('  colours responsible:')
    for (const [colour, { n, worst }] of families) {
      console.log(`    ${colour.padEnd(28)} ${String(n).padStart(3)} styles, worst ${worst.toFixed(2)}:1`)
    }
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
