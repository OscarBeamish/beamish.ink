You are adding **ClickSpark** from Beamish to this project.

> A burst of sparks where you click, drawn as streaks that shorten as they slow. Pointer · effect · MIT.
> https://beamish.ink/effects/click-spark

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- Each spark is drawn as a streak whose length is its current speed, which is what a short exposure of something hot and moving looks like. The streaks shorten on their own as the sparks slow, with nothing extra to animate, and it is the single difference between this and a particle demo
- The sparks slow down. A spark meets air, so the distance is the integral of a decaying speed rather than speed times time. Linear motion outwards is the giveaway of every version of this: the burst expands like a diagram of an explosion instead of like one
- A little gravity, so the burst is not symmetrical. Not enough to read as falling, just enough that it is not a snowflake
- A fixed pool of elements, built once and reused. Bursts create and destroy nothing: a click takes the oldest slot, so forty clicks in a row cost exactly what four do. That matters because clicking it repeatedly is the first thing anybody does
- The element keeps its own content. The streaks go in a layer over the top with pointer-events none, and the press is listened for on the element itself, so a button inside stays clickable and the feedback belongs to the thing that was pressed
- Scripted presses and real ones are the same kind of event and go in the same list. The scripted ones are rebuilt from the options each frame rather than remembered, which is what keeps a scripted take pure in t: seeking backwards un-fires them
- destroy() removes the layer and the listener and puts the element's position back
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

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

**`src/beamish/effects/click-spark/core.ts`**

