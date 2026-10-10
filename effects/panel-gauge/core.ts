/*
 * PanelGauge: Beamish
 * https://beamish.ink/effects/panel-gauge
 *
 * A moving-coil gauge: a dial face, a scale that lights to the reading, and a
 * needle that is never quite still.
 *
 * WHAT MAKES A GAUGE READ AS AN INSTRUMENT
 *
 * Not the circle. Every dashboard has circles. Four things, and all of them
 * come from the fact that a real gauge is a coil, a spring and a pointer:
 *
 *   The scale is not symmetrical about the top. A panel meter sweeps about 250
 *   degrees from the lower left, because that is where the stops are, and the
 *   dead sector at the bottom is where the movement lives.
 *
 *   The ticks are not evenly important. Majors carry a number, minors do not,
 *   and the minors between two majors are what make the eye read a position as
 *   a value rather than as an angle.
 *
 *   It is never still. A real reading hunts by a fraction of a division,
 *   because what is being measured is not still either. A gauge frozen at
 *   exactly 0.6 reads as a picture of a gauge, and the hunt is most of what
 *   makes this one read as an instrument that is connected to something.
 *
 * WHAT IS NOT HERE, AND WHY
 *
 * The overshoot. A moving coil is a mass on a spring, so it arrives at a
 * reading by passing it, and that is the most characterful thing a needle
 * does. It is also a response to a change, which means it needs to know when
 * the change happened, which is state between frames.
 *
 * The first version of this had it: a closed-form damped oscillator driven by
 * t, so the needle swept up from zero and settled once at the start. That
 * reads beautifully and does not loop. At t the needle was at the reading and
 * at t plus period it was still at the reading, but at t equals zero it was at
 * the bottom of the scale, so the first frame and the last frame of a take
 * were different frames and the video jumped once a cycle.
 *
 * So the needle is a function of the reading and nothing else, and the hunt is
 * a pair of sines whose periods divide the loop. If you want the overshoot on
 * a live page, drive `value` through `update()` and animate it yourself: a
 * host that owns the clock can hold state, and this cannot.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type PanelGaugeOptions = BaseOptions & {
  /** The dial face. */
  face: string
  /** Ticks, numerals and the needle's shadow side. */
  ink: string
  /** The needle. */
  needle: string
  /** The arc that lights up to the reading. */
  lit: string
  /** Where the needle sits, 0 to 1 of the scale. */
  value: number
  /** How far the reading hunts either side, as a share of the scale. */
  hunt: number
  /** Degrees of arc the scale covers. */
  sweep: number
  /** Major divisions. Each carries a numeral. */
  majors: number
  /** Minor divisions between each pair of majors. */
  minors: number
  /** Seconds for one cycle of the hunt. Exactly periodic over this. */
  period: number
  /** Seed for the hunt. The same seed gives the same wander. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const panelGaugeDefaults: PanelGaugeOptions = {
  face: '#15171b',
  ink: '#8b9199',
  needle: '#ff9426',
  lit: '#ff9426',
  value: 0.62,
  hunt: 0.035,
  sweep: 250,
  majors: 6,
  minors: 4,
  period: 18,
  seed: 3,
  reducedMotionTime: 4.5
}

const TAU = Math.PI * 2

function hash(n: number): number {
  const x = Math.sin(n * 91.73 + 13.7) * 43758.5453123
  return x - Math.floor(x)
}

class PanelGaugeSurface implements Surface<PanelGaugeOptions> {
  private ctx: CanvasRenderingContext2D | null = null
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('PanelGauge needs a canvas')
    const context = ctx.canvas.getContext('2d', { alpha: true })
    if (!context) throw new Error('PanelGauge needs a 2D context, which this browser did not give')
    this.ctx = context
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
  }

  render(t: number, opts: PanelGaugeOptions): void {
    const ctx = this.ctx
    if (!ctx) return

    const dpr = Math.max(this.size.dpr, 0.001)
    const w = this.size.pixelWidth / dpr
    const h = this.size.pixelHeight / dpr

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.size.pixelWidth, this.size.pixelHeight)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const cx = w / 2
    const cy = h / 2
    const r = Math.min(w, h) / 2 - 6
    if (r <= 4) return

    const sweep = (Math.max(opts.sweep, 30) * Math.PI) / 180
    /*
     * The dead sector is at the bottom, which is where the movement goes on a
     * real meter, so the scale starts below the left of centre and runs round
     * the top. Starting at the top and running clockwise is a progress ring.
     */
    const from = Math.PI / 2 + (TAU - sweep) / 2

    /*
     * The reading. The hunt is two sines of different periods so it does not
     * read as a metronome, and both complete whole turns in `period` so the
     * needle comes home.
     */
    const phase = TAU * (t / Math.max(opts.period, 0.001))
    const a = hash(opts.seed) * TAU
    const b = hash(opts.seed + 7.1) * TAU
    const hunt =
      (Math.sin(phase * 3 + a) * 0.65 + Math.sin(phase * 5 + b) * 0.35) * opts.hunt

    const value = Math.min(1, Math.max(0, opts.value + hunt))
    const at = from + value * sweep

    // --- face -------------------------------------------------------------
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, TAU)
    ctx.fillStyle = opts.face
    ctx.fill()

    // --- the lit arc, from the start of the scale to the reading ----------
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.82, from, at)
    ctx.strokeStyle = opts.lit
    ctx.globalAlpha = 0.22
    ctx.lineWidth = Math.max(2, r * 0.07)
    ctx.stroke()
    ctx.globalAlpha = 1

    // --- ticks -------------------------------------------------------------
    const majors = Math.max(2, Math.round(opts.majors))
    const minors = Math.max(0, Math.round(opts.minors))
    const steps = majors * (minors + 1)
    for (let i = 0; i <= steps; i++) {
      const s = i / steps
      const angle = from + s * sweep
      const major = i % (minors + 1) === 0
      const inner = r * (major ? 0.68 : 0.76)
      const outer = r * 0.88
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
      /*
       * A tick below the reading is lit and one above it is not, which is what
       * makes the scale carry the value as well as the needle. Panel meters
       * with a lit scale have done this since they had lamps behind them.
       */
      ctx.strokeStyle = s <= value ? opts.lit : opts.ink
      ctx.globalAlpha = s <= value ? 1 : 0.55
      ctx.lineWidth = major ? Math.max(1.4, r * 0.022) : Math.max(0.8, r * 0.011)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // --- needle -------------------------------------------------------------
    const tip = r * 0.74
    const tail = r * 0.16
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(at)
    ctx.beginPath()
    // A pointer rather than a line: wide at the boss, a point at the tip.
    ctx.moveTo(-tail, 0)
    ctx.lineTo(0, -Math.max(1.2, r * 0.028))
    ctx.lineTo(tip, 0)
    ctx.lineTo(0, Math.max(1.2, r * 0.028))
    ctx.closePath()
    ctx.fillStyle = opts.needle
    ctx.fill()
    ctx.restore()

    // --- boss ---------------------------------------------------------------
    ctx.beginPath()
    ctx.arc(cx, cy, Math.max(2.5, r * 0.065), 0, TAU)
    ctx.fillStyle = opts.ink
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy, Math.max(1, r * 0.028), 0, TAU)
    ctx.fillStyle = opts.face
    ctx.fill()
  }

  teardown(): void {
    this.ctx = null
  }
}

/**
 * Mount PanelGauge into `el`. The gauge fills the shorter side, so a square
 * host gives a full dial.
 *
 * ```ts
 * const load = createPanelGauge(document.querySelector('#load')!, { value: 0.62 })
 * load.start()
 * // …later
 * load.destroy()
 * ```
 */
export function createPanelGauge(
  el: HTMLElement,
  opts: Partial<PanelGaugeOptions> = {}
): EffectHandle {
  return mount<PanelGaugeOptions>(el, opts, {
    defaults: panelGaugeDefaults,
    create: () => new PanelGaugeSurface()
  })
}

export default createPanelGauge
