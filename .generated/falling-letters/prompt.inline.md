You are adding **FallingLetters** from Beamish to this project.

> A line of type comes apart and falls, each letter dropping and bouncing once, with every position a closed form in t. Type · effect · MIT.
> https://beamish.ink/effects/falling-letters

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- Every letter's position is a closed form in t rather than a simulation. A solver steps from the last frame to the next, so frame 200 can only be reached by computing the 199 before it: you cannot seek, you cannot record a loop, and two runs drift apart as soon as one misses a frame. Here the fall is the parabola itself and the bounce is the same parabola reflected and damped, so any t in any order gives the same frame
- The letters are measured once and taken out of flow, so nothing reflows. Split a line into spans and animate them in place and every letter that moves changes the line box, so the letters that have not fallen yet shuffle along underneath
- The measuring has to finish before any letter is taken out of flow. Do it letter by letter and each removal reflows the rest, so every measurement after the first is of a line that no longer exists
- One damped bounce, not none and not five. A letter that falls and stops dead reads as a dropped frame rather than as a thing with weight; five is a rubber ball. One is a piece of lead type landing on a stone
- Distances are in line heights rather than pixels, so the same numbers behave at any type size
- The original text stays in the accessibility tree as a label on the element, and the per-letter spans are hidden from it. A word split into letters is otherwise read out one letter at a time
- destroy() puts the original text back exactly as it was found, including the spaces
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

**`src/beamish/effects/falling-letters/core.ts`**

