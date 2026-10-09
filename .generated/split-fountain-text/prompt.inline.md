You are adding **SplitFountainText** from Beamish to this project.

> Two or three inks in the same duct, blended by the rollers, with the gradient belonging to the sheet rather than to the letters. Type · effect · MIT.
> https://beamish.ink/effects/split-fountain-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The gradient belongs to the sheet, not to the letters, and that is what makes it a split fountain rather than gradient text. One pass of ink across the whole forme: a word near the left is in one ink, a word near the right is in another, and the heading between them is caught in the blend
- That falls out of mounting it on the sheet. background-clip on a container clips its background to every piece of text inside, however deeply nested, so one gradient inks a whole page in register. Put the gradient on each element instead and every heading gets the same little rainbow
- It is the only text effect here that does not take the text apart. No spans, no splitting, no hidden label: the text is the text the browser already had, so it selects, wraps, translates, searches and reads exactly as before. Nothing else in this library can say that
- The blend is built from several stops per ink rather than one, so its boundary can be nudged. A duct is filled by hand and the rollers do not mix evenly, so the line where two inks meet is never straight; one stop per ink is a CSS gradient and not a press
- The stops are sorted before they are written. A CSS gradient quietly clamps any stop that falls before the one in front of it, which turns a wobble into a hard edge
- -webkit-text-fill-color is set as well as color. Without it WebKit paints the text in its own colour over the clipped background and the effect does nothing at all
- Pure in t: the whole gradient is arithmetic on the clock and a hash of the seed
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

**`src/beamish/effects/split-fountain-text/core.ts`**

