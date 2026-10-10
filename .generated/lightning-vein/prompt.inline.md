You are adding **LightningVein** from Beamish to this project.

> A discharge branching across a dark sky, built by recursive displacement and deliberately flashing far slower than the real thing. Backdrops · effect · MIT.
> https://beamish.ink/effects/lightning-vein

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- Canvas 2D rather than a shader, because the subject is a path. A branching polyline is a handful of line segments to a canvas and a signed distance field to a fragment shader, which would be hundreds of distance tests per pixel for a shape that is mostly empty space
- The path is built by recursive midpoint displacement: one segment, push the midpoint along its normal, repeat on both halves with half the push. That gives kinks at every scale, which is what a discharge looks like. A wobble applied per step has detail at one scale only and reads as a scribble
- The push is along the segment normal rather than along x. Pushing along x gives a bolt that is only ever ragged left and right, which reads as a flag rather than as electricity
- Branches leave the channel and never rejoin it. They start below the head, because a branch off the very top has nothing above it to have come from
- Flashing is bounded on purpose and this is the one number not to raise. WCAG 2.3.1 is Level A and wants nothing flashing more than three times a second; real lightning flickers far faster. A strike here brightens at most twice and the next is a `period` away, which at the default is two brightenings in nine seconds
- Nothing is random at render time. The strike index comes from `t` by division, the bolt is built from a generator seeded on that index, and the same `t` always gives the same bolt. That is what lets the recorder seek and what closes the loop
- The glow is three strokes of increasing width rather than shadowBlur. shadowBlur on a path of a thousand points is the slowest thing a canvas can be asked to do, and the falloff is indistinguishable
- Built for a dark ground and declared as one. A discharge is light, and on a pale ground there is nothing for it to be brighter than
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/lightning-vein/core.ts`**

```ts
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
  sky: 'auto',
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
```

**`src/beamish/shared/runtime.ts`**

```ts
/*
 * Beamish effect runtime.
 *
 * Every tier-1 effect is a thin `Surface` plugged into `mount()`. The host owns
 * everything that is the same for all of them and easy to get wrong: DPR capping,
 * resize, pausing offscreen, pausing on tab hide, reduced motion, WebGL context
 * loss and restore, and full teardown.
 *
 * An effect's core.ts should contain drawing, and nothing else.
 */

import { resolveAutoGrounds } from './ground'

export type EffectHandle = {
  start(): void
  stop(): void
  update(opts: Record<string, unknown>): void
  /** Deterministic: the same `t` must always yield the same frame. */
  renderAtTime(t: number): void
  /** Release the WebGL context, RAF and every listener. */
  destroy(): void
}

export type Size = {
  /** CSS pixels. */
  width: number
  height: number
  /** Device pixels, DPR already capped. Use these for the drawing buffer. */
  pixelWidth: number
  pixelHeight: number
  dpr: number
}

export type Pointer = {
  /**
   * 0 to 1 across the element, origin top-left. Centre until first move.
   *
   * Under `pointerScope: 'window'` this is not clamped: 1.4 means the cursor is
   * 40% of the element's width past its right edge. An effect that reaches
   * beyond its own box needs to know how far.
   */
  x: number
  y: number
  /** False until the pointer has entered, so effects can idle sensibly. */
  active: boolean
}

/** One sample of a scripted cursor path. `t` is seconds; x/y are 0 to 1. */
export type PointerKey = { t: number; x: number; y: number }

/**
 * One scripted press. `t` is seconds from the start of the loop; x/y are 0 to 1
 * across the element.
 *
 * A path can say where the cursor is at any moment, but a press is an instant
 * rather than a position, so it needs its own list. An effect that answers to
 * clicks reads this alongside whatever real presses it has seen, which is what
 * lets the recorder produce a take with clicks in it without anything having
 * been clicked.
 */
export type PressKey = { t: number; x: number; y: number }

export type Scroll = {
  /**
   * How far the host has travelled through the viewport. 0 when its top edge is
   * level with the bottom of the viewport, 1 when its bottom edge is level with
   * the top. Outside that range the element is off screen.
   */
  progress: number
  /**
   * Signed rate of change of `progress`, in units per second, already smoothed.
   * Negative is scrolling back up.
   *
   * This is the interesting one. Position tells an effect where it is; velocity
   * tells it how hard it was thrown, which is what anything physical has to know.
   */
  velocity: number
  /** False until the page has actually been scrolled. */
  active: boolean
}

