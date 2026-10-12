You are adding **OdometerNumber** from Beamish to this project.

> A number on wheels, where a wheel only turns while the one below it goes from nine round to nought. Type · effect · MIT.
> https://beamish.ink/effects/odometer-number

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The carry is the whole difference between this and ten independent spinners, and it is one line of arithmetic. A wheel is driven by the one to its right and turns only while that one is going from nine round to nought, so the tens wheel sits perfectly still for most of the units wheel's revolution and then turns all at once
- You can see it on any petrol pump: the pence wheel is a blur, the pounds wheel steps, and the tens of pounds wheel has not moved all day. Get it wrong and every wheel turns at its own steady speed, which is a fruit machine
- `carry` chooses the mechanism. Narrow is a geneva drive and snaps, so every figure sits squarely in its window. 1 is a straight gear train, and that one has a consequence: a continuously geared counter never shows clean figures except at exact multiples, which is why a gas meter is read to the last settled digit. The demo shows both, because they look nothing alike
- Each strip carries nought to nine and then nought again. Without the repeat a wheel rolling off nine has nothing to roll on to and snaps back through the whole drum
- The figures near the edge of the window are shaded, because they are on the curve of the wheel and going out of sight. Flat instead, they slide past as though printed on a belt
- The window is an em tall, so it follows the type. Only the pixel value for the transform is read from the layout, and only on resize
- A screen reader is given the value as a number, once, in a hidden label. A column of digits read aloud is not a number
- Pure in t: each wheel's position is arithmetic on the value and the value is arithmetic on the clock
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

**`src/beamish/effects/odometer-number/core.ts`**

