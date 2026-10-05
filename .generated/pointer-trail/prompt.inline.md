You are adding **PointerTrail** from Beamish to this project.

> Marks pressed into the paper behind the cursor, spreading as they soak in. Pointer · effect · MIT.
> https://beamish.ink/effects/pointer-trail

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- An older mark is wider and paler than a new one, because paper draws ink sideways along its fibres while it sinks in. That is the opposite of a particle trail, where older means smaller
- The marks multiply rather than compositing, so two that overlap are darker than either
- A trail needs history, which is not a function of t. When pointerPath is set the whole track is known in advance and the trail is read backwards off it instead of accumulated, so a recorded take is identical however the frames are asked for. A live pointer falls back to a ring buffer
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

**`src/beamish/effects/pointer-trail/core.ts`**

```ts
/*
 * PointerTrail: Beamish
 * https://beamish.ink/effects/pointer-trail
 *
 * Marks pressed into the paper, soaking in and fading.
 *
 * Not a comet and not a glow. A nib touching down repeatedly leaves a row of
 * blots, and each one does two things while it sits there: it spreads, because
 * the paper draws the ink sideways along its fibres, and it lightens, because
 * the ink is sinking in. So an older mark is wider and paler than a new one,
 * which is the opposite of a particle trail, where older means smaller.
 *
 * A trail needs history, and history is not a function of `t`. That is a problem
 * here, because the recorder asks for frames and expects the same answer every
 * time it asks for one.
 *
 * The way out is that the recorder already supplies the history. When
 * `pointerPath` is set the whole cursor track is known in advance, so the trail
 * is read backwards off the path rather than accumulated: mark `i` is simply
 * where the cursor was at `t - i * spacing`. That is pure in `t`, and it means
 * the recorded take is identical however the frames are asked for. With a live
 * pointer there is no path to read, so it falls back to a ring buffer.
 */

import {
  mount,
  samplePointerPath,
  type BaseOptions,
  type EffectHandle,
  type Pointer,
  type Surface
} from '../../shared/runtime'

/** Matches MARKS in the shader. Changing one without the other truncates the trail. */
const MARKS = 28

export type PointerTrailOptions = BaseOptions & {
  /** The sheet the marks are pressed into. */
  paper: string
  /** Ink that has soaked in. */
  ink: string
  /** Ink that has only just landed. */
  accent: string
  /** How many marks the trail holds. */
  marks: number
  /** Radius of a fresh mark, as a share of the short side. */
  size: number
  /** How much wider a mark gets by the end of its life. */
  spread: number
  /** How quickly a mark gives up. Higher is a shorter trail. */
  fade: number
  /** How much of a mark is its soft shoulder rather than its body. */
  edge: number
  /** Seconds between one mark and the next when replaying a path. */
  spacing: number
  /** Paper tooth under the marks. */
  grain: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const pointerTrailDefaults: PointerTrailOptions = {
  paper: '#fbfaf4',
  ink: '#8d8577',
  accent: '#c44400',
  marks: 22,
  size: 0.032,
  spread: 1.6,
  fade: 1.8,
  edge: 0.85,
  spacing: 0.035,
  grain: 0.4,
  reducedMotionTime: 0,
  pointerScope: 'window'
}

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_marks',
  'u_count',
  'u_active',
  'u_paper',
  'u_ink',
  'u_accent',
  'u_size',
  'u_spread',
  'u_fade',
  'u_edge',
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
  if (!shader) throw new Error('PointerTrail: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`PointerTrail: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

// beamish:shader-begin shaders/pointer-trail.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/pointer-trail.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * PointerTrail: marks pressed into the paper, soaking in and fading.
 *
 * Not a comet and not a glow. A nib touching down repeatedly leaves a row of
 * blots, and each one does two things as it sits: it spreads a little as the
 * paper draws the ink sideways along the fibres, and it lightens as it sinks in.
 * So an older mark here is wider and paler than a new one, which is the opposite
 * of a particle trail, where older means smaller.
 *
 * The marks multiply rather than compositing. Two blots that overlap are darker
 * than either, which is the behaviour that makes a trail of ink look wet rather
 * than look like a gradient.
 */

#define MARKS 28

uniform vec2  u_resolution;
uniform float u_dpr;
uniform vec2  u_marks[MARKS];
uniform float u_count;
uniform float u_active;

uniform vec3  u_paper;
uniform vec3  u_ink;
uniform vec3  u_accent;
uniform float u_size;
uniform float u_spread;
uniform float u_fade;
uniform float u_edge;
uniform float u_grain;

