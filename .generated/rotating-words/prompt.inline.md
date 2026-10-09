You are adding **RotatingWords** from Beamish to this project.

> One word in a sentence swaps for another on a loop, in a box sized to the longest so the line never moves. Type · effect · MIT.
> https://beamish.ink/effects/rotating-words

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The box is sized to the longest word before anything moves. A list of words of different lengths swapped in place changes the width of its own line on every swap, so everything after it slides back and forth for as long as the page is open. It is the most common fault in this effect and it is entirely avoidable
- The sizing needs no measurement. Every word is placed in the same cell of an inline-grid, so the cell is as wide as the longest and as tall as the tallest, and it stays that size whichever word is showing. Nothing to recompute on resize and nothing that can be wrong before a font has loaded
- The words are the author's markup and are never replaced. Passing a list of strings and building spans means the text is invisible to anything reading the page before the script runs, and it puts copy inside a configuration object where nobody will think to translate it
- Only the first word is in the accessibility tree; the rest are aria-hidden and the element is aria-live off. A screen reader meeting eight alternatives in a row would otherwise read the sentence eight times, and a live region would announce a change nobody asked for every two seconds
- Pure in t: which word is showing and how far through its handover are arithmetic on the clock, so the recorder can seek anywhere and a live page and a take agree
- Only the arriving and leaving words are touched. Everything else is parked with no transform to compute, so twelve words cost the same per frame as two
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

**`src/beamish/effects/rotating-words/core.ts`**

