/*
 * Riser: Beamish
 * https://beamish.ink/effects/scroll-reveal-rows
 *
 * Children arrive on a stagger. The plainest thing in the library and the one
 * most pages actually need.
 *
 * No canvas and no dependencies. It takes a container, finds the elements to
 * animate, and moves them. There is no IntersectionObserver here on purpose: the
 * runtime already holds the loop until the element is on screen, so calling
 * start() on mount gives a scroll-triggered reveal with no extra code.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type RiserOrder = 'forward' | 'reverse' | 'centre'

export type ScrollRevealRowsOptions = BaseOptions & {
  /** CSS selector for the children to animate. Empty means direct children. */
  select: string
  /** The order children arrive in. */
  order: RiserOrder
  /** Milliseconds between one child and the next. */
  stagger: number
  /** Milliseconds each child takes on its own. */
  duration: number
  /** How far each child travels, in pixels. Negative falls from above. */
  rise: number
  /** Scale each child starts at. 1 is no scaling. */
  scale: number
  /** Blur each child starts at, in pixels. */
  blur: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const scrollRevealRowsDefaults: ScrollRevealRowsOptions = {
  select: '',
  order: 'forward',
  stagger: 90,
  duration: 900,
  rise: 34,
  scale: 1,
  blur: 0,
  reducedMotionTime: 999
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/*
 * --ease-66, solved rather than approximated.
 *
 * This used to be `1 - 2 ** (-10 * k)` with a comment claiming it matched the
 * library's arrival easing. It did not match either of them, and the shape is
 * what made a stagger of six rows read as six separate snaps: that curve is
 * half done by a tenth of the duration and ninety-four percent done by a third,
 * so each row appeared almost at once and then spent six hundred milliseconds
 * finishing something the eye had already stopped watching. The rhythm you saw
 * was the stagger alone.
 *
 * cubic-bezier(0.66, 0, 0.01, 1) leaves at rest. A row starts moving rather
 * than arriving, which is the whole difference between a stagger that flows and
 * a sequence of pops, and it is already one of this library's two easings.
 *
 * Newton first, because it converges in three or four steps across almost the
 * whole range, and bisection where the curve is flat enough that Newton's
 * derivative is useless.
 */
const EASE = { p1x: 0.66, p1y: 0, p2x: 0.01, p2y: 1 }

const curveX = (t: number) => {
  const u = 1 - t
  return 3 * u * u * t * EASE.p1x + 3 * u * t * t * EASE.p2x + t * t * t
}

const curveY = (t: number) => {
  const u = 1 - t
  return 3 * u * u * t * EASE.p1y + 3 * u * t * t * EASE.p2y + t * t * t
}

const slopeX = (t: number) => {
  const u = 1 - t
  return 3 * u * u * EASE.p1x + 6 * u * t * (EASE.p2x - EASE.p1x) + 3 * t * t * (1 - EASE.p2x)
}

const ease = (k: number): number => {
  if (k <= 0) return 0
  if (k >= 1) return 1

  let t = k
  for (let i = 0; i < 4; i++) {
    const slope = slopeX(t)
    if (slope < 1e-6) break
    const error = curveX(t) - k
    if (Math.abs(error) < 1e-6) return curveY(t)
    t -= error / slope
  }

  let lo = 0
  let hi = 1
  t = k
  for (let i = 0; i < 24; i++) {
    if (curveX(t) < k) lo = t
    else hi = t
    t = (lo + hi) * 0.5
  }
  return curveY(t)
}

class ScrollRevealRowsSurface implements Surface<ScrollRevealRowsOptions> {
  private children: HTMLElement[] = []
  private host: HTMLElement | null = null
  private selectedWith: string | null = null

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
  }

  private collect(select: string): void {
    const host = this.host
    if (!host || this.selectedWith === select) return
    this.children = select
      ? Array.from(host.querySelectorAll<HTMLElement>(select))
      : (Array.from(host.children) as HTMLElement[])
    for (const child of this.children) child.style.willChange = 'transform, opacity'
    this.selectedWith = select
  }

  resize(): void {}

  render(t: number, opts: ScrollRevealRowsOptions): void {
    this.collect(opts.select)
    const count = this.children.length
    if (count === 0) return

    const stagger = opts.stagger / 1000
    const duration = Math.max(opts.duration, 1) / 1000
    const middle = (count - 1) / 2

    for (let i = 0; i < count; i++) {
      const child = this.children[i]!
      const rank =
        opts.order === 'reverse'
          ? count - 1 - i
          : opts.order === 'centre'
            ? Math.round(Math.abs(i - middle))
            : i

      const progress = ease(clamp01((t - rank * stagger) / duration))
      const remaining = 1 - progress

      child.style.opacity = String(progress)
      const shift = remaining * opts.rise
      const scale = 1 - remaining * (1 - opts.scale)
      child.style.transform =
        scale === 1 ? `translateY(${shift}px)` : `translateY(${shift}px) scale(${scale})`
      // Dropping the filter once a child has landed matters: a permanent
      // blur(0px) still forces every one of them onto its own layer.
      child.style.filter = opts.blur > 0 && remaining > 0.01 ? `blur(${remaining * opts.blur}px)` : ''
    }
  }

  teardown(): void {
    for (const child of this.children) {
      child.style.opacity = ''
      child.style.transform = ''
      child.style.filter = ''
      child.style.willChange = ''
    }
    this.children = []
    this.selectedWith = null
    this.host = null
  }
}

/**
 * Mount Riser into `el`. Its children are what move.
 *
 * ```ts
 * const riser = createScrollRevealRows(document.querySelector('.grid')!)
 * riser.start()
 * // …later
 * riser.destroy()
 * ```
 *
 * `destroy()` clears every style it set, so the children are left as they were
 * found.
 */
export function createScrollRevealRows(el: HTMLElement, opts: Partial<ScrollRevealRowsOptions> = {}): EffectHandle {
  return mount<ScrollRevealRowsOptions>(el, opts, {
    defaults: scrollRevealRowsDefaults,
    kind: 'dom',
    create: () => new ScrollRevealRowsSurface()
  })
}

export default createScrollRevealRows
