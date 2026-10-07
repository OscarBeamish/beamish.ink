/*
 * VariableWeightText: Beamish
 * https://beamish.ink/effects/variable-weight-text
 *
 * Type that puts on weight under the cursor. The hand presses, the letters take
 * more ink, and the line stays exactly where it was.
 *
 * That last clause is the whole problem, and it is why most versions of this
 * are unusable on anything but a single centred word. A variable font's weight
 * axis changes the advance width of every glyph it touches: go from 400 to 700
 * and the letters get wider, so a line whose letters are individually weighted
 * reflows continuously as the cursor crosses it. Characters shuffle sideways,
 * the line end breathes, and anything laid out after it moves too.
 *
 * So each character is measured once at the heaviest weight it will ever carry
 * and held in a box that wide. The letters are centred in their boxes, the
 * tracking opens very slightly, and nothing moves again for the life of the
 * page. It costs one measuring pass and it is the difference between an effect
 * you can put on a paragraph and one you can put on a word.
 *
 * Two other things worth knowing.
 *
 * The falloff has a shoulder rather than being linear. Pressure does not fall
 * off in a straight line from a nib, and a linear ramp reads as a triangle of
 * bold sliding along the line, which is the second giveaway after the jitter.
 *
 * The axis is a setting, not a constant. Weight is the obvious one and the
 * default, but a face with a width or a slant axis will do this just as well,
 * and the only thing that changes is three strings.
 */

import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type Pointer,
  type Surface
} from '../../shared/runtime'

