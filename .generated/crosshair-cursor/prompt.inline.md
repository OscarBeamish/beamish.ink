You are adding **CrosshairCursor** from Beamish to this project.

> A viewfinder that follows the pointer and squares up around anything you can press. Pointer · effect · MIT.
> https://beamish.ink/effects/crosshair-cursor

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The part worth having is the lock: when the reticle passes over something you can press, the brackets leave the cursor and square up around that element. Without it this is two divs tracking a mouse. Nothing locks on to empty space
- What counts as a target is a CSS selector rather than a guess at what is clickable. Sniffing gets it wrong in both directions: it misses the div somebody wired a handler to, and it locks on to every link in a paragraph of running text
- The lock comes from a hit test at the pointer rather than from a listener for entering an element. A scripted path moves no real pointer and fires no events, so an effect that locked on only for a live cursor would record as a reticle that never finds anything
- The hit test is skipped while the pointer is still. It flushes layout, and the answer cannot have changed if nothing moved
- The brackets take a target faster than the crosshair follows the hand. A reticle that drifts lazily into place has not locked on to anything: the snap is the feedback
- Four corner brackets rather than a box, because a box round a button is a selection and a bracket at each corner is a sight. Each is the same two borders turned a quarter further round
- Like every pointer effect here it eases against its own last frame, so it is deliberately not pure in t, and the recorder drives it from the scripted path in this file
- The element keeps its own content: the reticle is drawn in a layer over the top that the pointer cannot touch. Set `cursor: none` on the element yourself if you want the real one hidden, which is a decision about the page rather than about the effect
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

**`src/beamish/effects/crosshair-cursor/core.ts`**

