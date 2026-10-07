/*
 * EmbossedText: Beamish
 * https://beamish.ink/effects/embossed-text
 *
 * Type pressed into paper. A platen comes down, the sheet takes the impression,
 * and the paper springs back a little.
 *
 * The version of this that goes around is called depth text and it extrudes the
 * letters towards the viewer in fake 3D, with a stack of shadows going down and
 * to the right. That is a sign, or a plastic badge. Letterpress goes the other
 * way: the type is below the surface afterwards, the paper is deformed, and what
 * you can see is the light catching the walls of the impression.
 *
 * Which means the whole thing is two shadows and a colour, and getting them
 * right is the entire job:
 *
 *   A dark edge on the side the light comes from, because that wall of the
 *   impression faces away from it. A light edge opposite. Everybody writing a
 *   debossed text shadow gets these the wrong way round at least once, and the
 *   result is a letter standing up off the page.
 *
 *   The impression is uneven across the line. Getting a forme to print evenly is
 *   a job with a name, makeready, and before it is done some letters bite harder
 *   than others. That unevenness is the difference between a press and a filter.
 *
 *   Ink is optional. A blind emboss has no ink at all: the letter face is the
 *   same paper as the page, and all you are reading is the impression. It is the
 *   best thing this effect does and it is one setting.
 *
 * The whole line presses at once, because a platen is one surface coming down.
 * The variation is in how hard each letter bites, not in when.
 *
 * It is pure in `t`. The press is an eased function of the clock and the
 * unevenness is a hash of each letter's index.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type EmbossedTextOptions = BaseOptions & {
  /** The sheet. The letter face is this colour when no ink has transferred. */
  paper: string
  /** The ink on the type. */
  ink: string
  /** How much ink transferred, 0 to 1. 0 is a blind emboss. */
  transfer: number
  /** How deep the impression is, in ems. */
  depth: number
  /** Where the light comes from, in degrees. 0 is from the right. */
  light: number
  /** Softness of the walls of the impression, in ems. */
  softness: number
  /** Milliseconds for the platen to come down. */
  press: number
  /** Milliseconds before it does. */
  hold: number
  /** How much the paper springs back, 0 to 1. */
  spring: number
  /** How uneven the impression is across the line, 0 to 1. */
  makeready: number
  /** Seed for the unevenness. The same seed gives the same forme. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const embossedTextDefaults: EmbossedTextOptions = {
  paper: '#fbfaf4',
  ink: '#2b2b24',
  transfer: 0,
  depth: 0.045,
  light: 125,
  softness: 0.012,
  press: 620,
  hold: 240,
  spring: 0.35,
  makeready: 0.45,
  seed: 7,
  reducedMotionTime: 999
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

function rgb(value: string): [number, number, number] {
  const hex = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ]
  }
  const nums = value.match(/[\d.]+/g)
  if (nums && nums.length >= 3) return [Number(nums[0]), Number(nums[1]), Number(nums[2])]
  return [0, 0, 0]
}

/*
 * The press. It overshoots and settles, because paper is not clay: it is
 * compressed past where it ends up and pushes some of that back. A plain
 * ease-out arrives and stops, which reads as a letter fading in rather than as
 * a sheet being struck.
 *
 * Two curves blended by `spring`, rather than one curve with a parameter in it.
 * The settled one is a plain exponential approach and the sprung one is a damped
 * oscillation whose first overshoot lands around 45% of the way through. Both
 * start at exactly 0, and the blend is divided by its own value at 1 so the
 * press finishes at exactly 1 whatever the spring is: without that the end of
 * the animation is a hundredth short, which is invisible on screen and shows up
 * as the last frame of a recording not matching the resting state.
 */
function platen(x: number, spring: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const curve = (u: number) =>
    (1 - Math.exp(-5.5 * u)) * (1 - spring) + (1 - Math.exp(-4 * u) * Math.cos(6.9 * u)) * spring
  return curve(x) / curve(1)
}

class EmbossedTextSurface implements Surface<EmbossedTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private cells: HTMLElement[] = []
  private built = false

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
        wrapper.append(cell)
        this.cells.push(cell)
      }
      visual.append(wrapper)
      if (index < words.length - 1) visual.append(document.createTextNode(' '))
    })

    host.append(label, visual)
    this.built = true
  }

  resize(): void {}

  render(t: number, opts: EmbossedTextOptions): void {
    this.build()
    if (this.cells.length === 0) return

    const press = Math.max(opts.press, 1) / 1000
    const hold = Math.max(opts.hold, 0) / 1000
    const pressed = platen((t - hold) / press, clamp01(opts.spring))

    /*
     * Which way the walls face. The dark edge goes on the side the light comes
     * from, because that wall of the impression is turned away from it, and the
     * light edge goes opposite. Reverse these two and the letter stands up off
     * the page instead, which is the single most common way this is written.
     */
    const a = (opts.light * Math.PI) / 180
    const dx = Math.cos(a)
    const dy = -Math.sin(a)

    const paper = rgb(opts.paper)
    const ink = rgb(opts.ink)
    const transfer = clamp01(opts.transfer) * pressed
    const face = `rgb(${paper
      .map((channel, i) => Math.round(channel + (ink[i]! - channel) * transfer))
      .join(',')})`

    const blur = Math.max(opts.softness, 0)

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]!

      /*
       * Makeready. Before a forme is made ready some letters bite harder than
       * others, and that unevenness is the difference between a press and a
       * filter. Fixed per letter, so the same line always presses the same way.
       */
      const bite = 1 - hash2(i + 1, opts.seed) * clamp01(opts.makeready) * 0.7
      const depth = opts.depth * pressed * bite

      const shadow =
        `${(dx * depth).toFixed(4)}em ${(dy * depth).toFixed(4)}em ${blur.toFixed(4)}em rgba(0,0,0,0.42), ` +
        `${(-dx * depth).toFixed(4)}em ${(-dy * depth).toFixed(4)}em ${blur.toFixed(4)}em rgba(255,255,255,0.72)`

      if (cell.style.textShadow !== shadow) cell.style.textShadow = shadow
      if (cell.style.color !== face) cell.style.color = face
    }
  }

  teardown(): void {
    if (this.host && this.original) this.host.textContent = this.original
    this.cells = []
    this.built = false
    this.host = null
  }
}

/**
 * Mount EmbossedText into `el`. The element must already contain the text.
 *
 * ```ts
 * const pressed = createEmbossedText(document.querySelector('h1')!)
 * pressed.start()
 * // …later
 * pressed.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left exactly as it
 * was found.
 */
export function createEmbossedText(
  el: HTMLElement,
  opts: Partial<EmbossedTextOptions> = {}
): EffectHandle {
  return mount<EmbossedTextOptions>(el, opts, {
    defaults: embossedTextDefaults,
    kind: 'dom',
    create: () => new EmbossedTextSurface()
  })
}

export default createEmbossedText
