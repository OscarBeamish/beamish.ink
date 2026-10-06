You are adding **RelightImage** from Beamish to this project.

> A lamp moved across a printed photograph, finding the relief in the impression. Surfaces · effect · MIT.
> https://beamish.ink/effects/relight-image

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The picture is the host element's own <img> child. It is hidden from sight and left in the document, so the alt text is whatever you wrote and a page with no JavaScript still shows it
- This lights the print rather than the scene. There is no depth in a photograph and no honest way to get one out of a single frame, so the height field is the picture's own luminance and what the lamp finds is relief in the sheet
- Known limit, and the reason the modelling is laid over the picture rather than replacing it: lighting already in the photograph becomes relief, so a cast shadow across a wall turns into a step in the paper. A flat-lit image is the one this flatters most
- The gradient is taken across several pixels rather than one, which low-passes the height field on the way and is what keeps sensor noise and compression blocks out of the normal
- Nothing is integrated against the previous frame. The lamp is exactly where the pointer is, so renderAtTime is pure in t and a scripted path replays identically
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

**`src/beamish/effects/relight-image/core.ts`**

```ts
/*
 * RelightImage: Beamish
 * https://beamish.ink/effects/relight-image
 *
 * A lamp moved across a printed photograph.
 *
 * This does not relight the scene. There is no depth in a photograph and no
 * honest way to get one out of a single frame, so anything that claims to move
 * the sun around inside a picture is guessing. What this lights is the print:
 * the sheet the picture is on, which has relief wherever the impression is
 * heavy, and a raking light finds that relief the way a raking light finds any
 * other surface.
 *
 * Height is the picture's own luminance, so a shadow in the photograph is a
 * hollow in the sheet and a highlight stands proud. The normal is the gradient
 * of that height, taken across `smooth` pixels rather than one, because a
 * one-pixel difference is mostly sensor noise and compression blocks.
 *
 * The known failure of deriving relief from luminance is that lighting already
 * in the photograph becomes relief: a cast shadow across a wall turns into a
 * step in the paper. That is a limit worth knowing rather than a bug worth
 * fixing, and it is why the modelling is applied around the picture rather than
 * instead of it. The photograph stays the photograph. It catches the light.
 *
 * The picture comes from the host element's own <img> child rather than from an
 * option, so the alt text is whatever was written and a page whose script never
 * runs still shows the photograph.
 *
 * Nothing is integrated against the previous frame. The lamp is exactly where
 * the pointer is, so `renderAtTime` stays pure and a scripted path replays
 * identically.
 */

import { mount, type BaseOptions, type EffectHandle, type Pointer, type Surface } from '../../shared/runtime'

export type RelightImageOptions = BaseOptions & {
  /** Colour of the lamp. Warm, unless the room is not. */
  light: string
  /** How far above the sheet the lamp is held. Low is a raking light. */
  height: number
  /** How much relief the impression has. */
  relief: number
  /** Pixels either side the gradient is taken across. Low-passes the surface. */
  smooth: number
  /** How much modelling the lamp lays over the picture. */
  strength: number
  /** How much light the room has already. The lamp works either side of it. */
  ambient: number
  /** How much the ink catches the light that the paper does not. */
  gloss: number
  /** How tight that catch is. Higher is a harder, smaller glint. */
  shine: number
  /** How far the lamp throws. */
  reach: number
  /** Paper tooth over the whole thing. */
  grain: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const relightImageDefaults: RelightImageOptions = {
  light: '#fff3df',
  height: 0.32,
  relief: 4,
  smooth: 4,
  strength: 0.45,
  ambient: 0.35,
  gloss: 0.18,
  shine: 26,
  reach: 1.1,
  grain: 0.25,
  reducedMotionTime: 0
}

// beamish:shader-begin shaders/relight-image.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/relight-image.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * RelightImage: a lamp moved across a printed photograph.
 *
 * This does not relight the scene. There is no depth here and there is no
 * honest way to get one out of a single photograph, so anything claiming to
 * move the sun around inside a picture is guessing. What it lights is the
 * print: the sheet the picture is on, which has relief wherever the impression
 * is heavy, and a raking light finds that relief exactly the way a raking light
 * finds any other surface.
 *
 * Height is the picture's own luminance, so a shadow in the photograph is a
 * hollow in the sheet and a highlight stands proud. The normal comes from the
 * gradient of that height, taken across \`smooth\` pixels rather than across one,
 * because a one-pixel difference is mostly sensor noise and JPEG blocks and
 * what you want is the shape of the impression rather than the texture of the
 * file.
 *
 * The known failure of deriving relief from luminance is that lighting already
 * in the photograph becomes relief: a cast shadow across a wall turns into a
 * step in the paper. That is a limit worth knowing rather than a bug worth
 * fixing, and it is the reason the modelling is applied *around* the picture
 * rather than replacing it. The photograph stays the photograph. It catches the
 * light.
 */

uniform sampler2D u_image;
uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform float u_dpr;
uniform vec2  u_pointer;
uniform float u_active;

uniform vec3  u_light;
uniform float u_height;
uniform float u_relief;
uniform float u_smooth;
uniform float u_strength;
uniform float u_ambient;
uniform float u_gloss;
uniform float u_shine;
uniform float u_reach;
uniform float u_grain;

out vec4 fragColor;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
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

vec3 pick(vec2 cssPx, vec2 cssRes) {
  vec2 uv = cssPx / cssRes;
  return texture(u_image, cover(vec2(uv.x, 1.0 - uv.y), u_resolution, u_imageSize)).rgb;
}

/*
 * Height, which is the picture's own luminance. Rec. 601 weights rather than a
 * flat average: a flat average makes a saturated blue as tall as a saturated
 * yellow, and the eye says otherwise by a factor of six.
 */
float height(vec2 cssPx, vec2 cssRes) {
  return dot(pick(cssPx, cssRes), vec3(0.299, 0.587, 0.114));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 uv = cssPx / cssRes;

  vec3 base = pick(cssPx, cssRes);

  /*
   * The surface normal, from a central difference across \`smooth\` pixels either
   * side. Taking it across one pixel gives you the noise of the file; taking it
   * across several low-passes the height field on the way, which is the first
   * of the two blurs a normal-map generator would do and the one that matters.
   */
  float e = max(u_smooth, 0.5);
  float dx = height(cssPx + vec2(e, 0.0), cssRes) - height(cssPx - vec2(e, 0.0), cssRes);
  float dy = height(cssPx + vec2(0.0, e), cssRes) - height(cssPx - vec2(0.0, e), cssRes);
  vec3 normal = normalize(vec3(-dx * u_relief, -dy * u_relief, 1.0));

  /*
   * The lamp, in a space where the sheet is flat at z = 0 and x is stretched by
   * the aspect so the falloff stays circular on a frame that is not square.
   * \`height\` is how far above the paper it is held: low is a raking light that
   * finds every ridge, high is a lamp overhead that finds almost none.
   */
  float aspect = cssRes.x / max(cssRes.y, 1.0);
  vec3 lamp = vec3(u_pointer.x * aspect, 1.0 - u_pointer.y, max(u_height, 0.01));
  vec3 here = vec3(uv.x * aspect, uv.y, 0.0);

  vec3 toLamp = lamp - here;
  float dist = length(toLamp);
  vec3 L = toLamp / max(dist, 0.0001);

  float diffuse = max(dot(normal, L), 0.0);
  // Inverse square, softened by the +1 so the lamp does not blow out where it
  // is nearly touching the paper.
  float fall = 1.0 / (1.0 + pow(dist / max(u_reach, 0.01), 2.0));
  float lit = diffuse * fall;

  /*
   * Specular, with the viewer straight on, which is where a reader is. Ink has
   * a sheen that paper does not, so this is the part that says the dark areas
   * are ink rather than dark paper. Blinn's half vector: cheaper than a
   * reflection and better behaved at grazing angles, which is the whole case
   * being drawn here.
   */
  vec3 halfway = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(normal, halfway), 0.0), max(u_shine, 1.0)) * u_gloss * fall;

  /*
   * Modelling around the picture rather than instead of it. Where the lamp
   * delivers exactly \`ambient\` the photograph is itself, above that it lifts
   * and below it falls, so what the lamp adds is a gradient across the sheet
   * and never a new exposure. Multiplied, because light on a surface scales
   * what is already there.
   *
   * The neutral point is a setting rather than a half, and that is not a
   * detail. The light a lamp actually delivers across a frame averages nothing
   * like a half, so fixing the neutral there dimmed the whole picture by a
   * tenth before it lit anything. \`ambient\` is how much light the room has
   * already: set it near the average and the lamp gives you a gradient, set it
   * at zero and the lamp only ever adds.
   */
  float on = clamp(u_active, 0.0, 1.0);
  float model = 1.0 + on * u_strength * (lit - u_ambient);
  vec3 col = base * model + u_light * spec * on;

  float tooth = hash12(floor(cssPx * 0.5) + 11.0) - 0.5;
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
  'u_light',
  'u_height',
  'u_relief',
  'u_smooth',
  'u_strength',
  'u_ambient',
  'u_gloss',
  'u_shine',
  'u_reach',
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
  if (!shader) throw new Error('RelightImage: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`RelightImage: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class RelightImageSurface implements Surface<RelightImageOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private texture: WebGLTexture | null = null
  private imageSize = { width: 1, height: 1 }
  private image: HTMLImageElement | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('RelightImage needs a canvas')
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
    if (!gl) throw new Error('RelightImage needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('RelightImage: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`RelightImage: program failed to link\n${log ?? ''}`)
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

  render(_t: number, opts: RelightImageOptions, pointer: Pointer): void {
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
    gl.uniform3fv(loc('u_light'), rgb(opts.light))
    gl.uniform1f(loc('u_height'), opts.height)
    gl.uniform1f(loc('u_relief'), opts.relief)
    gl.uniform1f(loc('u_smooth'), opts.smooth)
    gl.uniform1f(loc('u_strength'), opts.strength)
    gl.uniform1f(loc('u_ambient'), opts.ambient)
    gl.uniform1f(loc('u_gloss'), opts.gloss)
    gl.uniform1f(loc('u_shine'), opts.shine)
    gl.uniform1f(loc('u_reach'), opts.reach)
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
 * Mount RelightImage into `el`. The element needs a size and one `<img>` child.
 *
 * ```html
 * <figure id="plate" style="position: relative; aspect-ratio: 3 / 2">
 *   <img src="/press.jpg" alt="What the picture shows" />
 * </figure>
 * ```
 *
 * ```ts
 * const lamp = createRelightImage(document.querySelector('#plate')!)
 * lamp.start()
 * ```
 */
export function createRelightImage(el: HTMLElement, opts: Partial<RelightImageOptions> = {}): EffectHandle {
  return mount<RelightImageOptions>(el, opts, {
    defaults: relightImageDefaults,
    create: () => new RelightImageSurface()
  })
}

export default createRelightImage
```

## 2. What it is

A lamp moved across a printed photograph.

It does not relight the scene. There is no depth in a photograph and no honest
way to get one out of a single frame, so anything that claims to move the sun
around inside a picture is guessing at a shape it cannot see. What this lights
is the print: the sheet the picture is on, which has relief wherever the
impression is heavy, and a raking light finds that relief the way a raking light
finds any other surface.

Height is the picture's own luminance. A shadow in the photograph is a hollow in
the sheet and a highlight stands proud, and the normal is the gradient of that
height taken across a few pixels rather than one, because a one-pixel difference
is mostly sensor noise and compression blocks.

There is one thing the lamp adds that a gradient cannot, and it is the thing
worth having: ink has a sheen that paper does not. The specular is what says the
dark passages are ink sitting on a surface rather than dark paper, and without
it this is a soft blob moving about.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency, no depth map to author or ship.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `light` | color | `#fff3df` | any CSS hex | Colour of the lamp. Keep it close to white, warm or cool. It is painted over the picture as a sheen rather than mixed into it, so a saturated colour tints the highlights rather than reading as illumination. |
| `height` | number | `0.32` | 0.02 to 2 | How far above the sheet the lamp is held, as a share of the frame's height. Low is a raking light that finds every ridge in the impression; high is a lamp overhead that finds almost none. This is the first dial to reach for and most of the character is in it. |
| `relief` | number | `4` | 0 to 30 | How much relief the impression has. At 0 the sheet is flat and all you have is a soft gradient moving about. Past about 15 the paper stops reading as paper and starts reading as hammered metal. |
| `smooth` | number | `4` | 0.5 to 8 | Pixels either side the gradient is taken across. Low-passes the height field on the way, so this is the difference between lighting the shape of the impression and lighting the noise in the file. Below about 1.5 you are mostly lighting JPEG blocks. |
| `strength` | number | `0.45` | 0 to 1.5 | How much modelling the lamp lays over the picture. The photograph is exactly itself at the midpoint of the light, so this opens the gradient out either side of it rather than re-exposing anything. |
| `ambient` | number | `0.35` | 0 to 1 | How much light the room has already, which is the point either side of which the lamp works. The light a lamp delivers across a frame averages nothing like a half, so leaving the neutral at a half dims the whole picture before it lights anything. Near the average gives you a gradient; at 0 the lamp only ever adds. |
| `gloss` | number | `0.18` | 0 to 1 | How much the ink catches the light that the paper does not. This is the part that says the dark areas are ink rather than dark paper, and it is what separates this from a gradient. |
| `shine` | number | `26` | 2 to 160 | How tight that catch is. Low is a broad satin sheen; high is a small hard glint that only appears where a ridge faces the lamp exactly. |
| `reach` | number | `1.1` | 0.1 to 3 | How far the lamp throws, as a share of the frame's height. Small is a reading lamp held close with the corners falling away; large is a window on the far side of the room. |
| `grain` | number | `0.25` | 0 to 1 | Paper tooth over the whole thing. |

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
is drawn, which means the lamp never comes on and what you have is the
photograph. That is the right resting state rather than a compromise: the
picture is the content and the lamp was always an extra.

## 7. The three mistakes most likely to be made here

1. **A cross-origin image.** `texImage2D` throws a SecurityError on an image
   from another origin without CORS headers, and it throws at upload rather than
   at load, so the picture appears and the lamp does nothing. Serve the image
   from your own origin or set `crossorigin`.

2. **Using it on a photograph that is already about light.** You will be
   lighting its shadows as though they were trenches. The pictures this suits
   are the flat-lit ones.

3. **Leaving `smooth` at the bottom of its range to get more detail.** What you
   get is the compression, lit. The detail you want is in the impression, and
   the impression is bigger than one pixel.

4. **Turning `relief` up to make it more visible.** `height` is the dial for
   that. Relief past 15 makes the paper metallic, and a photograph printed on
   metal is a different idea from this one.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
