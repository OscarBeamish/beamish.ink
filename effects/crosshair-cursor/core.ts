/*
 * CrosshairCursor: Beamish
 * https://beamish.ink/effects/crosshair-cursor
 *
 * A pair of hairlines across the panel and four corner brackets where they
 * meet, following the pointer. A viewfinder rather than a cursor.
 *
 * The thing that makes this worth building, rather than two divs tracking a
 * mouse, is what it does when it passes over something you can press: the
 * brackets leave the cursor and square up around that element instead. It stops
 * being a decoration on the pointer and becomes a statement about the page,
 * which is the whole idea of a reticle. Nothing locks on to empty space.
 *
 * Three decisions in here worth knowing about:
 *
 *   What counts as a target is a CSS selector, not a guess. Anything that
 *   sniffs for clickability gets it wrong in both directions: it misses the
 *   div somebody has wired a handler to, and it locks on to every link in a
 *   paragraph of running text.
 *
 *   The lock comes from a hit test at the pointer, not from a listener for
 *   entering an element. A scripted path moves no real pointer and fires no
 *   events, so an effect that locked on only for a live cursor would record as
 *   a reticle that never finds anything. The test is skipped while the pointer
 *   is still, because it flushes layout and the answer cannot have changed.
 *
 *   The brackets move to the target faster than the crosshair follows the hand.
 *   A reticle that drifts lazily into place has not locked on to anything; the
 *   snap is the feedback.
 *
 * Like every pointer effect here it eases against its own last frame, so it is
 * deliberately not pure in `t`, and the recorder drives it from a scripted path
 * instead.
 */

import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type Pointer,
  type Surface
} from '../../shared/runtime'

