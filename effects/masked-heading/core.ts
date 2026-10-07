/*
 * MaskedHeading: Beamish
 * https://beamish.ink/effects/masked-heading
 *
 * A heading uncovered by a sheet sliding off it, and the edge of that sheet is
 * torn rather than cut.
 *
 * A straight-edged mask moving across a heading is a wipe, and a wipe is a
 * television transition: the eye reads the edge as a machine because nothing in
 * the physical world has an edge that straight. The whole of this item is in the
 * edge. A deckle edge, which is what the untrimmed side of a handmade sheet is
 * called, has structure at two scales: a slow wander where the pulp ran thin
 * against the deckle, and a fine fray of fibres on top of it. Both of those are
 * here, both are fixed by the seed, and the edge keeps its shape as it travels,
 * because a torn edge does not re-tear itself while you pull the sheet away.
 *
 * It is a `clip-path` polygon and nothing else. Which means two things worth
 * having. The text is never taken apart, so it selects, wraps, translates and
 * reads exactly as it did: this and SplitFountainText are the only two effects
 * here that leave the DOM alone. And the clip is composited, so a heading being
 * uncovered costs a transform rather than a repaint.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type MaskedHeadingDirection = 'up' | 'down' | 'left' | 'right'

export type MaskedHeadingOptions = BaseOptions & {
  /** Which way the uncovered area grows. */
  direction: MaskedHeadingDirection
  /** Milliseconds for the sheet to come away. */
  duration: number
  /** Milliseconds before it starts. */
  hold: number
  /** How far the slow wander of the edge reaches, as a share of the element. */
  tear: number
  /** How far the fine fray reaches, as a share of the element. */
  fray: number
  /** Points along the edge. More is a finer tear and a longer polygon. */
  points: number
  /** How far past the end the sheet travels, so the edge clears the type. */
  overshoot: number
  /** Seed for the tear. The same seed gives the same sheet. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const maskedHeadingDefaults: MaskedHeadingOptions = {
  direction: 'up',
  duration: 1500,
  hold: 250,
  tear: 0.07,
  fray: 0.018,
  points: 48,
  overshoot: 0.12,
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

class MaskedHeadingSurface implements Surface<MaskedHeadingOptions> {
  private host: HTMLElement | null = null
  /** The fixed shape of the tear, sampled along the edge. Built once per seed. */
  private profile: number[] = []
  private profileFor = ''
  private previous = ''

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
  }

  /*
   * The tear itself, as a list of offsets along the edge.
   *
   * Two scales, because a deckle edge has two. The slow one is where the pulp
   * ran thin against the deckle and it wanders over a third of the sheet. The
   * fine one is the fray of individual fibres. One scale alone gives either a
   * gentle curve or a saw blade, and neither reads as paper.
   *
   * Built once and reused, because a torn edge does not re-tear itself while
   * the sheet is being pulled away.
   */
  private shape(opts: MaskedHeadingOptions): void {
    const count = Math.max(4, Math.round(opts.points))
    const key = `${count}|${opts.tear}|${opts.fray}|${opts.seed}`
    if (this.profileFor === key) return
    this.profileFor = key

    this.profile = []
    for (let i = 0; i <= count; i++) {
      const s = i / count
      const slow =
        Math.sin(s * 5.1 + hash2(1, opts.seed) * 6.3) * 0.6 +
        Math.sin(s * 11.7 + hash2(2, opts.seed) * 6.3) * 0.4
      const fine = hash2(i + 3, opts.seed) - 0.5
      this.profile.push(slow * opts.tear + fine * opts.fray * 2)
    }
  }

  resize(): void {}

  render(t: number, opts: MaskedHeadingOptions): void {
    const host = this.host
    if (!host) return
    this.shape(opts)

    const duration = Math.max(opts.duration, 1) / 1000
    const hold = Math.max(opts.hold, 0) / 1000
    const eased = easeOutExpo(clamp01((t - hold) / duration))

    /*
     * The travel starts and ends entirely off the element, by the depth of the
     * tear at each end.
     *
     * Starting at exactly 0 is wrong and looks like a bug: the parts of the tear
     * that poke forwards are already inside the box, so a sheet supposedly at
     * rest leaks slivers of the heading through its own edge. The same at the
     * far end leaves a few fibres lying across the last line. The overshoot is
     * on top of both.
     */
    const reach = opts.tear + opts.fray + 0.001
    const span = 1 + reach * 2 + opts.overshoot
    const travelled = eased * span

    const vertical = opts.direction === 'up' || opts.direction === 'down'
    const count = this.profile.length - 1
    const edge: string[] = []

    for (let i = 0; i <= count; i++) {
      const s = i / count
      const offset = this.profile[i]!
      /*
       * Where the edge sits along the axis it travels. For `up` the uncovered
       * area grows from the bottom, so the edge starts below the element and
       * rises past the top.
       */
      const grows = opts.direction === 'down' || opts.direction === 'right'
      const at = grows ? -reach + travelled + offset : 1 + reach - travelled + offset

      const along = (s * 100).toFixed(3)
      const across = (at * 100).toFixed(3)
      edge.push(vertical ? `${along}% ${across}%` : `${across}% ${along}%`)
    }

    /*
     * The polygon is the edge plus the two corners of whichever side stays
     * uncovered. Closing it the other way round clips the half you wanted to
     * keep, which looks like the animation running backwards.
     */
    const corners =
      opts.direction === 'up'
        ? ['100% 200%', '0% 200%']
        : opts.direction === 'down'
          ? ['100% -100%', '0% -100%']
          : opts.direction === 'left'
            ? ['200% 100%', '200% 0%']
            : ['-100% 100%', '-100% 0%']

    const path = `polygon(${[...edge, ...corners].join(', ')})`
    if (path !== this.previous) {
      host.style.clipPath = path
      host.style.setProperty('-webkit-clip-path', path)
      this.previous = path
    }
  }

  teardown(): void {
    const host = this.host
    if (host) {
      host.style.clipPath = ''
      host.style.removeProperty('-webkit-clip-path')
    }
    this.profile = []
    this.profileFor = ''
    this.previous = ''
    this.host = null
  }
}

/**
 * Mount MaskedHeading onto `el`. Everything inside it is uncovered together, so
 * put it on the block you want revealed rather than on each line.
 *
 * ```ts
 * const sheet = createMaskedHeading(document.querySelector('#masthead')!)
 * sheet.start()
 * // …later
 * sheet.destroy()
 * ```
 *
 * The text is never taken apart, so it selects, wraps and reads exactly as it
 * did before.
 */
export function createMaskedHeading(
  el: HTMLElement,
  opts: Partial<MaskedHeadingOptions> = {}
): EffectHandle {
  return mount<MaskedHeadingOptions>(el, opts, {
    defaults: maskedHeadingDefaults,
    kind: 'dom',
    create: () => new MaskedHeadingSurface()
  })
}

export default createMaskedHeading