/** One sample of a scripted scroll path. `t` is seconds; progress is 0 to 1. */
export type ScrollKey = { t: number; progress: number }

export type SurfaceContext = {
  /** The element the effect was mounted into. */
  host: HTMLElement
  /**
   * The generated canvas, or null for a `kind: 'dom'` effect. A text treatment
   * has nothing to draw into and should not be handed a canvas it will not use.
   */
  canvas: HTMLCanvasElement | null
  size: Size
}

/**
 * The per-effect half. `setup` runs on mount and again after the GPU hands the
 * context back, so it must be safe to call more than once.
 */
export interface Surface<O> {
  setup(ctx: SurfaceContext): void
  resize(size: Size): void
  /**
   * Draw one frame. `t` is absolute seconds from the start of the loop.
   *
   * Must be pure in `t`. Do not integrate against the previous frame, or the
   * recorder cannot produce a clean loop and `renderAtTime` breaks.
   */
  render(t: number, opts: O, pointer: Pointer, scroll: Scroll): void
  teardown(): void
  /** Return the GL context if there is one, so the host can release it. */
  context?(): WebGLRenderingContext | WebGL2RenderingContext | null
}

export type BaseOptions = {
  /**
   * Scripted cursor path. When set, the live pointer is ignored and the pointer
   * is sampled from this path at the current time, which is what makes
   * pointer-driven effects deterministic for the recorder.
   */
  pointerPath?: PointerKey[]
  /** Seconds the scripted path takes to run once before repeating. */
  pointerPathDuration?: number
  /**
   * Scripted presses, for effects that answer to a click. Each is a time and a
   * point, and an effect treats them exactly as it treats a real press that
   * happened at that moment, so a recorded take and a live page agree.
   *
   * Unlike `pointerPath`, this does not replace the live input: a scripted press
   * and a real one are the same kind of event, and an effect that ignored the
   * cursor while a script was running would be dead on the page.
   */
  pressPath?: PressKey[]
  /**
   * Scripted scroll path. When set, the real scroll position is ignored and both
   * progress and velocity are read from this path at the current time.
   *
   * Velocity is the slope of the segment rather than a difference against the
   * last frame, so it is a function of `t` alone. That is the whole point: an
   * effect driven by a real scrollbar cannot be replayed, and the recorder needs
   * frame 90 to look the same every time it asks for it.
   */
  scrollPath?: ScrollKey[]
  /** Seconds the scripted scroll path takes to run once before repeating. */
  scrollPathDuration?: number
  /** Frame shown when the user prefers reduced motion. Pick one that composes. */
  reducedMotionTime?: number
  /** Cap on device pixel ratio. Above 2 the cost is real and the gain is not. */
  maxDpr?: number
  /** Set false to opt out of pausing when scrolled offscreen. */
  pauseWhenOffscreen?: boolean
  /**
   * Where the pointer is read from.
   *
   * `element` fires only while the cursor is over the host and reports 0 to 1.
   * `window` follows the cursor everywhere and reports element-relative
   * coordinates that go outside 0 to 1, which is what an effect needs if it
   * reacts to a cursor that has not arrived yet.
   */
  pointerScope?: 'element' | 'window'
}

export type MountConfig<O> = {
  /** Merged over on every `update()`. */
  defaults: O
  create(): Surface<O>
  /**
   * `canvas` generates a canvas filling the host and watches it for context
   * loss. `dom` generates nothing and hands the host element straight to the
   * surface, which is what a text or layout effect wants.
   */
  kind?: 'canvas' | 'dom'
  /** Extra classes for the generated canvas. Ignored when kind is 'dom'. */
  canvasClass?: string
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Linear sample of a scripted path, wrapping at `duration` so it loops. */
export const samplePointerPath = (keys: PointerKey[], t: number, duration: number): Pointer => {
  if (keys.length === 0) return { x: 0.5, y: 0.5, active: false }
  const first = keys[0]!
  if (keys.length === 1) return { x: first.x, y: first.y, active: true }

  const span = duration > 0 ? duration : keys[keys.length - 1]!.t
  const local = span > 0 ? ((t % span) + span) % span : 0

  let a = first
  let b = keys[keys.length - 1]!
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i]!
    const hi = keys[i + 1]!
    if (local >= lo.t && local <= hi.t) {
      a = lo
      b = hi
      break
    }
  }

  const gap = b.t - a.t
  const k = gap > 0 ? clamp01((local - a.t) / gap) : 0
  // Smoothstep between keys: a linear cursor reads as a machine, which is what
  // it is, but it looks wrong next to eased motion.
  const e = k * k * (3 - 2 * k)
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, active: true }
}