```ts
/*
 * SplitFountainText: Beamish
 * https://beamish.ink/effects/split-fountain-text
 *
 * A split fountain. Two or three inks are put into the same duct on the press,
 * the rollers blend them where they meet, and every sheet comes off with a
 * gradient running across it.
 *
 * The thing that makes this a split fountain rather than gradient text is that
 * the gradient belongs to the sheet, not to the letters. One pass of ink across
 * the whole forme: a word near the left is in one ink, a word near the right is
 * in another, and the heading in between is caught in the blend. Put the
 * gradient on each element instead, which is what every version of this does,
 * and every element gets its own little rainbow, every heading has the same
 * colours in the same places, and the whole point is lost.
 *
 * That falls out of mounting it on the sheet rather than on the text.
 * `background-clip: text` on a container clips the background to every piece of
 * text inside it, however deeply nested, so one gradient on one element inks a
 * whole page in register.
 *
 * It is also the only text effect in this library that does not take the text
 * apart. No spans, no splitting, no hidden label: the text in the element is the
 * text the browser already had, so it selects, it wraps, it translates, it
 * searches, and a screen reader never knows anything happened. Nothing else here
 * can say that, and it is worth preferring this when either would do.
 *
 * The blend wobbles, and that is not noise for its own sake. A duct is filled by
 * hand and the rollers do not mix evenly, so the boundary between two inks is
 * never a straight line, and it walks as the run goes on: later sheets have a
 * wider, muddier blend than early ones. The gradient here is built from stops
 * whose positions are nudged by a hash and drift with the clock, which is the
 * fountain walking.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type SplitFountainTextOptions = BaseOptions & {
  /** The ink at the start of the duct. */
  first: string
  /** The ink in the middle. Set it the same as one neighbour for two inks. */
  second: string
  /** The ink at the far end. */
  third: string
  /** Which way the duct runs across the sheet, in degrees. */
  angle: number
  /** How wide the blend between inks is, 0 to 1. */
  blend: number
  /** How uneven the blend is, 0 to 1. */
  wobble: number
  /** How far the whole fountain walks over one period, 0 to 1. */
  walk: number
  /** Seed for the unevenness. The same seed gives the same sheet. */
  seed: number
  /** Seconds for one cycle of the walk. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const splitFountainTextDefaults: SplitFountainTextOptions = {
  first: '#c44400',
  second: '#8a3b6b',
  third: '#1b6f8c',
  angle: 96,
  blend: 0.42,
  wobble: 0.35,
  walk: 0.12,
  seed: 7,
  period: 30,
  reducedMotionTime: 7
}

const TAU = Math.PI * 2

function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** How many stops each blend is built from. Enough to wobble, few enough to read. */
const STEPS = 7

class SplitFountainTextSurface implements Surface<SplitFountainTextOptions> {
  private host: HTMLElement | null = null
  private previous = ''
  private touched = false

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
  }

  resize(): void {}

  render(t: number, opts: SplitFountainTextOptions): void {
    const host = this.host
    if (!host) return

    if (!this.touched) {
      /*
       * The background is clipped to the text, and the text's own colour is
       * taken away so the background shows through it. Both inherit, which is
       * what inks every nested element from the one gradient.
       */
      host.style.setProperty('-webkit-background-clip', 'text')
      host.style.backgroundClip = 'text'
      host.style.color = 'transparent'
      // Needed in WebKit, where the prefixed property alone leaves the text
      // painted in its own colour over the top of the clipped background.
      host.style.setProperty('-webkit-text-fill-color', 'transparent')
      host.style.backgroundRepeat = 'no-repeat'
      this.touched = true
    }

    const phase = TAU * t / Math.max(opts.period, 0.001)
    // A sine, so the fountain returns to where it started and the loop closes.
    const walked = Math.sin(phase) * opts.walk

    const inks = [opts.first, opts.second, opts.third]
    const blend = clamp01(opts.blend)
    const stops: string[] = []

    /*
     * Three inks, two blends. Each blend is built from several stops rather
     * than one, so its boundary can be nudged: a duct is filled by hand and the
     * rollers do not mix evenly, so the line where two inks meet is never
     * straight. One stop per ink gives a perfectly even ramp, which is a CSS
     * gradient and not a press.
     */
    for (let i = 0; i < inks.length; i++) {
      const centre = i / (inks.length - 1)
      for (let s = 0; s < STEPS; s++) {
        const along = s / (STEPS - 1)
        const base = centre + (along - 0.5) * blend * (1 / (inks.length - 1))
        const nudge =
          (hash2(i * 31 + s, opts.seed) - 0.5) *
          opts.wobble *
          blend *
          0.22 *
          Math.cos(phase + s * 1.3 + i)
        const at = clamp01(base + nudge + walked)
        // Each ink is laid down across its own band; the overlap between bands
        // is where two inks are on the roller together.
        stops.push(`${inks[i]} ${(at * 100).toFixed(2)}%`)
      }
    }

    // Sorted, because a CSS gradient quietly clamps a stop that comes before
    // the one in front of it, which turns a wobble into a hard edge.
    const ordered = stops
      .map(stop => {
        const at = Number(stop.slice(stop.lastIndexOf(' ') + 1, -1))
        return { stop, at }
      })
      .sort((a, b) => a.at - b.at)
      .map(entry => entry.stop)
      .join(', ')

    const image = `linear-gradient(${opts.angle.toFixed(1)}deg, ${ordered})`
    if (image !== this.previous) {
      host.style.backgroundImage = image
      this.previous = image
    }
  }

  teardown(): void {
    const host = this.host
    if (host && this.touched) {
      host.style.removeProperty('-webkit-background-clip')
      host.style.backgroundClip = ''
      host.style.color = ''
      host.style.removeProperty('-webkit-text-fill-color')
      host.style.backgroundImage = ''
      host.style.backgroundRepeat = ''
    }
    this.touched = false
    this.previous = ''
    this.host = null
  }
}

/**
 * Mount SplitFountainText onto `el`. Put it on the **sheet**, not on the
 * heading: it inks every piece of text inside the element from one gradient,
 * which is what a split fountain is.
 *
 * ```ts
 * const sheet = createSplitFountainText(document.querySelector('#sheet')!)
 * sheet.start()
 * // …later
 * sheet.destroy()
 * ```
 *
 * The text is never taken apart, so it selects, wraps, translates and reads
 * exactly as it did before.
 */
export function createSplitFountainText(
  el: HTMLElement,
  opts: Partial<SplitFountainTextOptions> = {}
): EffectHandle {
  return mount<SplitFountainTextOptions>(el, opts, {
    defaults: splitFountainTextDefaults,
    kind: 'dom',
    create: () => new SplitFountainTextSurface()
  })
}

export default createSplitFountainText
```

## 2. What it is

SplitFountainText is a split fountain. Two or three inks go into the same duct
on the press, the rollers blend them where they meet, and every sheet comes off
with a gradient running across it.

What makes it a split fountain rather than gradient text is that **the gradient
belongs to the sheet, not to the letters**. One pass of ink across the whole
forme: a word near the left is in one ink, a word near the right is in another,
and the heading between them is caught in the blend. A heading that wraps starts
its second line back in the first ink, because the ink depends on where you are
on the sheet and not where you are in the string.

Put the gradient on each element instead, which is what every version of this
does, and every element gets its own little rainbow, every heading has the same
colours in the same places, and the whole point is gone.

That falls out of **mounting it on the sheet rather than on the text**.
`background-clip: text` on a container clips its background to every piece of
text inside it, however deeply nested, so one gradient inks a whole page in
register.

## 3. Wire it in

**Plain HTML.** Mount it on the sheet, not the heading.

