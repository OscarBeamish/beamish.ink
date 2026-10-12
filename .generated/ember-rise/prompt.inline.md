You are adding **EmberRise** from Beamish to this project.

> Embers lifting off the bottom edge of an element, cooling and slowing as they go, on a transparent canvas. Surfaces · effect · MIT.
> https://beamish.ink/effects/ember-rise

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- A fixed cast with staggered lives, not an array that grows and shrinks. Ember k is always ember k: its lane, its size, its sway and its place in the queue are hashes of k, and its age is fract(t / life + phase). Nothing is created or destroyed, and the frame at t is the same frame whenever you ask for it
- That is what makes it recordable. The page this came from pushes particles onto a list, advances each one against the last frame and splices out the dead, so there is no value of t you can ask it for and two machines disagree after a minute
- It also makes `count` exact. An emitter with a spawn rate gives you a number of embers that depends on the frame rate
- 2D rather than WebGL, deliberately. The budget is one live WebGL context per page and this is an effect you might want on three buttons at once. A couple of hundred small arcs cost almost nothing, and what makes embers look like embers is additive compositing rather than per-pixel work
- The canvas is cleared to transparent and never filled, so it composites over whatever is behind it. An ember effect that paints its own background is one you cannot put on top of a button
- `life` is snapped so a whole number of lives fits the period. Without it the cast is part way through a life when the loop comes round and the video jumps once a cycle
- Small embers go further and live longer in the air. That is the only depth cue in here, and without it the field reads as one object at one distance
- Built for a dark ground and declared as one. The compositing is additive, which on paper makes a hot ember brighter than white and a cool one invisible
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/ember-rise/core.ts`**

```ts
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

EmberRise is embers lifting off the bottom edge of an element, cooling and
slowing as they go. It was built for a control that is supposed to look hot, and
it is transparent, so it sits over whatever that control is.

It is a **fixed cast with staggered lives**, not an array of particles, and that
is the most important thing about it.

## 3. Wire it in

**Plain HTML.** Put it over the thing that should look hot. The host needs a
size and should not clip.

```html
<div class="cta-wrap" style="position: relative">
  <button class="cta">Light it</button>
  <div id="fire" style="position: absolute; inset: -40px 0 0; pointer-events: none"></div>
</div>

<script type="module">
  import { createEmberRise } from './beamish/effects/ember-rise/core.js'

  const fire = createEmberRise(document.querySelector('#fire'))
  fire.start()
</script>
```

`pointer-events: none` on the host, or the embers eat the click on the button
underneath them.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createEmberRise } from '@/beamish/effects/ember-rise/core'

export function HotButton() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const fire = createEmberRise(host.current, { count: 120, spread: 0.6 })
    fire.start()
    return () => fire.destroy()
  }, [])

  return (
    <div className="relative inline-block">
      <button className="cta">Light it</button>
      <div ref={host} className="pointer-events-none absolute -inset-y-10 inset-x-0" />
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createEmberRise } from '@/beamish/effects/ember-rise/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let fire: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  fire = createEmberRise(host.value)
  fire.start()
})

onBeforeUnmount(() => fire?.destroy())
</script>

<template>
  <div ref="host" class="fire" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `ember` | color | `#ffb257` | any CSS hex | The hot core of a new ember. Orange rather than yellow: a yellow ember on a dark ground reads as a spark from a grinder, which is a different and much more violent thing. |
| `cool` | color | `#8c2f17` | any CSS hex | What an ember has cooled to by the end of its life. Dark red, close to the ground, so an ember goes out rather than disappearing. Set it closer to the ember colour and the field stops having a direction in time. |
| `count` | number | `120` | 1 to 600 (looks right between 80 and 260) | How many embers are alive at once, exactly. Not a spawn rate: a fixed cast with staggered lives is what makes this seekable, and it also means the number you set is the number you get on any machine. This is the whole cost of the effect and it is linear. |
| `rise` | number | `0.95` | 0.1 to 2 (looks right between 0.6 and 1.2) | How far an ember travels in its life, as a share of the host's height. At 1 the longest-lived ones just reach the top, which is usually what you want: embers that stop in the middle of a tall box look like they hit something. |
| `life` | number | `4` | 0.4 to 20 s (looks right between 2 and 5) | Seconds an ember lives. Snapped at render time so a whole number of lives fits the period, because a cast part way through a life when the loop comes round is a video that jumps once a cycle. Short lives give a busy fire, long ones give a few sparks drifting. |
| `sway` | number | `16` | 0 to 80 px | How far an ember wanders sideways, one whole turn over its life. At 0 they go straight up, which reads as a machine rather than as air. Large values turn the rise into a wave and the embers start to look tethered. |
| `size` | number | `2.4` | 0.4 to 10 px (looks right between 1.5 and 4) | Radius of the largest ember. They are drawn with a halo at three times this, so the lit area is bigger than the number suggests. Past about 5 they stop being embers and become fireflies. |
| `spread` | number | `0.74` | 0 to 1 | How much of the width the embers lift off, centred. Below about 0.3 it is a plume from a single point; at 1 the whole bottom edge is alight, which suits a hero and is too much for a button. |
| `heat` | number | `1` | 0 to 2 | Overall brightness. The one control to reach for when the effect is right but loud: it scales alpha rather than count, so the fire thins out instead of thinning down. |
| `seed` | number | `5` | 0 to 9999 | Seed for the cast: lanes, sizes, sway and the order they go up in. The same seed gives the same embers, so two of these side by side want two seeds. |
| `period` | number | `16` | 2 to 120 s (looks right between 10 and 30) | Seconds for one cycle. It has to be a whole number of lives and the render rounds `life` to make it so, so this is the figure that actually decides both. Long enough that the repeat is not obvious; a fire that loops every four seconds is a fire you notice looping. |

