You are adding **CardStack** from Beamish to this project.

> A pile of prints being leafed through, where the card changes its stacking order only while it is clear of the pile. Surfaces · effect · MIT.
> https://beamish.ink/effects/card-stack

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The card changes its stacking order only while it is clear of the pile, and that is the difference between this and every version that fades the card out. A card going from front to back has to pass the others, and there is no interpolating between being in front of something and behind it: at some instant the order flips. Done while the card is still over the pile it is visible, as a flicker that reads as a dropped frame; done at the far point of the travel, where nothing overlaps, it cannot be seen at all
- The card goes out to the side and back rather than straight through, which is what makes the far point exist. A card that crosses the pile face on has nowhere clear to change order
- Nobody squares a pile. The scatter is fixed to the card rather than to the position, so the third card is always the one sitting a degree crooked wherever it happens to be, and the pile keeps its own character as the cards move through it. A pile with an even offset per position is a diagram of a pile
- The cards are the author's own markup and are never replaced. They are positioned absolutely over one another, because a pile is a pile and the element keeps the height of one card
- destroy() puts every property it set back, including the element's own position
- Pure in t: which card is moving and how far through its travel it is are both arithmetic on the clock, and the scatter is a hash of the card's index
- A pile seen straight on is one card and a few edges, however much the cards are offset, because they are the same object at the same angle. That is honest and it is also why the scatter and the tilt are worth having: the corners are what tell you there is more than one
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

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

import { resolveAutoGrounds } from './ground'

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

/**
 * One scripted press. `t` is seconds from the start of the loop; x/y are 0 to 1
 * across the element.
 *
 * A path can say where the cursor is at any moment, but a press is an instant
 * rather than a position, so it needs its own list. An effect that answers to
 * clicks reads this alongside whatever real presses it has seen, which is what
 * lets the recorder produce a take with clicks in it without anything having
 * been clicked.
 */
export type PressKey = { t: number; x: number; y: number }

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
   * Scripted presses, for effects that answer to a click. Each is a time and a
   * point, and an effect treats them exactly as it treats a real press that
   * happened at that moment, so a recorded take and a live page agree.
   *
   * Unlike `pointerPath`, this does not replace the live input: a scripted press
   * and a real one are the same kind of event, and an effect that ignored the
   * cursor while a script was running would be dead on the page.
   */
  pressPath?: PressKey[]
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
  /*
   * `auto` in a colour option means take it from the page. Resolved here, at
   * the one point that has both the host element and the merged options, so no
   * item has to reach into the DOM from inside its own render loop.
   */
  let opts: O = resolveAutoGrounds(el, { ...config.defaults, ...(userOpts ?? {}) })

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
  /*
   * The gate watches the element's parent, not the element.
   *
   * Watching the element deadlocks any effect that clips or moves its own host.
   * A reveal starts with its host clipped to nothing, the observer reports that
   * as not intersecting, the runtime stops the loop, and the clip therefore
   * never advances off the host: blank for ever, with the replay button unable
   * to escape it because `visible` can never become true again. The gate's
   * input must not be geometry the effect controls.
   *
   * The parent is laid out by the page rather than by the effect, so it breaks
   * the cycle. It is usually a little larger, which means an effect can start a
   * frame or two before it is strictly on screen. That is the cheaper mistake.
   */
  intersectionObserver?.observe(el.parentElement ?? el)

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
      opts = resolveAutoGrounds(el, { ...opts, ...(next as Partial<O>) })
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

**`src/beamish/effects/card-stack/core.ts`**