```ts
/*
 * CrosshairCursor: Beamish
 * https://beamish.ink/effects/crosshair-cursor
 *
 * A pair of hairlines across the panel and four corner brackets where they
 * meet, following the pointer. A viewfinder rather than a cursor.
 *
 * The thing that makes this worth building, rather than two divs tracking a
 * mouse, is what it does when it passes over something you can press: the
 * brackets leave the cursor and square up around that element instead. It stops
 * being a decoration on the pointer and becomes a statement about the page,
 * which is the whole idea of a reticle. Nothing locks on to empty space.
 *
 * Three decisions in here worth knowing about:
 *
 *   What counts as a target is a CSS selector, not a guess. Anything that
 *   sniffs for clickability gets it wrong in both directions: it misses the
 *   div somebody has wired a handler to, and it locks on to every link in a
 *   paragraph of running text.
 *
 *   The lock comes from a hit test at the pointer, not from a listener for
 *   entering an element. A scripted path moves no real pointer and fires no
 *   events, so an effect that locked on only for a live cursor would record as
 *   a reticle that never finds anything. The test is skipped while the pointer
 *   is still, because it flushes layout and the answer cannot have changed.
 *
 *   The brackets move to the target faster than the crosshair follows the hand.
 *   A reticle that drifts lazily into place has not locked on to anything; the
 *   snap is the feedback.
 *
 * Like every pointer effect here it eases against its own last frame, so it is
 * deliberately not pure in `t`, and the recorder drives it from a scripted path
 * instead.
 */

import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type Pointer,
  type Surface
} from '../../shared/runtime'

export type CrosshairCursorOptions = BaseOptions & {
  /** The lines and the brackets. */
  colour: string
  /** Thickness of a hairline, in pixels. */
  thickness: number
  /** Half-width of the free reticle, in pixels. */
  size: number
  /** Length of a corner bracket's arms, in pixels. */
  corner: number
  /** Space left around a locked target, in pixels. */
  padding: number
  /** How fast the crosshair follows the hand, 0 to 1 per frame. */
  ease: number
  /** How fast the brackets take a target, 0 to 1 per frame. */
  snap: number
  /** What the brackets will lock on to. A CSS selector. */
  target: string
  /** Draw the long hairlines as well as the brackets. */
  lines: boolean
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const crosshairCursorDefaults: CrosshairCursorOptions = {
  colour: '#c44400',
  thickness: 1,
  size: 13,
  corner: 9,
  padding: 6,
  ease: 0.22,
  snap: 0.42,
  target: 'a, button, [data-target]',
  lines: true,
  reducedMotionTime: 0
}

type Rect = { x: number; y: number; w: number; h: number }

class CrosshairCursorSurface implements Surface<CrosshairCursorOptions> {
  private host: HTMLElement | null = null
  private layer: HTMLElement | null = null
  private across: HTMLElement | null = null
  private down: HTMLElement | null = null
  private corners: HTMLElement[] = []
  private box = { width: 1, height: 1 }
  /** Where the crosshair is, in pixels, eased behind the hand. */
  private at = { x: 0, y: 0 }
  /** Where the brackets are, eased towards whatever they are framing. */
  private frame: Rect = { x: 0, y: 0, w: 0, h: 0 }
  /** The target's rect, measured when it was entered. Null when free. */
  private locked: Rect | null = null
  /** Where the last hit test was done, so it is not repeated for free. */
  private testedAt = { x: -1e9, y: -1e9 }
  private started = false

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host

    const layer = document.createElement('div')
    layer.setAttribute('aria-hidden', 'true')
    layer.style.cssText =
      'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2'
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.append(layer)
    this.layer = layer

    const line = () => {
      const el = document.createElement('i')
      el.style.cssText = 'position:absolute;top:0;left:0;display:block;will-change:transform'
      layer.append(el)
      return el
    }
    this.across = line()
    this.down = line()

    /*
     * Four brackets rather than a box, because a box round a button is a
     * selection and a bracket at each corner is a sight. Each is two borders on
     * one element, which is why they are rotated into place rather than styled
     * four different ways.
     */
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('i')
      el.style.cssText =
        'position:absolute;top:0;left:0;display:block;will-change:transform;' +
        'border-style:solid;border-right:0;border-bottom:0'
      layer.append(el)
      this.corners.push(el)
    }

  }

  resize(size: { width: number; height: number }): void {
    this.box = { width: size.width, height: size.height }
  }

  render(_t: number, opts: CrosshairCursorOptions, pointer: Pointer): void {
    const across = this.across
    const down = this.down
    if (!across || !down) return
    const ease = Math.min(Math.max(opts.ease, 0.01), 1)
    const snap = Math.min(Math.max(opts.snap, 0.01), 1)

    const wantX = pointer.x * this.box.width
    const wantY = pointer.y * this.box.height

    /*
     * Locking on. A hit test from where the pointer is, rather than a listener
     * for entering an element, because a scripted path moves no real pointer and
     * fires no events: an effect that locked on only for a live cursor would
     * record as a reticle that never finds anything.
     *
     * A selector rather than a guess at what is clickable. Sniffing gets it
     * wrong in both directions: it misses the div somebody wired a handler to,
     * and it locks on to every link in a paragraph of running text.
     *
     * Only when the pointer has actually moved, because a hit test flushes
     * layout and the answer cannot change while the pointer is still.
     */
    const host = this.host
    if (host && Math.hypot(wantX - this.testedAt.x, wantY - this.testedAt.y) > 2) {
      this.testedAt = { x: wantX, y: wantY }
      const base = host.getBoundingClientRect()
      const found = pointer.active
        ? document
            .elementFromPoint(base.left + wantX, base.top + wantY)
            ?.closest(opts.target || 'none')
        : null
      if (found && host.contains(found)) {
        const rect = found.getBoundingClientRect()
        this.locked = {
          x: rect.left - base.left + rect.width / 2,
          y: rect.top - base.top + rect.height / 2,
          w: rect.width / 2,
          h: rect.height / 2
        }
      } else {
        this.locked = null
      }
    }
    if (!this.started) {
      // Placed rather than eased on the first frame, or the reticle swings in
      // from the corner every time the effect is mounted.
      this.at = { x: wantX, y: wantY }
      this.started = true
    } else {
      this.at.x += (wantX - this.at.x) * ease
      this.at.y += (wantY - this.at.y) * ease
    }

    /*
     * What the brackets are framing: the locked target if there is one, and
     * otherwise a small square on the crosshair. They take a target faster than
     * the crosshair follows the hand, because a reticle that drifts lazily into
     * place has not locked on to anything.
     */
    const free: Rect = { x: this.at.x, y: this.at.y, w: opts.size, h: opts.size }
    const want = this.locked
      ? {
          x: this.locked.x,
          y: this.locked.y,
          w: this.locked.w + opts.padding,
          h: this.locked.h + opts.padding
        }
      : free
    const k = this.locked ? snap : ease
    this.frame.x += (want.x - this.frame.x) * k
    this.frame.y += (want.y - this.frame.y) * k
    this.frame.w += (want.w - this.frame.w) * k
    this.frame.h += (want.h - this.frame.h) * k

    const weight = Math.max(opts.thickness, 0.5)
    const show = pointer.active ? '1' : '0'

    const setLine = (el: HTMLElement, horizontal: boolean) => {
      el.style.background = opts.colour
      el.style.opacity = opts.lines ? show : '0'
      if (horizontal) {
        el.style.width = `${this.box.width}px`
        el.style.height = `${weight}px`
        el.style.transform = `translate(0, ${(this.frame.y - weight / 2).toFixed(2)}px)`
      } else {
        el.style.width = `${weight}px`
        el.style.height = `${this.box.height}px`
        el.style.transform = `translate(${(this.frame.x - weight / 2).toFixed(2)}px, 0)`
      }
    }
    setLine(across, true)
    setLine(down, false)

    const arm = Math.max(opts.corner, 1)
    for (let i = 0; i < 4; i++) {
      const el = this.corners[i]!
      // Each bracket is the same two borders turned a quarter further round.
      const flipX = i === 1 || i === 2 ? -1 : 1
      const flipY = i === 2 || i === 3 ? -1 : 1
      const x = this.frame.x - flipX * this.frame.w
      const y = this.frame.y - flipY * this.frame.h
      el.style.width = `${arm}px`
      el.style.height = `${arm}px`
      el.style.borderWidth = `${weight}px`
      el.style.borderColor = opts.colour
      el.style.opacity = show
      el.style.transform =
        `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${flipX}, ${flipY})`
    }
  }

  teardown(): void {
    const host = this.host
    if (host) host.style.position = ''
    this.layer?.remove()
    this.host = null
    this.layer = null
    this.across = null
    this.down = null
    this.corners = []
    this.locked = null
    this.started = false
  }
}

/**
 * Mount CrosshairCursor onto `el`. Put it on the area the reticle should cover;
 * it keeps the element's own content and draws over the top of it.
 *
 * ```ts
 * const sight = createCrosshairCursor(document.querySelector('#panel')!)
 * sight.start()
 * // …later
 * sight.destroy()
 * ```
 */
export function createCrosshairCursor(
  el: HTMLElement,
  opts: Partial<CrosshairCursorOptions> = {}
): EffectHandle {
  return mount<CrosshairCursorOptions>(el, opts, {
    defaults: crosshairCursorDefaults,
    kind: 'dom',
    create: () => new CrosshairCursorSurface()
  })
}

export default createCrosshairCursor
```