```ts
/*
 * FallingLetters: Beamish
 * https://beamish.ink/effects/falling-letters
 *
 * A line of type comes apart and falls, each letter dropping, bouncing once
 * and settling. Pied type: a forme dropped on the way to the press.
 *
 * Three things carry it, and the first is the reason this is arithmetic rather
 * than a physics engine.
 *
 * Every letter's position is a closed form in `t`, not a simulation. A solver
 * steps from the last frame to the next, which means frame 200 can only be
 * reached by computing the 199 before it: you cannot seek, you cannot record a
 * loop, and two runs drift apart as soon as one of them misses a frame. Here
 * the fall is the parabola itself, `y = v0·t + ½g·t²`, and the bounce is the
 * same parabola reflected and damped. Ask for any `t` in any order and you get
 * the same frame, which is what the recorder needs and what makes the whole
 * thing cheap.
 *
 * The letters are measured once and taken out of flow, so nothing reflows.
 * Split a line into spans and animate them in place and every letter that
 * moves changes the line box, so the letters that have not fallen yet shuffle
 * along underneath. The block keeps the height it had and the letters fall
 * from exactly where they were set.
 *
 * And one damped bounce, not none and not five. A letter that falls and stops
 * dead reads as a dropped frame rather than as a thing with weight. Five is a
 * ball. One is a piece of lead type landing on a stone, which is what this is.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type FallingLettersOptions = BaseOptions & {
  /** Milliseconds before the first letter goes. */
  hold: number
  /** Milliseconds between one letter leaving and the next. */
  stagger: number
  /** How scattered the order is. 0 drops them left to right. */
  scatter: number
  /** Fall acceleration, in line heights per second squared. */
  gravity: number
  /** How much of its speed a letter keeps on the bounce. */
  bounce: number
  /** How far a letter drifts sideways as it falls, in line heights. */
  drift: number
  /** Degrees a letter turns per second while falling. */
  spin: number
  /** How far below the baseline the floor is, in line heights. */
  floor: number
  /** Seed for the scatter and the spin directions. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const fallingLettersDefaults: FallingLettersOptions = {
  hold: 400,
  stagger: 42,
  scatter: 0.55,
  gravity: 26,
  bounce: 0.28,
  drift: 0.35,
  spin: 150,
  floor: 3.2,
  seed: 7,
  reducedMotionTime: 0
}

function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

type Letter = { el: HTMLElement; go: number; side: number; turn: number }

class FallingLettersSurface implements Surface<FallingLettersOptions> {
  private host: HTMLElement | null = null
  private letters: Letter[] = []
  private built = false
  private applied = ''
  private text = ''

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.text = ctx.host.textContent ?? ''
  }

  /*
   * Split once, measure once, then take every letter out of flow.
   *
   * The measuring has to happen while they are still in flow, and the taking
   * out has to happen after all of them are measured: do it letter by letter
   * and each one you remove reflows the rest, so every measurement after the
   * first is of a line that no longer exists.
   */
  private build(opts: FallingLettersOptions): void {
    const host = this.host
    if (!host || this.built) return

    const text = this.text
    if (!text.trim()) return

    /*
     * The original text stays readable. The spans are hidden from the
     * accessibility tree, because a word split into letters is read out letter
     * by letter.
     */
    host.setAttribute('aria-label', text.trim())
    host.textContent = ''

    const spans: HTMLElement[] = []
    for (const ch of text) {
      const span = document.createElement('span')
      // A space has no box to measure or to move, but it still sets the rhythm.
      span.textContent = ch === ' ' ? ' ' : ch
      span.style.display = 'inline-block'
      span.setAttribute('aria-hidden', 'true')
      host.append(span)
      spans.push(span)
    }

    const box = host.getBoundingClientRect()
    // Every measurement first, while the line is still intact.
    const places = spans.map(span => {
      const r = span.getBoundingClientRect()
      return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height }
    })

    // The block keeps the height it had, so nothing below it moves.
    host.style.position = 'relative'
    host.style.height = `${box.height}px`

    this.letters = spans.map((span, i) => {
      const at = places[i]!
      span.style.position = 'absolute'
      span.style.left = `${at.x.toFixed(2)}px`
      span.style.top = `${at.y.toFixed(2)}px`
      span.style.width = `${at.w.toFixed(2)}px`
      span.style.willChange = 'transform'

      /*
       * When this one goes. Its place in the line, pulled towards a hashed
       * order by `scatter`, so the line can come apart left to right or all at
       * once without either being a special case.
       */
      const order = i + (hash2(i + 1, opts.seed) - 0.5) * 2 * opts.scatter * spans.length
      return {
        el: span,
        go: Math.max(order, 0),
        side: (hash2(i + 31, opts.seed) - 0.5) * 2,
        turn: (hash2(i + 97, opts.seed) - 0.5) * 2
      }
    })
    this.built = true
  }

  resize(): void {
    /*
     * Nothing. The letters were measured against a line that no longer exists,
     * so a resize cannot re-measure them without rebuilding the whole thing,
     * and rebuilding mid-fall would snap every letter back to its start. A
     * block that is mid-gesture when the window changes keeps its old
     * positions, which is the lesser of the two wrongs.
     */
  }

  render(t: number, opts: FallingLettersOptions): void {
    this.build(opts)
    const count = this.letters.length
    if (count === 0) return

    const hold = Math.max(opts.hold, 0) / 1000
    const stagger = Math.max(opts.stagger, 0) / 1000

    const state = `${t.toFixed(3)}`
    if (state === this.applied) return
    this.applied = state

    for (const letter of this.letters) {
      const age = t - hold - letter.go * stagger
      if (age <= 0) {
        // Not yet. No transform at all, so a line at rest writes nothing.
        if (letter.el.style.transform !== '') letter.el.style.transform = ''
        continue
      }

      /*
       * The fall, in closed form. Units are line heights, so the same numbers
       * behave at any type size.
       */
      const g = opts.gravity
      const floor = opts.floor

      // When the parabola first reaches the floor: ½g·t² = floor.
      const hit = Math.sqrt((2 * floor) / g)
      let y: number
      if (age < hit) {
        y = 0.5 * g * age * age
      } else {
        /*
         * One bounce, as the same parabola reflected. Speed at impact is g·hit,
         * and it leaves with that times the restitution, so the hop lasts
         * 2·v/g and its height is v²/2g. After it, the letter is at rest on the
         * floor: that is the whole of the physics and none of it is stepped.
         */
        const v = g * hit * opts.bounce
        const since = age - hit
        const hop = (2 * v) / g
        y = since < hop ? floor - (v * since - 0.5 * g * since * since) : floor
      }

      const settled = y >= floor - 0.0001
      const x = letter.side * opts.drift * Math.min(age, hit + 1)
      const turn = settled
        ? letter.turn * opts.spin * (hit * 1.2)
        : letter.turn * opts.spin * age

      letter.el.style.transform =
        `translate3d(${(x * 100).toFixed(2)}%, ${(y * 100).toFixed(2)}%, 0) ` +
        `rotate(${turn.toFixed(1)}deg)`
    }
  }

  teardown(): void {
    const host = this.host
    if (host) {
      host.style.position = ''
      host.style.height = ''
      host.removeAttribute('aria-label')
      // The text goes back exactly as it was found.
      host.textContent = this.text
    }
    this.letters = []
    this.built = false
    this.applied = ''
    this.host = null
  }
}

/**
 * Mount FallingLetters onto `el`. Its text is split into letters, which are
 * measured where they sit and then dropped.
 *
 * ```ts
 * const pied = createFallingLetters(document.querySelector('#masthead')!)
 * pied.start()
 * // …later
 * pied.destroy()
 * ```
 *
 * `destroy()` puts the original text back. The block keeps its height while the
 * letters fall, so nothing below it moves.
 */
export function createFallingLetters(
  el: HTMLElement,
  opts: Partial<FallingLettersOptions> = {}
): EffectHandle {
  return mount<FallingLettersOptions>(el, opts, {
    defaults: fallingLettersDefaults,
    kind: 'dom',
    create: () => new FallingLettersSurface()
  })
}

export default createFallingLetters
```

