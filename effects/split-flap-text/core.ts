/*
 * SplitFlapText: Beamish
 * https://beamish.ink/effects/split-flap-text
 *
 * A departure board. Each character is a split-flap cell: a stack of hinged
 * leaves, each carrying the bottom half of one glyph on its front and the top
 * half of the next on its back, dropping one at a time until the right one is
 * showing.
 *
 * The mechanism is the whole effect, so it is built rather than suggested. Four
 * layers per cell:
 *
 *   The top half of the glyph that is arriving, sitting still behind everything.
 *   The bottom half of the glyph that is leaving, likewise.
 *   A leaf over the top half, carrying the upper half of the leaving glyph,
 *   falling from upright to edge on.
 *   A leaf over the bottom half, carrying the lower half of the arriving glyph,
 *   rising from edge on to upright.
 *
 * Two things that most versions get wrong, and both of them are what makes a
 * board read as mechanical rather than as a slot machine.
 *
 * The leaves go through the strip in order. A cell cannot jump from A to R: it
 * has to pass through everything between, one leaf at a time, which is why a
 * real board lands its letters in the order the alphabet puts them rather than
 * the order they are written in. Nothing about that needed designing. It falls
 * out of modelling the strip, and it is the single most recognisable thing
 * about the object.
 *
 * Every cell is the width of the widest glyph on the strip, measured once. The
 * flaps on a board are all the same size because they are the same part, and a
 * board whose cells breathe is not a board.
 *
 * It is pure in `t`. Which leaf a cell is on, and how far through its fall, are
 * both arithmetic on the clock, so the recorder can seek it and a dropped frame
 * costs nothing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type SplitFlapTextOptions = BaseOptions & {
  /** The strip, in the order the leaves are stacked. Position 0 is at rest. */
  strip: string
  /** Milliseconds for one leaf to fall. */
  flap: number
  /** Milliseconds between one cell starting and the next. */
  stagger: number
  /** Milliseconds before the first cell starts. */
  hold: number
  /** The face of a leaf. */
  face: string
  /** The type printed on it. */
  ink: string
  /** How dark the seam across the middle of a cell is, 0 to 1. */
  seam: number
  /** Perspective applied to the fall, in pixels. 0 is a flat fold. */
  depth: number
  /** How much a falling leaf darkens as it turns away from the light. */
  shade: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const splitFlapTextDefaults: SplitFlapTextOptions = {
  strip: ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:-',
  flap: 52,
  stagger: 110,
  hold: 240,
  face: '#26261f',
  ink: '#f7f5ed',
  seam: 0.45,
  depth: 180,
  shade: 0.55,
  reducedMotionTime: 999
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

type Cell = {
  box: HTMLElement
  /** Upper half of the glyph arriving. Still. */
  topStill: HTMLElement
  /** Lower half of the glyph leaving. Still. */
  bottomStill: HTMLElement
  /** Upper half of the glyph leaving. Falls. */
  leafFalling: HTMLElement
  /** Lower half of the glyph arriving. Rises. */
  leafRising: HTMLElement
  /** How many leaves this cell has to pass through to reach its character. */
  steps: number
}

/*
 * One half of a glyph, clipped. The glyph is set at full size in an inner span
 * and the wrapper shows half of it: the top half by starting at the top, the
 * bottom half by pulling the inner span up by its own height.
 */
function half(which: 'top' | 'bottom'): { wrap: HTMLElement; inner: HTMLElement } {
  const wrap = document.createElement('span')
  /*
   * Opaque, and that is not a detail. A leaf is a tile: it hides what is behind
   * it. The first version left the wrappers transparent and every cell at rest
   * showed the top half of the letter that was arriving straight through the
   * blank leaf covering it, which is the sort of thing that looks like a
   * z-index problem and is really a missing object.
   *
   * inherit, so the face colour reaches all four layers from the cell without
   * being plumbed to each one.
   */
  wrap.style.cssText =
    'position:absolute;left:0;right:0;height:50%;overflow:hidden;background:inherit;' +
    (which === 'top' ? 'top:0;' : 'bottom:0;')
  const inner = document.createElement('span')
  inner.style.cssText =
    'position:absolute;left:0;right:0;height:200%;display:flex;' +
    'align-items:center;justify-content:center;' +
    (which === 'top' ? 'top:0;' : 'bottom:0;')
  wrap.append(inner)
  return { wrap, inner }
}

class SplitFlapTextSurface implements Surface<SplitFlapTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private cells: Cell[] = []
  private probe: HTMLElement | null = null
  private built = false
  private measured = false
  private measuredFor = ''
  private fontsPending = false

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  private build(opts: SplitFlapTextOptions): void {
    const host = this.host
    if (!host || this.built) return

    host.textContent = ''
    this.cells = []

    // The text a screen reader gets: one string, unchanged, out of sight. A
    // board read leaf by leaf is forty characters of nonsense.
    const label = document.createElement('span')
    label.textContent = this.original
    label.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'

    const visual = document.createElement('span')
    visual.setAttribute('aria-hidden', 'true')
    visual.style.cssText = 'display:inline-flex;flex-wrap:wrap;gap:0.14em;'

    const strip = Array.from(opts.strip.length > 0 ? opts.strip : splitFlapTextDefaults.strip)
    const upper = this.original.toUpperCase()

    for (const character of Array.from(upper)) {
      const box = document.createElement('span')
      box.style.cssText =
        'position:relative;display:inline-block;height:1.2em;line-height:1.2em;' +
        'border-radius:2px;overflow:hidden;flex:0 0 auto;'

      const topStill = half('top')
      const bottomStill = half('bottom')
      const falling = half('top')
      const rising = half('bottom')

      // The two that move. Each hinges on the seam, which is the edge it shares
      // with the half behind it.
      falling.wrap.style.transformOrigin = 'center bottom'
      falling.wrap.style.backfaceVisibility = 'hidden'
      rising.wrap.style.transformOrigin = 'center top'
      rising.wrap.style.backfaceVisibility = 'hidden'

      box.append(topStill.wrap, bottomStill.wrap, falling.wrap, rising.wrap)
      visual.append(box)

      /*
       * Where on the strip this character lives, and so how many leaves have to
       * fall to reach it. A character that is not on the strip at all stops at
       * position 0, which is the blank: a board cannot show what it does not
       * carry, and inventing a leaf for it would be the one dishonest thing in
       * here.
       */
      const index = strip.indexOf(character)
      this.cells.push({
        box,
        topStill: topStill.inner,
        bottomStill: bottomStill.inner,
        leafFalling: falling.inner,
        leafRising: rising.inner,
        steps: index < 0 ? 0 : index
      })
    }

    const probe = document.createElement('span')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText =
      'position:absolute;visibility:hidden;white-space:pre;pointer-events:none;top:0;left:0'
    visual.append(probe)
    this.probe = probe

    host.append(label, visual)
    this.built = true

    /*
     * Widths measured in the fallback face are the wrong widths, and the cells
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
   * One width for every cell: the widest glyph on the strip. The flaps on a
   * real board are the same size because they are the same part, and it is also
   * the only way the board does not breathe as it runs.
   */
  private measure(strip: string): void {
    const probe = this.probe
    if (!probe || (this.measured && this.measuredFor === strip)) return
    this.measuredFor = strip

    let widest = 0
    for (const glyph of Array.from(strip)) {
      probe.textContent = glyph
      widest = Math.max(widest, probe.getBoundingClientRect().width)
    }
    // A strip of nothing but spaces would otherwise collapse every cell.
    const width = Math.max(widest, 1)
    for (const cell of this.cells) cell.box.style.width = `${width.toFixed(2)}px`
    this.measured = true
  }

  resize(): void {
    this.measured = false
  }

  render(t: number, opts: SplitFlapTextOptions): void {
    this.build(opts)
    if (this.cells.length === 0) return

    const strip = Array.from(opts.strip.length > 0 ? opts.strip : splitFlapTextDefaults.strip)
    this.measure(strip.join(''))

    const flap = Math.max(opts.flap, 1) / 1000
    const stagger = opts.stagger / 1000
    const hold = opts.hold / 1000
    const seam = `rgba(0,0,0,${clamp01(opts.seam) * 0.5})`

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]!

      /*
       * Which leaf, and how far through its fall. Both from the clock. A cell
       * that has reached its character sits on it: the turn is clamped, not
       * wrapped, because a board that keeps going is an advertising hoarding.
       */
      const elapsed = t - hold - i * stagger
      const turned = elapsed <= 0 ? 0 : elapsed / flap
      const leaf = Math.min(Math.floor(turned), cell.steps)
      const progress = leaf >= cell.steps ? 0 : clamp01(turned - leaf)

      const from = strip[leaf] ?? ' '
      const to = strip[Math.min(leaf + 1, cell.steps)] ?? from

      const paint = (el: HTMLElement, glyph: string) => {
        if (el.textContent !== glyph) el.textContent = glyph
      }
      paint(cell.topStill, to)
      paint(cell.bottomStill, from)
      paint(cell.leafFalling, from)
      paint(cell.leafRising, to)

      /*
       * The fall. The upper leaf goes from upright to edge on over the first
       * half of the step and the lower leaf comes up over the second, which is
       * one leaf passing the seam rather than two leaves crossing.
       */
      const perspective = opts.depth > 0 ? `perspective(${opts.depth}px) ` : ''
      const fallen = Math.min(progress * 2, 1) * 90
      const rising = Math.max(progress * 2 - 1, 0)

      const falling = cell.leafFalling.parentElement as HTMLElement
      const risingWrap = cell.leafRising.parentElement as HTMLElement
      falling.style.transform = `${perspective}rotateX(${-fallen.toFixed(2)}deg)`
      risingWrap.style.transform = `${perspective}rotateX(${(90 - rising * 90).toFixed(2)}deg)`

      /*
       * A leaf standing edge on is hidden rather than left at 90 degrees.
       *
       * Under a perspective projection a plane at exactly 90 degrees does not
       * vanish: it is perpendicular to the screen, so it projects as a sliver
       * with a vanishing far edge, and the sliver has half a letter smeared
       * along it. It reads as a rendering fault, which is what it looked like
       * before this: a pale curved mark beside whichever cell was mid-flip.
       */
      const show = (el: HTMLElement, visible: boolean) => {
        const value = visible ? '' : 'hidden'
        if (el.style.visibility !== value) el.style.visibility = value
      }
      show(falling, fallen < 89.5)
      show(risingWrap, rising > 0.005)

      /*
       * A leaf turning away from the light loses it. This is the one piece of
       * shading in here and it is doing a lot: without it the two leaves are
       * flat shapes sliding over each other and the cell reads as a wipe.
       */
      const dim = (el: HTMLElement, amount: number) => {
        const value = `brightness(${(1 - amount * opts.shade).toFixed(3)})`
        if (el.style.filter !== value) el.style.filter = value
      }
      dim(falling, Math.sin((fallen * Math.PI) / 180) * 0.9)
      dim(risingWrap, (1 - rising) * 0.9)

      const style = cell.box.style
      if (style.background !== opts.face) style.background = opts.face
      if (style.color !== opts.ink) style.color = opts.ink
      // The seam, drawn as a hard line rather than a gap, because on a board it
      // is two leaves meeting and not a space between them.
      const shadow = `inset 0 -1px 0 ${seam}`
      const top = cell.topStill.parentElement as HTMLElement
      if (top.style.boxShadow !== shadow) top.style.boxShadow = shadow
    }
  }

  teardown(): void {
    if (this.host && this.original) this.host.textContent = this.original
    this.cells = []
    this.probe = null
    this.built = false
    this.measured = false
    this.measuredFor = ''
    this.host = null
  }
}

/**
 * Mount SplitFlapText into `el`. The element must already contain the text, and
 * it should be short: a board is four layers of DOM per character.
 *
 * ```ts
 * const board = createSplitFlapText(document.querySelector('#board')!)
 * board.start()
 * // …later
 * board.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left exactly as it
 * was found.
 */
export function createSplitFlapText(
  el: HTMLElement,
  opts: Partial<SplitFlapTextOptions> = {}
): EffectHandle {
  return mount<SplitFlapTextOptions>(el, opts, {
    defaults: splitFlapTextDefaults,
    kind: 'dom',
    create: () => new SplitFlapTextSurface()
  })
}

export default createSplitFlapText
