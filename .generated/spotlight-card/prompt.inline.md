You are adding **SpotlightCard** from Beamish to this project.

> A card under a desk lamp, lit across the face and bright on the near edge. Surfaces · effect · MIT.
> https://beamish.ink/effects/spotlight-card

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. One added span whose background and box-shadow are painted by CSS from the pointer position
- Two layers rather than one: a wide weak sheen across the face, and a hard highlight on whichever edge is turned toward the light. Paper is matte, so it scatters rather than reflecting a bright spot
- Light and shade together. Lifting the face alone is what the physics says and what nothing in a light room can see, so the far side darkens as the near side brightens. Painted normally rather than screened, because screening cannot darken anything
- Window pointer scope, so the sheen moves before the cursor reaches the card
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

**`src/beamish/effects/spotlight-card/core.ts`**

```ts
/*
 * SpotlightCard: Beamish
 * https://beamish.ink/effects/spotlight-card
 *
 * A card under a desk lamp, with the cursor as the lamp.
 *
 * The usual version of this puts a bright radial glow on a dark card and calls
 * it a spotlight. That is a light source sitting on the surface, which is not
 * what a lamp does to paper. Paper is matte: it scatters. Move a lamp across a
 * card and what you see is a broad, low-contrast lift across the whole face,
 * and a hard bright line on whichever edge is turned toward the light.
 *
 * So there are two things here rather than one. A wide, weak sheen that follows
 * the lamp, and an edge highlight that moves round the border to the side the
 * light is coming from. The edge is the part that sells it: a glow with no lit
 * edge reads as something emitting light, and a card does not emit anything.
 *
 * Nothing is measured per frame. Both layers are painted by CSS from two custom
 * properties, so moving the lamp costs two property writes and a composite.
 */

import { mount, type BaseOptions, type EffectHandle, type Pointer, type Surface } from '../../shared/runtime'

export type SpotlightCardOptions = BaseOptions & {
  /** Colour of the lamp. Warm, unless the room is not. */
  light: string
  /** How much the face lifts under the lamp. */
  sheen: number
  /** How wide the lift is, as a share of the card. */
  spread: number
  /** How brightly the edge facing the lamp catches. */
  edge: number
  /** How far the edge away from the lamp falls into shade. */
  shade: number
  /** Seconds for the lamp to catch up with the cursor. */
  ease: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const spotlightCardDefaults: SpotlightCardOptions = {
  light: '#fff6e4',
  sheen: 0.5,
  spread: 0.85,
  edge: 0.7,
  shade: 0.5,
  ease: 0.12,
  reducedMotionTime: 0,
  /*
   * Window scope, so the sheen has started to move before the cursor reaches
   * the card. A lamp carried across a desk lights the card on the way.
   */
  pointerScope: 'window'
}

class SpotlightCardSurface implements Surface<SpotlightCardOptions> {
  private host: HTMLElement | null = null
  private layer: HTMLElement | null = null
  private previousPosition = ''
  private x = 0.5
  private y = 0.5
  private lit = 0

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host

    // The card has to be a containing block for the layer below, and it is not
    // this effect's business to decide anything else about its layout.
    this.previousPosition = host.style.position
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'

    /*
     * One element for both layers: the sheen is its background and the edge is
     * its border, so a single composited node carries the whole effect. Added
     * rather than required of the markup, so the card you pass in is whatever
     * markup you already had.
     */
    const layer = document.createElement('span')
    layer.setAttribute('aria-hidden', 'true')
    layer.style.cssText = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      'border-radius:inherit',
      'will-change:background,box-shadow'
    ].join(';')
    host.append(layer)
    this.layer = layer
  }

  resize(): void {}

  render(_t: number, opts: SpotlightCardOptions, pointer: Pointer): void {
    const layer = this.layer
    if (!layer) return

    /*
     * Eased toward the pointer rather than snapped to it. A lamp has mass and a
     * hand is not precise; following exactly reads as a cursor-attached
     * rectangle rather than as something being lit.
     *
     * This integrates against the previous frame, so it is deliberately not
     * pure in `t`. Every pointer effect here has the same shape, and the
     * recorder drives it from a scripted path instead.
     */
    const k = Math.min(Math.max(opts.ease, 0.01), 1)
    this.x += (pointer.x - this.x) * k
    this.y += (pointer.y - this.y) * k
    this.lit += ((pointer.active ? 1 : 0) - this.lit) * k

    const px = (this.x * 100).toFixed(2)
    const py = (this.y * 100).toFixed(2)
    const radius = (Math.max(opts.spread, 0.05) * 140).toFixed(1)

    /*
     * Light and shade together, not light alone.
     *
     * The first version screened a warm glow over the card, which is what the
     * physics says and what nothing in a light room can actually see: a near
     * white card lifted a few percent is indistinguishable from a near white
     * card. What makes a lit object read is the gradient across it, so the far
     * side falls into shade as the near side lifts. Painted normally rather
     * than screened, because screening cannot darken anything.
     */
    const lightAmount = (opts.sheen * this.lit * 100).toFixed(1)
    const shadeAmount = (opts.shade * this.lit * 22).toFixed(1)

    // Along the lamp, in degrees, so the shade falls directly opposite it.
    const angle = (Math.atan2(this.y - 0.5, this.x - 0.5) * 180) / Math.PI + 90

    layer.style.background =
      `radial-gradient(${radius}% ${radius}% at ${px}% ${py}%, ` +
      `color-mix(in srgb, ${opts.light} ${lightAmount}%, transparent), ` +
      'transparent 70%), ' +
      `linear-gradient(${angle.toFixed(1)}deg, ` +
      'transparent 35%, ' +
      `color-mix(in srgb, #201f1a ${shadeAmount}%, transparent))`

    /*
     * The lit edge, and the one opposite it. An inset shadow cast from the far
     * side puts the bright line on the near edge, which is where it belongs:
     * the edge turned toward a light is the one that catches it. The second
     * shadow does the same in reverse and is what gives the card a thickness.
     *
     * The two are not drawn the same way, and the first version drawing them
     * the same way is what made the card look like it had a misprinted border.
     * A lit edge is a specular catch and it is genuinely sharp. The far side is
     * not an edge at all, it is the face curving out of the light, so it is
     * blurred over several pixels and pulled in off the border by a negative
     * spread. At zero blur it reads as a second rule drawn one pixel out of
     * register with the first.
     */
    const reach = 2 + opts.edge * 10
    const dx = (0.5 - this.x) * reach
    const dy = (0.5 - this.y) * reach
    const lit = (opts.edge * this.lit * 100).toFixed(1)
    const dark = (opts.shade * this.lit * 55).toFixed(1)
    const falloff = (reach * 2.4).toFixed(1)
    const pullIn = (-reach * 0.85).toFixed(1)
    layer.style.boxShadow =
      `inset ${dx.toFixed(2)}px ${dy.toFixed(2)}px 0 -1px ` +
      `color-mix(in srgb, ${opts.light} ${lit}%, transparent), ` +
      `inset ${(-dx * 1.6).toFixed(2)}px ${(-dy * 1.6).toFixed(2)}px ${falloff}px ${pullIn}px ` +
      `color-mix(in srgb, #201f1a ${dark}%, transparent)`
  }

  teardown(): void {
    this.layer?.remove()
    if (this.host) this.host.style.position = this.previousPosition
    this.layer = null
    this.host = null
    this.lit = 0
  }
}

/**
 * Mount SpotlightCard onto a card that already exists.
 *
 * ```html
 * <article id="card">…</article>
 * ```
 *
 * ```ts
 * const spotlight = createSpotlightCard(document.querySelector('#card')!)
 * spotlight.start()
 * ```
 */
export function createSpotlightCard(
  el: HTMLElement,
  opts: Partial<SpotlightCardOptions> = {}
): EffectHandle {
  return mount<SpotlightCardOptions>(el, opts, {
    defaults: spotlightCardDefaults,
    create: () => new SpotlightCardSurface(),
    // A surface treatment lights markup that is already on the page, so it gets
    // the host element rather than a canvas it would never draw into.
    kind: 'dom'
  })
}

export default createSpotlightCard
```

## 2. What it is

A card under a desk lamp, with the cursor as the lamp.

The usual version of this puts a bright radial glow on a dark card and calls it a
spotlight. That is a light source sitting on the surface, which is not what a
lamp does to paper. Paper is matte: it scatters. Move a lamp across a card and
what you see is a broad, low-contrast lift across the face, a hard bright line on
whichever edge is turned toward the light, and the far side falling away into
shade.

All three are here, and the third one is the one that makes it work. The first
version of this lifted the face and nothing else, which is what the physics says
and what nothing in a light room can actually see: a near-white card lifted a few
percent is indistinguishable from a near-white card. What you read when something
is lit is the **gradient** across it, and half of that gradient is the dark half.

The edge matters too. A glow with no lit edge reads as something emitting light,
and a card does not emit anything.

No canvas and no WebGL. One added span whose background and box-shadow are
repainted from the pointer position.

## 3. Wire it in

The card is your markup. It is lit, not replaced.

```html
<article id="card">
  <h2>Beamysshe as the sonne is</h2>
  <p>John Palsgrave, 1530.</p>
</article>
```

```ts
import { createSpotlightCard } from './beamish/effects/spotlight-card/core'

const spotlight = createSpotlightCard(document.querySelector('#card'))
spotlight.start()
```

The effect adds one `aria-hidden` span inside the card and removes it again on
`destroy()`. If the card is `position: static` it is promoted to `relative`,
because the layer has to have something to be absolute against, and that is
restored too. Nothing else about your layout is touched.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createSpotlightCard } from '@/beamish/effects/spotlight-card/core'

export function Card({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!host.current) return
    const spotlight = createSpotlightCard(host.current)
    spotlight.start()
    return () => spotlight.destroy()
  }, [])

  return <article ref={host} className="card">{children}</article>
}
```

Do not put option values in the dependency array. Call `update()` instead.

**Vue.** The adapter renders a `div` by default; pass `tag` for anything else.

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSpotlightCard } from '@/beamish/effects/spotlight-card/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let spotlight: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  spotlight = createSpotlightCard(host.value)
  spotlight.start()
})