## 2. What it is

CrosshairCursor draws a pair of hairlines across a panel and four corner
brackets where they meet, following the pointer. A viewfinder rather than a
cursor.

The part that makes it worth building, rather than two divs tracking a mouse, is
what happens when it passes over something you can press: the brackets leave the
cursor and square up around that element instead. It stops being a decoration on
the pointer and becomes a statement about the page, which is the whole idea of a
reticle. Nothing locks on to empty space.

Three decisions worth knowing about.

**What counts as a target is a CSS selector, not a guess.** Anything that sniffs
for clickability gets it wrong in both directions: it misses the div somebody
wired a handler to, and it locks on to every link in a paragraph of running
text.

**The lock comes from a hit test at the pointer, not from a listener.** A
scripted path moves no real pointer and fires no events, so an effect that
locked on only for a live cursor would record as a reticle that never finds
anything. The test is skipped while the pointer is still, because it flushes
layout and the answer cannot have changed.

**The brackets take a target faster than the crosshair follows the hand.** A
reticle that drifts lazily into place has not locked on to anything. The snap is
the feedback.

## 3. Wire it in

**Plain HTML.** Put it on the area the reticle should cover. The element keeps
its own content and the reticle is drawn over the top of it.

```html
<section id="panel">
  <button type="button">Dispatch</button>
</section>

<script type="module">
  import { createCrosshairCursor } from './beamish/effects/crosshair-cursor/core.js'

  const sight = createCrosshairCursor(document.querySelector('#panel'))
  sight.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createCrosshairCursor } from '@/beamish/effects/crosshair-cursor/core'

export function Viewfinder({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sight = createCrosshairCursor(host.current, { lines: true })
    sight.start()
    return () => sight.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createCrosshairCursor } from '@/beamish/effects/crosshair-cursor/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sight: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sight = createCrosshairCursor(host.value)
  sight.start()
})

onBeforeUnmount(() => sight?.destroy())
</script>

<template>
  <div ref="host"><button type="button">Dispatch</button></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `colour` | color | `#c44400` | any CSS hex | The lines and the brackets. One colour: a reticle is an instrument, and an instrument is drawn in one ink. |
