You are adding **GradualBlur** from Beamish to this project.

> A band at the edge of a scrolling area where the content goes progressively out of focus, built from stacked blurs because a masked one does not ramp. Reveals · effect · MIT.
> https://beamish.ink/effects/gradual-blur

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The obvious build does not work, and the failure looks like a browser bug rather than a mistake. One element, a backdrop-filter and a gradient mask give a band of fully blurred content whose opacity ramps away: masking a blur fades how much of the blurred layer you can see and does nothing to how blurred it is. The hard edge where the blur starts is not in the mask, so softening the mask will never move it
- A blur that ramps has to be several blurs. Each layer blurs twice as hard as the one below it and is masked to its own band, and because a backdrop-filter sees everything painted beneath it, including the previous layers, the blurs compound
- The doubling is what makes six layers enough. A linear ramp over the same range needs dozens before the steps stop showing, and each one is another backdrop-filter for the compositor
- The bands overlap by one step on each side. Butted up against each other they leave faint but perfectly visible seams, which on a pale page read as printing bands
- The wash is a separate layer and is not the same thing as the blur. Haze over a dark photograph wants a little light in it, or the blurred content stays as dark as it was and nothing reads as distance
- backdrop-filter needs the content to be painted beneath the band, so this goes on the scrolling element and not on the thing inside it
- destroy() removes the band and puts the element's position back
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
  intersectionObserver?.observe(el)

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

**`src/beamish/effects/gradual-blur/core.ts`**

