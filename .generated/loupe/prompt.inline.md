You are adding **Loupe** from Beamish to this project.

> A printer's glass on the page: continuous tone until you look closely, then dots. Surfaces · effect · MIT.
> https://beamish.ink/effects/loupe

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The picture is the host element's own <img> child. It is hidden from sight and left in the document, so the alt text is whatever you wrote and a page with no JavaScript still shows it
- The screen ruling belongs to the print rather than to the viewer, so the cell is magnified along with everything else and turning the zoom up makes the dots bigger rather than finer
- Four plates at 15, 75, 0 and 45 degrees, with grey component replacement, so what resolves under the glass is a rosette rather than four screens fighting
- Nothing is integrated against the previous frame. The glass is exactly where the pointer is, so renderAtTime is pure in t and a scripted path replays identically
- No fwidth anywhere. The lens sits inside a branch and derivatives in non-uniform control flow are undefined, so every edge width is worked out from the device pixel ratio instead
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
    if (!running) draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed)
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

**`src/beamish/effects/loupe/core.ts`**

```ts
/*
 * Loupe: Beamish
 * https://beamish.ink/effects/loupe
 *
 * A printer's glass laid on the page.
 *
 * The picture is continuous tone until you look closely, and then it is dots.
 * That is not a stylisation. It is what a printed photograph is, and it is the
 * one thing a screen never shows you: away from the glass the halftone is finer
 * than the eye resolves and reads as tone, which is the entire reason printing
 * works, and under the glass it resolves into four screens at four angles.
 *
 * So the dots are not drawn at whatever size looks good. They are drawn at
 * `screen` pixels in the print and magnified along with everything else, which
 * is why turning `zoom` up makes them bigger rather than finer. A screen ruling
 * belongs to the press, not to the person looking.
 *
 * The picture comes from the host element's own <img> child rather than from an
 * option, so the alt text is whatever was written and a page whose script never
 * runs still shows the photograph.
 *
 * Nothing is integrated against the previous frame. The glass is exactly where
 * the pointer is, which is also what a glass held in a hand does, so
 * `renderAtTime` stays pure and a scripted path replays identically.
 */

import { mount, type BaseOptions, type EffectHandle, type Pointer, type Surface } from '../../shared/runtime'

export type LoupeOptions = BaseOptions & {
  /** The sheet the picture is printed on. */
  paper: string
  /** The cyan plate. */
  cyan: string
  /** The magenta plate. */
  magenta: string
  /** The yellow plate. */
  yellow: string
  /** The black plate, which also tints the barrel. */
  black: string
  /** Radius of the glass, as a share of the short side. */
  size: number
  /** How much it magnifies. */
  zoom: number
  /** The print's screen ruling, as a cell in CSS pixels before magnification. */
  screen: number
  /** How much the magnification eases off towards the rim. */
  bulge: number
  /** Lateral colour at the rim, which every simple lens has. */
  fringe: number
  /** How strongly the barrel reads: the ring and the shade inside it. */
  rim: number
  /** Paper tooth over the whole thing. */
  grain: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const loupeDefaults: LoupeOptions = {
  paper: '#fbfaf4',
  cyan: '#1fb6e3',
  magenta: '#e5157f',
  yellow: '#ffe800',
  black: '#2b2721',
  size: 0.26,
  zoom: 2.6,
  screen: 2,
  bulge: 0.35,
  fringe: 0.012,
  rim: 0.8,
  grain: 0.3,
  reducedMotionTime: 0
}

// beamish:shader-begin shaders/loupe.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/loupe.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * Loupe: a printer's glass laid on the page.
 *
 * The picture is continuous tone until you look closely, and then it is dots.
 * That is not a stylisation, it is what a printed photograph is, and it is the
 * one thing a screen never shows you. Away from the glass the halftone is finer
 * than the eye resolves and reads as tone, which is exactly why printing works
 * at all. Under the glass it resolves into four screens at four angles, and the
 * rosette they make is the thing worth magnifying.
 *
 * So the dots are not drawn at a size that looks good. They are drawn at
 * \`screen\` CSS pixels in the print and magnified by \`zoom\` along with
 * everything else, which is why turning the magnification up makes them bigger
 * rather than finer.
 *
 * Nothing here is antialiased with fwidth. The whole lens sits inside a branch,
 * and derivatives in non-uniform control flow are undefined, so the edge width
 * is worked out from the device pixel ratio instead. It is exact rather than
 * estimated, because a cell is a known size.
 */

uniform sampler2D u_image;
uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform float u_dpr;
uniform vec2  u_pointer;
uniform float u_active;

uniform vec3  u_paper;
uniform vec3  u_cyan;
uniform vec3  u_magenta;
uniform vec3  u_yellow;
uniform vec3  u_black;
uniform float u_size;
uniform float u_zoom;
uniform float u_screen;
uniform float u_bulge;
uniform float u_fringe;
uniform float u_rim;
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

vec3 plate(vec2 uv, vec2 frame, vec2 image) {
  return texture(u_image, cover(vec2(uv.x, 1.0 - uv.y), frame, image)).rgb;
}

/*
 * One screen's worth of dot coverage at a point.
 *
 * \`amount\` is how much ink that plate wants, 0 to 1, and the dot's *area* is
 * what carries it, so the radius goes as its square root. A halftone that
 * scales the radius instead is a third too dark in the midtones, which is the
 * single most common way to get this wrong.
 *
 * Neighbours as well as the cell the point is in. Past half a cell a dot
 * reaches into the next one, and testing only its own cell clips it square: at
 * seventy percent coverage you get rounded boxes rather than dots touching.
 */
float screenDot(vec2 pagePx, float amount, float angleDeg, float cell, float aa) {
  if (amount <= 0.0001) return 0.0;

  vec2 p = rot(pagePx, angleDeg * DEG) / cell;
  vec2 id = floor(p);
  vec2 f = p - id;

  /*
   * Area, not radius, and with the right constant.
   *
   * A circle of radius r in a unit cell covers pi * r * r, so the radius that
   * lays exactly \`amount\` of ink is sqrt(amount / pi). Writing it as
   * sqrt(amount) * 0.5 instead, which is the version everybody writes, tops out
   * at pi / 4 of the cell: every tone comes out at 78.5 percent of the ink it
   * asked for and the whole screen sits visibly lighter than the picture it is
   * made from.
   *
   * Past 0.7854 the dots touch and start to overlap, where the closed form
   * stops being closed. The radius runs on to sqrt(2)/2, which is where four
   * neighbours meet at the cell's corner and the last of the paper goes.
   */
  float a = clamp(amount, 0.0, 1.0);
  float radius = a <= 0.7854
    ? sqrt(a / 3.14159265)
    : mix(0.5, 0.70711, (a - 0.7854) / 0.2146);

  float cov = 0.0;
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 centre = vec2(float(ox), float(oy)) + 0.5;
      cov = max(cov, smoothstep(radius + aa, radius - aa, length(f - centre)));
    }
  }
  return cov;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 uv = cssPx / cssRes;

  vec3 col = plate(uv, u_resolution, u_imageSize);

  /*
   * The glass, in short-side units so it stays round and keeps its size when
   * the element changes shape.
   */
  vec2 centre = vec2(u_pointer.x, 1.0 - u_pointer.y) * cssRes;
  vec2 fromCentre = (cssPx - centre) / shortSide;
  float r = length(fromCentre);
  float radius = max(u_size, 0.001);

  // One CSS pixel, in the units the glass is measured in. Every edge below is
  // specified in those, so the barrel is the same weight on any display.
  float pixel = 1.0 / shortSide;

  /*
   * The shadow reaches outside the glass, so the branch has to as well. Still a
   * branch: it is a ring a few pixels wide around a circle, and the rest of the
   * frame pays one texture read.
   */
  float shadow = 7.0 * pixel * u_rim;

  if (u_active > 0.5 && r < radius + shadow) {
    float k = r / radius;

    /*
     * A real loupe is a lens, so the magnification is not uniform across it:
     * the middle is strongest and it eases off towards the rim, which is what
     * stops the edge reading as a hole cut in the picture.
     */
    float lens = u_zoom * (1.0 - u_bulge * k * k);
    vec2 lensPx = centre + (cssPx - centre) / max(lens, 1.0);
    vec2 lensUV = lensPx / cssRes;

    /*
     * Lateral colour, which every simple lens has and every one shows most at
     * the rim. Sampling the three channels at three slightly different
     * magnifications is the cheap and correct way round: the error is radial
     * and it grows outward.
     */
    float shift = u_fringe * k * k;
    vec2 red = centre + (cssPx - centre) / max(lens * (1.0 - shift), 1.0);
    vec2 blue = centre + (cssPx - centre) / max(lens * (1.0 + shift), 1.0);

    vec3 ink = vec3(
      plate(red / cssRes, u_resolution, u_imageSize).r,
      plate(lensUV, u_resolution, u_imageSize).g,
      plate(blue / cssRes, u_resolution, u_imageSize).b
    );

    /*
     * Four plates off three channels. Grey component replacement: whatever
     * amount of cyan, magenta and yellow all three have in common is pulled out
     * and printed as black instead, which is what a press does and the reason a
     * shadow in a printed photograph is not a muddy brown.
     */
    vec3 cmy = clamp(1.0 - ink, 0.0, 1.0);
    float black = min(cmy.r, min(cmy.g, cmy.b));
    cmy -= black;

    /*
     * Cell size in page pixels, magnified with everything else. The screen
     * ruling belongs to the print, not to the viewer, so turning the
     * magnification up has to make the dots bigger and not finer.
     */
    float cell = max(u_screen, 0.5) * max(lens, 1.0);
    float aa = 0.8 / cell;
    vec2 pagePx = cssPx - centre;

    /*
     * Fifteen, seventy-five, zero and forty-five degrees. Those four are not
     * decoration: thirty degrees between the strong plates is what keeps their
     * interference down to the fine rosette instead of a coarse plaid, and
     * yellow goes at zero because it is the one you cannot see anyway.
     */
    float dc = screenDot(pagePx, cmy.r, 15.0, cell, aa);
    float dm = screenDot(pagePx, cmy.g, 75.0, cell, aa);
    float dy = screenDot(pagePx, cmy.b, 0.0, cell, aa);
    float dk = screenDot(pagePx, black, 45.0, cell, aa);

    // Multiplied, in plate order. Ink on ink subtracts; two dots crossing are
    // darker than either, which is the whole reason a rosette reads as colour.
    vec3 printed = u_paper;
    printed *= mix(vec3(1.0), u_yellow, dy);
    printed *= mix(vec3(1.0), u_cyan, dc);
    printed *= mix(vec3(1.0), u_magenta, dm);
    printed *= mix(vec3(1.0), u_black, dk);

    // Inside the glass only, and antialiased against the page behind it.
    float inside = smoothstep(radius + pixel, radius - pixel, r);
    col = mix(col, printed, inside);

    /*
     * The barrel, which is three things rather than one.
     *
     * A shadow on the page outside it, because the glass is an object sitting
     * on the paper and an object sitting on paper casts one. A rim, which is
     * the tube itself. And a short fall into shade just inside the rim, because
     * you are looking down a tube. Any one of them alone leaves the magnified
     * patch floating, and a floating patch reads as a filter applied to part of
     * the picture rather than as something resting on it.
     */
    float dropped = smoothstep(radius + shadow, radius, r) * (1.0 - inside);
    col *= 1.0 - dropped * 0.3 * u_rim;

    float ring = smoothstep(radius + pixel * 0.5, radius - pixel * 0.5, r)
      * smoothstep(radius - pixel * 3.0, radius - pixel * 2.0, r);
    float shade = smoothstep(radius * 0.74, radius, r) * inside;
    col *= 1.0 - shade * 0.22 * u_rim;
    col = mix(col, u_black * 0.5, ring * u_rim);
  }

  float tooth = hash12(floor(cssPx * 0.5) + 3.0) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_image',
  'u_resolution',
  'u_imageSize',
  'u_dpr',
  'u_pointer',
  'u_active',
  'u_paper',
  'u_cyan',
  'u_magenta',
  'u_yellow',
  'u_black',
  'u_size',
  'u_zoom',
  'u_screen',
  'u_bulge',
  'u_fringe',
  'u_rim',
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
  if (!shader) throw new Error('Loupe: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Loupe: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class LoupeSurface implements Surface<LoupeOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private texture: WebGLTexture | null = null
  private imageSize = { width: 1, height: 1 }
  private image: HTMLImageElement | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('Loupe needs a canvas')
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
    if (!gl) throw new Error('Loupe needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('Loupe: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`Loupe: program failed to link\n${log ?? ''}`)
    }

    this.gl = gl
    this.program = program
    this.vao = gl.createVertexArray()
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    /*
     * No mipmaps and a linear magnification filter. The glass samples the image
     * at well under one texel per pixel, which is the case mipmaps are no help
     * for, and a nearest filter would show the source image's own pixel grid
     * under magnification rather than the screen the effect is drawing.
     */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    this.texture = texture
    this.imageSize = { width: image.naturalWidth, height: image.naturalHeight }
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
    this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight)
  }

  render(_t: number, opts: LoupeOptions, pointer: Pointer): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    // A late-decoding image still has to get in. Cheap: it returns at once once
    // the texture exists.
    if (this.image && !this.texture) this.upload(this.image)

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)

    const loc = (name: UniformName) => this.locations.get(name) ?? null

    if (this.texture) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.texture)
      gl.uniform1i(loc('u_image'), 0)
    }

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform2f(loc('u_imageSize'), this.imageSize.width, this.imageSize.height)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform2f(loc('u_pointer'), pointer.x, pointer.y)
    gl.uniform1f(loc('u_active'), pointer.active ? 1 : 0)
    gl.uniform3fv(loc('u_paper'), rgb(opts.paper))
    gl.uniform3fv(loc('u_cyan'), rgb(opts.cyan))
    gl.uniform3fv(loc('u_magenta'), rgb(opts.magenta))
    gl.uniform3fv(loc('u_yellow'), rgb(opts.yellow))
    gl.uniform3fv(loc('u_black'), rgb(opts.black))
    gl.uniform1f(loc('u_size'), opts.size)
    gl.uniform1f(loc('u_zoom'), opts.zoom)
    gl.uniform1f(loc('u_screen'), opts.screen)
    gl.uniform1f(loc('u_bulge'), opts.bulge)
    gl.uniform1f(loc('u_fringe'), opts.fringe)
    gl.uniform1f(loc('u_rim'), opts.rim)
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
    // The markup was borrowed, not owned.
    if (this.image) this.image.style.visibility = ''
    this.gl = null
    this.program = null
    this.vao = null
    this.texture = null
    this.image = null
    this.locations.clear()
  }
}

/**
 * Mount Loupe into `el`. The element needs a size and one `<img>` child.
 *
 * ```html
 * <figure id="plate" style="position: relative; aspect-ratio: 3 / 2">
 *   <img src="/press.jpg" alt="What the picture shows" />
 * </figure>
 * ```
 *
 * ```ts
 * const loupe = createLoupe(document.querySelector('#plate')!)
 * loupe.start()
 * ```
 */
export function createLoupe(el: HTMLElement, opts: Partial<LoupeOptions> = {}): EffectHandle {
  return mount<LoupeOptions>(el, opts, {
    defaults: loupeDefaults,
    create: () => new LoupeSurface()
  })
}

export default createLoupe
```