/**
 * Linear sample of a scripted scroll path, wrapping at `duration` so it loops.
 *
 * Velocity comes out of the same smoothstep by differentiating it rather than by
 * comparing against the previous frame, which is what keeps the whole thing a
 * function of `t`. The derivative of the smoothstep is 6k(1-k), so velocity is
 * zero at each key and peaks halfway between: the scroll eases in and out of
 * every stop by construction.
 */
export const sampleScrollPath = (keys: ScrollKey[], t: number, duration: number): Scroll => {
  if (keys.length === 0) return { progress: 0, velocity: 0, active: false }
  const first = keys[0]!
  if (keys.length === 1) return { progress: first.progress, velocity: 0, active: true }

  const span = duration > 0 ? duration : keys[keys.length - 1]!.t
  const local = span > 0 ? ((t % span) + span) % span : 0

  let a = first
  let b = keys[keys.length - 1]!
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i]!
    const hi = keys[i + 1]!
    if (local >= lo.t && local <= hi.t) {
      a = lo
      b = hi
      break
    }
  }

  const gap = b.t - a.t
  const k = gap > 0 ? clamp01((local - a.t) / gap) : 0
  const e = k * k * (3 - 2 * k)
  const delta = b.progress - a.progress
  return {
    progress: a.progress + delta * e,
    velocity: gap > 0 ? (delta * 6 * k * (1 - k)) / gap : 0,
    active: true
  }
}

