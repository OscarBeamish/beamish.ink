You are adding **SplitFlapText** from Beamish to this project.

> A departure board, built as hinged leaves that have to pass through the strip to reach their letter. Type · effect · MIT.
> https://beamish.ink/effects/split-flap-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. Each character becomes four layers: the top half of the glyph arriving and the bottom half of the one leaving, both still, and two leaves over them that fall and rise
- The leaves go through the strip in order. A cell cannot jump from A to R, it has to pass through everything between, which is why a real board lands its letters in the order the alphabet puts them rather than left to right. Nothing about that was designed: it falls out of modelling the strip, and it is the most recognisable thing about the object
- A character that is not on the strip stops at position 0, the blank. A board cannot show what it does not carry, and inventing a leaf for it would be the one dishonest thing in here
- Every cell is the width of the widest glyph on the strip, measured once in the real face. The flaps on a board are all the same size because they are the same part, and a board whose cells breathe is not a board
- A falling leaf darkens as it turns away from the light. It is the only shading in the effect and it is doing a lot: without it the two leaves are flat shapes sliding over each other and the cell reads as a wipe
- Pure in t. Which leaf a cell is on and how far through its fall are both arithmetic on the clock, so the recorder can seek it and a dropped frame costs nothing
- The original string stays in the accessibility tree as one label. A board read leaf by leaf is a stream of nonsense
- destroy() puts the original text back, leaving the element as it was found
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

**`src/beamish/effects/split-flap-text/core.ts`**

