You are adding **ScrollMarquee** from Beamish to this project.

> A strip of content running sideways for ever, leaning with the scroll and reversing when it does. Type · effect · MIT.
> https://beamish.ink/effects/scroll-marquee

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. The strip is the author's own markup, moved into a track and transformed, so links keep working and images that have loaded stay loaded
- Pure in t, which is the part that takes care. A marquee written the obvious way accumulates an offset every frame, and an effect that integrates against its own last frame cannot be recorded, cannot be seeked and drifts on a dropped frame. The position here is a function of the clock and the scroll position and nothing else
- The content is duplicated once so the wrap is seamless, and the clone is aria-hidden with every focusable inside it given tabindex -1. A duplicate of the content is a duplicate to a screen reader too
- The lean is scroll velocity, normalised and clipped. A trackpad reports an order of magnitude more than a wheel, and without a ceiling the strip lies flat on its side the first time somebody flicks the page
- One transform on one element per frame, which is a composited property, so this does no layout work at all
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/scroll-marquee/core.ts`**

```ts
/*
 * ScrollMarquee: Beamish
 * https://beamish.ink/effects/scroll-marquee
 *
 * A strip of content running sideways for ever, which leans when the page is
 * scrolled and changes direction with it. No canvas, no WebGL, no dependencies.
 *
 * Three things make this read as the thing on every studio site rather than as
 * a 1996 <marquee>:
 *
 *   It never stops. The strip is duplicated and the transform wraps at exactly
 *   one copy's width, so there is no jump to find and no gap at the end.
 *
 *   It leans with the scroll. The skew comes from scroll velocity, which is
 *   what makes the strip feel like it has mass: it is dragged by the page
 *   rather than playing beside it.
 *
 *   It is reversible. Scrolling up pushes it the other way, because the same
 *   velocity that skews it is added to its travel.
 *
 * It is pure in `t`, which is the part that takes care. A marquee written the
 * obvious way accumulates an offset every frame, and an effect that integrates
 * against its own last frame cannot be recorded, cannot be seeked, and drifts
 * on a dropped frame. The position here is a function of the clock and nothing
 * else.
 */

import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type Scroll,
  type Surface
} from '../../shared/runtime'

export type ScrollMarqueeOptions = BaseOptions & {
  /** Seconds for the strip to travel exactly one copy of its content. */
  period: number
  /** Which way it runs when the page is still. 1 is leftwards, -1 rightwards. */
  direction: number
  /** How far the scroll drags it, in copies of the content per full scroll. */
  drag: number
  /** Degrees of lean at full scroll speed. */
  skew: number
  /** How much it stretches along its travel at full scroll speed, 0 to 0.5. */
  stretch: number
  /** The scroll speed that counts as full, in screens per second. */
  reference: number
  /** Gap between the end of one copy and the start of the next, in pixels. */
  gap: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const scrollMarqueeDefaults: ScrollMarqueeOptions = {
  period: 24,
  direction: 1,
  drag: 0.35,
  skew: 7,
  stretch: 0.12,
  reference: 1.2,
  gap: 48,
  reducedMotionTime: 0
}

class ScrollMarqueeSurface implements Surface<ScrollMarqueeOptions> {
  private host: HTMLElement | null = null
  private track: HTMLElement | null = null
  private copy: HTMLElement | null = null
  private moved: ChildNode[] = []
  private width = 1

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host

    /*
     * The content is moved into a track rather than copied out of the host,
     * because whatever is in there is the author's markup: links that have to
     * keep working, images that have already loaded, text a screen reader has
     * already been told about.
     */
    const track = document.createElement('div')
    track.setAttribute('data-beamish-marquee-track', '')
    track.style.display = 'flex'
    track.style.width = 'max-content'
    track.style.willChange = 'transform'

    const original = document.createElement('div')
    original.style.display = 'flex'
    original.style.flex = '0 0 auto'

    this.moved = [...host.childNodes]
    for (const node of this.moved) original.append(node)

    /*
     * One clone, and it is hidden from assistive technology. A duplicate of the
     * content is a duplicate to a screen reader too, and hearing the same six
     * links twice is worse than not seeing the loop.
     */
    const clone = original.cloneNode(true) as HTMLElement
    clone.setAttribute('aria-hidden', 'true')
    for (const node of clone.querySelectorAll<HTMLElement>('a, button, input, select, textarea')) {
      node.setAttribute('tabindex', '-1')
    }

    track.append(original, clone)
    host.append(track)

    host.style.overflow = 'hidden'
    this.track = track
    this.copy = original
    this.measure()
  }

  private measure(): void {
    const copy = this.copy
    if (!copy) return
    // The gap is applied as padding on the copy so it is part of the width that
    // the wrap is measured against. A gap applied between the copies instead
    // would make the loop a fraction longer than the thing it is wrapping.
    this.width = Math.max(copy.getBoundingClientRect().width, 1)
  }

  resize(): void {
    this.measure()
  }

  render(t: number, opts: ScrollMarqueeOptions, _pointer: unknown, scroll: Scroll): void {
    const track = this.track
    const copy = this.copy
    if (!track || !copy) return

    const gap = Math.max(opts.gap, 0)
    if (copy.style.paddingRight !== `${gap}px`) {
      copy.style.paddingRight = `${gap}px`
      this.measure()
    }

    const period = Math.max(opts.period, 0.001)
    const dir = opts.direction >= 0 ? 1 : -1

    /*
     * Position from the clock, and from the scroll position, and from nothing
     * else. Both terms wrap at one copy's width, so the strip is continuous and
     * the frame at t is the same frame whenever it is asked for.
     */
    const travelled = (t / period) * dir + scroll.progress * opts.drag
    const offset = -(((travelled % 1) + 1) % 1) * this.width

    /*
     * The lean. Velocity is normalised and clipped: a trackpad can report an
     * order of magnitude more than a wheel, and without a ceiling the strip lies
     * flat on its side the first time somebody flicks the page.
     */
    const speed = Math.max(-1, Math.min(1, scroll.velocity / Math.max(opts.reference, 0.001)))
    const skew = speed * opts.skew
    const stretch = 1 + Math.abs(speed) * opts.stretch

    track.style.transform =
      `translate3d(${offset.toFixed(2)}px, 0, 0) skewX(${skew.toFixed(2)}deg) scaleX(${stretch.toFixed(3)})`
  }

  teardown(): void {
    const host = this.host
    const track = this.track
    if (host && track) {
      // Put the author's markup back exactly where it was found.
      for (const node of this.moved) host.append(node)
      track.remove()
      host.style.overflow = ''
    }
    this.host = null
    this.track = null
    this.copy = null
    this.moved = []
  }
}

