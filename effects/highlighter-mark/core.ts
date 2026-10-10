/*
 * HighlighterMark: Beamish
 * https://beamish.ink/effects/highlighter-mark
 *
 * Somebody going through a page with a highlighter, one phrase at a time.
 *
 * WHAT IT MARKS
 *
 * The `<mark>` elements already in the text. That is the whole interface, and
 * it is deliberate: the browser has had an element for "this bit matters" since
 * HTML 4, screen readers announce it, and a page that uses it reads correctly
 * with this effect switched off, with CSS off, and in a feed reader. Nothing
 * here parses prose, searches for strings, or wraps words in spans, so the text
 * selects and copies exactly as it did before.
 *
 * WHY IT IS NOT A CSS BACKGROUND
 *
 * `background: linear-gradient(...)` with an animated size is the usual way, and
 * it gets the sweep right and everything else wrong. A highlighter is a wet,
 * wide, soft-tipped pen held by a hand, and four things follow from that which a
 * background cannot do:
 *
 *   The band is not level. A hand draws a slight slope and the pen is not held
 *   square, so the top and bottom edges are not parallel.
 *
 *   The edges are ragged at the scale of the tip, not smooth at the scale of
 *   the box. A background edge is a straight line by construction.
 *
 *   It overshoots. Nobody stops exactly on the last letter: the stroke runs
 *   past the word at both ends, and by different amounts.
 *
 *   The ink is darker where the pen went twice and where it stopped. That
 *   second pass down the middle is most of what makes it read as a pen rather
 *   than as a fill.
 *
 * So each mark becomes a polygon in one SVG laid over the text, blended with
 * `multiply` because that is what translucent ink on paper does: the glyphs
 * stay on top and darken the ink rather than being covered by it.
 *
 * A phrase that wraps gets one stroke per line, because that is what a person
 * does, and `getClientRects` already returns exactly those boxes.
 *
 * ONE SHOT
 *
 * It marks and it is done, which is what a person does. The order is the order
 * the marks appear in the document, each one starting a little after the last,
 * and `t` is seconds from the start, so the whole thing is a function of t and
 * the recorder can ask for any frame of it.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type HighlighterMarkOptions = BaseOptions & {
  /** What to mark. Defaults to the element HTML already has for the job. */
  selector: string
  /** The ink. */
  ink: string
  /** How opaque one pass of the pen is, 0 to 1. */
  strength: number
  /** Band height, as a share of the line's height. */
  height: number
  /** How far the stroke runs past the phrase at each end, in pixels. */
  overshoot: number
  /** Slope of the hand, in degrees. */
  tilt: number
  /** How ragged the edges are, in pixels. */
  rag: number
  /** Milliseconds for one stroke to be drawn. */
  duration: number
  /** Milliseconds between the start of one stroke and the next. */
  stagger: number
  /** Milliseconds of stillness before the first stroke. */
  hold: number
  /** Seed for the hand. The same seed draws the same strokes. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const highlighterMarkDefaults: HighlighterMarkOptions = {
  selector: 'mark',
  ink: '#ffe14d',
  strength: 0.55,
  height: 0.72,
  overshoot: 7,
  tilt: 1.1,
  rag: 1.6,
  duration: 420,
  stagger: 260,
  hold: 260,
  seed: 3
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** One hash, one point on an edge. Stable for a given index and seed. */
function hash(n: number, seed: number): number {
  const x = Math.sin(n * 91.73 + seed * 47.11 + 13.7) * 43758.5453123
  return x - Math.floor(x)
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/* Fast at the start and settling at the end: a pen is thrown, not driven. */
const easeOutCubic = (n: number) => 1 - Math.pow(1 - n, 3)

type Stroke = {
  /** The band, as an SVG polygon points list. */
  points: string
  /** The second pass down the middle, which is where the ink doubles. */
  core: string
  left: number
  width: number
  group: SVGGElement
  clip: SVGRectElement
}

class HighlighterMarkSurface implements Surface<HighlighterMarkOptions> {
  private host: HTMLElement | null = null
  private svg: SVGSVGElement | null = null
  private defs: SVGDefsElement | null = null
  private strokes: Stroke[] = []
  private builtFor = ''
  private restorePosition = ''

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host

    /*
     * The overlay is absolutely positioned inside the host, so the host has to
     * be a containing block. A static host is the common case and silently puts
     * every stroke at the top left of the page, so it is promoted here and put
     * back in teardown.
     */
    const position = getComputedStyle(ctx.host).position
    if (position === 'static') {
      this.restorePosition = ctx.host.style.position
      ctx.host.style.position = 'relative'
    }

    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('aria-hidden', 'true')
    svg.style.position = 'absolute'
    svg.style.inset = '0'
    svg.style.width = '100%'
    svg.style.height = '100%'
    svg.style.pointerEvents = 'none'
    svg.style.overflow = 'visible'
    /*
     * Multiply, so the glyphs darken the ink instead of being covered by it.
     * This is the one line that makes it ink rather than a sticker, and it is
     * also why the item is for paper: multiply against a dark ground is black.
     */
    svg.style.mixBlendMode = 'multiply'

    this.defs = document.createElementNS(SVG_NS, 'defs')
    svg.appendChild(this.defs)
    ctx.host.appendChild(svg)
    this.svg = svg
  }

  /*
   * Measure the marks and build a stroke for each line of each one.
   *
   * Rebuilt only when something that changes the geometry changes, because
   * getClientRects forces layout and this would otherwise run every frame.
   */
  private build(opts: HighlighterMarkOptions): void {
    const host = this.host
    const svg = this.svg
    const defs = this.defs
    if (!host || !svg || !defs) return

    const box = host.getBoundingClientRect()
    const key = [
      opts.selector,
      opts.height,
      opts.overshoot,
      opts.tilt,
      opts.rag,
      opts.seed,
      Math.round(box.width),
      Math.round(box.height)
    ].join('|')
    if (key === this.builtFor) return
    this.builtFor = key

    for (const stroke of this.strokes) stroke.group.remove()
    defs.replaceChildren()
    this.strokes = []

    const marks = host.querySelectorAll<HTMLElement>(opts.selector)
    let n = 0

    marks.forEach(mark => {
      // One stroke per line. A phrase that wraps is two passes of the pen, and
      // getClientRects already returns exactly those boxes.
      for (const rect of Array.from(mark.getClientRects())) {
        const seedN = n++
        const h = rect.height * opts.height
        const left = rect.left - box.left - opts.overshoot * (0.6 + hash(seedN, opts.seed) * 0.8)
        const right =
          rect.right - box.left + opts.overshoot * (0.6 + hash(seedN + 50, opts.seed) * 0.8)
        const width = Math.max(right - left, 1)
        // Sat on the baseline rather than centred: a highlighter covers the
        // body of the line and lets the ascenders out of the top.
        const mid = rect.top - box.top + rect.height * 0.62

        const slope = Math.tan((opts.tilt * (hash(seedN + 7, opts.seed) - 0.3)) * (Math.PI / 180))

        /*
         * The band, as a polygon walked out along the top and back along the
         * bottom. The two edges are ragged independently, because a soft tip
         * wears differently on each side of the stroke.
         */
        const steps = Math.max(4, Math.round(width / 14))
        const top: string[] = []
        const bottom: string[] = []
        for (let i = 0; i <= steps; i++) {
          const s = i / steps
          const x = left + s * width
          const drop = (s - 0.5) * width * slope
          const ragTop = (hash(seedN * 31 + i, opts.seed) - 0.5) * 2 * opts.rag
          const ragBottom = (hash(seedN * 31 + i + 500, opts.seed) - 0.5) * 2 * opts.rag
          // The ends are rounded off, so the stroke has a tip rather than a
          // corner. A square end is the clearest sign of a rectangle.
          const taper = Math.min(1, Math.min(s, 1 - s) * 8)
          const half = (h / 2) * (0.55 + 0.45 * taper)
          top.push(`${x.toFixed(2)},${(mid + drop - half + ragTop).toFixed(2)}`)
          bottom.push(`${x.toFixed(2)},${(mid + drop + half + ragBottom).toFixed(2)}`)
        }
        bottom.reverse()

        /*
         * The second pass. Shorter, thinner and set low, because a hand going
         * back over a line does not retrace it exactly, and the doubled ink is
         * most of what makes this read as a pen.
         */
        const coreTop: string[] = []
        const coreBottom: string[] = []
        const from = 0.06 + hash(seedN + 11, opts.seed) * 0.1
        const to = 0.82 + hash(seedN + 13, opts.seed) * 0.12
        for (let i = 0; i <= steps; i++) {
          const s = from + (i / steps) * (to - from)
          const x = left + s * width
          const drop = (s - 0.5) * width * slope
          const half = h * 0.26
          const wobble = (hash(seedN * 17 + i, opts.seed) - 0.5) * opts.rag
          coreTop.push(`${x.toFixed(2)},${(mid + drop - half + h * 0.1 + wobble).toFixed(2)}`)
          coreBottom.push(`${x.toFixed(2)},${(mid + drop + half + h * 0.1 + wobble).toFixed(2)}`)
        }
        coreBottom.reverse()

        const group = document.createElementNS(SVG_NS, 'g')
        const clipId = `beamish-hm-${seedN}-${Math.random().toString(36).slice(2, 8)}`
        const clipPath = document.createElementNS(SVG_NS, 'clipPath')
        clipPath.setAttribute('id', clipId)
        const clip = document.createElementNS(SVG_NS, 'rect')
        clip.setAttribute('x', String(left))
        clip.setAttribute('y', String(mid - h * 2))
        clip.setAttribute('height', String(h * 4))
        clip.setAttribute('width', '0')
        clipPath.appendChild(clip)
        defs.appendChild(clipPath)
        group.setAttribute('clip-path', `url(#${clipId})`)

        const band = document.createElementNS(SVG_NS, 'polygon')
        band.setAttribute('points', [...top, ...bottom].join(' '))
        const core = document.createElementNS(SVG_NS, 'polygon')
        core.setAttribute('points', [...coreTop, ...coreBottom].join(' '))

        group.appendChild(band)
        group.appendChild(core)
        svg.appendChild(group)

        this.strokes.push({
          points: [...top, ...bottom].join(' '),
          core: [...coreTop, ...coreBottom].join(' '),
          left,
          width,
          group,
          clip
        })
      }
    })
  }

  resize(): void {
    // Force a rebuild: every stroke is measured against a layout that has moved.
    this.builtFor = ''
  }

  render(t: number, opts: HighlighterMarkOptions): void {
    this.build(opts)

    const hold = Math.max(opts.hold, 0) / 1000
    const duration = Math.max(opts.duration, 1) / 1000
    const stagger = Math.max(opts.stagger, 0) / 1000

    for (let i = 0; i < this.strokes.length; i++) {
      const stroke = this.strokes[i]!
      const started = hold + i * stagger
      const progress = easeOutCubic(clamp01((t - started) / duration))

      // The clip is what draws the stroke: the geometry never changes, only how
      // much of it the pen has reached.
      stroke.clip.setAttribute('width', (stroke.width * progress).toFixed(2))

      const band = stroke.group.firstChild as SVGPolygonElement | null
      const core = stroke.group.lastChild as SVGPolygonElement | null
      if (band) {
        band.setAttribute('fill', opts.ink)
        band.setAttribute('fill-opacity', String(opts.strength))
      }
      if (core && core !== band) {
        core.setAttribute('fill', opts.ink)
        /*
         * Not twice the strength. Two passes of a translucent ink multiply
         * rather than add, so the second pass takes what is left rather than
         * doubling what is there.
         */
        core.setAttribute('fill-opacity', String(opts.strength * 0.55))
      }
    }
  }

  teardown(): void {
    for (const stroke of this.strokes) stroke.group.remove()
    this.strokes = []
    this.svg?.remove()
    this.svg = null
    this.defs = null
    this.builtFor = ''
    if (this.host && this.restorePosition !== undefined) {
      this.host.style.position = this.restorePosition
    }
    this.host = null
  }
}

/**
 * Mount HighlighterMark onto a block of text. Every `<mark>` inside it is
 * marked, in document order.
 *
 * ```html
 * <p id="brief">The rule is <mark>scope to the surface</mark>, every time.</p>
 * ```
 *
 * ```ts
 * const pen = createHighlighterMark(document.querySelector('#brief')!)
 * pen.start()
 * // …later
 * pen.destroy()
 * ```
 *
 * The text is never taken apart, so it selects, wraps and reads exactly as it
 * did before, and `<mark>` means the right thing with the effect switched off.
 */
export function createHighlighterMark(
  el: HTMLElement,
  opts: Partial<HighlighterMarkOptions> = {}
): EffectHandle {
  return mount<HighlighterMarkOptions>(el, opts, {
    defaults: highlighterMarkDefaults,
    kind: 'dom',
    create: () => new HighlighterMarkSurface()
  })
}

export default createHighlighterMark