export function mount<O extends BaseOptions>(
  el: HTMLElement,
  userOpts: Partial<O> | undefined,
  config: MountConfig<O>
): EffectHandle {
  /*
   * `auto` in a colour option means take it from the page. Resolved here, at
   * the one point that has both the host element and the merged options, so no
   * item has to reach into the DOM from inside its own render loop.
   */
  let opts: O = resolveAutoGrounds(el, { ...config.defaults, ...(userOpts ?? {}) })

  const kind = config.kind ?? 'canvas'

  let canvas: HTMLCanvasElement | null = null
  if (kind === 'canvas') {
    canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    /*
     * Hidden until the first frame is in it.
     *
     * A WebGL canvas with `alpha: false` starts opaque black, and it is in the
     * document from the moment it is created, so between that and the first
     * draw the browser has a black rectangle to paint. On a warm cache that is
     * one frame and it reads as a flash; on a cold one the gap is longer.
     *
     * visibility rather than display, because display: none gives the element
     * no size and the first measure would come back zero.
     */
    canvas.style.visibility = 'hidden'
    if (config.canvasClass) canvas.className = config.canvasClass
    el.appendChild(canvas)
  }

  let surface: Surface<O> | null = null
  let size: Size = measure()
  let raf = 0
  let running = false
  let destroyed = false
  let contextLost = false

  // Wall-clock is accumulated rather than read, so stopping and starting does not
  // jump the animation and the loop stays reproducible.
  let elapsed = 0
  let lastStamp = 0

  const pointer: Pointer = { x: 0.5, y: 0.5, active: false }
  const scroll: Scroll = { progress: 0, velocity: 0, active: false }

  /*
   * Scroll is sampled once per frame, in the loop, rather than on the scroll
   * event.
   *
   * The event is the obvious place and it is the wrong one. Measured on a real
   * wheel scroll, scroll events arrive at about 6Hz while the effect renders at
   * 60, so a value taken on the event is reused for up to five frames running
   * and the effect moves in visible steps. Decaying it between events does not
   * fix that; it just turns the steps into a sawtooth.
   *
   * Reading the rect every frame costs about 20 microseconds, measured, which
   * is a tenth of a percent of a frame. It is a read with no write in front of
   * it, so it forces no layout.
   *
   * This is the one piece of state in the runtime that is not a function of
   * `t`, which is why `scrollPath` exists to replace it wholesale for the
   * recorder.
   */
  let scrollStarted = false
  let scrollSeeded = false

  /*
   * Half-life of the velocity smoothing. A per-frame difference is noisy enough
   * that handing it straight to a shader looks like chatter, and frame times
   * are not uniform. 70ms is short enough to feel attached to the input and
   * long enough to hide that jitter.
   */
  const VELOCITY_HALF_LIFE = 0.07

  function sampleScroll(dt: number) {
    const rect = el.getBoundingClientRect()
    const viewport = window.innerHeight || 1
    /*
     * 0 when the top edge is level with the bottom of the viewport, 1 when the
     * bottom edge is level with the top. Measured against the element's own
     * height plus the viewport, so a tall hero and a short strip both travel
     * the full range, which is what makes the number worth handing to an
     * effect at all.
     */
    const span = viewport + rect.height
    const next = span > 0 ? clamp01((viewport - rect.top) / span) : 0

    if (!scrollSeeded) {
      // Nothing to difference against on the first frame, and seeding it with a
      // zero gap would read as an infinite velocity.
      scroll.progress = next
      scrollSeeded = true
      return
    }

    if (dt > 0) {
      const instant = (next - scroll.progress) / dt
      const k = 1 - Math.pow(0.5, dt / VELOCITY_HALF_LIFE)
      scroll.velocity += (instant - scroll.velocity) * k
      if (Math.abs(scroll.velocity) < 1e-4) scroll.velocity = 0
    }

    if (next !== scroll.progress) scrollStarted = true
    scroll.progress = next
    scroll.active = scrollStarted
  }

  const motionQuery =
    typeof matchMedia === 'function' ? matchMedia(REDUCED_MOTION_QUERY) : null
  let reduced = motionQuery?.matches ?? false

  function measure(): Size {
    const rect = el.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    const cap = opts.maxDpr ?? 2
    const dpr = Math.min(window.devicePixelRatio || 1, cap)
    return {
      width,
      height,
      pixelWidth: Math.max(1, Math.round(width * dpr)),
      pixelHeight: Math.max(1, Math.round(height * dpr)),
      dpr
    }
  }

  function applySize() {
    size = measure()
    if (canvas) {
      if (canvas.width !== size.pixelWidth) canvas.width = size.pixelWidth
      if (canvas.height !== size.pixelHeight) canvas.height = size.pixelHeight
    }
    surface?.resize(size)
  }

  function pointerAt(t: number): Pointer {
    const path = opts.pointerPath
    if (path && path.length > 0) {
      return samplePointerPath(path, t, opts.pointerPathDuration ?? 0)
    }
    return pointer
  }

  function scrollAt(t: number): Scroll {
    const path = opts.scrollPath
    if (path && path.length > 0) {
      return sampleScrollPath(path, t, opts.scrollPathDuration ?? 0)
    }
    return scroll
  }

  function draw(t: number) {
    if (!surface || contextLost) return
    surface.render(t, opts, pointerAt(t), scrollAt(t))
    // There is something in the canvas now, so it can be shown. Cheap: a style
    // write that is already the current value does not invalidate anything.
    if (canvas && canvas.style.visibility === 'hidden') canvas.style.visibility = ''
  }

  function tick(stamp: number) {
    if (!running) return
    const dt = Math.min(stamp - lastStamp, 100) / 1000 // clamp tab-switch spikes
    elapsed += dt
    lastStamp = stamp
    sampleScroll(dt)
    draw(elapsed)
    raf = requestAnimationFrame(tick)
  }

  function ensureSurface() {
    if (surface || destroyed) return
    surface = config.create()
    surface.setup({ host: el, canvas, size })
    surface.resize(size)
  }

  function start() {
    if (destroyed || running || contextLost) return
    ensureSurface()
    if (reduced) {
      // WCAG 2.3.3: no loop at all. Still show a composed frame rather than a
      // blank panel. See reducedMotionTime.
      draw(opts.reducedMotionTime ?? 0)
      return
    }
    running = true
    lastStamp = performance.now()
    raf = requestAnimationFrame(tick)
  }

  function stop() {
    running = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    /*
     * Velocity is sampled in the loop, so a paused effect would otherwise keep
     * whatever it was last handed. Resuming after being scrolled past would
     * then show one frame of a flick that happened seconds ago.
     */
    scroll.velocity = 0
  }

  // --- context loss ------------------------------------------------------
  // Chromium hands a lost context back when an active one is released, so this
  // path fires in ordinary use, not only on a GPU crash.

  const onLost = (event: Event) => {
    event.preventDefault() // without this the context is not recoverable
    contextLost = true
    stop()
    surface?.teardown()
    surface = null
  }

  const onRestored = () => {
    contextLost = false
    if (destroyed) return
    ensureSurface()
    applySize()
    if (visible) start()
  }

  // Only a canvas can lose a GL context. A DOM effect has nothing to listen for.
  canvas?.addEventListener('webglcontextlost', onLost as EventListener, false)
  canvas?.addEventListener('webglcontextrestored', onRestored, false)

  // --- pointer -----------------------------------------------------------

  const windowScope = opts.pointerScope === 'window'

  const onPointerMove = (event: PointerEvent) => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    // Window scope reports unclamped coordinates on purpose. An effect that
    // reaches past its own edge has to know how far past, and clamping would
    // pin it to the border instead.
    pointer.x = windowScope ? x : clamp01(x)
    pointer.y = windowScope ? y : clamp01(y)
    pointer.active = true
  }

  const onPointerLeave = () => {
    pointer.active = false
  }

  const pointerTarget: EventTarget = windowScope ? window : el
  pointerTarget.addEventListener('pointermove', onPointerMove as EventListener)
  // Only element scope has a leave: the window one is never left.
  if (!windowScope) el.addEventListener('pointerleave', onPointerLeave)

  // --- scroll ------------------------------------------------------------

  /*
   * No scroll listener. The position is read in the frame loop above, which is
   * both smoother and one fewer thing to remove on teardown. An effect that is
   * not running does not need a scroll position, because nothing is drawing it.
   */

  // --- visibility and viewport -------------------------------------------

  let visible = true
  let wantedByUser = false

  const resizeObserver = new ResizeObserver(() => {
    if (destroyed) return
    applySize()
    /*
     * Always redraw, not only when stopped.
     *
     * Assigning canvas.width or canvas.height resets the drawing buffer, and a
     * WebGL buffer resets to opaque black. Leaving that for the next animation
     * frame means one black frame every time the element changes size, and
     * since the observer fires once on its first observation, that was a black
     * flash on every mount: the canvas showed its first drawn frame, the
     * observer cleared it, and the page painted the hole before the next tick
     * filled it.
     */
    draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed)
  })
  resizeObserver.observe(el)

  const intersectionObserver =
    opts.pauseWhenOffscreen === false
      ? null
      : new IntersectionObserver(
          entries => {
            const entry = entries[entries.length - 1]
            if (!entry) return
            visible = entry.isIntersecting
            if (visible) {
              if (wantedByUser) start()
            } else {
              stop()
            }
          },
          { threshold: 0 }
        )
  /*
   * The gate watches the element's parent, not the element.
   *
   * Watching the element deadlocks any effect that clips or moves its own host.
   * A reveal starts with its host clipped to nothing, the observer reports that
   * as not intersecting, the runtime stops the loop, and the clip therefore
   * never advances off the host: blank for ever, with the replay button unable
   * to escape it because `visible` can never become true again. The gate's
   * input must not be geometry the effect controls.
   *
   * The parent is laid out by the page rather than by the effect, so it breaks
   * the cycle. It is usually a little larger, which means an effect can start a
   * frame or two before it is strictly on screen. That is the cheaper mistake.
   */
  intersectionObserver?.observe(el.parentElement ?? el)

  const onVisibilityChange = () => {
    if (document.hidden) stop()
    else if (wantedByUser && visible) start()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  // Live listener, not a one-time read, so toggling the OS setting mid-session
  // takes effect without a reload.
  const onMotionChange = (event: MediaQueryListEvent) => {
    reduced = event.matches
    if (reduced) {
      stop()
      ensureSurface()
      draw(opts.reducedMotionTime ?? 0)
    } else if (wantedByUser && visible) {
      start()
    }
  }
  motionQuery?.addEventListener('change', onMotionChange)

  // --- handle ------------------------------------------------------------

  const handle: EffectHandle = {
    start() {
      wantedByUser = true
      if (visible && !document.hidden) start()
    },
    stop() {
      wantedByUser = false
      stop()
    },
    update(next) {
      opts = resolveAutoGrounds(el, { ...opts, ...(next as Partial<O>) })
      applySize()
      if (!running) draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed)
    },
    renderAtTime(t) {
      if (destroyed) return
      ensureSurface()
      elapsed = t
      draw(t)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      stop()

      motionQuery?.removeEventListener('change', onMotionChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      intersectionObserver?.disconnect()
      resizeObserver.disconnect()
      pointerTarget.removeEventListener('pointermove', onPointerMove as EventListener)
      el.removeEventListener('pointerleave', onPointerLeave)
      canvas?.removeEventListener('webglcontextlost', onLost as EventListener)
      canvas?.removeEventListener('webglcontextrestored', onRestored)

      const gl = surface?.context?.() ?? null
      surface?.teardown()
      surface = null

      // Hand the context back now rather than waiting for GC. The browser budget
      // is 16 contexts or 16M pixels, whichever comes first, and a page that
      // navigates between demos will hit it otherwise.
      gl?.getExtension('WEBGL_lose_context')?.loseContext()

      canvas?.remove()
    }
  }

  return handle
}
```

**`src/beamish/shared/ground.ts`**

```ts
/*
 * What is actually behind this effect, and what to paint on it.
 *
 * Items that paint their own ground used to default it to #fbfaf4, the warm
 * paper the site happened to be. That one default is most of what made the
 * library a paper library: an effect dropped onto a dark page painted a cream
 * rectangle over it and looked broken, so in practice it only worked on one
 * kind of page, whatever its metadata said.
 *
 * Two words fix that, and they are deliberately the two CSS already has.
 *
 * `auto` is the page's own background. The item adopts whatever it has been
 * put on, which is what people expected a default to do.
 *
 * `light-dark(a, b)` is a colour chosen by the ground it will sit on, spelled
 * the way the CSS function of the same name spells it. This is for the marks
 * rather than the ground, and it exists because deriving them does not work:
 * taking the mark colour from the page's text gave pure black on paper, which
 * this library does not use as ink, and still left the marks invisible on
 * black. A mark colour is a design decision for each ground, so the item makes
 * both decisions and the page picks.
 *
 * Neither costs anything to adopt. On a paper page `auto` resolves to
 * rgb(251, 250, 244), which is #fbfaf4 to the byte, and `light-dark()` returns
 * its first value, so an item keeps exactly the rendering it had and no
 * recorded take is invalidated.
 */

