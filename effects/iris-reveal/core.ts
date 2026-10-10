/*
 * IrisReveal: Beamish
 * https://beamish.ink/effects/iris-reveal
 *
 * A camera iris opening on whatever is behind it.
 *
 * HOW AN IRIS IS ACTUALLY SHAPED
 *
 * It is not a circle growing. A diaphragm is a ring of overlapping blades, and
 * the hole they leave is a polygon with as many sides as there are blades: five
 * blades give a pentagon, nine give something close to a circle but not a
 * circle. Anybody who has seen an out-of-focus highlight in a photograph has
 * seen this shape, which is why a growing circle reads as a spotlight and a
 * growing heptagon reads as a lens.
 *
 * Two details carry the rest of it:
 *
 *   The blades swing as they open, so the whole opening rotates. On a real lens
 *   that is a consequence of the mechanism rather than a decision, and leaving
 *   it out is the clearest way to make this look like a mask rather than a
 *   machine.
 *
 *   The edges bow. A blade is a curved plate, so each side of the opening is a
 *   shallow arc rather than a straight line, bulging into the hole.
 *
 * WHAT IT DRAWS WITH
 *
 * `clip-path`, on the element itself. Nothing is added to the DOM, nothing is
 * drawn, and the content inside is untouched: it selects, scrolls and reads the
 * whole time, it is simply not all visible yet.
 *
 * That also makes this the one item here with no colour in it at all, which is
 * why it declares `ground: "either"` without hedging. There is nothing to tune
 * against a background because there is no background: it clips whatever you
 * put it on.
 *
 * ONE SHOT
 *
 * It opens and it is done. `t` is seconds from the start, the easing is a
 * function of t, and there is nothing stored between frames.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type IrisRevealOptions = BaseOptions & {
  /** How many blades. Five is a cheap lens, nine is an expensive one. */
  blades: number
  /** Degrees the opening rotates as it goes from shut to open. */
  swing: number
  /** How far each blade edge bows into the hole, 0 to 1. */
  bow: number
  /** How far open it starts, 0 to 1 of the final opening. */
  from: number
  /** Milliseconds for the iris to open. */
  duration: number
  /** Milliseconds of stillness before it starts. */
  hold: number
  /** Where the centre sits across the element, 0 to 1. */
  x: number
  /** Where the centre sits down the element, 0 to 1. */
  y: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const irisRevealDefaults: IrisRevealOptions = {
  blades: 7,
  swing: 26,
  bow: 0.14,
  from: 0.04,
  duration: 1100,
  hold: 220,
  x: 0.5,
  y: 0.5,
  reducedMotionTime: 4
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/*
 * Slow to leave, quick through the middle, slow to arrive. A diaphragm is
 * sprung at both ends of its travel, and an ease-out alone makes it look like
 * it was dropped.
 */
const easeInOutCubic = (n: number) =>
  n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2

/** Points per blade edge. Enough that the bow reads as a curve. */
const PER_EDGE = 7

class IrisRevealSurface implements Surface<IrisRevealOptions> {
  private host: HTMLElement | null = null
  private previous = ''
  private restoreClip = ''
  /*
   * Width over height. The polygon is written in percentages so it follows a
   * resize for free, but percentages are not square: a point at 10% across and
   * 10% down is further across than it is down on anything wider than it is
   * tall. Without this the iris is an ellipse, and on a 16:9 hero it is an
   * obvious one.
   */
  private aspect = 1

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.restoreClip = ctx.host.style.clipPath
  }

  resize(size: { pixelWidth: number; pixelHeight: number }): void {
    this.aspect = Math.max(size.pixelWidth, 1) / Math.max(size.pixelHeight, 1)
    // The shape depends on it, so the cached string is no longer the answer.
    this.previous = ''
  }

  render(t: number, opts: IrisRevealOptions): void {
    const host = this.host
    if (!host) return

    const hold = Math.max(opts.hold, 0) / 1000
    const duration = Math.max(opts.duration, 1) / 1000
    const open = easeInOutCubic(clamp01((t - hold) / duration))

    const blades = Math.max(3, Math.round(opts.blades))
    const turn = (Math.PI * 2) / blades

    /*
     * How far the opening has to reach to clear the element, in units of the
     * element's height.
     *
     * Three things are paid for here and leaving out any one of them leaves
     * slivers in the corners, which reads as a dirty lens rather than as a
     * design. The furthest corner is further away than the nearest edge. That
     * corner is measured in height units, so its horizontal leg is scaled by
     * the aspect. And the polygon's inradius is its circumradius times the
     * cosine of half a blade's angle, so a circumradius that reaches the corner
     * still has a flat edge inside it.
     */
    const acrossMax = Math.max(opts.x, 1 - opts.x) * this.aspect
    const downMax = Math.max(opts.y, 1 - opts.y)
    const reach = (Math.hypot(acrossMax, downMax) / Math.cos(turn / 2)) * 1.02

    const r = (opts.from + (1 - opts.from) * open) * reach
    // The blades swing through their travel, so the whole opening turns. On a
    // real lens this is the mechanism rather than a decision.
    const rotation = (opts.swing * (Math.PI / 180)) * (1 - open)

    const points: string[] = []
    for (let b = 0; b < blades; b++) {
      for (let i = 0; i < PER_EDGE; i++) {
        /*
         * Walk each edge from one vertex to the next in a straight line, then
         * push the middle of it outwards by the bow. A blade is a curved plate,
         * so the side of the hole is a shallow arc bulging into it.
         */
        const s = i / PER_EDGE
        const a0 = rotation + b * turn
        const a1 = a0 + turn
        const vx0 = Math.cos(a0) * r
        const vy0 = Math.sin(a0) * r
        const vx1 = Math.cos(a1) * r
        const vy1 = Math.sin(a1) * r

        let px = vx0 + (vx1 - vx0) * s
        let py = vy0 + (vy1 - vy0) * s

        /*
         * Pushed straight out from the centre, which is a scale rather than a
         * displacement along a normal. Zero at both vertices and one in the
         * middle of the edge, so the blades still meet at their corners.
         *
         * The size of it is the gap the straight edge leaves: a polygon's
         * inradius is its circumradius times cos(half a blade's angle), so
         * 1/cos minus 1 is exactly how far the middle of the edge sits inside
         * the circle it is cutting, and `bow` is the share of that taken back.
         */
        const along = Math.sin(s * Math.PI)
        const bow = 1 + opts.bow * along * (1 / Math.cos(turn / 2) - 1) * 2
        px *= bow
        py *= bow

        /*
         * Percentages of the element, so the shape follows a resize for free.
         * The horizontal is divided by the aspect because px and py are both in
         * height units: that division is the whole of what keeps a seven-sided
         * hole seven-sided rather than stretching it into an ellipse.
         */
        const x = (opts.x + px / this.aspect) * 100
        const y = (opts.y + py) * 100
        points.push(`${x.toFixed(3)}% ${y.toFixed(3)}%`)
      }
    }

    const path = `polygon(${points.join(', ')})`
    if (path !== this.previous) {
      host.style.clipPath = path
      host.style.setProperty('-webkit-clip-path', path)
      this.previous = path
    }
  }

  teardown(): void {
    const host = this.host
    if (host) {
      host.style.clipPath = this.restoreClip
      host.style.removeProperty('-webkit-clip-path')
    }
    this.previous = ''
    this.host = null
  }
}

/**
 * Mount IrisReveal onto the element you want opened. Everything inside is
 * revealed together, so put it on the block rather than on each child.
 *
 * ```ts
 * const iris = createIrisReveal(document.querySelector('#plate')!)
 * iris.start()
 * // …later
 * iris.destroy()
 * ```
 *
 * The content is never touched: it selects, scrolls and reads the whole time,
 * it is simply not all visible yet.
 */
export function createIrisReveal(
  el: HTMLElement,
  opts: Partial<IrisRevealOptions> = {}
): EffectHandle {
  return mount<IrisRevealOptions>(el, opts, {
    defaults: irisRevealDefaults,
    kind: 'dom',
    create: () => new IrisRevealSurface()
  })
}

export default createIrisReveal