export type CrosshairCursorOptions = BaseOptions & {
  /** The lines and the brackets. */
  colour: string
  /** Thickness of a hairline, in pixels. */
  thickness: number
  /** Half-width of the free reticle, in pixels. */
  size: number
  /** Length of a corner bracket's arms, in pixels. */
  corner: number
  /** Space left around a locked target, in pixels. */
  padding: number
  /** How fast the crosshair follows the hand, 0 to 1 per frame. */
  ease: number
  /** How fast the brackets take a target, 0 to 1 per frame. */
  snap: number
  /** What the brackets will lock on to. A CSS selector. */
  target: string
  /** Draw the long hairlines as well as the brackets. */
  lines: boolean
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const crosshairCursorDefaults: CrosshairCursorOptions = {
  colour: '#c44400',
  thickness: 1,
  size: 13,
  corner: 9,
  padding: 6,
  ease: 0.22,
  snap: 0.42,
  target: 'a, button, [data-target]',
  lines: true,
  reducedMotionTime: 0
}

type Rect = { x: number; y: number; w: number; h: number }

class CrosshairCursorSurface implements Surface<CrosshairCursorOptions> {
  private host: HTMLElement | null = null
  private layer: HTMLElement | null = null
  private across: HTMLElement | null = null
  private down: HTMLElement | null = null
  private corners: HTMLElement[] = []
  private box = { width: 1, height: 1 }
  /** Where the crosshair is, in pixels, eased behind the hand. */
  private at = { x: 0, y: 0 }
  /** Where the brackets are, eased towards whatever they are framing. */
  private frame: Rect = { x: 0, y: 0, w: 0, h: 0 }
  /** The target's rect, measured when it was entered. Null when free. */
  private locked: Rect | null = null
  /** Where the last hit test was done, so it is not repeated for free. */
  private testedAt = { x: -1e9, y: -1e9 }
  private started = false

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host

    const layer = document.createElement('div')
    layer.setAttribute('aria-hidden', 'true')
    layer.style.cssText =
      'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2'
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.append(layer)
    this.layer = layer

    const line = () => {
      const el = document.createElement('i')
      el.style.cssText = 'position:absolute;top:0;left:0;display:block;will-change:transform'
      layer.append(el)
      return el
    }
    this.across = line()
    this.down = line()

    /*
     * Four brackets rather than a box, because a box round a button is a
     * selection and a bracket at each corner is a sight. Each is two borders on
     * one element, which is why they are rotated into place rather than styled
     * four different ways.
     */
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('i')
      el.style.cssText =
        'position:absolute;top:0;left:0;display:block;will-change:transform;' +
        'border-style:solid;border-right:0;border-bottom:0'
      layer.append(el)
      this.corners.push(el)
    }

  }

  resize(size: { width: number; height: number }): void {
    this.box = { width: size.width, height: size.height }
  }

  render(_t: number, opts: CrosshairCursorOptions, pointer: Pointer): void {
    const across = this.across
    const down = this.down
    if (!across || !down) return
    const ease = Math.min(Math.max(opts.ease, 0.01), 1)
    const snap = Math.min(Math.max(opts.snap, 0.01), 1)

    const wantX = pointer.x * this.box.width
    const wantY = pointer.y * this.box.height

    /*
     * Locking on. A hit test from where the pointer is, rather than a listener
     * for entering an element, because a scripted path moves no real pointer and
     * fires no events: an effect that locked on only for a live cursor would
     * record as a reticle that never finds anything.
     *
     * A selector rather than a guess at what is clickable. Sniffing gets it
     * wrong in both directions: it misses the div somebody wired a handler to,
     * and it locks on to every link in a paragraph of running text.
     *
     * Only when the pointer has actually moved, because a hit test flushes
     * layout and the answer cannot change while the pointer is still.
     */
    const host = this.host
    if (host && Math.hypot(wantX - this.testedAt.x, wantY - this.testedAt.y) > 2) {
      this.testedAt = { x: wantX, y: wantY }
      const base = host.getBoundingClientRect()
      const found = pointer.active
        ? document
            .elementFromPoint(base.left + wantX, base.top + wantY)
            ?.closest(opts.target || 'none')
        : null
      if (found && host.contains(found)) {
        const rect = found.getBoundingClientRect()
        this.locked = {
          x: rect.left - base.left + rect.width / 2,
          y: rect.top - base.top + rect.height / 2,
          w: rect.width / 2,
          h: rect.height / 2
        }
      } else {
        this.locked = null
      }
    }
    if (!this.started) {
      // Placed rather than eased on the first frame, or the reticle swings in
      // from the corner every time the effect is mounted.
      this.at = { x: wantX, y: wantY }
      this.started = true
    } else {
      this.at.x += (wantX - this.at.x) * ease
      this.at.y += (wantY - this.at.y) * ease
    }

    /*
     * What the brackets are framing: the locked target if there is one, and
     * otherwise a small square on the crosshair. They take a target faster than
     * the crosshair follows the hand, because a reticle that drifts lazily into
     * place has not locked on to anything.
     */
    const free: Rect = { x: this.at.x, y: this.at.y, w: opts.size, h: opts.size }
    const want = this.locked
      ? {
          x: this.locked.x,
          y: this.locked.y,
          w: this.locked.w + opts.padding,
          h: this.locked.h + opts.padding
        }
      : free
    const k = this.locked ? snap : ease
    this.frame.x += (want.x - this.frame.x) * k
    this.frame.y += (want.y - this.frame.y) * k
    this.frame.w += (want.w - this.frame.w) * k
    this.frame.h += (want.h - this.frame.h) * k

    const weight = Math.max(opts.thickness, 0.5)
    const show = pointer.active ? '1' : '0'

    const setLine = (el: HTMLElement, horizontal: boolean) => {
      el.style.background = opts.colour
      el.style.opacity = opts.lines ? show : '0'
      if (horizontal) {
        el.style.width = `${this.box.width}px`
        el.style.height = `${weight}px`
        el.style.transform = `translate(0, ${(this.frame.y - weight / 2).toFixed(2)}px)`
      } else {
        el.style.width = `${weight}px`
        el.style.height = `${this.box.height}px`
        el.style.transform = `translate(${(this.frame.x - weight / 2).toFixed(2)}px, 0)`
      }
    }
    setLine(across, true)
    setLine(down, false)

    const arm = Math.max(opts.corner, 1)
    for (let i = 0; i < 4; i++) {
      const el = this.corners[i]!
      // Each bracket is the same two borders turned a quarter further round.
      const flipX = i === 1 || i === 2 ? -1 : 1
      const flipY = i === 2 || i === 3 ? -1 : 1
      const x = this.frame.x - flipX * this.frame.w
      const y = this.frame.y - flipY * this.frame.h
      el.style.width = `${arm}px`
      el.style.height = `${arm}px`
      el.style.borderWidth = `${weight}px`
      el.style.borderColor = opts.colour
      el.style.opacity = show
      el.style.transform =
        `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${flipX}, ${flipY})`
    }
  }

  teardown(): void {
    const host = this.host
    if (host) host.style.position = ''
    this.layer?.remove()
    this.host = null
    this.layer = null
    this.across = null
    this.down = null
    this.corners = []
    this.locked = null
    this.started = false
  }
}

/**
 * Mount CrosshairCursor onto `el`. Put it on the area the reticle should cover;
 * it keeps the element's own content and draws over the top of it.
 *
 * ```ts
 * const sight = createCrosshairCursor(document.querySelector('#panel')!)
 * sight.start()
 * // …later
 * sight.destroy()
 * ```
 */
export function createCrosshairCursor(
  el: HTMLElement,
  opts: Partial<CrosshairCursorOptions> = {}
): EffectHandle {
  return mount<CrosshairCursorOptions>(el, opts, {
    defaults: crosshairCursorDefaults,
    kind: 'dom',
    create: () => new CrosshairCursorSurface()
  })
}

export default createCrosshairCursor
