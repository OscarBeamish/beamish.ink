/*
 * OdometerNumber: Beamish
 * https://beamish.ink/effects/odometer-number
 *
 * A number on wheels. Each digit is a strip of figures behind a window, and the
 * strips roll.
 *
 * The whole difference between this and ten independent spinners is the carry,
 * and it is one line of arithmetic. A wheel does not move on its own: it is
 * driven by the one to its right, and it only turns while that one is going
 * from nine round to zero. So the tens wheel sits perfectly still for ninety
 * per cent of the units wheel's revolution and then turns all at once, and the
 * hundreds wheel is still for ninety per cent of that.
 *
 * You can see this on any petrol pump. The pence wheel is a blur, the pounds
 * wheel steps, and the tens of pounds wheel has not moved all day. Get it wrong
 * and every wheel turns at its own steady speed, which is a fruit machine.
 *
 * `carry` is how much of the lower wheel's travel the upper one moves during.
 * Narrow is a geneva drive, which snaps, and every figure sits squarely in its
 * window. Set it to 1 and you have a straight gear train, where every wheel is
 * always turning, and that has a consequence worth knowing: such a counter
 * never shows clean figures at all except at exact multiples. It is why a gas
 * meter is read to the last settled digit rather than straight off the dial.
 *
 * It is pure in `t`: each wheel's position is arithmetic on the value, and the
 * value is arithmetic on the clock.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type OdometerNumberOptions = BaseOptions & {
  /** Where the count starts. */
  from: number
  /** Where it ends. */
  to: number
  /** Milliseconds for the whole travel. */
  duration: number
  /** Milliseconds before it starts. */
  hold: number
  /** Fewest wheels to show. Short numbers are padded with leading figures. */
  digits: number
  /** What goes between groups of three. Empty for none. */
  group: string
  /** How much of a wheel's travel the wheel above it moves during, 0 to 1. */
  carry: number
  /** How far the figures above and below the window are shaded, 0 to 1. */
  drum: number
  /** Seed. Unused by the maths; here so two counters can differ. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const odometerNumberDefaults: OdometerNumberOptions = {
  from: 0,
  to: 128640,
  duration: 4200,
  hold: 300,
  digits: 6,
  group: '',
  carry: 0.12,
  drum: 0.55,
  seed: 7,
  reducedMotionTime: 999
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** The one easing this library uses for arrivals. Matches --ease-out-expo. */
const easeOutExpo = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k))

/** Smoothstep, for the window a wheel turns in. */
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / Math.max(edge1 - edge0, 1e-6))
  return t * t * (3 - 2 * t)
}

type Wheel = { window: HTMLElement; strip: HTMLElement }

