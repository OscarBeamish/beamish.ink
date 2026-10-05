You are adding **WatermarkSheet** from Beamish to this project.

> Handmade paper held up to the light, with laid lines, chain lines and a wire device. Backdrops · effect · MIT.
> https://beamish.ink/effects/watermark-sheet

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Everything here is thickness rather than ink. Paper is translucent, so what shows against a light is where the sheet is thinner, and every term lightens rather than darkens
- Laid lines are a ripple and chain lines are a band, because a sheet follows fine wires and is drawn down sharply over thick ones
- The device is drawn as a signed distance, so the wire keeps an even thickness all the way round, which a wire does
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

**`src/beamish/effects/watermark-sheet/core.ts`**

```ts
/*
 * WatermarkSheet: Beamish
 * https://beamish.ink/effects/watermark-sheet
 *
 * A sheet of handmade paper held up to the light.
 *
 * Everything here is thickness. Paper is translucent, so what you see against a
 * light is not ink but where the sheet is thinner and lets more through. The
 * laid lines are the close-set wires of the mould the sheet was formed on. The
 * chain lines are the heavier wires at right angles holding those together, an
 * inch or so apart. The formation is the cloudiness, because fibres never settle
 * evenly, and that is most of what separates a handmade sheet from a machine
 * one. The watermark proper is a wire device sewn onto the mould, where the
 * sheet is thinnest and brightest.
 *
 * Nothing in here darkens. Every term lightens the paper, because every term is
 * somewhere the sheet is thinner.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type WatermarkSheetOptions = BaseOptions & {
  /** The sheet seen front on. */
  paper: string
  /** What comes through where the sheet is thinnest. */
  light: string
  /** How much light the close-set mould wires let through. */
  laid: number
  /** Laid wires across the sheet. Higher is a finer mould. */
  laidPitch: number
  /** How much light the heavy cross wires let through. */
  chain: number
  /** Chain wires across the sheet. Rarely more than a handful. */
  chainPitch: number
  /** How unevenly the fibres settled. */
  formation: number
  /** Size of the cloudiness. Lower is a coarser, blotchier sheet. */
  cloud: number
  /** How brightly the wire device shows. */
  device: number
  /** Size of the device, as a share of the short side. */
  deviceSize: number
  /** Angle of the mould to the frame, degrees. */
  angle: number
  /** Paper tooth over the whole thing. */
  grain: number
  /** Seconds for one tilt against the light. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const watermarkSheetDefaults: WatermarkSheetOptions = {
  paper: '#efede7',
  light: '#fffdf6',
  laid: 0.18,
  laidPitch: 210,
  chain: 0.3,
  chainPitch: 1.6,
  formation: 0.5,
  cloud: 2.4,
  device: 0.45,
  deviceSize: 0.26,
  angle: 4,
  grain: 0.35,
  period: 16,
  reducedMotionTime: 5
}

// beamish:shader-begin shaders/watermark-sheet.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/watermark-sheet.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * WatermarkSheet: a sheet of handmade paper held up to the light.
 *
 * Everything here is thickness. Paper is translucent, so what you see against a
 * light is not ink but where the sheet is thinner and lets more through. Three
 * things make it thinner, and all three are on the mould the sheet was formed
 * on rather than in the pulp.
 *
 * The laid lines are the close-set wires of the mould, so the sheet is slightly
 * thinner over each one. The chain lines are the heavier wires at right angles
 * holding those together, spaced an inch or so apart. And the formation is the
 * cloudiness: fibres never settle evenly, and the blotchy variation that gives
 * is the difference between handmade paper and a machine sheet.
 *
 * The watermark proper is a wire device sewn onto the mould. The sheet is much
 * thinner there, which is why a watermark is brighter than everything around it
 * and why it only shows against a light.
 *
 * Nothing in here darkens. Every term lightens the paper, because every term is
 * somewhere the sheet is thinner.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_light;
uniform float u_laid;
uniform float u_laidPitch;
uniform float u_chain;
uniform float u_chainPitch;
uniform float u_formation;
uniform float u_cloud;
uniform float u_device;
uniform float u_deviceSize;
uniform float u_angle;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;
const float DEG = 0.01745329252;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += noise(p) * amp;
    p *= 2.07;
    amp *= 0.5;
  }
  return sum;
}

vec2 rot(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
}

/*
 * A ring with a bar across it: a countermark, the plain device a mill used when
 * it was not using its own emblem. Drawn as a signed distance so the wire has an
 * even thickness all the way round, which a wire does.
 */
float countermark(vec2 p, float size) {
  float ring = abs(length(p) - size) - size * 0.085;
  vec2 b = abs(p) - vec2(size * 1.25, size * 0.075);
  float bar = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);
  return min(ring, bar);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 p = (cssPx - cssRes * 0.5) / (shortSide * 0.5);

  // The mould sits at its own angle to the frame, so the wires are not
  // obediently square to the screen.
  vec2 mould = rot(p, u_angle * DEG);

  /*
   * The sheet is tilted slowly against the light rather than anything moving on
   * it. A closed orbit, so after one period it is back where it began.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  vec2 orbit = vec2(cos(phase), sin(phase)) * 0.22;

  // Laid lines: close-set wires, so a fine ripple rather than hard lines. The
  // sheet is thinner over each wire, so each one lets a little more light.
  float laid = (sin(mould.y * u_laidPitch) * 0.5 + 0.5) * u_laid;

  /*
   * Chain lines: the heavy wires at right angles, an inch or so apart. A narrow
   * band rather than a ripple, because the sheet is drawn down sharply over a
   * thick wire rather than following it.
   */
  float chainPhase = fract(mould.x * u_chainPitch);
  float chainBand = 1.0 - smoothstep(0.0, 0.06, min(chainPhase, 1.0 - chainPhase));
  float chain = chainBand * u_chain;

  // Formation: fibres never settle evenly, and this cloudiness is most of what
  // separates a handmade sheet from a machine one.
  float formation = (fbm(p * u_cloud + orbit) - 0.5) * u_formation;

  // The device, which is much thinner than anything else and therefore the
  // brightest thing on the sheet.
  float wire = countermark(rot(p, u_angle * DEG), max(u_deviceSize, 0.01));
  float aa = fwidth(wire) + 0.001;
  float device = (1.0 - smoothstep(0.0, aa * 2.0, wire)) * u_device;

  // Everything lightens. Every term is somewhere the sheet is thinner, and a
  // thin sheet passes more light; nothing here is ink.
  float through = clamp(laid + chain + formation + device, 0.0, 1.0);
  vec3 col = mix(u_paper, u_light, through);

  float tooth = hash12(floor(cssPx * 0.5) + 23.0) - 0.5;
  col += tooth * 0.045 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_paper',
  'u_light',
  'u_laid',
  'u_laidPitch',
  'u_chain',
  'u_chainPitch',
  'u_formation',
  'u_cloud',
  'u_device',
  'u_deviceSize',
  'u_angle',
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
  if (!shader) throw new Error('WatermarkSheet: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`WatermarkSheet: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class WatermarkSheetSurface implements Surface<WatermarkSheetOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('WatermarkSheet needs a canvas')
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
    if (!gl) throw new Error('WatermarkSheet needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('WatermarkSheet: could not create program')
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
      throw new Error(`WatermarkSheet: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: WatermarkSheetOptions): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)

    const loc = (name: UniformName) => this.locations.get(name) ?? null

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform1f(loc('u_time'), t)
    gl.uniform1f(loc('u_period'), opts.period)
    gl.uniform3fv(loc('u_paper'), rgb(opts.paper))
    gl.uniform3fv(loc('u_light'), rgb(opts.light))
    gl.uniform1f(loc('u_laid'), opts.laid)
    gl.uniform1f(loc('u_laidPitch'), opts.laidPitch)
    gl.uniform1f(loc('u_chain'), opts.chain)
    gl.uniform1f(loc('u_chainPitch'), opts.chainPitch)
    gl.uniform1f(loc('u_formation'), opts.formation)
    gl.uniform1f(loc('u_cloud'), opts.cloud)
    gl.uniform1f(loc('u_device'), opts.device)
    gl.uniform1f(loc('u_deviceSize'), opts.deviceSize)
    gl.uniform1f(loc('u_angle'), opts.angle)
    gl.uniform1f(loc('u_grain'), opts.grain)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.gl
  }

  teardown(): void {
    const gl = this.gl
    if (gl) {
      if (this.program) gl.deleteProgram(this.program)
      if (this.vao) gl.deleteVertexArray(this.vao)
    }
    this.gl = null
    this.program = null
    this.vao = null
    this.locations.clear()
  }
}

/**
 * Mount WatermarkSheet into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const marbled = createWatermarkSheet(document.querySelector('#hero')!)
 * marbled.start()
 * // …later
 * marbled.destroy()
 * ```
 */
export function createWatermarkSheet(
  el: HTMLElement,
  opts: Partial<WatermarkSheetOptions> = {}
): EffectHandle {
  return mount<WatermarkSheetOptions>(el, opts, {
    defaults: watermarkSheetDefaults,
    create: () => new WatermarkSheetSurface()
  })
}

export default createWatermarkSheet
```

## 2. What it is

A sheet of handmade paper held up to the light.

Everything here is thickness. Paper is translucent, so what you see against a
light is not ink but where the sheet is thinner and lets more through. That is
the whole premise, and it is why nothing in this effect darkens: every term
lightens the paper, because every term is somewhere the paper is thinner.

Three of them come from the mould the sheet was formed on, not from the pulp.
The **laid lines** are its close-set wires, so the sheet is very slightly thinner
over each one. The **chain lines** are the heavier wires at right angles holding
those together, an inch or so apart. And the **formation** is the cloudiness:
fibres never settle evenly, and that blotchy variation is most of what separates
a handmade sheet from a machine one.

The fourth is the watermark proper, a wire device sewn onto the mould. The sheet
is much thinner there, which is why a watermark is brighter than everything
around it and why it only shows against a light.

Laid lines are drawn as a ripple and chain lines as a band, which is not an
arbitrary difference. A forming sheet follows fine wires and is drawn down
sharply over thick ones.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## 3. Wire it in

**Plain HTML.** The element needs a size of its own.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createWatermarkSheet } from './beamish/effects/watermark-sheet/core.js'

  const sheet = createWatermarkSheet(document.querySelector('#backdrop'), {
    period: 60
  })
  sheet.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createWatermarkSheet } from '@/beamish/effects/watermark-sheet/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sheet = createWatermarkSheet(host.current, { period: 60 })
    sheet.start()
    return () => sheet.destroy()
  }, [])

  return <div ref={host} className="fixed inset-0 -z-10" />
}
```

Do not put option values in the dependency array. Call `update()` instead: every
option is a uniform, so nothing rebuilds.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createWatermarkSheet } from '@/beamish/effects/watermark-sheet/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let sheet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sheet = createWatermarkSheet(host.value, { period: 60 })
  sheet.start()
})