## 2. What it is

FallingLetters takes a line of type apart and drops it, each letter falling,
bouncing once and settling. Pied type: a forme dropped on the way to the press.

Three things carry it, and the first is why this is arithmetic rather than a
physics engine.

**Every letter's position is a closed form in `t`.** A solver steps from the
last frame to the next, which means frame 200 can only be reached by computing
the 199 before it. You cannot seek it, you cannot record a clean loop from it,
and two runs drift apart as soon as one misses a frame. Here the fall is the
parabola itself and the bounce is the same parabola reflected and damped, so
asking for any `t` in any order gives the same frame.

**The letters are measured once and taken out of flow.** Split a line into
spans and animate them in place, and every letter that moves changes the line
box, so the letters that have not fallen yet shuffle along underneath. The
block keeps the height it had and each letter falls from exactly where it was
set.

**One damped bounce.** A letter that falls and stops dead reads as a dropped
frame rather than as a thing with weight. Five bounces is a rubber ball. One is
a piece of lead type landing on a stone, which is what this is.

## 3. Wire it in

**Plain HTML.** The element's text is what falls.

```html
<h1 id="masthead">Pied type</h1>

<script type="module">
  import { createFallingLetters } from './beamish/effects/falling-letters/core.js'

  const pied = createFallingLetters(document.querySelector('#masthead'))
  pied.start()
</script>
```

The text is yours. It is split into letters at mount and put back exactly as it
was found on `destroy()`.

**React.** The text is the children.

```tsx
import { useEffect, useRef } from 'react'
import { createFallingLetters } from '@/beamish/effects/falling-letters/core'

export function Pied({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pied = createFallingLetters(host.current, { stagger: 55 })
    pied.start()
    return () => pied.destroy()
  }, [children])

  return <h1 ref={host}>{children}</h1>
}
```

Pass a string, not elements. The core replaces the element's contents with
per-letter spans, and React will fight it over any children it rendered itself.

**Vue.** Same shape, with the text in the slot.

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createFallingLetters } from '@/beamish/effects/falling-letters/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pied: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pied = createFallingLetters(host.value)
  pied.start()
})

onBeforeUnmount(() => pied?.destroy())
</script>

