You are adding **MaskedHeading** from Beamish to this project.

> A heading uncovered by a sheet sliding off it, with the edge of that sheet torn rather than cut. Reveals · effect · MIT.
> https://beamish.ink/effects/masked-heading

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- A straight-edged mask crossing a heading is a wipe, and a wipe reads as a machine because nothing in the physical world has an edge that straight. The whole item is in the edge
- A deckle edge, the untrimmed side of a handmade sheet, has structure at two scales: a slow wander where the pulp ran thin against the deckle, and a fine fray of fibres on top. One scale alone gives either a gentle curve or a saw blade, and neither reads as paper
- The tear is built once and keeps its shape as it travels, because a torn edge does not re-tear itself while the sheet is being pulled away. Regenerating it per frame is the quickest way to turn paper into a flame
- It is a clip-path polygon and nothing else, so the text is never taken apart: it selects, wraps, translates and reads exactly as before. This and SplitFountainText are the only two effects here that leave the DOM alone
- The clip is composited, so a heading being uncovered costs a transform rather than a repaint
- The polygon closes across the side that stays uncovered, and the corners sit outside the box. Closing it the other way round clips the half you meant to keep, which looks like the animation running backwards
- The travel goes past the end by the overshoot, so the torn edge clears the type rather than coming to rest somewhere across it
- The travel starts and ends entirely off the element, by the depth of the tear at each end. Starting at exactly 0 looks like a bug rather than a sheet: the parts of the tear that poke forwards are already inside the box, so a sheet supposedly at rest leaks slivers of the heading through its own edge
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
  let opts: O = { ...config.defaults, ...(userOpts ?? {}) }

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
      opts = { ...opts, ...(next as Partial<O>) }
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

**`src/beamish/effects/masked-heading/core.ts`**

