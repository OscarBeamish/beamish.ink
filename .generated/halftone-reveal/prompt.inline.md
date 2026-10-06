You are adding **HalftoneReveal** from Beamish to this project.

> A picture arriving dot by dot, the way a halftone comes up on press. Reveals · effect · MIT.
> https://beamish.ink/effects/halftone-reveal

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The picture is the host element's own <img> child. It is hidden from sight and left in the document, so the alt text is whatever you wrote and a page with no JavaScript still shows it
- The two tonal orders read the tone at the pixel rather than at each cell centre, which would be nine more texture samples. The difference is sub-cell on a photograph and the ordering is a soft field, so it costs nothing visible
- renderAtTime is pure in t, so replaying is a matter of resetting the clock rather than restarting anything
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
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

**`src/beamish/effects/halftone-reveal/core.ts`**

```ts
/*
 * HalftoneReveal: Beamish
 * https://beamish.ink/effects/halftone-reveal
 *
 * A picture arriving the way a printed one does.
 *
 * Not a fade and not a wipe. The image is screened into halftone cells and each
 * cell's dot grows from nothing to full, which is how a halftone carries tone in
 * the first place. Growing the dots is therefore the honest way to bring one in,
 * and it reads as a press coming up to pressure rather than as opacity being
 * turned up.
 *
 * The cells do not all start together. Each gets an order blended between where
 * it sits along the sweep direction and a hash of its coordinates, so `scatter`
 * runs from a clean directional sweep to a random dissolve.
 *
 * The picture comes from the host element's own <img> child rather than from an
 * option, so the alt text is whatever was written and a page with no JavaScript
 * still shows it.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

/** The queue the cells arrive in. */
export type HalftoneRevealOrder = 'sweep' | 'centre' | 'edges' | 'shadows' | 'highlights'

/** Dot shapes a press has actually used. */
export type HalftoneRevealShape = 'round' | 'square' | 'diamond'

const ORDERS: HalftoneRevealOrder[] = ['sweep', 'centre', 'edges', 'shadows', 'highlights']
const SHAPES: HalftoneRevealShape[] = ['round', 'square', 'diamond']

export type HalftoneRevealOptions = BaseOptions & {
  /** Shown wherever a dot has not grown yet. */
  paper: string
  /** Cell size in CSS pixels. Bigger cells are a coarser screen. */
  screen: number
  /** Screen angle in degrees. 45 is the one a printer would reach for. */
  angle: number
  /** Direction the reveal sweeps, in degrees. 0 runs left to right. */
  sweep: number
  /** 0 is a clean sweep, 1 is a random dissolve. The useful part is between. */
  scatter: number
  /** The queue the cells arrive in. */
  order: HalftoneRevealOrder
  /** The shape of the dot. All three are screens a press has actually used. */
  shape: HalftoneRevealShape
  /** How much of the reveal has cells part way through at any moment. */
  feather: number
  /** Paper tooth over the whole thing. */
  grain: number
  /** Milliseconds from blank paper to the finished picture. */
  duration: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const halftoneRevealDefaults: HalftoneRevealOptions = {
  paper: '#fbfaf4',
  screen: 14,
  angle: 45,
  sweep: 24,
  scatter: 0.55,
  order: 'sweep',
  shape: 'round',
  feather: 0.55,
  grain: 0.4,
  duration: 1800,
  reducedMotionTime: 999
}

// beamish:shader-begin shaders/halftone-reveal.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/halftone-reveal.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * HalftoneReveal: a picture arriving the way a printed one does.
 *
 * Not a fade and not a wipe. The image is screened into halftone cells, and each
 * cell's dot grows from nothing to full. That is how a halftone actually carries
 * tone, so growing the dots is the honest way to bring one in, and it looks like
 * a press coming up to pressure rather than like opacity being turned up.
 *
 * The cells do not all start together. Each one gets an order, and the order is
 * a blend between where the cell sits along the sweep direction and a hash of
 * its coordinates. At \`scatter\` 0 that is a clean directional sweep; at 1 it is
 * a random dissolve. Everything in between is the useful part.
 */

uniform sampler2D u_image;

uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform float u_dpr;
uniform vec3  u_paper;
uniform float u_progress;
uniform float u_screen;
uniform float u_angle;
uniform float u_sweep;
uniform float u_scatter;
uniform float u_order;
uniform float u_shape;
uniform float u_feather;
uniform float u_grain;

out vec4 fragColor;

const float DEG = 0.01745329252;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 rot(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
}

/* Cover fit, the CSS object-fit rule, in UV space. */
vec2 cover(vec2 uv, vec2 frame, vec2 image) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  return (uv - 0.5) * scale + 0.5;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 uv = cssPx / cssRes;

  vec2 sampled = cover(vec2(uv.x, 1.0 - uv.y), u_resolution, u_imageSize);
  vec3 ink = texture(u_image, sampled).rgb;

  /*
   * The screen is laid out in CSS pixels rather than in UV, so the dots stay
   * round and stay the same size when the element changes shape. A screen
   * defined in UV turns into ellipses the moment the box is not square.
   */
  vec2 screen = rot(cssPx, u_angle * DEG) / max(u_screen, 1.0);
  vec2 cell = floor(screen);

  /*
   * One pixel, measured in screen cells, for the edge of every dot. Taken out
   * here rather than inside the loop below: a derivative of a value that varies
   * between iterations is not something to rely on, and the figure is the same
   * for all nine cells anyway.
   */
  float aa = max(fwidth(screen.x), fwidth(screen.y)) * 0.75 + 0.001;

  float feather = max(u_feather, 0.001);
  vec2 dir = rot(vec2(1.0, 0.0), u_sweep * DEG);
  float coverage = 0.0;

  /*
   * Tone, for the two orders that arrive by density rather than by position.
   * Rec. 601 weights: a flat average makes a saturated blue as dark as a
   * saturated yellow and the eye says otherwise by a factor of six.
   *
   * Read at this pixel rather than at each cell's centre, which would be nine
   * more texture samples. The difference is sub-cell on a photograph and the
   * ordering is a soft field, so it costs nothing visible and saves the reads.
   */
  float tone = dot(ink, vec3(0.299, 0.587, 0.114));

  /*
   * The nine cells around this pixel, not just the one it sits in.
   *
   * A dot only stays a dot while it fits inside its own cell. Past a radius of
   * 0.5 a single-cell test clips the circle against the cell edges, so the dots
   * grow into rounded squares and then into plain squares, and the reveal ends
   * up looking like blocks rather than like a screen. Taking the union over the
   * neighbourhood instead lets them spill across the boundaries and merge into
   * each other, which is what ink does.
   */
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 c = cell + vec2(float(ox), float(oy));
      vec2 centre = c + 0.5;

      // Back out of the rotated screen to find where this cell sits in the
      // frame, which is what the sweep is measured along.
      vec2 cellPx = rot(centre * max(u_screen, 1.0), -u_angle * DEG);
      float along = dot(cellPx / cssRes - 0.5, dir) + 0.5;

      /*
       * Where this cell sits in the queue, 0 first and 1 last.
       *
       * 0 sweep: across the frame along \`sweep\`.
       * 1 centre: the middle first, working out.
       * 2 edges: the border first, closing in.
       * 3 shadows: the darks first, which is the order a press lays ink down
       *   in: the heavy areas are the ones that take it.
       * 4 highlights: the lights first, which reads as a picture emerging out
       *   of the paper rather than being printed onto it.
       */
      vec2 fromMiddle = cellPx / cssRes - 0.5;
      float radial = clamp(length(fromMiddle * vec2(1.0, cssRes.y / max(cssRes.x, 1.0))) * 2.0, 0.0, 1.0);

      float place = clamp(along, 0.0, 1.0);
      if (u_order > 0.5 && u_order < 1.5) place = radial;
      else if (u_order > 1.5 && u_order < 2.5) place = 1.0 - radial;
      else if (u_order > 2.5 && u_order < 3.5) place = tone;
      else if (u_order > 3.5) place = 1.0 - tone;

      float order = mix(place, hash12(c), u_scatter);

      /*
       * Scaled by 1 + feather so that at progress 1 every cell has finished,
       * however late its order. Without it the last cells are still growing
       * when the reveal is nominally over and the picture never quite arrives.
       */
      float local = clamp((u_progress * (1.0 + feather) - order) / feather, 0.0, 1.0);

      /*
       * The dot's shape, and the radius that fills a cell with it.
       *
       * These are real screens rather than decoration. A round dot is the
       * default everywhere. A square dot holds its shape into the shadows
       * instead of merging, which is why newspapers used it. A diamond is the
       * one that breaks up the jump at fifty percent, where round dots all
       * touch their neighbours at once and the midtone goes abruptly dark.
       *
       * Each needs a different radius to leave no paper behind: a circle has to
       * reach the corner at 0.707, a square fills at 0.5, and a diamond needs
       * 1.0 because its distance is measured along the axes.
       */
      vec2 q = screen - centre;
      float d;
      float fill;
      if (u_shape > 1.5) {
        d = abs(q.x) + abs(q.y);
        fill = 1.02;
      } else if (u_shape > 0.5) {
        d = max(abs(q.x), abs(q.y));
        fill = 0.52;
      } else {
        d = length(q);
        fill = 0.72;
      }

      float radius = local * fill;
      coverage = max(coverage, smoothstep(radius + aa, radius - aa, d));
    }
  }

  vec3 col = mix(u_paper, ink, coverage);

  float tooth = hash12(floor(cssPx * 0.5) + 11.0) - 0.5;
  col += tooth * 0.045 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_image',
  'u_resolution',
  'u_imageSize',
  'u_dpr',
  'u_paper',
  'u_progress',
  'u_screen',
  'u_angle',
  'u_sweep',
  'u_scatter',
  'u_order',
  'u_shape',
  'u_feather',
  'u_grain'
] as const

type UniformName = (typeof UNIFORMS)[number]

function rgb(value: string): [number, number, number] {
  const hex = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    ]
  }
  const nums = value.match(/[\d.]+/g)
  if (nums && nums.length >= 3) {
    return [Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255]
  }
  return [0, 0, 0]
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('HalftoneReveal: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`HalftoneReveal: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class HalftoneRevealSurface implements Surface<HalftoneRevealOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private texture: WebGLTexture | null = null
  private imageSize = { width: 1, height: 1 }
  private image: HTMLImageElement | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('HalftoneReveal needs a canvas')
    const gl = ctx.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      // The recorder reads pixels back after the draw call, and without this the
      // buffer may already have been cleared.
      preserveDrawingBuffer: true,
      powerPreference: 'low-power'
    })
    if (!gl) throw new Error('HalftoneReveal needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('HalftoneReveal: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`HalftoneReveal: program failed to link\n${log ?? ''}`)
    }

    // WebGL2 requires a bound VAO even when the draw uses no attributes.
    const vao = gl.createVertexArray()

    this.gl = gl
    this.program = program
    this.vao = vao
    this.locations.clear()
    for (const name of UNIFORMS) {
      this.locations.set(name, gl.getUniformLocation(program, name))
    }

    /*
     * The first <img> in the host, hidden from sight and left in the document.
     * The alt text and the loading behaviour stay whatever was written, and a
     * page whose script never runs still shows the picture.
     */
    const image = ctx.host.querySelector('img')
    if (image) {
      this.image = image
      image.style.visibility = 'hidden'
      if (image.complete && image.naturalWidth > 0) this.upload(image)
      else image.addEventListener('load', () => this.upload(image), { once: true })
    }
  }

  private upload(image: HTMLImageElement): void {
    const gl = this.gl
    if (!gl || this.texture || image.naturalWidth === 0) return

    const texture = gl.createTexture()
    if (!texture) return
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    /*
     * CLAMP_TO_EDGE, not REPEAT. The warp samples well past the edge of the
     * image, and a repeating wrap would tile the opposite side of the picture
     * into the gap. The shader paints paper there instead, but the clamp is
     * what stops a mirrored seam appearing at the boundary itself.
     */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    this.texture = texture
    this.imageSize = { width: image.naturalWidth, height: image.naturalHeight }
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
    this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight)
  }

  render(t: number, opts: HalftoneRevealOptions): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)

    const loc = (name: UniformName) => this.locations.get(name) ?? null

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.uniform1i(loc('u_image'), 0)

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform2f(loc('u_imageSize'), this.imageSize.width, this.imageSize.height)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform3fv(loc('u_paper'), rgb(opts.paper))

    /*
     * Pure in `t`, which is what lets the recorder ask for any frame in any
     * order and what makes the replay button a matter of resetting the clock
     * rather than of restarting anything.
     *
     * Smoothstep, not ease-out. An ease-out spends most of its travel in the
     * first fifth of the time, which on a reveal means the picture is nearly
     * there before you have registered that anything started. This begins
     * gently, builds, and settles.
     */
    const seconds = Math.max(opts.duration, 1) / 1000
    const k = Math.min(Math.max(t / seconds, 0), 1)
    gl.uniform1f(loc('u_progress'), k * k * (3 - 2 * k))

    gl.uniform1f(loc('u_screen'), opts.screen)
    gl.uniform1f(loc('u_angle'), opts.angle)
    gl.uniform1f(loc('u_sweep'), opts.sweep)
    gl.uniform1f(loc('u_scatter'), opts.scatter)
    // Sent as an index. A shader has no strings, and a lookup here keeps the
    // option readable in the markup rather than making people remember a number.
    gl.uniform1f(loc('u_order'), Math.max(ORDERS.indexOf(opts.order), 0))
    gl.uniform1f(loc('u_shape'), Math.max(SHAPES.indexOf(opts.shape), 0))
    gl.uniform1f(loc('u_feather'), opts.feather)
    gl.uniform1f(loc('u_grain'), opts.grain)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.gl
  }

  teardown(): void {
    const gl = this.gl
    if (gl) {
      if (this.texture) gl.deleteTexture(this.texture)
      if (this.program) gl.deleteProgram(this.program)
      if (this.vao) gl.deleteVertexArray(this.vao)
    }
    // Put the markup back the way it was found. The effect borrowed it; it does
    // not own it.
    if (this.image) this.image.style.visibility = ''
    this.image = null
    this.texture = null
    this.gl = null
    this.program = null
    this.vao = null
    this.locations.clear()
  }
}

