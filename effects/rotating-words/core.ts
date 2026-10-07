/*
 * RotatingWords: Beamish
 * https://beamish.ink/effects/rotating-words
 *
 * One word in a sentence swaps for another on a loop. "Printed by letterpress,
 * by lithography, by screen print."
 *
 * Three things carry it, and the first is why most versions of this are
 * unpleasant to look at without anyone being able to say why.
 *
 * The box is sized to the longest word before anything moves. A list of words
 * of different lengths, swapped in place, changes the width of its own line on
 * every swap, so the words after it slide back and forth for as long as the
 * page is open. It is the single most common fault in this effect and it is
 * entirely avoidable: measure every word once, take the widest, and hold that.
 * The sentence then stays still and only the word moves, which is the whole
 * idea.
 *
 * The words are the author's markup and are never replaced. Passing a list of
 * strings and building spans means the text is invisible to anything that
 * reads the page before the script runs, and it puts copy inside a
 * configuration object where nobody will think to translate it.
 *
 * And it is pure in `t`. Which word is showing, and how far through its
 * handover, are arithmetic on the clock, so the recorder can seek anywhere and
 * a live page and a take agree.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type RotatingWordsOptions = BaseOptions & {
  /** Milliseconds each word is held, including its handover. */
  interval: number
  /** Milliseconds the handover itself takes. */
  swap: number
  /** How far a word travels as it leaves, as a share of the line height. */
  rise: number
  /** Degrees the leaving word tips as it goes. */
  tilt: number
  /** Blur on a word in motion, in pixels. Zero is crisper and cheaper. */
  blur: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const rotatingWordsDefaults: RotatingWordsOptions = {
  interval: 2200,
  swap: 520,
  rise: 0.9,
  tilt: 0,
  blur: 0,
  reducedMotionTime: 0
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/* Out, so the arriving word lands rather than drifts into place. */
const easeOutQuart = (k: number) => 1 - Math.pow(1 - k, 4)

class RotatingWordsSurface implements Surface<RotatingWordsOptions> {
  private host: HTMLElement | null = null
  private words: HTMLElement[] = []
  private built = false
  private applied = ''

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host
    /*
     * Inline-grid rather than inline-block: every word is stacked in the one
     * cell, so the box takes the size of the largest without any of them being
     * taken out of flow. Absolute positioning would work and would also mean
     * the box had no height of its own.
     */
    host.style.display = 'inline-grid'
    host.style.verticalAlign = 'bottom'
    /*
     * The words change under a reader who did not ask for it, so they are not
     * announced. The sentence still reads correctly: the first word is left in
     * the accessibility tree and the rest are hidden from it.
     */
    host.setAttribute('aria-live', 'off')
  }

  private build(): void {
    const host = this.host
    if (!host || this.built) return
    this.words = [...host.children].filter(
      (node): node is HTMLElement => node instanceof HTMLElement
    )
    for (let i = 0; i < this.words.length; i++) {
      const word = this.words[i]!
      // All in one cell, so the box is as wide as the widest of them.
      word.style.gridArea = '1 / 1'
      word.style.willChange = 'transform, opacity'
      word.style.whiteSpace = 'nowrap'
      /*
       * Only the first is readable. A screen reader meeting eight alternatives
       * in a row reads the sentence eight times.
       */
      if (i > 0) word.setAttribute('aria-hidden', 'true')
    }
    this.built = true
  }

  /*
   * Nothing to measure.
   *
   * The box is sized by the grid itself: every word is in the same cell, so the
   * cell is as wide as the longest and as tall as the tallest, and it stays
   * that size whichever word is showing. No measurement, nothing to recompute
   * on resize, and nothing that can be wrong before a font has loaded.
   */
  resize(): void {}

  render(t: number, opts: RotatingWordsOptions): void {
    this.build()
    const host = this.host
    const count = this.words.length
    if (!host || count === 0) return

    const interval = Math.max(opts.interval, 1) / 1000
    const swap = Math.min(Math.max(opts.swap, 1) / 1000, interval)

    /*
     * Which word, and how far through the handover. Both from the clock, so
     * seeking to the middle of a swap lands on the same frame every time.
     */
    const turns = Math.floor(t / interval)
    const within = t - turns * interval
    const moving = easeOutQuart(clamp01(within / swap))

    const showing = ((turns % count) + count) % count
    const leaving = ((showing - 1) % count + count) % count

    const state = `${showing}|${moving.toFixed(4)}`
    if (state === this.applied) return
    this.applied = state

    for (let i = 0; i < count; i++) {
      const word = this.words[i]!

      /*
       * Three states, and only two of them move. Everything that is neither
       * arriving nor leaving is parked out of sight with no transform to
       * compute, which is what keeps a list of twelve words as cheap as a list
       * of two.
       */
      let shift = 0
      let fade = 0
      if (i === showing) {
        shift = (1 - moving) * opts.rise
        fade = moving
      } else if (i === leaving && moving < 1) {
        shift = -moving * opts.rise
        fade = 1 - moving
      } else {
        word.style.opacity = '0'
        word.style.transform = ''
        word.style.filter = ''
        continue
      }

      const turn = opts.tilt === 0 ? '' : ` rotate(${(shift * opts.tilt).toFixed(2)}deg)`
      word.style.transform = `translate3d(0, ${(shift * 100).toFixed(2)}%, 0)${turn}`
      word.style.opacity = fade.toFixed(3)
      // A blur of 0 still costs a filter, so it is left off entirely.
      word.style.filter =
        opts.blur > 0 ? `blur(${((1 - fade) * opts.blur).toFixed(2)}px)` : ''
    }
  }

  teardown(): void {
    for (const word of this.words) {
      word.style.gridArea = ''
      word.style.willChange = ''
      word.style.whiteSpace = ''
      word.style.transform = ''
      word.style.opacity = ''
      word.style.filter = ''
      word.removeAttribute('aria-hidden')
    }
    if (this.host) {
      this.host.style.display = ''
      this.host.style.verticalAlign = ''
      this.host.removeAttribute('aria-live')
    }
    this.words = []
    this.built = false
    this.applied = ''
    this.host = null
  }
}

/**
 * Mount RotatingWords onto `el`. Its element children are the words, and they
 * are never replaced.
 *
 * ```html
 * Printed by
 * <span id="how"><span>letterpress</span><span>lithography</span></span>
 * ```
 *
 * ```ts
 * const words = createRotatingWords(document.querySelector('#how')!)
 * words.start()
 * // …later
 * words.destroy()
 * ```
 *
 * The box takes the width of the longest word and holds it, so the sentence
 * around it never moves.
 */
export function createRotatingWords(
  el: HTMLElement,
  opts: Partial<RotatingWordsOptions> = {}
): EffectHandle {
  return mount<RotatingWordsOptions>(el, opts, {
    defaults: rotatingWordsDefaults,
    kind: 'dom',
    create: () => new RotatingWordsSurface()
  })
}

export default createRotatingWords