```ts
/*
 * GradualBlur: Beamish
 * https://beamish.ink/effects/gradual-blur
 *
 * A band at the edge of a scrolling area where the content goes progressively
 * out of focus before it runs off. Haze, rather than a fade to the background
 * colour.
 *
 * The obvious way to build this does not work, and it is worth saying why
 * because the failure looks like a bug in the browser rather than a mistake.
 * One element, a backdrop-filter, and a gradient mask: what you get is a band
 * of fully blurred content whose *opacity* ramps away. Masking a blur fades how
 * much of the blurred layer you can see; it does nothing to how blurred it is.
 * The result has a hard edge where the blur starts, and no amount of softening
 * the mask moves it, because the edge is not in the mask.
 *
 * A blur that actually ramps has to be built out of several blurs. Each layer
 * here blurs twice as hard as the one below it and is masked to its own band,
 * and because a backdrop-filter sees everything painted beneath it, including
 * the previous layers, the blurs compound. Six layers at the default, and the
 * doubling is what makes six enough: a linear ramp over the same range needs
 * dozens before the steps stop showing.
 *
 * The bands overlap by one step on each side. Butted up against each other they
 * produce faint but perfectly visible seams, which on a white page look like
 * printing bands.
 */

import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type Scroll,
  type Surface
} from '../../shared/runtime'

export type GradualBlurEdge = 'top' | 'bottom' | 'left' | 'right'

export type GradualBlurOptions = BaseOptions & {
  /** Which edge the haze sits on. */
  edge: GradualBlurEdge
  /** How far it reaches in from that edge, as a share of the element. */
  depth: number
  /** Blur at the very edge, in pixels. */
  strength: number
  /** How many layers the ramp is built from. */
  layers: number
  /** A wash of colour over the haze. Leave the alpha at 0 for none. */
  tint: string
  /** How strong that wash is at the edge, 0 to 1. */
  wash: number
  /** Fade the haze in as the element is scrolled, rather than always on. */
  follow: boolean
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const gradualBlurDefaults: GradualBlurOptions = {
  edge: 'bottom',
  depth: 0.22,
  strength: 14,
  layers: 6,
  tint: '#fbfaf4',
  wash: 0.35,
  follow: false,
  reducedMotionTime: 0
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/* The direction a mask runs so that stop 0 is the far side and 1 is the edge. */
const TOWARDS: Record<GradualBlurEdge, string> = {
  top: 'to top',
  bottom: 'to bottom',
  left: 'to left',
  right: 'to right'
}

class GradualBlurSurface implements Surface<GradualBlurOptions> {
  private host: HTMLElement | null = null
  private band: HTMLElement | null = null
  private layers: HTMLElement[] = []
  private builtFor = ''

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host

    const band = document.createElement('div')
    band.setAttribute('aria-hidden', 'true')
    band.style.cssText = 'position:absolute;pointer-events:none;z-index:3'
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.append(band)
    this.band = band
  }

  /*
   * The stack. Rebuilt only when something about its shape changes, because
   * every layer is a backdrop-filter and churning them is the one way to make
   * this expensive.
   */
  private assemble(opts: GradualBlurOptions): void {
    const band = this.band
    if (!band) return
    const key = `${opts.edge}|${opts.depth}|${opts.strength}|${opts.layers}|${opts.tint}|${opts.wash}`
    if (this.builtFor === key) return
    this.builtFor = key

    const count = Math.max(1, Math.min(Math.round(opts.layers), 12))
    const depth = `${(clamp01(opts.depth) * 100).toFixed(3)}%`
    const vertical = opts.edge === 'top' || opts.edge === 'bottom'

    band.style.inset = vertical
      ? opts.edge === 'top'
        ? `0 0 auto 0`
        : `auto 0 0 0`
      : opts.edge === 'left'
        ? `0 auto 0 0`
        : `0 0 0 auto`
    band.style.width = vertical ? '100%' : depth
    band.style.height = vertical ? depth : '100%'

    band.textContent = ''
    this.layers = []

    const towards = TOWARDS[opts.edge]
    for (let i = 0; i < count; i++) {
      const layer = document.createElement('div')

      /*
       * Doubling, not stepping evenly. Each layer blurs twice the one below it,
       * and since a backdrop-filter sees everything painted beneath it the
       * blurs compound: the ramp is exponential where it looks linear, which is
       * how six layers cover a range that a linear ramp needs dozens for.
       */
      const blur = opts.strength / Math.pow(2, count - 1 - i)

      /*
       * The band this layer covers, overlapping its neighbours by one step on
       * each side. Butted up against each other instead, the layers leave faint
       * seams, which on a pale page read as printing bands.
       */
      const a = ((i - 1) / count) * 100
      const b = (i / count) * 100
      const c = ((i + 1) / count) * 100
      const d = ((i + 2) / count) * 100
      const mask =
        `linear-gradient(${towards}, ` +
        `rgba(0,0,0,0) ${a.toFixed(2)}%, rgba(0,0,0,1) ${b.toFixed(2)}%, ` +
        `rgba(0,0,0,1) ${c.toFixed(2)}%, rgba(0,0,0,0) ${d.toFixed(2)}%)`

      layer.style.cssText =
        'position:absolute;inset:0;pointer-events:none;' +
        `backdrop-filter:blur(${blur.toFixed(3)}px);` +
        `-webkit-backdrop-filter:blur(${blur.toFixed(3)}px);` +
        `mask-image:${mask};-webkit-mask-image:${mask};`
      band.append(layer)
      this.layers.push(layer)
    }

    /*
     * The wash, as one more layer on top. It is optional and it is not the same
     * thing as the blur: haze over a dark photograph wants a little light in it
     * or the blurred content stays as dark as it was and nothing reads as
     * distance.
     */
    if (opts.wash > 0) {
      const wash = document.createElement('div')
      const ramp =
        `linear-gradient(${towards}, rgba(0,0,0,0) 0%, rgba(0,0,0,${clamp01(opts.wash).toFixed(3)}) 100%)`
      wash.style.cssText =
        'position:absolute;inset:0;pointer-events:none;' +
        `background:${opts.tint};mask-image:${ramp};-webkit-mask-image:${ramp};`
      band.append(wash)
      this.layers.push(wash)
    }
  }

  resize(): void {}

  render(_t: number, opts: GradualBlurOptions, _pointer: unknown, scroll: Scroll): void {
    this.assemble(opts)
    const band = this.band
    if (!band) return

    /*
     * Either always on, or brought in by the scroll. The second is what a real
     * scrolling panel wants: there is nothing above the top of a list until it
     * has been scrolled, and a haze over nothing is a smudge on the glass.
     */
    const shown = opts.follow ? clamp01(scroll.progress * 3) : 1
    const value = shown.toFixed(3)
    if (band.style.opacity !== value) band.style.opacity = value
  }

  teardown(): void {
    this.band?.remove()
    if (this.host) this.host.style.position = ''
    this.host = null
    this.band = null
    this.layers = []
    this.builtFor = ''
  }
}

/**
 * Mount GradualBlur onto `el`. Put it on the scrolling area, not on the thing
 * inside it: the haze is a band at the element's own edge and the content moves
 * under it.
 *
 * ```ts
 * const haze = createGradualBlur(document.querySelector('#list')!)
 * haze.start()
 * // …later
 * haze.destroy()
 * ```
 */
export function createGradualBlur(
  el: HTMLElement,
  opts: Partial<GradualBlurOptions> = {}
): EffectHandle {
  return mount<GradualBlurOptions>(el, opts, {
    defaults: gradualBlurDefaults,
    kind: 'dom',
    create: () => new GradualBlurSurface()
  })
}

export default createGradualBlur
```

## 2. What it is

GradualBlur puts a band at the edge of a scrolling area where the content goes
progressively out of focus before it runs off. Haze, rather than a fade to the
background colour. A fade tells you the text has stopped; a haze tells you it
has not.

The obvious way to build it does not work, and it is worth saying why, because
the failure looks like a bug in the browser rather than a mistake of yours.

