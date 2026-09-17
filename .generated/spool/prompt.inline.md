You are adding **Spool** from Beamish to this project.

> A scroll-run slideshow on a paper web that bows as it accelerates. Surfaces · effect · MIT.
> https://beamish.ink/effects/spool

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The images are the host element's own <img> children. They are hidden from sight and left in the document, so the alt text and source order are whatever you wrote, and a page with no JavaScript still shows the pictures
- At rest nothing is distorted. The whole effect is a function of scroll velocity, so a reader who has stopped scrolling is looking at a photograph
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- Textures are CLAMP_TO_EDGE. The bow samples past the edge of the image and a repeating wrap would tile the opposite side of the picture into the gap
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

**`src/beamish/effects/spool/core.ts`**

```ts
/*
 * Spool: Beamish
 * https://beamish.ink/effects/spool
 *
 * A slideshow the page scroll runs, on a web that bows as it accelerates.
 *
 * A web press does not feed sheets, it feeds one continuous ribbon of paper off
 * a reel, and at speed that ribbon bows between the rollers. The faster it runs
 * the more it bows. When the press stops, the paper lies flat.
 *
 * At rest this draws an undistorted image and nothing else. That is the whole
 * design. The distortion is a function of scroll velocity, so a reader who has
 * stopped scrolling sees a photograph, not an effect. Most WebGL sliders warp
 * continuously and end up reading as a filter laid over the content; this one
 * only exists while it is being pulled.
 *
 * The images come from the host element's own <img> children rather than from
 * an option. Without JavaScript you get a plain list of pictures with real alt
 * text, and with it the canvas draws them instead. The originals stay in the
 * document, so what a screen reader gets is the markup you wrote.
 */

import { mount, type BaseOptions, type EffectHandle, type Scroll, type Surface } from '../../shared/runtime'

export type SpoolOptions = BaseOptions & {
  /** Shown wherever the bow has pulled the image away from the frame edge. */
  paper: string
  /** How hard the sides lag behind the middle. This is the bow. */
  bend: number
  /** How far the whole web slides against the direction of travel. */
  slip: number
  /** Separation between the colour channels at the edges while moving. */
  fringe: number
  /** Paper tooth over the image. */
  grain: number
  /**
   * Scroll velocity that counts as full speed. Above it the effect stops
   * growing, so a trackpad flick does not tear the picture in half.
   */
  reference: number
  /** Fraction of each slide's travel spent crossing to the next. */
  crossfade: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const spoolDefaults: SpoolOptions = {
  paper: '#fbfaf4',
  bend: 0.09,
  slip: 0.018,
  fringe: 0.004,
  grain: 0.4,
  reference: 1.6,
  crossfade: 0.55,
  reducedMotionTime: 0
}

// beamish:shader-begin shaders/spool.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/spool.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * Spool: the paper web running through a press.
 *
 * A web press does not feed sheets, it feeds one continuous ribbon off a reel,
 * and at speed that ribbon bows between the rollers. The faster it runs the more
 * it bows, and when the press stops the paper lies flat again.
 *
 * That is the entire behaviour here. At rest this draws an undistorted image and
 * nothing else, which is the point: the distortion is a function of how fast you
 * are scrolling, so a reader who is not moving never sees an effect at all. Most
 * WebGL sliders warp all the time and read as a filter. This one only shows up
 * while it is being pulled.
 */

uniform sampler2D u_a;
uniform sampler2D u_b;

uniform vec2  u_resolution;
uniform vec2  u_sizeA;
uniform vec2  u_sizeB;
uniform vec3  u_paper;
uniform float u_blend;
uniform float u_velocity;
uniform float u_bend;
uniform float u_slip;
uniform float u_fringe;
uniform float u_grain;
uniform float u_seed;

out vec4 fragColor;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * Cover fit, the CSS object-fit rule, done in UV space. Without it every image
 * whose aspect ratio is not the canvas's is stretched, which is the single most
 * common thing wrong with a hand-rolled WebGL slider.
 */
vec2 cover(vec2 uv, vec2 frame, vec2 image) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  return (uv - 0.5) * scale + 0.5;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  // Textures arrive with their origin at the top left and GL samples from the
  // bottom, so this is flipped once here rather than on upload.
  uv.y = 1.0 - uv.y;

  /*
   * How far across the frame this pixel is, 0 in the middle and 1 at the left
   * and right edges. Squared, so the middle of the web stays nearly flat and
   * the bow is concentrated where the paper is unsupported.
   */
  float fromCentre = abs(uv.x * 2.0 - 1.0);
  float edge = fromCentre * fromCentre;

  // The sides lag behind the middle, which is what curves the top and bottom
  // edges. Displacing y by a function of x is the whole trick.
  float bow = u_velocity * u_bend * edge;

  // And the whole web slides a little against the direction of travel, the way
  // anything with mass does when it is pulled.
  float slip = u_velocity * u_slip;

  vec2 warped = vec2(uv.x, uv.y + bow + slip);

  /*
   * A press running colour work has one plate per ink, and if the web is moving
   * when they strike, the inks land a fraction apart. Sampling the channels at
   * slightly different offsets is the same error, and it is what makes fast
   * scrolling read as printing rather than as a blur filter.
   */
  float fringe = u_velocity * u_fringe * edge;

  vec2 aR = cover(warped + vec2(0.0, fringe), u_resolution, u_sizeA);
  vec2 aG = cover(warped, u_resolution, u_sizeA);
  vec2 aB = cover(warped - vec2(0.0, fringe), u_resolution, u_sizeA);

  vec2 bR = cover(warped + vec2(0.0, fringe), u_resolution, u_sizeB);
  vec2 bG = cover(warped, u_resolution, u_sizeB);
  vec2 bB = cover(warped - vec2(0.0, fringe), u_resolution, u_sizeB);

  vec3 a = vec3(texture(u_a, aR).r, texture(u_a, aG).g, texture(u_a, aB).b);
  vec3 b = vec3(texture(u_b, bR).r, texture(u_b, bG).g, texture(u_b, bB).b);

  vec3 col = mix(a, b, u_blend);

  /*
   * Outside the cover rectangle there is no image, only clamped edge pixels
   * smeared into a streak. The bow pushes pixels past the top and bottom of the
   * frame, so this has to be paper rather than whatever the last row happened
   * to be.
   */
  vec2 bounds = step(vec2(0.0), aG) * step(aG, vec2(1.0));
  float inside = bounds.x * bounds.y;
  col = mix(u_paper, col, inside);

  float tooth = hash12(floor(gl_FragCoord.xy * 0.5) + u_seed) - 0.5;
  col += tooth * 0.045 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_a',
  'u_b',
  'u_resolution',
  'u_sizeA',
  'u_sizeB',
  'u_paper',
  'u_blend',
  'u_velocity',
  'u_bend',
  'u_slip',
  'u_fringe',
  'u_grain',
  'u_seed'
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
  if (!shader) throw new Error('Spool: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Spool: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

type Slide = { texture: WebGLTexture; width: number; height: number }

class SpoolSurface implements Surface<SpoolOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private slides: Slide[] = []
  private images: HTMLImageElement[] = []
  private blank: WebGLTexture | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('Spool needs a canvas')
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
    if (!gl) throw new Error('Spool needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('Spool: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`Spool: program failed to link\n${log ?? ''}`)
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
     * One opaque pixel, bound wherever a real image has not arrived yet. A
     * sampler left unbound in WebGL2 reads as black, which would flash the
     * whole frame dark on the first paint of a slow connection.
     */
    const blank = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, blank)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([251, 250, 244, 255]))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    this.blank = blank

    this.collect(ctx.host)
  }

  /*
   * The images are the host's own children. They are hidden from sight but left
   * in the document, so the alt text and the source order are still whatever was
   * written, and a page with no JavaScript still shows the pictures.
   */
  private collect(host: HTMLElement): void {
    const found = [...host.querySelectorAll('img')]
    this.images = found
    for (const image of found) {
      image.style.visibility = 'hidden'
      if (image.complete && image.naturalWidth > 0) this.upload(image)
      else image.addEventListener('load', () => this.upload(image), { once: true })
    }
  }

  private upload(image: HTMLImageElement): void {
    const gl = this.gl
    if (!gl || image.naturalWidth === 0) return
    const index = this.images.indexOf(image)
    if (index < 0 || this.slides[index]) return

    const texture = gl.createTexture()
    if (!texture) return
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    /*
     * CLAMP_TO_EDGE, not REPEAT. The bow pushes samples past the edge of the
     * image, and a repeating wrap would tile the opposite side of the picture
     * into the gap. The shader paints paper over that region instead, but the
     * clamp is what stops it being a mirrored seam in the meantime.
     */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    this.slides[index] = { texture, width: image.naturalWidth, height: image.naturalHeight }
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
    this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight)
  }

  render(_t: number, opts: SpoolOptions, _pointer: unknown, scroll: Scroll): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)

    const count = Math.max(this.images.length, 1)
    const loc = (name: UniformName) => this.locations.get(name) ?? null

    /*
     * Scroll position picks the slide, and the fraction between two of them is
     * the crossfade. `crossfade` decides how much of each slide's travel is
     * spent moving rather than sitting still, so a low value holds each picture
     * and cuts quickly, and 1 never stops dissolving.
     */
    const travel = scroll.progress * (count - 1)
    const index = Math.min(Math.floor(travel), Math.max(count - 2, 0))
    const within = count > 1 ? travel - index : 0
    const window = Math.min(Math.max(opts.crossfade, 0.01), 1)
    const raw = Math.min(Math.max((within - (1 - window)) / window, 0), 1)
    // Smoothstep, so a slide settles rather than arriving at a constant rate.
    const blend = raw * raw * (3 - 2 * raw)

    const a = this.slides[index] ?? null
    const b = this.slides[Math.min(index + 1, count - 1)] ?? null

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, a?.texture ?? this.blank)
    gl.uniform1i(loc('u_a'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, b?.texture ?? a?.texture ?? this.blank)
    gl.uniform1i(loc('u_b'), 1)

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform2f(loc('u_sizeA'), a?.width ?? 1, a?.height ?? 1)
    gl.uniform2f(loc('u_sizeB'), b?.width ?? a?.width ?? 1, b?.height ?? a?.height ?? 1)
    gl.uniform3fv(loc('u_paper'), rgb(opts.paper))
    gl.uniform1f(loc('u_blend'), blend)

    /*
     * Normalised and clipped. A trackpad can report a velocity an order of
     * magnitude past anything a mouse wheel produces, and without a ceiling the
     * picture tears in half the first time somebody flicks it.
     */
    const reference = Math.max(opts.reference, 0.001)
    const velocity = Math.max(-1, Math.min(1, scroll.velocity / reference))

    gl.uniform1f(loc('u_velocity'), velocity)
    gl.uniform1f(loc('u_bend'), opts.bend)
    gl.uniform1f(loc('u_slip'), opts.slip)
    gl.uniform1f(loc('u_fringe'), opts.fringe)
    gl.uniform1f(loc('u_grain'), opts.grain)
    // Fixed per slide rather than per frame: grain that crawls is a screen
    // artefact, grain that sits still is paper.
    gl.uniform1f(loc('u_seed'), index * 17.13)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.gl
  }

  teardown(): void {
    const gl = this.gl
    if (gl) {
      for (const slide of this.slides) if (slide) gl.deleteTexture(slide.texture)
      if (this.blank) gl.deleteTexture(this.blank)
      if (this.program) gl.deleteProgram(this.program)
      if (this.vao) gl.deleteVertexArray(this.vao)
    }
    // Put the markup back the way it was found. The effect borrowed these; it
    // does not own them.
    for (const image of this.images) image.style.visibility = ''
    this.slides = []
    this.images = []
    this.blank = null
    this.gl = null
    this.program = null
    this.vao = null
    this.locations.clear()
  }
}

/**
 * Mount Spool into `el`. The element needs a size, and it needs `<img>` children
 * to draw.
 *
 * ```html
 * <div id="reel" style="height: 100vh">
 *   <img src="/one.jpg" alt="…" />
 *   <img src="/two.jpg" alt="…" />
 * </div>
 * ```
 *
 * ```ts
 * const spool = createSpool(document.querySelector('#reel')!)
 * spool.start()
 * // …later
 * spool.destroy()
 * ```
 */
export function createSpool(el: HTMLElement, opts: Partial<SpoolOptions> = {}): EffectHandle {
  return mount<SpoolOptions>(el, opts, {
    defaults: spoolDefaults,
    create: () => new SpoolSurface()
  })
}

export default createSpool
```

