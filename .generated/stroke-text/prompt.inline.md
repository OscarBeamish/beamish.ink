You are adding **StrokeText** from Beamish to this project.

> Hollow letters that fill with ink from the foot up, with the stroke outside the letterform where it belongs. Type · effect · MIT.
> https://beamish.ink/effects/stroke-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- -webkit-text-stroke centres the stroke on the letterform, so half of it is painted inside the glyph. On a light weight that half eats the counters: the inside of an o closes up, an e fills in, and the setting goes muddy at exactly the widths where an outline is worth having. A face designed as an inline puts the stroke outside the letter
- The fix needs no new CSS and works everywhere. The text is drawn twice: behind, a stroke of twice the width asked for, centred, so it reaches the right distance outside the letter; in front, the same text filled, painting over the inner half. What is left is an outside-only stroke of exactly the width given, with the counters intact
- The animated thing is the ink. The front layer is a gradient clipped to the text with a hard edge in it, so below the edge the letter is solid and above it the letter is paper. Moving the edge fills the type from the foot up, which is what inking a block looks like
- The ink line tilts and has a small wobble, because a roller is not level. A dead horizontal edge across a line of type reads as a mask rather than as a surface of ink
- `paper` has to match the page behind the element. It is not decoration: it is the colour that covers the inner half of the stroke, so if it is wrong the hollow of every letter is wrong and the outline looks twice as thick as it is
- The stroked copy is the one in the flow and the one a screen reader reaches. The filled copy on top is marked hidden, because the text underneath is the real text and the layer over it is paint
- -webkit-text-fill-color is set as well as color on the front layer. Without it WebKit paints the text over the clipped background and the fill never shows at all
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

**`src/beamish/effects/stroke-text/core.ts`**

