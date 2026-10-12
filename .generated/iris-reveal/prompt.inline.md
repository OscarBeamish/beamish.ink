You are adding **IrisReveal** from Beamish to this project.

> A camera iris opening on whatever is behind it, with as many sides as it has blades and a swing as it goes. Reveals · effect · MIT.
> https://beamish.ink/effects/iris-reveal

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- An iris is not a circle growing. A diaphragm is a ring of overlapping blades and the hole they leave is a polygon with as many sides as there are blades: five give a pentagon, nine give something close to a circle but not one. Anybody who has seen an out-of-focus highlight in a photograph has seen this shape, which is why a growing circle reads as a spotlight and a growing heptagon reads as a lens
- The blades swing as they open, so the whole opening rotates. On a real lens that is a consequence of the mechanism rather than a decision, and leaving it out is the clearest way to make this look like a mask
- The edges bow. A blade is a curved plate, so each side of the hole is a shallow arc bulging inwards. The amount is measured rather than chosen: a polygon's inradius is its circumradius times the cosine of half a blade's angle, so 1/cos minus 1 is exactly how far the middle of a straight edge sits inside the circle it is cutting, and `bow` is the share of that taken back
- It reaches past the far corner rather than to the edge. A box's corner is further from the centre than its side and the polygon's own inradius is shorter again, so an opening that stops at 1 leaves slivers in the corners that read as a dirty lens
- Drawn with clip-path on the element itself. Nothing is added to the DOM, nothing is drawn, and the content is untouched: it selects, scrolls and reads the whole time, it is simply not all visible yet
- The polygon is in percentages, so it follows a resize with no measuring at all
- ground is `either` and for once that needs no argument: there is no colour in this item. It clips whatever you put it on, so there is nothing to tune against a background
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/iris-reveal/core.ts`**

```ts
/*
 * IrisReveal: Beamish
 * https://beamish.ink/effects/iris-reveal
 *
 * A camera iris opening on whatever is behind it.
 *
 * HOW AN IRIS IS ACTUALLY SHAPED
 *
 * It is not a circle growing. A diaphragm is a ring of overlapping blades, and
 * the hole they leave is a polygon with as many sides as there are blades: five
 * blades give a pentagon, nine give something close to a circle but not a
 * circle. Anybody who has seen an out-of-focus highlight in a photograph has
 * seen this shape, which is why a growing circle reads as a spotlight and a
 * growing heptagon reads as a lens.
 *
 * Two details carry the rest of it:
 *
 *   The blades swing as they open, so the whole opening rotates. On a real lens
 *   that is a consequence of the mechanism rather than a decision, and leaving
 *   it out is the clearest way to make this look like a mask rather than a
 *   machine.
 *
 *   The edges bow. A blade is a curved plate, so each side of the opening is a
 *   shallow arc rather than a straight line, bulging into the hole.
 *
 * WHAT IT DRAWS WITH
 *
 * `clip-path`, on the element itself. Nothing is added to the DOM, nothing is
 * drawn, and the content inside is untouched: it selects, scrolls and reads the
 * whole time, it is simply not all visible yet.
 *
 * That also makes this the one item here with no colour in it at all, which is
 * why it declares `ground: "either"` without hedging. There is nothing to tune
 * against a background because there is no background: it clips whatever you
 * put it on.
 *
 * ONE SHOT
 *
 * It opens and it is done. `t` is seconds from the start, the easing is a
 * function of t, and there is nothing stored between frames.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type IrisRevealOptions = BaseOptions & {
  /** How many blades. Five is a cheap lens, nine is an expensive one. */
  blades: number
  /** Degrees the opening rotates as it goes from shut to open. */
  swing: number
  /** How far each blade edge bows into the hole, 0 to 1. */
  bow: number
  /** How far open it starts, 0 to 1 of the final opening. */
  from: number
  /** Milliseconds for the iris to open. */
  duration: number
  /** Milliseconds of stillness before it starts. */
  hold: number
  /** Where the centre sits across the element, 0 to 1. */
  x: number
  /** Where the centre sits down the element, 0 to 1. */
  y: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const irisRevealDefaults: IrisRevealOptions = {
  blades: 7,
  swing: 26,
  bow: 0.14,
  from: 0.04,
  duration: 1100,
  hold: 220,
  x: 0.5,
  y: 0.5,
  reducedMotionTime: 4
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/*
 * Slow to leave, quick through the middle, slow to arrive. A diaphragm is
 * sprung at both ends of its travel, and an ease-out alone makes it look like
 * it was dropped.
 */
const easeInOutCubic = (n: number) =>
  n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2

/** Points per blade edge. Enough that the bow reads as a curve. */
const PER_EDGE = 7

class IrisRevealSurface implements Surface<IrisRevealOptions> {
  private host: HTMLElement | null = null
  private previous = ''
  private restoreClip = ''
  /*
   * Width over height. The polygon is written in percentages so it follows a
   * resize for free, but percentages are not square: a point at 10% across and
   * 10% down is further across than it is down on anything wider than it is
   * tall. Without this the iris is an ellipse, and on a 16:9 hero it is an
   * obvious one.
   */
  private aspect = 1

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.restoreClip = ctx.host.style.clipPath
  }

  resize(size: { pixelWidth: number; pixelHeight: number }): void {
    this.aspect = Math.max(size.pixelWidth, 1) / Math.max(size.pixelHeight, 1)
    // The shape depends on it, so the cached string is no longer the answer.
    this.previous = ''
  }

  render(t: number, opts: IrisRevealOptions): void {
    const host = this.host
    if (!host) return

    const hold = Math.max(opts.hold, 0) / 1000
    const duration = Math.max(opts.duration, 1) / 1000
    const open = easeInOutCubic(clamp01((t - hold) / duration))

    const blades = Math.max(3, Math.round(opts.blades))
    const turn = (Math.PI * 2) / blades

    /*
     * How far the opening has to reach to clear the element, in units of the
     * element's height.
     *
     * Three things are paid for here and leaving out any one of them leaves
     * slivers in the corners, which reads as a dirty lens rather than as a
     * design. The furthest corner is further away than the nearest edge. That
     * corner is measured in height units, so its horizontal leg is scaled by
     * the aspect. And the polygon's inradius is its circumradius times the
     * cosine of half a blade's angle, so a circumradius that reaches the corner
     * still has a flat edge inside it.
     */
    const acrossMax = Math.max(opts.x, 1 - opts.x) * this.aspect
    const downMax = Math.max(opts.y, 1 - opts.y)
    const reach = (Math.hypot(acrossMax, downMax) / Math.cos(turn / 2)) * 1.02

    const r = (opts.from + (1 - opts.from) * open) * reach
    // The blades swing through their travel, so the whole opening turns. On a
    // real lens this is the mechanism rather than a decision.
    const rotation = (opts.swing * (Math.PI / 180)) * (1 - open)

    const points: string[] = []
    for (let b = 0; b < blades; b++) {
      for (let i = 0; i < PER_EDGE; i++) {
        /*
         * Walk each edge from one vertex to the next in a straight line, then
         * push the middle of it outwards by the bow. A blade is a curved plate,
         * so the side of the hole is a shallow arc bulging into it.
         */
        const s = i / PER_EDGE
        const a0 = rotation + b * turn
        const a1 = a0 + turn
        const vx0 = Math.cos(a0) * r
        const vy0 = Math.sin(a0) * r
        const vx1 = Math.cos(a1) * r
        const vy1 = Math.sin(a1) * r

        let px = vx0 + (vx1 - vx0) * s
        let py = vy0 + (vy1 - vy0) * s

        /*
         * Pushed straight out from the centre, which is a scale rather than a
         * displacement along a normal. Zero at both vertices and one in the
         * middle of the edge, so the blades still meet at their corners.
         *
         * The size of it is the gap the straight edge leaves: a polygon's
         * inradius is its circumradius times cos(half a blade's angle), so
         * 1/cos minus 1 is exactly how far the middle of the edge sits inside
         * the circle it is cutting, and `bow` is the share of that taken back.
         */
        const along = Math.sin(s * Math.PI)
        const bow = 1 + opts.bow * along * (1 / Math.cos(turn / 2) - 1) * 2
        px *= bow
        py *= bow

        /*
         * Percentages of the element, so the shape follows a resize for free.
         * The horizontal is divided by the aspect because px and py are both in
         * height units: that division is the whole of what keeps a seven-sided
         * hole seven-sided rather than stretching it into an ellipse.
         */
        const x = (opts.x + px / this.aspect) * 100
        const y = (opts.y + py) * 100
        points.push(`${x.toFixed(3)}% ${y.toFixed(3)}%`)
      }
    }

    const path = `polygon(${points.join(', ')})`
    if (path !== this.previous) {
      host.style.clipPath = path
      host.style.setProperty('-webkit-clip-path', path)
      this.previous = path
    }
  }

  teardown(): void {
    const host = this.host
    if (host) {
      host.style.clipPath = this.restoreClip
      host.style.removeProperty('-webkit-clip-path')
    }
    this.previous = ''
    this.host = null
  }
}

