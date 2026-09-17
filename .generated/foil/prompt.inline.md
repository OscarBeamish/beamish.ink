You are adding **Foil** from Beamish to this project.

> A hot-foil stamp on paper, raked by the light your cursor carries. Pointer · effect · MIT.
> https://beamish.ink/effects/foil

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- WebGL2 for gl_VertexID; there is no WebGL1 fallback and none is planned
- Pointer-driven, never pointer-dependent. With no cursor the light orbits on its own, so it works on touch and under reduced motion
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
   * Velocity is measured on the scroll event and bled off in the frame loop
   * rather than being recomputed per frame. A scroll event does not fire every
   * frame, so a per-frame difference reads zero on most of them and the effect
   * stutters. Decaying instead means a flick lands once and eases out.
   *
   * This is the one piece of state in the runtime that is not a function of `t`,
   * which is why `scrollPath` exists to replace it wholesale for the recorder.
   */
  let scrollMeasuredAt = 0
  function decayScroll(dt: number) {
    if (scroll.velocity === 0) return
    // Halves roughly every 90ms. Slow enough to feel like weight, fast enough
    // that the effect is at rest by the time the reader has stopped.
    const keep = Math.pow(0.0005, dt)
    scroll.velocity *= keep
    if (Math.abs(scroll.velocity) < 1e-4) scroll.velocity = 0
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
    decayScroll(dt)
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

  const readScroll = () => {
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

    const now = performance.now()
    const gap = (now - scrollMeasuredAt) / 1000
    // The first event has no previous sample to difference against, and a stale
    // one after a long pause would read as an enormous flick.
    if (scrollMeasuredAt > 0 && gap > 0 && gap < 0.25) {
      scroll.velocity = (next - scroll.progress) / gap
    }
    scrollMeasuredAt = now
    scroll.progress = next
    scroll.active = true
  }

  // Passive: this never calls preventDefault, and saying so lets the browser
  // scroll without waiting to find out.
  window.addEventListener('scroll', readScroll, { passive: true })
  readScroll()

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
      window.removeEventListener('scroll', readScroll)
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

**`src/beamish/effects/foil/core.ts`**

```ts
/*
 * Foil: Beamish
 * https://beamish.ink/effects/foil
 *
 * A hot-foil stamp on paper, lit by the cursor. Moving the pointer rakes the
 * highlight across the relief the way tilting a real foil-stamped card does.
 * WebGL2, no three.js, no dependencies.
 *
 * With no pointer the light takes a slow closed orbit of its own, so the panel
 * is alive before anyone touches it, and the recorded loop still has no seam.
 *
 * The GL boilerplate is inline rather than imported. This file is published and
 * read on its own, and a reader should not have to fetch a second module to find
 * out how a program gets compiled.
 *
 * The shader source is generated from shaders/foil.frag and shaders/foil.vert.
 * Edit those, then run `pnpm generate`. The markers are load-bearing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface, type Pointer } from '../../shared/runtime'

export type FoilOptions = BaseOptions & {
  /** The paper the stamp is pressed into. Match it to your page background. */
  paper: string
  /** The foil in shadow. */
  foilLow: string
  /** The foil at the highlight. */
  foilHigh: string
  /** Points on the rosette. */
  spokes: number
  /** Size of the stamp relative to the shorter side of the element. */
  scale: number
  /** Depth of the brushed relief, 0 to 1. */
  relief: number
  /** How tight the highlight is, 0 to 1. */
  sharpness: number
  /** Spectral shift at grazing angles, 0 to 1. */
  iridescence: number
  /** How far above the surface the light sits. Low is a harder rake. */
  lightHeight: number
  /** Paper tooth, 0 to 1. Static, not film grain. */
  grain: number
  /** Seconds for one orbit of the idle light. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const foilDefaults: FoilOptions = {
  paper: '#fbfaf4',
  foilLow: '#7a3410',
  foilHigh: '#f0b070',
  spokes: 12,
  scale: 0.86,
  relief: 0.38,
  sharpness: 0.42,
  iridescence: 0.3,
  lightHeight: 0.42,
  grain: 0.3,
  period: 5,
  reducedMotionTime: 0.9
}

// beamish:shader-begin shaders/foil.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/foil.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * Foil: a hot-foil stamp on paper, lit by the cursor.
 *
 * The stamp is an SDF rosette with a brushed relief pressed into it. The cursor
 * is the light: a point source just above the surface, so moving it rakes the
 * highlight across the foil the way tilting a real foil-stamped card does.
 *
 * There is no texture and no image. The whole thing is the height field, its
 * gradient, and one specular term.
 */

uniform vec2  u_resolution;   // drawing buffer, device px
uniform float u_dpr;
uniform float u_time;
uniform float u_period;
uniform vec2  u_pointer;      // 0..1 across the element, y down
uniform float u_pointerActive;
uniform vec3  u_paper;
uniform vec3  u_foilLow;
uniform vec3  u_foilHigh;
uniform float u_spokes;
uniform float u_scale;
uniform float u_relief;
uniform float u_sharpness;
uniform float u_iridescence;
uniform float u_lightHeight;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * The stamp, as a height field in 0..1. Everything the light does is derived
 * from this one function, sampled five times per pixel: once for the mask and
 * four times for the gradient.
 */
float stamp(vec2 p, float spokes, float relief) {
  float r = length(p);
  float a = atan(p.y, p.x);

  // Petal boundary: a circle modulated by a cosine, which is the whole rosette.
  float edge = 0.60 + 0.15 * cos(a * spokes);
  float body = smoothstep(edge, edge - 0.05, r);

  // A hub, so the centre does not collapse where the petals meet.
  float hub = smoothstep(0.21, 0.17, r);

  // A thin ring holding the composition together.
  float ring = smoothstep(0.92, 0.885, r) * smoothstep(0.825, 0.86, r);

  float mask = clamp(max(max(body, hub), ring), 0.0, 1.0);

  // Brushed relief. This is the part the highlight rakes over. Without it the
  // foil is a flat shape that changes brightness, which reads as plastic.
  //
  // The amplitude falls away towards the centre. Radial lines all converge on
  // the origin, and at full strength that convergence is the first thing the eye
  // goes to, which is not what the piece is about.
  float brush = 0.5 + 0.5 * sin(a * spokes * 3.0 + r * 24.0);
  float depth = relief * smoothstep(0.12, 0.42, r);
  return mask * (1.0 - depth * 0.5 + depth * 0.5 * brush);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  // Origin at the centre, ±1 across the short axis.
  vec2 p = (cssPx - cssRes * 0.5) / (shortSide * 0.5);
  p /= max(u_scale, 0.05);

  // gl_FragCoord counts up from the bottom and the pointer counts down from the
  // top, so one of them has to be flipped. It is always this line that is wrong.
  vec2 pointerPx = vec2(u_pointer.x * cssRes.x, (1.0 - u_pointer.y) * cssRes.y);
  vec2 lightXY = (pointerPx - cssRes * 0.5) / (shortSide * 0.5) / max(u_scale, 0.05);

  // With no pointer the light takes a slow closed orbit, so the effect is alive
  // before anyone touches it and the loop still has no seam.
  float phase = TAU * u_time / max(u_period, 0.001);
  vec2 idle = vec2(cos(phase), sin(phase)) * 0.85;
  lightXY = mix(idle, lightXY, u_pointerActive);

  float height = stamp(p, u_spokes, u_relief);

  // Finite differences in world units rather than screen derivatives, so the
  // relief is the same depth at any resolution or DPR.
  float eps = 2.4 / shortSide / max(u_scale, 0.05);
  float dx = stamp(p + vec2(eps, 0.0), u_spokes, u_relief) - stamp(p - vec2(eps, 0.0), u_spokes, u_relief);
  float dy = stamp(p + vec2(0.0, eps), u_spokes, u_relief) - stamp(p - vec2(0.0, eps), u_spokes, u_relief);
  vec3 normal = normalize(vec3(-dx * 0.55, -dy * 0.55, 2.0 * eps));

  vec3 toLight = normalize(vec3(lightXY - p, max(u_lightHeight, 0.05)));
  vec3 toEye = vec3(0.0, 0.0, 1.0);
  vec3 half3 = normalize(toLight + toEye);
  float ndh = clamp(dot(normal, half3), 0.0, 1.0);
  float ndl = clamp(dot(normal, toLight), 0.0, 1.0);

  float tight = pow(ndh, 8.0 + u_sharpness * 220.0);
  float broad = pow(ndh, 3.0);

  // Metal has almost no diffuse term. The colour comes from the highlight, which
  // is why a foil looks like foil and a matte print does not.
  vec3 foil = mix(u_foilLow, u_foilHigh, smoothstep(0.15, 0.95, ndh));

  // A narrow spectral shift near grazing angles. Restrained on purpose. A full
  // rainbow is a hologram, not a foil.
  float shift = fract(ndh * 1.6 + 0.35);
  vec3 spectral = 0.5 + 0.5 * cos(TAU * (vec3(0.0, 0.28, 0.55) + shift));
  foil = mix(foil, foil * (0.6 + 0.8 * spectral), u_iridescence * (1.0 - ndh) * 0.9);

  foil += vec3(1.0, 0.97, 0.92) * tight * 1.35;
  foil += u_foilHigh * broad * 0.22;
  foil *= 0.48 + 0.52 * ndl;

  // The stamp is pressed into the paper, so it throws a short shadow away from
  // the light. Sampling the height field at an offset is the cheapest honest way
  // to get one.
  vec2 offset = normalize(vec2(lightXY - p) + vec2(1e-5)) * 0.014;
  float under = stamp(p - offset, u_spokes, u_relief);
  float press = clamp(under - height, 0.0, 1.0);

  vec3 col = u_paper * (1.0 - press * 0.22);
  col = mix(col, foil, clamp(height * 1.35, 0.0, 1.0));

  // Paper tooth, static. Animated grain flickers, and a flicker this fine is
  // exactly what WCAG 2.3.1 is about.
  float tooth = hash12(floor(cssPx * 0.5)) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_pointer',
  'u_pointerActive',
  'u_paper',
  'u_foilLow',
  'u_foilHigh',
  'u_spokes',
  'u_scale',
  'u_relief',
  'u_sharpness',
  'u_iridescence',
  'u_lightHeight',
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

class FoilSurface implements Surface<FoilOptions> {
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

  render(t: number, opts: FoilOptions, pointer: Pointer): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)

    const at = (name: UniformName) => this.locations.get(name) ?? null
    gl.uniform2f(at('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(at('u_dpr'), this.size.dpr)
    gl.uniform1f(at('u_time'), t)
    gl.uniform1f(at('u_period'), opts.period)
    gl.uniform2f(at('u_pointer'), pointer.x, pointer.y)
    gl.uniform1f(at('u_pointerActive'), pointer.active ? 1 : 0)
    gl.uniform3fv(at('u_paper'), parseColor(opts.paper))
    gl.uniform3fv(at('u_foilLow'), parseColor(opts.foilLow))
    gl.uniform3fv(at('u_foilHigh'), parseColor(opts.foilHigh))
    gl.uniform1f(at('u_spokes'), opts.spokes)
    gl.uniform1f(at('u_scale'), opts.scale)
    gl.uniform1f(at('u_relief'), opts.relief)
    gl.uniform1f(at('u_sharpness'), opts.sharpness)
    gl.uniform1f(at('u_iridescence'), opts.iridescence)
    gl.uniform1f(at('u_lightHeight'), opts.lightHeight)
    gl.uniform1f(at('u_grain'), opts.grain)

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
 * const foil = createFoil(document.querySelector('#stamp')!)
 * foil.start()
 * // …later
 * foil.destroy()
 * ```
 */
export function createFoil(el: HTMLElement, opts: Partial<FoilOptions> = {}): EffectHandle {
  return mount<FoilOptions>(el, opts, {
    defaults: foilDefaults,
    create: () => new FoilSurface()
  })
}

export default createFoil
```

## 2. What it is

Foil is a hot-foil stamp pressed into paper, and the cursor is the light. Move it
and the highlight rakes across the relief the way tilting a real foil-stamped
card does: a narrow band of brightness travelling over a brushed surface, picking
up a little colour at the grazing edges.

There is no image and no texture. The stamp is a signed-distance rosette with a
brushed relief written into its height field. The light is a point source sitting
just above the surface at the cursor. Everything you see is that height field,
its gradient, and one specular term. WebGL2, one full-screen triangle, no npm
dependencies.

It is pointer-driven, never pointer-dependent. With no cursor, on touch, or
before anyone has moved the mouse, the light takes a slow closed orbit of its
own. The panel is alive on arrival and the loop still has no seam.

## 3. Wire it in

**Plain HTML.** Give the host element a size. The canvas fills it, so an element
with no height renders nothing.

```html
<div id="stamp" style="width: 100%; aspect-ratio: 1"></div>

<script type="module">
  import { createFoil } from './beamish/effects/foil/core.js'

  const foil = createFoil(document.querySelector('#stamp'), {
    foilHigh: '#f0b070'
  })
  foil.start()
</script>
```

**React.** Start in an effect. Destroy in its cleanup. StrictMode runs the effect
twice in development. That is fine, because `destroy()` fully releases the
context, which is the case StrictMode exists to catch.

```tsx
import { useEffect, useRef } from 'react'
import { createFoil } from '@/beamish/effects/foil/core'

export function Stamp() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const foil = createFoil(host.current, { spokes: 12 })
    foil.start()
    return () => foil.destroy()
  }, [])

  return <div ref={host} className="aspect-square w-full" />
}
```

Do not put option values in the dependency array. That tears the context down and
rebuilds it on every keystroke. Call `update()` instead:

```tsx
useEffect(() => {
  foilRef.current?.update({ spokes })
}, [spokes])
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createFoil } from '@/beamish/effects/foil/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let foil: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  foil = createFoil(host.value, { spokes: 12 })
  foil.start()
})

