You are adding **PointerFilings** from Beamish to this project.

> Iron filings aligning to a magnetic field, with the cursor as the magnet. Pointer · effect · MIT.
> https://beamish.ink/effects/pointer-filings

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The real dipole expression, not spokes radiating from a point. Filings align with the field rather than pointing at the magnet, and a dipole field loops: out of one pole, round, and back into the other
- The field is sampled once per filing rather than per pixel. Per pixel each segment bends into a curve, which no single filing does
- Window pointer scope, so the filings have begun to turn before the cursor reaches the element
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

**`src/beamish/effects/pointer-filings/core.ts`**

```ts
/*
 * PointerFilings: Beamish
 * https://beamish.ink/effects/pointer-filings
 *
 * Iron filings over a magnet, and the magnet is the cursor.
 *
 * Filings do not point at a magnet, which is the thing most versions of this get
 * wrong. They align with the field, and the field of a dipole loops: out of one
 * pole, round, and back into the other. Spokes radiating from a point are what a
 * single charge gives, and a single magnetic charge is not a thing that exists.
 *
 * So the shader evaluates the real dipole expression and lays a short segment
 * along it. The loops come out of the maths rather than being drawn.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface, type Pointer } from '../../shared/runtime'

export type PointerFilingsOptions = BaseOptions & {
  /** The tray the filings are scattered on. */
  paper: string
  /** A filing lying flat, away from the magnet. */
  ink: string
  /** A filing standing up in a strong field. */
  accent: string
  /** Cell size in CSS pixels. One filing per cell, so this is the scatter. */
  pitch: number
  /** Length of a filing, in cells, where the field is strongest. */
  length: number
  /** Half the thickness of a filing, in cells. */
  weight: number
  /** How far the magnet reaches before the filings stop caring. */
  reach: number
  /** How far each filing is thrown off the centre of its cell. */
  jitter: number
  /** Angle of the bar magnet, degrees. Turns the whole pattern. */
  tilt: number
  /** Paper tooth under the filings. */
  grain: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const pointerFilingsDefaults: PointerFilingsOptions = {
  paper: '#fbfaf4',
  ink: '#8d8577',
  accent: '#36362f',
  pitch: 13,
  length: 0.42,
  weight: 0.055,
  reach: 0.02,
  jitter: 0.6,
  tilt: 0,
  grain: 0.4,
  reducedMotionTime: 0,
  /*
   * Window scope, so the filings have already begun to turn as the cursor comes
   * toward the element rather than snapping the moment it crosses the edge.
   */
  pointerScope: 'window'
}

// beamish:shader-begin shaders/pointer-filings.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/pointer-filings.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * PointerFilings: iron filings over a magnet, and the magnet is the cursor.
 *
 * Filings do not point at a magnet, which is the thing most versions of this get
 * wrong. They align with the field, and the field of a dipole loops: out of one
 * pole, round, and back into the other. Spokes radiating from a point are what
 * you get from a single charge, and a single magnetic charge is not a thing that
 * exists.
 *
 * So this evaluates the real dipole expression. For a moment m at distance r the
 * field runs along 3(m . rhat)rhat - m, and every mark is a short segment laid
 * along it. The loops come out of the maths rather than being drawn.
 *
 * One mark per cell, thrown off centre, so the grid the marks are organised by
 * never shows. Each pixel is tested against the nine cells around it, because a
 * segment is long enough to cross well into its neighbours.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform vec2  u_pointer;
uniform float u_active;

uniform vec3  u_paper;
uniform vec3  u_ink;
uniform vec3  u_accent;
uniform float u_pitch;
uniform float u_length;
uniform float u_weight;
uniform float u_reach;
uniform float u_jitter;
uniform float u_tilt;
uniform float u_grain;

out vec4 fragColor;

const float DEG = 0.01745329252;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  return vec2(hash12(p), hash12(p + 37.19));
}

/*
 * Distance to a line segment of halfLen-length \`halfLen\` centred on the origin and
 * lying along \`dir\`. Clamping the projection is what makes it a segment rather
 * than an infinite line, and it is the whole of the shape.
 */
float segment(vec2 p, vec2 dir, float halfLen, float radius) {
  float t = clamp(dot(p, dir), -halfLen, halfLen);
  return length(p - dir * t) - radius;
}

/*
 * The field of a dipole with moment m at offset r. This is the expression a
 * physics text gives, minus the constants, which only scale something that is
 * normalised two lines later anyway.
 */
vec2 dipole(vec2 r, vec2 m) {
  float d = max(length(r), 1e-4);
  vec2 rhat = r / d;
  return (3.0 * dot(m, rhat) * rhat - m) / (d * d * d);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);

  // The pointer arrives 0 to 1 across the element with y down the page, and
  // gl_FragCoord counts up from the bottom.
  vec2 magnet = vec2(u_pointer.x, 1.0 - u_pointer.y) * cssRes;

  // The bar the moment lies along. Tilting it turns the whole pattern, which is
  // what you would do by turning the magnet on the bench.
  vec2 m = vec2(cos(u_tilt * DEG), sin(u_tilt * DEG));

  vec2 cell = cssPx / max(u_pitch, 2.0);
  vec2 id = floor(cell);
  vec2 f = fract(cell);

  float aa = max(fwidth(cell.x), fwidth(cell.y)) * 0.9 + 0.001;
  float cover = 0.0;
  float heat = 0.0;

  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 nid = id + vec2(float(ox), float(oy));
      vec2 jitter = (hash22(nid) - 0.5) * u_jitter;
      vec2 centre = vec2(float(ox), float(oy)) + 0.5 + jitter;

      // Where this mark sits on screen, so the field is sampled at the mark
      // rather than at the pixel. Sampling per pixel bends each segment into a
      // curve, which no single filing does.
      vec2 markPx = (id + centre) * max(u_pitch, 2.0);
      vec2 r = (markPx - magnet) / shortSide;

      vec2 b = dipole(r, m);
      float strength = length(b);
      vec2 dir = strength > 1e-6 ? b / strength : vec2(1.0, 0.0);

      /*
       * Near the magnet the dipole expression runs away to infinity, so the
       * falloff is a ratio rather than a product: it saturates at 1 instead of
       * producing a handful of enormous marks at the centre.
       */
      float pull = strength / (strength + 1.0 / max(u_reach, 0.001));

      // Unaligned filings lie flat and short; a strong field stands them up in
      // a line. Length carrying the strength is what makes the pattern legible
      // without the marks changing weight.
      float halfLen = u_length * mix(0.18, 1.0, pull);
      float sd = segment(f - centre, dir, halfLen, u_weight);
      float mark = smoothstep(aa, -aa, sd);

      cover = max(cover, mark);
      heat = max(heat, mark * pull);
    }
  }

  // Idle: with no pointer the field is centred and the pattern is static, which
  // is a filing tray nobody has touched rather than a broken effect.
  cover *= mix(0.55, 1.0, u_active);

  vec3 ink = mix(u_ink, u_accent, smoothstep(0.1, 0.55, heat));
  vec3 col = mix(u_paper, ink, cover);

  float tooth = hash12(floor(cssPx * 0.5) + 3.0) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_pointer',
  'u_active',
  'u_paper',
  'u_ink',
  'u_accent',
  'u_pitch',
  'u_length',
  'u_weight',
  'u_reach',
  'u_jitter',
  'u_tilt',
  'u_grain'
] as const

type UniformName = (typeof UNIFORMS)[number]

/** '#rgb' | '#rrggbb' | 'rgb(r g b)' → 0 to 1 triple. */
function parseColor(input: string): [number, number, number] {
  const value = input.trim()
  if (value.startsWith('#')) {
    let hex = value.slice(1)
    if (hex.length === 3) hex = hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!
    const n = Number.parseInt(hex.slice(0, 6), 16)
    if (Number.isNaN(n)) return [0, 0, 0]
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  }
  const nums = value.match(/[\d.]+/g)
  if (nums && nums.length >= 3) {
    return [Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255]
  }
  return [0, 0, 0]
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Foil: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Foil: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class PointerFilingsSurface implements Surface<PointerFilingsOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('Foil needs a canvas')
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
    if (!gl) throw new Error('Foil needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('Foil: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    // Shader objects are reference-counted by the program; drop our references
    // now so they are freed the moment the program is.
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`Foil: program failed to link\n${log ?? ''}`)
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
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
    this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight)
  }

  render(_t: number, opts: PointerFilingsOptions, pointer: Pointer): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)

    const loc = (name: UniformName) => this.locations.get(name) ?? null

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform2f(loc('u_pointer'), pointer.x, pointer.y)
    gl.uniform1f(loc('u_active'), pointer.active ? 1 : 0)
    gl.uniform3fv(loc('u_paper'), parseColor(opts.paper))
    gl.uniform3fv(loc('u_ink'), parseColor(opts.ink))
    gl.uniform3fv(loc('u_accent'), parseColor(opts.accent))
    gl.uniform1f(loc('u_pitch'), opts.pitch)
    gl.uniform1f(loc('u_length'), opts.length)
    gl.uniform1f(loc('u_weight'), opts.weight)
    gl.uniform1f(loc('u_reach'), opts.reach)
    gl.uniform1f(loc('u_jitter'), opts.jitter)
    gl.uniform1f(loc('u_tilt'), opts.tilt)
    gl.uniform1f(loc('u_grain'), opts.grain)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  context(): WebGL2RenderingContext | null {
    return this.gl
  }

  teardown(): void {
    const gl = this.gl
    if (!gl) return
    if (this.vao) gl.deleteVertexArray(this.vao)
    if (this.program) gl.deleteProgram(this.program)
    this.vao = null
    this.program = null
    this.locations.clear()
    this.gl = null
  }
}

/**
 * Mount Foil into `el`. The element needs a size. Give it width and height in
 * CSS, not just content.
 *
 * ```ts
 * const foil = createPointerFilings(document.querySelector('#stamp')!)
 * foil.start()
 * // …later
 * foil.destroy()
 * ```
 */
export function createPointerFilings(el: HTMLElement, opts: Partial<PointerFilingsOptions> = {}): EffectHandle {
  return mount<PointerFilingsOptions>(el, opts, {
    defaults: pointerFilingsDefaults,
    create: () => new PointerFilingsSurface()
  })
}

export default createPointerFilings
```