```ts
/*
 * CardStack: Beamish
 * https://beamish.ink/effects/card-stack
 *
 * A pile of prints being leafed through. The top one is lifted, taken aside,
 * and put at the back, and the pile shuffles up a place.
 *
 * Two things carry it, and the second is the one everybody gets wrong.
 *
 * Nobody squares a pile. Each card sits at a slight angle and a slight offset
 * from the one beneath, fixed per card rather than per position, so the pile
 * keeps its own character as the cards move through it: the third card is
 * always the one sitting a degree crooked, wherever in the pile it happens to
 * be. A pile with an even offset per position is a diagram of a pile.
 *
 * And the card changes its stacking order only while it is clear of the pile.
 * A card travelling from front to back has to pass the others, and there is no
 * way to interpolate between being in front of something and behind it: at some
 * instant the order flips. Do it while the card is still over the pile and you
 * see it, as a flicker that looks like a dropped frame. Do it at the far point
 * of the travel, where nothing is overlapping, and it cannot be seen at all.
 * That one line is the difference between this and every version that fades the
 * card out to hide the switch.
 *
 * It is pure in `t`. Which card is moving, and how far through its travel it
 * is, are both arithmetic on the clock, and the scatter is a hash of the card's
 * own index.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type CardStackOptions = BaseOptions & {
  /** Milliseconds each card spends at the front before it is moved. */
  interval: number
  /** Milliseconds the move itself takes. */
  travel: number
  /** How far aside the card goes, as a share of the stack's width. */
  aside: number
  /** How far each card sits from the one beneath, in pixels. */
  spread: number
  /** How much smaller each card down the pile is drawn. */
  shrink: number
  /** Degrees of scatter. Nobody squares a pile. */
  tilt: number
  /** How far the moving card lifts, in pixels. */
  lift: number
  /** Seed for the scatter. The same seed gives the same pile. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const cardStackDefaults: CardStackOptions = {
  interval: 1800,
  travel: 900,
  aside: 0.62,
  spread: 18,
  shrink: 0.045,
  tilt: 3,
  lift: 26,
  seed: 7,
  reducedMotionTime: 0
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

/* Eased both ends: a hand picking something up accelerates and arrives. */
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)

class CardStackSurface implements Surface<CardStackOptions> {
  private host: HTMLElement | null = null
  private cards: HTMLElement[] = []
  private built = false
  private width = 1

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
  }

  /*
   * The cards are whatever the element already holds. They are stacked on top
   * of one another rather than laid out, because a pile is a pile: the element
   * keeps the height of one card and the author's markup is untouched beyond
   * being positioned.
   */
  private build(): void {
    const host = this.host
    if (!host || this.built) return
    this.cards = [...host.children].filter(
      (node): node is HTMLElement => node instanceof HTMLElement
    )
    for (const card of this.cards) {
      card.style.position = 'absolute'
      card.style.inset = '0'
      card.style.willChange = 'transform'
      card.style.backfaceVisibility = 'hidden'
    }
    this.built = true
  }

  resize(size: { width: number }): void {
    this.width = Math.max(size.width, 1)
  }

  render(t: number, opts: CardStackOptions): void {
    this.build()
    const count = this.cards.length
    if (count === 0) return

    const interval = Math.max(opts.interval, 1) / 1000
    const travel = Math.min(Math.max(opts.travel, 1) / 1000, interval)

    /*
     * Which deal we are on, and how far through the move. Both from the clock,
     * so seeking to the middle of a deal lands on the same frame every time.
     */
    const deals = Math.floor(t / interval)
    const within = t - deals * interval
    const moving = clamp01(within / travel)
    const eased = easeInOut(moving)

    for (let i = 0; i < count; i++) {
      const card = this.cards[i]!

      /*
       * Where this card is in the pile. The deal count rotates the whole pile,
       * so a card's depth is its index shifted by however many deals have
       * happened, and the one at depth 0 is the one being moved.
       */
      const depth = (((i - deals) % count) + count) % count
      const leaving = depth === 0 && moving > 0 && moving < 1

      // Its depth once this move finishes: the front card goes to the back.
      const settled = leaving ? count - 1 : depth
      const shown = leaving ? eased * (count - 1) : settled

      /*
       * The scatter, fixed to the card rather than to the position. The third
       * card is always the one sitting a degree crooked, wherever it is in the
       * pile, which is what makes it a pile of particular things rather than a
       * diagram of a pile.
       */
      const scatterA = (hash2(i + 1, opts.seed) - 0.5) * 2
      const scatterB = (hash2(i + 91, opts.seed) - 0.5) * 2

      // Out to the side and back, so the card never crosses the pile face on.
      const arc = Math.sin(moving * Math.PI)
      const x = (leaving ? arc * opts.aside * this.width : 0) + scatterA * opts.spread * 0.25
      const y = shown * opts.spread + (leaving ? -arc * opts.lift : 0) + scatterB * opts.spread * 0.18
      const scale = 1 - shown * opts.shrink
      const turn = scatterA * opts.tilt + (leaving ? arc * opts.tilt * 1.6 : 0)

      card.style.transform =
        `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) ` +
        `rotate(${turn.toFixed(2)}deg) scale(${scale.toFixed(4)})`

      /*
       * The stacking order, and the only subtle thing in the file.
       *
       * A card going from front to back has to pass the others, and there is no
       * interpolating between in front of and behind: at some instant the order
       * flips. Done while the card is still over the pile it is visible, as a
       * flicker that reads as a dropped frame. Done at the far point of the
       * travel, where nothing overlaps, it cannot be seen at all.
       */
      /*
       * This did not do what the paragraph above says. It was
       * `count - shown` until the halfway point, and `shown` grows as soon as
       * the card starts moving, so the card lost its place at the front almost
       * immediately: a third of the way through the travel it was already
       * behind the card beneath it. What that looks like is not a card being
       * lifted off a pile. It looks like a new card arriving on top, which is
       * exactly how it was reported.
       *
       * A card being lifted stays in front of everything until it is clear,
       * and is behind everything on the way back. There is nothing to
       * interpolate: it is above, then it is below, and the swap happens at the
       * far point where nothing is overlapping and it cannot be seen.
       */
      const order = leaving ? (moving < 0.5 ? count + 1 : -1) : count - shown
      const z = String(Math.round(order * 10))
      if (card.style.zIndex !== z) card.style.zIndex = z

      // The pile reads as a pile because the cards nearer the front sit over
      // more shadow, not because they are drawn differently.
      const depthShade = shown / Math.max(count - 1, 1)
      const shadow = `0 ${(2 + depthShade * 10).toFixed(1)}px ${(8 + depthShade * 20).toFixed(1)}px rgba(54,54,48,${(0.16 - depthShade * 0.09).toFixed(3)})`
      if (card.style.boxShadow !== shadow) card.style.boxShadow = shadow
    }
  }

  teardown(): void {
    for (const card of this.cards) {
      card.style.position = ''
      card.style.inset = ''
      card.style.transform = ''
      card.style.zIndex = ''
      card.style.boxShadow = ''
      card.style.willChange = ''
      card.style.backfaceVisibility = ''
    }
    if (this.host) this.host.style.position = ''
    this.cards = []
    this.built = false
    this.host = null
  }
}

/**
 * Mount CardStack onto `el`. Its element children become the pile, stacked on
 * top of one another, so give the element the height of one card.
 *
 * ```ts
 * const pile = createCardStack(document.querySelector('#pile')!)
 * pile.start()
 * // …later
 * pile.destroy()
 * ```
 *
 * The cards are the author's own markup and are never replaced: `destroy()`
 * puts every property back.
 */
export function createCardStack(
  el: HTMLElement,
  opts: Partial<CardStackOptions> = {}
): EffectHandle {
  return mount<CardStackOptions>(el, opts, {
    defaults: cardStackDefaults,
    kind: 'dom',
    create: () => new CardStackSurface()
  })
}

export default createCardStack
```