onBeforeUnmount(() => foil?.destroy())
</script>

<template>
  <div ref="host" class="stamp" />
</template>
```

**Astro.** Nothing extra is required. Use the React or Vue file as an island with
`client:visible`, or call `createFoil` from a plain `<script>` in the page. The
core is a standard ES module with no framework in it.

**Driving the light yourself.** The pointer is read from the element the effect
is mounted into. To drive the light from something else, a scripted path, a
scroll position, or an element elsewhere on the page, pass `pointerPath` as a
list of `{ t, x, y }` keys in 0 to 1 element coordinates, plus
`pointerPathDuration`. The runtime samples it at exactly the time being drawn and
ignores the live pointer. That is how the video on the site is recorded.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper the stamp is pressed into. Match it to your page background or the panel reads as a pasted-in rectangle. |
| `foilLow` | color | `#7a3410` | any CSS hex | The foil where the light does not reach. Metal takes almost all its colour from the highlight, so this wants to be genuinely dark. |
| `foilHigh` | color | `#f0b070` | any CSS hex | The foil at the highlight. Copper by default; a pale grey here gives silver, a yellow gives gold. |
| `spokes` | number | `12` | 3 to 40 (looks right between 8 and 18) | Points on the rosette. Above about 24 the petals are narrower than the relief and it turns into a disc. |
| `scale` | number | `0.86` | 0.3 to 1.6 (looks right between 0.7 and 1.1) | Size of the stamp relative to the shorter side of the element. |
| `relief` | number | `0.38` | 0 to 1 (looks right between 0.35 and 0.7) | Depth of the brushed relief. At zero the foil is a flat shape that changes brightness, which reads as plastic rather than metal. |
| `sharpness` | number | `0.42` | 0 to 1 (looks right between 0.3 and 0.65) | How tight the highlight is. High is a mirror finish, low is a brushed one. |
| `iridescence` | number | `0.3` | 0 to 1 (looks right between 0.15 and 0.45) | Spectral shift at grazing angles. Past about 0.6 it stops being a foil and becomes a hologram. |
| `lightHeight` | number | `0.42` | 0.05 to 2 (looks right between 0.3 and 0.7) | How far above the surface the cursor's light sits. Low is a hard raking light that sweeps a narrow band; high floods the whole stamp at once. |
| `grain` | number | `0.3` | 0 to 1 | Paper tooth. Static by design. Animated grain flickers, and a flicker this fine is what WCAG 2.3.1 exists to prevent. |
| `period` | number | `5` | 2 to 60 s (looks right between 5 and 20) | Seconds for one orbit of the idle light, which is the motion used when no pointer is present. Exactly periodic, so the loop has no seam. |
| `reducedMotionTime` | number | `0.9` | 0 to 60 s | The single frame shown when the user prefers reduced motion. Pick a light angle where the relief is legible. |