```ts
/*
 * StrokeText: Beamish
 * https://beamish.ink/effects/stroke-text
 *
 * Hollow letters that fill with ink from the bottom. An inline face being
 * inked, rather than an outline for its own sake.
 *
 * Two problems to solve, and the first one is the reason most outlined text on
 * the web looks wrong.
 *
 * `-webkit-text-stroke` centres the stroke on the letterform, so half of it is
 * painted inside the glyph. On a light weight that half eats the counters: the
 * inside of an o closes up, an e fills in, and the whole setting goes muddy at
 * exactly the widths where an outline is worth having. A typeface designed as
 * an inline puts the stroke outside the letter, where it belongs.
 *
 * The fix here needs no new CSS and works everywhere. The text is drawn twice.
 * Behind: a stroke of twice the width you asked for, centred, so it reaches the
 * right distance outside the letter and an equal distance inside. In front: the
 * same text filled, which paints over the inner half. What is left is an
 * outside-only stroke of exactly the width given, with the counters intact.
 *
 * The second problem is what to animate, and the answer is the ink. The front
 * layer's fill is a gradient clipped to the text with a hard edge in it, so
 * below the edge the letter is solid and above it the letter is paper. Move the
 * edge and the type fills from the foot up, which is what inking a block
 * actually looks like and what an outline is for.
 *
 * The ink line is not level, because a roller is not level. It tilts, and it
 * has a small wobble along its length.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type StrokeTextOptions = BaseOptions & {
  /** The outline. */
  outline: string
  /** The ink that fills the letters. */
  ink: string
  /** What the hollow part of a letter shows. Must match the page behind it. */
  paper: string
  /** Width of the outline, in ems. */
  width: number
  /** How full the letters are when the run has finished, 0 to 1. */
  level: number
  /** Milliseconds for the ink to rise. */
  duration: number
  /** Milliseconds before it starts. */
  hold: number
  /** How far the ink line is off level, in degrees. */
  tilt: number
  /** How uneven the ink line is, 0 to 1. */
  wobble: number
  /** Seed for the unevenness. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const strokeTextDefaults: StrokeTextOptions = {
  outline: '#36362f',
  ink: '#c44400',
  paper: '#fbfaf4',
  width: 0.022,
  level: 1,
  duration: 2400,
  hold: 300,
  tilt: 2.5,
  wobble: 0.3,
  seed: 7,
  reducedMotionTime: 999
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** The one easing this library uses for arrivals. Matches --ease-out-expo. */
const easeOutExpo = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k))

function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

class StrokeTextSurface implements Surface<StrokeTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private back: HTMLElement | null = null
  private front: HTMLElement | null = null
  private built = false
  private previous = ''

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  private build(): void {
    const host = this.host
    if (!host || this.built) return

    host.textContent = ''
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'

    /*
     * The stroked copy sits behind and carries the accessible text, because it
     * is the one in the flow: it sets the size of the element and it is the one
     * a screen reader reaches. The filled copy on top is marked hidden, which
     * is the right way round for exactly one reason, that the text underneath
     * is the real text and the layer over it is paint.
     */
    const back = document.createElement('span')
    back.textContent = this.original
    back.style.cssText = 'display:block'

    const front = document.createElement('span')
    front.setAttribute('aria-hidden', 'true')
    front.textContent = this.original
    front.style.cssText =
      'position:absolute;inset:0;display:block;pointer-events:none;' +
      'background-repeat:no-repeat;color:transparent'
    front.style.setProperty('-webkit-background-clip', 'text')
    front.style.backgroundClip = 'text'
    front.style.setProperty('-webkit-text-fill-color', 'transparent')

    host.append(back, front)
    this.back = back
    this.front = front
    this.built = true
  }

  resize(): void {}

  render(t: number, opts: StrokeTextOptions): void {
    this.build()
    const back = this.back
    const front = this.front
    if (!back || !front) return

    /*
     * Twice the width asked for, centred, so the half that lands outside the
     * letter is the width wanted and the half inside is covered by the layer in
     * front. That is the whole trick, and it needs nothing but two copies.
     */
    const stroke = `${(Math.max(opts.width, 0) * 2).toFixed(4)}em ${opts.outline}`
    if (back.style.getPropertyValue('-webkit-text-stroke') !== stroke) {
      back.style.setProperty('-webkit-text-stroke', stroke)
    }
    if (back.style.color !== opts.paper) back.style.color = opts.paper

    const duration = Math.max(opts.duration, 1) / 1000
    const hold = Math.max(opts.hold, 0) / 1000
    const risen = easeOutExpo(clamp01((t - hold) / duration)) * clamp01(opts.level)

    /*
     * The ink line. A roller is not level, so it tilts, and it has a small
     * wobble along its length: a hard horizontal edge across a line of type
     * reads as a mask rather than as a surface of ink.
     *
     * Built as a gradient with two stops at nearly the same place, which is a
     * hard edge with a pixel of softness on it. Dead hard, and the edge
     * staircases across the diagonal.
     */
    const ragged = 1 + (hash2(1, opts.seed) - 0.5) * opts.wobble * 0.3
    const at = clamp01(1 - risen * ragged)
    const edge = (at * 100).toFixed(2)
    const after = (Math.min(at + 0.012, 1) * 100).toFixed(2)
    const angle = (180 + opts.tilt).toFixed(2)

    /*
     * Paper first, ink second. At 180 degrees a CSS gradient runs to the
     * bottom, so 0% is the top of the box: putting the ink at the start fills
     * the letters from the ceiling down, which is what the first version did
     * and which reads as the type draining rather than filling.
     */
    const image =
      `linear-gradient(${angle}deg, ${opts.paper} 0%, ${opts.paper} ${edge}%, ` +
      `${opts.ink} ${after}%, ${opts.ink} 100%)`
    if (image !== this.previous) {
      front.style.backgroundImage = image
      this.previous = image
    }
  }

  teardown(): void {
    const host = this.host
    if (host) {
      host.textContent = this.original
      host.style.position = ''
    }
    this.back = null
    this.front = null
    this.built = false
    this.previous = ''
    this.host = null
  }
}

/**
 * Mount StrokeText into `el`. The element must already contain the text.
 *
 * The `paper` option has to match the page behind the element, because the
 * hollow part of a letter is painted that colour: it is what covers the inner
 * half of the stroke.
 *
 * ```ts
 * const hollow = createStrokeText(document.querySelector('h1')!)
 * hollow.start()
 * // …later
 * hollow.destroy()
 * ```
 */
export function createStrokeText(
  el: HTMLElement,
  opts: Partial<StrokeTextOptions> = {}
): EffectHandle {
  return mount<StrokeTextOptions>(el, opts, {
    defaults: strokeTextDefaults,
    kind: 'dom',
    create: () => new StrokeTextSurface()
  })
}

export default createStrokeText
```