## 2. What it is

CardStack is a pile of prints being leafed through. The top one is lifted, taken
aside, and put at the back, and the pile shuffles up a place.

Two things carry it, and the second is the one every version gets wrong.

**Nobody squares a pile.** Each card sits at a slight angle and a slight offset,
and the scatter is fixed **to the card** rather than to the position. So the
third card is always the one sitting a degree crooked, wherever in the pile it
happens to be, and the pile keeps its own character as the cards move through
it. An even offset per position is a diagram of a pile.

**The card changes its stacking order only while it is clear of the pile.** A
card going from front to back has to pass the others, and there is no
interpolating between being in front of something and behind it: at some instant
the order flips. Do it while the card is still over the pile and you see it, as
a flicker that reads as a dropped frame. Do it at the far point of the travel,
where nothing overlaps, and it cannot be seen at all.

That is why the card goes out to the side and back rather than straight through:
the arc is what makes the far point exist. It is also why every other version of
this fades the card out: fading hides a switch you could simply have made
somewhere invisible.

## 3. Wire it in

**Plain HTML.** The element's children are the pile, stacked over one another,
so give the element the height of one card.

```html
<div id="pile" style="width: 24rem; aspect-ratio: 5 / 6">
  <article class="plate">…</article>
  <article class="plate">…</article>
  <article class="plate">…</article>
  <article class="plate">…</article>
</div>

<script type="module">
  import { createCardStack } from './beamish/effects/card-stack/core.js'

  const pile = createCardStack(document.querySelector('#pile'))
  pile.start()
</script>
```

The cards are your own markup and are never replaced. `destroy()` puts every
property back, including the element's own `position`.

**React.** The cards are the children.

```tsx
import { useEffect, useRef } from 'react'
import { createCardStack } from '@/beamish/effects/card-stack/core'

export function Pile({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pile = createCardStack(host.current, { interval: 1800 })
    pile.start()
    return () => pile.destroy()
  }, [children])

  return <div ref={host} style={{ aspectRatio: '5 / 6' }}>{children}</div>
}
```

The dependency on `children` is deliberate: a different set of cards is a
different pile and has to be rebuilt.

**Vue.** The cards come in through the default slot.

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createCardStack } from '@/beamish/effects/card-stack/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pile: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pile = createCardStack(host.value)
  pile.start()
})