<template>
  <h1 ref="host"><slot /></h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `hold` | number | `400` | 0 to 4000 ms | Milliseconds before the first letter goes. Long enough that the line is read as a line first, because the whole gesture depends on it having been intact a moment ago. |
| `stagger` | number | `42` | 0 to 300 ms (looks right between 25 and 80) | Milliseconds between one letter leaving and the next. At 0 the whole line goes at once, which reads as the shelf giving way rather than as the type coming loose. |
| `scatter` | number | `0.55` | 0 to 1 | How scattered the order is. At 0 the letters drop strictly left to right, which reads as mechanical; at 1 the order is unrelated to position, which reads as random. The middle is what looks like something coming apart. |
| `gravity` | number | `26` | 4 to 120 | Fall acceleration, in line heights per second squared. In line heights rather than pixels so the same value behaves at any type size. |
| `bounce` | number | `0.28` | 0 to 0.8 | How much of its speed a letter keeps on the bounce. At 0 it stops dead, which reads as a dropped frame. Past about 0.5 it is a rubber ball rather than a piece of lead type. |
| `drift` | number | `0.35` | 0 to 2 | How far a letter wanders sideways as it falls, in line heights. A little is the difference between type coming loose and a row of counters dropping down a slot. |
| `spin` | number | `150` | 0 to 900 deg/s | Degrees a letter turns per second while falling, in whichever direction its hash gives it. At 0 the letters stay upright, which is quieter and is the right answer for a line that has to stay readable as it goes. |
| `floor` | number | `3.2` | 0.5 to 20 | How far below the baseline the letters come to rest, in line heights. Make sure there is room: the element keeps its original height, so anything past the bottom of its container needs the container to allow overflow. |
| `seed` | number | `7` | 0 to 9999 | Seed for the scatter and the spin directions. The same seed gives the same fall, so a recording and a live page agree letter for letter. |

## 5. Give it somewhere to fall

The element keeps its original height while the letters drop below it, which is
what stops the rest of the page moving. It also means the letters leave the
element's box.

So whatever contains it needs to allow that: no `overflow: hidden` on an
ancestor unless you want the letters clipped, and enough room below for `floor`
line heights of fall. If the letters vanish partway down, something above them
is clipping.

## 6. Units are line heights

`gravity`, `drift` and `floor` are all in line heights rather than pixels, so
the same numbers behave the same at 16px and at 96px. A value tuned on a
heading will not need retuning for a caption.

## 7. The order is the thing to tune

`stagger` sets how fast the line comes apart and `scatter` sets how ordered it
is.

At `scatter: 0` the letters drop strictly left to right, which reads as
mechanical. At 1 the order is unrelated to position, which reads as random
noise. The default sits between, which is what something actually coming apart
looks like: roughly left to right, but not reliably.

## 8. Accessibility. Do not skip this

The original text is put on the element as an `aria-label`, and every letter
span is `aria-hidden`. Without both, a screen reader meets a word split into
single characters and reads it one letter at a time.

Nothing is lost: the label is the exact text that was there before.

## 9. Cleanup and SSR

`destroy()` restores the original text, including its spaces, and removes the
height and the label.

The text renders on the server as ordinary text, which means it is complete and
readable before the script runs. There is nothing to hide and no flash of
anything.

## 10. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is 0: the line intact, before anything has gone.

That is the right still for this one. The text is the content, and the fall is
the decoration.

## 11. The three mistakes most likely to be made here

1. **Using a physics step.** It cannot be seeked, cannot be recorded cleanly,
   and drifts between runs. The closed form is less code and does more.

2. **Animating the letters in flow.** Every letter that moves reflows the ones
   that have not gone yet, so the line walks sideways as it falls apart.

3. **Measuring as you go.** Taking one letter out of flow reflows the rest, so
   every measurement after the first is of a line that no longer exists.

4. **No bounce.** The letters stop dead and it reads as a dropped frame.

5. **Clipping the container.** The letters fall out of the element by design.
   An `overflow: hidden` anywhere above them cuts the gesture in half.

6. **Passing React children other than a string.** The core owns the element's
   contents once it mounts.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