onBeforeUnmount(() => spotlight?.destroy())
</script>

<template>
  <article ref="host" class="card"><slot /></article>
</template>
```

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `light` | color | `#fff6e4` | any CSS hex | Colour of the lamp. Warm, unless the room is not. It is screened over the card rather than painted on it, so a saturated colour tints the whole face. |
| `sheen` | number | `0.5` | 0 to 1 | How much the face lifts under the lamp. Paper scatters, so this wants to stay low and wide: a tight bright spot is a light source sitting on the card rather than a card being lit. |
| `spread` | number | `0.85` | 0.1 to 2 | How wide the lift is, as a share of the card. Large and weak reads as a lamp; small and strong reads as a torch. |
| `edge` | number | `0.7` | 0 to 1 | How brightly the edge facing the lamp catches. This is the part that sells it: a glow with no lit edge reads as something emitting light, and a card does not emit anything. |
| `shade` | number | `0.5` | 0 to 1 | How far the side away from the lamp falls into shade. This is what makes it read at all. A near white card lifted a few percent looks like a near white card; what you see when something is lit is the gradient across it, and half of that gradient is the dark half. |
| `ease` | number | `0.12` | 0.01 to 1 | How fast the lamp catches up with the cursor, as a fraction of the remaining distance per frame. At 1 it is welded to the pointer and reads as a rectangle following the mouse. |

## 5. Cleanup and SSR

`destroy()` removes the added layer, restores the card's original `position`,
cancels the RAF, disconnects both observers and removes every listener including
the window-scoped pointer one. There is no WebGL context to release.

None of this runs on the server. `createSpotlightCard` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

Nothing moves unless the cursor does, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn.

With no pointer the card is unlit, which is the correct resting state: an
untouched card under no particular light. Nothing looks broken or half-finished.

## 7. The three mistakes most likely to be made here

1. **Turning `sheen` up and leaving `shade` at zero.** On a pale card you will
   see almost nothing however far you push it, and then conclude the effect is
   broken. The dark half is doing most of the work.

2. **Using it on a card with no border radius or background.** There is nothing
   to light. It needs a surface that reads as an object sitting on the page.

3. **Putting it on a dozen cards in a grid.** Every one of them runs a frame loop
   and tracks the window pointer. It is cheap, but twelve cheap things are not
   cheap. Light the one under the cursor.

4. **A saturated `light`.** It is painted over the card rather than screened, so
   a strong colour tints the whole face rather than reading as illumination. Keep
   it close to white, warm or cool.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