## 2. What it is

Iron filings scattered over a magnet, and the magnet is the cursor.

Filings do not point at a magnet. That is the thing most versions of this get
wrong, and it is why most of them look like a starburst rather than like a
physics demonstration. Filings align with the **field**, and the field of a
dipole loops: out of one pole, round through the space beside it, and back into
the other. Spokes radiating from a point are what a single charge gives, and a
single magnetic charge is not a thing that exists.

So this evaluates the real expression. For a moment **m** at displacement **r**
the field runs along `3(m · r̂)r̂ − m`, and every mark is a short segment laid
along it. The loops are a consequence of the maths rather than something drawn.

The field is sampled once per filing, at the filing, not per pixel. Sampling per
pixel bends each segment into a little curve, which no single filing does: a
filing is a rigid sliver of iron and it can only be straight.

Near the magnet the dipole expression runs away to infinity, so the falloff is a
ratio rather than a product. It saturates at 1 instead of producing a handful of
enormous marks on top of each other at the centre.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## 3. Wire it in

**Plain HTML.** The element needs a size of its own.

```html
<div id="tray" style="position: relative; height: 70vh"></div>

<script type="module">
  import { createPointerFilings } from './beamish/effects/pointer-filings/core.js'

  const filings = createPointerFilings(document.querySelector('#tray'))
  filings.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createPointerFilings } from '@/beamish/effects/pointer-filings/core'

export function Tray() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const filings = createPointerFilings(host.current)
    filings.start()
    return () => filings.destroy()
  }, [])

  return <div ref={host} className="tray" />
}
```