/**
 * Mount ScrollMarquee onto `el`. Whatever is inside it becomes the strip, so
 * put it on a wrapper around the row rather than on the row's parent section.
 *
 * ```ts
 * const marquee = createScrollMarquee(document.querySelector('#strip')!)
 * marquee.start()
 * // …later
 * marquee.destroy()
 * ```
 */
export function createScrollMarquee(
  el: HTMLElement,
  opts: Partial<ScrollMarqueeOptions> = {}
): EffectHandle {
  return mount<ScrollMarqueeOptions>(el, opts, {
    defaults: scrollMarqueeDefaults,
    kind: 'dom',
    create: () => new ScrollMarqueeSurface()
  })
}

export default createScrollMarquee
```

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

## 2. What it is

A strip of content running sideways for ever, which leans when the page is
scrolled and reverses when the scroll does.

No canvas and no WebGL. The strip is your own markup, moved into a track and
transformed, so the links keep working and the images that have loaded stay
loaded.

Three things separate it from a 1996 `<marquee>`:

**It never stops.** The content is duplicated and the transform wraps at exactly
one copy's width, so there is no jump to find and no gap at the end.

**It leans with the scroll.** The skew comes from scroll velocity, which is what
makes the strip feel like it has mass: it is being dragged by the page rather
than playing beside it.

**It reverses.** Scrolling up pushes it the other way, because the same scroll
that skews it is added to its travel.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `period` | number | `24` | 4 to 120 s | Seconds for the strip to travel exactly one copy of its content, which is also the loop. Longer content at the same period runs faster, because the distance is longer: this is a pace rather than a speed. |
| `direction` | number | `1` | -1 to 1 | Which way it runs when the page is still. 1 is leftwards, which is the direction text is read away from and the one that feels like it is going somewhere. |
| `drag` | number | `0.35` | 0 to 2 | How far the scroll drags it, in copies of the content per full scroll of the element through the viewport. This is what makes it reverse when you scroll back up. At 0 it runs at a constant pace and ignores the page. |
| `skew` | number | `7` | 0 to 25 deg | Degrees of lean at full scroll speed. This is the whole character of the effect: it is what makes the strip feel like it has mass and is being dragged rather than playing beside the page. Past about 15 it reads as a glitch. |
| `stretch` | number | `0.12` | 0 to 0.5 | How much it stretches along its travel at full scroll speed. Small: it is the squash-and-stretch of the thing, and at anything over about 0.2 the type distorts enough to notice as distortion. |
| `reference` | number | `1.2` | 0.2 to 6 | The scroll speed that counts as full, in screens per second. 1.2 is about a brisk flick, so an ordinary scroll leans the strip a few degrees and a hard one leans it fully. Too low and a single wheel click pins it at maximum, which loses the difference between a nudge and a flick. |
| `gap` | number | `48` | 0 to 240 px | Space between the end of one copy of the content and the start of the next. It is applied inside the copy, so it is part of the width the wrap is measured against: a gap added between the copies instead would make the loop a fraction longer than the thing it is wrapping, and the strip would stutter once per cycle. |

## 5. Cleanup and SSR

`destroy()` puts your markup back, removes the track, cancels the RAF and
disconnects the observers. Call it.

Nothing runs on the server. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'`, which is already on
the React adapter.

## 6. Pausing and reduced motion

The handle has `stop()` and `start()`. WCAG 2.2.2 is Level A and it names moving
text specifically, so if this is on a page it needs a visible control, which the
demo panel on the site wires up.

Handled in the runtime. Under `prefers-reduced-motion: reduce` the loop never
starts and one frame is drawn, which leaves the strip still and readable.

Worth saying plainly: a marquee is exactly the kind of thing that setting exists
for. Nothing here fights it.

## 7. The three mistakes most likely to be made here

1. **Items that can wrap.** Without `white-space: nowrap` and `flex: 0 0 auto` a
   phrase breaks inside its own box, the measured width is wrong, and the strip
   jumps once a cycle.

2. **Putting navigation in it.** The clone is hidden from assistive technology
   and taken out of the tab order, which is right, but it means half your links
   are decorative. Use it for a phrase, not a menu.

3. **A `gap` on the flex container.** Use the option. A CSS gap between the two
   copies lands outside the width the wrap measures.

4. **Mounting it on the section rather than the row.** Everything inside the
   element becomes the strip, headings included.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
