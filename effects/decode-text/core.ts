/*
 * DecodeText: Beamish
 * https://beamish.ink/effects/decode-text
 *
 * Text that resolves out of a run of cipher glyphs, one character at a time.
 * The thing on the hover of every studio nav bar, and on the headline of about
 * half the sites that win awards for being hard to read.
 *
 * No canvas and no dependencies. It takes an element that already contains
 * text, splits it, and swaps the characters that have not landed yet. The
 * original string stays in the accessibility tree as one label, because a
 * screen reader handed a live stream of junk reads out a live stream of junk.
 *
 * Three decisions separate this from the version everybody writes in an
 * afternoon:
 *
 *   It is pure in `t`. The obvious implementation calls Math.random() on a
 *   timer and mutates as it goes, which cannot be seeked, cannot be recorded,
 *   and shows something different every time anybody looks at it. Here the
 *   glyph at each position is a hash of the position, the seed and the frame
 *   number, so the same `t` always gives the same frame.
 *
 *   The glyphs change on their own clock rather than per frame. At 120Hz a
 *   per-frame swap is a grey blur with no characters in it; at 30 it reads as
 *   text being typed by something in a hurry. Pinning the cadence means the
 *   effect looks the same on a 60Hz laptop, a 144Hz monitor and in a recording.
 *
 *   Nothing moves. Each character is measured once and held in a box the width
 *   of the letter it will become, so a paragraph decoding in the middle of a
 *   page does not push the rest of the page about while it does it. This is the
 *   detail that decides whether the effect can be used on anything other than a
 *   line of monospace sitting on its own.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type DecodeTextOrder = 'forward' | 'reverse' | 'centre' | 'random'

export type DecodeTextOptions = BaseOptions & {
  /** The characters it cycles through before each letter lands. */
  glyphs: string
  /** The order the characters land in. */
  order: DecodeTextOrder
  /** Milliseconds between one character landing and the next. */
  stagger: number
  /** Milliseconds of cipher before the first character lands. */
  hold: number
  /** Glyph changes per second. This is a cadence, not a frame rate. */
  rate: number
  /** How much paler an unlanded glyph is than the settled text, 0 to 1. */
  dim: number
  /** Hold each character in a box the width of the letter it will become. */
  steady: boolean
  /** Seed for the glyphs and the random order. The same seed gives the same run. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const decodeTextDefaults: DecodeTextOptions = {
  glyphs: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+-=?/<>[]{}',
  order: 'forward',
  stagger: 45,
  hold: 160,
  rate: 18,
  dim: 0.45,
  steady: true,
  seed: 7,
  reducedMotionTime: 999
}

/*
 * A hash rather than a generator. A generator has to be run in order and from
 * the start, which is the whole problem: this has to answer what is at position
 * 12 on frame 40 without having drawn frames 0 to 39.
 */
function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | (c | 0))
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

function orderFor(mode: DecodeTextOrder, count: number, seed: number): number[] {
  const indices = Array.from({ length: count }, (_, i) => i)
  if (mode === 'reverse') return indices.map(i => count - 1 - i)
  if (mode === 'centre') {
    const middle = (count - 1) / 2
    return indices.map(i => Math.round(Math.abs(i - middle)))
  }
  if (mode === 'random') {
    // A shuffled rank per character, not a shuffled list: each letter keeps its
    // place in the word and only its turn changes.
    const ranks = indices.slice()
    for (let i = ranks.length - 1; i > 0; i--) {
      const j = Math.floor(hash3(i, 0, seed) * (i + 1))
      const swap = ranks[i]!
      ranks[i] = ranks[j]!
      ranks[j] = swap
    }
    return ranks
  }
  return indices
}

/*
 * Whitespace and punctuation are left alone. They carry the shape of the
 * sentence, and a line with its spaces scrambled is not text being decoded, it
 * is a block of noise. Leaving the spaces also keeps the word wrapping intact.
 */
const SCRAMBLES = /[a-z0-9]/i

