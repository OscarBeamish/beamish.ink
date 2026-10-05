You are adding **MarbledPaper** from Beamish to this project.

> Ink floated on size, dropped and then raked, the way marbled endpapers are made. Backdrops · effect · MIT.
> https://beamish.ink/effects/marbled-paper

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Every marbling operation has a closed-form inverse, so each pixel runs the session backwards instead of the tray being simulated forwards. One pass, no render targets, no feedback
- The drop loop runs backwards and stops at the first drop that contains the point, so raising the count costs much less than it looks like it should
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

**`src/beamish/effects/marbled-paper/core.ts`**

```ts
/*
 * MarbledPaper: Beamish
 * https://beamish.ink/effects/marbled-paper
 *
 * Ink floated on size, dropped, then raked. Real marbling, not noise dressed up
 * as it.
 *
 * Every operation a marbler performs on a tray has a closed-form inverse. A drop
 * of ink pushes everything already floating outward by an exact amount. A comb
 * drawn through displaces points along its own direction by an amount that
 * depends only on how far they sit from it. Both invert in one step, with no
 * iteration and no search.
 *
 * So rather than simulating the tray forwards into a buffer, each pixel runs the
 * session backwards: undo the combs, then undo the drops from the last to the
 * first, and the moment the point falls inside one you know which ink it was.
 * One pass, no render targets, no feedback, and the pattern is exact rather than
 * approximated.
 *
 * It also gives the rings away for free. A drop laid down later pushes an
 * earlier one into an annulus around itself, and walking backwards reproduces
 * that rather than having to draw it.
 *
 * The maths is the published treatment of marbling as a sequence of invertible
 * mappings. Written from scratch.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type MarbledPaperOptions = BaseOptions & {
  /** The size in the tray, and what shows wherever no ink reached. */
  paper: string
  /** The main ink. Most drops are this, or this thinned toward the paper. */
  ink: string
  /** The second ink, on roughly a third of the drops. */
  accent: string
  /** How many drops go into the tray. Each one pushes all the earlier ones. */
  drops: number
  /** How much of the pattern fits in the frame. */
  scale: number
  /** How far the drops are scattered. Low stacks them into one rosette. */
  spread: number
  /** How big each drop is before anything pushes it. */
  size: number
  /** How far the comb pulls the ink across. */
  rake: number
  /** Teeth per unit across the comb. Higher is a finer comb. */
  comb: number
  /** The second comb, drawn at right angles to the first. */
  swirl: number
  /** Paper tooth over the whole thing. */
  grain: number
  /** Seconds for one pass of the comb. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const marbledPaperDefaults: MarbledPaperOptions = {
  paper: '#fbfaf4',
  ink: '#36362f',
  accent: '#c44400',
  drops: 44,
  scale: 1,
  spread: 0.95,
  size: 0.17,
  rake: 0.25,
  comb: 9,
  swirl: 0.12,
  grain: 0.5,
  period: 12,
  reducedMotionTime: 3
}

// beamish:shader-begin shaders/marbled-paper.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/marbled-paper.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * MarbledPaper: ink floated on size, dropped, then raked.
 *
 * This is not noise dressed up as marbling. Every operation a marbler performs
 * on a tray has a closed-form inverse, which is the fact the whole effect rests
 * on. A drop of ink pushes everything already floating outward by an exact
 * amount; a comb drawn through displaces points along its own direction by an
 * amount that depends only on how far they sit from it. Both are invertible in
 * one step, with no iteration and no search.
 *
 * So instead of simulating the tray forwards into a buffer, each pixel runs the
 * session backwards. Undo the combs, then undo the drops one at a time from the
 * last to the first, and the moment the point falls inside a drop you know which
 * ink it was. That is the colour. No render targets, no feedback, no history:
 * one pass, and the pattern is exact rather than approximated.
 *
 * It also explains the rings. A drop laid down later pushes an earlier one into
 * an annulus around itself, and walking the operations backwards reproduces that
 * for free rather than having to draw it.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_ink;
uniform vec3  u_accent;
uniform float u_drops;
uniform float u_scale;
uniform float u_spread;
uniform float u_size;
uniform float u_rake;
uniform float u_comb;
uniform float u_swirl;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453123);
}

vec2 hash21(float n) {
  return vec2(hash11(n), hash11(n + 71.3));
}

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * Undo one pass of the comb.
 *
 * Forward, the comb displaces a point along \`dir\` by an amount that varies with
 * how far along the perpendicular it sits. The displacement therefore never
 * changes the quantity the displacement is computed from, so subtracting the
 * same vector is an exact inverse rather than an approximation of one. That is
 * the only reason the combs can be undone before the drops are.
 */
vec2 uncomb(vec2 p, vec2 dir, float amp, float freq, float phase) {
  vec2 n = vec2(-dir.y, dir.x);
  return p - dir * amp * sin(dot(p, n) * freq + phase);
}

/*
 * Undo one drop of radius r at c.
 *
 * A drop pushes everything already on the surface radially outward, conserving
 * area, so a point at distance m from the centre came from one at
 * sqrt(m * m - r * r). The max() guards the inside of the drop, where there is
 * nothing earlier to recover: the caller checks for that case first and takes
 * the ink colour instead.
 */
vec2 undrop(vec2 p, vec2 c, float r) {
  vec2 d = p - c;
  float m2 = dot(d, d);
  return c + d * sqrt(max(1.0 - (r * r) / m2, 0.0));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  vec2 p = (cssPx - cssRes * 0.5) / (shortSide * 0.5);
  p /= max(u_scale, 0.05);

  float phase = TAU * u_time / max(u_period, 0.001);

  /*
   * Two combs at right angles, which is how a gel-git pattern is made: one pass
   * across, one pass down. Undone in the reverse of the order a marbler would
   * draw them, because this is the session running backwards.
   *
   * Their phases are whole multiples of the same angle, so the comb returns to
   * where it started after exactly one period and the loop closes.
   */
  p = uncomb(p, vec2(0.0, 1.0), u_swirl, u_comb * 0.73, phase);
  p = uncomb(p, vec2(1.0, 0.0), u_rake, u_comb, -phase);

  int count = int(clamp(u_drops, 1.0, 72.0));
  vec3 col = u_paper;
  bool found = false;

  /*
   * Backwards through the drops. The first one that contains the point is the
   * ink you can see, because anything dropped after it would have pushed this
   * point out of the way.
   */
  for (int i = 71; i >= 0; i--) {
    if (i >= count) continue;

    float fi = float(i);
    vec2 c = (hash21(fi * 3.73 + 1.0) - 0.5) * 2.0 * u_spread;
    float r = u_size * (0.62 + hash11(fi * 9.17) * 0.76);

    vec2 d = p - c;
    if (dot(d, d) <= r * r) {
      // Three inks off two colours: the accent, the ink, and the ink thinned
      // toward the paper, which is what a second pass of the same colour looks
      // like when the first has already spread.
      float pick = hash11(fi * 5.31 + 4.2);
      col = pick < 0.3 ? u_accent : (pick < 0.68 ? u_ink : mix(u_ink, u_paper, 0.4));
      found = true;
      break;
    }

    p = undrop(p, c, r);
  }

  // Anything that fell through every drop never had ink on it.
  if (!found) col = u_paper;

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
  'u_paper',
  'u_ink',
  'u_accent',
  'u_drops',
  'u_scale',
  'u_spread',
  'u_size',
  'u_rake',
  'u_comb',
  'u_swirl',
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
  if (!shader) throw new Error('MarbledPaper: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`MarbledPaper: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class MarbledPaperSurface implements Surface<MarbledPaperOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('MarbledPaper needs a canvas')
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
    if (!gl) throw new Error('MarbledPaper needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('MarbledPaper: could not create program')
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
      throw new Error(`MarbledPaper: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: MarbledPaperOptions): void {
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
    gl.uniform3fv(loc('u_ink'), rgb(opts.ink))
    gl.uniform3fv(loc('u_accent'), rgb(opts.accent))
    gl.uniform1f(loc('u_drops'), opts.drops)
    gl.uniform1f(loc('u_scale'), opts.scale)
    gl.uniform1f(loc('u_spread'), opts.spread)
    gl.uniform1f(loc('u_size'), opts.size)
    gl.uniform1f(loc('u_rake'), opts.rake)
    gl.uniform1f(loc('u_comb'), opts.comb)
    gl.uniform1f(loc('u_swirl'), opts.swirl)
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
 * Mount MarbledPaper into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const marbled = createMarbledPaper(document.querySelector('#hero')!)
 * marbled.start()
 * // …later
 * marbled.destroy()
 * ```
 */
export function createMarbledPaper(
  el: HTMLElement,
  opts: Partial<MarbledPaperOptions> = {}
): EffectHandle {
  return mount<MarbledPaperOptions>(el, opts, {
    defaults: marbledPaperDefaults,
    create: () => new MarbledPaperSurface()
  })
}

export default createMarbledPaper
```

## 2. What it is

Ink floated on size, dropped, and then raked. The pattern on a marbled endpaper,
made the way the endpaper was.

This is not noise dressed up as marbling. Every operation a marbler performs on a
tray has a closed-form inverse, and that single fact is what the whole effect
rests on. A drop of ink pushes everything already floating outward by an exact
amount, conserving area. A comb drawn through displaces points along its own
direction by an amount that depends only on how far from it they sit, so the
displacement never changes the quantity the displacement was computed from. Both
undo in one step, with no iteration and no search.

So the tray is never simulated forwards. Each pixel runs the session backwards:
undo the combs, then undo the drops one at a time from the last to the first, and
the moment the point falls inside a drop you know which ink it was. That is the
colour. One pass, no render targets, no feedback, no history, and the result is
exact rather than approximated.

It gives the rings away for free, too. A drop laid down later pushes an earlier
one into an annulus around itself, and walking the operations backwards
reproduces that instead of having to draw it.

Measured at 0.42ms for one drop and 0.64ms for seventy-two, at 1440 by 900 on an
RTX 3080. The count costs far less than it looks like it should, because the loop
stops at the first drop that claims the point.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## 3. Wire it in

**Plain HTML.** The element needs a size of its own.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createMarbledPaper } from './beamish/effects/marbled-paper/core.js'

  const marbled = createMarbledPaper(document.querySelector('#backdrop'), {
    drops: 44,
    period: 60
  })
  marbled.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createMarbledPaper } from '@/beamish/effects/marbled-paper/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const marbled = createMarbledPaper(host.current, { period: 60 })
    marbled.start()
    return () => marbled.destroy()
  }, [])

  return <div ref={host} className="fixed inset-0 -z-10" />
}
```

Do not put option values in the dependency array. Call `update()` instead: every
option is a uniform, so nothing rebuilds, not even the drop count.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createMarbledPaper } from '@/beamish/effects/marbled-paper/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let marbled: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  marbled = createMarbledPaper(host.value, { period: 60 })
  marbled.start()
})