/** The first real background painted at or above `el`, as `rgb(r, g, b)`. */
export function pageGround(el: HTMLElement): string {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const colour = getComputedStyle(node).backgroundColor
    if (isPainted(colour)) return colour
  }

  /*
   * Nothing in the chain paints. The root still has a used value even when no
   * stylesheet sets one, and it is what the viewport is actually showing.
   */
  const root = getComputedStyle(document.documentElement).backgroundColor
  if (isPainted(root)) return root

  const body = document.body && getComputedStyle(document.body).backgroundColor
  if (body && isPainted(body)) return body

  // A page that paints nothing is a white page, which is what the browser draws.
  return 'rgb(255, 255, 255)'
}

/**
 * An option that may be a colour or the string `auto`.
 *
 * Anything that is not `auto` is handed back untouched, so passing a colour
 * still wins and nothing has to know whether the default was taken.
 */
export function resolveGround(el: HTMLElement, value: string): string {
  return value.trim().toLowerCase() === 'auto' ? pageGround(el) : value
}

/** Whether a ground is dark enough to want light marks on it. */
export function isDarkGround(colour: string): boolean {
  return relativeLuminance(colour) < 0.5
}

/**
 * Resolve the ground-dependent options against the page, once, at mount.
 *
 * Done here rather than in each item because there is nothing item-specific
 * about it. Fifteen effects paint a ground and each reads its option in its
 * own shape, as a uniform, a THREE.Color, a cached vector or a scene
 * background, so patching them one at a time would be fifteen chances to put
 * a getComputedStyle inside a render loop. The runtime already holds the host
 * element and already merges the options, so it is the one place that knows
 * both.
 *
 * It runs on update too, which is what makes a ground change at runtime work:
 * re-pass the option and the item picks up the new page.
 */
