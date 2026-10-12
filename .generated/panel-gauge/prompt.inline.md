You are adding **PanelGauge** from Beamish to this project.

> A moving-coil gauge with a scale that lights to the reading and a needle that is never quite still. Surfaces · effect · MIT.
> https://beamish.ink/effects/panel-gauge

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The scale is not symmetrical about the top. A panel meter sweeps about 250 degrees from the lower left, because that is where the stops are, and the dead sector at the bottom is where the movement lives. A scale that starts at twelve o'clock and runs clockwise is a progress ring
- Majors and minors are not the same tick. The minors between two majors are what make the eye read a position as a value rather than as an angle, and the ticks below the reading are lit while the ones above are not, which is how a scale carries the value as well as the needle does
- The reading hunts. A real one moves by a fraction of a division because what is being measured is not still either, and a needle frozen at exactly 0.62 reads as a picture of a gauge. Two sines of different periods, so it does not tick like a metronome, and both complete whole turns in a period so the needle comes home
- There is no overshoot, and that is a loss taken deliberately. A moving coil arrives at a reading by passing it, which is the most characterful thing a needle does, but it is a response to a change and therefore state between frames. The first version drove a closed-form damped oscillator from t: the needle swept up from zero and settled, which reads beautifully and does not loop, because frame zero was at the bottom of the scale and the last frame was at the reading
- 2D rather than WebGL. An instrument is something you want four of on a page, and the budget is one WebGL context
- Built for a dark ground and declared as one. The face is painted, so the item supplies its own ground and only the area outside the dial shows the page
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/panel-gauge/core.ts`**

```ts
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
     * Its own compositor layer, so the page cannot resample it.
     *
     * A canvas whose box lands on a half pixel has to be resampled to the
     * device grid, and which way it snaps is the compositor's business rather
     * than ours. Snapping one way on one frame and the other way on the next
     * moves the whole picture by a pixel, which is a flicker between two
     * positions that leaves no trace anywhere: the drawing buffer is perfect,
     * the clock is smooth, the box never changes and every number comes back
     * clean. It was reported on a canvas sitting at x = 683.5, and the same
     * effect at x = 123.5 on another machine was steady.
     *
     * translateZ(0) rather than will-change, because will-change is a hint
     * the browser is free to drop and this needs to be a promise. The cost is
     * one layer per live effect, and there is only ever one.
     */
    canvas.style.transform = 'translateZ(0)'
    canvas.style.backfaceVisibility = 'hidden'
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
    /*
     * Clamped at both ends.
     *
     * The top end is the tab-switch spike this always guarded against. The
     * bottom end is that a rAF timestamp is the moment the frame began, which
     * can be EARLIER than the performance.now() start() took a moment before:
     * the subtraction is then negative, Math.min keeps it, and the effect's
     * clock runs backwards. Measured on WindField, elapsed began at -0.1088
     * and four frames were rendered at a negative t before it climbed past
     * zero. A shader handed a smaller t than last frame draws an earlier
     * picture, which is a visible jump backwards on every start, and start
     * runs again every time the panel scrolls into view or the tab is
     * returned to.
     */
    const dt = Math.min(Math.max(stamp - lastStamp, 0), 100) / 1000
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

## 2. What it is

PanelGauge is a moving-coil gauge: a painted dial face, a scale that lights up
to the reading, and a needle that is never quite still.

## 3. Wire it in

**Plain HTML.** The dial fills the shorter side, so a square host gives a full
one.

```html
<div id="load" style="width: 220px; height: 220px"></div>

<script type="module">
  import { createPanelGauge } from './beamish/effects/panel-gauge/core.js'

  const gauge = createPanelGauge(document.querySelector('#load'), { value: 0.62 })
  gauge.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createPanelGauge } from '@/beamish/effects/panel-gauge/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

export function Load({ value }: { value: number }) {
  const host = useRef<HTMLDivElement>(null)
  const gauge = useRef<EffectHandle | null>(null)

  useEffect(() => {
    if (!host.current) return
    const made = createPanelGauge(host.current, { value })
    gauge.current = made
    made.start()
    return () => made.destroy()
  }, [])

  // The reading changes without remounting.
  useEffect(() => gauge.current?.update({ value }), [value])

  return <div ref={host} className="size-56" />
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { createPanelGauge } from '@/beamish/effects/panel-gauge/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const props = defineProps<{ value: number }>()
const host = ref<HTMLElement | null>(null)
let gauge: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  gauge = createPanelGauge(host.value, { value: props.value })
  gauge.start()
})

watch(() => props.value, value => gauge?.update({ value }))
onBeforeUnmount(() => gauge?.destroy())
</script>

<template>
  <div ref="host" class="gauge" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `face` | color | `#15171b` | any CSS hex | The dial face. Painted rather than left transparent, because a gauge is a thing with a face on it and the alternative is ticks floating on your page. |