```ts
/*
 * ClickSpark: Beamish
 * https://beamish.ink/effects/click-spark
 *
 * A burst of sparks where you click. It is the cheapest piece of feedback there
 * is and it is genuinely useful, which is why everybody ships one and why most
 * of them look like confetti.
 *
 * Three things make a spark read as a spark rather than as a dot moving:
 *
 *   It is drawn as a streak, not a point, and the streak is as long as the
 *   spark is fast. That is what a short exposure of something hot and moving
 *   actually looks like, and it is the single difference between this and a
 *   particle demo. The streaks shorten on their own as the sparks slow down,
 *   with nothing extra to animate.
 *
 *   It slows down. A spark meets air, so its speed decays rather than running
 *   on at whatever it started with. Linear motion outwards is the giveaway of
 *   every version of this: the burst expands like a diagram of an explosion
 *   instead of like one.
 *
 *   It falls, a little. Not enough to read as gravity, just enough that the
 *   burst is not symmetrical, because a symmetrical burst is a snowflake.
 *
 * A pool of elements is built once and reused. Bursts do not create or destroy
 * anything: there is a fixed number of streaks, and a click takes the oldest
 * slot. That caps the cost of somebody holding a mouse button down and clicking
 * forty times, which is a thing people do the moment they notice this exists.
 *
 * It is pure in `t` given the clicks. Every streak's position is a function of
 * its burst's age, so the recorder can seek, and `pressPath` lets a take be
 * recorded with clicks in it without anything having been clicked.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type ClickSparkOptions = BaseOptions & {
  /** Streaks in one burst. */
  count: number
  /** How many bursts can be in the air at once. */
  bursts: number
  /** The spark. */
  colour: string
  /** How fast a spark leaves, as a share of the shorter side per second. */
  speed: number
  /** Seconds for a spark to lose most of its speed to the air. */
  drag: number
  /** How far the burst droops, as a share of the shorter side per second. */
  gravity: number
  /** Seconds a spark lasts. */
  life: number
  /** How long a streak is for a given speed, in seconds of travel. */
  streak: number
  /** Thickness of a streak, in pixels. */
  thickness: number
  /** How uneven the burst is, 0 to 1. 0 is a perfect star. */
  scatter: number
  /** Seed for the scatter. The same seed gives the same burst. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const clickSparkDefaults: ClickSparkOptions = {
  count: 11,
  bursts: 4,
  colour: '#c44400',
  speed: 1.15,
  drag: 0.22,
  gravity: 0.55,
  life: 0.62,
  streak: 0.055,
  thickness: 2,
  scatter: 0.45,
  seed: 7,
  reducedMotionTime: 0
}

const TAU = Math.PI * 2

function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

type Burst = { t: number; x: number; y: number; id: number }

class ClickSparkSurface implements Surface<ClickSparkOptions> {
  private host: HTMLElement | null = null
  private layer: HTMLElement | null = null
  private streaks: HTMLElement[] = []
  private live: Burst[] = []
  private nextId = 1
  private pooledFor = -1
  private colouredFor = ''
  private lastTime = 0
  private onPress: ((event: PointerEvent) => void) | null = null
  private box = { width: 1, height: 1, short: 1 }

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host

    /*
     * The streaks go in a layer of their own, over whatever the element holds
     * and deaf to the pointer. The element keeps its own content: this is an
     * overlay on a button or a panel, not a replacement for one.
     */
    const layer = document.createElement('div')
    layer.setAttribute('aria-hidden', 'true')
    layer.style.cssText =
      'position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:1'
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.append(layer)
    this.layer = layer

    /*
     * Listened for on the element rather than on the layer, because the layer
     * cannot be hit and the content under it must still be clickable. A click
     * on a button inside bubbles up to here and lights it, which is the whole
     * point: the feedback belongs to the thing that was pressed.
     */
    this.onPress = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      this.live.push({
        t: this.lastTime,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        id: this.nextId++
      })
    }
    host.addEventListener('pointerdown', this.onPress)
  }

  /*
   * The pool, and the one thing every streak shares. The colour is set here
   * rather than per streak per frame: it is the same for all of them, and
   * writing it in the loop also left it behind on hidden streaks, which is
   * enough to stop the DOM being a function of t.
   */
  private pool(total: number, colour: string): void {
    const layer = this.layer
    if (!layer || (this.pooledFor === total && this.colouredFor === colour)) return
    if (this.pooledFor === total) {
      for (const streak of this.streaks) streak.style.background = colour
      this.colouredFor = colour
      return
    }
    this.colouredFor = colour
    layer.textContent = ''
    this.streaks = []
    for (let i = 0; i < total; i++) {
      const streak = document.createElement('i')
      streak.style.cssText =
        'position:absolute;top:0;left:0;display:block;border-radius:999px;' +
        'transform-origin:0 50%;will-change:transform,opacity;opacity:0;background:' +
        colour
      layer.append(streak)
      this.streaks.push(streak)
    }
    this.pooledFor = total
  }

  resize(size: { width: number; height: number }): void {
    this.box = {
      width: size.width,
      height: size.height,
      short: Math.max(Math.min(size.width, size.height), 1)
    }
  }

  render(t: number, opts: ClickSparkOptions): void {
    this.lastTime = t

    const count = Math.max(1, Math.round(opts.count))
    const slots = Math.max(1, Math.round(opts.bursts))
    this.pool(count * slots, opts.colour)

    /*
     * Scripted presses and real ones are the same kind of thing, so they go in
     * the same list. The scripted ones are rebuilt from the options each frame
     * rather than remembered, which is what keeps a scripted take pure in t:
     * seeking backwards un-fires them.
     */
    const scripted = opts.pressPath ?? []
    const all: Burst[] = []
    for (let i = 0; i < scripted.length; i++) {
      const key = scripted[i]!
      if (key.t <= t) {
        all.push({ t: key.t, x: key.x * this.box.width, y: key.y * this.box.height, id: -i - 1 })
      }
    }
    // Real presses, oldest first, and anything long dead is dropped so the list
    // does not grow for the life of the page.
    this.live = this.live.filter(burst => t - burst.t <= opts.life * 1.2 && burst.t <= t)
    for (const burst of this.live) all.push(burst)

    // The newest bursts win the slots. Somebody who clicks forty times gets the
    // last four, which is the only sane answer and also a fixed cost.
    const shown = all.slice(-slots)

    const short = this.box.short
    const speed = opts.speed * short
    const gravity = opts.gravity * short
    const drag = Math.max(opts.drag, 0.001)
    const life = Math.max(opts.life, 0.001)

    for (let slot = 0; slot < slots; slot++) {
      const burst = shown[shown.length - slots + slot]
      for (let j = 0; j < count; j++) {
        const streak = this.streaks[slot * count + j]
        if (!streak) continue
        const age = burst ? t - burst.t : -1
        if (!burst || age < 0 || age > life) {
          /*
           * Cleared rather than just hidden. An invisible streak holding the
           * geometry of the burst it was last part of is not wrong on screen,
           * but it means the DOM is no longer a function of t alone: seek
           * backwards past a burst and the elements still carry it. Guarded, so
           * an idle effect writes nothing.
           */
          if (streak.style.opacity !== '0') {
            streak.style.opacity = '0'
            streak.style.transform = ''
            streak.style.width = ''
            streak.style.height = ''
          }
          continue
        }

        /*
         * The spark. Angle is an even fan pushed about by a hash, so a burst
         * has a shape to it rather than being a star: `scatter` at 0 is a
         * perfect star, which is a snowflake.
         */
        const seedA = hash2(j + 1, burst.id * 31 + opts.seed)
        const seedB = hash2(j + 97, burst.id * 31 + opts.seed)
        const angle = (j / count) * TAU + (seedA - 0.5) * TAU * opts.scatter * (1 / count) * 2.4
        const launch = speed * (0.55 + seedB * 0.9)

        /*
         * Distance under drag, and the speed that goes with it. A spark meets
         * air: it does not run on at the speed it left. Linear motion outwards
         * is the giveaway of every version of this effect.
         */
        const travelled = launch * drag * (1 - Math.exp(-age / drag))
        const current = launch * Math.exp(-age / drag)

        const x = burst.x + Math.cos(angle) * travelled
        // Plus a little fall, so the burst is not symmetrical. A symmetrical
        // burst reads as a snowflake rather than as something thrown.
        const y = burst.y + Math.sin(angle) * travelled + 0.5 * gravity * age * age

        // The streak is as long as the spark is fast, which is what a short
        // exposure of something hot and moving looks like. It shortens on its
        // own as the spark slows, with nothing extra to animate.
        const length = Math.max(current * opts.streak, 1)
        const fade = 1 - age / life

        streak.style.width = `${length.toFixed(2)}px`
        streak.style.height = `${Math.max(opts.thickness, 0.5).toFixed(2)}px`
        // Drawn from its own tail, so it trails behind where the spark is.
        streak.style.transform =
          `translate(${(x - Math.cos(angle) * length).toFixed(2)}px, ${(y - Math.sin(angle) * length).toFixed(2)}px) ` +
          `rotate(${((angle * 180) / Math.PI).toFixed(2)}deg)`
        streak.style.opacity = (fade * fade).toFixed(3)
      }
    }
  }

  teardown(): void {
    const host = this.host
    if (host && this.onPress) host.removeEventListener('pointerdown', this.onPress)
    this.layer?.remove()
    if (host) host.style.position = ''
    this.host = null
    this.layer = null
    this.streaks = []
    this.live = []
    this.pooledFor = -1
    this.colouredFor = ''
    this.onPress = null
  }
}

/**
 * Mount ClickSpark onto `el`. Put it on the thing being clicked, or on a
 * wrapper around it: the element keeps its own content and the sparks go in a
 * layer over the top that the pointer cannot touch.
 *
 * ```ts
 * const sparks = createClickSpark(document.querySelector('#buy')!)
 * sparks.start()
 * // …later
 * sparks.destroy()
 * ```
 */
export function createClickSpark(
  el: HTMLElement,
  opts: Partial<ClickSparkOptions> = {}
): EffectHandle {
  return mount<ClickSparkOptions>(el, opts, {
    defaults: clickSparkDefaults,
    kind: 'dom',
    create: () => new ClickSparkSurface()
  })
}

export default createClickSpark
```

