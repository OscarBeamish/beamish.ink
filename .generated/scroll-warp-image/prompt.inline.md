You are adding **ScrollWarpImage** from Beamish to this project.

> A sheet drawn through its own frame by the scroll, leading in the middle and level again when it stops. Surfaces · effect · MIT.
> https://beamish.ink/effects/scroll-warp-image

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The picture is the host element's own <img> child. It is hidden from sight and left in the document, so the alt text is whatever you wrote and a page with no JavaScript still shows it
- One arc across the width, sin(pi x), so the sides hold back and the middle goes the way the page is going. The sign is the difference between a sheet being drawn through its frame and one sagging in it, and only the first reads as travel
- The sheet is a rectangle inset from the frame and the drag carries its boundary with its contents, so the edges curve rather than staying square. Nothing is done to the horizontal axis: a sideways bend has no edge to run along and reads as the picture breathing
- At rest nothing is distorted. The whole effect is a function of scroll velocity, so a reader who has stopped scrolling is looking at a photograph
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

**`src/beamish/effects/scroll-warp-image/core.ts`**

```ts
/*
 * ScrollWarpImage: Beamish
 * https://beamish.ink/effects/scroll-warp-image
 *
 * A sheet drawn through its own frame by the scroll.
 *
 * One arc across the width. The sides hold back, the middle goes the way the
 * page is going, and it comes level the moment the scroll stops. Scroll down,
 * the page travels up past you and the middle leads it up; scroll back and the
 * curve turns over. At rest there is no effect at all.
 *
 * The shape is the whole thing, and so is which way round it runs. Half a
 * period of a sine is one smooth curve with nothing in it to catch the eye; the
 * sign decides whether the sheet is being drawn through the frame or sagging in
 * it, and only the first reads as travel. The version before this squared the
 * distance from the centre instead, which pins the middle and throws the sides
 * about, and bent both axes at once: that is the frame wobbling rather than the
 * picture moving.
 *
 * The edges deform with the picture. The sheet is a rectangle inset from the
 * frame, the drag is applied to it and to its contents together, and whatever
 * falls outside is paper, so the boundary curves rather than staying square.
 * There is no geometry beyond one triangle: the shape of the sheet is a
 * by-product of the sampling.
 *
 * The image comes from the host element's own <img> child rather than from an
 * option, so the alt text is whatever was written and a page with no
 * JavaScript still shows the picture.
 */

import { mount, type BaseOptions, type EffectHandle, type Scroll, type Surface } from '../../shared/runtime'

export type ScrollWarpImageOptions = BaseOptions & {
  /** Shown wherever the warp has pulled the sheet away from the frame. */
  paper: string
  /** How hard the edges lag behind the middle. This is the bow. */
  bend: number
  /** How far the whole sheet slides against the direction of travel. */
  slip: number
  /** Separation between the colour channels while the sheet is moving. */
  fringe: number
  /** Paper tooth over the image. */
  grain: number
  /** How far the sheet sits in from the frame, so the bent edge is not cut. */
  inset: number
  /**
   * Scroll velocity that counts as full speed. Above it the effect stops
   * growing, so a trackpad flick does not tear the picture in half.
   */
  reference: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const scrollWarpImageDefaults: ScrollWarpImageOptions = {
  paper: '#fbfaf4',
  bend: 0.06,
  slip: 0.015,
  fringe: 0.005,
  grain: 0.4,
  inset: 0.1,
  reference: 1.6,
  reducedMotionTime: 0
}

// beamish:shader-begin shaders/scroll-warp-image.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/scroll-warp-image.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * ScrollWarpImage: a sheet dragged by the scroll.
 *
 * One arc across the width. The sheet is held at its sides, the span between
 * them trails behind the direction the page is moving, and it settles flat the
 * moment the scroll stops. Scroll down and it is pulled down; scroll back up
 * and it hangs the other way.
 *
 * The shape is the whole effect, and it is the one thing worth getting right.
 * A sheet pinned at its edges and heavy in the middle is what a hanging sheet
 * does and what the eye already knows. Pinning the middle and throwing the
 * sides about is the same arithmetic inverted and reads as the frame wobbling
 * rather than as the picture being pulled, which is what this used to do.
 */

uniform sampler2D u_image;

uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform vec3  u_paper;
uniform float u_velocity;
uniform float u_bend;
uniform float u_slip;
uniform float u_fringe;
uniform float u_grain;
uniform float u_inset;

out vec4 fragColor;

const float PI = 3.14159265359;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * Frame to sheet: 0 to 1 across a rectangle inset from every edge of the frame,
 * and outside that range where the paper is.
 *
 * The margin is what the bend happens in. Without it the bent edge runs off the
 * canvas and is chopped square, which reads as clipping rather than as paper.
 *
 * It is measured in the frame rather than in the picture, which is the fix for
 * the version before this one. That one widened the sampling window instead, so
 * the margin only appeared on the axis the cover fit was not already cropping:
 * a 3:2 photograph in a 16:9 frame came out with paper down the sides and the
 * sheet running edge to edge top and bottom, which is the one axis this effect
 * needs room on. Now the sheet is the same distance in on all four sides
 * whatever shape the picture is.
 */
vec2 sheet(vec2 uv) {
  return (uv - u_inset) / max(1.0 - 2.0 * u_inset, 0.001);
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

/*
 * The deformation, in one place, because the colour fringe below evaluates it
 * three times at slightly different strengths and two copies that drifted apart
 * would be a miserable bug to find.
 */
vec2 drag(vec2 uv, float amount) {
  /*
   * One arc across the width: zero at both sides, one in the middle. A whole
   * half period of a sine and no more, so there is a single smooth curve with
   * nothing in it to catch the eye, which is what separates this from a wave.
   *
   * Nothing is done to uv.x. Bending both axes at once was an attempt at a
   * sheet deforming in space and it only muddles the shape: the horizontal
   * bend has no edge to run along, so it reads as the picture breathing.
   */
  float arc = sin(uv.x * PI);

  /*
   * The middle goes the way the page is going and the sides hold back, which
   * is a sheet being drawn through its own frame rather than one sagging in
   * it. Scroll down, the page travels up past you and the middle leads it up;
   * scroll back and the curve turns over. It comes level the moment you stop.
   *
   * The other sign is a sag, and it was what this did first. It is the same
   * arithmetic and it reads as weight rather than as travel: the sheet looks
   * tired instead of pulled.
   *
   * The bend is the arc and the slip is flat across the sheet, which is the
   * difference between paper giving in the middle and the whole sheet being
   * late. Both are wanted, and they are kept apart so either can be turned off.
   */
  uv.y += amount * (u_bend * arc + u_slip);

  return uv;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  // Textures arrive with their origin at the top left and GL samples from the
  // bottom, so this is flipped once here rather than on upload.
  uv.y = 1.0 - uv.y;

  /*
   * A press running colour work strikes one plate per ink, and a web that is
   * moving when they hit lands them a fraction apart. Three evaluations of the
   * same bow at slightly different strengths is the same error, and it is what
   * makes a fast scroll read as printing rather than as a blur.
   */
  float spread = u_fringe * abs(u_velocity);

  vec2 r = sheet(drag(uv, u_velocity * (1.0 + spread)));
  vec2 g = sheet(drag(uv, u_velocity));
  vec2 b = sheet(drag(uv, u_velocity * (1.0 - spread)));

  vec3 col = vec3(
    texture(u_image, cover(r, u_resolution, u_imageSize)).r,
    texture(u_image, cover(g, u_resolution, u_imageSize)).g,
    texture(u_image, cover(b, u_resolution, u_imageSize)).b
  );

  /*
   * Anything the drag pushed off the sheet is paper. This is what makes the
   * edges of the sheet bend rather than only its contents: the boundary is
   * carried through the same deformation as the picture inside it.
   */
  vec2 inBounds = step(vec2(0.0), g) * step(g, vec2(1.0));
  float inside = inBounds.x * inBounds.y;

  // A pixel of softness on that boundary, so the bent edge is a cut rather than
  // a staircase.
  float aa = fwidth(g.x) + fwidth(g.y);
  float edge = smoothstep(0.0, aa * 1.5, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)));
  col = mix(u_paper, col, inside * edge);

  float tooth = hash12(floor(gl_FragCoord.xy * 0.5)) - 0.5;
  col += tooth * 0.045 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_image',
  'u_resolution',
  'u_imageSize',
  'u_paper',
  'u_velocity',
  'u_bend',
  'u_slip',
  'u_fringe',
  'u_grain',
  'u_inset'
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
  if (!shader) throw new Error('ScrollWarpImage: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`ScrollWarpImage: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class ScrollWarpImageSurface implements Surface<ScrollWarpImageOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private texture: WebGLTexture | null = null
  private imageSize = { width: 1, height: 1 }
  private image: HTMLImageElement | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('ScrollWarpImage needs a canvas')
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
    if (!gl) throw new Error('ScrollWarpImage needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('ScrollWarpImage: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`ScrollWarpImage: program failed to link\n${log ?? ''}`)
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

  render(_t: number, opts: ScrollWarpImageOptions, _pointer: unknown, scroll: Scroll): void {
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
    gl.uniform3fv(loc('u_paper'), rgb(opts.paper))

    /*
     * Normalised and clipped. A trackpad can report a velocity an order of
     * magnitude past anything a wheel produces, and without a ceiling the sheet
     * tears in half the first time somebody flicks it.
     */
    const reference = Math.max(opts.reference, 0.001)
    gl.uniform1f(loc('u_velocity'), Math.max(-1, Math.min(1, scroll.velocity / reference)))

    gl.uniform1f(loc('u_bend'), opts.bend)
    gl.uniform1f(loc('u_slip'), opts.slip)
    gl.uniform1f(loc('u_fringe'), opts.fringe)
    gl.uniform1f(loc('u_grain'), opts.grain)
    gl.uniform1f(loc('u_inset'), opts.inset)

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
 * Mount ScrollWarpImage into `el`. The element needs a size and one `<img>`
 * child.
 *
 * ```html
 * <figure id="plate" style="position: relative; height: 80vh">
 *   <img src="/facade.jpg" alt="What the picture shows" />
 * </figure>
 * ```
 *
 * ```ts
 * const warp = createScrollWarpImage(document.querySelector('#plate')!)
 * warp.start()
 * // …later
 * warp.destroy()
 * ```
 */
export function createScrollWarpImage(
  el: HTMLElement,
  opts: Partial<ScrollWarpImageOptions> = {}
): EffectHandle {
  return mount<ScrollWarpImageOptions>(el, opts, {
    defaults: scrollWarpImageDefaults,
    create: () => new ScrollWarpImageSurface()
  })
}

export default createScrollWarpImage
```

## 2. What it is

A photograph on a sheet drawn through its own frame by the scroll.

One arc across the width. The sides hold back, the middle goes the way the page
is going, and it comes level the moment the scroll stops. Scroll down, the page
travels up past you and the middle leads it up; scroll back and the curve turns
over. At rest there is no effect at all, which is the point: a reader who has
stopped scrolling is looking at a photograph rather than at a filter.

**The shape is the whole thing**, and it is worth saying what it is, because
there are two curves you could draw here and only one of them is a sheet.

```glsl
uv.y += velocity * bend * sin(uv.x * PI);
```

Half a period of a sine: zero at both sides, one in the middle, one smooth curve
with nothing in it to catch the eye.

**The sign is not a detail.** Both of them give you the same arc and they are
different effects. This one sends the middle the way the page is going, so the
sheet reads as being drawn through its frame while the sides hold back. Subtract
instead and the middle lags: the sheet sags, and it reads as weight rather than
as travel, which looks tired rather than pulled. Try both on your own picture
before you settle, and if it looks wrong rather than weak, this is the line to
change.

The sign follows the scroll rather than being fixed, so the curve turns over
when you scroll back up. A sheet that bent the same way whichever way you went
is a sheet nothing is pulling.

The other *curve* is the distance from the centre, squared, which is what this
effect used to do. It pins the middle and throws the sides about, and reads as
the frame wobbling rather than the picture moving. It also used to bend both
axes at once. A sideways bend has no edge to run along, so all it does is muddle
the shape, and taking it out is most of what makes the arc read.

The edges deform with the picture. The sheet is a rectangle inset from the
frame, the drag carries its boundary and its contents together, and whatever
falls outside is paper, so the edges curve rather than staying square. There is
no geometry here beyond one triangle: the shape of the sheet is a by-product of
the sampling rather than a mesh.

One WebGL2 fragment shader. No three.js, no dependency, no render targets.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | Shown wherever the warp has pulled the sheet away from the frame. Match it to the page behind, or a border appears out of nowhere as soon as anyone scrolls. |
| `bend` | number | `0.06` | 0 to 0.3 | How far the middle of the sheet runs ahead of its sides. This is the arc, and it is the option you came for: half a period of a sine across the width, nothing at the edges and everything in the span between them. Keep it and slip together under about inset x (1 - 2 x inset), or a hard flick pushes the bent edge off the frame. |
| `slip` | number | `0.015` | 0 to 0.15 | How far the whole sheet slides against the direction of travel, flat across its width, the way anything with mass does when it is pulled. Small: this is the part you feel rather than see, and it is kept apart from the bend so either can be turned off. |
| `fringe` | number | `0.005` | 0 to 0.03 | Separation between the colour channels while the sheet is moving. A press strikes one plate per ink and a moving web lands them a fraction apart. Keep it under about 0.01 or it reads as a broken monitor. |
| `grain` | number | `0.4` | 0 to 1 | Paper tooth over the image. |
| `inset` | number | `0.1` | 0 to 0.25 | How far the sheet sits in from every edge of the frame, as a share of the frame. The margin is what the bend happens in: at 0 the bent edge runs off the canvas and is chopped square, which reads as clipping rather than as paper. Measured in the frame rather than in the picture, so a photograph of any shape is inset by the same amount on all four sides. |
| `reference` | number | `1.6` | 0.2 to 6 | The scroll velocity that counts as full speed, in screens per second. Above it the effect stops growing. Lower makes the sheet bow more readily; too low and an ordinary wheel click maxes it out. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, deletes the texture, restores the
original image, cancels the RAF, disconnects both observers and removes every
listener including the scroll one. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

There is nothing to pause. Nothing moves unless the reader moves it, which puts
this outside WCAG 2.2.2 rather than exempting it from it. `stop()` and `start()`
are still on the handle.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn.

This effect needs no special case. Velocity is zero when nothing is scrolling, so
the frame that gets drawn is the undistorted photograph, which is exactly what
somebody who has asked for less motion wants to see.

## 7. The three mistakes most likely to be made here

1. **Leaving `paper` on the default when the page is not.** The drag pulls the
   sheet away from the frame and `paper` is what shows in the gap. If it does not
   match the page behind, a border appears out of nowhere whenever somebody
   scrolls, and only while they scroll, which is a maddening thing to debug.

2. **Turning `bend` up to see it better.** If you cannot see it the host is
   probably too short to build any speed. Height first.

3. **A short host element.** The travel is the element's passage through the
   viewport. Something 200px tall crosses it in one flick.

4. **A soft or empty picture.** The warp is legible only where a straight line
   bends. Architecture, type, grids and horizons all show it; a portrait against a
   blurred background hides it completely.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