```ts
/*
 * MaskedHeading: Beamish
 * https://beamish.ink/effects/masked-heading
 *
 * A heading uncovered by a sheet sliding off it, and the edge of that sheet is
 * torn rather than cut.
 *
 * A straight-edged mask moving across a heading is a wipe, and a wipe is a
 * television transition: the eye reads the edge as a machine because nothing in
 * the physical world has an edge that straight. The whole of this item is in the
 * edge. A deckle edge, which is what the untrimmed side of a handmade sheet is
 * called, has structure at two scales: a slow wander where the pulp ran thin
 * against the deckle, and a fine fray of fibres on top of it. Both of those are
 * here, both are fixed by the seed, and the edge keeps its shape as it travels,
 * because a torn edge does not re-tear itself while you pull the sheet away.
 *
 * It is a `clip-path` polygon and nothing else. Which means two things worth
 * having. The text is never taken apart, so it selects, wraps, translates and
 * reads exactly as it did: this and SplitFountainText are the only two effects
 * here that leave the DOM alone. And the clip is composited, so a heading being
 * uncovered costs a transform rather than a repaint.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type MaskedHeadingDirection = 'up' | 'down' | 'left' | 'right'

export type MaskedHeadingOptions = BaseOptions & {
  /** Which way the uncovered area grows. */
  direction: MaskedHeadingDirection
  /** Milliseconds for the sheet to come away. */
  duration: number
  /** Milliseconds before it starts. */
  hold: number
  /** How far the slow wander of the edge reaches, as a share of the element. */
  tear: number
  /** How far the fine fray reaches, as a share of the element. */
  fray: number
  /** Points along the edge. More is a finer tear and a longer polygon. */
  points: number
  /** How far past the end the sheet travels, so the edge clears the type. */
  overshoot: number
  /** Seed for the tear. The same seed gives the same sheet. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const maskedHeadingDefaults: MaskedHeadingOptions = {
  direction: 'up',
  duration: 1500,
  hold: 250,
  tear: 0.07,
  fray: 0.018,
  points: 48,
  overshoot: 0.12,
  seed: 7,
  reducedMotionTime: 999
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** The one easing this library uses for arrivals. Matches --ease-out-expo. */
const easeOutExpo = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k))

function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

class MaskedHeadingSurface implements Surface<MaskedHeadingOptions> {
  private host: HTMLElement | null = null
  /** The fixed shape of the tear, sampled along the edge. Built once per seed. */
  private profile: number[] = []
  private profileFor = ''
  private previous = ''

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
  }

  /*
   * The tear itself, as a list of offsets along the edge.
   *
   * Two scales, because a deckle edge has two. The slow one is where the pulp
   * ran thin against the deckle and it wanders over a third of the sheet. The
   * fine one is the fray of individual fibres. One scale alone gives either a
   * gentle curve or a saw blade, and neither reads as paper.
   *
   * Built once and reused, because a torn edge does not re-tear itself while
   * the sheet is being pulled away.
   */
  private shape(opts: MaskedHeadingOptions): void {
    const count = Math.max(4, Math.round(opts.points))
    const key = `${count}|${opts.tear}|${opts.fray}|${opts.seed}`
    if (this.profileFor === key) return
    this.profileFor = key

    this.profile = []
    for (let i = 0; i <= count; i++) {
      const s = i / count
      const slow =
        Math.sin(s * 5.1 + hash2(1, opts.seed) * 6.3) * 0.6 +
        Math.sin(s * 11.7 + hash2(2, opts.seed) * 6.3) * 0.4
      const fine = hash2(i + 3, opts.seed) - 0.5
      this.profile.push(slow * opts.tear + fine * opts.fray * 2)
    }
  }

  resize(): void {}

  render(t: number, opts: MaskedHeadingOptions): void {
    const host = this.host
    if (!host) return
    this.shape(opts)

    const duration = Math.max(opts.duration, 1) / 1000
    const hold = Math.max(opts.hold, 0) / 1000
    const eased = easeOutExpo(clamp01((t - hold) / duration))

    /*
     * The travel starts and ends entirely off the element, by the depth of the
     * tear at each end.
     *
     * Starting at exactly 0 is wrong and looks like a bug: the parts of the tear
     * that poke forwards are already inside the box, so a sheet supposedly at
     * rest leaks slivers of the heading through its own edge. The same at the
     * far end leaves a few fibres lying across the last line. The overshoot is
     * on top of both.
     */
    const reach = opts.tear + opts.fray + 0.001
    const span = 1 + reach * 2 + opts.overshoot
    const travelled = eased * span

    const vertical = opts.direction === 'up' || opts.direction === 'down'
    const count = this.profile.length - 1
    const edge: string[] = []

    for (let i = 0; i <= count; i++) {
      const s = i / count
      const offset = this.profile[i]!
      /*
       * Where the edge sits along the axis it travels. For `up` the uncovered
       * area grows from the bottom, so the edge starts below the element and
       * rises past the top.
       */
      const grows = opts.direction === 'down' || opts.direction === 'right'
      const at = grows ? -reach + travelled + offset : 1 + reach - travelled + offset

      const along = (s * 100).toFixed(3)
      const across = (at * 100).toFixed(3)
      edge.push(vertical ? `${along}% ${across}%` : `${across}% ${along}%`)
    }

    /*
     * The polygon is the edge plus the two corners of whichever side stays
     * uncovered. Closing it the other way round clips the half you wanted to
     * keep, which looks like the animation running backwards.
     */
    const corners =
      opts.direction === 'up'
        ? ['100% 200%', '0% 200%']
        : opts.direction === 'down'
          ? ['100% -100%', '0% -100%']
          : opts.direction === 'left'
            ? ['200% 100%', '200% 0%']
            : ['-100% 100%', '-100% 0%']

    const path = `polygon(${[...edge, ...corners].join(', ')})`
    if (path !== this.previous) {
      host.style.clipPath = path
      host.style.setProperty('-webkit-clip-path', path)
      this.previous = path
    }
  }

  teardown(): void {
    const host = this.host
    if (host) {
      host.style.clipPath = ''
      host.style.removeProperty('-webkit-clip-path')
    }
    this.profile = []
    this.profileFor = ''
    this.previous = ''
    this.host = null
  }
}

/**
 * Mount MaskedHeading onto `el`. Everything inside it is uncovered together, so
 * put it on the block you want revealed rather than on each line.
 *
 * ```ts
 * const sheet = createMaskedHeading(document.querySelector('#masthead')!)
 * sheet.start()
 * // …later
 * sheet.destroy()
 * ```
 *
 * The text is never taken apart, so it selects, wraps and reads exactly as it
 * did before.
 */
export function createMaskedHeading(
  el: HTMLElement,
  opts: Partial<MaskedHeadingOptions> = {}
): EffectHandle {
  return mount<MaskedHeadingOptions>(el, opts, {
    defaults: maskedHeadingDefaults,
    kind: 'dom',
    create: () => new MaskedHeadingSurface()
  })
}

export default createMaskedHeading
```

## 2. What it is

MaskedHeading uncovers a heading by sliding a sheet off it, and the edge of that
sheet is torn rather than cut.

A straight-edged mask crossing a heading is a wipe, and a wipe reads as a
machine, because nothing in the physical world has an edge that straight. The
whole of this item is in the edge.

A **deckle edge** is the untrimmed side of a handmade sheet, where the pulp ran
thin against the frame. It has structure at two scales: a slow wander over a
third of the sheet, and a fine fray of fibres on top of it. One scale alone
gives either a gentle curve or a saw blade, and neither reads as paper. Both are
here.