Do not put option values in the dependency array. Call `update()` instead: every
option is a uniform, so nothing rebuilds.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createPointerFilings } from '@/beamish/effects/pointer-filings/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let filings: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  filings = createPointerFilings(host.value)
  filings.start()
})

onBeforeUnmount(() => filings?.destroy())
</script>

<template>
  <div ref="host" class="tray" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The tray the filings are scattered on. |
| `ink` | color | `#8d8577` | any CSS hex | A filing lying flat, out where the field is weak. |
| `accent` | color | `#36362f` | any CSS hex | A filing standing up in a strong field. The pattern reads as much from this change in tone as from the alignment. |
| `pitch` | number | `13` | 5 to 40 | Cell size in CSS pixels. There is one filing per cell, so this is how thickly they are scattered. |
| `length` | number | `0.42` | 0.1 to 1.2 | Length of a filing where the field is strongest, measured in cells. Past about 0.9 they overlap into continuous lines, which is a field diagram rather than a tray of filings. |
| `weight` | number | `0.055` | 0.01 to 0.2 | Half the thickness of a filing, in cells. |
| `reach` | number | `0.02` | 0.002 to 0.2 | How far the magnet reaches before the filings stop caring. The falloff saturates rather than multiplying, so close to the magnet the marks stand fully up instead of running away to a few enormous ones. |
| `jitter` | number | `0.6` | 0 to 1 | How far each filing is thrown off the centre of its cell. At 0 the grid they are organised by becomes visible, which no scattered tray has. |
| `tilt` | number | `0` | 0 to 360 | Angle of the bar magnet in degrees. Turns the whole pattern, the way turning the magnet on the bench would. |
| `grain` | number | `0.4` | 0 to 1 | Paper tooth under the filings. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener, including the window-scoped pointer one.
Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

Nothing moves unless the cursor does, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn.

With no pointer the magnet sits in the middle of the element and the marks are
drawn at reduced contrast, so what gets drawn is a settled tray rather than an
empty rectangle. Nobody has to have moved anything for it to look finished.

## 7. The three mistakes most likely to be made here

1. **Expecting it to point at the cursor.** It does not, and that is correct. If
   you want spokes you want a monopole, which means not using a dipole
   expression at all.

2. **Raising `length` to make the pattern clearer.** It joins the marks into
   lines. The field is read from the alignment of separate marks; once they touch
   you have drawn the field instead of showing it. Raise `pitch` instead and the
   whole thing scales.

3. **A very small `pitch` on a large element.** At five pixels a cell on a
   full-width hero there are hundreds of thousands of filings, each a dipole
   evaluation, and the marks are too small to show their own direction.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
