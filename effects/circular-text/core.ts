/*
 * CircularText: Beamish
 * https://beamish.ink/effects/circular-text
 *
 * Type set round a ring, turning slowly. A roundel, a seal, the stamp on a
 * bottle of something.
 *
 * Nearly every version of this on the web places each character by hand, with a
 * rotation and a translation per letter, and it is wrong in two ways that are
 * hard to unsee once you know. The letters are positioned but not fitted, so
 * the spacing comes from a guess at the arc each one subtends and the ring never
 * quite closes: there is always a gap, or an overlap, at the join. And each
 * letter is rotated as a rigid block, so a pair that should be kerned is not,
 * because the browser has been given ten separate one-character strings and
 * kerning happens between characters in a string.
 *
 * This uses an SVG textPath instead, which is the thing in the platform built
 * for exactly this, and gets both back for free. The text is laid out as text,
 * so it kerns and it ligates. And it is given a `textLength` equal to the
 * circumference of the circle, with `lengthAdjust="spacing"`, so the browser
 * fits the string to the ring by opening or closing the spaces between letters
 * and never by distorting the letterforms. The ring closes exactly, at any
 * radius, in any face, with any string. There is no number to tune.
 *
 * The turn is one transform on one group, rather than a new `startOffset` every
 * frame. Moving the offset re-lays out the text sixty times a second to produce
 * a picture that is a rotation of the one before it.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type CircularTextOptions = BaseOptions & {
  /** Radius of the ring, as a share of the shorter side of the box. */
  radius: number
  /** How many times the text goes round. */
  repeat: number
  /** What sits between one copy and the next. */
  separator: string
  /** Letter height, as a share of the radius. */
  size: number
  /** Degrees the ring turns over one period. Negative turns the other way. */
  spin: number
  /** Hang the letters inside the ring rather than standing them on it. */
  inside: boolean
  /** Let the fit stretch the letterforms as well as the spaces. */
  distort: boolean
  /** Seconds for one turn of `spin`. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const circularTextDefaults: CircularTextOptions = {
  radius: 0.38,
  repeat: 2,
  separator: ' · ',
  size: 0.17,
  spin: 360,
  inside: false,
  distort: false,
  period: 48,
  reducedMotionTime: 0
}

const SVG = 'http://www.w3.org/2000/svg'
/* The viewBox the ring is drawn in. Everything scales with the host, so the
   numbers below are a share of this box rather than pixels. */
const BOX = 100