```ts
/*
 * SplitFlapText: Beamish
 * https://beamish.ink/effects/split-flap-text
 *
 * A departure board. Each character is a split-flap cell: a stack of hinged
 * leaves, each carrying the bottom half of one glyph on its front and the top
 * half of the next on its back, dropping one at a time until the right one is
 * showing.
 *
 * The mechanism is the whole effect, so it is built rather than suggested. Four
 * layers per cell:
 *
 *   The top half of the glyph that is arriving, sitting still behind everything.
 *   The bottom half of the glyph that is leaving, likewise.
 *   A leaf over the top half, carrying the upper half of the leaving glyph,
 *   falling from upright to edge on.
 *   A leaf over the bottom half, carrying the lower half of the arriving glyph,
 *   rising from edge on to upright.
 *
 * Two things that most versions get wrong, and both of them are what makes a
 * board read as mechanical rather than as a slot machine.
 *
 * The leaves go through the strip in order. A cell cannot jump from A to R: it
 * has to pass through everything between, one leaf at a time, which is why a
 * real board lands its letters in the order the alphabet puts them rather than
 * the order they are written in. Nothing about that needed designing. It falls
 * out of modelling the strip, and it is the single most recognisable thing
 * about the object.
 *
 * Every cell is the width of the widest glyph on the strip, measured once. The
 * flaps on a board are all the same size because they are the same part, and a
 * board whose cells breathe is not a board.
 *
 * It is pure in `t`. Which leaf a cell is on, and how far through its fall, are
 * both arithmetic on the clock, so the recorder can seek it and a dropped frame
 * costs nothing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type SplitFlapTextOptions = BaseOptions & {
  /** The strip, in the order the leaves are stacked. Position 0 is at rest. */
  strip: string
  /** Milliseconds for one leaf to fall. */
  flap: number
  /** Milliseconds between one cell starting and the next. */
  stagger: number
  /** Milliseconds before the first cell starts. */
  hold: number
  /** The face of a leaf. */
  face: string
  /** The type printed on it. */
  ink: string
  /** How dark the seam across the middle of a cell is, 0 to 1. */
  seam: number
  /** Perspective applied to the fall, in pixels. 0 is a flat fold. */
  depth: number
  /** How much a falling leaf darkens as it turns away from the light. */
  shade: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const splitFlapTextDefaults: SplitFlapTextOptions = {
  strip: ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:-',
  flap: 52,
  stagger: 110,
  hold: 240,
  face: '#26261f',
  ink: '#f7f5ed',
  seam: 0.45,
  depth: 180,
  shade: 0.55,
  reducedMotionTime: 999
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

type Cell = {
  box: HTMLElement
  /** Upper half of the glyph arriving. Still. */
  topStill: HTMLElement
  /** Lower half of the glyph leaving. Still. */
  bottomStill: HTMLElement
  /** Upper half of the glyph leaving. Falls. */
  leafFalling: HTMLElement
  /** Lower half of the glyph arriving. Rises. */
  leafRising: HTMLElement
  /** How many leaves this cell has to pass through to reach its character. */
  steps: number
}

/*
 * One half of a glyph, clipped. The glyph is set at full size in an inner span
 * and the wrapper shows half of it: the top half by starting at the top, the
 * bottom half by pulling the inner span up by its own height.
 */
function half(which: 'top' | 'bottom'): { wrap: HTMLElement; inner: HTMLElement } {
  const wrap = document.createElement('span')
  /*
   * Opaque, and that is not a detail. A leaf is a tile: it hides what is behind
   * it. The first version left the wrappers transparent and every cell at rest
   * showed the top half of the letter that was arriving straight through the
   * blank leaf covering it, which is the sort of thing that looks like a
   * z-index problem and is really a missing object.
   *
   * inherit, so the face colour reaches all four layers from the cell without
   * being plumbed to each one.
   */
  wrap.style.cssText =
    'position:absolute;left:0;right:0;height:50%;overflow:hidden;background:inherit;' +
    (which === 'top' ? 'top:0;' : 'bottom:0;')
  const inner = document.createElement('span')
  inner.style.cssText =
    'position:absolute;left:0;right:0;height:200%;display:flex;' +
    'align-items:center;justify-content:center;' +
    (which === 'top' ? 'top:0;' : 'bottom:0;')
  wrap.append(inner)
  return { wrap, inner }
}

class SplitFlapTextSurface implements Surface<SplitFlapTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private cells: Cell[] = []
  private probe: HTMLElement | null = null
  private built = false
  private measured = false
  private measuredFor = ''
  private fontsPending = false

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  private build(opts: SplitFlapTextOptions): void {
    const host = this.host
    if (!host || this.built) return

    host.textContent = ''
    this.cells = []

    // The text a screen reader gets: one string, unchanged, out of sight. A
    // board read leaf by leaf is forty characters of nonsense.
    const label = document.createElement('span')
    label.textContent = this.original
    label.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'

    const visual = document.createElement('span')
    visual.setAttribute('aria-hidden', 'true')
    visual.style.cssText = 'display:inline-flex;flex-wrap:wrap;gap:0.14em;'

    const strip = Array.from(opts.strip.length > 0 ? opts.strip : splitFlapTextDefaults.strip)
    const upper = this.original.toUpperCase()

    for (const character of Array.from(upper)) {
      const box = document.createElement('span')
      box.style.cssText =
        'position:relative;display:inline-block;height:1.2em;line-height:1.2em;' +
        'border-radius:2px;overflow:hidden;flex:0 0 auto;'

      const topStill = half('top')
      const bottomStill = half('bottom')
      const falling = half('top')
      const rising = half('bottom')

      // The two that move. Each hinges on the seam, which is the edge it shares
      // with the half behind it.
      falling.wrap.style.transformOrigin = 'center bottom'
      falling.wrap.style.backfaceVisibility = 'hidden'
      rising.wrap.style.transformOrigin = 'center top'
      rising.wrap.style.backfaceVisibility = 'hidden'

      box.append(topStill.wrap, bottomStill.wrap, falling.wrap, rising.wrap)
      visual.append(box)

      /*
       * Where on the strip this character lives, and so how many leaves have to
       * fall to reach it. A character that is not on the strip at all stops at
       * position 0, which is the blank: a board cannot show what it does not
       * carry, and inventing a leaf for it would be the one dishonest thing in
       * here.
       */
      const index = strip.indexOf(character)
      this.cells.push({
        box,
        topStill: topStill.inner,
        bottomStill: bottomStill.inner,
        leafFalling: falling.inner,
        leafRising: rising.inner,
        steps: index < 0 ? 0 : index
      })
    }

    const probe = document.createElement('span')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText =
      'position:absolute;visibility:hidden;white-space:pre;pointer-events:none;top:0;left:0'
    visual.append(probe)
    this.probe = probe

    host.append(label, visual)
    this.built = true

    /*
     * Widths measured in the fallback face are the wrong widths, and the cells
     * would keep them for the life of the page. Measure again once the real
     * face has arrived.
     */
    if (!this.fontsPending && typeof document !== 'undefined' && document.fonts) {
      this.fontsPending = true
      document.fonts.ready.then(() => {
        this.measured = false
      })
    }
  }

  /*
   * One width for every cell: the widest glyph on the strip. The flaps on a
   * real board are the same size because they are the same part, and it is also
   * the only way the board does not breathe as it runs.
   */
  private measure(strip: string): void {
    const probe = this.probe
    if (!probe || (this.measured && this.measuredFor === strip)) return
    this.measuredFor = strip

    let widest = 0
    for (const glyph of Array.from(strip)) {
      probe.textContent = glyph
      widest = Math.max(widest, probe.getBoundingClientRect().width)
    }
    // A strip of nothing but spaces would otherwise collapse every cell.
    const width = Math.max(widest, 1)
    for (const cell of this.cells) cell.box.style.width = `${width.toFixed(2)}px`
    this.measured = true
  }

  resize(): void {
    this.measured = false
  }

  render(t: number, opts: SplitFlapTextOptions): void {
    this.build(opts)
    if (this.cells.length === 0) return

    const strip = Array.from(opts.strip.length > 0 ? opts.strip : splitFlapTextDefaults.strip)
    this.measure(strip.join(''))

    const flap = Math.max(opts.flap, 1) / 1000
    const stagger = opts.stagger / 1000
    const hold = opts.hold / 1000
    const seam = `rgba(0,0,0,${clamp01(opts.seam) * 0.5})`

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]!

      /*
       * Which leaf, and how far through its fall. Both from the clock. A cell
       * that has reached its character sits on it: the turn is clamped, not
       * wrapped, because a board that keeps going is an advertising hoarding.
       */
      const elapsed = t - hold - i * stagger
      const turned = elapsed <= 0 ? 0 : elapsed / flap
      const leaf = Math.min(Math.floor(turned), cell.steps)
      const progress = leaf >= cell.steps ? 0 : clamp01(turned - leaf)

      const from = strip[leaf] ?? ' '
      const to = strip[Math.min(leaf + 1, cell.steps)] ?? from

      const paint = (el: HTMLElement, glyph: string) => {
        if (el.textContent !== glyph) el.textContent = glyph
      }
      paint(cell.topStill, to)
      paint(cell.bottomStill, from)
      paint(cell.leafFalling, from)
      paint(cell.leafRising, to)

      /*
       * The fall. The upper leaf goes from upright to edge on over the first
       * half of the step and the lower leaf comes up over the second, which is
       * one leaf passing the seam rather than two leaves crossing.
       */
      const perspective = opts.depth > 0 ? `perspective(${opts.depth}px) ` : ''
      const fallen = Math.min(progress * 2, 1) * 90
      const rising = Math.max(progress * 2 - 1, 0)

      const falling = cell.leafFalling.parentElement as HTMLElement
      const risingWrap = cell.leafRising.parentElement as HTMLElement
      falling.style.transform = `${perspective}rotateX(${-fallen.toFixed(2)}deg)`
      risingWrap.style.transform = `${perspective}rotateX(${(90 - rising * 90).toFixed(2)}deg)`

      /*
       * A leaf standing edge on is hidden rather than left at 90 degrees.
       *
       * Under a perspective projection a plane at exactly 90 degrees does not
       * vanish: it is perpendicular to the screen, so it projects as a sliver
       * with a vanishing far edge, and the sliver has half a letter smeared
       * along it. It reads as a rendering fault, which is what it looked like
       * before this: a pale curved mark beside whichever cell was mid-flip.
       */
      const show = (el: HTMLElement, visible: boolean) => {
        const value = visible ? '' : 'hidden'
        if (el.style.visibility !== value) el.style.visibility = value
      }
      show(falling, fallen < 89.5)
      show(risingWrap, rising > 0.005)

      /*
       * A leaf turning away from the light loses it. This is the one piece of
       * shading in here and it is doing a lot: without it the two leaves are
       * flat shapes sliding over each other and the cell reads as a wipe.
       */
      const dim = (el: HTMLElement, amount: number) => {
        const value = `brightness(${(1 - amount * opts.shade).toFixed(3)})`
        if (el.style.filter !== value) el.style.filter = value
      }
      dim(falling, Math.sin((fallen * Math.PI) / 180) * 0.9)
      dim(risingWrap, (1 - rising) * 0.9)

      const style = cell.box.style
      if (style.background !== opts.face) style.background = opts.face
      if (style.color !== opts.ink) style.color = opts.ink
      // The seam, drawn as a hard line rather than a gap, because on a board it
      // is two leaves meeting and not a space between them.
      const shadow = `inset 0 -1px 0 ${seam}`
      const top = cell.topStill.parentElement as HTMLElement
      if (top.style.boxShadow !== shadow) top.style.boxShadow = shadow
    }
  }

  teardown(): void {
    if (this.host && this.original) this.host.textContent = this.original
    this.cells = []
    this.probe = null
    this.built = false
    this.measured = false
    this.measuredFor = ''
    this.host = null
  }
}

/**
 * Mount SplitFlapText into `el`. The element must already contain the text, and
 * it should be short: a board is four layers of DOM per character.
 *
 * ```ts
 * const board = createSplitFlapText(document.querySelector('#board')!)
 * board.start()
 * // …later
 * board.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left exactly as it
 * was found.
 */