out vec4 fragColor;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  int count = int(clamp(u_count, 0.0, float(MARKS)));
  float ink = 0.0;
  float freshest = 0.0;

  for (int i = 0; i < MARKS; i++) {
    if (i >= count) break;

    /*
     * Age runs 0 for the newest mark to 1 for the oldest. Index order is age
     * order, because the trail is written newest first, which saves carrying a
     * timestamp per mark.
     */
    float age = float(i) / max(float(count - 1), 1.0);

    vec2 markPx = vec2(u_marks[i].x, 1.0 - u_marks[i].y) * cssRes;
    float d = length(cssPx - markPx) / shortSide;

    // Spreading outward and sinking in. A mark that has been there longer is
    // wider and weaker, which is what ink does and what a particle does not.
    float radius = u_size * (1.0 + age * u_spread);
    float strength = pow(1.0 - age, max(u_fade, 0.01));

    /*
     * A soft shoulder rather than a hard disc. Ink on a fibrous surface has no
     * edge to speak of, and \`edge\` sets how much of the blot is that shoulder.
     */
    float blot = 1.0 - smoothstep(radius * (1.0 - u_edge), radius, d);
    float mark = blot * strength;

    // Multiplied, not added: two blots crossing are darker than either, which
    // is what makes a wet trail read as wet.
    ink = 1.0 - (1.0 - ink) * (1.0 - mark);
    freshest = max(freshest, mark * (1.0 - age));
  }

  ink *= u_active;

  // The freshest ink has not had time to sink, so it carries the accent and the
  // rest of the trail settles back to the body colour.
  vec3 colour = mix(u_ink, u_accent, smoothstep(0.25, 0.8, freshest));
  vec3 col = mix(u_paper, colour, clamp(ink, 0.0, 1.0));

  float tooth = hash12(floor(cssPx * 0.5) + 19.0) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

class PointerTrailSurface implements Surface<PointerTrailOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  /* Newest first, so the index is also the age. */
  private history: number[] = new Array(MARKS * 2).fill(0.5)
  private held = 0
  private readonly buffer = new Float32Array(MARKS * 2)

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('PointerTrail needs a canvas')
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
    if (!gl) throw new Error('PointerTrail needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('PointerTrail: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`PointerTrail: program failed to link\n${log ?? ''}`)
    }

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

  render(t: number, opts: PointerTrailOptions, pointer: Pointer): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    const wanted = Math.max(1, Math.min(Math.round(opts.marks), MARKS))
    const path = opts.pointerPath

    if (path && path.length > 0) {
      /*
       * The path is known in advance, so the trail is read backwards off it
       * rather than accumulated. Mark i is where the cursor was at
       * t - i * spacing, which makes the whole thing a function of `t` and the
       * recorded take identical however the frames are asked for.
       */
      const duration = opts.pointerPathDuration ?? 0
      for (let i = 0; i < wanted; i++) {
        const at = t - i * opts.spacing
        const sample = samplePointerPath(path, at, duration)
        this.buffer[i * 2] = sample.x
        this.buffer[i * 2 + 1] = sample.y
      }
      this.held = wanted
    } else {
      // No path, so there is nothing to read backwards and the history has to
      // be kept. Newest first: shift down, write the head.
      for (let i = MARKS - 1; i > 0; i--) {
        this.history[i * 2] = this.history[(i - 1) * 2]!
        this.history[i * 2 + 1] = this.history[(i - 1) * 2 + 1]!
      }
      this.history[0] = pointer.x
      this.history[1] = pointer.y
      this.held = Math.min(this.held + 1, wanted)
      for (let i = 0; i < wanted; i++) {
        this.buffer[i * 2] = this.history[i * 2]!
        this.buffer[i * 2 + 1] = this.history[i * 2 + 1]!
      }
    }

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)

    const loc = (name: UniformName) => this.locations.get(name) ?? null

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform2fv(loc('u_marks'), this.buffer)
    gl.uniform1f(loc('u_count'), this.held)
    gl.uniform1f(loc('u_active'), pointer.active || Boolean(path) ? 1 : 0)
    gl.uniform3fv(loc('u_paper'), rgb(opts.paper))
    gl.uniform3fv(loc('u_ink'), rgb(opts.ink))
    gl.uniform3fv(loc('u_accent'), rgb(opts.accent))
    gl.uniform1f(loc('u_size'), opts.size)
    gl.uniform1f(loc('u_spread'), opts.spread)
    gl.uniform1f(loc('u_fade'), opts.fade)
    gl.uniform1f(loc('u_edge'), opts.edge)
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
    this.held = 0
    this.locations.clear()
  }
}