```ts
/*
 * OdometerNumber: Beamish
 * https://beamish.ink/effects/odometer-number
 *
 * A number on wheels. Each digit is a strip of figures behind a window, and the
 * strips roll.
 *
 * The whole difference between this and ten independent spinners is the carry,
 * and it is one line of arithmetic. A wheel does not move on its own: it is
 * driven by the one to its right, and it only turns while that one is going
 * from nine round to zero. So the tens wheel sits perfectly still for ninety
 * per cent of the units wheel's revolution and then turns all at once, and the
 * hundreds wheel is still for ninety per cent of that.
 *
 * You can see this on any petrol pump. The pence wheel is a blur, the pounds
 * wheel steps, and the tens of pounds wheel has not moved all day. Get it wrong
 * and every wheel turns at its own steady speed, which is a fruit machine.
 *
 * `carry` is how much of the lower wheel's travel the upper one moves during.
 * Narrow is a geneva drive, which snaps, and every figure sits squarely in its
 * window. Set it to 1 and you have a straight gear train, where every wheel is
 * always turning, and that has a consequence worth knowing: such a counter
 * never shows clean figures at all except at exact multiples. It is why a gas
 * meter is read to the last settled digit rather than straight off the dial.
 *
 * It is pure in `t`: each wheel's position is arithmetic on the value, and the
 * value is arithmetic on the clock.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type OdometerNumberOptions = BaseOptions & {
  /** Where the count starts. */
  from: number
  /** Where it ends. */
  to: number
  /** Milliseconds for the whole travel. */
  duration: number
  /** Milliseconds before it starts. */
  hold: number
  /** Fewest wheels to show. Short numbers are padded with leading figures. */
  digits: number
  /** What goes between groups of three. Empty for none. */
  group: string
  /** How much of a wheel's travel the wheel above it moves during, 0 to 1. */
  carry: number
  /** How far the figures above and below the window are shaded, 0 to 1. */
  drum: number
  /** Seed. Unused by the maths; here so two counters can differ. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const odometerNumberDefaults: OdometerNumberOptions = {
  from: 0,
  to: 128640,
  duration: 4200,
  hold: 300,
  digits: 6,
  group: '',
  carry: 0.12,
  drum: 0.55,
  seed: 7,
  reducedMotionTime: 999
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** The one easing this library uses for arrivals. Matches --ease-out-expo. */
const easeOutExpo = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k))

/** Smoothstep, for the window a wheel turns in. */
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / Math.max(edge1 - edge0, 1e-6))
  return t * t * (3 - 2 * t)
}

type Wheel = { window: HTMLElement; strip: HTMLElement }

class OdometerNumberSurface implements Surface<OdometerNumberOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private label: HTMLElement | null = null
  private wheels: Wheel[] = []
  private built = false
  private builtFor = ''
  private lineHeight = 1

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').trim()
  }

  /*
   * One window and one strip per wheel. The strip carries nought to nine and
   * then nought again: without the repeat, a wheel rolling from nine has
   * nothing to roll on to and snaps back through the whole drum.
   */
  private build(opts: OdometerNumberOptions): void {
    const host = this.host
    if (!host) return

    const count = Math.max(
      Math.round(opts.digits),
      String(Math.floor(Math.max(Math.abs(opts.from), Math.abs(opts.to)))).length
    )
    const key = `${count}|${opts.group}`
    if (this.built && this.builtFor === key) return
    this.builtFor = key

    host.textContent = ''
    this.wheels = []

    // The number a screen reader gets: the final value, as a number, once.
    const label = document.createElement('span')
    label.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'
    this.label = label

    const visual = document.createElement('span')
    visual.setAttribute('aria-hidden', 'true')
    visual.style.cssText = 'display:inline-flex;align-items:stretch;overflow:hidden'

    for (let i = 0; i < count; i++) {
      const place = count - 1 - i

      const window = document.createElement('span')
      window.style.cssText =
        'position:relative;display:inline-block;overflow:hidden;height:1em;' +
        'line-height:1em;vertical-align:top'

      /*
       * The strip stays in the flow. Taken out of it, the window has no child
       * with a width and collapses to nothing: the wheels are drawn, correctly,
       * in a box of zero width, and the whole counter is invisible with no
       * error anywhere.
       */
      const strip = document.createElement('span')
      strip.style.cssText =
        'display:flex;flex-direction:column;align-items:center;will-change:transform'
      for (let d = 0; d <= 10; d++) {
        const figure = document.createElement('span')
        figure.textContent = String(d % 10)
        figure.style.cssText = 'display:block;height:1em;line-height:1em'
        strip.append(figure)
      }
      window.append(strip)
      visual.append(window)
      this.wheels.push({ window, strip })

      // Separators are furniture between the wheels, not wheels themselves.
      if (opts.group.length > 0 && place > 0 && place % 3 === 0) {
        const gap = document.createElement('span')
        gap.textContent = opts.group
        gap.style.cssText = 'display:inline-block;height:1em;line-height:1em'
        visual.append(gap)
      }
    }

    host.append(label, visual)
    this.built = true
  }

  resize(): void {
    // The window height is an em, so it follows the type on its own. Only the
    // pixel value used for the transform has to be read again.
    const first = this.wheels[0]
    if (first) this.lineHeight = first.window.getBoundingClientRect().height || 1
  }

  render(t: number, opts: OdometerNumberOptions): void {
    this.build(opts)
    if (this.wheels.length === 0) return
    if (this.lineHeight <= 1) this.resize()

    const duration = Math.max(opts.duration, 1) / 1000
    const hold = Math.max(opts.hold, 0) / 1000
    const travelled = easeOutExpo(clamp01((t - hold) / duration))
    const value = opts.from + (opts.to - opts.from) * travelled

    if (this.label) {
      const shown = String(Math.round(value))
      if (this.label.textContent !== shown) this.label.textContent = shown
    }

    const carry = clamp01(opts.carry)
    const count = this.wheels.length

    for (let i = 0; i < count; i++) {
      const place = count - 1 - i
      const scaled = Math.abs(value) / Math.pow(10, place)

      /*
       * The carry, and the only interesting line in the file.
       *
       * A wheel is driven by the one to its right and turns only while that one
       * is going from nine round to nought. So the whole figure is where this
       * wheel sits, and the fraction decides how far through its own turn it is
       * once the wheel below has entered the last `carry` of its travel.
       *
       * Narrow `carry` is a geneva drive and snaps. Wide is a straight gear
       * train, where every wheel turns all the time and the high ones sit
       * permanently between two figures. Both are real and they look nothing
       * alike.
       */
      const whole = Math.floor(scaled)
      const within = scaled - whole
      const turn = carry >= 1 ? within : smoothstep(1 - carry, 1, within)
      const position = ((whole % 10) + turn + 10) % 10

      const wheel = this.wheels[i]!
      const offset = -position * this.lineHeight
      const transform = `translateY(${offset.toFixed(2)}px)`
      if (wheel.strip.style.transform !== transform) wheel.strip.style.transform = transform

      /*
       * The drum. A figure near the edge of the window is on the curve of the
       * wheel and going out of sight, so it loses light. Flat instead, the
       * figures slide past as though printed on a belt.
       */
      const shade = (1 - Math.abs(turn * 2 - 1)) * opts.drum
      const filter = shade > 0.01 ? `brightness(${(1 - shade * 0.45).toFixed(3)})` : ''
      if (wheel.strip.style.filter !== filter) wheel.strip.style.filter = filter
    }
  }

  teardown(): void {
    if (this.host) this.host.textContent = this.original
    this.wheels = []
    this.label = null
    this.built = false
    this.builtFor = ''
    this.host = null
  }
}

/**
 * Mount OdometerNumber into `el`. Whatever is in the element is replaced by the
 * wheels, and put back on destroy.
 *
 * ```ts
 * const miles = createOdometerNumber(document.querySelector('#miles')!, {
 *   to: 128640
 * })
 * miles.start()
 * // …later
 * miles.destroy()
 * ```
 */
export function createOdometerNumber(
  el: HTMLElement,
  opts: Partial<OdometerNumberOptions> = {}
): EffectHandle {
  return mount<OdometerNumberOptions>(el, opts, {
    defaults: odometerNumberDefaults,
    kind: 'dom',
    create: () => new OdometerNumberSurface()
  })
}

export default createOdometerNumber
```

