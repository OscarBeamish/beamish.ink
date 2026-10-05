/*
 * MisprintText: Beamish
 * https://beamish.ink/effects/misprint-text
 *
 * A plate slipping out of register.
 *
 * The usual version of this splits the red and blue channels apart and calls it
 * a glitch, which is a television fault: an analogue signal arriving at the
 * wrong time. Paper has its own version of the same idea and it looks quite
 * different. A press lays one plate per ink, and if a plate is a fraction out of
 * position its colour prints beside the others instead of on top of them. You
 * get the word twice in two inks, offset, with the overlap darker than either.
 *
 * So this is three layers of the same word, two of them coloured and offset, and
 * the stack multiplies rather than composites, because that is what overlapping
 * ink does. The overlap going darker is the whole tell: a channel split goes
 * brighter where the channels meet, which is light, not ink.
 *
 * Registration does not drift. A plate sits wrong for a whole run and then gets
 * knocked, so the offset holds still and then jumps, driven by a hash of which
 * interval you are in. Easing it would turn a press into a wobble.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type MisprintTextOptions = BaseOptions & {
  /** The plate that is in register. */
  ink: string
  /** The first plate that is not. */
  accent: string
  /** The second plate that is not. */
  second: string
  /** How far a plate slips, in em, so it tracks the type size. */
  slip: number
  /** Seconds a plate holds its position before being knocked. */
  hold: number
  /** Share of intervals where the plates are actually out. */
  chance: number
  /** How far a slipped plate also turns, in degrees. */
  skew: number
  /** Seed for which intervals slip and how far. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const misprintTextDefaults: MisprintTextOptions = {
  ink: '#36362f',
  accent: '#c44400',
  second: '#6f8fae',
  slip: 0.045,
  hold: 1.4,
  chance: 0.55,
  skew: 0.4,
  seed: 7,
  reducedMotionTime: 0
}

/* Deterministic, so the same `t` always gives the same registration. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123
  return x - Math.floor(x)
}

class MisprintTextSurface implements Surface<MisprintTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private plates: HTMLElement[] = []
  private built = false

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  /*
   * Three copies of the word stacked on each other. Built once: rebuilding per
   * frame would throw away the layout and make the text unselectable.
   */
  private build(): void {
    const host = this.host
    if (!host || this.built) return

    host.textContent = ''
    host.style.position = 'relative'
    host.style.display = 'inline-block'
    // Each plate is taken out of flow, so the host needs something to size
    // itself by. The in-register plate stays in flow and does that job.
    this.plates = []

    const make = (offset: boolean) => {
      const plate = document.createElement('span')
      plate.textContent = this.original
      plate.style.display = 'block'
      plate.style.willChange = 'transform'
      if (offset) {
        plate.setAttribute('aria-hidden', 'true')
        plate.style.position = 'absolute'
        plate.style.inset = '0'
        /*
         * Multiply, not normal. Two inks crossing are darker than either, and
         * compositing them would put one on top of the other and lose the
         * overlap entirely. This is the same reason TranslucentSheets multiplies.
         */
        plate.style.mixBlendMode = 'multiply'
        plate.style.pointerEvents = 'none'
      }
      this.plates.push(plate)
      host.append(plate)
      return plate
    }

    // In-register first so it is the one in normal flow and the one a mouse can
    // select. The two that move are decoration and are hidden from the tree.
    make(false)
    make(true)
    make(true)
    this.built = true
  }

  resize(): void {}

  render(t: number, opts: MisprintTextOptions): void {
    this.build()
    if (this.plates.length < 3) return

    this.plates[0]!.style.color = opts.ink
    this.plates[1]!.style.color = opts.accent
    this.plates[2]!.style.color = opts.second

    /*
     * Which run we are in. A plate holds its position for a whole interval and
     * then jumps, so the offset is a step function of time rather than a curve.
     * Flooring the interval is what makes it hold.
     */
    const hold = Math.max(opts.hold, 0.05)
    const run = Math.floor(t / hold)

    for (let i = 1; i < 3; i++) {
      const plate = this.plates[i]!
      const base = run * 3 + i * 17 + opts.seed * 101

      // Most runs are in register. A press that is always wrong is not a press
      // that is nearly right, which is what a misprint actually looks like.
      const out = hash(base) < opts.chance ? 1 : 0
      const angle = hash(base + 1) * Math.PI * 2
      const reach = (0.35 + hash(base + 2) * 0.65) * opts.slip * out
      const turn = (hash(base + 3) - 0.5) * 2 * opts.skew * out

      const x = Math.cos(angle) * reach
      const y = Math.sin(angle) * reach
      plate.style.transform = `translate(${x}em, ${y}em) rotate(${turn}deg)`
    }
  }

  teardown(): void {
    // Put the markup back. The effect borrowed the element; it does not own it.
    if (this.host) {
      this.host.textContent = this.original
      this.host.style.position = ''
      this.host.style.display = ''
    }
    this.plates = []
    this.built = false
    this.host = null
  }
}

/**
 * Mount MisprintText onto an element that already contains the text.
 *
 * ```html
 * <h1 id="title">Out of register</h1>
 * ```
 *
 * ```ts
 * const misprint = createMisprintText(document.querySelector('#title')!)
 * misprint.start()
 * ```
 */
export function createMisprintText(
  el: HTMLElement,
  opts: Partial<MisprintTextOptions> = {}
): EffectHandle {
  return mount<MisprintTextOptions>(el, opts, {
    defaults: misprintTextDefaults,
    create: () => new MisprintTextSurface(),
    // A text treatment animates content that is already on the page, so it gets
    // the host element rather than a canvas it would never draw into.
    kind: 'dom'
  })
}

export default createMisprintText