/**
 * Mount PointerTrail into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const trail = createPointerTrail(document.querySelector('#sheet')!)
 * trail.start()
 * ```
 */
export function createPointerTrail(
  el: HTMLElement,
  opts: Partial<PointerTrailOptions> = {}
): EffectHandle {
  return mount<PointerTrailOptions>(el, opts, {
    defaults: pointerTrailDefaults,
    create: () => new PointerTrailSurface()
  })
}

export default createPointerTrail
```

## 2. What it is

Marks pressed into the paper behind the cursor, spreading as they soak in.

Not a comet and not a glow. A nib touching down repeatedly leaves a row of blots,
and each one does two things while it sits there. It **spreads**, because the
paper draws the ink sideways along its fibres. And it **lightens**, because the
ink is sinking in. So an older mark here is wider and paler than a new one, which
is the opposite of a particle trail, where older means smaller, and it is the
single thing that makes this read as ink rather than as a cursor with a tail.

The marks multiply rather than compositing, so two that overlap are darker than
either. The head of the trail carries the accent, because ink that has only just
landed has not had time to sink.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## 3. Wire it in

**Plain HTML.** The element needs a size of its own.

```html
<div id="sheet" style="position: relative; height: 70vh"></div>

<script type="module">
  import { createPointerTrail } from './beamish/effects/pointer-trail/core.js'

  const trail = createPointerTrail(document.querySelector('#sheet'))
  trail.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createPointerTrail } from '@/beamish/effects/pointer-trail/core'

export function Sheet() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const trail = createPointerTrail(host.current)
    trail.start()
    return () => trail.destroy()
  }, [])

  return <div ref={host} className="sheet" />
}
```

Do not put option values in the dependency array. Call `update()` instead: every
option is a uniform, so nothing rebuilds.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createPointerTrail } from '@/beamish/effects/pointer-trail/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let trail: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  trail = createPointerTrail(host.value)
  trail.start()
})

onBeforeUnmount(() => trail?.destroy())
</script>

<template>
  <div ref="host" class="sheet" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The sheet the marks are pressed into. |
| `ink` | color | `#8d8577` | any CSS hex | Ink that has soaked in. Most of the trail is this. |
| `accent` | color | `#c44400` | any CSS hex | Ink that has only just landed, at the head of the trail. |
| `marks` | number | `22` | 2 to 28 | How many marks the trail holds. The shader has room for 28; asking for more silently gives you 28, because the array is a fixed size and growing it means editing the shader as well. |
| `size` | number | `0.032` | 0.005 to 0.2 | Radius of a fresh mark, as a share of the short side, so it keeps its proportion when the element changes shape. |
| `spread` | number | `1.6` | 0 to 4 | How much wider a mark gets by the end of its life. Paper draws ink sideways along its fibres, so an old mark is bigger than a new one. This is the opposite of a particle trail and it is the main thing that makes it read as ink. |
| `fade` | number | `1.8` | 0.2 to 6 | How quickly a mark gives up. Higher is a shorter trail with a harder end; lower leaves a long tail that never quite goes. |
| `edge` | number | `0.85` | 0 to 1 | How much of a mark is its soft shoulder rather than its body. Ink on a fibrous surface has no edge to speak of, so this wants to be high; at 0 you get discs. |
| `spacing` | number | `0.035` | 0.005 to 0.2 | Seconds between one mark and the next when the trail is replayed from a scripted path. It has no effect on a live pointer, where one mark is laid per frame. |
| `grain` | number | `0.4` | 0 to 1 | Paper tooth under the marks. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener including the window-scoped pointer one.
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

With no pointer the trail is not drawn at all, so what you get is a clean sheet.
That is the right resting state: a trail with nothing having moved would be a
drawing of a gesture nobody made.

## 7. The three mistakes most likely to be made here

1. **Setting `spread` to 0.** You get a row of identical discs. The widening is
   what makes it ink; without it this is a cursor with a tail and there are
   simpler ways to draw one.

2. **Raising `marks` past 28 and wondering why nothing changes.** The shader
   array is a fixed size. The constant is named in both files and they have to
   move together.

3. **Expecting the live trail to match the recording exactly.** Live lays one
   mark per frame; a scripted path lays one per `spacing`. They are the same
   length only if `spacing` matches the frame interval.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