/**
 * Mount IrisReveal onto the element you want opened. Everything inside is
 * revealed together, so put it on the block rather than on each child.
 *
 * ```ts
 * const iris = createIrisReveal(document.querySelector('#plate')!)
 * iris.start()
 * // …later
 * iris.destroy()
 * ```
 *
 * The content is never touched: it selects, scrolls and reads the whole time,
 * it is simply not all visible yet.
 */
export function createIrisReveal(
  el: HTMLElement,
  opts: Partial<IrisRevealOptions> = {}
): EffectHandle {
  return mount<IrisRevealOptions>(el, opts, {
    defaults: irisRevealDefaults,
    kind: 'dom',
    create: () => new IrisRevealSurface()
  })
}

export default createIrisReveal
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

IrisReveal is a camera iris opening on whatever is behind it.

## 3. Wire it in

**Plain HTML.**

```html
<section id="plate">
  <h1>Seven blades</h1>
  <p>…</p>
</section>

<script type="module">
  import { createIrisReveal } from './beamish/effects/iris-reveal/core.js'

  const iris = createIrisReveal(document.querySelector('#plate'))
  iris.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createIrisReveal } from '@/beamish/effects/iris-reveal/core'

export function Plate() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const iris = createIrisReveal(host.current, { blades: 7, swing: 26 })
    iris.start()
    return () => iris.destroy()
  }, [])

  return <div ref={host} className="hero">…</div>
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createIrisReveal } from '@/beamish/effects/iris-reveal/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let iris: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  iris = createIrisReveal(host.value)
  iris.start()
})

onBeforeUnmount(() => iris?.destroy())
</script>

<template>
  <section ref="host" class="hero">…</section>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `blades` | number | `7` | 3 to 16 (looks right between 5 and 9) | How many blades, and so how many sides the opening has. Five is a cheap lens and the shape is unmistakable; nine is an expensive one and reads as nearly round. Past about twelve nobody can tell it from a circle and you have lost the only thing that says lens. |
| `swing` | number | `26` | 0 to 120 deg (looks right between 15 and 45) | Degrees the opening rotates between shut and open. This is the mechanism showing, and at 0 the effect is a polygon being scaled, which is a mask. Large values spin rather than swing and start to read as a shutter on a film projector. |
| `bow` | number | `0.14` | 0 to 1 | How far each edge bows into the hole, as a share of the gap between the straight edge and the circle through the vertices. At 0 the opening is a strict polygon; at 1 it is a circle and the blade count stops mattering. The default is a plate with a gentle curve on it. |
| `from` | number | `0.04` | 0 to 0.9 | How far open it starts, as a share of the finished opening. A little rather than nothing, because a real diaphragm does not close to a point and a pinhole gives the eye something to track from. At 0 the first frames are an empty box. |
| `duration` | number | `1100` | 150 to 6000 ms (looks right between 700 and 1800) | Milliseconds for the iris to open, eased at both ends because a diaphragm is sprung at both ends of its travel. An ease-out alone makes it look dropped. |
| `hold` | number | `220` | 0 to 5000 ms | Milliseconds of stillness before it starts. Short: this is a reveal, and the thing being revealed is what somebody came for. |
| `x` | number | `0.5` | 0 to 1 | Where the centre sits across the element. Off-centre is worth trying when the content has a subject: opening on the face rather than on the middle of the frame is what a camera operator would do. |
| `y` | number | `0.5` | 0 to 1 | Where the centre sits down the element. The reach is measured to the furthest corner from wherever this puts the centre, so an off-centre iris still clears the box. |

## 5. An iris is not a circle growing

A diaphragm is a ring of overlapping blades, and the hole they leave is a
**polygon with as many sides as there are blades**. Five blades give a pentagon.
Nine give something close to a circle but not a circle. Anybody who has seen an
out-of-focus highlight in a photograph has seen this shape, which is why a
growing circle reads as a spotlight and a growing heptagon reads as a lens.

Two details carry the rest:

**The opening turns.** The blades swing through their travel, so the whole hole
rotates as it opens. On a real lens that is a consequence of the mechanism
rather than a decision, and `swing: 0` is the clearest single way to make this
look like a mask.

**The edges bow.** A blade is a curved plate, so each side of the hole is a
shallow arc bulging inwards. The size of that is not a taste decision: a
polygon's inradius is its circumradius times the cosine of half a blade's angle,
so `1/cos − 1` is exactly how far the middle of a straight edge sits inside the
circle it is cutting, and `bow` is the share of that taken back.

## 6. It clips, it does not draw

`clip-path`, on the element itself. Nothing is added to the DOM, nothing is
rendered, and the content inside is untouched: it selects, scrolls and reads the
whole time, it is simply not all visible yet.

That is also why this is the one item here that declares `ground: "either"`
without an argument. There is no colour in it. It clips whatever you put it on.

## 7. Put it on the block, not the children

Everything inside is revealed together, as one plate, which is what an iris does
to a scene. Mounting it on each child gives you several irises opening at once,
which is a different and much busier effect.

## 8. It opens past the corner

A box's corner is further from the centre than its side, and the polygon's own
inradius is shorter again. The reach is computed from whichever corner is
furthest from the centre you set, divided by the cosine of half a blade's angle,
so the opening always clears the element.

If it did not, the last frame would have slivers left in the corners, which
reads as a dirty lens rather than as a design.

## 9. Off-centre

`x` and `y` put the centre anywhere in the element, and the reach is measured
from wherever you put it. Opening on the subject rather than on the middle of
the frame is what a camera operator would do, and it is worth trying on anything
with a face or a product in it.

## 10. Cleanup and SSR

`destroy()` restores the element's own `clip-path`, cancels the RAF, disconnects
both observers and removes every listener. The content was never touched.

There is nothing to render on the server, and nothing to wait for: the markup is
complete and correct before this runs. Call `createIrisReveal` from
`useEffect`, `onMounted`, or a `client:*` island.

## 11. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which for a one shot means fully open: nothing clipped, nothing moving. That is
the correct outcome rather than a compromise, because an iris that stays shut
for somebody with a vestibular disorder is content they cannot read.

## 12. The three mistakes most likely to be made here

1. **`swing: 0`.** A polygon being scaled. The turn is the mechanism.

2. **Too many blades.** Past about twelve it is a circle, and the one thing that
   says lens has gone.

3. **Mounting it on every child.** Several irises at once. The scene is one
   thing.

4. **A host that is already clipped.** `clip-path` does not compose: this sets
   the property, so an existing one on the same element is replaced for as long
   as the effect is mounted, and restored on `destroy()`.

5. **`from: 0`.** The first frames are an empty box. A real diaphragm does not
   close to a point, and a pinhole gives the eye something to track from.

6. **A `backdrop-filter` inside the host.** `clip-path` is normally composited
   rather than repainted, and that is the exception which will repaint every
   frame.

---

Concept credit: an aperture cut into the page, from the Recessed Aperture page. The blade geometry here is worked out rather than taken, by Ray Velez, https://github.com/RayVelez27/instalanding.ai.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