class CircularTextSurface implements Surface<CircularTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private group: SVGGElement | null = null
  private path: SVGPathElement | null = null
  private text: SVGTextElement | null = null
  private textPath: SVGTextPathElement | null = null
  private built = false
  private shapedFor = ''

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  private build(): void {
    const host = this.host
    if (!host || this.built) return

    host.textContent = ''

    // The text a screen reader gets: one string, unchanged, out of sight. The
    // ring is a picture of it.
    const label = document.createElement('span')
    label.textContent = this.original
    label.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'

    const svg = document.createElementNS(SVG, 'svg')
    svg.setAttribute('viewBox', `0 0 ${BOX} ${BOX}`)
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    svg.style.cssText = 'display:block;width:100%;height:100%;overflow:visible'

    /*
     * An id unique to this instance. Two rings on one page sharing a path id is
     * the one way this breaks that nothing in the markup hints at: the second
     * textPath silently uses the first one's circle.
     */
    const id = `beamish-ring-${Math.random().toString(36).slice(2, 9)}`

    const defs = document.createElementNS(SVG, 'defs')
    const path = document.createElementNS(SVG, 'path')
    path.setAttribute('id', id)
    path.setAttribute('fill', 'none')
    defs.append(path)

    const group = document.createElementNS(SVG, 'g')
    const text = document.createElementNS(SVG, 'text')
    text.setAttribute('fill', 'currentColor')
    // Inherited, so the ring is set in whatever the element was set in. A text
    // effect that picks its own face is a graphic, not a text effect.
    text.style.fontFamily = 'inherit'
    text.style.fontWeight = 'inherit'
    text.style.fontStyle = 'inherit'

    const textPath = document.createElementNS(SVG, 'textPath')
    textPath.setAttribute('href', `#${id}`)
    text.append(textPath)
    group.append(text)
    svg.append(defs, group)
    host.append(label, svg)

    this.group = group
    this.path = path
    this.text = text
    this.textPath = textPath
    this.built = true
  }

  /*
   * The ring, and the fit. Both depend only on the options, so this runs when
   * they change rather than every frame.
   */
  private shape(opts: CircularTextOptions): void {
    const path = this.path
    const text = this.text
    const textPath = this.textPath
    if (!path || !text || !textPath) return

    const key = `${this.original}|${opts.radius}|${opts.repeat}|${opts.separator}|${opts.size}|${opts.inside}|${opts.distort}`
    if (this.shapedFor === key) return
    this.shapedFor = key

    const radius = Math.max(opts.radius, 0.01) * BOX
    const centre = BOX / 2

    /*
     * One full circle as two arcs, because a single arc of 360 degrees is
     * degenerate: the start and end points coincide and the renderer has no way
     * to know which way round to go, so it draws nothing.
     *
     * Clockwise from the top for letters standing on the ring. Anticlockwise
     * for letters hanging inside it, which is not a flag on the text but the
     * path running the other way: the baseline side follows the direction of
     * travel, so reversing the path turns the letters over without touching
     * them.
     */
    const sweep = opts.inside ? 0 : 1
    path.setAttribute(
      'd',
      `M ${centre} ${centre - radius} ` +
        `A ${radius} ${radius} 0 1 ${sweep} ${centre} ${centre + radius} ` +
        `A ${radius} ${radius} 0 1 ${sweep} ${centre} ${centre - radius}`
    )

    const copies = Math.max(1, Math.round(opts.repeat))
    const once = this.original + opts.separator
    textPath.textContent = copies > 1 ? once.repeat(copies) : this.original

    text.style.fontSize = `${(Math.max(opts.size, 0.01) * radius).toFixed(3)}px`
    // Letters hanging inside the ring hang from the baseline, so the baseline
    // has to move to the top of them.
    textPath.setAttribute('dominant-baseline', opts.inside ? 'hanging' : 'auto')

    /*
     * The fit. The string is given the circumference as its length, so the
     * browser opens or closes the spaces between letters until it fits exactly
     * and the join closes at any radius, in any face, with any string.
     *
     * `spacing` rather than `spacingAndGlyphs`: a fit that stretches the
     * letterforms is a fit that has changed the typeface, which is the one
     * thing a typesetter is not allowed to do.
     */
    const circumference = 2 * Math.PI * radius
    textPath.setAttribute('textLength', circumference.toFixed(4))
    textPath.setAttribute('lengthAdjust', opts.distort ? 'spacingAndGlyphs' : 'spacing')
  }

  resize(): void {}

  render(t: number, opts: CircularTextOptions): void {
    this.build()
    this.shape(opts)
    const group = this.group
    if (!group) return

    // One transform, on one group. A whole number of degrees over the period,
    // so the loop closes exactly.
    const turn = (t / Math.max(opts.period, 0.001)) * opts.spin
    group.setAttribute('transform', `rotate(${turn.toFixed(3)} ${BOX / 2} ${BOX / 2})`)
  }

  teardown(): void {
    if (this.host && this.original) this.host.textContent = this.original
    this.group = null
    this.path = null
    this.text = null
    this.textPath = null
    this.built = false
    this.shapedFor = ''
    this.host = null
  }
}

/**
 * Mount CircularText into `el`. The element must already contain the text, and
 * it needs a size: the ring fills the box it is given.
 *
 * ```ts
 * const ring = createCircularText(document.querySelector('#seal')!)
 * ring.start()
 * // …later
 * ring.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left exactly as it
 * was found.
 */
export function createCircularText(
  el: HTMLElement,
  opts: Partial<CircularTextOptions> = {}
): EffectHandle {
  return mount<CircularTextOptions>(el, opts, {
    defaults: circularTextDefaults,
    kind: 'dom',
    create: () => new CircularTextSurface()
  })
}

export default createCircularText
