You are adding **InkBleedText** from Beamish to this project.

> Type on paper too absorbent for it, the ink wicking along the fibres. Type · effect · MIT.
> https://beamish.ink/effects/ink-bleed-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. One SVG displacement filter, which is the honest mechanism: turbulence supplies the fibre and feDisplacementMap pushes each pixel of the glyph by the amount of fibre under it
- Not a blur. A Gaussian softens an edge evenly, which is a lens out of focus rather than ink spreading, and it is what makes most attempts at this look photographic rather than printed
- fractalNoise rather than turbulence: turbulence takes the modulus of each octave and leaves hard creases that read as cracks in the letter
- The filter region is widened to 150%, because displaced pixels outside it are cut off and a heavily bled letter would come back with its edges sliced square
- Each instance gets its own filter, so two bled headings on a page do not share one
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

**`src/beamish/effects/ink-bleed-text/core.ts`**

```ts
/*
 * InkBleedText: Beamish
 * https://beamish.ink/effects/ink-bleed-text
 *
 * Type printed on paper that is too absorbent for it.
 *
 * The usual version of this is a CRT wobble: the glyph edges shimmer sideways
 * like a signal losing lock. Paper has its own way of blurring a letter and it
 * is nothing like that. Ink wicks along the fibres, so the edge does not move,
 * it grows teeth. Serifs fill in, counters close up, and the whole letter gains
 * a fuzz that is irregular at the scale of the fibre rather than smooth.
 *
 * An SVG displacement filter is the honest way to draw that. Turbulence supplies
 * the fibre, and feDisplacementMap pushes each pixel of the glyph sideways by the
 * amount of fibre under it, which is exactly the mechanism: ink goes where the
 * paper lets it. A Gaussian blur would soften the edge evenly, which is a lens
 * being out of focus rather than ink spreading, and it is the thing that makes
 * most attempts at this look like a photograph rather than a page.
 *
 * Only the displacement scale is animated. Turbulence is expensive to recompute
 * and the fibre of a sheet does not change; what changes is how far the ink has
 * crept into it.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type InkBleedTextOptions = BaseOptions & {
  /** How far the ink creeps, in pixels, at its furthest. */
  bleed: number
  /** How far it has crept at its least. Never quite dry. */
  floor: number
  /** Coarseness of the fibre. Lower is a rougher, more absorbent sheet. */
  fibre: number
  /** Layers of fibre. More is a finer, more tangled structure. */
  detail: number
  /** Seconds for one breath of the ink. Exactly periodic over this. */
  period: number
  /** Which sheet of paper. Any two seeds give different fibre. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const inkBleedTextDefaults: InkBleedTextOptions = {
  bleed: 9,
  floor: 3,
  fibre: 0.055,
  detail: 3,
  period: 9,
  seed: 4,
  reducedMotionTime: 0
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const TAU = Math.PI * 2

/* One per instance, so two bled headings on a page do not share a filter. */
let instances = 0

class InkBleedTextSurface implements Surface<InkBleedTextOptions> {
  private host: HTMLElement | null = null
  private svg: SVGSVGElement | null = null
  private turbulence: SVGFETurbulenceElement | null = null
  private displacement: SVGFEDisplacementMapElement | null = null
  private previousFilter = ''
  private id = ''
  private builtFor = ''

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host
    this.id = `beamish-bleed-${(instances += 1)}`

    /*
     * The filter lives in an SVG of its own rather than in the document, so
     * tearing the effect down is one removal and nothing is left behind in a
     * shared defs block that another instance might still be using.
     */
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'

    const filter = document.createElementNS(SVG_NS, 'filter')
    filter.setAttribute('id', this.id)
    /*
     * Room for the ink to spread into. The default filter region is the element
     * plus ten percent, and displaced pixels outside it are simply cut off, so
     * a heavily bled letter would come back with its edges sliced square.
     */
    filter.setAttribute('x', '-25%')
    filter.setAttribute('y', '-25%')
    filter.setAttribute('width', '150%')
    filter.setAttribute('height', '150%')
    filter.setAttribute('color-interpolation-filters', 'sRGB')

    const turbulence = document.createElementNS(SVG_NS, 'feTurbulence')
    // Fractal noise rather than turbulence proper: turbulence takes the modulus
    // of each octave, which leaves hard creases that read as cracks in the
    // letter rather than as fibre.
    turbulence.setAttribute('type', 'fractalNoise')
    turbulence.setAttribute('result', 'fibre')

    const displacement = document.createElementNS(SVG_NS, 'feDisplacementMap')
    displacement.setAttribute('in', 'SourceGraphic')
    displacement.setAttribute('in2', 'fibre')
    displacement.setAttribute('xChannelSelector', 'R')
    displacement.setAttribute('yChannelSelector', 'G')

    filter.append(turbulence, displacement)
    svg.append(filter)
    document.body.append(svg)

    this.previousFilter = host.style.filter
    host.style.filter = `url(#${this.id})`

    this.svg = svg
    this.turbulence = turbulence
    this.displacement = displacement
  }

  resize(): void {}

  render(t: number, opts: InkBleedTextOptions): void {
    const turbulence = this.turbulence
    const displacement = this.displacement
    if (!turbulence || !displacement) return

    /*
     * The fibre is set only when it changes. Recomputing turbulence is by far
     * the expensive half of this filter, and the fibre of a sheet does not
     * change from one frame to the next; only how far the ink has got into it.
     */
    const key = `${opts.fibre}|${opts.detail}|${opts.seed}`
    if (key !== this.builtFor) {
      turbulence.setAttribute('baseFrequency', String(Math.max(opts.fibre, 0.001)))
      turbulence.setAttribute('numOctaves', String(Math.max(1, Math.round(opts.detail))))
      turbulence.setAttribute('seed', String(opts.seed))
      this.builtFor = key
    }

    // A cosine between floor and bleed, so it is exactly periodic and never
    // fully dries: a sheet that has taken ink does not give it back.
    const phase = TAU * (t / Math.max(opts.period, 0.001))
    const swing = (1 - Math.cos(phase)) * 0.5
    const scale = opts.floor + (opts.bleed - opts.floor) * swing

    displacement.setAttribute('scale', scale.toFixed(3))
  }

  teardown(): void {
    // Put the markup back. The effect borrowed the element; it does not own it.
    if (this.host) this.host.style.filter = this.previousFilter
    this.svg?.remove()
    this.svg = null
    this.turbulence = null
    this.displacement = null
    this.host = null
    this.builtFor = ''
  }
}

