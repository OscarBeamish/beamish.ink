/*
 * CardStack: Beamish
 * https://beamish.ink/effects/card-stack
 *
 * A pile of prints being leafed through. The top one is lifted, taken aside,
 * and put at the back, and the pile shuffles up a place.
 *
 * Two things carry it, and the second is the one everybody gets wrong.
 *
 * Nobody squares a pile. Each card sits at a slight angle and a slight offset
 * from the one beneath, fixed per card rather than per position, so the pile
 * keeps its own character as the cards move through it: the third card is
 * always the one sitting a degree crooked, wherever in the pile it happens to
 * be. A pile with an even offset per position is a diagram of a pile.
 *
 * And the card changes its stacking order only while it is clear of the pile.
 * A card travelling from front to back has to pass the others, and there is no
 * way to interpolate between being in front of something and behind it: at some
 * instant the order flips. Do it while the card is still over the pile and you
 * see it, as a flicker that looks like a dropped frame. Do it at the far point
 * of the travel, where nothing is overlapping, and it cannot be seen at all.
 * That one line is the difference between this and every version that fades the
 * card out to hide the switch.
 *
 * It is pure in `t`. Which card is moving, and how far through its travel it
 * is, are both arithmetic on the clock, and the scatter is a hash of the card's
 * own index.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type CardStackOptions = BaseOptions & {
  /** Milliseconds each card spends at the front before it is moved. */
  interval: number
  /** Milliseconds the move itself takes. */
  travel: number
  /** How far aside the card goes, as a share of the stack's width. */
  aside: number
  /** How far each card sits from the one beneath, in pixels. */
  spread: number
  /** How much smaller each card down the pile is drawn. */
  shrink: number
  /** Degrees of scatter. Nobody squares a pile. */
  tilt: number
  /** How far the moving card lifts, in pixels. */
  lift: number
  /** Seed for the scatter. The same seed gives the same pile. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const cardStackDefaults: CardStackOptions = {
  interval: 1800,
  travel: 900,
  aside: 0.62,
  spread: 18,
  shrink: 0.045,
  tilt: 3,
  lift: 26,
  seed: 7,
  reducedMotionTime: 0
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

/* Eased both ends: a hand picking something up accelerates and arrives. */
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)

