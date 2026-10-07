/*
 * StrokeText: Beamish
 * https://beamish.ink/effects/stroke-text
 *
 * Hollow letters that fill with ink from the bottom. An inline face being
 * inked, rather than an outline for its own sake.
 *
 * Two problems to solve, and the first one is the reason most outlined text on
 * the web looks wrong.
 *
 * `-webkit-text-stroke` centres the stroke on the letterform, so half of it is
 * painted inside the glyph. On a light weight that half eats the counters: the
 * inside of an o closes up, an e fills in, and the whole setting goes muddy at
 * exactly the widths where an outline is worth having. A typeface designed as
 * an inline puts the stroke outside the letter, where it belongs.
 *
 * The fix here needs no new CSS and works everywhere. The text is drawn twice.
 * Behind: a stroke of twice the width you asked for, centred, so it reaches the
 * right distance outside the letter and an equal distance inside. In front: the
 * same text filled, which paints over the inner half. What is left is an
 * outside-only stroke of exactly the width given, with the counters intact.
 *
 * The second problem is what to animate, and the answer is the ink. The front
 * layer's fill is a gradient clipped to the text with a hard edge in it, so
 * below the edge the letter is solid and above it the letter is paper. Move the
 * edge and the type fills from the foot up, which is what inking a block
 * actually looks like and what an outline is for.
 *
 * The ink line is not level, because a roller is not level. It tilts, and it
 * has a small wobble along its length.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type StrokeTextOptions = BaseOptions & {
  /** The outline. */
  outline: string
  /** The ink that fills the letters. */
  ink: string
  /** What the hollow part of a letter shows. Must match the page behind it. */
  paper: string
  /** Width of the outline, in ems. */
  width: number
  /** How full the letters are when the run has finished, 0 to 1. */
  level: number
  /** Milliseconds for the ink to rise. */
  duration: number
  /** Milliseconds before it starts. */
  hold: number
  /** How far the ink line is off level, in degrees. */
  tilt: number
  /** How uneven the ink line is, 0 to 1. */
  wobble: number
  /** Seed for the unevenness. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const strokeTextDefaults: StrokeTextOptions = {
  outline: '#36362f',
  ink: '#c44400',
  paper: '#fbfaf4',
  width: 0.022,
  level: 1,
  duration: 2400,
  hold: 300,
  tilt: 2.5,
  wobble: 0.3,
  seed: 7,
  reducedMotionTime: 999
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** The one easing this library uses for arrivals. Matches --ease-out-expo. */
const easeOutExpo = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k))

function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

class StrokeTextSurface implements Surface<StrokeTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private back: HTMLElement | null = null
  private front: HTMLElement | null = null
  private built = false
  private previous = ''

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  private build(): void {
    const host = this.host
    if (!host || this.built) return

    host.textContent = ''
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'

    /*
     * The stroked copy sits behind and carries the accessible text, because it
     * is the one in the flow: it sets the size of the element and it is the one
     * a screen reader reaches. The filled copy on top is marked hidden, which
     * is the right way round for exactly one reason, that the text underneath
     * is the real text and the layer over it is paint.
     */
    const back = document.createElement('span')
    back.textContent = this.original
    back.style.cssText = 'display:block'

    const front = document.createElement('span')
    front.setAttribute('aria-hidden', 'true')
    front.textContent = this.original
    front.style.cssText =
      'position:absolute;inset:0;display:block;pointer-events:none;' +
      'background-repeat:no-repeat;color:transparent'
    front.style.setProperty('-webkit-background-clip', 'text')
    front.style.backgroundClip = 'text'
    front.style.setProperty('-webkit-text-fill-color', 'transparent')

    host.append(back, front)
    this.back = back
    this.front = front
    this.built = true
  }

  resize(): void {}

  render(t: number, opts: StrokeTextOptions): void {
    this.build()
    const back = this.back
    const front = this.front
    if (!back || !front) return

    /*
     * Twice the width asked for, centred, so the half that lands outside the
     * letter is the width wanted and the half inside is covered by the layer in
     * front. That is the whole trick, and it needs nothing but two copies.
     */
    const stroke = `${(Math.max(opts.width, 0) * 2).toFixed(4)}em ${opts.outline}`
    if (back.style.getPropertyValue('-webkit-text-stroke') !== stroke) {
      back.style.setProperty('-webkit-text-stroke', stroke)
    }
    if (back.style.color !== opts.paper) back.style.color = opts.paper

    const duration = Math.max(opts.duration, 1) / 1000
    const hold = Math.max(opts.hold, 0) / 1000
    const risen = easeOutExpo(clamp01((t - hold) / duration)) * clamp01(opts.level)

    /*
     * The ink line. A roller is not level, so it tilts, and it has a small
     * wobble along its length: a hard horizontal edge across a line of type
     * reads as a mask rather than as a surface of ink.
     *
     * Built as a gradient with two stops at nearly the same place, which is a
     * hard edge with a pixel of softness on it. Dead hard, and the edge
     * staircases across the diagonal.
     */
    const ragged = 1 + (hash2(1, opts.seed) - 0.5) * opts.wobble * 0.3
    const at = clamp01(1 - risen * ragged)
    const edge = (at * 100).toFixed(2)
    const after = (Math.min(at + 0.012, 1) * 100).toFixed(2)
    const angle = (180 + opts.tilt).toFixed(2)

    /*
     * Paper first, ink second. At 180 degrees a CSS gradient runs to the
     * bottom, so 0% is the top of the box: putting the ink at the start fills
     * the letters from the ceiling down, which is what the first version did
     * and which reads as the type draining rather than filling.
     */
    const image =
      `linear-gradient(${angle}deg, ${opts.paper} 0%, ${opts.paper} ${edge}%, ` +
      `${opts.ink} ${after}%, ${opts.ink} 100%)`
    if (image !== this.previous) {
      front.style.backgroundImage = image
      this.previous = image
    }
  }

  teardown(): void {
    const host = this.host
    if (host) {
      host.textContent = this.original
      host.style.position = ''
    }
    this.back = null
    this.front = null
    this.built = false
    this.previous = ''
    this.host = null
  }
}

/**
 * Mount StrokeText into `el`. The element must already contain the text.
 *
 * The `paper` option has to match the page behind the element, because the
 * hollow part of a letter is painted that colour: it is what covers the inner
 * half of the stroke.
 *
 * ```ts
 * const hollow = createStrokeText(document.querySelector('h1')!)
 * hollow.start()
 * // …later
 * hollow.destroy()
 * ```
 */
export function createStrokeText(
  el: HTMLElement,
  opts: Partial<StrokeTextOptions> = {}
): EffectHandle {
  return mount<StrokeTextOptions>(el, opts, {
    defaults: strokeTextDefaults,
    kind: 'dom',
    create: () => new StrokeTextSurface()
  })
}

export default createStrokeText