/**
 * Mount InkBleedText onto an element that already contains the text.
 *
 * ```html
 * <h1 id="title">Blotting</h1>
 * ```
 *
 * ```ts
 * const bleed = createInkBleedText(document.querySelector('#title')!)
 * bleed.start()
 * ```
 */
export function createInkBleedText(
  el: HTMLElement,
  opts: Partial<InkBleedTextOptions> = {}
): EffectHandle {
  return mount<InkBleedTextOptions>(el, opts, {
    defaults: inkBleedTextDefaults,
    create: () => new InkBleedTextSurface(),
    // A text treatment filters content that is already on the page, so it gets
    // the host element rather than a canvas it would never draw into.
    kind: 'dom'
  })
}

export default createInkBleedText
```

## 2. What it is

Type printed on paper that is too absorbent for it.

The usual version of this is a CRT wobble: the glyph edges shimmer sideways like
a signal losing lock. Paper has its own way of ruining a letter and it is nothing
like that. Ink wicks along the fibres, so the edge does not move, it grows teeth.
Serifs fill in, counters close up, and the letter gains a fuzz that is irregular
at the scale of the fibre rather than smooth.

An SVG displacement filter is the honest way to draw it. Turbulence supplies the
fibre and `feDisplacementMap` pushes each pixel of the glyph sideways by the
amount of fibre under it, which is exactly the mechanism: the ink goes where the
paper lets it.

It is deliberately **not** a blur. A Gaussian softens an edge evenly, which is a
lens out of focus rather than ink spreading, and it is the thing that makes most
attempts at this look photographic rather than printed.

It also uses `fractalNoise` rather than turbulence proper. Turbulence takes the
modulus of each octave, which leaves hard creases that read as cracks in the
letter rather than as fibre.

No canvas and no WebGL.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `bleed` | number | `9` | 0 to 14 | How far the ink creeps, in pixels, at its furthest. Past about 8 the counters of a and e close up and the word stops being readable, which is a real thing badly printed paper does and rarely a thing you want. |
| `floor` | number | `3` | 0 to 8 | How far it has crept at its least. Deliberately not zero: a sheet that has taken ink does not give it back, so the letter never returns to a clean edge. |
| `fibre` | number | `0.055` | 0.002 to 0.2 | Coarseness of the fibre, as a turbulence base frequency. Lower is a longer, rougher, more absorbent fibre. This is the one to reach for if the bleed looks like noise rather than paper. |
| `detail` | number | `3` | 1 to 5 | Layers of fibre. More is a finer, more tangled structure and more work for the filter; the gain above four is hard to see. |
| `period` | number | `9` | 1 to 60 | Seconds for one breath of the ink. Driven by a cosine, so it is exactly periodic and the loop closes. |
| `seed` | number | `4` | 0 to 999 | Which sheet of paper. Any two seeds give different fibre; the same seed always gives the same sheet. |

## 5. Cleanup and SSR

`destroy()` removes the filter from the element, removes the SVG it lives in,
cancels the RAF and disconnects both observers. There is no WebGL context to
release.

Each instance gets its own filter with its own id, so two bled headings on a page
do not share one and tearing one down cannot break the other.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable, and this moves indefinitely. `stop()` and `start()` are on the handle
for that. Surface them as a real control in your own build.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn, at `reducedMotionTime`, which defaults to 0. At t = 0 the cosine is at
its minimum, so what gets drawn is the letter at `floor`: bled, but as little as
it ever is, and completely still.

If you would rather it were perfectly clean for those readers, mount with
`bleed: 0, floor: 0` when `matchMedia('(prefers-reduced-motion: reduce)')`
matches.

## 7. The three mistakes most likely to be made here

1. **Using it on body text.** It is a filter over the whole element, rasterised
   on the CPU in some browsers, and a paragraph of bled type is both expensive
   and unreadable. Headings.

2. **Raising `fibre` to get more texture.** Higher is a finer fibre, and past
   about 0.1 it stops reading as paper and starts reading as static. More texture
   is lower `fibre` and more `bleed`.

3. **Setting `floor` to 0.** The letter dries completely twice a cycle, which
   paper does not do once it has taken ink.

4. **Putting it on text that has to be read quickly.** A nav label or a button is
   a bad place for a letterform that is actively getting worse.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