## 2. What it is

ClickSpark throws a burst of sparks where you click. It is the cheapest piece of
feedback there is and it is genuinely useful, which is why everybody ships one
and why most of them look like confetti.

Three things make a spark read as a spark rather than as a dot moving.

**It is a streak, not a point, and the streak is as long as the spark is fast.**
That is what a short exposure of something hot and moving looks like, and it is
the single difference between this and a particle demo. The streaks shorten on
their own as the sparks slow down, with nothing extra to animate: the length is
the speed.

**It slows down.** A spark meets air, so the distance travelled is the integral
of a decaying speed rather than speed times time. Linear motion outwards is the
giveaway of every other version: the burst expands like a diagram of an
explosion instead of like one.

**It falls, a little.** Not enough to read as gravity. Just enough that the
burst is not symmetrical, because a symmetrical burst is a snowflake.

## 3. Wire it in

**Plain HTML.** Put it on the thing being clicked, or on a wrapper around it.
The element keeps its own content: the sparks go in a layer over the top that
the pointer cannot touch.

```html
<div id="panel">
  <button type="button">Press me</button>
</div>

<script type="module">
  import { createClickSpark } from './beamish/effects/click-spark/core.js'

  const sparks = createClickSpark(document.querySelector('#panel'))
  sparks.start()
</script>
```

The press is listened for on the element itself, so a click on the button inside
bubbles up and lights it. That is the point: the feedback belongs to the thing
that was pressed, and the button keeps working.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createClickSpark } from '@/beamish/effects/click-spark/core'

export function SparkOn({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sparks = createClickSpark(host.current, { colour: '#c44400' })
    sparks.start()
    return () => sparks.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createClickSpark } from '@/beamish/effects/click-spark/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sparks: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sparks = createClickSpark(host.value)
  sparks.start()
})

onBeforeUnmount(() => sparks?.destroy())
</script>

<template>
  <div ref="host"><button type="button">Press me</button></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `count` | number | `11` | 3 to 40 (looks right between 8 and 16) | Streaks in one burst. An odd number is better than an even one: an even fan has a streak opposite every other streak, which the eye reads as a cross. |