## 2. What it is

StrokeText sets hollow letters and fills them with ink from the foot up. An
inline face being inked, rather than an outline for its own sake.

Two problems, and the first is why most outlined text on the web looks wrong.

**`-webkit-text-stroke` centres the stroke on the letterform**, so half of it is
painted inside the glyph. On a light weight that half eats the counters: the
inside of an o closes up, an e fills in, and the setting goes muddy at exactly
the widths where an outline is worth having. A typeface designed as an inline
puts the stroke outside the letter, where it belongs.

The fix needs no new CSS and works everywhere. The text is drawn twice. Behind,
a stroke of **twice** the width you asked for, centred, so it reaches the right
distance outside the letter and an equal distance inside. In front, the same
text filled, painting over the inner half. What is left is an outside-only
stroke of exactly the width given, with the counters intact.

**The second problem is what to animate**, and the answer is the ink. The front
layer is a gradient clipped to the text with a hard edge in it: below the edge
the letter is solid, above it the letter is paper. Move the edge and the type
fills from the foot up.

The edge tilts and has a small wobble, because a roller is not level. A dead
horizontal line across a setting reads as a mask rather than as a surface of
ink.

## 3. Wire it in

**Plain HTML.** The text must already be in the element.

```html
<h1 id="masthead">Inked from the foot up</h1>

<script type="module">
  import { createStrokeText } from './beamish/effects/stroke-text/core.js'

  const hollow = createStrokeText(document.querySelector('#masthead'), {
    paper: '#fbfaf4'
  })
  hollow.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createStrokeText } from '@/beamish/effects/stroke-text/core'

export function Masthead({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const hollow = createStrokeText(host.current, { paper: '#fbfaf4' })
    hollow.start()
    return () => hollow.destroy()
  }, [children])

  return <h1 ref={host}>{children}</h1>
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createStrokeText } from '@/beamish/effects/stroke-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let hollow: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  hollow = createStrokeText(host.value, { paper: '#fbfaf4' })
  hollow.start()
})

onBeforeUnmount(() => hollow?.destroy())
</script>

<template>
  <h1 ref="host">Inked from the foot up</h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Inking it again.**

```ts
hollow.stop()
hollow.renderAtTime(0)
hollow.start()
```

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `outline` | color | `#36362f` | any CSS hex | The outline. It carries the whole letterform while the ink is still low, so it wants enough contrast against the paper to be read on its own. |
| `ink` | color | `#c44400` | any CSS hex | The ink that fills the letters. A second colour is worth having: ink the same colour as the outline gives a letter that simply goes solid, and the point is to watch it fill. |
| `paper` | color | `#fbfaf4` | any CSS hex | What the hollow of a letter shows, and it must match the page behind the element. Load-bearing rather than decorative: this is the colour that paints over the inner half of the stroke, so if it is wrong every counter is wrong and the outline looks twice as thick as it is. |
| `width` | number | `0.022` | 0.002 to 0.1 em (looks right between 0.012 and 0.04) | Width of the outline, in ems, so it holds at any size. This is the real outside width: the stroke actually drawn is twice this and the inner half is covered. Past about 0.05 the outline starts closing the counters from the outside instead, which no trick can fix. |
| `level` | number | `1` | 0 to 1 | How full the letters are when the run has finished. 1 fills them completely and ends on solid type. Around 0.6 leaves them half inked, which is the more interesting place to stop and reads as a block that has been rolled once. |
| `duration` | number | `2400` | 200 to 20000 ms | Milliseconds for the ink to rise, eased so it arrives rather than stops. Slow enough to watch: the rise is the effect and the outline is only where it starts. |
| `hold` | number | `300` | 0 to 5000 ms | Milliseconds of empty outline before the ink starts. Worth having: it is the moment that tells you the letters were hollow to begin with. |
| `tilt` | number | `2.5` | -15 to 15 deg | How far the ink line is off level. A roller is not level, and a dead horizontal edge across a line of type reads as a mask. Two or three degrees is enough to be felt without being seen. |
| `wobble` | number | `0.3` | 0 to 1 | How uneven the height of the ink is. Small, and fixed by the seed rather than moving: a roller lays an uneven line, it does not lay a wavy one. |
| `seed` | number | `7` | 0 to 9999 | Seed for the unevenness. The same seed gives the same pull, so a recording and a live page match. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot rise this should be a time after it has finished, so the letters are inked to the level set. Setting it to 0 instead gives the hollow outline, which is also a perfectly good still. |