```ts
/*
 * RotatingWords: Beamish
 * https://beamish.ink/effects/rotating-words
 *
 * One word in a sentence swaps for another on a loop. "Printed by letterpress,
 * by lithography, by screen print."
 *
 * Three things carry it, and the first is why most versions of this are
 * unpleasant to look at without anyone being able to say why.
 *
 * The box is sized to the longest word before anything moves. A list of words
 * of different lengths, swapped in place, changes the width of its own line on
 * every swap, so the words after it slide back and forth for as long as the
 * page is open. It is the single most common fault in this effect and it is
 * entirely avoidable: measure every word once, take the widest, and hold that.
 * The sentence then stays still and only the word moves, which is the whole
 * idea.
 *
 * The words are the author's markup and are never replaced. Passing a list of
 * strings and building spans means the text is invisible to anything that
 * reads the page before the script runs, and it puts copy inside a
 * configuration object where nobody will think to translate it.
 *
 * And it is pure in `t`. Which word is showing, and how far through its
 * handover, are arithmetic on the clock, so the recorder can seek anywhere and
 * a live page and a take agree.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type RotatingWordsOptions = BaseOptions & {
  /** Milliseconds each word is held, including its handover. */
  interval: number
  /** Milliseconds the handover itself takes. */
  swap: number
  /** How far a word travels as it leaves, as a share of the line height. */
  rise: number
  /** Degrees the leaving word tips as it goes. */
  tilt: number
  /** Blur on a word in motion, in pixels. Zero is crisper and cheaper. */
  blur: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const rotatingWordsDefaults: RotatingWordsOptions = {
  interval: 2200,
  swap: 520,
  rise: 0.9,
  tilt: 0,
  blur: 0,
  reducedMotionTime: 0
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/* Out, so the arriving word lands rather than drifts into place. */
const easeOutQuart = (k: number) => 1 - Math.pow(1 - k, 4)

class RotatingWordsSurface implements Surface<RotatingWordsOptions> {
  private host: HTMLElement | null = null
  private words: HTMLElement[] = []
  private built = false
  private applied = ''

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host
    /*
     * Inline-grid rather than inline-block: every word is stacked in the one
     * cell, so the box takes the size of the largest without any of them being
     * taken out of flow. Absolute positioning would work and would also mean
     * the box had no height of its own.
     */
    host.style.display = 'inline-grid'
    host.style.verticalAlign = 'bottom'
    /*
     * The words change under a reader who did not ask for it, so they are not
     * announced. The sentence still reads correctly: the first word is left in
     * the accessibility tree and the rest are hidden from it.
     */
    host.setAttribute('aria-live', 'off')
  }

  private build(): void {
    const host = this.host
    if (!host || this.built) return
    this.words = [...host.children].filter(
      (node): node is HTMLElement => node instanceof HTMLElement
    )
    for (let i = 0; i < this.words.length; i++) {
      const word = this.words[i]!
      // All in one cell, so the box is as wide as the widest of them.
      word.style.gridArea = '1 / 1'
      word.style.willChange = 'transform, opacity'
      word.style.whiteSpace = 'nowrap'
      /*
       * Only the first is readable. A screen reader meeting eight alternatives
       * in a row reads the sentence eight times.
       */
      if (i > 0) word.setAttribute('aria-hidden', 'true')
    }
    this.built = true
  }

  /*
   * Nothing to measure.
   *
   * The box is sized by the grid itself: every word is in the same cell, so the
   * cell is as wide as the longest and as tall as the tallest, and it stays
   * that size whichever word is showing. No measurement, nothing to recompute
   * on resize, and nothing that can be wrong before a font has loaded.
   */
  resize(): void {}

  render(t: number, opts: RotatingWordsOptions): void {
    this.build()
    const host = this.host
    const count = this.words.length
    if (!host || count === 0) return

    const interval = Math.max(opts.interval, 1) / 1000
    const swap = Math.min(Math.max(opts.swap, 1) / 1000, interval)

    /*
     * Which word, and how far through the handover. Both from the clock, so
     * seeking to the middle of a swap lands on the same frame every time.
     */
    const turns = Math.floor(t / interval)
    const within = t - turns * interval
    const moving = easeOutQuart(clamp01(within / swap))

    const showing = ((turns % count) + count) % count
    const leaving = ((showing - 1) % count + count) % count

    const state = `${showing}|${moving.toFixed(4)}`
    if (state === this.applied) return
    this.applied = state

    for (let i = 0; i < count; i++) {
      const word = this.words[i]!

      /*
       * Three states, and only two of them move. Everything that is neither
       * arriving nor leaving is parked out of sight with no transform to
       * compute, which is what keeps a list of twelve words as cheap as a list
       * of two.
       */
      let shift = 0
      let fade = 0
      if (i === showing) {
        shift = (1 - moving) * opts.rise
        fade = moving
      } else if (i === leaving && moving < 1) {
        shift = -moving * opts.rise
        fade = 1 - moving
      } else {
        word.style.opacity = '0'
        word.style.transform = ''
        word.style.filter = ''
        continue
      }

      const turn = opts.tilt === 0 ? '' : ` rotate(${(shift * opts.tilt).toFixed(2)}deg)`
      word.style.transform = `translate3d(0, ${(shift * 100).toFixed(2)}%, 0)${turn}`
      word.style.opacity = fade.toFixed(3)
      // A blur of 0 still costs a filter, so it is left off entirely.
      word.style.filter =
        opts.blur > 0 ? `blur(${((1 - fade) * opts.blur).toFixed(2)}px)` : ''
    }
  }

  teardown(): void {
    for (const word of this.words) {
      word.style.gridArea = ''
      word.style.willChange = ''
      word.style.whiteSpace = ''
      word.style.transform = ''
      word.style.opacity = ''
      word.style.filter = ''
      word.removeAttribute('aria-hidden')
    }
    if (this.host) {
      this.host.style.display = ''
      this.host.style.verticalAlign = ''
      this.host.removeAttribute('aria-live')
    }
    this.words = []
    this.built = false
    this.applied = ''
    this.host = null
  }
}

/**
 * Mount RotatingWords onto `el`. Its element children are the words, and they
 * are never replaced.
 *
 * ```html
 * Printed by
 * <span id="how"><span>letterpress</span><span>lithography</span></span>
 * ```
 *
 * ```ts
 * const words = createRotatingWords(document.querySelector('#how')!)
 * words.start()
 * // …later
 * words.destroy()
 * ```
 *
 * The box takes the width of the longest word and holds it, so the sentence
 * around it never moves.
 */
export function createRotatingWords(
  el: HTMLElement,
  opts: Partial<RotatingWordsOptions> = {}
): EffectHandle {
  return mount<RotatingWordsOptions>(el, opts, {
    defaults: rotatingWordsDefaults,
    kind: 'dom',
    create: () => new RotatingWordsSurface()
  })
}

export default createRotatingWords
```

## 2. What it is

RotatingWords swaps one word in a sentence for another on a loop. "Printed by
letterpress, by lithography, by screen print."

Three things carry it, and the first is why most versions of this are
unpleasant to look at without anyone being able to say why.

**The box is sized to the longest word before anything moves.** A list of words
of different lengths, swapped in place, changes the width of its own line on
every swap, so everything after it slides back and forth for as long as the
page is open. It is the most common fault in this effect and it is entirely
avoidable.

The sizing needs no measurement. Every word is placed in the same cell of an
`inline-grid`, so the cell is as wide as the longest and as tall as the
tallest, and it stays that size whichever word is showing. Nothing to recompute
on resize, and nothing that can be wrong before a font has loaded.

**The words are your markup and are never replaced.** Passing a list of strings
and building spans makes the text invisible to anything reading the page before
the script runs, and puts copy inside a configuration object where nobody will
think to translate it.

**It is pure in `t`.** Which word is showing, and how far through its handover,
are arithmetic on the clock.

## 3. Wire it in

**Plain HTML.** The element's children are the words.