## 2. What it is

OdometerNumber is a number on wheels. Each digit is a strip of figures behind a
window, and the strips roll.

The whole difference between this and ten independent spinners is the **carry**,
and it is one line of arithmetic. A wheel does not move on its own: it is driven
by the one to its right, and it only turns while that one is going from nine
round to nought. So the tens wheel sits perfectly still for most of the units
wheel's revolution and then turns all at once, and the hundreds wheel is still
for most of that.

You can see it on any petrol pump. The pence wheel is a blur, the pounds wheel
steps, and the tens of pounds wheel has not moved all day. Get it wrong and
every wheel turns at its own steady speed, which is a fruit machine.

## 3. Wire it in

**Plain HTML.** Whatever is in the element is replaced by the wheels, and put
back on destroy.

```html
<span id="miles">0</span>

<script type="module">
  import { createOdometerNumber } from './beamish/effects/odometer-number/core.js'

  const miles = createOdometerNumber(document.querySelector('#miles'), {
    to: 128640
  })
  miles.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createOdometerNumber } from '@/beamish/effects/odometer-number/core'

export function Miles({ to }: { to: number }) {
  const host = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!host.current) return
    const miles = createOdometerNumber(host.current, { to, digits: 6 })
    miles.start()
    return () => miles.destroy()
  }, [to])

  return <span ref={host}>{to}</span>
}
```

The dependency on `to` is deliberate: a new target is a new run.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createOdometerNumber } from '@/beamish/effects/odometer-number/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let miles: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  miles = createOdometerNumber(host.value, { to: 128640 })
  miles.start()
})

onBeforeUnmount(() => miles?.destroy())
</script>

<template>
  <span ref="host">128640</span>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Running it again.**