class CardStackSurface implements Surface<CardStackOptions> {
  private host: HTMLElement | null = null
  private cards: HTMLElement[] = []
  private built = false
  private width = 1

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
  }

  /*
   * The cards are whatever the element already holds. They are stacked on top
   * of one another rather than laid out, because a pile is a pile: the element
   * keeps the height of one card and the author's markup is untouched beyond
   * being positioned.
   */
  private build(): void {
    const host = this.host
    if (!host || this.built) return
    this.cards = [...host.children].filter(
      (node): node is HTMLElement => node instanceof HTMLElement
    )
    for (const card of this.cards) {
      card.style.position = 'absolute'
      card.style.inset = '0'
      card.style.willChange = 'transform'
      card.style.backfaceVisibility = 'hidden'
    }
    this.built = true
  }

  resize(size: { width: number }): void {
    this.width = Math.max(size.width, 1)
  }

  render(t: number, opts: CardStackOptions): void {
    this.build()
    const count = this.cards.length
    if (count === 0) return

    const interval = Math.max(opts.interval, 1) / 1000
    const travel = Math.min(Math.max(opts.travel, 1) / 1000, interval)

    /*
     * Which deal we are on, and how far through the move. Both from the clock,
     * so seeking to the middle of a deal lands on the same frame every time.
     */
    const deals = Math.floor(t / interval)
    const within = t - deals * interval
    const moving = clamp01(within / travel)
    const eased = easeInOut(moving)

    for (let i = 0; i < count; i++) {
      const card = this.cards[i]!

      /*
       * Where this card is in the pile. The deal count rotates the whole pile,
       * so a card's depth is its index shifted by however many deals have
       * happened, and the one at depth 0 is the one being moved.
       */
      const depth = (((i - deals) % count) + count) % count
      const leaving = depth === 0 && moving > 0 && moving < 1

      // Its depth once this move finishes: the front card goes to the back.
      const settled = leaving ? count - 1 : depth
      const shown = leaving ? eased * (count - 1) : settled

      /*
       * The scatter, fixed to the card rather than to the position. The third
       * card is always the one sitting a degree crooked, wherever it is in the
       * pile, which is what makes it a pile of particular things rather than a
       * diagram of a pile.
       */
      const scatterA = (hash2(i + 1, opts.seed) - 0.5) * 2
      const scatterB = (hash2(i + 91, opts.seed) - 0.5) * 2

      // Out to the side and back, so the card never crosses the pile face on.
      const arc = Math.sin(moving * Math.PI)
      const x = (leaving ? arc * opts.aside * this.width : 0) + scatterA * opts.spread * 0.25
      const y = shown * opts.spread + (leaving ? -arc * opts.lift : 0) + scatterB * opts.spread * 0.18
      const scale = 1 - shown * opts.shrink
      const turn = scatterA * opts.tilt + (leaving ? arc * opts.tilt * 1.6 : 0)

      card.style.transform =
        `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) ` +
        `rotate(${turn.toFixed(2)}deg) scale(${scale.toFixed(4)})`

      /*
       * The stacking order, and the only subtle thing in the file.
       *
       * A card going from front to back has to pass the others, and there is no
       * interpolating between in front of and behind: at some instant the order
       * flips. Done while the card is still over the pile it is visible, as a
       * flicker that reads as a dropped frame. Done at the far point of the
       * travel, where nothing overlaps, it cannot be seen at all.
       */
      /*
       * This did not do what the paragraph above says. It was
       * `count - shown` until the halfway point, and `shown` grows as soon as
       * the card starts moving, so the card lost its place at the front almost
       * immediately: a third of the way through the travel it was already
       * behind the card beneath it. What that looks like is not a card being
       * lifted off a pile. It looks like a new card arriving on top, which is
       * exactly how it was reported.
       *
       * A card being lifted stays in front of everything until it is clear,
       * and is behind everything on the way back. There is nothing to
       * interpolate: it is above, then it is below, and the swap happens at the
       * far point where nothing is overlapping and it cannot be seen.
       */
      const order = leaving ? (moving < 0.5 ? count + 1 : -1) : count - shown
      const z = String(Math.round(order * 10))
      if (card.style.zIndex !== z) card.style.zIndex = z

      // The pile reads as a pile because the cards nearer the front sit over
      // more shadow, not because they are drawn differently.
      const depthShade = shown / Math.max(count - 1, 1)
      const shadow = `0 ${(2 + depthShade * 10).toFixed(1)}px ${(8 + depthShade * 20).toFixed(1)}px rgba(54,54,48,${(0.16 - depthShade * 0.09).toFixed(3)})`
      if (card.style.boxShadow !== shadow) card.style.boxShadow = shadow
    }
  }

  teardown(): void {
    for (const card of this.cards) {
      card.style.position = ''
      card.style.inset = ''
      card.style.transform = ''
      card.style.zIndex = ''
      card.style.boxShadow = ''
      card.style.willChange = ''
      card.style.backfaceVisibility = ''
    }
    if (this.host) this.host.style.position = ''
    this.cards = []
    this.built = false
    this.host = null
  }
}

/**
 * Mount CardStack onto `el`. Its element children become the pile, stacked on
 * top of one another, so give the element the height of one card.
 *
 * ```ts
 * const pile = createCardStack(document.querySelector('#pile')!)
 * pile.start()
 * // …later
 * pile.destroy()
 * ```
 *
 * The cards are the author's own markup and are never replaced: `destroy()`
 * puts every property back.
 */
export function createCardStack(
  el: HTMLElement,
  opts: Partial<CardStackOptions> = {}
): EffectHandle {
  return mount<CardStackOptions>(el, opts, {
    defaults: cardStackDefaults,
    kind: 'dom',
    create: () => new CardStackSurface()
  })
}

export default createCardStack