## 2. What it is

A slideshow the page scroll runs, on a paper web that bows as it accelerates.

A web press does not feed sheets. It feeds one continuous ribbon of paper off a
reel, and at speed that ribbon bows between the rollers. The faster it runs the
more it bows. When the press stops, the paper lies flat.

That is the whole behaviour. At rest this draws an undistorted photograph and
nothing else. The distortion is a function of scroll velocity, not of time and
not of position, so a reader who has stopped scrolling is looking at the picture
rather than at an effect. Most WebGL sliders warp continuously and end up reading
as a filter laid over the content. This one only exists while it is being pulled.

Three things happen while it moves, and all three are the same press. The sides
lag behind the middle, which curves the top and bottom edges. The whole web slides
a little against the direction of travel, the way anything with mass does when it
is pulled. And the colour channels separate slightly at the edges, because a press
running colour work strikes one plate per ink and a moving web lands them a
fraction apart.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency, no render targets.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | Shown wherever the bow has pulled the image away from the edge of the frame. Match it to the page behind, or the gap reads as a border that appears only while scrolling. |
| `bend` | number | `0.09` | 0 to 0.3 | How hard the sides lag behind the middle. This is the bow, and it is the option you came for. Past about 0.12 it stops being a press and starts being a fisheye. |
| `slip` | number | `0.018` | 0 to 0.15 | How far the whole web slides against the direction of travel, the way anything with mass does when it is pulled. Small: this is the part you feel rather than see. |
| `fringe` | number | `0.004` | 0 to 0.03 | Separation between the colour channels at the edges while moving. A press running colour work strikes one plate per ink, and a moving web lands them a fraction apart. Keep it under about 0.01 or it reads as a broken monitor. |
| `grain` | number | `0.4` | 0 to 1 | Paper tooth over the image. Fixed per slide rather than per frame, because grain that crawls is a screen artefact and grain that sits still is paper. |
| `reference` | number | `1.6` | 0.2 to 6 | The scroll velocity that counts as full speed, in screens per second. Above it the effect stops growing. Lower makes the web bow more readily; too low and an ordinary wheel click maxes it out. |
| `crossfade` | number | `0.55` | 0.05 to 1 | Fraction of each slide's travel spent crossing to the next. Low holds each picture still and then cuts; 1 never stops dissolving. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, deletes every texture, restores the
original images, cancels the RAF, disconnects both observers and removes every
listener including the scroll one. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever runs
out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

There is nothing to pause. Nothing moves unless the reader moves it, which is
what takes this outside WCAG 2.2.2 rather than exempting it from it. `stop()` and
`start()` are still on the handle.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn, which means the reader gets a still photograph with no warp at all.
That is the correct outcome here and it needs no special case.

## 7. The three mistakes most likely to be made here

1. **Turning `bend` up to see it better.** If you cannot see it, the reason is
   almost always that the host is too short, so the whole set crosses in one flick
   and there is no room to build speed. Give it height before you touch `bend`.
   Past about 0.12 it stops being a press and starts being a fisheye.

2. **Leaving `paper` on the default when the page is not.** The bow pulls the
   image away from the top and bottom of the frame and `paper` is what shows in
   the gap. If it does not match the page behind, a border appears out of nowhere
   whenever somebody scrolls.

3. **Pale images.** The warp is an edge effect, and an image that is nearly the
   same colour as the paper hides its own edges. Pictures with detail running to
   the frame show it; washed-out ones do not.

4. **Expecting it to animate on its own.** It has no idle state and no loop of its
   own. A screenshot of a page nobody is scrolling is a photograph, which is the
   entire point.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