The tear is built once and **keeps its shape as it travels**, because a torn
edge does not re-tear itself while you pull the sheet away. Regenerating it per
frame is the quickest way to turn paper into a flame.

## 3. Wire it in

**Plain HTML.** Everything inside the element is uncovered together, so put it
on the block rather than on each line.

```html
<div id="masthead">
  <h1>Uncovered, not wiped</h1>
  <p>A straight-edged mask is a wipe.</p>
</div>

<script type="module">
  import { createMaskedHeading } from './beamish/effects/masked-heading/core.js'

  const sheet = createMaskedHeading(document.querySelector('#masthead'))
  sheet.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createMaskedHeading } from '@/beamish/effects/masked-heading/core'

export function Uncover({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sheet = createMaskedHeading(host.current, { direction: 'up' })
    sheet.start()
    return () => sheet.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

Nothing is split, so there is no dependency on the children: the content can
change underneath it freely.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createMaskedHeading } from '@/beamish/effects/masked-heading/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sheet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sheet = createMaskedHeading(host.value)
  sheet.start()
})

onBeforeUnmount(() => sheet?.destroy())
</script>

<template>
  <div ref="host"><slot /></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Uncovering it again.**

```ts
sheet.stop()
sheet.renderAtTime(0)
sheet.start()
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a block that is uncovered when it comes into view.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `direction` | enum | `up` | `up` · `down` · `left` · `right` | Which way the uncovered area grows. Up is a sheet lifted off, and it is the one that reads as paper rather than as a transition; the sideways ones read as a sheet being slid, which is also a real thing but a busier one on a wide heading. |
| `duration` | number | `1500` | 200 to 10000 ms (looks right between 900 and 2400) | Milliseconds for the sheet to come away, eased so it arrives rather than stops. Quick: somebody pulling a sheet off a print does it in about a second, and anything slower reads as a curtain in a theatre. |
| `hold` | number | `250` | 0 to 5000 ms | Milliseconds before it starts, and how you stagger two blocks on one page. |
| `tear` | number | `0.07` | 0 to 0.4 (looks right between 0.04 and 0.12) | How far the slow wander of the edge reaches, as a share of the element. This is the large structure: where the pulp ran thin. At 0 the edge is straight and you have a wipe. |
| `fray` | number | `0.018` | 0 to 0.1 | How far the fine fray reaches. The fibres, on top of the wander. Raise it past about 0.05 and the edge stops being torn paper and becomes a saw blade. |
| `points` | number | `48` | 6 to 200 (looks right between 32 and 80) | Points along the edge. More is a finer tear and a longer path: below about twenty the fray has nowhere to happen and the edge reads as a gentle curve, and past a hundred you are paying for detail smaller than a pixel. |
| `overshoot` | number | `0.12` | 0 to 0.5 | How far past the end the sheet travels, so the torn edge clears the type. At 0 it comes to rest exactly at the far side, which on a tear means a few fibres are still lying across the last line. |
| `seed` | number | `7` | 0 to 9999 | Seed for the tear. The same seed gives the same sheet, so a recording and a live page match. Give two blocks on one page different seeds, or they are uncovered by the same torn sheet twice. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot reveal this should be a time after the sheet has gone, so the heading is simply there and unclipped. |

## 5. Accessibility. Do not skip this

The text is untouched, so there is nothing to announce and nothing hidden from a
screen reader. A clipped heading is still in the accessibility tree and still
read, which is the correct behaviour for a decorative reveal.

## 6. Cleanup and SSR

`destroy()` removes the clip, leaving the element exactly as it was found. There
is no GPU resource to release and no DOM to rebuild.

The content renders on the server unclipped, which means it is fully visible for
a moment before the first frame covers it. If that matters, hide the block with
CSS and let the effect's first frame take over, or accept the flash: it is one
frame, and the alternative is content that is invisible without JavaScript.

## 7. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is after the sheet has gone. The heading is simply there, unclipped.

## 8. The three mistakes most likely to be made here

1. **A straight edge.** `tear: 0` is a wipe, and a wipe is a television
   transition. The edge is the entire item.

2. **Regenerating the tear each frame.** The edge crawls and flickers, and what
   looked like paper becomes a flame. A torn edge keeps its shape.

3. **Starting the travel at exactly 0.** The parts of the tear that poke
   forwards are already inside the box, so a sheet supposedly at rest leaks
   slivers of the heading through its own edge. The travel has to begin a tear's
   depth off the element, and end a tear's depth past the far side.

4. **Closing the polygon the wrong way round.** It clips the half you meant to
   keep, which looks like the animation running backwards.

5. **One tear for several blocks.** The same seed gives the same sheet, and
   seeing it twice on one page gives the whole thing away.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