One element, a `backdrop-filter` and a gradient mask gives you a band of **fully
blurred** content whose *opacity* ramps away. Masking a blur fades how much of
the blurred layer you can see. It does nothing at all to how blurred it is. So
there is a hard edge where the blur starts, and no amount of softening the mask
will move it, because the edge is not in the mask.

A blur that actually ramps has to be made of several blurs. Each layer here
blurs twice as hard as the one below it and is masked to its own band, and
because a `backdrop-filter` sees everything painted beneath it, including the
previous layers, the blurs compound.

The doubling is what makes six layers enough. A linear ramp over the same range
needs dozens before the steps stop showing, and every one of them is another
backdrop filter for the compositor.

## 3. Wire it in

**Plain HTML.** Put it on the scrolling element, not on the thing inside it. A
`backdrop-filter` blurs what is painted beneath it, so the content has to be
behind the band.

```html
<div id="list" style="position: relative; overflow: auto; height: 400px">
  <!-- a long column of content -->
</div>

<script type="module">
  import { createGradualBlur } from './beamish/effects/gradual-blur/core.js'

  const haze = createGradualBlur(document.querySelector('#list'), {
    edge: 'bottom'
  })
  haze.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createGradualBlur } from '@/beamish/effects/gradual-blur/core'

export function Scroller({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const haze = createGradualBlur(host.current, { edge: 'bottom', wash: 0 })
    haze.start()
    return () => haze.destroy()
  }, [])

  return (
    <div ref={host} style={{ overflow: 'auto', position: 'relative' }}>
      {children}
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createGradualBlur } from '@/beamish/effects/gradual-blur/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let haze: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  haze = createGradualBlur(host.value)
  haze.start()
})

onBeforeUnmount(() => haze?.destroy())
</script>

<template>
  <div ref="host" class="scroller"><slot /></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `edge` | enum | `bottom` | `top` · `bottom` · `left` · `right` | Which edge the haze sits on. The foot of a scrolling panel is the one that earns its keep: it says the text continues. At the top it competes with whatever header is already there. |
| `depth` | number | `0.22` | 0.03 to 0.6 (looks right between 0.12 and 0.3) | How far the band reaches in from the edge, as a share of the element. A share rather than pixels, so a tall panel gets a long ramp and a short one does not lose a third of itself to haze. |
| `strength` | number | `14` | 1 to 60 px (looks right between 8 and 24) | Blur at the very edge. This is the end of the ramp, not the whole of it: everything between here and the far side of the band is a fraction of it. Past about 30 the last line is a smear rather than something going out of focus. |
| `layers` | number | `6` | 2 to 12 | How many blurs the ramp is built from. Six is enough because each one is twice the last; below about four the steps are visible as bands, and above eight you are paying the compositor for a difference nobody can see. |
| `tint` | color | `#fbfaf4` | any CSS hex | The colour of the wash, if there is one. The page's own paper is the usual answer. Over a photograph a colour taken out of the image reads better than white. |
| `wash` | number | `0.35` | 0 to 1 | How strong the wash is at the edge. At 0 there is only blur, which is right on paper. Over a dark photograph it wants some, or the blurred content stays as dark as it was and nothing reads as distance. |
| `follow` | boolean | `false` | `true` · `false` | Bring the haze in as the element is scrolled rather than leaving it always on. For a panel with a top edge this is the honest setting: there is nothing above a list until it has been scrolled, and a haze over nothing is a smudge on the glass. |

## 5. Cleanup and SSR

`destroy()` removes the band and puts the element's `position` back. There is no
GPU resource of ours to release, though the compositor will drop its layers.

Nothing renders on the server, and nothing needs to: the element's own content
is untouched. Call `createGradualBlur` from `useEffect`, `onMounted`, or a
`client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
one frame is drawn, at `reducedMotionTime`, which here is 0.

The haze itself is not motion: it is a static band, and it stays. Only the
`follow` fade would have moved, and under reduced motion it simply settles at
its starting value.

## 7. The three mistakes most likely to be made here

1. **One blurred element with a gradient mask.** It ramps the opacity, not the
   blur, and leaves a hard edge where the blur begins. This is the mistake the
   whole item exists to avoid.

2. **A linear ramp of blur values.** The steps show. Doubling each layer is what
   makes a handful of them enough.

3. **Butting the bands together.** Faint seams, which on a pale page read as
   printing bands. The bands here overlap by one step on each side.

4. **Mounting it on the content instead of the scroller.** A `backdrop-filter`
   blurs what is painted beneath it, so the band has to be a sibling that sits
   over the content, inside the element that clips it.

5. **Raising `layers` to get a longer ramp.** Length is `depth`. Layers only buy
   smoothness, and past about eight you are paying the compositor for a
   difference nobody can see.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