/**
 * Mount HalftoneReveal into `el`. The element needs a size and one `<img>`
 * child.
 *
 * ```html
 * <figure id="plate" style="position: relative; height: 60vh; margin: 0">
 *   <img src="/press.jpg" alt="What the picture shows" />
 * </figure>
 * ```
 *
 * ```ts
 * const reveal = createHalftoneReveal(document.querySelector('#plate')!)
 * reveal.start()
 * ```
 */
export function createHalftoneReveal(
  el: HTMLElement,
  opts: Partial<HalftoneRevealOptions> = {}
): EffectHandle {
  return mount<HalftoneRevealOptions>(el, opts, {
    defaults: halftoneRevealDefaults,
    create: () => new HalftoneRevealSurface()
  })
}

export default createHalftoneReveal
```

## 2. What it is

A picture arriving the way a printed one does.

Not a fade and not a wipe. The image is screened into halftone cells and each
cell's dot grows from nothing to full. That is how a halftone carries tone in the
first place, so growing the dots is the honest way to bring one in, and it reads
as a press coming up to pressure rather than as opacity being turned up.

The cells do not all start together. Each gets an order, blended between where it
sits along the sweep direction and a hash of its coordinates, so `scatter` runs
from a clean directional sweep at 0 to a random dissolve at 1. Everything useful
is in between: the sweep keeps its direction, but its leading edge is ragged
rather than ruled.

The dots are tested against the whole neighbourhood rather than against their own
cell. A dot only stays a dot while it fits inside its cell, and past half a cell
width a single-cell test clips it against the edges, so the dots grow into
rounded squares and then into plain squares and the whole thing ends up looking
like blocks. Taking the union over the nine cells around each pixel lets them
spill over the boundaries and merge, which is what ink does. The star-shaped
scraps of paper left between merged dots near the end are not an artefact: that
is the shadow-dot stage of a real screen.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency, no render targets.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | Shown wherever a dot has not grown yet, which at the start is the whole frame. Match it to the page behind or the reveal begins as a visible panel. |
| `screen` | number | `14` | 4 to 48 | Cell size in CSS pixels. Bigger cells are a coarser screen and a more obviously printed arrival. Laid out in pixels rather than in UV so the dots stay round and keep their size when the element changes shape. |
| `angle` | number | `45` | 0 to 90 | Screen angle in degrees. 45 is the one a printer reaches for, because a screen on the square reads as a grid and fights whatever is underneath it. |
| `sweep` | number | `24` | 0 to 360 | Direction the reveal travels, in degrees. 0 runs left to right. Only visible when scatter is below 1. |
| `scatter` | number | `0.55` | 0 to 1 | 0 is a clean directional sweep, 1 is a random dissolve with no direction at all. Between the two the sweep keeps its direction but its leading edge is ragged, which is the part worth having. |
| `order` | enum | `sweep` | `sweep` · `centre` · `edges` · `shadows` · `highlights` | The queue the cells arrive in. sweep runs across the frame along `sweep`; centre works outward from the middle and edges closes inward from the border; shadows brings the dark areas up first, which is the order a press lays ink down in, and highlights does the reverse, which reads as a picture emerging out of the paper rather than being printed onto it. |
| `shape` | enum | `round` | `round` · `square` · `diamond` | The shape of the dot. All three are screens a press has actually used: round is the default everywhere, square holds its shape into the shadows instead of merging, which is why newspapers used it, and diamond breaks up the jump at fifty percent where round dots all meet their neighbours at once and the midtone goes abruptly dark. |
| `feather` | number | `0.55` | 0.05 to 1 | How much of the reveal has cells part way through at any one moment. Low is a hard edge travelling across; high has the whole frame coming up together. |
| `grain` | number | `0.4` | 0 to 1 | Paper tooth over the whole thing. |
| `duration` | number | `1800` | 200 to 8000 | Milliseconds from blank paper to the finished picture. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, deletes the texture, restores the
original image, cancels the RAF, disconnects both observers and removes every
listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

Nothing to pause. It runs once, for under two seconds by default, and then it is
a photograph. That is below the five seconds WCAG 2.2.2 is concerned with rather
than exempt from it, and `stop()` and `start()` are still on the handle.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn at `reducedMotionTime`, which defaults to 999 seconds: long past the end
of any reveal, so what gets drawn is the finished picture.

That is the right outcome and it is worth being deliberate about. Somebody who
has asked for less motion still wants to see the image; what they do not want is
to watch it assemble.

## 7. The three mistakes most likely to be made here

1. **Starting it on mount for something below the fold.** The reveal is over
   before the reader has scrolled to it and they see a plain photograph. Tie it
   to an IntersectionObserver as above.

2. **Leaving `paper` on the default when the page is not.** It is the whole
   frame at the start, so a mismatch means the reveal opens as a visible panel in
   the wrong colour.

3. **Reaching for `scatter` when you wanted `feather`.** If the edge is too hard,
   that is `feather`. If the sweep is too obviously a direction, that is
   `scatter`.

4. **A very fine `screen` on a large element.** At four pixels a cell on a
   full-width hero there are hundreds of thousands of cells, the dots are below
   the size the eye resolves, and you have paid for a halftone to get a fade.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