```ts
miles.stop()
miles.renderAtTime(0)
miles.start()
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a counter that runs when it is seen.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `from` | number | `0` | 0 to 1000000000 | Where the count starts. A real odometer starts wherever it was left, so this is also how you show a figure that is already high and only moves a little. |
| `to` | number | `128640` | 0 to 1000000000 | Where it ends. The distance between the two decides how much rolling there is to watch: a change of twelve on a six-wheel counter moves one wheel and nudges a second. |
| `duration` | number | `4200` | 200 to 30000 ms (looks right between 2000 and 6000) | Milliseconds for the whole travel, eased so it arrives rather than stops. Longer than a count-up wants to be, because the mechanism is the point and a fast roll is a blur. |
| `hold` | number | `300` | 0 to 5000 ms | Milliseconds before it starts. A moment of the starting figure is what tells you the wheels were somewhere before they moved. |
| `digits` | number | `6` | 1 to 12 | Fewest wheels to show, padded with leading figures. Six is a car. The leading noughts are not decoration: a counter with a fixed number of wheels is what makes it a counter rather than a number, and it stops the layout changing width as the value grows. |
| `group` | string | `` | any value | What goes between groups of three, as furniture between the wheels. Empty by default, because a mechanical counter has no separators: the wheels are all the same and nothing sits between them. Set a comma if the figure is money rather than mileage. |
| `carry` | number | `0.12` | 0.01 to 1 (looks right between 0.08 and 0.25) | How much of a wheel's travel the wheel above it moves during, and the one setting that decides what machine this is. 0.12 is a geneva drive: the upper wheel is still until the lower one is nearly round, then snaps, and every figure sits squarely in its window. 1 is a straight gear train, where every wheel turns all the time, and it has a consequence worth knowing: such a counter never shows clean figures at all except at exact multiples, which is why a gas meter is read to the last settled digit. Anything between is a gear train with slack in it. |
| `drum` | number | `0.55` | 0 to 1 | How much a wheel darkens as it turns, because the figure coming into the window is on the curve of the drum. At 0 the figures slide past as though printed on a flat belt, which is the other thing this could be and a much less interesting one. |
| `seed` | number | `7` | 0 to 9999 | Unused by the maths, and here so that two counters on a page can be told apart in a config. Nothing about an odometer is random: that is rather the point of one. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot count this should be a time after it has finished, so the final figure is simply there. A counter is read, not watched. |

## 5. Two mechanisms, and they look nothing alike

`carry` chooses which machine you have built.

**Narrow, around 0.12.** A geneva drive. The upper wheel is still until the
lower one is nearly round, then snaps. Every figure sits squarely in its window
and the number is readable at any moment.

**1.** A straight gear train: every wheel turning all the time. This has a
consequence worth knowing, and it is not a bug. Such a counter **never shows
clean figures** except at exact multiples, because the higher wheels are always
somewhere between two numbers. It is why a gas meter is read to the last settled
digit rather than straight off the dial.

Anything between is a gear train with slack in it. The demo shows both, because
seeing them side by side is the fastest way to understand the setting.

## 6. The leading noughts are the point

`digits` sets how many wheels there are, padded with leading figures. Six is a
car.

They are not decoration. A counter with a fixed number of wheels is what makes
it a counter rather than a number, and it also stops the layout changing width
as the value grows, which a count from 0 to 128,640 otherwise does on every
single frame.

`group` is empty by default, because a mechanical counter has no separators: the
wheels are all the same part and nothing sits between them. Set a comma if the
figure is money rather than mileage, and it is drawn as furniture between the
wheels rather than as a wheel.

## 7. This or CountUpNumber

CountUpNumber tweens a figure and sets it as text. It is the right choice for a
statistic, it formats properly for a locale, and it is far cheaper.

This one is a machine. Use it when the mechanism is part of what you are saying:
a mileage, a meter, a total that has been ticking up since before the page
loaded. If the number is just a number, use the other one.

## 8. Accessibility. Do not skip this

A screen reader is given the value as a number, once, in a hidden label. A
column of digits read aloud is not a number, and a label that updates sixty
times a second is a live region nobody asked for.

## 9. Cleanup and SSR

`destroy()` puts the original content back, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

Put the final value in the element in your markup. It renders on the server,
reads correctly if the JavaScript never arrives, and is replaced by the wheels
on the first frame.

## 10. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is after the count has finished. The final figure is simply there. A
counter is read, not watched.

## 11. The three mistakes most likely to be made here

1. **No carry.** Every wheel turning at its own steady speed is a fruit machine.
   The carry is one line, and it is the entire difference.

2. **No repeated nought at the end of the strip.** A wheel rolling off nine has
   nothing to roll on to and snaps back through the whole drum.

3. **Taking the strip out of the flow.** Then the window has no child with a
   width, collapses to nothing, and draws the wheels perfectly inside a box of
   zero width. The counter is invisible and there is no error anywhere. This one
   cost me a build.

4. **A variable number of wheels.** The layout changes width on every frame of
   the count. Fixed wheels with leading noughts is what a counter is.

5. **Using it for a statistic.** CountUpNumber is cheaper, formats for a locale,
   and does not imply a machine. This one is for when the machine is the point.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