| `thickness` | number | `1` | 0.5 to 4 px | Thickness of a hairline. 1 is right, and anything above about 2 stops being a sight and starts being a frame. In pixels rather than relative, because a hairline is a hairline at any size. |
| `size` | number | `13` | 3 to 60 px | Half-width of the reticle when it is not locked on to anything. Small, so that locking on is a visible change: a free reticle the size of a button has nowhere to go when it finds one. |
| `corner` | number | `9` | 2 to 40 px | Length of a bracket's arms. Fixed rather than a share of the box it is framing, which is what keeps a bracket round a wide button from turning into a box round it. |
| `padding` | number | `6` | 0 to 40 px | Space left around a locked target. At 0 the brackets sit exactly on the element's edge, which reads as a border rather than as a sight trained on it. |
| `ease` | number | `0.22` | 0.02 to 1 (looks right between 0.12 and 0.35) | How fast the crosshair follows the hand, per frame. At 1 it is welded to the pointer, which is the same as not having an effect. Low enough to have weight, high enough that it is never somewhere the hand has left. |
| `snap` | number | `0.42` | 0.02 to 1 | How fast the brackets take a target, per frame. Higher than the ease on purpose. This is the one number that decides whether the effect reads as locking on or as catching up. |
| `target` | string | `a, button, [data-target]` | any value | What the brackets will lock on to, as a CSS selector. The data attribute is there so you can nominate anything else without changing the selector: put it on the card, the image, the row. |
| `lines` | boolean | `true` | `true` · `false` | Draw the long hairlines as well as the brackets. Off leaves the brackets alone, which is quieter and better over text: the lines cross everything on the page, and over a paragraph that is a strikethrough following the cursor. |

## 5. Choosing targets

`target` is a selector and the default is `a, button, [data-target]`. The data
attribute is there so you can nominate anything without rewriting the selector:
put it on the card, the image, the table row.

Be sparing. A reticle that locks on to everything is a reticle that is never
telling you anything, and over a paragraph of links it will snap between words
as the pointer crosses them.

## 6. Hiding the real cursor

This does not hide it for you. Set `cursor: none` on the element yourself if you
want it gone, because that is a decision about the page rather than about the
effect, and it is one with a cost: a visitor who loses the system cursor loses
every affordance that came with it, including the text I-beam and the resize
arrows. Over a panel of buttons it is fine. Over a form it is not.

## 7. The lines are optional, and often wrong

`lines: false` leaves the brackets on their own, which is quieter and much
better over text. The long hairlines cross everything on the page, and over a
paragraph that is a strikethrough following the cursor.

## 8. Determinism

Like every pointer effect in this library it eases against its own last frame,
so it is deliberately not pure in `t`. The recorder drives it from the scripted
cursor path in `meta.json` rather than from a mouse, which is what makes a take
reproducible.

## 9. Cleanup and SSR

`destroy()` removes the layer and puts the element's `position` back. There is
no GPU resource to release and no listener to remove, because the lock is a hit
test rather than an event.

Nothing renders on the server, and nothing needs to: the element's own content
is untouched. Call `createCrosshairCursor` from `useEffect`, `onMounted`, or a
`client:*` island.

## 10. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts, so the reticle is not drawn. That is the right answer:
this is an ornament on a pointer that already works, and a crosshair that
follows the hand is motion by definition.

## 11. The three mistakes most likely to be made here

1. **Sniffing for what is clickable.** It misses handlers on plain elements and
   it catches every link in a paragraph. A selector you chose is better than a
   guess, every time.

2. **Locking on with a listener.** It works on the page and records as a reticle
   that never finds anything, because a scripted path fires no events.

3. **Hit testing every frame.** It flushes layout for a number that cannot have
   changed if the pointer did not move.

4. **The same easing for the crosshair and the brackets.** Then locking on looks
   like catching up. The snap has to be faster than the follow.

5. **Hiding the system cursor across a whole page.** The I-beam and the resize
   arrows were doing something. Over a panel of buttons, fine; over a form, no.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