export function createSplitFlapText(
  el: HTMLElement,
  opts: Partial<SplitFlapTextOptions> = {}
): EffectHandle {
  return mount<SplitFlapTextOptions>(el, opts, {
    defaults: splitFlapTextDefaults,
    kind: 'dom',
    create: () => new SplitFlapTextSurface()
  })
}

export default createSplitFlapText
```

## 2. What it is

SplitFlapText is a departure board. Each character is a split-flap cell: a stack
of hinged leaves, each carrying half a glyph, dropping one at a time until the
right one is showing.

The mechanism is the effect, so it is built rather than suggested. Four layers
per cell:

- the top half of the glyph arriving, sitting still behind everything
- the bottom half of the glyph leaving, likewise
- a leaf over the top half, carrying the upper half of the leaving glyph,
  falling from upright to edge on
- a leaf over the bottom half, carrying the lower half of the arriving glyph,
  rising from edge on to upright

Two things follow from that and neither had to be designed.

**The leaves go through the strip in order.** A cell cannot jump from A to R. It
has to pass through everything between, one leaf at a time, which is why a real
board lands its letters in the order the alphabet puts them rather than left to
right, and why a time takes longer to arrive than a word. That is the single
most recognisable thing about the object, and it falls straight out of modelling
the strip.

**A character that is not on the strip stops at the blank.** A board cannot show
what it does not carry. Inventing a leaf for it would be the one dishonest thing
in here.

It is pure in `t`: which leaf a cell is on, and how far through its fall, are
both arithmetic on the clock.

## 3. Wire it in

**Plain HTML.** The text must already be in the element.

```html
<div id="board">Departures</div>

