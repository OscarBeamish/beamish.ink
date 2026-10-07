/*
 * TypewriterText: Beamish
 * https://beamish.ink/effects/typewriter-text
 *
 * Text typed one character at a time, on a machine with type bars rather than a
 * cursor that reveals a string.
 *
 * The usual implementation animates the width of a box, or appends to a string
 * on a timer, and both have the same two problems. The rhythm is perfectly even,
 * which no typist has ever managed, and every letter lands in exactly the right
 * place, which no typewriter has ever managed either. What you get is a progress
 * bar made of letters.
 *
 * So four things here, and all four are cheap:
 *
 *   The rhythm is uneven. Each character gets its own interval from a hash, so
 *   the hand has a texture to it, and the intervals are a fixed schedule rather
 *   than a running timer.
 *
 *   It slows at punctuation. A typist pauses after a full stop and a comma, and
 *   that pause is most of what makes typing sound like language rather than like
 *   a machine gun.
 *
 *   Each letter is struck rather than placed. A type bar lands a fraction off
 *   the baseline and a fraction off square, and the ribbon gives it more or less
 *   ink depending on how hard it was hit. All three come off the same hash, so
 *   they are fixed for a given letter in a given string.
 *
 *   The caret is solid while typing and blinks when it stops, which is what a
 *   caret does, and the blink is on its own clock rather than on the typing one.
 *
 * Nothing reflows. The whole string is in the element from the start and the
 * untyped part is hidden rather than absent, so a paragraph typing itself in the
 * middle of a page does not push the page about. The letters are invisible, so
 * it looks the same either way, and the layout is the layout it will end at.
 *
 * It is pure in `t`. How many characters have landed is a lookup against a
 * schedule, and every per-letter offset is a hash of its index.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type TypewriterTextOptions = BaseOptions & {
  /** Average milliseconds between one character and the next. */
  pace: number
  /** How uneven the rhythm is, 0 to 1. 0 is a machine. */
  rhythm: number
  /** Extra milliseconds after a full stop. Commas get a third of it. */
  pause: number
  /** Milliseconds before the first character. */
  hold: number
  /** How far a letter lands off the baseline, in ems. */
  jitter: number
  /** How far off square a letter lands, in degrees. */
  skew: number
  /** How much the ribbon varies, 0 to 1. The ink each strike leaves. */
  ribbon: number
  /** Width of the caret in ems. 0 for no caret. */
  caret: number
  /** Milliseconds for one blink of the caret once typing has stopped. */
  blink: number
  /** Seed for the rhythm and the strikes. The same seed gives the same hand. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const typewriterTextDefaults: TypewriterTextOptions = {
  pace: 62,
  rhythm: 0.6,
  pause: 420,
  hold: 300,
  jitter: 0.035,
  skew: 1.1,
  ribbon: 0.35,
  caret: 0.09,
  blink: 1060,
  seed: 7,
  reducedMotionTime: 999
}

/*
 * A hash rather than a generator, for the same reason as everywhere else here:
 * it has to answer what letter 12 looks like without having drawn letters 0 to
 * 11 first.
 */
function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

/* Where a typist takes a breath. */
function restAfter(character: string): number {
  if (character === '.' || character === '!' || character === '?') return 1
  if (character === ',' || character === ';' || character === ':') return 0.34
  if (character === ' ') return 0.12
  return 0
}

