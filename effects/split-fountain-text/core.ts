/*
 * SplitFountainText: Beamish
 * https://beamish.ink/effects/split-fountain-text
 *
 * A split fountain. Two or three inks are put into the same duct on the press,
 * the rollers blend them where they meet, and every sheet comes off with a
 * gradient running across it.
 *
 * The thing that makes this a split fountain rather than gradient text is that
 * the gradient belongs to the sheet, not to the letters. One pass of ink across
 * the whole forme: a word near the left is in one ink, a word near the right is
 * in another, and the heading in between is caught in the blend. Put the
 * gradient on each element instead, which is what every version of this does,
 * and every element gets its own little rainbow, every heading has the same
 * colours in the same places, and the whole point is lost.
 *
 * That falls out of mounting it on the sheet rather than on the text.
 * `background-clip: text` on a container clips the background to every piece of
 * text inside it, however deeply nested, so one gradient on one element inks a
 * whole page in register.
 *
 * It is also the only text effect in this library that does not take the text
 * apart. No spans, no splitting, no hidden label: the text in the element is the
 * text the browser already had, so it selects, it wraps, it translates, it
 * searches, and a screen reader never knows anything happened. Nothing else here
 * can say that, and it is worth preferring this when either would do.
 *
 * The blend wobbles, and that is not noise for its own sake. A duct is filled by
 * hand and the rollers do not mix evenly, so the boundary between two inks is
 * never a straight line, and it walks as the run goes on: later sheets have a
 * wider, muddier blend than early ones. The gradient here is built from stops
 * whose positions are nudged by a hash and drift with the clock, which is the
 * fountain walking.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type SplitFountainTextOptions = BaseOptions & {
  /** The ink at the start of the duct. */
  first: string
  /** The ink in the middle. Set it the same as one neighbour for two inks. */
  second: string
  /** The ink at the far end. */
  third: string
  /** Which way the duct runs across the sheet, in degrees. */
  angle: number
  /** How wide the blend between inks is, 0 to 1. */
  blend: number
  /** How uneven the blend is, 0 to 1. */
  wobble: number
  /** How far the whole fountain walks over one period, 0 to 1. */
  walk: number
  /** Seed for the unevenness. The same seed gives the same sheet. */
  seed: number
  /** Seconds for one cycle of the walk. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const splitFountainTextDefaults: SplitFountainTextOptions = {
  first: '#c44400',
  second: '#8a3b6b',
  third: '#1b6f8c',
  angle: 96,
  blend: 0.42,
  wobble: 0.35,
  walk: 0.12,
  seed: 7,
  period: 30,
  reducedMotionTime: 7
}

const TAU = Math.PI * 2

function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** How many stops each blend is built from. Enough to wobble, few enough to read. */
const STEPS = 7

class SplitFountainTextSurface implements Surface<SplitFountainTextOptions> {
  private host: HTMLElement | null = null
  private previous = ''
  private touched = false

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
  }

  resize(): void {}

  render(t: number, opts: SplitFountainTextOptions): void {
    const host = this.host
    if (!host) return

    if (!this.touched) {
      /*
       * The background is clipped to the text, and the text's own colour is
       * taken away so the background shows through it. Both inherit, which is
       * what inks every nested element from the one gradient.
       */
      host.style.setProperty('-webkit-background-clip', 'text')
      host.style.backgroundClip = 'text'
      host.style.color = 'transparent'
      // Needed in WebKit, where the prefixed property alone leaves the text
      // painted in its own colour over the top of the clipped background.
      host.style.setProperty('-webkit-text-fill-color', 'transparent')
      host.style.backgroundRepeat = 'no-repeat'
      this.touched = true
    }

    const phase = TAU * t / Math.max(opts.period, 0.001)
    // A sine, so the fountain returns to where it started and the loop closes.
    const walked = Math.sin(phase) * opts.walk

    const inks = [opts.first, opts.second, opts.third]
    const blend = clamp01(opts.blend)
    const stops: string[] = []

    /*
     * Three inks, two blends. Each blend is built from several stops rather
     * than one, so its boundary can be nudged: a duct is filled by hand and the
     * rollers do not mix evenly, so the line where two inks meet is never
     * straight. One stop per ink gives a perfectly even ramp, which is a CSS
     * gradient and not a press.
     */
    for (let i = 0; i < inks.length; i++) {
      const centre = i / (inks.length - 1)
      for (let s = 0; s < STEPS; s++) {
        const along = s / (STEPS - 1)
        const base = centre + (along - 0.5) * blend * (1 / (inks.length - 1))
        const nudge =
          (hash2(i * 31 + s, opts.seed) - 0.5) *
          opts.wobble *
          blend *
          0.22 *
          Math.cos(phase + s * 1.3 + i)
        const at = clamp01(base + nudge + walked)
        // Each ink is laid down across its own band; the overlap between bands
        // is where two inks are on the roller together.
        stops.push(`${inks[i]} ${(at * 100).toFixed(2)}%`)
      }
    }

    // Sorted, because a CSS gradient quietly clamps a stop that comes before
    // the one in front of it, which turns a wobble into a hard edge.
    const ordered = stops
      .map(stop => {
        const at = Number(stop.slice(stop.lastIndexOf(' ') + 1, -1))
        return { stop, at }
      })
      .sort((a, b) => a.at - b.at)
      .map(entry => entry.stop)
      .join(', ')

    const image = `linear-gradient(${opts.angle.toFixed(1)}deg, ${ordered})`
    if (image !== this.previous) {
      host.style.backgroundImage = image
      this.previous = image
    }
  }

  teardown(): void {
    const host = this.host
    if (host && this.touched) {
      host.style.removeProperty('-webkit-background-clip')
      host.style.backgroundClip = ''
      host.style.color = ''
      host.style.removeProperty('-webkit-text-fill-color')
      host.style.backgroundImage = ''
      host.style.backgroundRepeat = ''
    }
    this.touched = false
    this.previous = ''
    this.host = null
  }
}

/**
 * Mount SplitFountainText onto `el`. Put it on the **sheet**, not on the
 * heading: it inks every piece of text inside the element from one gradient,
 * which is what a split fountain is.
 *
 * ```ts
 * const sheet = createSplitFountainText(document.querySelector('#sheet')!)
 * sheet.start()
 * // …later
 * sheet.destroy()
 * ```
 *
 * The text is never taken apart, so it selects, wraps, translates and reads
 * exactly as it did before.
 */
export function createSplitFountainText(
  el: HTMLElement,
  opts: Partial<SplitFountainTextOptions> = {}
): EffectHandle {
  return mount<SplitFountainTextOptions>(el, opts, {
    defaults: splitFountainTextDefaults,
    kind: 'dom',
    create: () => new SplitFountainTextSurface()
  })
}

export default createSplitFountainText