class OdometerNumberSurface implements Surface<OdometerNumberOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private label: HTMLElement | null = null
  private wheels: Wheel[] = []
  private built = false
  private builtFor = ''
  private lineHeight = 1

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').trim()
  }

  /*
   * One window and one strip per wheel. The strip carries nought to nine and
   * then nought again: without the repeat, a wheel rolling from nine has
   * nothing to roll on to and snaps back through the whole drum.
   */
  private build(opts: OdometerNumberOptions): void {
    const host = this.host
    if (!host) return

    const count = Math.max(
      Math.round(opts.digits),
      String(Math.floor(Math.max(Math.abs(opts.from), Math.abs(opts.to)))).length
    )
    const key = `${count}|${opts.group}`
    if (this.built && this.builtFor === key) return
    this.builtFor = key

    host.textContent = ''
    this.wheels = []

    // The number a screen reader gets: the final value, as a number, once.
    const label = document.createElement('span')
    label.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'
    this.label = label

    const visual = document.createElement('span')
    visual.setAttribute('aria-hidden', 'true')
    visual.style.cssText = 'display:inline-flex;align-items:stretch;overflow:hidden'

    for (let i = 0; i < count; i++) {
      const place = count - 1 - i

      const window = document.createElement('span')
      window.style.cssText =
        'position:relative;display:inline-block;overflow:hidden;height:1em;' +
        'line-height:1em;vertical-align:top'

      /*
       * The strip stays in the flow. Taken out of it, the window has no child
       * with a width and collapses to nothing: the wheels are drawn, correctly,
       * in a box of zero width, and the whole counter is invisible with no
       * error anywhere.
       */
      const strip = document.createElement('span')
      strip.style.cssText =
        'display:flex;flex-direction:column;align-items:center;will-change:transform'
      for (let d = 0; d <= 10; d++) {
        const figure = document.createElement('span')
        figure.textContent = String(d % 10)
        figure.style.cssText = 'display:block;height:1em;line-height:1em'
        strip.append(figure)
      }
      window.append(strip)
      visual.append(window)
      this.wheels.push({ window, strip })

      // Separators are furniture between the wheels, not wheels themselves.
      if (opts.group.length > 0 && place > 0 && place % 3 === 0) {
        const gap = document.createElement('span')
        gap.textContent = opts.group
        gap.style.cssText = 'display:inline-block;height:1em;line-height:1em'
        visual.append(gap)
      }
    }

    host.append(label, visual)
    this.built = true
  }

  resize(): void {
    // The window height is an em, so it follows the type on its own. Only the
    // pixel value used for the transform has to be read again.
    const first = this.wheels[0]
    if (first) this.lineHeight = first.window.getBoundingClientRect().height || 1
  }

  render(t: number, opts: OdometerNumberOptions): void {
    this.build(opts)
    if (this.wheels.length === 0) return
    if (this.lineHeight <= 1) this.resize()

    const duration = Math.max(opts.duration, 1) / 1000
    const hold = Math.max(opts.hold, 0) / 1000
    const travelled = easeOutExpo(clamp01((t - hold) / duration))
    const value = opts.from + (opts.to - opts.from) * travelled

    if (this.label) {
      const shown = String(Math.round(value))
      if (this.label.textContent !== shown) this.label.textContent = shown
    }

    const carry = clamp01(opts.carry)
    const count = this.wheels.length

    for (let i = 0; i < count; i++) {
      const place = count - 1 - i
      const scaled = Math.abs(value) / Math.pow(10, place)

      /*
       * The carry, and the only interesting line in the file.
       *
       * A wheel is driven by the one to its right and turns only while that one
       * is going from nine round to nought. So the whole figure is where this
       * wheel sits, and the fraction decides how far through its own turn it is
       * once the wheel below has entered the last `carry` of its travel.
       *
       * Narrow `carry` is a geneva drive and snaps. Wide is a straight gear
       * train, where every wheel turns all the time and the high ones sit
       * permanently between two figures. Both are real and they look nothing
       * alike.
       */
      const whole = Math.floor(scaled)
      const within = scaled - whole
      const turn = carry >= 1 ? within : smoothstep(1 - carry, 1, within)
      const position = ((whole % 10) + turn + 10) % 10

      const wheel = this.wheels[i]!
      const offset = -position * this.lineHeight
      const transform = `translateY(${offset.toFixed(2)}px)`
      if (wheel.strip.style.transform !== transform) wheel.strip.style.transform = transform

      /*
       * The drum. A figure near the edge of the window is on the curve of the
       * wheel and going out of sight, so it loses light. Flat instead, the
       * figures slide past as though printed on a belt.
       */
      const shade = (1 - Math.abs(turn * 2 - 1)) * opts.drum
      const filter = shade > 0.01 ? `brightness(${(1 - shade * 0.45).toFixed(3)})` : ''
      if (wheel.strip.style.filter !== filter) wheel.strip.style.filter = filter
    }
  }

  teardown(): void {
    if (this.host) this.host.textContent = this.original
    this.wheels = []
    this.label = null
    this.built = false
    this.builtFor = ''
    this.host = null
  }
}

/**
 * Mount OdometerNumber into `el`. Whatever is in the element is replaced by the
 * wheels, and put back on destroy.
 *
 * ```ts
 * const miles = createOdometerNumber(document.querySelector('#miles')!, {
 *   to: 128640
 * })
 * miles.start()
 * // …later
 * miles.destroy()
 * ```
 */
export function createOdometerNumber(
  el: HTMLElement,
  opts: Partial<OdometerNumberOptions> = {}
): EffectHandle {
  return mount<OdometerNumberOptions>(el, opts, {
    defaults: odometerNumberDefaults,
    kind: 'dom',
    create: () => new OdometerNumberSurface()
  })
}

export default createOdometerNumber