class TypewriterTextSurface implements Surface<TypewriterTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private cells: HTMLElement[] = []
  private letters: string[] = []
  /** Seconds at which each character lands. Built once, from the text. */
  private schedule: number[] = []
  private scheduleFor = ''
  private caret: HTMLElement | null = null
  private built = false
  private struck = -1

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

    // The text a screen reader gets: one string, unchanged, out of sight. The
    // alternative is a label that grows by a character at a time, which is a
    // live region nobody asked for.
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
        // Hidden rather than absent, so the line boxes are final from the first
        // frame and nothing below moves as the text arrives.
        cell.style.visibility = 'hidden'
        wrapper.append(cell)
        this.cells.push(cell)
        this.letters.push(character)
      }
      visual.append(wrapper)
      if (index < words.length - 1) {
        const space = document.createElement('span')
        space.textContent = ' '
        space.style.visibility = 'hidden'
        visual.append(space)
        this.cells.push(space)
        this.letters.push(' ')
      }
    })

    /*
     * One caret, moved to the cell the next character will land in. One element
     * and one offset read a frame, rather than a caret element per character.
     */
    const caret = document.createElement('span')
    caret.setAttribute('aria-hidden', 'true')
    caret.style.cssText =
      'position:absolute;top:0;left:0;background:currentColor;pointer-events:none;will-change:transform,opacity'
    this.caret = caret

    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.append(label, visual, caret)
    this.built = true
  }

  /*
   * The schedule: the second each character lands. Built from the text rather
   * than from the clock, so it is the same schedule every run and seeking to
   * the middle of it costs one scan.
   */
  private plan(opts: TypewriterTextOptions): void {
    const key = `${this.original}|${opts.pace}|${opts.rhythm}|${opts.pause}|${opts.hold}|${opts.seed}`
    if (this.scheduleFor === key) return
    this.scheduleFor = key

    const pace = Math.max(opts.pace, 1) / 1000
    const rhythm = Math.max(0, Math.min(1, opts.rhythm))
    const pause = Math.max(opts.pause, 0) / 1000

    this.schedule = []
    let at = Math.max(opts.hold, 0) / 1000
    for (let i = 0; i < this.letters.length; i++) {
      // Spread around the mean rather than added to it, so raising the unevenness
      // does not also slow the whole thing down.
      const spread = 1 + (hash2(i + 1, opts.seed) - 0.5) * 2 * rhythm * 0.85
      at += pace * spread
      this.schedule.push(at)
      at += pause * restAfter(this.letters[i]!)
    }
  }

  resize(): void {}

  render(t: number, opts: TypewriterTextOptions): void {
    this.build()
    if (this.cells.length === 0) return
    this.plan(opts)

    /*
     * How many have landed. The schedule rises, so this is a scan rather than a
     * search, and the string is short enough that a binary search would be
     * ceremony.
     */
    let struck = 0
    while (struck < this.schedule.length && this.schedule[struck]! <= t) struck++

    if (struck !== this.struck) {
      /*
       * Only the letters that changed state are touched. Typing a paragraph
       * writes one style per frame rather than one per character per frame,
       * which on three hundred characters is the difference between a frame and
       * several.
       */
      const from = Math.min(Math.max(this.struck, 0), struck)
      const to = Math.max(this.struck, struck)
      for (let i = from; i < to && i < this.cells.length; i++) {
        const cell = this.cells[i]!
        if (i < struck) {
          cell.style.visibility = 'visible'
          /*
           * The strike. A type bar lands a little off the baseline and a little
           * off square, and the ribbon leaves more or less ink depending on how
           * it was hit. Three numbers off one hash, fixed for this letter in
           * this string, which is why the same text always types the same way.
           */
          const n = hash2(i + 101, opts.seed)
          const m = hash2(i + 211, opts.seed)
          const drop = (n - 0.5) * 2 * opts.jitter
          const turn = (m - 0.5) * 2 * opts.skew
          cell.style.transform = `translateY(${drop.toFixed(4)}em) rotate(${turn.toFixed(2)}deg)`
          cell.style.opacity = (1 - hash2(i + 307, opts.seed) * opts.ribbon * 0.5).toFixed(3)
        } else {
          cell.style.visibility = 'hidden'
          cell.style.transform = ''
          cell.style.opacity = ''
        }
      }
      this.struck = struck
    }

    const caret = this.caret
    if (!caret) return
    if (opts.caret <= 0) {
      caret.style.opacity = '0'
      return
    }

    /*
     * The caret sits in the cell the next character will land in, which is the
     * cell after the last one struck, or the last cell once there is no next.
     */
    const target = this.cells[Math.min(struck, this.cells.length - 1)]!
    const atEnd = struck >= this.cells.length
    const left = target.offsetLeft + (atEnd ? target.offsetWidth : 0)
    caret.style.transform = `translate(${left}px, ${target.offsetTop}px)`
    caret.style.width = `${opts.caret.toFixed(3)}em`
    caret.style.height = `${target.offsetHeight}px`

    /*
     * Solid while typing, blinking once it stops. That is what a caret does,
     * and the blink runs on its own clock rather than on the typing one, so it
     * does not stutter when the rhythm does.
     */
    const done = this.schedule.length > 0 && t > this.schedule[this.schedule.length - 1]!
    const blink = Math.max(opts.blink, 1) / 1000
    const phase = ((t / blink) % 1 + 1) % 1
    caret.style.opacity = done ? (phase < 0.5 ? '1' : '0') : '1'
  }

  teardown(): void {
    if (this.host && this.original) {
      this.host.textContent = this.original
      this.host.style.position = ''
    }
    this.cells = []
    this.letters = []
    this.schedule = []
    this.scheduleFor = ''
    this.caret = null
    this.built = false
    this.struck = -1
    this.host = null
  }
}

/**
 * Mount TypewriterText into `el`. The element must already contain the text.
 *
 * ```ts
 * const typed = createTypewriterText(document.querySelector('#intro')!)
 * typed.start()
 * // …later
 * typed.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left exactly as it
 * was found.
 */
export function createTypewriterText(
  el: HTMLElement,
  opts: Partial<TypewriterTextOptions> = {}
): EffectHandle {
  return mount<TypewriterTextOptions>(el, opts, {
    defaults: typewriterTextDefaults,
    kind: 'dom',
    create: () => new TypewriterTextSurface()
  })
}

export default createTypewriterText
