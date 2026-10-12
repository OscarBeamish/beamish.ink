/*
 * LightningVein: Beamish
 * https://beamish.ink/effects/lightning-vein
 *
 * A discharge branching across a dark sky. Canvas 2D, no dependencies.
 *
 * Three things carry it, and the first is what separates this from a jagged
 * line with a glow on it.
 *
 * THE PATH IS BUILT BY RECURSIVE DISPLACEMENT, not by stepping along with a
 * random wobble. Start with one segment, push its midpoint sideways, then do
 * the same to both halves with half the push, and again. That gives kinks at
 * every scale: a big lean across the whole strike, bends within the lean, and
 * a tremble on the short runs. A wobble applied per step only has detail at
 * one scale, which is why it reads as a scribble rather than as electricity
 * finding its way.
 *
 * THE FLICKER IS BOUNDED, and that is a hard requirement rather than taste.
 * WCAG 2.3.1 is Level A and wants nothing flashing more than three times a
 * second. A real strike flickers far faster than that, so this does not
 * imitate one: a strike brightens at most twice, several seconds apart from
 * the next strike, and the second brightening is weaker than the first. It
 * still reads as lightning because the shape does the work.
 *
 * NOTHING IS RANDOM AT RENDER TIME. The whole strike is a function of which
 * strike it is, and which strike it is comes from `t`. Ask for the same `t`
 * twice and you get the same bolt down to the last branch, which is what the
 * recorder needs and what makes the loop close.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type LightningVeinOptions = BaseOptions & {
  /**
   * The sky behind it.
   *
   * `auto` takes it from the page, which is almost always right: the strike
   * should sit in your page rather than bring its own rectangle of night.
   */
  sky: string
  /** The channel itself. Near white with a little colour reads as hot. */
  bolt: string
  /** The glow around the channel. A cooler, dimmer version of the bolt. */
  halo: string
  /** Seconds between one strike beginning and the next. */
  period: number
  /** How far the strike leans off vertical, as a share of the width. */
  lean: number
  /** How hard the first displacement pushes, as a share of the width. */
  jitter: number
  /** How many times the path is subdivided. Six is 64 segments. */
  detail: number
  /** Branches thrown off the main channel. */
  branches: number
  /** Width of the main channel in CSS pixels, before it tapers. */
  weight: number
  /** How long the channel stays faintly lit after the flash, in seconds. */
  afterglow: number
  /** Changes every bolt in the sequence without changing anything else. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two
 * drift. meta.json is the source of truth; this object exists so the file
 * stands alone.
 */
export const lightningVeinDefaults: LightningVeinOptions = {
  sky: '#060507',
  bolt: '#eaf2ff',
  halo: '#5d7fd4',
  period: 9,
  lean: 0.22,
  jitter: 0.16,
  detail: 6,
  branches: 5,
  weight: 2.2,
  afterglow: 1.4,
  seed: 11,
  reducedMotionTime: 1.1
}

type Point = { x: number; y: number }

/*
 * A small deterministic generator. Seeded per strike, so the same strike
 * index always builds the same bolt however many times it is asked for, and
 * seeking backwards costs nothing.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/*
 * One channel, by recursive midpoint displacement.
 *
 * Each pass inserts a point between every existing pair and pushes it along
 * the normal of that pair, with the push halving each pass. Pushing along the
 * normal rather than along x is what keeps the kinks perpendicular to the run
 * of the channel wherever it happens to be pointing; pushing along x gives a
 * bolt that is only ever ragged left and right and reads as a flag.
 */
function channel(from: Point, to: Point, push: number, passes: number, random: () => number): Point[] {
  let points: Point[] = [from, to]

  for (let pass = 0; pass < passes; pass++) {
    const next: Point[] = [points[0]!]
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!
      const b = points[i + 1]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const length = Math.hypot(dx, dy) || 1
      const offset = (random() - 0.5) * push
      next.push({
        x: (a.x + b.x) / 2 + (-dy / length) * offset,
        y: (a.y + b.y) / 2 + (dx / length) * offset
      })
      next.push(b)
    }
    points = next
    push *= 0.5
  }

  return points
}

/*
 * How bright the strike is at this point in its life, 0 to 1.
 *
 * Two brightenings and a long tail. The second is weaker and comes late
 * enough that the pair cannot read as a flicker: at the default period the
 * whole thing is two brightenings in nine seconds, which is an order of
 * magnitude under what WCAG 2.3.1 cares about and still looks like weather.
 */
function envelope(age: number, afterglow: number): number {
  if (age < 0) return 0

  const strike = age < 0.06 ? age / 0.06 : Math.exp(-(age - 0.06) * 9)
  const second = age > 0.34 && age < 0.9 ? Math.exp(-Math.abs(age - 0.42) * 14) * 0.55 : 0

  /*
   * The afterglow rises with the strike rather than starting lit.
   *
   * Without that attack it is at full strength at age zero, so the first
   * frame of a cycle shows the channel at 0.14 while the last shows 0.0002,
   * and the loop pops every time it comes round. Measured before it was
   * caught: seam 0.14 against 0.0002, which is the whole glow appearing
   * between two frames.
   */
  const attack = Math.min(1, age / 0.06)
  const glow = Math.exp(-age / Math.max(afterglow, 0.01)) * 0.14 * attack

  return Math.min(1, Math.max(strike, second) + glow)
}

