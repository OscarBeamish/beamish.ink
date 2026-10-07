/*
 * FallingLetters: Beamish
 * https://beamish.ink/effects/falling-letters
 *
 * A line of type comes apart and falls, each letter dropping, bouncing once
 * and settling. Pied type: a forme dropped on the way to the press.
 *
 * Three things carry it, and the first is the reason this is arithmetic rather
 * than a physics engine.
 *
 * Every letter's position is a closed form in `t`, not a simulation. A solver
 * steps from the last frame to the next, which means frame 200 can only be
 * reached by computing the 199 before it: you cannot seek, you cannot record a
 * loop, and two runs drift apart as soon as one of them misses a frame. Here
 * the fall is the parabola itself, `y = v0·t + ½g·t²`, and the bounce is the
 * same parabola reflected and damped. Ask for any `t` in any order and you get
 * the same frame, which is what the recorder needs and what makes the whole
 * thing cheap.
 *
 * The letters are measured once and taken out of flow, so nothing reflows.
 * Split a line into spans and animate them in place and every letter that
 * moves changes the line box, so the letters that have not fallen yet shuffle
 * along underneath. The block keeps the height it had and the letters fall
 * from exactly where they were set.
 *
 * And one damped bounce, not none and not five. A letter that falls and stops
 * dead reads as a dropped frame rather than as a thing with weight. Five is a
 * ball. One is a piece of lead type landing on a stone, which is what this is.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type FallingLettersOptions = BaseOptions & {
  /** Milliseconds before the first letter goes. */
  hold: number
  /** Milliseconds between one letter leaving and the next. */
  stagger: number
  /** How scattered the order is. 0 drops them left to right. */
  scatter: number
  /** Fall acceleration, in line heights per second squared. */
  gravity: number
  /** How much of its speed a letter keeps on the bounce. */
  bounce: number
  /** How far a letter drifts sideways as it falls, in line heights. */
  drift: number
  /** Degrees a letter turns per second while falling. */
  spin: number
  /** How far below the baseline the floor is, in line heights. */
  floor: number
  /** Seed for the scatter and the spin directions. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const fallingLettersDefaults: FallingLettersOptions = {
  hold: 400,
  stagger: 42,
  scatter: 0.55,
  gravity: 26,
  bounce: 0.28,
  drift: 0.35,
  spin: 150,
  floor: 3.2,
  seed: 7,
  reducedMotionTime: 0
}

function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

type Letter = { el: HTMLElement; go: number; side: number; turn: number }

class FallingLettersSurface implements Surface<FallingLettersOptions> {
  private host: HTMLElement | null = null
  private letters: Letter[] = []
  private built = false
  private applied = ''
  private text = ''

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.text = ctx.host.textContent ?? ''
  }

  /*
   * Split once, measure once, then take every letter out of flow.
   *
   * The measuring has to happen while they are still in flow, and the taking
   * out has to happen after all of them are measured: do it letter by letter
   * and each one you remove reflows the rest, so every measurement after the
   * first is of a line that no longer exists.
   */
  private build(opts: FallingLettersOptions): void {
    const host = this.host
    if (!host || this.built) return

    const text = this.text
    if (!text.trim()) return

    /*
     * The original text stays readable. The spans are hidden from the
     * accessibility tree, because a word split into letters is read out letter
     * by letter.
     */
    host.setAttribute('aria-label', text.trim())
    host.textContent = ''

    const spans: HTMLElement[] = []
    for (const ch of text) {
      const span = document.createElement('span')
      // A space has no box to measure or to move, but it still sets the rhythm.
      span.textContent = ch === ' ' ? ' ' : ch
      span.style.display = 'inline-block'
      span.setAttribute('aria-hidden', 'true')
      host.append(span)
      spans.push(span)
    }

    const box = host.getBoundingClientRect()
    // Every measurement first, while the line is still intact.
    const places = spans.map(span => {
      const r = span.getBoundingClientRect()
      return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height }
    })

    // The block keeps the height it had, so nothing below it moves.
    host.style.position = 'relative'
    host.style.height = `${box.height}px`

    this.letters = spans.map((span, i) => {
      const at = places[i]!
      span.style.position = 'absolute'
      span.style.left = `${at.x.toFixed(2)}px`
      span.style.top = `${at.y.toFixed(2)}px`
      span.style.width = `${at.w.toFixed(2)}px`
      span.style.willChange = 'transform'

      /*
       * When this one goes. Its place in the line, pulled towards a hashed
       * order by `scatter`, so the line can come apart left to right or all at
       * once without either being a special case.
       */
      const order = i + (hash2(i + 1, opts.seed) - 0.5) * 2 * opts.scatter * spans.length
      return {
        el: span,
        go: Math.max(order, 0),
        side: (hash2(i + 31, opts.seed) - 0.5) * 2,
        turn: (hash2(i + 97, opts.seed) - 0.5) * 2
      }
    })
    this.built = true
  }

  resize(): void {
    /*
     * Nothing. The letters were measured against a line that no longer exists,
     * so a resize cannot re-measure them without rebuilding the whole thing,
     * and rebuilding mid-fall would snap every letter back to its start. A
     * block that is mid-gesture when the window changes keeps its old
     * positions, which is the lesser of the two wrongs.
     */
  }

  render(t: number, opts: FallingLettersOptions): void {
    this.build(opts)
    const count = this.letters.length
    if (count === 0) return

    const hold = Math.max(opts.hold, 0) / 1000
    const stagger = Math.max(opts.stagger, 0) / 1000

    const state = `${t.toFixed(3)}`
    if (state === this.applied) return
    this.applied = state

    for (const letter of this.letters) {
      const age = t - hold - letter.go * stagger
      if (age <= 0) {
        // Not yet. No transform at all, so a line at rest writes nothing.
        if (letter.el.style.transform !== '') letter.el.style.transform = ''
        continue
      }

      /*
       * The fall, in closed form. Units are line heights, so the same numbers
       * behave at any type size.
       */
      const g = opts.gravity
      const floor = opts.floor

      // When the parabola first reaches the floor: ½g·t² = floor.
      const hit = Math.sqrt((2 * floor) / g)
      let y: number
      if (age < hit) {
        y = 0.5 * g * age * age
      } else {
        /*
         * One bounce, as the same parabola reflected. Speed at impact is g·hit,
         * and it leaves with that times the restitution, so the hop lasts
         * 2·v/g and its height is v²/2g. After it, the letter is at rest on the
         * floor: that is the whole of the physics and none of it is stepped.
         */
        const v = g * hit * opts.bounce
        const since = age - hit
        const hop = (2 * v) / g
        y = since < hop ? floor - (v * since - 0.5 * g * since * since) : floor
      }

      const settled = y >= floor - 0.0001
      const x = letter.side * opts.drift * Math.min(age, hit + 1)
      const turn = settled
        ? letter.turn * opts.spin * (hit * 1.2)
        : letter.turn * opts.spin * age

      letter.el.style.transform =
        `translate3d(${(x * 100).toFixed(2)}%, ${(y * 100).toFixed(2)}%, 0) ` +
        `rotate(${turn.toFixed(1)}deg)`
    }
  }

  teardown(): void {
    const host = this.host
    if (host) {
      host.style.position = ''
      host.style.height = ''
      host.removeAttribute('aria-label')
      // The text goes back exactly as it was found.
      host.textContent = this.text
    }
    this.letters = []
    this.built = false
    this.applied = ''
    this.host = null
  }
}

/**
 * Mount FallingLetters onto `el`. Its text is split into letters, which are
 * measured where they sit and then dropped.
 *
 * ```ts
 * const pied = createFallingLetters(document.querySelector('#masthead')!)
 * pied.start()
 * // …later
 * pied.destroy()
 * ```
 *
 * `destroy()` puts the original text back. The block keeps its height while the
 * letters fall, so nothing below it moves.
 */
export function createFallingLetters(
  el: HTMLElement,
  opts: Partial<FallingLettersOptions> = {}
): EffectHandle {
  return mount<FallingLettersOptions>(el, opts, {
    defaults: fallingLettersDefaults,
    kind: 'dom',
    create: () => new FallingLettersSurface()
  })
}

export default createFallingLetters