export type VariableWeightTextOptions = BaseOptions & {
  /** The variation axis to drive. Four letters, as the font declares it. */
  axis: string
  /** Where the axis sits with the cursor far away. */
  rest: number
  /** Where it goes directly under the cursor. */
  peak: number
  /** How far the hand reaches, as a share of the element's width. */
  reach: number
  /** Shape of the falloff. 1 is linear, higher keeps the peak tighter. */
  shoulder: number
  /** How fast the letters follow the hand, 0 to 1 per frame. */
  ease: number
  /** Hold each character in a box as wide as its heaviest form. */
  steady: boolean
  /** Extra tracking, in ems. A little room stops the heavy letters touching. */
  tracking: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const variableWeightTextDefaults: VariableWeightTextOptions = {
  axis: 'wght',
  rest: 400,
  peak: 700,
  reach: 0.22,
  shoulder: 2.4,
  ease: 0.22,
  steady: true,
  tracking: 0.012,
  reducedMotionTime: 0
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

class VariableWeightTextSurface implements Surface<VariableWeightTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private cells: HTMLElement[] = []
  /** Each character's current axis value, eased behind the hand. */
  private at: number[] = []
  private built = false
  private measured = false
  private measuredFor = ''
  private fontsPending = false
  private box = { width: 1, height: 1 }
  private started = false

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  private build(): void {
    const host = this.host
    if (!host || this.built) return

    host.textContent = ''
    this.cells = []

    // The text a screen reader gets: one string, unchanged, out of sight.
    const label = document.createElement('span')
    label.textContent = this.original
    label.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'

    const visual = document.createElement('span')
    visual.setAttribute('aria-hidden', 'true')

    const words = this.original.split(' ')
    words.forEach((word, index) => {
      // Words stay whole so the text still wraps where it would have wrapped.
      const wrapper = document.createElement('span')
      wrapper.style.display = 'inline-block'
      wrapper.style.whiteSpace = 'nowrap'
      for (const character of Array.from(word)) {
        const cell = document.createElement('span')
        cell.textContent = character
        cell.style.display = 'inline-block'
        cell.style.willChange = 'font-variation-settings'
        wrapper.append(cell)
        this.cells.push(cell)
      }
      visual.append(wrapper)
      if (index < words.length - 1) visual.append(document.createTextNode(' '))
    })

    host.append(label, visual)
    this.built = true
    this.at = this.cells.map(() => variableWeightTextDefaults.rest)

    /*
     * Widths measured in the fallback face are the wrong widths, and the boxes
     * would keep them for the life of the page. Measure again once the real
     * face has arrived.
     */
    if (!this.fontsPending && typeof document !== 'undefined' && document.fonts) {
      this.fontsPending = true
      document.fonts.ready.then(() => {
        this.measured = false
      })
    }
  }

  /*
   * The measuring pass, and the reason this works on a paragraph.
   *
   * A weight axis changes the advance width of every glyph it touches, so a
   * line of individually weighted letters reflows as the cursor crosses it.
   * Each box is pinned to the width of its own character at the heaviest value
   * the axis will reach, which is the widest it can ever be, and the letter is
   * centred in it. After this nothing moves again.
   */
  private measure(opts: VariableWeightTextOptions): void {
    const key = `${opts.axis}|${opts.peak}|${opts.rest}|${opts.steady}|${opts.tracking}`
    if (this.measured && this.measuredFor === key) return
    this.measuredFor = key

    const heaviest = Math.max(opts.rest, opts.peak)
    for (const cell of this.cells) {
      cell.style.letterSpacing = `${opts.tracking}em`
      if (!opts.steady) {
        cell.style.width = ''
        cell.style.textAlign = ''
        continue
      }
      const settings = `"${opts.axis}" ${heaviest}`
      const before = cell.style.fontVariationSettings
      cell.style.width = ''
      cell.style.fontVariationSettings = settings
      cell.style.width = `${cell.getBoundingClientRect().width.toFixed(2)}px`
      cell.style.textAlign = 'center'
      cell.style.fontVariationSettings = before
    }
    this.measured = true
  }

  resize(size: { width: number; height: number }): void {
    this.box = { width: size.width, height: size.height }
    this.measured = false
  }

  render(_t: number, opts: VariableWeightTextOptions, pointer: Pointer): void {
    this.build()
    if (this.cells.length === 0) return
    this.measure(opts)

    const reach = Math.max(opts.reach, 0.001) * this.box.width
    const ease = Math.min(Math.max(opts.ease, 0.01), 1)
    const shoulder = Math.max(opts.shoulder, 0.1)
    const px = pointer.x * this.box.width
    const py = pointer.y * this.box.height
    const near = pointer.active

    const base = this.host?.getBoundingClientRect()
    if (!base) return

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]!
      const rect = cell.getBoundingClientRect()
      const cx = rect.left - base.left + rect.width / 2
      const cy = rect.top - base.top + rect.height / 2

      /*
       * Distance to the hand, with a shoulder on the falloff. Pressure does not
       * fall off in a straight line from a nib, and a linear ramp reads as a
       * triangle of bold sliding along the line.
       */
      const distance = Math.hypot(px - cx, py - cy)
      const closeness = near ? Math.pow(1 - clamp01(distance / reach), shoulder) : 0
      const want = opts.rest + (opts.peak - opts.rest) * closeness

      /*
       * Eased against the last frame, like every pointer effect here, so it is
       * deliberately not pure in `t`. The recorder drives it from a scripted
       * path instead.
       */
      const current = this.at[i] ?? opts.rest
      const value = this.started ? current + (want - current) * ease : want
      this.at[i] = value

      // Written to one decimal. A weight axis quantised to a tenth is finer
      // than any face resolves, and it stops the style being rewritten every
      // frame for a change nothing can draw.
      const settings = `"${opts.axis}" ${value.toFixed(1)}`
      if (cell.style.fontVariationSettings !== settings) {
        cell.style.fontVariationSettings = settings
      }
    }
    this.started = true
  }

  teardown(): void {
    if (this.host && this.original) this.host.textContent = this.original
    this.cells = []
    this.at = []
    this.built = false
    this.measured = false
    this.measuredFor = ''
    this.started = false
    this.host = null
  }
}

/**
 * Mount VariableWeightText into `el`. The element must already contain the
 * text, and the face must have the axis being driven: a static font will
 * ignore it silently.
 *
 * ```ts
 * const pressed = createVariableWeightText(document.querySelector('h1')!)
 * pressed.start()
 * // …later
 * pressed.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left exactly as it
 * was found.
 */
export function createVariableWeightText(
  el: HTMLElement,
  opts: Partial<VariableWeightTextOptions> = {}
): EffectHandle {
  return mount<VariableWeightTextOptions>(el, opts, {
    defaults: variableWeightTextDefaults,
    kind: 'dom',
    create: () => new VariableWeightTextSurface()
  })
}

export default createVariableWeightText
