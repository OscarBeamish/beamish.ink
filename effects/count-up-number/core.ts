/*
 * Tally: Beamish
 * https://beamish.ink/effects/count-up-number
 *
 * A number counting up to the one already in the element. No canvas, no WebGL,
 * no dependencies.
 *
 * It reads the target from the text content, so the real figure is in the HTML
 * before any JavaScript runs and stays there if none ever does. Formatting goes
 * through Intl.NumberFormat rather than string padding, which is the part
 * everyone gets wrong: 1,284 in Britain is 1.284 in Germany, and a hand-rolled
 * separator is wrong in half the world.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type CountUpNumberOptions = BaseOptions & {
  /** Where the count starts. */
  from: number
  /** Milliseconds from start to finish. */
  duration: number
  /** Decimal places. Follows the element's own text when left at 0. */
  decimals: number
  /** BCP 47 locale for grouping and the decimal mark. Empty follows the browser. */
  locale: string
  /** Text before the number, kept out of the parsing. */
  prefix: string
  /** Text after the number. */
  suffix: string
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const countUpNumberDefaults: CountUpNumberOptions = {
  from: 0,
  duration: 1800,
  decimals: 0,
  locale: '',
  prefix: '',
  suffix: '',
  reducedMotionTime: 999
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Matches --ease-out-expo. The one easing this library uses for arrivals. */
const easeOutExpo = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k))

class CountUpNumberSurface implements Surface<CountUpNumberOptions> {
  private host: HTMLElement | null = null
  private output: HTMLElement | null = null
  private original = ''
  private target = 0
  private places = 0

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host
    this.original = (host.textContent ?? '').trim()

    /*
     * Strip everything that is not a digit, a sign or a separator, then decide
     * which separator is the decimal mark by which one comes last. "1.284,50"
     * and "1,284.50" are the same number written by different people.
     */
    const cleaned = this.original.replace(/[^\d.,-]/g, '')
    const lastComma = cleaned.lastIndexOf(',')
    const lastDot = cleaned.lastIndexOf('.')
    const decimalMark = lastComma > lastDot ? ',' : '.'
    const normalised = cleaned
      .split('')
      .filter(character => character !== (decimalMark === ',' ? '.' : ','))
      .join('')
      .replace(',', '.')

    const parsed = Number.parseFloat(normalised)
    this.target = Number.isFinite(parsed) ? parsed : 0
    const fraction = normalised.split('.')[1]
    this.places = fraction ? fraction.length : 0

    // The finished number stays in the accessibility tree as one string. A
    // screen reader on a live-updating number reads every value it passes.
    host.textContent = ''
    const label = document.createElement('span')
    label.textContent = this.original
    label.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'

    const output = document.createElement('span')
    output.setAttribute('aria-hidden', 'true')
    host.append(label, output)
    this.output = output
  }

  resize(): void {}

  render(t: number, opts: CountUpNumberOptions): void {
    const output = this.output
    if (!output) return

    // There is no `to` option on purpose. The target lives in the element's
    // text, which is what makes the figure correct before any script runs.
    const places = opts.decimals || this.places
    const progress = easeOutExpo(clamp01(t / (Math.max(opts.duration, 1) / 1000)))
    const value = opts.from + (this.target - opts.from) * progress

    const formatter = new Intl.NumberFormat(opts.locale || undefined, {
      minimumFractionDigits: places,
      maximumFractionDigits: places
    })
    output.textContent = `${opts.prefix}${formatter.format(value)}${opts.suffix}`
  }

  teardown(): void {
    if (this.host) this.host.textContent = this.original
    this.output = null
    this.host = null
  }
}

/**
 * Mount Tally onto `el`. The element must already contain the final number.
 *
 * ```html
 * <span id="stars">45,400</span>
 * ```
 *
 * ```ts
 * const tally = createCountUpNumber(document.querySelector('#stars')!)
 * tally.start()
 * // …later
 * tally.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left as it was
 * found.
 */
export function createCountUpNumber(el: HTMLElement, opts: Partial<CountUpNumberOptions> = {}): EffectHandle {
  return mount<CountUpNumberOptions>(el, opts, {
    defaults: countUpNumberDefaults,
    kind: 'dom',
    create: () => new CountUpNumberSurface()
  })
}

export default createCountUpNumber