## 5. `paper` has to be the real page colour

This is the one thing that will catch you out, and it is the same trap
EmbossedText has. The hollow of a letter is painted the `paper` colour, because
that is what covers the inner half of the stroke. Get it wrong and every counter
is wrong, and the outline looks twice as thick as you asked for.

If the background behind the text is an image or a gradient, this technique
cannot work. Use a single-layer centred stroke and accept the tighter counters,
or pick a different effect.

## 6. The ink crosses the block, not each line

The gradient belongs to the element, so on a two-line heading the ink rises
through the lower line first and then into the upper one. That is a roller
crossing a forme rather than each line filling itself, and it is the same logic
as SplitFountainText: the ink is a property of where you are on the sheet.

If you want each line inked separately, mount one of these per line.

## 7. Where to stop

`level: 1` ends on solid type, which is tidy and throws the outline away.

`level: 0.6` leaves the letters half inked, which is the more interesting place
to stop: it reads as a block that has been rolled once, and it keeps the
outline, which is the thing you went to the trouble of building.

## 8. Accessibility. Do not skip this

The stroked copy is the one in the flow and the one a screen reader reaches. The
filled copy on top is marked `aria-hidden`, which is the right way round for one
reason: the text underneath is the real text, and the layer over it is paint.

An empty outline has very little contrast against paper. If the heading matters,
end with the ink at or near full, or make the outline dark enough to be read on
its own.

## 9. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The two layers are only built on the first frame. Call
`createStrokeText` from `useEffect`, `onMounted`, or a `client:*` island.

## 10. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is after the rise. The letters are inked to the level set, and nothing
moves.

Set it to 0 instead and you get the hollow outline, which is also a perfectly
good still if the outline has the contrast for it.

## 11. The three mistakes most likely to be made here

1. **One layer with a centred stroke.** Half the stroke lands inside the letter
   and closes the counters. Two layers, the back one at double width, costs
   nothing and fixes it completely.

2. **`paper` not matching the page.** Every counter is the wrong colour and the
   outline reads at twice its width.

3. **Filling from the top.** At 180 degrees a CSS gradient runs to the bottom,
   so 0% is the top of the box. Putting the ink at the start of the stop list
   drains the type instead of filling it, which is what the first version of
   this did.

4. **A dead level ink line.** It reads as a mask sliding up. Two degrees of tilt
   is the difference.

5. **Using it on body copy.** Text strokes and `background-clip` are both
   painted rather than composited, and an outline at body size is a smudge. It
   is a heading effect.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