onBeforeUnmount(() => sheet?.destroy())
</script>

<template>
  <div ref="host" class="backdrop" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#efede7` | any CSS hex | The sheet seen front on, before any light comes through it. Slightly deeper than the page, so there is somewhere for the thin parts to brighten into. |
| `light` | color | `#fffdf6` | any CSS hex | What comes through where the sheet is thinnest. Everything here lightens toward this; nothing darkens, because every feature is somewhere the paper is thinner. |
| `laid` | number | `0.18` | 0 to 1 | How much light the close-set mould wires let through. A ripple rather than hard lines: the sheet follows fine wires rather than being drawn down over them. |
| `laidPitch` | number | `210` | 40 to 600 | Laid wires across the sheet. A real mould has them roughly a millimetre apart, so this wants to be high enough that they are a texture rather than a pattern. |
| `chain` | number | `0.3` | 0 to 1 | How much light the heavy cross wires let through. A narrow band rather than a ripple, because the sheet is drawn down sharply over a thick wire. |
| `chainPitch` | number | `1.6` | 0.3 to 8 | Chain wires across the sheet. Rarely more than a handful: they sit about an inch apart on a real mould, and crowding them is the quickest way to stop it looking like paper. |
| `formation` | number | `0.5` | 0 to 1.5 | How unevenly the fibres settled. This is most of what separates a handmade sheet from a machine one, and at 0 you have made cartridge paper. |
| `cloud` | number | `2.4` | 0.3 to 10 | Size of the cloudiness. Lower is a coarser, blotchier sheet. |
| `device` | number | `0.45` | 0 to 1 | How brightly the wire device shows. The sheet is much thinner there than anywhere else, so it is the brightest thing present. Zero for a plain laid sheet with no watermark. |
| `deviceSize` | number | `0.26` | 0.05 to 0.6 | Size of the device, as a share of the short side. |
| `angle` | number | `4` | -45 to 45 | Angle of the mould to the frame. A few degrees off square, because a sheet is not laid down obediently aligned to anything. |
| `grain` | number | `0.35` | 0 to 1 | Paper tooth over the whole thing. |
| `period` | number | `16` | 4 to 180 | Seconds for one slow tilt against the light. Nothing moves on the sheet; the sheet moves. A closed orbit, so it returns to exactly where it began. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. `createWatermarkSheet` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable. `stop()` and `start()` are on the handle for that. Surface them as a
real control in your own build. Reduced motion does not cover this, and plenty of
people who need a pause button have not set that preference.

The movement is very slow by default, a full tilt taking sixteen seconds. That
does not exempt it.

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`.

Any frame of this is a sheet of paper, so the default is as good as any other
number.

## 7. The three mistakes most likely to be made here

1. **Leaving `paper` the same colour as the page.** Everything here lightens, so
   a sheet that already matches the page has nothing to brighten into and the
   whole effect disappears. Go a shade or two deeper.

2. **Raising `chainPitch` for more texture.** Chain wires sit an inch apart on a
   real mould. Crowding them is the single fastest way to stop it reading as
   paper. If you want more texture, that is `laidPitch`.

3. **Setting `formation` to 0.** You have made cartridge paper. The unevenness is
   the handmade part.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing. Give the host `position: fixed; inset: 0`, or an
   explicit height.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
