You are adding **PointerLitBusts** from Beamish to this project.

> Three helmeted busts in a dark room, lit by the cursor carrying the only lamp. Pointer · effect · MIT.
> https://beamish.ink/effects/pointer-lit-busts

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- The forms are generated rather than loaded. A prompt here hands over source, and a decimated head scan is several megabytes of binary nobody can read, review or tune. A lathe profile and three primitives is a few hundred numbers and every part of it can be changed by somebody who has never opened a 3D tool
- The light moves in the world, on a plane in front of the busts, rather than in screen space. A light pinned to the cursor in two dimensions lights everything from the same angle wherever it goes, so the shading never changes and the scene reads as a flat image with a bright patch on it
- There is always a little rim light. On a dark ground an unlit form is not subtle, it is absent, and a reader who moves the cursor somewhere empty concludes the page is broken
- No shadow maps. A moving light and three solids is the case where real shadows look obvious and cost a second render pass every frame, and at this scale the shading says most of what a shadow would have
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

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

**`src/beamish/effects/pointer-lit-busts/core.ts`**

```ts
/*
 * PointerLitBusts: Beamish
 * https://beamish.ink/effects/pointer-lit-busts
 *
 * Three helmeted busts in a dark room, and the cursor is the lamp. Move it and
 * the forms turn: a cheekbone catches, a visor goes black, the one at the back
 * comes out of the dark for a moment and goes again.
 *
 * The forms are generated here rather than loaded. There is no model file,
 * which is the point: a prompt in this library hands over source, and a
 * decimated head scan is several megabytes of binary that cannot be read,
 * reviewed or tuned. Built from a lathe profile and three primitives, the
 * whole cast is a few hundred bytes of numbers and every part of it can be
 * changed by somebody who has never opened a 3D tool.
 *
 * Three things carry it, and the first is the one that separates this from a
 * flashlight cursor.
 *
 * The light moves in the world, on a plane in front of the busts, not in
 * screen space. A light pinned to the cursor in two dimensions lights
 * everything from the same angle wherever it goes, so the shading never
 * changes and the scene reads as a flat image with a bright patch on it.
 * Moving it through the scene is what makes a form turn: the same cheek is lit
 * from the left, then from below, then not at all.
 *
 * There is always a little rim light. On a dark ground an unlit form is not
 * subtle, it is absent, and a reader who moves the cursor somewhere empty
 * concludes the page is broken. A faint edge keeps all three present and makes
 * the lamp read as a lamp rather than as the only thing that exists.
 *
 * And there are no shadow maps. A moving light and three solids is exactly the
 * case where real shadows look obvious and cost a second render pass every
 * frame. The forms read from shading alone, which at this scale is most of
 * what a shadow would have told you anyway.
 */

import * as THREE from 'three'
import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type Pointer,
  type Size,
  type Surface,
  type SurfaceContext
} from '../../shared/runtime'

export type PointerLitBustsOptions = BaseOptions & {
  /** Brightness of the lamp the cursor carries. */
  lamp: number
  /** Colour of the lamp. */
  lampColour: string
  /** How far in front of the busts the lamp sits. */
  reach: number
  /** How far the lamp travels across the scene, in scene units. */
  sweep: number
  /** Brightness of the edge that keeps a form present with the lamp away. */
  rim: number
  /** Colour of the rim, which is the room rather than the lamp. */
  rimColour: string
  /** The ground the busts stand in. */
  room: string
  /** How far the camera drifts with the cursor. Zero holds it still. */
  parallax: number
  /** How polished the forms are. Low is stone, high is lacquer. */
  polish: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const pointerLitBustsDefaults: PointerLitBustsOptions = {
  lamp: 26,
  lampColour: '#ffe9c9',
  reach: 3.2,
  sweep: 7,
  rim: 0.5,
  rimColour: '#6f86b8',
  room: '#0a0a0c',
  parallax: 0.35,
  polish: 0.42,
  reducedMotionTime: 0
}

/*
 * One bust, as a profile turned on a lathe plus three primitives.
 *
 * The profile is the silhouette from chin to crown, in half-section: a lathe
 * sweeps it around and the head exists. It is the cheapest way to get a form
 * that reads as carved rather than as a sphere with things stuck to it, and it
 * is a dozen numbers rather than a mesh.
 */
function headProfile(crown: number, jaw: number): THREE.Vector2[] {
  /*
   * Chin to crown in half-section, and the shape of it is the whole character.
   * An even curve gives an egg, which is what a sphere already was: what makes
   * a head read as carved is the three places it changes direction, the jaw
   * coming in under the cheek, the brow standing proud of the eye, and the
   * crown falling away behind it.
   */
  return [
    new THREE.Vector2(0.0, -1.5),
    new THREE.Vector2(jaw * 0.3, -1.46),
    new THREE.Vector2(jaw * 0.55, -1.3),
    new THREE.Vector2(jaw * 0.72, -1.02),
    new THREE.Vector2(jaw * 0.8, -0.72),
    /* the jaw, tucked under */
    new THREE.Vector2(jaw * 0.84, -0.4),
    new THREE.Vector2(jaw * 0.95, -0.12),
    /* the cheek, widest */
    new THREE.Vector2(jaw * 1.0, 0.16),
    /* the brow, standing proud */
    new THREE.Vector2(jaw * 0.99, 0.42),
    new THREE.Vector2(jaw * 0.9, 0.64),
    /* and away over the crown */
    new THREE.Vector2(jaw * 0.74, crown * 0.78),
    new THREE.Vector2(jaw * 0.46, crown * 0.98),
    new THREE.Vector2(jaw * 0.2, crown + 0.04),
    new THREE.Vector2(0.0, crown + 0.08)
  ]
}

/*
 * The shoulders, also a lathe. A cylinder gives a detached ribbon: shoulders
 * need to start at the neck and fall away, which is a profile rather than a
 * tube.
 */
function collarProfile(jaw: number): THREE.Vector2[] {
  return [
    new THREE.Vector2(jaw * 0.5, -1.46),
    new THREE.Vector2(jaw * 0.66, -1.6),
    new THREE.Vector2(jaw * 0.98, -1.76),
    new THREE.Vector2(jaw * 1.3, -1.98),
    new THREE.Vector2(jaw * 1.5, -2.3)
  ]
}

type Bust = { group: THREE.Group; drift: number }

class PointerLitBustsSurface implements Surface<PointerLitBustsOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private lamp: THREE.PointLight | null = null
  private rim: THREE.DirectionalLight | null = null
  private busts: Bust[] = []
  private made: THREE.BufferGeometry[] = []
  private used: THREE.Material[] = []

  setup(ctx: SurfaceContext): void {
    // kind: 'canvas', so the runtime has made one. Nothing to draw into
    // otherwise, and the scene would have nowhere to go.
    if (!ctx.canvas) return
    const renderer = new THREE.WebGLRenderer({
      canvas: ctx.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    })
    renderer.setPixelRatio(1)
    this.renderer = renderer

    const scene = new THREE.Scene()
    this.scene = scene

    const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 80)
    camera.position.set(0, 0.25, 9.5)
    this.camera = camera

    /*
     * The lamp. A point light rather than a spot: a spot needs an aim, and an
     * aim that follows the cursor as well as the position gives a cone that
     * never crosses the forms at an angle, which is the whole effect.
     */
    const lamp = new THREE.PointLight(0xffe9c9, 26, 26, 2)
    scene.add(lamp)
    this.lamp = lamp

    // The room. Faint, from behind and above, so nothing is ever truly gone.
    const rim = new THREE.DirectionalLight(0x6f86b8, 0.5)
    rim.position.set(-2.5, 3, -4)
    scene.add(rim)
    this.rim = rim

    /*
     * Three of them, each a different build, at different depths. They differ
     * by size, by how far they are turned and by how deep the visor sits,
     * which is enough: a crest was tried on one and read as a blemish rather
     * than as variety, because a ridge that follows a dome is mostly inside
     * it. The one at
     * the back is turned furthest away: a row of identical heads facing front
     * is a shop display, and the whole thing is supposed to read as a room
     * somebody left.
     */
    const cast = [
      { x: -2.5, z: -1.4, scale: 1.0, turn: 0.42, crown: 1.25, jaw: 0.92, visor: 0.52 },
      { x: 0.15, z: 0.3, scale: 1.18, turn: -0.12, crown: 1.1, jaw: 1.0, visor: 0.66 },
      { x: 2.7, z: -2.2, scale: 0.92, turn: -0.75, crown: 1.34, jaw: 0.86, visor: 0.38 }
    ]

    const shell = new THREE.MeshStandardMaterial({
      color: 0xb9b4ab,
      roughness: 0.58,
      metalness: 0.15
    })
    const dark = new THREE.MeshStandardMaterial({
      color: 0x15161a,
      roughness: 0.22,
      metalness: 0.5
    })
    this.used.push(shell, dark)

    for (const spec of cast) {
      const group = new THREE.Group()

      const head = new THREE.LatheGeometry(headProfile(spec.crown, spec.jaw), 64)
      this.made.push(head)
      group.add(new THREE.Mesh(head, shell))

      /*
       * The visor, as a section of a cylinder wrapped round the face rather
       * than a piece of a sphere. A sphere section at this size is a flat
       * black quad stuck on the front; a cylinder arc follows the head and
       * catches the lamp along its edge, which is what reads as glass.
       */
      const visor = new THREE.CylinderGeometry(
        spec.jaw * 1.02,
        spec.jaw * 1.0,
        spec.visor,
        64,
        1,
        true,
        /*
         * Centred on the camera. A cylinder's theta starts at +Z, which is the
         * front, so an arc centred on zero faces the reader; the first attempt
         * started at 0.62pi and wrapped the visor round the back of the head
         * where nobody could see it.
         */
        -Math.PI * 0.38,
        Math.PI * 0.76
      )
      this.made.push(visor)
      const visorMesh = new THREE.Mesh(visor, dark)
      visorMesh.position.y = 0.12
      visorMesh.scale.z = 1.04
      group.add(visorMesh)

      // Shoulders, so the head is a bust rather than a head on nothing.
      const collar = new THREE.LatheGeometry(collarProfile(spec.jaw), 64)
      this.made.push(collar)
      group.add(new THREE.Mesh(collar, shell))

      group.position.set(spec.x, 0, spec.z)
      group.rotation.y = spec.turn
      group.scale.setScalar(spec.scale)
      scene.add(group)
      this.busts.push({ group, drift: spec.turn })
    }

    this.resize(ctx.size)
  }

  resize(size: Size): void {
    const renderer = this.renderer
    const camera = this.camera
    if (!renderer || !camera) return
    renderer.setSize(size.pixelWidth, size.pixelHeight, false)
    camera.aspect = size.pixelWidth / Math.max(size.pixelHeight, 1)
    camera.updateProjectionMatrix()
  }

  render(_t: number, opts: PointerLitBustsOptions, pointer: Pointer): void {
    const { renderer, scene, camera, lamp, rim } = this
    if (!renderer || !scene || !camera || !lamp || !rim) return

    scene.background ??= new THREE.Color(opts.room)
    ;(scene.background as THREE.Color).set(opts.room)

    /*
     * The lamp, placed in the world from the cursor. Centred so the middle of
     * the element is the middle of the scene, and y inverted because the
     * pointer counts down the page while the scene counts up.
     */
    const x = (pointer.x - 0.5) * opts.sweep
    const y = (0.5 - pointer.y) * opts.sweep * 0.62
    lamp.position.set(x, y, opts.reach)
    lamp.intensity = opts.lamp
    lamp.color.set(opts.lampColour)
    lamp.distance = opts.sweep * 4

    rim.intensity = opts.rim
    rim.color.set(opts.rimColour)

    /*
     * A little camera drift, against the cursor rather than with it. Moving
     * the camera the same way as the lamp cancels the parallax out and the
     * scene feels locked; moving it the other way is what gives the room
     * depth.
     */
    camera.position.x = -(pointer.x - 0.5) * opts.parallax
    camera.position.y = 0.25 - (pointer.y - 0.5) * opts.parallax * 0.5
    camera.lookAt(0, -0.2, 0)

    for (const material of this.used) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.roughness = material.color.getHex() === 0x15161a ? 0.22 : 1 - opts.polish
      }
    }

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.renderer?.getContext() ?? null
  }

  teardown(): void {
    for (const geometry of this.made) geometry.dispose()
    for (const material of this.used) material.dispose()
    this.lamp?.dispose()
    this.rim?.dispose()
    this.renderer?.dispose()
    this.made = []
    this.used = []
    this.busts = []
    this.lamp = null
    this.rim = null
    this.scene = null
    this.camera = null
    this.renderer = null
  }
}

/**
 * Mount PointerLitBusts into `el`. The element needs a size in CSS; the canvas
 * fills it.
 *
 * ```ts
 * const room = createPointerLitBusts(document.querySelector('#hero')!)
 * room.start()
 * // …later
 * room.destroy()
 * ```
 *
 * Built for a dark ground. On paper the rim light has nothing to separate the
 * forms from and the whole thing goes flat.
 */
export function createPointerLitBusts(
  el: HTMLElement,
  opts: Partial<PointerLitBustsOptions> = {}
): EffectHandle {
  return mount<PointerLitBustsOptions>(el, opts, {
    defaults: pointerLitBustsDefaults,
    kind: 'canvas',
    create: () => new PointerLitBustsSurface()
  })
}

export default createPointerLitBusts
```