```html
Printed by
<span id="how">
  <span>letterpress</span>
  <span>lithography</span>
  <span>screen print</span>
  <span>risograph</span>
</span>

<script type="module">
  import { createRotatingWords } from './beamish/effects/rotating-words/core.js'

  const words = createRotatingWords(document.querySelector('#how'))
  words.start()
</script>
```

Write the words in the order you want them. The first one is what a reader sees
before the script runs and what a screen reader is given.

**React.** The words are the children.

```tsx
import { useEffect, useRef } from 'react'
import { createRotatingWords } from '@/beamish/effects/rotating-words/core'

export function Rotating({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!host.current) return
    const words = createRotatingWords(host.current, { interval: 2600 })
    words.start()
    return () => words.destroy()
  }, [children])

  return <span ref={host}>{children}</span>
}
```

The dependency on `children` is deliberate: a different set of words is a
different loop.

**Vue.** The words come in through the default slot.

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createRotatingWords } from '@/beamish/effects/rotating-words/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let words: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  words = createRotatingWords(host.value)
  words.start()
})

onBeforeUnmount(() => words?.destroy())
</script>

<template>
  <span ref="host"><slot /></span>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `interval` | number | `2200` | 600 to 10000 ms (looks right between 1800 and 3200) | Milliseconds each word is held, including its handover. This sets the length of the whole loop, which is the interval times the number of words, so four words at 2200ms is an 8.8 second cycle and that is what a recording has to span. |
| `swap` | number | `520` | 80 to 2000 ms | Milliseconds the handover takes, clamped to the interval so one word cannot still be leaving when the next starts. Around a quarter of the interval reads as a deliberate change rather than as a flicker. |
| `rise` | number | `0.9` | 0 to 2 | How far a word travels as it goes, as a share of its own line height. At 0 the words cross-fade in place, which is quieter and is the right answer inside running text. |
| `tilt` | number | `0` | -20 to 20 deg | Degrees the moving words tip. Zero by default because a tilted word in the middle of a sentence reads as a mistake; it earns its place in a large display line and almost nowhere else. |
| `blur` | number | `0` | 0 to 8 px | Blur on a word in motion. Zero is crisper and cheaper, and a filter costs a compositing layer whether or not it does anything, so a value of 0 is left off rather than written as blur(0px). |

## 5. The loop is the interval times the words

Four words at 2200ms is an 8.8 second cycle, and that is what a recording of it
has to span for the loop to close. If you change either, change the record
duration with them.

`swap` is clamped to the interval, so one word can never still be leaving when
the next arrives.

## 6. Rise, and when to set it to zero

The default lifts the arriving word into place and drops the leaving one out.
That is right for a display line.

Inside running text, set `rise: 0`. The words then cross-fade without moving,
which is much quieter, and a word that jumps vertically in the middle of a
paragraph pulls the eye off the sentence it is part of.

`tilt` is zero for the same reason, and it earns its place in a large heading
and almost nowhere else.

## 7. Accessibility. Do not skip this

Only the first word is left in the accessibility tree. The rest are
`aria-hidden`, and the element is `aria-live="off"`.

Both matter. Without the first, a screen reader meets every alternative in a
row and reads the sentence once per word. Without the second, a browser that
decides the element is a live region announces a change nobody asked for every
couple of seconds.

The sentence still reads correctly, because the first word is a real word in a
real sentence rather than a placeholder.

## 8. Cleanup and SSR

`destroy()` restores every property it set on the words and on the element, and
removes the attributes it added. There is no GPU resource to release.

All the words render on the server, which means they appear as a list before
the first frame stacks them. If that matters, give the element
`display: inline-grid` in your own CSS so the stacking is the initial state
rather than something the script does.

## 9. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is 0: the first word, in place, with nothing moving.

Nothing is lost. The sentence was always complete with one word in it.

## 10. The three mistakes most likely to be made here

1. **Letting the box resize.** The sentence after it moves on every swap. Fix
   the width, or stack the words in one grid cell as this does.

2. **Measuring the words in JavaScript.** It works until a font loads late, and
   then the box is the wrong size with no indication why. The grid cell does it
   with no measurement at all.

3. **Passing the words as an array of strings.** Invisible before hydration,
   and untranslatable in practice.

4. **Leaving every word readable.** The sentence is read once per alternative.

5. **Using `rise` inside a paragraph.** A word jumping vertically in running
   text pulls the eye off the line.

6. **Putting a comma or a full stop straight after the slot.** The box is as
   wide as the longest word, so every shorter one leaves the rest of that space
   empty, and a comma sitting a centimetre off the word it belongs to reads as
   a bug rather than as a held space. Nobody notices the same gap at the end of
   a line. Either end the sentence on the slot, or keep the alternatives close
   enough in length that the slack is a word space.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
