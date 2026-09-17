/*
 * Sort: Beamish
 * https://beamish.ink/effects/scramble-text
 *
 * Per-character reveal. A sort is one piece of metal type, and this sets them one
 * at a time.
 *
 * No canvas and no dependencies. It takes an element that already contains text,
 * splits it, and animates the pieces. The original text stays in the accessibility
 * tree as a single string, because a screen reader handed sixty one-character
 * spans reads out sixty characters.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type SortSplit = 'char' | 'word' | 'line'
export type SortOrder = 'forward' | 'reverse' | 'centre' | 'random'

export type ScrambleTextOptions = BaseOptions & {
  /** What each animated piece is. */
  split: SortSplit
  /** The order pieces arrive in. */
  order: SortOrder
  /** Milliseconds between one piece and the next. */
  stagger: number
  /** Milliseconds each piece takes on its own. */
  duration: number
  /** How far each piece travels, in pixels. Negative falls from above. */
  rise: number
  /** Blur each piece starts at, in pixels. Zero is cheaper and often better. */
  blur: number
  /** Scale each piece starts at. 1 is no scaling. */
  scale: number
  /** Seed for the random order. The same seed always gives the same order. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const scrambleTextDefaults: ScrambleTextOptions = {
  split: 'char',
  order: 'forward',
  stagger: 26,
  duration: 720,
  rise: 22,
  blur: 5,
  scale: 1,
  seed: 7,
  reducedMotionTime: 999
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** The one easing this library uses for arrivals. Matches --ease-out-expo. */
const easeOutExpo = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k))

/** Mulberry32. Small, fast, and identical across browsers for a given seed. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function orderFor(mode: SortOrder, count: number, seed: number): number[] {
  const indices = Array.from({ length: count }, (_, i) => i)
  if (mode === 'forward') return indices
  if (mode === 'reverse') return indices.map(i => count - 1 - i)
  if (mode === 'centre') {
    const middle = (count - 1) / 2
    return indices.map(i => Math.round(Math.abs(i - middle)))
  }
  // Random: a shuffled rank per piece, not a shuffled list, so each piece keeps
  // its place in the sentence and only its turn changes.
  const random = seeded(seed)
  const ranks = indices.slice()
  for (let i = ranks.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[ranks[i], ranks[j]] = [ranks[j]!, ranks[i]!]
  }
  return ranks
}

class ScrambleTextSurface implements Surface<ScrambleTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private pieces: HTMLElement[] = []
  private ranks: number[] = []
  private builtFor: SortSplit | null = null

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  /*
   * Splitting is destructive, so it happens once per split mode rather than once
   * per frame, and the original string is kept for teardown.
   */
  private build(split: SortSplit): void {
    const host = this.host
    if (!host || this.builtFor === split) return

    host.textContent = ''
    this.pieces = []

    // The text a screen reader gets: one string, unchanged, out of sight.
    const label = document.createElement('span')
    label.textContent = this.original
    label.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'

    const visual = document.createElement('span')
    visual.setAttribute('aria-hidden', 'true')

    const makePiece = (text: string) => {
      const piece = document.createElement('span')
      piece.textContent = text
      piece.style.display = 'inline-block'
      piece.style.willChange = 'transform, opacity'
      this.pieces.push(piece)
      return piece
    }

    if (split === 'line') {
      visual.append(makePiece(this.original))
    } else {
      const words = this.original.split(' ')
      words.forEach((word, index) => {
        // Words stay whole so the text still wraps. Characters are animated
        // inside them, which is the only way to split type without breaking
        // line breaking.
        const wrapper = document.createElement('span')
        wrapper.style.display = 'inline-block'
        wrapper.style.whiteSpace = 'nowrap'
        if (split === 'word') {
          wrapper.append(makePiece(word))
        } else {
          for (const character of Array.from(word)) wrapper.append(makePiece(character))
        }
        visual.append(wrapper)
        if (index < words.length - 1) visual.append(document.createTextNode(' '))
      })
    }

    host.append(label, visual)
    this.builtFor = split
  }

  resize(): void {}

  render(t: number, opts: ScrambleTextOptions): void {
    this.build(opts.split)
    if (this.pieces.length === 0) return

    if (this.ranks.length !== this.pieces.length) {
      this.ranks = orderFor(opts.order, this.pieces.length, opts.seed)
    }

    const stagger = opts.stagger / 1000
    const duration = Math.max(opts.duration, 1) / 1000

    for (let i = 0; i < this.pieces.length; i++) {
      const piece = this.pieces[i]!
      const progress = easeOutExpo(clamp01((t - this.ranks[i]! * stagger) / duration))
      const remaining = 1 - progress

      piece.style.opacity = String(progress)
      const shift = remaining * opts.rise
      const scale = 1 - remaining * (1 - opts.scale)
      piece.style.transform =
        scale === 1 ? `translateY(${shift}px)` : `translateY(${shift}px) scale(${scale})`
      // Dropping the filter entirely once a piece has landed matters: a
      // permanent blur(0px) still forces every one of them onto its own layer.
      piece.style.filter = opts.blur > 0 && remaining > 0.01 ? `blur(${remaining * opts.blur}px)` : ''
    }
  }

  teardown(): void {
    if (this.host && this.original) this.host.textContent = this.original
    this.pieces = []
    this.ranks = []
    this.builtFor = null
    this.host = null
  }
}

/**
 * Mount Sort into `el`. The element must already contain the text.
 *
 * ```ts
 * const sort = createScrambleText(document.querySelector('h1')!)
 * sort.start()
 * // …later
 * sort.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left exactly as it
 * was found.
 */
export function createScrambleText(el: HTMLElement, opts: Partial<ScrambleTextOptions> = {}): EffectHandle {
  return mount<ScrambleTextOptions>(el, opts, {
    defaults: scrambleTextDefaults,
    kind: 'dom',
    create: () => new ScrambleTextSurface()
  })
}

export default createScrambleText