## 2. What it is

PointerLitBusts is three helmeted busts in a dark room where the cursor
carries the only lamp. Move it and the forms turn: a cheekbone catches, a
visor goes black, the one at the back comes out of the dark for a moment and
goes again.

Three things carry it, and the first is what separates this from a torch
cursor.

**The lamp moves through the world**, on a plane in front of the busts, not in
screen space. A light pinned to the cursor in two dimensions lights everything
from the same angle wherever it goes, so the shading never changes and the
scene reads as a flat image with a bright patch travelling over it. Moving the
light through the scene is what makes a form turn: the same cheek is lit from
the left, then from below, then not at all.

**There is always a little rim light.** On a dark ground an unlit form is not
subtle, it is absent, and a reader who moves the cursor into an empty corner
concludes the page is broken. A faint cool edge keeps all three present and
makes the lamp read as a lamp rather than as the only thing that exists.

**There are no shadow maps.** A moving light and three solids is exactly the
case where real shadows look obvious, and they cost a second render pass every
frame. The forms read from shading alone, which at this scale says most of
what a shadow would have.

## 3. Wire it in

**Plain HTML.** The element needs a size in CSS; the canvas fills it.

```html
<div id="room" style="width: 100%; height: 100vh"></div>

<script type="module">
  import { createPointerLitBusts } from './beamish/effects/pointer-lit-busts/core.js'

  const room = createPointerLitBusts(document.querySelector('#room'))
  room.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createPointerLitBusts } from '@/beamish/effects/pointer-lit-busts/core'

export function Room() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const room = createPointerLitBusts(host.current, { lamp: 30 })
    room.start()
    return () => room.destroy()
  }, [])

  return <div ref={host} style={{ height: '100vh' }} />
}
```

