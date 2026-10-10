/*
 * EmberRise: Beamish
 * https://beamish.ink/effects/ember-rise
 *
 * Embers lifting off the bottom edge of an element and dying on the way up.
 * Made for a control that is supposed to look hot, which is where it came from.
 *
 * NOT AN ARRAY OF PARTICLES
 *
 * The usual version of this keeps a list, pushes a few onto it every frame,
 * advances each one, and splices out the dead. The page this came from does
 * exactly that, down to `p.vx *= Math.pow(0.985, f)` and a `Math.random()` per
 * ember. That cannot be used here for the reason every integrating effect in
 * this library has been rewritten: the position of an ember depends on the
 * frame before it, so there is no value of `t` you can ask the effect for,
 * which means it cannot be recorded and two machines running the same page
 * disagree after a minute.
 *
 * Here the embers are a fixed cast with staggered lives. Ember k is always
 * ember k: its lane, its size, its sway and its place in the queue are all
 * hashes of k, and its age is `fract(t / life + phase_k)`. Nothing is created,
 * nothing is destroyed, nothing is stored, and the frame at t is the same frame
 * whenever you ask for it.
 *
 * It also means `count` is exact. An emitter with a spawn rate gives you a
 * number of embers that depends on the frame rate; this many is this many.
 *
 * TWO CANVAS DECISIONS
 *
 * It draws in 2D rather than WebGL, which is unusual here and deliberate. The
 * budget is one live WebGL context on a page, and this is an effect you might
 * reasonably want on three buttons at once. A couple of hundred small arcs cost
 * almost nothing, and the thing that makes embers look like embers is additive
 * compositing rather than per-pixel work.
 *
 * The canvas is cleared to transparent and never filled, so it composites over
 * whatever is behind it. An ember effect that paints its own background is one
 * you cannot put on top of a button.
 *
 * WHAT MAKES IT READ AS FIRE RATHER THAN AS CONFETTI
 *
 *   They slow down. An ember leaves fast and loses to the air, so the travel is
 *   eased rather than linear. Constant speed is the clearest tell.
 *
 *   They cool. The colour runs from `ember` to `cool` over a life, because what
 *   you are watching is something losing its heat.
 *
 *   They are not all the same size, and the small ones go further. That is the
 *   whole of the depth in this, and without it the field reads as one object.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type EmberRiseOptions = BaseOptions & {
  /** The hot core of a new ember. */
  ember: string
  /** What an ember has cooled to by the end of its life. */
  cool: string
  /** How many embers are alive at once. Exact, not a spawn rate. */
  count: number
  /** How far an ember travels in its life, as a share of the host's height. */
  rise: number
  /** Seconds an ember lives. Snapped so the period is a whole number of lives. */
  life: number
  /** Sideways wander, in CSS pixels. */
  sway: number
  /** Radius of the largest ember, in CSS pixels. */
  size: number
  /** Share of the width the embers lift off, 0 to 1, centred. */
  spread: number
  /** Overall brightness. */
  heat: number
  /** Seed for the cast. The same seed gives the same embers. */
  seed: number
  /** Seconds for one cycle. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const emberRiseDefaults: EmberRiseOptions = {
  ember: '#ffb257',
  cool: '#8c2f17',
  count: 120,
  rise: 0.95,
  life: 4,
  sway: 16,
  size: 2.4,
  spread: 0.74,
  heat: 1,
  seed: 5,
  period: 16,
  reducedMotionTime: 4
}

/** One hash, one ember. Stable for a given index and seed. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123
  return x - Math.floor(x)
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

class EmberRiseSurface implements Surface<EmberRiseOptions> {
  private ctx: CanvasRenderingContext2D | null = null
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('EmberRise needs a canvas')
    // alpha, because this is meant to sit over something.
    const context = ctx.canvas.getContext('2d', { alpha: true })
    if (!context) throw new Error('EmberRise needs a 2D context, which this browser did not give')
    this.ctx = context
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
  }

  render(t: number, opts: EmberRiseOptions): void {
    const ctx = this.ctx
    if (!ctx) return

    const dpr = Math.max(this.size.dpr, 0.001)
    const w = this.size.pixelWidth / dpr
    const h = this.size.pixelHeight / dpr

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.size.pixelWidth, this.size.pixelHeight)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    /*
     * Additive. Two embers crossing are brighter than one, which is what light
     * does and what source-over cannot do: with normal compositing the one in
     * front simply hides the one behind and the field goes flat.
     */
    ctx.globalCompositeOperation = 'lighter'

    /*
     * The life is snapped so that a whole number of them fits the period.
     * Without this the cast is part way through a life when the loop comes
     * round and the recorded video jumps once a cycle, forever.
     */
    const lives = Math.max(1, Math.round(opts.period / Math.max(opts.life, 0.05)))
    const life = opts.period / lives

    const hot = rgb(opts.ember)
    const cold = rgb(opts.cool)
    const count = Math.max(0, Math.round(opts.count))
    const seed = opts.seed * 17.13

    for (let k = 0; k < count; k++) {
      const a = hash(k + seed)
      const b = hash(k * 2.37 + seed + 11.1)
      const c = hash(k * 5.11 + seed + 29.7)
      const d = hash(k * 7.73 + seed + 53.3)

      // Where this one is in its life. The stagger is the whole emitter: a
      // fixed cast with evenly spread phases is a steady stream.
      const age = (t / life + a) % 1

      /*
       * Small embers go further and live longer in the air, which is the only
       * depth cue in here. `reach` runs 0.55 to 1.15 against a size that runs
       * the other way.
       */
      const small = 1 - b
      const reach = 0.55 + small * 0.6

      /*
       * Eased, not linear. An ember leaves fast and loses to the air, and
       * constant speed is the clearest way to make this read as confetti.
       */
      const climbed = 1 - Math.pow(1 - age, 1.7)
      const y = h - climbed * opts.rise * h * reach

      const lane = (0.5 - opts.spread / 2 + opts.spread * c) * w
      // One whole turn of sway per life, so the sideways wander comes home with
      // everything else.
      const x = lane + Math.sin((age + d) * Math.PI * 2) * opts.sway * (0.4 + small * 0.6)

      /*
       * In quickly, out slowly. The sine is zero at both ends of the life, so
       * nothing appears or vanishes at full brightness, and the power skews the
       * peak early: an ember is brightest just after it leaves.
       */
      const fade = Math.pow(Math.sin(Math.PI * age), 0.85) * (1 - age * 0.35)
      const alpha = Math.max(0, fade * opts.heat)
      if (alpha <= 0.002) continue

      // Cooling. What you are watching is something losing its heat.
      const mix = Math.min(1, age * 1.25)
      const r = Math.round(hot[0] + (cold[0] - hot[0]) * mix)
      const g = Math.round(hot[1] + (cold[1] - hot[1]) * mix)
      const bl = Math.round(hot[2] + (cold[2] - hot[2]) * mix)

      const radius = Math.max(0.2, opts.size * (0.3 + b * 0.7) * (1 - age * 0.4))

      /*
       * Two passes: a wide dim halo and a tight bright core. A single flat disc
       * reads as a dot, and a radial gradient per ember is a new object per
       * ember per frame, which is the one thing that would make this expensive.
       */
      ctx.globalAlpha = alpha * 0.22
      ctx.fillStyle = `rgb(${r}, ${g}, ${bl})`
      ctx.beginPath()
      ctx.arc(x, y, radius * 3.2, 0, Math.PI * 2)
      ctx.fill()

      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  teardown(): void {
    this.ctx = null
  }
}

/**
 * Mount EmberRise into `el`. The element needs a size, in CSS, not just
 * content. The canvas is transparent, so put it over whatever should look hot.
 *
 * ```ts
 * const fire = createEmberRise(document.querySelector('#cta-glow')!)
 * fire.start()
 * // …later
 * fire.destroy()
 * ```
 */
export function createEmberRise(
  el: HTMLElement,
  opts: Partial<EmberRiseOptions> = {}
): EffectHandle {
  return mount<EmberRiseOptions>(el, opts, {
    defaults: emberRiseDefaults,
    create: () => new EmberRiseSurface()
  })
}

export default createEmberRise
