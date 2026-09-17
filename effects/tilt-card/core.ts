/*
 * Tilt: Beamish
 * https://beamish.ink/effects/tilt-card
 *
 * A panel that leans towards the cursor, with a sheen raking across it as it
 * goes. No canvas, no WebGL, no dependencies: one transform and one gradient.
 *
 * The easing is a CSS transition rather than a per-frame spring, which keeps
 * `renderAtTime` pure in `t` and lets the recorder scrub the smoothing along
 * with everything else.
 */

import { mount, type BaseOptions, type EffectHandle, type Pointer, type Surface } from '../../shared/runtime'

export type TiltCardOptions = BaseOptions & {
  /** Most it leans at the corners, in degrees. */
  maxTilt: number
  /** Perspective distance in pixels. Lower is a wider, more theatrical lens. */
  perspective: number
  /** Scale while the pointer is over it. 1 is no lift. */
  scale: number
  /** Strength of the sheen, 0 to 1. Zero removes the overlay entirely. */
  sheen: number
  /** Colour of the sheen. On paper a warm white reads as light, not as gloss. */
  sheenColor: string
  /** How wide the sheen pool is, as a fraction of the panel. */
  sheenSize: number
  /** Milliseconds the panel takes to follow the cursor, and to settle back. */
  ease: number
  /** Reverse the lean, so it tips away from the cursor. */
  invert: boolean
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const tiltCardDefaults: TiltCardOptions = {
  maxTilt: 9,
  perspective: 900,
  scale: 1.02,
  sheen: 0.5,
  sheenColor: '#ffffff',
  sheenSize: 0.75,
  ease: 320,
  invert: false,
  reducedMotionTime: 0
}

class TiltCardSurface implements Surface<TiltCardOptions> {
  private host: HTMLElement | null = null
  private sheen: HTMLElement | null = null
  private previousPosition = ''
  private previousTransformStyle = ''

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host

    // A static host cannot hold an absolutely positioned overlay, and the sheen
    // has to be inside the panel so it tilts with it.
    this.previousPosition = host.style.position
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    this.previousTransformStyle = host.style.transformStyle
    host.style.transformStyle = 'preserve-3d'
    host.style.willChange = 'transform'

    const sheen = document.createElement('div')
    sheen.setAttribute('aria-hidden', 'true')
    sheen.style.cssText =
      'position:absolute;inset:0;pointer-events:none;opacity:0;border-radius:inherit;mix-blend-mode:soft-light'
    host.appendChild(sheen)
    this.sheen = sheen
  }

  resize(): void {}

  render(_t: number, opts: TiltCardOptions, pointer: Pointer): void {
    const host = this.host
    if (!host) return

    // Everything eases through one CSS transition. Nothing here integrates, so
    // the same time always produces the same declared style.
    const ease = `${Math.max(opts.ease, 0)}ms var(--ease-out-expo, cubic-bezier(0.22, 1, 0.36, 1))`
    host.style.transition = `transform ${ease}`

    if (!pointer.active) {
      host.style.transform = ''
      if (this.sheen) {
        this.sheen.style.transition = `opacity ${ease}`
        this.sheen.style.opacity = '0'
      }
      return
    }

    // Origin at the centre, so the corners are the extremes and the middle is
    // flat. x tips around the vertical axis, y around the horizontal one.
    const x = pointer.x * 2 - 1
    const y = pointer.y * 2 - 1
    const direction = opts.invert ? -1 : 1

    host.style.transform = [
      `perspective(${opts.perspective}px)`,
      `rotateX(${-y * opts.maxTilt * direction}deg)`,
      `rotateY(${x * opts.maxTilt * direction}deg)`,
      `scale(${opts.scale})`
    ].join(' ')

    if (!this.sheen) return
    if (opts.sheen <= 0) {
      this.sheen.style.opacity = '0'
      return
    }
    const size = Math.max(opts.sheenSize, 0.05) * 100
    this.sheen.style.transition = `opacity ${ease}, background ${ease}`
    this.sheen.style.background = `radial-gradient(${size}% ${size}% at ${pointer.x * 100}% ${pointer.y * 100}%, ${opts.sheenColor} 0%, transparent 100%)`
    this.sheen.style.opacity = String(opts.sheen)
  }

  teardown(): void {
    const host = this.host
    if (host) {
      host.style.transform = ''
      host.style.transition = ''
      host.style.willChange = ''
      host.style.position = this.previousPosition
      host.style.transformStyle = this.previousTransformStyle
    }
    this.sheen?.remove()
    this.sheen = null
    this.host = null
  }
}

/**
 * Mount Tilt onto `el`. The element itself is what leans, so put it on the card,
 * not on a wrapper around the card.
 *
 * ```ts
 * const tilt = createTiltCard(document.querySelector('.card')!)
 * tilt.start()
 * // …later
 * tilt.destroy()
 * ```
 *
 * `destroy()` removes the sheen and clears every style it set.
 */
export function createTiltCard(el: HTMLElement, opts: Partial<TiltCardOptions> = {}): EffectHandle {
  return mount<TiltCardOptions>(el, opts, {
    defaults: tiltCardDefaults,
    kind: 'dom',
    create: () => new TiltCardSurface()
  })
}

export default createTiltCard