```html
<section id="sheet">
  <p class="rule">One pass of ink</p>
  <h1>Two inks in the same duct</h1>
  <p>The rollers blend them where they meet.</p>
</section>

<script type="module">
  import { createSplitFountainText } from './beamish/effects/split-fountain-text/core.js'

  const sheet = createSplitFountainText(document.querySelector('#sheet'))
  sheet.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createSplitFountainText } from '@/beamish/effects/split-fountain-text/core'

export function Sheet({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sheet = createSplitFountainText(host.current)
    sheet.start()
    return () => sheet.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

There is no dependency on the children here, unlike the other text items,
because nothing is split: the text can change underneath it freely.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSplitFountainText } from '@/beamish/effects/split-fountain-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sheet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sheet = createSplitFountainText(host.value)
  sheet.start()
})

onBeforeUnmount(() => sheet?.destroy())
</script>

<template>
  <section ref="host"><slot /></section>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `first` | color | `#c44400` | any CSS hex | The ink at the start of the duct. Split fountains are at their best with inks that make something worth seeing where they meet: two that mix to mud give a sheet with a dead band across the middle. |
| `second` | color | `#8a3b6b` | any CSS hex | The ink in the middle. Set it to the same value as one of its neighbours and you have a two-ink fountain, which is what most presses actually run. |
| `third` | color | `#1b6f8c` | any CSS hex | The ink at the far end. |
| `angle` | number | `96` | 0 to 360 deg | Which way the duct runs across the sheet. A real fountain runs across the press, so the gradient is square to the sheet; a degree or two off square is the honest amount, and it stops the blend lining up with the lines of type. |
| `blend` | number | `0.42` | 0.02 to 1 (looks right between 0.25 and 0.6) | How wide the mixing zone is. Narrow is a press just started, with the inks still separate; wide is one that has been running, with the colours walked well into each other. Both are real points in a run and they look quite different. |
| `wobble` | number | `0.35` | 0 to 1 | How uneven the blend is. At 0 it is a perfectly even ramp, which is to say a CSS gradient. The unevenness is the whole tell that ink was involved. |
| `walk` | number | `0.12` | 0 to 0.5 | How far the whole fountain walks over one period. On a press the inks creep along the duct as the run goes on, so the boundary moves and never comes back. Here it returns, because a loop has to; keep it small enough that it reads as creep rather than as a sweep. |
| `seed` | number | `7` | 0 to 9999 | Seed for the unevenness. The same seed gives the same sheet, so a recording and a live page match. |
| `period` | number | `30` | 6 to 180 s | Seconds for one cycle of the walk. Long: this is the colour of the page, and the colour of a page should not be something you can watch changing. |

## 5. It never touches the text

This is the only text effect in the library that does not take the text apart.
No spans, no splitting, no hidden label. The text in the element is the text the
browser already had, so it selects, it wraps, it translates, it searches, and a
screen reader never knows anything happened.

Nothing else here can say that. When either this or a per-character effect would
do, this is the one to reach for.

## 6. Choosing the inks

Split fountains are at their best with inks that make something worth looking at
where they meet. Two that mix to mud give a sheet with a dead band across the
middle, which is a real risk and a real thing that happens on a press.

Set `second` to the same value as one of its neighbours and you have a two-ink
fountain, which is what most presses actually run.

`blend` is how far the inks have walked into each other. Narrow is a press just
started, with the colours still separate. Wide is one that has been running a
while. Both are real points in a run.

`wobble` is the unevenness. At 0 it is a perfectly even ramp, which is to say a
CSS gradient: the unevenness is the tell that ink was involved.

## 7. Contrast

The text is now inked from a gradient, so its contrast against the paper varies
along the sheet. That is a real accessibility problem and it is yours to manage:
check the lightest point of the gradient against the background, not the darkest.

For body copy, keep both inks dark. The effect still reads, because what carries
it is the change in hue rather than the change in value.

## 8. Cleanup and SSR

`destroy()` removes the background, the clip and the two colour properties,
leaving the element exactly as it was found. There is no GPU resource to
release and no DOM to rebuild.

The text renders on the server as ordinary text, in its own colour, and is inked
on the first frame. If the JavaScript never arrives it stays in its own colour,
which is the best fallback any effect here has. Call `createSplitFountainText`
from `useEffect`, `onMounted`, or a `client:*` island.

## 9. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`, so the sheet is inked and still. The inking is the effect;
the walk is only what a press does over a run.

## 10. The three mistakes most likely to be made here

1. **Mounting it on the heading.** Then the gradient belongs to the heading, and
   you have gradient text: the same colours in the same places on every element.
   Mount it on the sheet.

2. **Forgetting `-webkit-text-fill-color`.** WebKit paints the text in its own
   colour over the clipped background, and the effect does nothing at all. Both
   properties are needed.

3. **Unsorted gradient stops.** A CSS gradient quietly clamps any stop that
   falls before the one in front of it, which turns the wobble into a hard edge.
   Sort them before writing.

4. **`wobble: 0`.** A perfectly even ramp is a CSS gradient, and there is no
   reason to run an effect to get one.

5. **Two inks that mix to mud.** The middle of the sheet goes dead. Pick inks
   whose blend is worth looking at, because the blend is most of the sheet.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