| `ink` | color | `#8b9199` | any CSS hex | Unlit ticks and the boss at the centre. Grey rather than white: the unlit half of the scale is there to be read past, not read. |
| `needle` | color | `#ff9426` | any CSS hex | The pointer. The one thing on the dial that should be found without looking, so it wants to be the only saturated colour in the frame apart from the lit arc it belongs to. |
| `lit` | color | `#ff9426` | any CSS hex | The arc and the ticks below the reading. Usually the needle's colour, because they are telling you the same thing; set them apart only if the arc is reporting something the needle is not. |
| `value` | number | `0.62` | 0 to 1 | Where the needle sits on the scale. Drive this through update() to make the gauge report something real; the hunt is applied on top of whatever you set. |
| `hunt` | number | `0.035` | 0 to 0.3 (looks right between 0.02 and 0.08) | How far the reading wanders either side, as a share of the scale. Small. At 0 the needle is frozen and the gauge stops reading as something connected to anything; past about 0.12 it is a fault rather than a reading. |
| `sweep` | number | `250` | 90 to 320 deg (looks right between 200 and 270) | Degrees of arc the scale covers, centred on twelve o'clock with the dead sector at the bottom. 250 is what a panel meter does, because that is where its stops are. At 320 there is nowhere for the movement to go and it reads as a ring. |
| `majors` | number | `6` | 2 to 16 | Major divisions, the ones a real dial numbers. Few: a scale you can count at a glance is the point of a dial, and past about ten you are reading a ruler. |
| `minors` | number | `4` | 0 to 10 | Minor divisions between each pair of majors. These are what let the eye read a needle between two numbers as a value. At 0 the dial can only say which division it is in. |
| `period` | number | `18` | 4 to 120 s (looks right between 12 and 40) | Seconds for one cycle of the hunt. Both sines complete whole turns in it, so the needle is in the same place at the start and the end. |
| `seed` | number | `3` | 0 to 9999 | Seed for the hunt's phase. Two gauges side by side want two seeds, or they wander in step and read as one instrument drawn twice. |

## 5. What makes it an instrument rather than a circle

Every dashboard has circles. Three things separate a gauge from a progress
ring, and all of them come from a real one being a coil, a spring and a
pointer.

**The scale is not symmetrical about the top.** A panel meter sweeps about 250
degrees from the lower left, because that is where its stops are, and the dead
sector at the bottom is where the movement lives. A scale that starts at twelve
o'clock and runs clockwise is a progress ring with ticks on it.

**Majors and minors are different ticks.** The minors between two majors are
what let the eye read a needle sitting between two numbers as a value. With
`minors: 0` the dial can only tell you which division you are in.

**The reading hunts.** A real one moves by a fraction of a division, because
what it is measuring is not still either. `hunt: 0` gives you a picture of a
gauge. Two sines of different periods, so it does not tick like a metronome.

## 6. The overshoot is not here

A moving coil arrives at a reading by passing it. It is the most characterful
thing a needle does and this item does not do it, which is worth being straight
about.

The reason is the contract. An overshoot is a response to a **change**, so it
has to know when the change happened, which is state between frames, and
`renderAtTime(t)` has to be pure in `t`. The first version drove a closed-form
damped oscillator from `t`: the needle swept up from zero and settled once at
the start. It reads beautifully and it does not loop, because frame zero was at
the bottom of the scale and the last frame was at the reading, so a recorded
take jumped once a cycle.

If you want it on a live page, animate `value` yourself and push it through
`update()`. Your component can hold state; this cannot.

## 7. Reporting something real

`value` is 0 to 1 of the scale and the hunt is applied on top of whatever you
set, so a gauge wired to live data still breathes between updates rather than
stepping. Map your own range onto 0 to 1 before you pass it; the dial has no
idea what it is measuring and should not.

## 8. It paints its own face

`face` is filled, so the item supplies its ground and only the corners outside
the dial show the page through. That is why it declares `ground: "dark"`: the
default face is near-black and the unlit ticks are tuned against it. On paper,
set `face` to the paper and `ink` to something that survives on it.

## 9. Two of them

Give them different `seed` values. The hunt is a function of the seed, so two
gauges with the same one wander in step and read as one instrument drawn twice.

## 10. Cleanup and SSR

`destroy()` cancels the RAF, disconnects both observers and removes every
listener. There is no GL context to release.

There is nothing to render on the server. The element is empty until the first
frame. Call `createPanelGauge` from `useEffect`, `onMounted`, or a `client:*`
island.

## 11. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`. A
still gauge at its reading is a complete image: the needle is where it should
be and the scale is lit to it. That is the correct outcome rather than a
compromise, because the reading is the information and the hunt is not.

## 12. The three mistakes most likely to be made here

1. **A scale starting at twelve o'clock.** That is a progress ring. The dead
   sector belongs at the bottom, where the movement is.

2. **`hunt: 0`.** A frozen needle reads as a picture of a gauge rather than an
   instrument attached to something.

3. **No minors.** The dial can then only say which division the needle is in,
   which is most of what a dial is for.

4. **Integrating the needle.** It cannot be seeked, so it cannot be recorded.
   Animate `value` in your own component instead.

5. **Too many majors.** Past about ten you are reading a ruler, and the thing a
   dial is good at is being read at a glance.

6. **Two gauges on one seed.** They hunt in step, which is immediately obvious
   and makes both look fake.

---

Concept credit: the lit scale and the live readings on the front panel in the Machine Front Panel Page, by Ray Velez, https://github.com/RayVelez27/instalanding.ai.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
