You are adding **GlassPanel** from Beamish to this project.

> A slab of glass laid on a picture, bending and splitting what scrolls behind it. Surfaces · effect · MIT.
> https://beamish.ink/effects/glass-panel

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The picture is the host element's own <img> child. It is hidden from sight and left in the document, so the alt text is whatever you wrote and a page with no JavaScript still shows it
- This is WebGL rather than CSS because backdrop-filter can blur what is behind an element but cannot bend it, and bending is most of what glass is. The one CSS route that bends, an SVG displacement filter on the backdrop, is Chromium only and fails silently everywhere else
- The trade is that the panel owns its backdrop: it refracts the picture it was given rather than arbitrary page content. Anything that has to sit on top goes in the DOM above the canvas
- The slab is a signed distance field for a rounded rectangle, and its gradient is analytic rather than sampled, because an approximate normal shows up at once as a wobble along the straight runs
- Dispersion is three samples at three offsets along that normal, taken per tap inside the blur so the fringe survives it rather than being averaged away
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- Legibility is a luminosity compression rather than a tint: the backdrop's brightness is scaled toward a level, so the hue and the detail survive. Mixing toward white measures the same and looks dead, because it desaturates the picture and flattens what the glass is supposed to be bending
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

**`src/beamish/effects/glass-panel/core.ts`**