## 5. Cleanup and SSR

Call `destroy()`. It releases the WebGL context, cancels the RAF, disconnects
both observers, and removes every listener including the pointer ones.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createFoil` touches `document` and `matchMedia`
at call time. Put the call inside `useEffect`, `onMounted`, or a `client:*`
island. Next.js App Router needs `'use client'` at the top of the component file.

The runtime pauses the loop when the element scrolls offscreen and when the tab
is hidden.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A. Content that moves for more than five seconds must be
pausable, and the idle orbit qualifies. `stop()` and `start()` are on the handle
for that. Surface them as a real control in your own build.

Stopping the loop holds the last frame. The motion pauses and the object stays on
screen, which is the correct behaviour.

Handled in the runtime with a live `matchMedia` listener, so changing the OS
setting mid-session takes effect without a reload. Under reduced motion the idle
orbit never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

Foil degrades unusually well. A stamped emblem lit from one side is a finished
thing to look at and nobody would guess it was meant to move. Pick a light angle
where the relief is legible rather than one where the highlight is brightest.

## 7. The three mistakes most likely to be made here

1. **Mounting it into a wide, short element.** The stamp is sized against the
   shorter side, so in a 1200×200 banner it is 200px across with a lot of paper
   either side. Use something square, or raise `scale`.

2. **Making `foilLow` too light.** Metal has almost no diffuse term. Nearly all
   of its colour comes from the highlight, which is why real foil looks like foil
   and a matte print does not. A mid-tone `foilLow` turns the stamp into a flat
   coloured shape with a shine on it. Take it darker than feels right.

3. **Assuming it needs a mouse.** It does not. With no pointer the light orbits
   on its own, so it works on touch and in a screenshot. Do not hide it on small
   screens or gate it behind a hover media query.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