export function resolveAutoGrounds<O extends object>(el: HTMLElement, opts: O): O {
  let ground: string | null = null
  let next: Record<string, unknown> | null = null

  // Read the page at most once, however many options end up asking for it.
  const page = () => (ground ??= pageGround(el))
  const write = (key: string, value: string) => {
    next ??= { ...(opts as Record<string, unknown>) }
    next[key] = value
  }

  for (const [key, value] of Object.entries(opts)) {
    if (typeof value !== 'string') continue
    const text = value.trim()
    const word = text.toLowerCase()

    if (word === 'auto') {
      write(key, page())
      continue
    }

    if (word.startsWith('light-dark(')) {
      const pair = splitPair(text)
      if (pair) write(key, isDarkGround(page()) ? pair[1] : pair[0])
    }
  }

  return (next ?? opts) as O
}

/*
 * The two arguments of light-dark(...), split on the comma that is not inside
 * a nested function, so rgb(0, 0, 0) survives being an argument.
 */
function splitPair(text: string): [string, string] | null {
  const open = text.indexOf('(')
  const close = text.lastIndexOf(')')
  if (open < 0 || close < open) return null

  const inner = text.slice(open + 1, close)
  let depth = 0
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (ch === ',' && depth === 0) {
      return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()]
    }
  }
  return null
}

