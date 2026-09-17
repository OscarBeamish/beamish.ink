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

/** Matches --ease-out-expo. The one easing this library uses for arrivals. */
const easeOutExpo = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k))

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

      const progress = easeOutExpo(clamp01((t - rank * stagger) / duration))
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