<script type="module">
  import { createSplitFlapText } from './beamish/effects/split-flap-text/core.js'

  const board = createSplitFlapText(document.querySelector('#board'))
  board.start()
</script>
```

**React.** Pass the text as children. Do not build the cells in JSX: React will
overwrite the DOM on the next render and the board will stop half way.

```tsx
import { useEffect, useRef } from 'react'
import { createSplitFlapText } from '@/beamish/effects/split-flap-text/core'

export function Board({ children }: { children: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const board = createSplitFlapText(host.current, { flap: 52 })
    board.start()
    return () => board.destroy()
  }, [children])

  return <div ref={host} />
}
```

The dependency on `children` is deliberate. If the text changes, the cells have
to be rebuilt.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSplitFlapText } from '@/beamish/effects/split-flap-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let board: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  board = createSplitFlapText(host.value)
  board.start()
})

onBeforeUnmount(() => board?.destroy())
</script>

<template>
  <div ref="host">Departures</div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Running it again.** It runs once from `t = 0`. To play it again, reset the
clock and start:

```ts
board.stop()
board.renderAtTime(0)
board.start()
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a scroll-triggered board with no extra code.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `strip` | string | ` ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:-` | any value | The leaves, in the order they are stacked. Position 0 is what a cell shows at rest, and a blank there is why a board starts empty. The order is the mechanism: a cell has to pass through every leaf between where it is and where it is going, so putting the digits after the letters is what makes a time take longer to land than a word. |
| `flap` | number | `52` | 10 to 300 ms (looks right between 35 and 80) | Milliseconds for one leaf to fall. This multiplies: a cell showing Z has to drop twenty six leaves to get there, so 52ms is already more than a second of travel for the back half of the alphabet. That is what a board does, and it is why they are satisfying. |
| `stagger` | number | `110` | 0 to 500 ms | Milliseconds between one cell starting and the next. At 0 the whole board starts together, which is what a board does when the schedule changes, and the letters still land in alphabetical order because the strip decides that, not this. |
| `hold` | number | `240` | 0 to 3000 ms | Milliseconds before the first cell starts. A board sits blank for a moment before it runs, and that moment is what tells you it is a board rather than a label that happens to be animating. |
| `face` | color | `#26261f` | any CSS hex | The face of a leaf. Dark, because that is what they are: these are painted metal or plastic tiles, and a pale one reads as a card being turned rather than a flap falling. |
| `ink` | color | `#f7f5ed` | any CSS hex | The type printed on the leaf. Off white rather than white, which is both what the real thing looks like after a few years and what keeps it from glaring out of a paper page. |
| `seam` | number | `0.45` | 0 to 1 | How dark the line across the middle of a cell is. It is drawn as a line rather than a gap, because on a board it is two leaves meeting and not a space between them. At 0 the cell reads as one tile and the mechanism disappears. |
| `depth` | number | `180` | 0 to 1200 px (looks right between 120 and 400) | Perspective applied to the fall. At 0 it is a flat fold, which looks like a sheet of paper creasing; low numbers are a strong perspective and read as a leaf that has thickness. Too low and the leaf swings past the front of the cell. |
| `shade` | number | `0.55` | 0 to 1 | How much a falling leaf darkens as it turns away from the light. At 0 the two leaves are flat shapes sliding over each other and the cell reads as a wipe rather than as something hinged. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot reveal this should be a time after the board has finished, so the text simply appears, set in its cells and still. |