## 2. What it is

A printer's glass laid on the page.

The picture is continuous tone until you look closely, and then it is dots. That
is not a stylisation. It is what a printed photograph is, and it is the one
thing a screen never shows you: away from the glass the halftone is finer than
the eye resolves and reads as tone, which is the entire reason printing works at
all, and under the glass it resolves into four screens at four angles.

So the dots are not drawn at whatever size looks good. They are drawn at
`screen` pixels in the print and magnified along with everything else, which is
why turning `zoom` up makes them bigger rather than finer. A screen ruling
belongs to the press, not to the person looking at it.

The four angles are 15, 75, 0 and 45 degrees, and they are not decoration.
Thirty degrees between the strong plates is what keeps their interference down
to a fine rosette instead of a coarse plaid, and yellow sits at zero because it
is the plate you cannot see anyway. The ink that all three of cyan, magenta and
yellow have in common is pulled out and printed as black instead, which is what
a press does and the reason a shadow in a printed photograph is not a muddy
brown.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The sheet the picture is printed on. It shows between the dots, so it is most of what you see in the light passages under the glass. |
| `cyan` | color | `#1fb6e3` | any CSS hex | The cyan plate. |
| `magenta` | color | `#e5157f` | any CSS hex | The magenta plate. |
| `yellow` | color | `#ffe800` | any CSS hex | The yellow plate. Barely visible on its own, which is why it goes at zero degrees where the interference would show most. |
| `black` | color | `#2b2721` | any CSS hex | The black plate, which also tints the barrel. A desaturated near-black reads as ink; pure black reads as a hole. |
| `size` | number | `0.26` | 0.05 to 0.6 | Radius of the glass, as a share of the short side, so it keeps its size when the element changes shape. Past about 0.4 it stops being a glass on a picture and becomes a picture with a border. |
| `zoom` | number | `2.6` | 1 to 12 | How much it magnifies. This magnifies the screen as well as the picture, because the ruling belongs to the press: turning it up makes the dots bigger, never finer. |
| `screen` | number | `2` | 1 to 12 | The print's screen ruling, as a cell in CSS pixels before magnification. Low is a fine screen and a magazine; high is a coarse one and a newspaper. Below about 2 the rosette is finer than the glass can show and you get tone under the glass as well as outside it, which is the one setting that defeats the whole thing. |
| `bulge` | number | `0.35` | 0 to 1 | How much the magnification eases off towards the rim, the way a real lens does. At 0 the glass magnifies evenly and the edge reads as a hole cut in the picture rather than as something resting on it. |
| `fringe` | number | `0.012` | 0 to 0.06 | Lateral colour at the rim. Every simple lens has it and every one shows it most at the edge, so a little is what makes the glass read as glass. Past about 0.03 it reads as a broken monitor. |
| `rim` | number | `0.8` | 0 to 1 | How strongly the barrel reads: the ring and the short fall into shade just inside it. This is what makes the glass an object sitting on the page rather than a filter applied to part of it. |
| `grain` | number | `0.3` | 0 to 1 | Paper tooth over the whole thing, inside the glass and out. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, deletes the texture, cancels the RAF,
disconnects both observers, removes every listener and puts the `<img>` back the
way it found it. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

Nothing moves unless the cursor does, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn, which means the glass never appears and what you have is the
photograph. That is the right resting state rather than a compromise: the
picture is the content and the glass was always an extra.

## 7. The three mistakes most likely to be made here

1. **A cross-origin image.** `texImage2D` throws a SecurityError on an image
   from another origin without CORS headers, and the catch is that it throws at
   upload rather than at load, so the picture appears and the glass does not.
   Serve the image from your own origin or set `crossorigin`.

2. **Setting `screen` very low to make it look sharper.** It makes the rosette
   finer than the glass can show, so the magnified patch is tone and the whole
   point of the thing is gone. Coarser is the direction that helps.

3. **Expecting the dots to stay the same size as you zoom.** They are in the
   print, so they magnify. An effect where they did not would be a screen laid
   over the viewer's eye rather than over the paper.

4. **Using it on a decorative background behind text.** It magnifies, so
   whatever is under the glass moves, and moving the background of a paragraph
   somebody is reading is the one thing a page should not do.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
