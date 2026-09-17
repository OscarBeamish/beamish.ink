/*
 * Magnet: Beamish
 * https://beamish.ink/effects/magnetic-button
 *
 * An element that leans towards the cursor before the cursor arrives, and lets
 * go once it has passed. No canvas, no WebGL, no dependencies.
 *
 * It reads the pointer at window scope, because the whole point is reacting to a
 * cursor that is still outside the element. The runtime reports element-relative
 * coordinates that go past 0 and 1, so "how far outside" is a number rather than
 * a guess.
 *
 * Easing is a CSS transition rather than a per-frame spring, which keeps
 * `renderAtTime` pure in `t` and lets the recorder scrub the smoothing.
 */

import { mount, type BaseOptions, type EffectHandle, type Pointer, type Surface } from '../../shared/runtime'

export type MagneticButtonOptions = BaseOptions & {
  /**
   * How far outside the element the pull starts, as a multiple of its own size.
   * 1 means one element-width of empty space around it.
   */
  reach: number
  /** How far the element travels towards the cursor, as a fraction of the gap. */
  strength: number
  /** Cap on the travel in pixels, whatever the strength works out to. */
  maxShift: number
  /** Scale at full pull. 1 is no growth. */
  scale: number
  /** Degrees of lean at full pull. Zero keeps it upright. */
  rotate: number
  /** Milliseconds to follow the cursor, and to let go. */
  ease: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const magneticButtonDefaults: MagneticButtonOptions = {
  reach: 1.1,
  strength: 0.34,
  maxShift: 26,
  scale: 1.04,
  rotate: 0,
  ease: 420,
  pointerScope: 'window',
  reducedMotionTime: 0
}

class MagneticButtonSurface implements Surface<MagneticButtonOptions> {
  private host: HTMLElement | null = null

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    ctx.host.style.willChange = 'transform'
  }

  resize(): void {}

  render(_t: number, opts: MagneticButtonOptions, pointer: Pointer): void {
    const host = this.host
    if (!host) return

    const ease = `${Math.max(opts.ease, 0)}ms var(--ease-out-expo, cubic-bezier(0.22, 1, 0.36, 1))`
    host.style.transition = `transform ${ease}`

    if (!pointer.active) {
      host.style.transform = ''
      return
    }

    // Distance from the element's centre, in element widths and heights. Zero is
    // dead centre, 0.5 is the edge, 1.5 is one full element outside it.
    const dx = pointer.x - 0.5
    const dy = pointer.y - 0.5
    const distance = Math.hypot(dx, dy)

    // The pull starts at the edge of the reach and rises to full at the centre.
    const edge = 0.5 + Math.max(opts.reach, 0)
    const pull = Math.max(0, 1 - distance / edge)
    if (pull <= 0) {
      host.style.transform = ''
      return
    }

    // Eased so the element does not twitch the instant the cursor enters range.
    const strength = pull * pull * opts.strength
    const rect = host.getBoundingClientRect()
    const shiftX = Math.max(
      -opts.maxShift,
      Math.min(opts.maxShift, dx * rect.width * strength)
    )
    const shiftY = Math.max(
      -opts.maxShift,
      Math.min(opts.maxShift, dy * rect.height * strength)
    )

    const scale = 1 + (opts.scale - 1) * pull
    const lean = opts.rotate === 0 ? '' : ` rotate(${dx * opts.rotate * pull * 2}deg)`
    host.style.transform = `translate(${shiftX}px, ${shiftY}px) scale(${scale})${lean}`
  }

  teardown(): void {
    if (this.host) {
      this.host.style.transform = ''
      this.host.style.transition = ''
      this.host.style.willChange = ''
    }
    this.host = null
  }
}

/**
 * Mount Magnet onto `el`. The element itself is what moves, so put it on the
 * button, not on a wrapper around the button.
 *
 * ```ts
 * const magnet = createMagneticButton(document.querySelector('.cta')!)
 * magnet.start()
 * // …later
 * magnet.destroy()
 * ```
 */
export function createMagneticButton(el: HTMLElement, opts: Partial<MagneticButtonOptions> = {}): EffectHandle {
  return mount<MagneticButtonOptions>(el, opts, {
    defaults: magneticButtonDefaults,
    kind: 'dom',
    create: () => new MagneticButtonSurface()
  })
}

export default createMagneticButton