## 5. The strip is the timing

`flap` is the time for one leaf, and it multiplies by how far along the strip a
character sits. On the default strip a cell showing Z drops twenty six leaves to
get there, which at 52ms is well over a second, while a B arrives almost at
once.

That is not a thing to fix. It is what a board does, and it is why they are
worth watching. But it does mean the order of the strip is a timing decision:
putting the digits after the letters, as the default does, is what makes a time
take longer to land than a word.

If you want everything to arrive at roughly the same moment, shorten the strip
to the characters you actually need. A board for times only wants
`' 0123456789:'`.

## 6. Size

Four layers of DOM per character, two of them transformed every frame. This is
for a board, not a paragraph: keep it under about forty characters. For a
headline reveal use ScrambleText, and for a decode use DecodeText.

## 7. Accessibility. Do not skip this

The cells are marked `aria-hidden` and a visually hidden copy of the original
string sits alongside them. A screen reader reads the sentence rather than a
stream of leaves.

Do not put an `aria-label` on the element as well. Two labels is worse than
none.

## 8. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The cells are only built on the first frame. Call
`createSplitFlapText` from `useEffect`, `onMounted`, or a `client:*` island.

## 9. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For a one-shot reveal that default is 999, which is any time after the board has
finished, so the text appears set in its cells and still. Do not set it to 0:
that is a board of blanks.

## 10. The three mistakes most likely to be made here

1. **Transparent leaves.** A leaf is a tile and it hides what is behind it. The
   first version of this left the four layers transparent, and every cell at
   rest showed the top half of the letter that was arriving straight through the
   blank leaf covering it. It looks like a stacking bug and it is really a
   missing object.

2. **Leaving a leaf at exactly 90 degrees.** Under a perspective projection a
   plane standing edge on does not vanish, it projects as a sliver with half a
   letter smeared along it. Hide it instead.

3. **Letting the cells size themselves.** The flaps on a board are all the same
   size because they are the same part. Every cell here is the width of the
   widest glyph on the strip, measured once in the real face, and a board whose
   cells breathe is not a board.

4. **Using it for a paragraph.** Four elements per character, and a strip that
   can take a second to deliver one letter. It is a board.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