/*
 * Transparent is not a colour the effect can paint with, and neither is a
 * fully transparent rgba, which is what every element that sets no background
 * computes to. Both mean "keep looking up the tree".
 */
function isPainted(colour: string): boolean {
  if (!colour || colour === 'transparent') return false
  const parts = colour.match(/[\d.]+/g)
  if (!parts) return false
  // rgba(...) with a fourth component of 0.
  return !(parts.length >= 4 && Number(parts[3]) === 0)
}

/** WCAG relative luminance, 0 to 1, from a hex or rgb() string. */
function relativeLuminance(colour: string): number {
  const [r, g, b] = toRgb(colour)
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function toRgb(colour: string): [number, number, number] {
  const text = colour.trim()
  if (text.startsWith('#')) {
    const hex =
      text.length === 4
        ? text[1]! + text[1]! + text[2]! + text[2]! + text[3]! + text[3]!
        : text.slice(1, 7)
    const n = Number.parseInt(hex, 16)
    return Number.isNaN(n) ? [255, 255, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const parts = text.match(/[\d.]+/g)
  if (!parts || parts.length < 3) return [255, 255, 255]
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])]
}
```

## 2. What it is

LightningVein is a discharge branching across a dark sky. A strike arrives,
throws a few limbs, burns for a fraction of a second and leaves the channel
glowing faintly behind it. Then nothing happens for several seconds.

Three things carry it, and the first is what separates this from a jagged line
with a glow on it.

**The path is built by recursive displacement.** Start with one segment, push
its midpoint sideways, then do the same to both halves with half the push, and
again. That gives kinks at every scale: a lean across the whole strike, bends
within the lean, and a tremble on the short runs. A wobble applied per step has
detail at one scale only, which is why it reads as a scribble rather than as
electricity finding its way down.

**The push is along the segment normal, not along x.** Pushing along x gives a
bolt that is ragged left and right wherever it is pointing, which reads as a
flag. Along the normal, the kinks stay perpendicular to the run of the channel.

**The flicker is bounded, and that is a requirement rather than a preference.**
Real lightning flickers many times a second. WCAG 2.3.1 is Level A and wants
nothing flashing more than three times a second, so this does not imitate one:
a strike brightens at most twice, and the next strike is a whole `period` away.
At the default that is two brightenings in nine seconds. It still reads as
lightning, because the shape is doing the work rather than the strobing.

## 3. Wire it in

**Plain HTML.** The element needs a size in CSS; the canvas fills it.

```html
<div id="sky" style="width: 100%; height: 100vh"></div>

<script type="module">
  import { createLightningVein } from './beamish/effects/lightning-vein/core.js'

  const sky = createLightningVein(document.querySelector('#sky'))
  sky.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createLightningVein } from '@/beamish/effects/lightning-vein/core'