**Vue.** Same shape: mount on a sized element in `onMounted`, `destroy()` in
`onBeforeUnmount`.

**Astro.** Nothing extra. The core is a standard ES module, and three.js is a
peer dependency the host project already has or installs.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `lamp` | number | `26` | 0 to 120 | Brightness of the lamp the cursor carries. |
| `lampColour` | color | `#ffe9c9` | any CSS hex | Colour of the lamp. Warm, so it reads as a lamp rather than as a screen. |
| `reach` | number | `3.2` | 0.5 to 10 | How far in front of the busts the lamp sits. |
| `sweep` | number | `7` | 1 to 20 | How far the lamp travels across the scene. |
| `rim` | number | `0.5` | 0 to 3 | The edge that keeps a form present when the lamp is elsewhere. |
| `rimColour` | color | `#6f86b8` | any CSS hex | Colour of the rim, which is the room rather than the lamp. |
| `room` | color | `#0a0a0c` | any CSS hex | The ground the busts stand in. |
| `parallax` | number | `0.35` | 0 to 2 | How far the camera drifts against the cursor. Zero holds it still. |
| `polish` | number | `0.42` | 0 to 1 | How polished the shell is. Low is stone, high is lacquer. |

## 5. Pausing and reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one
frame is drawn, with the cursor wherever it last was or at the centre.

Nothing is lost that matters: a still of three lit busts is the composition.
What goes is the turning, which is the part that moves.

## 6. The three mistakes most likely to be made here

1. **Lighting in screen space.** The shading never changes, so the forms never
   turn and the scene is a photograph with a torch on it.

2. **No rim light.** Forms vanish completely and the page looks broken.

3. **Shadow maps.** A second pass per frame, for shadows that at this scale
   mostly duplicate what the shading already said.

4. **Loading a scan instead.** Megabytes of binary in a library whose whole
   premise is readable source.

5. **Putting it on paper.** It is built for a dark ground and says so.

6. **Sampling the canvas with `drawImage` to check it works.** The drawing
   buffer is cleared on composite, so it reads black while the scene is
   rendering perfectly. Take a screenshot instead.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