## 5. Why not an array

The usual version pushes a few particles onto a list every frame, advances each
one against the last frame, and splices out the dead. That cannot be used here,
for the reason every integrating effect in this library was rewritten: an
ember's position depends on the frame before it, so there is no value of `t` you
can ask the effect for. It cannot be recorded, and two machines running the same
page disagree after a minute.

Here, ember k is always ember k. Its lane, its size, its sway and its place in
the queue are hashes of k, and its age is `fract(t / life + phase)`. Nothing is
created, nothing is destroyed, nothing is stored.

Two things fall out of that:

- **`count` is exact.** An emitter with a spawn rate gives you a number of
  embers that depends on the frame rate. This many is this many.
- **The loop closes.** `life` is snapped at render time so a whole number of
  lives fits the `period`, because a cast part way through a life when the loop
  comes round is a video that jumps once a cycle, forever.

## 6. No WebGL context

It draws in 2D, which is unusual in this library and deliberate. The budget is
one live WebGL context per page, and this is an effect you might reasonably want
on three buttons at once. A couple of hundred small arcs cost almost nothing,
and the thing that makes embers look like embers is **additive compositing**
rather than per-pixel work: two embers crossing have to be brighter than one.

The canvas is cleared to transparent and never filled. An ember effect that
paints its own background is one you cannot put on top of a button.

## 7. Three things that make it fire and not confetti

**They slow down.** An ember leaves fast and loses to the air, so the travel is
eased rather than linear. Constant speed is the clearest tell.

**They cool.** The colour runs from `ember` to `cool` over a life, because what
you are watching is something losing its heat. Set `cool` close to `ember` and
the field stops having a direction in time.

**The small ones go further.** That is the whole of the depth in this. Without
it the field reads as one object at one distance.

## 8. It needs a dark ground

The compositing is additive, so on paper a hot ember is brighter than white and
a cool one is invisible. It declares `ground: "dark"` for that reason, and
unlike most of the library there is no version of this that works on both: the
whole effect is light being added to something.

## 9. Sizing the host

Embers lift off the **bottom edge** of the host and travel up by `rise` times
its height. For a button, the host wants to extend above the button rather than
match it: `inset: -40px 0 0` is the shape that works, so the embers start at the
button's own baseline and have somewhere to go.

For a hero, mount it on the section and set `spread: 1`.

## 10. Two of them

Give them different `seed` values. The cast is a function of the seed, so two
with the same one are the same fire twice, and side by side that is obvious.

## 11. Cleanup and SSR

`destroy()` cancels the RAF, disconnects both observers and removes every
listener. There is no GL context to release, which is the point of the 2D
canvas, but call it anyway.

There is nothing to render on the server. The element is empty until the first
frame. Call `createEmberRise` from `useEffect`, `onMounted`, or a `client:*`
island.

## 12. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`. A
still frame of this is a scatter of sparks at every stage of cooling, which is a
complete image rather than an empty box, and 4 seconds into the default period
is a full one.

## 13. The three mistakes most likely to be made here

1. **An array of particles.** It cannot be seeked, so it cannot be recorded, and
   it drifts on a dropped frame.

2. **A host that clips.** `overflow: hidden` on the wrapper cuts the embers off
   at the top of the button, which looks like a bug rather than like a short
   fire.

3. **Forgetting `pointer-events: none`.** The canvas is over the control, so
   without it the control cannot be clicked.

4. **A life that does not divide the period.** The render snaps it, but if you
   are reading the numbers back out, `life` is not what you set unless
   `period / life` is already whole.

5. **Linear travel.** Embers that rise at a constant speed are confetti going
   the wrong way.

6. **One size.** The small ones have to go further, or there is no depth in it
   at all.

---

Concept credit: embers lifting off a control, from the Fire Button page. The engine here is a fixed cast with staggered lives rather than a list that grows and shrinks, because a list cannot be seeked, by Ray Velez, https://github.com/RayVelez27/instalanding.ai.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