onBeforeUnmount(() => pile?.destroy())
</script>

<template>
  <div ref="host" class="pile"><slot /></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `interval` | number | `1800` | 400 to 12000 ms (looks right between 1400 and 3200) | Milliseconds each card spends at the front before it is moved. This sets the length of the whole loop, which is the interval times the number of cards, so four cards at 1800ms is a 7.2 second cycle and that is what the recording has to span. |
| `travel` | number | `900` | 100 to 4000 ms | Milliseconds the move itself takes, clamped to the interval so a card cannot still be moving when the next one starts. Half the interval is a good rule: it leaves the pile still for as long as it is moving, which is what makes the movement read as a deliberate act rather than as a carousel. |
| `aside` | number | `0.62` | 0.1 to 1.5 | How far aside the card goes, as a share of the pile's width. It has to clear the pile, because the far point of the travel is where the stacking order changes: below about 0.4 the card is still overlapping when it flips, and you can see it happen. |
| `spread` | number | `18` | 0 to 60 px | How far each card sits from the one beneath. This is what makes it a pile rather than a single card: at 0 the cards are exactly aligned and the whole thing reads as one object until something moves. |
| `shrink` | number | `0.045` | 0 to 0.2 | How much smaller each card down the pile is drawn. A little perspective, and it should be very little: a pile seen from above has almost none, and anything more reads as a fan of cards rather than a stack. |
| `tilt` | number | `3` | 0 to 12 deg | Degrees of scatter. Nobody squares a pile, and at 0 this looks like a specimen diagram. Fixed per card rather than per position, so a card keeps its own angle as it moves through the pile. |
| `lift` | number | `26` | 0 to 120 px | How far the moving card lifts as it goes. A hand picks a card up before moving it sideways, and the lift is most of what makes the move read as a hand rather than as a slide. |
| `seed` | number | `7` | 0 to 9999 | Seed for the scatter. The same seed gives the same pile, so a recording and a live page match card for card. |

## 5. The loop is the interval times the cards

Four cards at an interval of 1800ms is a 7.2 second cycle, and that is what a
recording of it has to span for the loop to close. If you change either, change
the record duration with them.

`travel` is clamped to the interval, so a card can never still be moving when
the next one starts. Half the interval is a good rule: it leaves the pile still
for as long as it is moving, which makes the movement read as a deliberate act
rather than as a carousel.

## 6. `aside` has to clear the pile

Below about 0.4 the card is still overlapping the others when the stacking order
flips, and you can see it happen. The default of 0.62 takes the card well clear.

This is the one setting you can break the effect with, and the failure looks
like a rendering glitch rather than like a number being too small.

## 7. A pile seen straight on

It is one card and a few edges, however much you offset them, because they are
the same object at the same angle. That is honest, and it is why the scatter and
the tilt are worth having: the corners poking out are what tell you there is
more than one card there.

If you need the pile to read as a pile while it is still, give the cards
different content near their edges, or accept that the movement is what
communicates it. Do not reach for a bigger `shrink`: past about 0.08 it stops
being a stack and becomes a fan.

## 8. Accessibility. Do not skip this

Every card stays in the accessibility tree and in the tab order, which is
correct: a pile of four cards is four pieces of content, not one.

That also means a card at the back is reachable by keyboard while invisible
behind the others. If the cards contain links or buttons, this is the wrong
component: use it for content that is read rather than operated, or give the
cards behind the front one `inert`.

## 9. Cleanup and SSR

`destroy()` restores every property it set on the cards and on the element.
There is no GPU resource to release and no DOM to rebuild.

All the cards render on the server, laid out normally, which means they appear
as a column before the first frame stacks them. If that matters, give the
element `overflow: hidden` and the height of one card in CSS, so the column is
clipped until the effect takes over.

## 10. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is 0: the pile at rest with the first card on top. Nothing is lost except
the dealing.

## 11. The three mistakes most likely to be made here

1. **Changing the stacking order over the pile.** It flickers, and it reads as a
   dropped frame rather than as a mistake you made. Change it at the far point
   of the travel, where nothing overlaps.

2. **Fading the card out to hide the switch.** That is the workaround for the
   mistake above, and it costs you the whole gesture: a card going behind a pile
   does not become transparent.

3. **An even offset per position.** The pile stops having any character and
   becomes a diagram. Fix the scatter to the card.

4. **A card that crosses the pile face on.** There is then nowhere clear to
   change the order, so the arc is not decoration.

5. **Putting buttons on the cards.** The ones at the back are reachable by
   keyboard while invisible. It is for content that is read.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