export function Storm() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sky = createLightningVein(host.current, { period: 14 })
    sky.start()
    return () => sky.destroy()
  }, [])

  return <div ref={host} style={{ height: '100vh' }} />
}
```

**Vue.** Same shape: mount on a sized element in `onMounted`, `destroy()` in
`onBeforeUnmount`.

**Astro.** Nothing extra. The core is a standard ES module with no dependencies.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `sky` | color | `auto` | any CSS hex | The sky behind it. `auto` takes it from the page, which is almost always right: the strike should sit in your page rather than bring its own rectangle of night. |
| `bolt` | color | `#eaf2ff` | any CSS hex | The channel itself. Near white with a little blue in it reads as hot; pure white reads as a drawn line. |
| `halo` | color | `#5d7fd4` | any CSS hex | The glow around the channel. Cooler and dimmer than the bolt, because air lit from the side scatters blue. |
| `period` | number | `9` | 3 to 60 s | Seconds from one strike to the next. Exactly periodic over this, and the lower bound is held well above anything WCAG 2.3.1 would count. |
| `lean` | number | `0.22` | 0 to 0.8 | How far the strike wanders off vertical overall, as a share of the width. At 0 it falls straight down and looks drawn. |
| `jitter` | number | `0.16` | 0.02 to 0.5 | The first displacement, as a share of the width. Every pass after it is half the one before, so this sets the character of the whole path. |
| `detail` | number | `6` | 3 to 8 | How many times the path is subdivided. Six is sixty-four segments. Above seven the extra kinks are smaller than a pixel and cost without showing. |
| `branches` | number | `5` | 0 to 14 | Limbs thrown off the main channel. At 0 it is a single stroke, which reads as a crack rather than a discharge. |
| `weight` | number | `2.2` | 0.6 to 6 px | Width of the main channel. The glow is drawn from this, so raising it thickens everything rather than only the core. |
| `afterglow` | number | `1.4` | 0 to 4 s | How long the channel stays faintly lit once the flash is over. This is most of what makes it read as a discharge rather than as a line that was switched off. |
| `seed` | number | `11` | 0 to 9999 | Changes every bolt in the sequence without changing anything else about them. |

## 5. Nothing is random at render time

The strike index comes from `t` by division, the bolt is built from a generator
seeded on that index, and the same `t` always gives the same bolt down to the
last branch.

That is not tidiness. An effect that calls `Math.random()` while drawing cannot
be recorded, because the recorder seeks to a time and expects the frame that
belongs there; it drifts on a dropped frame, because each frame depends on the
last; and it can never close a loop. Seeking backwards here costs exactly as
much as seeking forwards, which is nothing.

## 6. It is for a dark ground

`ground: dark` is a statement about the design rather than a warning. A
discharge is light. On a pale page there is nothing for it to be brighter than,
the halo turns to grey smudge, and the afterglow does not read at all.

`sky` defaults to `auto`, which takes the background from the page, so dropping
this into a dark page needs no configuration. If you need it on a light page,
give the section its own dark band rather than trying to tune the colours.

## 7. Tuning it

The two that matter are `period` and `afterglow`.

`period` is how often it strikes, and the honest answer is almost always longer
than feels right while you are building it. You are watching the backdrop; your
reader is not. At three seconds it is a lightning machine, at nine it is
weather, at twenty-five it is a storm somewhere else.

`afterglow` is most of what makes it read as a discharge rather than a line
that was switched off. The channel stays faintly lit because the air is still
hot, and taking that to zero is the single fastest way to make this look cheap.

`jitter` sets the character of the path: the first push is this, and every pass
after it is half the one before, so changing it changes the whole shape rather
than only the fine detail. `detail` above seven adds kinks smaller than a pixel.

## 8. Cleanup and SSR

`destroy()` drops the context and the built path and removes the canvas. There
is nothing to release beyond that: no textures, no buffers, no listeners.

Nothing touches `window` or `document` at import time, so the module is safe to
import on a server. It only does anything when you call the factory.

## 9. Pausing and reduced motion

Handled by the runtime. `stop()` leaves the sky on whatever frame it was
showing, which for most of the cycle is an empty one.

Handled in the runtime. Under reduced motion the loop never starts and one
frame is drawn, at `reducedMotionTime`, which defaults to just after a strike
begins so the still is a lit bolt rather than an empty sky.

That default matters more here than on most items. Pick a time between strikes
and somebody with reduced motion gets a blank rectangle and no idea what the
item was.

## 10. The three mistakes most likely to be made here

1. **Imitating the real flicker rate.** Lightning strobes; this deliberately
   does not. Raising the flash count or dropping `period` below about three
   seconds walks into WCAG 2.3.1, which is Level A.

2. **Random at render time.** It cannot be recorded, it drifts on a dropped
   frame, and it never closes a loop. The strike index comes from `t`.

3. **Displacing along x.** A bolt that is only ragged left and right reads as a
   flag rather than as a discharge.

4. **No afterglow.** The channel going straight to black turns a discharge into
   a line that was switched off.

5. **Putting it on paper.** It is built for a dark ground and says so.

6. **Using `shadowBlur` for the glow.** On a path of a thousand points it is
   the slowest thing a canvas can be asked to do. Three strokes of increasing
   width give a falloff nobody can tell apart.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