/*
 * A substitute takes the case of the letter it is standing in for. The glyph
 * set is written in capitals because that is how everybody writes one, and a
 * capital standing in a lowercase box is both too wide for it and too tall for
 * the line: set a word in a display face and the run comes out as a row of
 * letters colliding with each other over an x-height that keeps changing.
 * Matching the case fixes the width and the height at the same time.
 */
function matchCase(glyph: string, letter: string): string {
  if (letter >= 'a' && letter <= 'z') return glyph.toLowerCase()
  if (letter >= 'A' && letter <= 'Z') return glyph.toUpperCase()
  return glyph
}

class DecodeTextSurface implements Surface<DecodeTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private cells: HTMLElement[] = []
  private letters: string[] = []
  private ranks: number[] = []
  private pools: string[][] = []
  private probe: HTMLElement | null = null
  private built = false
  private measured = false
  private measuredFor = ''
  private fontsPending = false

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  private build(): void {
    const host = this.host
    if (!host || this.built) return

    host.textContent = ''
    this.cells = []
    this.letters = []

    // The text a screen reader gets: one string, unchanged, out of sight.
    const label = document.createElement('span')
    label.textContent = this.original
    label.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'

    const visual = document.createElement('span')
    visual.setAttribute('aria-hidden', 'true')

    const words = this.original.split(' ')
    words.forEach((word, index) => {
      // Words stay whole so the text still wraps. The characters are swapped
      // inside them, which is the only way to take type apart without taking
      // line breaking apart with it.
      const wrapper = document.createElement('span')
      wrapper.style.display = 'inline-block'
      wrapper.style.whiteSpace = 'nowrap'
      for (const character of Array.from(word)) {
        const cell = document.createElement('span')
        cell.textContent = character
        cell.style.display = 'inline-block'
        wrapper.append(cell)
        this.cells.push(cell)
        this.letters.push(character)
      }
      visual.append(wrapper)
      if (index < words.length - 1) visual.append(document.createTextNode(' '))
    })

    /*
     * Somewhere to measure glyphs that is inside the element, so it inherits
     * the face, the size and the tracking the text is actually set in. Hidden
     * rather than detached, because a detached node has no font at all.
     */
    const probe = document.createElement('span')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText =
      'position:absolute;visibility:hidden;white-space:pre;pointer-events:none;top:0;left:0'
    visual.append(probe)
    this.probe = probe

    host.append(label, visual)
    this.built = true

    /*
     * Widths measured in the fallback face are the wrong widths, and the boxes
     * would be pinned to them for the life of the page. Measure again once the
     * real face has arrived.
     */
    if (!this.fontsPending && typeof document !== 'undefined' && document.fonts) {
      this.fontsPending = true
      document.fonts.ready.then(() => {
        this.measured = false
      })
    }
  }

  /*
   * Each box is pinned to the width of the letter it will become, and the
   * substitute is centred in it. The alternative, pinning the width of the
   * whole element, stops the page moving but still lets the letters inside it
   * jostle, which is the part that actually catches the eye.
   */
  private measure(steady: boolean, glyphs: string): void {
    const probe = this.probe
    if (this.measured && this.measuredFor === glyphs) return
    this.measuredFor = glyphs

    if (!steady || !probe) {
      for (const cell of this.cells) {
        cell.style.width = ''
        cell.style.textAlign = ''
      }
      this.pools = []
      this.measured = true
      return
    }

    // Every character that could be shown, measured once each in this face.
    const widths = new Map<string, number>()
    const width = (character: string): number => {
      const known = widths.get(character)
      if (known !== undefined) return known
      probe.textContent = character
      const measured = probe.getBoundingClientRect().width
      widths.set(character, measured)
      return measured
    }

    const set = Array.from(glyphs)
    this.pools = []

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]!
      const letter = this.letters[i]!
      if (!SCRAMBLES.test(letter)) {
        cell.style.width = ''
        cell.style.textAlign = ''
        this.pools.push([])
        continue
      }

      const target = width(letter)
      cell.style.width = `${target.toFixed(2)}px`
      cell.style.textAlign = 'center'

      /*
       * The substitutes for this character, nearest in width first. Pinning
       * the box stops the line moving, but on its own it only moves the
       * problem: a w standing in the box of an i overflows it on both sides
       * and collides with its neighbours, which at headline size is the most
       * visible thing on the page. Choosing from the glyphs that fit the box
       * is the fix, and it has the side effect of keeping the colour of the
       * line even, because the run never swaps a thin letter for a thick one.
       */
      const nearest = set
        .map((glyph, index) => {
          const fitted = matchCase(glyph, letter)
          return { glyph: fitted, index, gap: Math.abs(width(fitted) - target) }
        })
        .sort((a, b) => a.gap - b.gap || a.index - b.index)

      /*
       * Everything that fits, rather than a fixed number of the nearest. The
       * count is the tempting way to write it and it is wrong in the case that
       * matters most: in a monospace face every gap is zero, the sort is a tie
       * the whole way down, and a fixed count hands back whichever glyphs
       * happen to come first in the string. The run then cycles through A to J
       * for ever, which does not read as cipher, it reads as a spelling
       * mistake.
       */
      const tolerance = Math.max(target * 0.14, 0.5)
      const fits = nearest.filter(entry => entry.gap <= tolerance)
      const pool = fits.length >= 5 ? fits : nearest.slice(0, 5)
      this.pools.push(pool.map(entry => entry.glyph))
    }

    this.measured = true
  }

  resize(): void {
    // The face can change with the viewport, so the boxes are measured again.
    this.measured = false
  }

  render(t: number, opts: DecodeTextOptions): void {
    this.build()
    if (this.cells.length === 0) return
    const glyphs = opts.glyphs.length > 0 ? opts.glyphs : decodeTextDefaults.glyphs
    this.measure(opts.steady, glyphs)

    if (this.ranks.length !== this.cells.length) {
      this.ranks = orderFor(opts.order, this.cells.length, opts.seed)
    }

    const stagger = opts.stagger / 1000
    const hold = opts.hold / 1000
    /*
     * The cadence, floored to a whole number of swaps. Everything still running
     * changes on the same tick, which is what makes the line read as one
     * mechanism rather than as a row of independent ones.
     */
    const frame = Math.floor(t * Math.max(opts.rate, 0.001))
    const dim = String(1 - Math.max(0, Math.min(1, opts.dim)))
    const set = Array.from(glyphs)

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]!
      const letter = this.letters[i]!
      const landed = t >= hold + this.ranks[i]! * stagger || !SCRAMBLES.test(letter)
      // The pool is the measured set when the boxes are pinned, and the whole
      // glyph set when they are not, where nothing is being fitted to anything.
      const pool = this.pools[i]
      const pick = (source: string[] | string) =>
        source[Math.floor(hash3(i + 1, frame, opts.seed) * source.length)] ?? letter
      const next = landed
        ? letter
        : pool && pool.length > 0
          ? pick(pool)
          : matchCase(pick(set), letter)

      /*
       * Written only on a change. Setting textContent every frame on a long
       * paragraph is a layout invalidation per character per frame, for a
       * string that is usually the same string it was last frame.
       */
      if (cell.textContent !== next) cell.textContent = next
      const opacity = landed ? '' : dim
      if (cell.style.opacity !== opacity) cell.style.opacity = opacity
    }
  }

  teardown(): void {
    if (this.host && this.original) this.host.textContent = this.original
    this.cells = []
    this.letters = []
    this.ranks = []
    this.pools = []
    this.probe = null
    this.built = false
    this.measured = false
    this.measuredFor = ''
    this.host = null
  }
}

/**
 * Mount DecodeText into `el`. The element must already contain the text.
 *
 * ```ts
 * const decode = createDecodeText(document.querySelector('h1')!)
 * decode.start()
 * // …later
 * decode.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left exactly as it
 * was found.
 */
export function createDecodeText(el: HTMLElement, opts: Partial<DecodeTextOptions> = {}): EffectHandle {
  return mount<DecodeTextOptions>(el, opts, {
    defaults: decodeTextDefaults,
    kind: 'dom',
    create: () => new DecodeTextSurface()
  })
}

export default createDecodeText