/** '#rgb' | '#rrggbb' | 'rgb(r g b)' to an [r, g, b] triple of 0 to 255. */
function parseColour(input: string): [number, number, number] {
  const value = input.trim()
  if (value.startsWith('#')) {
    let hex = value.slice(1)
    if (hex.length === 3) hex = hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!
    const n = Number.parseInt(hex.slice(0, 6), 16)
    if (Number.isNaN(n)) return [255, 255, 255]
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const nums = value.match(/[\d.]+/g)
  if (nums && nums.length >= 3) {
    return [Number(nums[0]), Number(nums[1]), Number(nums[2])]
  }
  return [255, 255, 255]
}

const rgba = ([r, g, b]: [number, number, number], alpha: number) =>
  `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`

class LightningVeinSurface implements Surface<LightningVeinOptions> {
  private ctx: CanvasRenderingContext2D | null = null
  private size = { width: 1, height: 1, dpr: 1 }

  /*
   * The built bolt, kept until the strike index changes. Rebuilding a
   * six-pass path with its branches every frame is a few thousand points of
   * arithmetic for a shape that does not change during the strike.
   */
  private built: { index: number; key: string; main: Point[]; limbs: Point[][] } | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('LightningVein needs a canvas')
    const context = ctx.canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('LightningVein needs a 2D context, which this browser refused')
    this.ctx = context
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = {
      width: size.pixelWidth / size.dpr,
      height: size.pixelHeight / size.dpr,
      dpr: size.dpr
    }
    // Rebuilt on the next frame: the path is in CSS pixels, so it moves.
    this.built = null
  }

  private build(index: number, opts: LightningVeinOptions): void {
    const { width, height } = this.size
    const key = `${width}x${height}|${opts.lean}|${opts.jitter}|${opts.detail}|${opts.branches}|${opts.seed}`
    if (this.built && this.built.index === index && this.built.key === key) return

    const random = rng(index * 2654435761 + opts.seed * 40503)

    const from = { x: width * (0.3 + random() * 0.4), y: -height * 0.05 }
    const to = {
      x: from.x + (random() - 0.5) * width * opts.lean * 2,
      y: height * (0.72 + random() * 0.28)
    }

    const main = channel(from, to, width * opts.jitter, Math.round(opts.detail), random)

    /*
     * Branches leave the channel and never rejoin it, which is the part that
     * makes a discharge read as one. They start further down than the head,
     * because a branch off the very top has nothing above it to have come
     * from, and they are shorter and less displaced than the trunk.
     */
    const limbs: Point[][] = []
    for (let i = 0; i < Math.round(opts.branches); i++) {
      const at = Math.floor((0.2 + random() * 0.65) * (main.length - 1))
      const root = main[at]!
      const away = (random() - 0.5) * width * 0.3
      const down = height * (0.08 + random() * 0.22)
      limbs.push(
        channel(
          root,
          { x: root.x + away, y: root.y + down },
          width * opts.jitter * 0.45,
          Math.max(2, Math.round(opts.detail) - 2),
          random
        )
      )
    }

    this.built = { index, key, main, limbs }
  }

  private stroke(points: Point[], colour: string, width: number, alpha: number): void {
    const ctx = this.ctx
    if (!ctx || points.length < 2 || alpha <= 0.002) return

    ctx.strokeStyle = colour
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalAlpha = Math.min(1, alpha)

    ctx.beginPath()
    ctx.moveTo(points[0]!.x, points[0]!.y)
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y)
    ctx.stroke()
  }

  render(t: number, opts: LightningVeinOptions): void {
    const ctx = this.ctx
    if (!ctx) return

    const { width, height, dpr } = this.size
    const period = Math.max(opts.period, 0.5)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalAlpha = 1
    ctx.fillStyle = opts.sky
    ctx.fillRect(0, 0, width, height)

    /*
     * Which strike, and how far into it. Taken from `t` by division rather
     * than counted up, so seeking to any time lands mid-strike correctly and
     * the frame at t and the frame at t plus one period are the same frame.
     */
    const index = Math.floor(t / period)
    const age = t - index * period

    const light = envelope(age, opts.afterglow)
    if (light <= 0.002) return

    this.build(index, opts)
    const bolt = this.built
    if (!bolt) return

    const boltColour = parseColour(opts.bolt)
    const haloColour = parseColour(opts.halo)

    /*
     * Three passes over the same path: a wide soft halo, a narrower warmer
     * one, then the channel itself at full width. Drawing the glow as strokes
     * rather than with shadowBlur is deliberate. shadowBlur on a path of a
     * thousand points is the slowest thing canvas can be asked to do, and
     * three strokes give the same falloff for a fraction of the cost.
     */
    ctx.globalCompositeOperation = 'lighter'

    this.stroke(bolt.main, rgba(haloColour, 1), opts.weight * 9, light * 0.1)
    this.stroke(bolt.main, rgba(haloColour, 1), opts.weight * 4, light * 0.2)
    this.stroke(bolt.main, rgba(boltColour, 1), opts.weight, light)

    for (const limb of bolt.limbs) {
      this.stroke(limb, rgba(haloColour, 1), opts.weight * 3, light * 0.12)
      this.stroke(limb, rgba(boltColour, 1), opts.weight * 0.6, light * 0.7)
    }

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  teardown(): void {
    this.ctx = null
    this.built = null
  }
}

/**
 * A discharge branching across a dark sky.
 *
 * @example
 * const sky = createLightningVein(document.querySelector('#sky'))
 * sky.start()
 * // …later
 * sky.destroy()
 */
export function createLightningVein(
  el: HTMLElement,
  opts: Partial<LightningVeinOptions> = {}
): EffectHandle {
  return mount(el, opts, {
    defaults: lightningVeinDefaults,
    create: () => new LightningVeinSurface()
  })
}

export default createLightningVein
