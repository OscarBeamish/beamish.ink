/*
 * ScrollMarquee: Beamish
 * https://beamish.ink/effects/scroll-marquee
 *
 * A strip of content running sideways for ever, which leans when the page is
 * scrolled and changes direction with it. No canvas, no WebGL, no dependencies.
 *
 * Three things make this read as the thing on every studio site rather than as
 * a 1996 <marquee>:
 *
 *   It never stops. The strip is duplicated and the transform wraps at exactly
 *   one copy's width, so there is no jump to find and no gap at the end.
 *
 *   It leans with the scroll. The skew comes from scroll velocity, which is
 *   what makes the strip feel like it has mass: it is dragged by the page
 *   rather than playing beside it.
 *
 *   It is reversible. Scrolling up pushes it the other way, because the same
 *   velocity that skews it is added to its travel.
 *
 * It is pure in `t`, which is the part that takes care. A marquee written the
 * obvious way accumulates an offset every frame, and an effect that integrates
 * against its own last frame cannot be recorded, cannot be seeked, and drifts
 * on a dropped frame. The position here is a function of the clock and nothing
 * else.
 */

import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type Scroll,
  type Surface
} from '../../shared/runtime'

export type ScrollMarqueeOptions = BaseOptions & {
  /** Seconds for the strip to travel exactly one copy of its content. */
  period: number
  /** Which way it runs when the page is still. 1 is leftwards, -1 rightwards. */
  direction: number
  /** How far the scroll drags it, in copies of the content per full scroll. */
  drag: number
  /** Degrees of lean at full scroll speed. */
  skew: number
  /** How much it stretches along its travel at full scroll speed, 0 to 0.5. */
  stretch: number
  /** The scroll speed that counts as full, in screens per second. */
  reference: number
  /** Gap between the end of one copy and the start of the next, in pixels. */
  gap: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const scrollMarqueeDefaults: ScrollMarqueeOptions = {
  period: 24,
  direction: 1,
  drag: 0.35,
  skew: 7,
  stretch: 0.12,
  reference: 1.2,
  gap: 48,
  reducedMotionTime: 0
}

class ScrollMarqueeSurface implements Surface<ScrollMarqueeOptions> {
  private host: HTMLElement | null = null
  private track: HTMLElement | null = null
  private copy: HTMLElement | null = null
  private moved: ChildNode[] = []
  private width = 1

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host

    /*
     * The content is moved into a track rather than copied out of the host,
     * because whatever is in there is the author's markup: links that have to
     * keep working, images that have already loaded, text a screen reader has
     * already been told about.
     */
    const track = document.createElement('div')
    track.setAttribute('data-beamish-marquee-track', '')
    track.style.display = 'flex'
    track.style.width = 'max-content'
    track.style.willChange = 'transform'

    const original = document.createElement('div')
    original.style.display = 'flex'
    original.style.flex = '0 0 auto'

    this.moved = [...host.childNodes]
    for (const node of this.moved) original.append(node)

    /*
     * One clone, and it is hidden from assistive technology. A duplicate of the
     * content is a duplicate to a screen reader too, and hearing the same six
     * links twice is worse than not seeing the loop.
     */
    const clone = original.cloneNode(true) as HTMLElement
    clone.setAttribute('aria-hidden', 'true')
    for (const node of clone.querySelectorAll<HTMLElement>('a, button, input, select, textarea')) {
      node.setAttribute('tabindex', '-1')
    }

    track.append(original, clone)
    host.append(track)

    host.style.overflow = 'hidden'
    this.track = track
    this.copy = original
    this.measure()
  }

  private measure(): void {
    const copy = this.copy
    if (!copy) return
    // The gap is applied as padding on the copy so it is part of the width that
    // the wrap is measured against. A gap applied between the copies instead
    // would make the loop a fraction longer than the thing it is wrapping.
    this.width = Math.max(copy.getBoundingClientRect().width, 1)
  }

  resize(): void {
    this.measure()
  }

  render(t: number, opts: ScrollMarqueeOptions, _pointer: unknown, scroll: Scroll): void {
    const track = this.track
    const copy = this.copy
    if (!track || !copy) return

    const gap = Math.max(opts.gap, 0)
    if (copy.style.paddingRight !== `${gap}px`) {
      copy.style.paddingRight = `${gap}px`
      this.measure()
    }

    const period = Math.max(opts.period, 0.001)
    const dir = opts.direction >= 0 ? 1 : -1

    /*
     * Position from the clock, and from the scroll position, and from nothing
     * else. Both terms wrap at one copy's width, so the strip is continuous and
     * the frame at t is the same frame whenever it is asked for.
     */
    const travelled = (t / period) * dir + scroll.progress * opts.drag
    const offset = -(((travelled % 1) + 1) % 1) * this.width

    /*
     * The lean. Velocity is normalised and clipped: a trackpad can report an
     * order of magnitude more than a wheel, and without a ceiling the strip lies
     * flat on its side the first time somebody flicks the page.
     */
    const speed = Math.max(-1, Math.min(1, scroll.velocity / Math.max(opts.reference, 0.001)))
    const skew = speed * opts.skew
    const stretch = 1 + Math.abs(speed) * opts.stretch

    track.style.transform =
      `translate3d(${offset.toFixed(2)}px, 0, 0) skewX(${skew.toFixed(2)}deg) scaleX(${stretch.toFixed(3)})`
  }

  teardown(): void {
    const host = this.host
    const track = this.track
    if (host && track) {
      // Put the author's markup back exactly where it was found.
      for (const node of this.moved) host.append(node)
      track.remove()
      host.style.overflow = ''
    }
    this.host = null
    this.track = null
    this.copy = null
    this.moved = []
  }
}

/**
 * Mount ScrollMarquee onto `el`. Whatever is inside it becomes the strip, so
 * put it on a wrapper around the row rather than on the row's parent section.
 *
 * ```ts
 * const marquee = createScrollMarquee(document.querySelector('#strip')!)
 * marquee.start()
 * // …later
 * marquee.destroy()
 * ```
 */
export function createScrollMarquee(
  el: HTMLElement,
  opts: Partial<ScrollMarqueeOptions> = {}
): EffectHandle {
  return mount<ScrollMarqueeOptions>(el, opts, {
    defaults: scrollMarqueeDefaults,
    kind: 'dom',
    create: () => new ScrollMarqueeSurface()
  })
}

export default createScrollMarquee