| `bursts` | number | `4` | 1 to 10 | How many bursts can be in the air at once. The newest win, so clicking faster than this does not cost more, it just drops the oldest burst early. Raising it raises the element count by the same factor. |
| `colour` | color | `#c44400` | any CSS hex | The spark. One colour, not a gradient and not a palette: a palette of sparks is confetti. If it has to work on both grounds, pick something that is neither nearly white nor nearly black. |
| `speed` | number | `1.15` | 0.1 to 5 | How fast a spark leaves, as a share of the shorter side of the element per second. Relative rather than in pixels, so the same burst looks right on a small button and on a full-page panel. |
| `drag` | number | `0.22` | 0.02 to 2 s (looks right between 0.12 and 0.4) | Seconds for a spark to lose most of its speed to the air. Short, and it is what makes the burst read as thrown rather than as expanding: the sparks go a long way in the first fifth of a second and then barely move. |
| `gravity` | number | `0.55` | 0 to 5 | How far the burst droops, as a share of the shorter side per second. At 0 the burst is perfectly symmetrical, which reads as a snowflake. It should be small enough that nobody would name it as falling. |
| `life` | number | `0.62` | 0.1 to 3 s (looks right between 0.4 and 0.9) | Seconds a spark lasts. This is feedback for a click, so it has to be over before the next thing happens: much past a second it stops being an acknowledgement and starts being an animation somebody has to wait out. |
| `streak` | number | `0.055` | 0 to 0.3 s | How long a streak is, given as the seconds of travel it represents, so it is literally a shutter speed. At 0 the sparks are dots and the effect is confetti; long, and they are comet trails. |
| `thickness` | number | `2` | 0.5 to 8 px | Thickness of a streak, in pixels rather than relative, because a hairline is a hairline at any size and a thick spark at small sizes is a blob. |
| `scatter` | number | `0.45` | 0 to 1 | How uneven the burst is. At 0 it is a perfect star, evenly spaced and all one length, which no two things striking each other have ever produced. |
| `seed` | number | `7` | 0 to 9999 | Seed for the scatter. Every burst already differs from the last, because the burst's own number goes into the hash; this moves the whole series, so two of these on one page are not twins. |

## 5. Where to put it

On the thing that was pressed, not on the page. A spark at the cursor anywhere
on a document is a toy; a spark on the button somebody just committed to is
feedback, and the difference is only where you mount it.

`speed` and `gravity` are shares of the element's shorter side rather than
pixels, so the same burst looks right on a small button and on a full-page
panel. That is the reason to mount it on the element and not on `document.body`
and position it by hand.

## 6. Scripted presses

Every effect in this library has to be recordable, which for a click means the
clicks have to come from somewhere other than a mouse. `pressPath` is a list of
times and points, and the effect treats each one exactly as it treats a real
press at that moment:

```ts
createClickSpark(el, {
  pressPath: [
    { t: 0.45, x: 0.5, y: 0.5 },
    { t: 1.5, x: 0.28, y: 0.34 }
  ]
})
```

Unlike `pointerPath`, this does not replace the live input. A scripted press and
a real one are the same kind of event and they go in the same list, so the page
is still alive while a script is running.

## 7. Cost

The elements are a pool built once and reused. A burst creates and destroys
nothing: a click takes the oldest slot, so forty clicks in a row cost exactly
what four do. That matters, because clicking it repeatedly is the first thing
anybody does.

`count × bursts` is the element count, 44 at the defaults. Raising `bursts` is
the expensive change, not raising `count`.

## 8. Cleanup and SSR

`destroy()` removes the layer and the listener and puts the element's `position`
back. There is no GPU resource to release.

Nothing renders on the server, and nothing needs to: the element's own content
is untouched. Call `createClickSpark` from `useEffect`, `onMounted`, or a
`client:*` island.

## 9. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts, so no sparks are drawn at all, which is the right answer
here: this is decoration on an interaction that already has its own feedback.

If the click has no other visible result, give it one that is not motion.

## 10. The three mistakes most likely to be made here

1. **Dots instead of streaks.** The whole thing then reads as confetti. The
   length of a streak is its current speed, which also means it gets shorter on
   its own as the spark slows.

2. **Constant speed.** Sparks that travel at the speed they left at expand like
   a diagram. Air is the reason a real burst goes a long way in the first fifth
   of a second and then barely moves.

3. **A perfectly even fan.** At `scatter: 0` it is a star, evenly spaced and all
   one length, which no two things striking each other have ever produced. An
   even `count` is worth avoiding too: it puts a streak opposite every other
   streak and the eye reads a cross.

4. **A long life.** This is an acknowledgement of a click, so it has to be over
   before the next thing happens. Much past a second and it is an animation
   somebody has to wait out.

5. **Mounting it on the page and positioning by hand.** Then the burst is sized
   against the viewport rather than against the thing that was pressed, and it
   is far too big on a button.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