```ts
/*
 * GlassPanel: Beamish
 * https://beamish.ink/effects/glass-panel
 *
 * A slab of glass laid on a picture.
 *
 * Not a blur with a white border round it. The reason this is WebGL and not
 * CSS is the first thing in the list: `backdrop-filter` can blur what is behind
 * an element but it cannot bend it, and bending is most of what glass is. The
 * one CSS route that bends, an SVG displacement filter on the backdrop, is
 * Chromium only and fails silently everywhere else.
 *
 * So the panel owns its own backdrop. The picture comes from the host element's
 * own <img> child and is drawn by this shader, which means every pixel behind
 * the glass is one the shader can sample, bend, split and blur. That is the
 * trade: it refracts a picture rather than arbitrary page content.
 *
 * The slab is a signed distance field for a rounded rectangle. Light bends
 * along that field's gradient, which is the surface normal, by an amount
 * weighted towards the edge, because the middle of a slab is flat and only the
 * bevel has an angle to refract through. The three channels bend by slightly
 * different amounts, which is dispersion and is the cheapest thing that makes
 * a shape read as glass rather than as plastic.
 *
 * Scrolling moves the picture behind the glass, which is the point: a static
 * refraction is a texture, and a refraction you can push things through is a
 * lens.
 */

import { mount, type BaseOptions, type EffectHandle, type Scroll, type Surface } from '../../shared/runtime'

export type GlassPanelOptions = BaseOptions & {
  /** The tint the glass leaves, and the colour its highlights take. */
  glass: string
  /** Centre of the panel across the element, 0 to 1. */
  panelX: number
  /** Centre of the panel down the element, 0 to 1. */
  panelY: number
  /** Width of the panel as a share of the element. */
  panelWidth: number
  /** Height of the panel as a share of the element. */
  panelHeight: number
  /** Corner radius in CSS pixels. */
  radius: number
  /** How far in from the edge the bevel reaches, in CSS pixels. */
  bevel: number
  /** How far the bevel bends what is behind it, in CSS pixels. */
  refraction: number
  /** How far the three channels separate as they bend. */
  dispersion: number
  /** Frosting, as a blur radius in CSS pixels. */
  frost: number
  /** How brightly the bevel catches the light. */
  specular: number
  /** How tight that catch is. */
  shine: number
  /** How much the rim brightens where you look through the most glass. */
  fresnel: number
  /** The bright hairline just inside the edge. */
  edge: number
  /** How much colour the glass leaves on what passes through it. */
  tint: number
  /** How far the backdrop's brightness is pulled toward `level`. */
  luminosity: number
  /** The brightness it is pulled toward. */
  level: number
  /** Where the light is, across the panel. */
  lightX: number
  /** Where the light is, down the panel. */
  lightY: number
  /** How far the shadow under the slab reaches, in CSS pixels. */
  shadow: number
  /** How far the picture travels behind the glass over a full scroll. */
  travel: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const glassPanelDefaults: GlassPanelOptions = {
  glass: '#ffffff',
  panelX: 0.36,
  panelY: 0.63,
  panelWidth: 0.54,
  panelHeight: 0.42,
  radius: 26,
  bevel: 22,
  refraction: 40,
  dispersion: 8,
  frost: 3,
  specular: 0.35,
  shine: 40,
  fresnel: 0.06,
  edge: 0.25,
  tint: 0.22,
  luminosity: 0.65,
  level: 0.74,
  lightX: -0.5,
  lightY: 0.7,
  shadow: 26,
  travel: 1
}

// beamish:shader-begin shaders/glass-panel.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/glass-panel.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * GlassPanel: a slab of glass laid on a picture.
 *
 * Not a blur with a white border. Every part of this is something glass
 * actually does, and the reason it has to be WebGL rather than CSS is the first
 * one: backdrop-filter can blur what is behind an element but it cannot bend
 * it, and bending is most of what glass is.
 *
 *   Refraction. The slab is a signed distance field, and the direction light
 *   bends is that field's gradient, which is the surface normal. The amount is
 *   weighted towards the edge, because the middle of a slab is flat and only
 *   the bevel has an angle to refract through.
 *
 *   Dispersion. Glass has a different refractive index per wavelength, so the
 *   three channels are sampled at three slightly different offsets along that
 *   same normal. This is why the edges fringe, and it is the single cheapest
 *   thing that makes a shape read as glass rather than as plastic.
 *
 *   Frost. A twelve-tap ring, which is not a Gaussian and does not need to be.
 *
 *   Specular and fresnel. The 2D gradient plus a height gives a 3D normal to
 *   light, so the bevel catches a highlight that moves with the light rather
 *   than a painted-on gloss, and the rim brightens where you are looking
 *   through the most glass.
 */

uniform sampler2D u_image;
uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform float u_dpr;
uniform float u_scroll;

uniform vec4  u_panel;
uniform float u_radius;
uniform float u_bevel;
uniform float u_refraction;
uniform float u_dispersion;
uniform float u_frost;
uniform float u_specular;
uniform float u_shine;
uniform float u_fresnel;
uniform float u_edge;
uniform float u_tint;
uniform float u_luminosity;
uniform float u_level;
uniform vec3  u_glass;
uniform vec2  u_light;
uniform float u_shadow;
uniform float u_travel;

out vec4 fragColor;

const float TAU = 6.28318530718;

/* Cover fit, the CSS object-fit rule, with the picture pushed by the scroll. */
vec2 cover(vec2 uv, vec2 frame, vec2 image, float shift) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  /*
   * The picture has to be larger than the frame before it can travel through
   * it. A cover fit leaves almost no slack when the picture and the frame are
   * close in shape, so the sampled window is shrunk by the travel first, which
   * is the same thing as zooming the picture in, and the slack that makes is
   * what the scroll moves through.
   */
  vec2 scaled = scale / (1.0 + shift * 0.0 + u_travel * 0.3);
  vec2 fitted = (uv - 0.5) * scaled + 0.5;

  /*
   * And only as far as that slack. Pushing a picture further than its fit
   * allows walks off the end of the texture, and the clamp smears the last row
   * of pixels up the frame, which is a stripe nobody will mistake for a
   * photograph.
   */
  float spare = max(0.5 - scaled.y * 0.5, 0.0);
  float offset = clamp(shift * 2.0 - 1.0, -1.0, 1.0) * spare;
  return vec2(fitted.x, fitted.y + offset);
}

vec3 pick(vec2 px, vec2 res, float shift) {
  vec2 uv = px / res;
  return texture(u_image, cover(vec2(uv.x, 1.0 - uv.y), u_resolution, u_imageSize, shift)).rgb;
}

/*
 * Signed distance to a rounded rectangle, negative inside. Exact rather than
 * sampled: the gradient of this is the surface normal and an approximate
 * normal shows up immediately as a wobble along the straight runs.
 */
float sdRoundRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

/* The analytic gradient of the same field. */
vec2 sdGradient(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  vec2 s = sign(p);
  if (q.x > 0.0 || q.y > 0.0) {
    // Round corner, or the outside of a straight run.
    vec2 m = max(q, 0.0);
    return s * normalize(m + 1e-6);
  }
  // Inside the straight runs: the nearest edge is whichever is closer.
  return q.x > q.y ? vec2(s.x, 0.0) : vec2(0.0, s.y);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  float shift = u_scroll;
  vec3 col = pick(cssPx, cssRes, shift);

  // The slab, in CSS pixels, measured from its own centre.
  vec2 centre = vec2(u_panel.x, 1.0 - u_panel.y) * cssRes;
  vec2 halfSize = vec2(u_panel.z, u_panel.w) * cssRes * 0.5;
  float radius = min(u_radius, min(halfSize.x, halfSize.y));
  vec2 p = cssPx - centre;

  float d = sdRoundRect(p, halfSize, radius);
  float pixel = 1.0;

  /*
   * The shadow first, because it lies outside the slab and under it. Glass
   * sitting on a picture casts one, and without it the panel is a window cut
   * in the image rather than an object resting on it.
   */
  float dropped = smoothstep(u_shadow, 0.0, d) * (1.0 - smoothstep(-pixel, pixel, -d));
  col *= 1.0 - dropped * 0.22;

  if (d < pixel) {
    vec2 grad = sdGradient(p, halfSize, radius);

    /*
     * The bevel. 0 across the flat middle and 1 at the rim, which is where the
     * slab has an angle for light to refract through. Everything below is
     * weighted by it, so the centre of the panel is honest glass: blurred and
     * tinted, but not bent.
     */
    float bevel = clamp(1.0 + d / max(u_bevel, 0.5), 0.0, 1.0);
    float curve = bevel * bevel;

    // Where the light enters, in pixels.
    vec2 bend = grad * curve * u_refraction;
    vec2 split = grad * curve * u_dispersion;

    /*
     * Frost, as a twelve-tap ring. Not a Gaussian and it does not need to be:
     * what is behind a panel of frosted glass is a smear, and the eye has no
     * way to tell a correct smear from a cheap one.
     */
    float frost = u_frost * (0.35 + 0.65 * curve);
    vec3 glass = vec3(0.0);
    float taps = 0.0;
    for (int i = 0; i < 12; i++) {
      float a = TAU * float(i) / 12.0;
      vec2 ring = vec2(cos(a), sin(a)) * frost;
      // One sample per channel per tap, offset by the dispersion, so the
      // fringe survives the blur instead of being averaged away.
      glass.r += pick(cssPx + bend + split + ring, cssRes, shift).r;
      glass.g += pick(cssPx + bend + ring, cssRes, shift).g;
      glass.b += pick(cssPx + bend - split + ring, cssRes, shift).b;
      taps += 1.0;
    }
    glass /= taps;

    /*
     * A surface to light. The 2D gradient is the slope of the bevel and the
     * height completes it, so what comes out is a real normal for a rounded
     * edge rather than a painted highlight.
     */
    vec3 normal = normalize(vec3(grad * curve * 1.4, 1.0 - curve * 0.55));
    vec3 lightDir = normalize(vec3(u_light, 0.85));
    vec3 view = vec3(0.0, 0.0, 1.0);
    vec3 halfway = normalize(lightDir + view);

    float spec = pow(max(dot(normal, halfway), 0.0), max(u_shine, 1.0)) * u_specular;
    // A second, broader catch from the opposite side, which is what a room
    // does and what one light never looks like.
    float back = pow(max(dot(normal, normalize(vec3(-u_light, 0.7))), 0.0), 6.0) * u_specular * 0.25;

    // Fresnel: more reflection where you are looking through the most glass.
    float rim = pow(1.0 - max(normal.z, 0.0), 2.2) * u_fresnel;

    /*
     * The inner stroke, on the side facing the light only.
     *
     * Running it the whole way round is the single thing that makes a glass
     * panel look like a lit tube, and it is what almost every version of this
     * effect does. A real slab catches a hairline where the bevel turns towards
     * the light and shows nothing on the side turned away, so the stroke is
     * weighted by how much the edge faces the light, with a floor low enough to
     * keep the shape legible against a pale picture.
     */
    float facing = max(dot(grad, normalize(u_light + 1e-6)), 0.0);
    float band = smoothstep(0.55, 0.98, bevel) * smoothstep(1.0, 0.93, bevel);
    float stroke = band * (0.18 + 0.82 * facing) * u_edge;

    /*
     * Legibility, the way the two systems that have solved this do it.
     *
     * The first attempt here was a milky core: a flat white wash through the
     * middle of the slab. It measured well and looked dead, because washing
     * toward white desaturates the picture and flattens its detail, and what is
     * left is a panel with a smear on it rather than glass.
     *
     * Windows Acrylic does it with a luminosity layer: the backdrop's
     * brightness is pulled toward a level, which compresses how dark or bright
     * it is allowed to get, while the colour and the detail survive. Apple's
     * material does the same thing adaptively, shifting only as far as
     * legibility needs and letting as much content through as possible.
     *
     * So this scales the backdrop's luminance toward \`level\` rather than
     * mixing it toward a colour. A dark passage comes up, a bright one comes
     * down, the hue is untouched and every edge is still there to be bent. It
     * is compression, not paint.
     */
    float behind = dot(glass, vec3(0.299, 0.587, 0.114));
    float wanted = mix(behind, u_level, u_luminosity);

    /*
     * Replace the luminance, keep the colour difference. This is what a
     * luminosity blend means and the arithmetic matters.
     *
     * Scaling the channels by the ratio of wanted to behind looks like the
     * obvious way to do it and is wrong: it preserves the ratios between the
     * channels, so a dark pixel with a slight cast gets that cast multiplied
     * along with everything else. Lifting a dark green by six turns it into a
     * neon one, and the panel comes out looking like an oil slick.
     *
     * Adding the chroma back at its original size instead moves the brightness
     * without touching how colourful the pixel was. A dark green lifts to a
     * pale green, which is what putting a light behind a piece of coloured
     * glass actually does.
     */
    vec3 chroma = glass - behind;
    vec3 levelled = clamp(vec3(wanted) + chroma * 0.85, 0.0, 1.0);

    vec3 lit = mix(levelled, u_glass, u_tint * 0.6);
    lit += u_glass * (spec + back + rim * 0.35 + stroke);

    float inside = smoothstep(pixel, -pixel, d);
    col = mix(col, lit, inside);
  }

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_image',
  'u_resolution',
  'u_imageSize',
  'u_dpr',
  'u_scroll',
  'u_panel',
  'u_radius',
  'u_bevel',
  'u_refraction',
  'u_dispersion',
  'u_frost',
  'u_specular',
  'u_shine',
  'u_fresnel',
  'u_edge',
  'u_tint',
  'u_luminosity',
  'u_level',
  'u_glass',
  'u_light',
  'u_shadow',
  'u_travel'
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
  if (!shader) throw new Error('GlassPanel: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`GlassPanel: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class GlassPanelSurface implements Surface<GlassPanelOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private texture: WebGLTexture | null = null
  private imageSize = { width: 1, height: 1 }
  private image: HTMLImageElement | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('GlassPanel needs a canvas')
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
    if (!gl) throw new Error('GlassPanel needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('GlassPanel: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`GlassPanel: program failed to link\n${log ?? ''}`)
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

  render(_t: number, opts: GlassPanelOptions, _pointer: unknown, scroll: Scroll): void {
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
    gl.uniform1f(loc('u_scroll'), scroll.progress)
    gl.uniform4f(loc('u_panel'), opts.panelX, opts.panelY, opts.panelWidth, opts.panelHeight)
    gl.uniform1f(loc('u_radius'), opts.radius)
    gl.uniform1f(loc('u_bevel'), opts.bevel)
    gl.uniform1f(loc('u_refraction'), opts.refraction)
    gl.uniform1f(loc('u_dispersion'), opts.dispersion)
    gl.uniform1f(loc('u_frost'), opts.frost)
    gl.uniform1f(loc('u_specular'), opts.specular)
    gl.uniform1f(loc('u_shine'), opts.shine)
    gl.uniform1f(loc('u_fresnel'), opts.fresnel)
    gl.uniform1f(loc('u_edge'), opts.edge)
    gl.uniform1f(loc('u_tint'), opts.tint)
    gl.uniform1f(loc('u_luminosity'), opts.luminosity)
    gl.uniform1f(loc('u_level'), opts.level)
    gl.uniform3fv(loc('u_glass'), rgb(opts.glass))
    gl.uniform2f(loc('u_light'), opts.lightX, opts.lightY)
    gl.uniform1f(loc('u_shadow'), opts.shadow)
    gl.uniform1f(loc('u_travel'), opts.travel)

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
 * Mount GlassPanel into `el`. The element needs a size and one `<img>` child.
 *
 * ```html
 * <figure id="plate" style="position: relative; aspect-ratio: 3 / 2">
 *   <img src="/press.jpg" alt="What the picture shows" />
 * </figure>
 * ```
 *
 * ```ts
 * const halftone-magnifier = createGlassPanel(document.querySelector('#plate')!)
 * halftone-magnifier.start()
 * ```
 */
export function createGlassPanel(el: HTMLElement, opts: Partial<GlassPanelOptions> = {}): EffectHandle {
  return mount<GlassPanelOptions>(el, opts, {
    defaults: glassPanelDefaults,
    create: () => new GlassPanelSurface()
  })
}

export default createGlassPanel
```

## 2. What it is

A slab of glass laid on a picture, bending and splitting what scrolls behind it.

Not a blur with a white border. Every part of this is something glass does:

**It bends.** The slab is a signed distance field for a rounded rectangle, and
the direction light bends is that field's gradient, which is the surface normal.
The amount is weighted towards the edge, because the middle of a slab is flat
and only the bevel has an angle to refract through. That is why the centre of
the panel stays readable while the rim distorts.

**It splits.** Glass has a different refractive index per wavelength, so the
three channels bend by slightly different amounts. This is why a real glass edge
fringes, and it is the single cheapest thing that stops a shape reading as
plastic.

**It catches the light.** The 2D gradient plus a height gives a real 3D normal,
so the highlight moves round the bevel as the light moves rather than sitting
where somebody painted it. The rim brightens where you are looking through the
most glass, which is what gives the edge its thickness.

**It sits on something.** There is a shadow under it. Without one the panel is a
window cut in the picture rather than an object resting on it.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `glass` | color | `#ffffff` | any CSS hex | The tint the glass leaves and the colour its highlights take. Near white unless the glass is meant to be coloured, because it is multiplied into the picture rather than painted over it. |
| `panelX` | number | `0.36` | 0 to 1 | Centre of the panel across the element. |
| `panelY` | number | `0.63` | 0 to 1 | Centre of the panel down the element. |
| `panelWidth` | number | `0.54` | 0.05 to 1 | Width of the panel as a share of the element. |
| `panelHeight` | number | `0.42` | 0.03 to 1 | Height of the panel as a share of the element. |
| `radius` | number | `26` | 0 to 200 | Corner radius in CSS pixels, capped at half the shorter side, so a large number gives a capsule rather than an error. |
| `bevel` | number | `22` | 1 to 120 | How far in from the edge the bevel reaches. This is the width of the band that bends: the middle of a slab is flat and refracts nothing, which is why the centre stays readable and only the rim distorts. |
| `refraction` | number | `40` | 0 to 120 | How far the bevel bends what is behind it, in pixels. At 0 you have frosted glass, and this is the setting that makes it glass rather than a blur. |
| `dispersion` | number | `8` | 0 to 30 | How far the three channels separate as they bend. Glass has a different refractive index per wavelength, which is why a real edge fringes, and it is the cheapest thing that stops a shape reading as plastic. Past about 12 it stops being glass and starts being a prism. |
| `frost` | number | `3` | 0 to 40 | Frosting, as a blur radius in pixels. Twelve taps on a ring, which is not a Gaussian and does not need to be. |
| `specular` | number | `0.35` | 0 to 2 | How brightly the bevel catches the light. The highlight is lit off a real normal built from the distance field, so it moves round the rim as the light does rather than sitting where it was painted. |
| `shine` | number | `40` | 1 to 160 | How tight that catch is. Low is a broad satin sheen along the whole bevel; high is a small hard glint at the point facing the light. |
| `fresnel` | number | `0.06` | 0 to 1.5 | How much the rim brightens where you are looking through the most glass. This is what gives the edge its thickness. |
| `edge` | number | `0.25` | 0 to 1.5 | The bright hairline just inside the edge, where the bevel turns over. |
| `tint` | number | `0.22` | 0 to 1 | How much colour the glass leaves on what passes through it. This is also the contrast control if anything is going to be read on top of the panel. |
| `luminosity` | number | `0.65` | 0 to 1 | How far the backdrop's brightness is pulled toward `level` before the glass is drawn. This is what makes anything readable on the panel, and it is a compression rather than a wash: the luminance moves, the hue and the detail do not, so the picture is still a picture. Windows Acrylic calls this the luminosity layer and it is the part that guarantees contrast. At 0 the glass is clear and nothing is safe to put on it. |
| `level` | number | `0.74` | 0 to 1 | The brightness the backdrop is pulled toward. High for dark text on the panel, low for light text. It is the single number that decides which way round the glass works. |
| `lightX` | number | `-0.5` | -2 to 2 | Where the light is, across the panel. |
| `lightY` | number | `0.7` | -2 to 2 | Where the light is, down the panel. |
| `shadow` | number | `26` | 0 to 80 | How far the shadow under the slab reaches. Without it the panel is a window cut in the picture rather than an object resting on it. |
| `travel` | number | `1` | 0 to 3 | How far the picture travels behind the glass over a full scroll, as a share of the slack the cover fit left. At 0 the picture is fixed and all the glass has to bend is a still. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, deletes the texture, cancels the RAF,
disconnects both observers, removes every listener and puts the `<img>` back the
way it found it. Call it.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

Nothing moves unless the page scrolls, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn: the picture sits at its resting position with the glass on it, which
is a finished composition rather than a broken one.

## 7. The three mistakes most likely to be made here

1. **Expecting it to refract the page.** It refracts the picture it was given.
   Nothing in a browser lets WebGL sample arbitrary DOM, and the libraries that
   appear to do it are rasterising your markup to an image every frame.

2. **Putting the nav text in the canvas.** It would not be selectable,
   focusable, translatable or readable by anything assistive. The canvas is
   decoration; the markup goes on top.

3. **A cross-origin image.** `texImage2D` throws a SecurityError on an image
   from another origin without CORS headers, and it throws at upload rather than
   at load, so the picture appears and the glass does not.

4. **A soft photograph.** Refraction is only legible where it has an edge to
   bend. On a gradient or a blurred background the bend is there and invisible,
   and you will conclude the effect is subtle when it is simply unlit.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