onBeforeUnmount(() => marbled?.destroy())
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
| `paper` | color | `#fbfaf4` | any CSS hex | The size in the tray, and what shows wherever no ink reached. Match it to the page behind or the margins read as a panel. |
| `ink` | color | `#36362f` | any CSS hex | The main ink. Roughly two thirds of the drops are this, or this thinned toward the paper, which is what a second pass of one colour looks like once the first has spread. |
| `accent` | color | `#c44400` | any CSS hex | The second ink, on roughly a third of the drops. |
| `drops` | number | `44` | 1 to 72 | How many drops go into the tray. Each one pushes every earlier one outward, so this sets the density of the rings rather than just the amount of ink. |
| `scale` | number | `1` | 0.2 to 4 | How large the pattern reads. Higher zooms in on fewer, bigger shapes; lower pulls back and shows more of the tray, down to the paper margin round the edge of the ink. |
| `spread` | number | `0.95` | 0.1 to 2 | How far the drops are scattered. Low stacks them into a single rosette, which is the stone pattern; high covers the tray. |
| `size` | number | `0.17` | 0.05 to 0.8 | How big each drop is before anything pushes it. The ink conserves area, so the patch it finally covers is the sum of the drop areas: halving this and quadrupling the count gives the same coverage at four times the detail, which is the knob you actually want. |
| `rake` | number | `0.25` | 0 to 0.6 | How far the comb pulls the ink across. Zero leaves the drops as plain rings, which is a stone marble and a perfectly good thing to stop at. |
| `comb` | number | `9` | 0.5 to 30 | Teeth per unit across the comb. Higher is a finer comb and a tighter zigzag. |
| `swirl` | number | `0.12` | 0 to 0.4 | A second comb drawn at right angles to the first. Two passes crossed is how a gel-git pattern is made; leave it at zero for a single-direction nonpareil. |
| `grain` | number | `0.5` | 0 to 1 | Paper tooth over the whole thing. |
| `period` | number | `12` | 2 to 120 | Seconds for one pass of the comb. Both combs run whole multiples of the same angle, so the pattern returns to exactly where it started and the loop is seamless. Behind content, raise it. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createMarbledPaper` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable. `stop()` and `start()` are on the handle for that. Surface them as a
real control in your own build. Reduced motion does not cover this, and plenty of
people who need a pause button have not set that preference.

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`.

This effect needs no care here. Any frame of it is a finished sheet of marbled
paper, which is a complete thing to look at, so the default is as good as any
other number.

## 7. The three mistakes most likely to be made here

1. **Raising `size` to cover more of the frame.** It works, and it also makes
   every shape bigger, so you end up with four enormous blobs. Coverage is the
   sum of the drop areas: raise `drops` instead and the pattern gets denser
   rather than coarser.

2. **Raising `rake` to make the comb more visible.** Past about 0.4 the ink
   shears into long smears and stops reading as a comb at all. If you cannot see
   it, `comb` is probably too low: a comb with two teeth across the whole frame
   looks like a wave rather than a comb.

3. **Using the default palette behind text.** Two of the three inks are near
   black. It is a cover.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing. Give the host `position: fixed; inset: 0`, or an
   explicit height.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
