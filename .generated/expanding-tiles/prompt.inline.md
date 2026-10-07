You are adding **ExpandingTiles** from Beamish to this project.

> A grid of tiles where the pressed one opens out to fill the window, and the rules that bounded its cell travel to the edges of the page with it. Navigation · effect · MIT.
> https://beamish.ink/effects/expanding-tiles

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- Nothing is scaled. The obvious way to grow a box is a transform, and a transform takes the type with it: the title stretches as the tile grows and settles back as it lands, which reads as cheap however well it is eased. The tile is put at its final size immediately and revealed with clip-path: inset(), opening from the cell outwards, so type laid out once at its final size cannot distort
- The content is carried rather than left behind. A tile jumped straight to full size has its title wherever the full-size layout puts it, which at the moment of the press is outside the clip: the title would blink out and reappear halfway through. Each child is counter-translated by the distance between where it sits at rest and where it sits open, eased to zero. That distance is measured rather than assumed, because a centred tile moves its title to the middle of the window and a top-left one does not, and a guessed offset gets one of the two wrong
- The four rules that bounded the cell travel out to the edges of the window, and they lead the clip slightly. An edge that arrives at the same moment as the thing it bounds reads as a border; an edge that gets there first reads as a movement
- Tiles that are links open and then follow their href, which is the whole gesture: the page changes behind a tile that already fills the window. A tile with no href stays open until it is dismissed, so it is never a dead end
- Pure in t: the open tile and how far through the gesture it is are folded out of the list of presses each frame, scripted and real presses in the same list, so the recorder can seek anywhere and a live page and a take agree
- The grid is laid out by your own CSS. The effect never positions the tiles, it only opens out of them, and the author's own cell borders show through whenever nothing is open
- An opened tile is fixed to the window, which takes it out of the grid, and a grid with one fewer item re-places every item after it: the tiles behind the one you pressed shuffle up a cell and the grid's own background shows through the hole. A placeholder sized from the measured cell holds the slot, so nothing behind the open tile moves
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

**`src/beamish/effects/expanding-tiles/core.ts`**

```ts
/*
 * ExpandingTiles: Beamish
 * https://beamish.ink/effects/expanding-tiles
 *
 * A grid of tiles. Press one and it opens out to fill the window, and the four
 * rules that bounded its cell travel out to the edges of the page with it, so
 * the grid you were looking at becomes the frame around what you opened.
 *
 * Three things carry it, and the first two are what every other version of this
 * gets wrong.
 *
 * Nothing is scaled. The obvious way to grow a box is a transform, and a
 * transform takes the type with it: the title stretches as the tile grows and
 * settles back as it lands, which reads as cheap however well it is eased. Here
 * the tile is put at its final size immediately and revealed with
 * `clip-path: inset()`, opening from the cell outwards. Type laid out once at
 * its final size cannot distort, because nothing ever scales it.
 *
 * The content is carried, not left behind. A tile jumped straight to full size
 * has its title wherever the full-size layout puts it, which at the moment of
 * the press is outside the clip: the title would blink out and reappear halfway
 * through. So each child is counter-translated by the distance between where it
 * sits at rest and where it sits open, eased to zero. That distance is measured
 * rather than assumed, because a centred tile moves its title to the middle of
 * the window and a top-left one does not, and guessing gets one of them wrong.
 *
 * And it is pure in `t`. The open tile and how far through the gesture it is
 * are both folded out of the list of presses, scripted and real in the same
 * list, so the recorder can seek anywhere and a live page and a take agree.
 */

import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type PressKey,
  type Pointer,
  type Surface
} from '../../shared/runtime'

export type ExpandingTilesOptions = BaseOptions & {
  /** Milliseconds the opening takes. */
  duration: number
  /** Milliseconds the closing takes. */
  closeDuration: number
  /** How far the rules overshoot the window, as a share of its size. */
  bleed: number
  /** Width of the travelling rules, in pixels. Zero draws none. */
  rule: number
  /** Colour of the travelling rules. */
  ruleColour: string
  /** How far ahead of the clip the rules run, as a share of the duration. */
  lead: number
  /**
   * Follow the opened tile's href once it has finished opening. A tile with no
   * href stays open until it is dismissed, whatever this says.
   */
  follow: boolean
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const expandingTilesDefaults: ExpandingTilesOptions = {
  duration: 620,
  closeDuration: 420,
  bleed: 0.04,
  rule: 1,
  ruleColour: 'rgba(54, 54, 48, 0.28)',
  lead: 0.18,
  follow: true,
  reducedMotionTime: 0
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/*
 * Out, not in-out, and this is a press rather than an ambient loop.
 *
 * An in-out curve spends the first third of its duration barely moving, which
 * on a loop is elegant and after a click is lag: the reader has already pressed,
 * and anything that does not answer at once reads as the page being slow rather
 * than as the animation being gentle. Starting at full speed and arriving slowly
 * answers immediately and still lands softly, and the landing is the part the
 * eye reads as quality.
 */
const easeOutQuint = (k: number) => 1 - Math.pow(1 - k, 5)

type Phase = { index: number; at: number; opening: boolean }
type Box = { left: number; top: number; right: number; bottom: number }
type Shift = { x: number; y: number }

class ExpandingTilesSurface implements Surface<ExpandingTilesOptions> {
  private host: HTMLElement | null = null
  private tiles: HTMLElement[] = []
  private cells: Box[] = []
  /* Where each tile's children sit while the grid is at rest. */
  private atRest: Shift[][] = []
  /*
   * Where they sit once the tile fills the window, measured the first time a
   * tile is opened at a given window size and kept. Keyed by index and size, so
   * it is a function of the layout rather than of what happened before: the
   * recorder can seek straight into the middle of a gesture and get the same
   * numbers as a page that played it from the start.
   */
  private whenOpen = new Map<string, Shift[]>()

  private rules: HTMLElement[] = []
  private layer: HTMLElement | null = null
  /*
   * Stands in for the opened tile while it is out of flow.
   *
   * An opened tile is fixed to the window, which takes it out of the grid, and a
   * grid with one fewer item re-places every item after it: the tiles behind the
   * one you pressed shuffle up a cell and the grid's own background shows
   * through the hole. Sized in pixels from the cell we already measured, so it
   * holds the slot whatever the tracks are written in.
   */
  private placeholder: HTMLElement | null = null
  private lifted = -1

  /* Real presses, in the same list as the scripted ones. See phase(). */
  private live: PressKey[] = []
  /* The last time render was handed, so a real press can be stamped with it. */
  private now = 0
  /* What was applied last, so a still grid writes nothing at all. */
  private applied = ''
  /* Whether anything is open, for the Escape handler. */
  private openNow = false
  /* The tile already followed, so a completed open navigates exactly once. */
  private followed = -1
  private restoreFocus: HTMLElement | null = null

  private onPress = (event: PointerEvent) => {
    const host = this.host
    if (!host) return
    const box = host.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) return
    /*
     * Normalised to the element, which is the space `pressPath` is written in. A
     * scripted press and a real one are then literally the same value and the
     * fold below cannot tell them apart, which is the point.
     */
    const x = (event.clientX - box.left) / box.width
    const y = (event.clientY - box.top) / box.height
    this.live.push({ t: this.now, x, y })

    /*
     * The tile is usually a link, and the whole gesture exists so it can be seen
     * to open before the page changes. The effect follows the href itself, once
     * the opening has finished, so the browser must not do it now.
     */
    if (this.hit(x, y) >= 0) event.preventDefault()
  }

  private onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.openNow) return
    // Dismissing is a press that hits nothing, which the fold reads as a close.
    this.live.push({ t: this.now, x: -1, y: -1 })
  }

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.addEventListener('pointerdown', this.onPress)
    document.addEventListener('keydown', this.onKey)
  }

  private build(): void {
    const host = this.host
    if (!host || this.tiles.length > 0) return
    this.tiles = [...host.children].filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node !== this.placeholder
    )
    for (const tile of this.tiles) {
      tile.style.willChange = 'clip-path'
      if (!tile.hasAttribute('aria-expanded')) tile.setAttribute('aria-expanded', 'false')
    }

    /*
     * One layer for the four travelling rules, built once and reused. It is
     * additive rather than a replacement: the author's own cell borders are
     * untouched and show through whenever nothing is open.
     */
    const layer = document.createElement('div')
    layer.setAttribute('aria-hidden', 'true')
    layer.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:2147483646;display:none'
    for (let i = 0; i < 4; i++) {
      const rule = document.createElement('div')
      layer.append(rule)
      this.rules.push(rule)
    }
    document.body.append(layer)
    this.layer = layer
  }

  /** Which tile covers a point given in the element's own 0 to 1 space. */
  private hit(x: number, y: number): number {
    const host = this.host
    if (!host || x < 0 || x > 1 || y < 0 || y > 1) return -1
    const box = host.getBoundingClientRect()
    const px = box.left + x * box.width
    const py = box.top + y * box.height
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i]!
      if (px >= c.left && px <= c.right && py >= c.top && py <= c.bottom) return i
    }
    return -1
  }

  resize(): void {
    const host = this.host
    if (!host) return
    this.build()
    /*
     * Not mid-gesture. An open tile is fixed to the window and would report the
     * window as its cell, which would be remembered as the grid once it closed.
     * The sizes are re-read on the next rest, and the open-position cache is
     * keyed by window size, so dropping it here is enough.
     */
    if (this.lifted >= 0) {
      this.whenOpen.clear()
      return
    }
    /*
     * Measured while nothing is open, because an open tile is fixed to the
     * window and no longer reports where its cell was. This is also the only
     * place layout is read: the gesture itself never does.
     */
    this.cells = this.tiles.map(tile => {
      const r = tile.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    })
    this.atRest = this.tiles.map(tile =>
      [...tile.children]
        .filter((n): n is HTMLElement => n instanceof HTMLElement)
        .map(child => {
          const r = child.getBoundingClientRect()
          return { x: r.left, y: r.top }
        })
    )
    this.whenOpen.clear()
  }

  /**
   * The gesture at time `t`, folded out of every press at or before it.
   *
   * Folding from scratch each frame rather than remembering is what keeps this
   * seekable: the recorder can ask for any `t` in any order and get the same
   * answer, which a remembered `isOpen` flag could never do.
   */
  private phase(t: number, opts: ExpandingTilesOptions): Phase | null {
    const scripted = opts.pressPath ?? []
    const presses = [...scripted, ...this.live]
      .filter(p => p.t <= t)
      .sort((a, b) => a.t - b.t)

    let phase: Phase | null = null
    for (const press of presses) {
      const hit = this.hit(press.x, press.y)
      if (phase && phase.opening) {
        // Anything at all closes what is open, including a press on another tile.
        phase = { index: phase.index, at: press.t, opening: false }
      } else if (hit >= 0) {
        phase = { index: hit, at: press.t, opening: true }
      }
    }
    return phase
  }

  /*
   * Take the tile out of the grid and leave something holding its cell. Both
   * happen together or the grid behind reflows for a frame, which is visible as
   * every other tile jumping at the moment of the press.
   */
  private lift(index: number, tile: HTMLElement, cell: Box): void {
    if (this.lifted === index) return
    this.drop()
    const stand = document.createElement('div')
    stand.setAttribute('aria-hidden', 'true')
    stand.style.cssText =
      `width:${(cell.right - cell.left).toFixed(2)}px;height:${(cell.bottom - cell.top).toFixed(2)}px;pointer-events:none`
    tile.before(stand)
    this.placeholder = stand
    this.lifted = index

    tile.style.position = 'fixed'
    tile.style.inset = '0'
    tile.style.margin = '0'
    tile.style.zIndex = '2147483645'
  }

  /** Put the grid back the way the page wrote it. */
  private drop(): void {
    this.placeholder?.remove()
    this.placeholder = null
    this.lifted = -1
  }

  /*
   * Where this tile's children sit once it fills the window. Measured once per
   * tile per window size, with the counter-translation off so the reading is of
   * the layout rather than of the last frame.
   */
  private openShifts(index: number, tile: HTMLElement, vw: number, vh: number): Shift[] {
    const key = `${index}|${vw}x${vh}`
    const had = this.whenOpen.get(key)
    if (had) return had
    const kids = [...tile.children].filter((n): n is HTMLElement => n instanceof HTMLElement)
    for (const child of kids) child.style.transform = ''
    const shifts = kids.map(child => {
      const r = child.getBoundingClientRect()
      return { x: r.left, y: r.top }
    })
    this.whenOpen.set(key, shifts)
    return shifts
  }

  render(t: number, opts: ExpandingTilesOptions, _pointer: Pointer): void {
    this.now = t
    const host = this.host
    if (!host) return
    this.build()
    if (this.cells.length !== this.tiles.length) this.resize()

    const phase = this.phase(t, opts)
    if (!phase) {
      this.rest()
      return
    }

    const span = Math.max(phase.opening ? opts.duration : opts.closeDuration, 1) / 1000
    const raw = clamp01((t - phase.at) / span)
    if (!phase.opening && raw >= 1) {
      // Fully closed. Nothing of the gesture is left to draw.
      this.rest()
      return
    }

    const cell = this.cells[phase.index]
    const tile = this.tiles[phase.index]
    if (!cell || !tile) {
      this.rest()
      return
    }

    const vw = window.innerWidth
    const vh = window.innerHeight
    /*
     * One curve, read forwards to open and subtracted to close, so the dismiss
     * answers its press as immediately as the open answered its own. Easing the
     * reversed progress instead would make closing start slowly, which is the
     * one moment the reader has already decided they are done.
     */
    const eased = easeOutQuint(raw)
    const p = phase.opening ? eased : 1 - eased

    const state = `${phase.index}|${p.toFixed(4)}|${vw}x${vh}`
    if (state === this.applied) return
    this.applied = state
    this.openNow = true

    if (!this.restoreFocus && document.activeElement instanceof HTMLElement) {
      this.restoreFocus = document.activeElement
    }

    for (let i = 0; i < this.tiles.length; i++) {
      if (i === phase.index) continue
      // The rest of the grid is out of the way while one of them owns the window.
      const other = this.tiles[i]!
      other.style.pointerEvents = 'none'
      other.setAttribute('aria-expanded', 'false')
    }

    /*
     * The tile is already the size of the window; `p` only says how much of it
     * is uncovered. Nothing here scales, so the type cannot distort.
     */
    this.lift(phase.index, tile, cell)
    tile.setAttribute('aria-expanded', 'true')

    const inset: Box = {
      left: cell.left * (1 - p),
      top: cell.top * (1 - p),
      right: (vw - cell.right) * (1 - p),
      bottom: (vh - cell.bottom) * (1 - p)
    }
    tile.style.clipPath =
      `inset(${inset.top.toFixed(2)}px ${inset.right.toFixed(2)}px ` +
      `${inset.bottom.toFixed(2)}px ${inset.left.toFixed(2)}px)`

    // Carry the content, by the measured distance rather than a guessed one.
    const open = this.openShifts(phase.index, tile, vw, vh)
    const rest = this.atRest[phase.index] ?? []
    const kids = [...tile.children].filter((n): n is HTMLElement => n instanceof HTMLElement)
    for (let i = 0; i < kids.length; i++) {
      const from = rest[i]
      const to = open[i]
      if (!from || !to) continue
      const dx = (from.x - to.x) * (1 - p)
      const dy = (from.y - to.y) * (1 - p)
      kids[i]!.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`
    }

    this.drawRules(opts, cell, p, vw, vh)

    if (phase.opening && raw >= 1 && opts.follow && this.followed !== phase.index) {
      const href = tile.getAttribute('href')
      if (href) {
        this.followed = phase.index
        window.location.assign(href)
      }
    }
  }

  /*
   * The four rules that bounded the cell, travelling out to the edges. They lead
   * the clip slightly, because an edge that arrives with the thing it bounds
   * reads as a border rather than as a movement.
   */
  private drawRules(
    opts: ExpandingTilesOptions,
    cell: Box,
    p: number,
    vw: number,
    vh: number
  ): void {
    const layer = this.layer
    if (!layer) return
    if (opts.rule <= 0) {
      layer.style.display = 'none'
      return
    }
    layer.style.display = 'block'

    /*
     * The rules run on `led` rather than on `p`, which is what puts them ahead
     * of the clip. Clamped, so leading does not overshoot the window edge and
     * come back.
     */
    const led = clamp01(p * (1 + opts.lead))
    const overX = vw * opts.bleed * led
    const overY = vh * opts.bleed * led
    const w = opts.rule
    // Each rule travels from its cell edge to the window edge.
    const top = cell.top * (1 - led)
    const bottom = (vh - cell.bottom) * (1 - led)
    const left = cell.left * (1 - led)
    const right = (vw - cell.right) * (1 - led)
    const geometry = [
      `left:${-overX}px;right:${-overX}px;top:${top.toFixed(2)}px;height:${w}px`,
      `left:${-overX}px;right:${-overX}px;bottom:${bottom.toFixed(2)}px;height:${w}px`,
      `top:${-overY}px;bottom:${-overY}px;left:${left.toFixed(2)}px;width:${w}px`,
      `top:${-overY}px;bottom:${-overY}px;right:${right.toFixed(2)}px;width:${w}px`
    ]
    for (let i = 0; i < 4; i++) {
      this.rules[i]!.style.cssText =
        `position:absolute;background:${opts.ruleColour};${geometry[i]}`
    }
  }

  /** Everything back where the page put it. */
  private rest(): void {
    this.openNow = false
    if (this.applied === '') return
    this.applied = ''
    this.followed = -1
    this.drop()
    for (const tile of this.tiles) {
      tile.style.position = ''
      tile.style.inset = ''
      tile.style.margin = ''
      tile.style.zIndex = ''
      tile.style.clipPath = ''
      tile.style.pointerEvents = ''
      tile.setAttribute('aria-expanded', 'false')
      for (const child of tile.children) {
        if (child instanceof HTMLElement) child.style.transform = ''
      }
    }
    if (this.layer) this.layer.style.display = 'none'
    const back = this.restoreFocus
    this.restoreFocus = null
    // Only take focus back if it is still inside the grid we just closed.
    if (back && this.host?.contains(document.activeElement)) back.focus()
  }

  teardown(): void {
    this.rest()
    for (const tile of this.tiles) {
      tile.style.willChange = ''
      tile.removeAttribute('aria-expanded')
    }
    this.host?.removeEventListener('pointerdown', this.onPress)
    document.removeEventListener('keydown', this.onKey)
    this.layer?.remove()
    this.layer = null
    this.rules = []
    this.tiles = []
    this.cells = []
    this.atRest = []
    this.whenOpen.clear()
    this.live = []
    this.host = null
  }
}

/**
 * Mount ExpandingTiles onto `el`. Its element children are the tiles, laid out
 * by your own CSS: the effect never positions the grid, it only opens out of it.
 *
 * ```ts
 * const grid = createExpandingTiles(document.querySelector('#tiles')!)
 * grid.start()
 * // …later
 * grid.destroy()
 * ```
 *
 * Tiles that are links open and then follow their href, which is the whole
 * gesture: the page changes behind a tile that already fills the window. A tile
 * with no href stays open until it is dismissed with Escape or another press.
 */
export function createExpandingTiles(
  el: HTMLElement,
  opts: Partial<ExpandingTilesOptions> = {}
): EffectHandle {
  return mount<ExpandingTilesOptions>(el, opts, {
    defaults: expandingTilesDefaults,
    kind: 'dom',
    create: () => new ExpandingTilesSurface()
  })
}

export default createExpandingTiles
```

## 2. What it is

ExpandingTiles is a grid of tiles where the one you press opens out to fill the
window, and the four rules that bounded its cell travel out to the edges of the
page with it. The grid you were looking at becomes the frame around what you
opened.

Three things carry it, and the first two are what every other version of this
gets wrong.

**Nothing is scaled.** The obvious way to grow a box is a transform, and a
transform takes the type with it: the title stretches as the tile grows and
settles back as it lands, which reads as cheap however well it is eased. Here
the tile is put at its final size immediately and revealed with
`clip-path: inset()`, opening from the cell outwards. Type laid out once at its
final size cannot distort, because nothing ever scales it.

**The content is carried, not left behind.** A tile jumped straight to full size
has its title wherever the full-size layout puts it, which at the moment of the
press is outside the clip: the title would blink out and reappear halfway
through. So each child is counter-translated by the distance between where it
sits at rest and where it sits open, eased to zero.

That distance is measured rather than assumed. A centred tile moves its title to
the middle of the window and a top-left one does not, and a guessed offset gets
one of the two wrong. It is measured once per tile per window size, never during
the gesture.

**The rules lead the clip.** An edge that arrives at the same moment as the
thing it bounds reads as a border. An edge that gets there first reads as the
lines pulling the tile open behind them. That is what `lead` is for, and it is
most of the difference between this looking designed and looking generated.

## 3. Wire it in

**Plain HTML.** The element's children are the tiles. Lay the grid out yourself:
the effect reads where the cells are and never positions them.

```html
<div id="tiles" class="grid">
  <a class="tile" href="/letterpress"><span>Letterpress</span></a>
  <a class="tile" href="/lithography"><span>Lithography</span></a>
  <a class="tile" href="/screen-print"><span>Screen print</span></a>
  <a class="tile" href="/risograph"><span>Risograph</span></a>
</div>

<script type="module">
  import { createExpandingTiles } from './beamish/effects/expanding-tiles/core.js'

  const grid = createExpandingTiles(document.querySelector('#tiles'))
  grid.start()
</script>
```

The tiles are your own markup and are never replaced. `destroy()` puts every
property back, including the element's own `position`.

**React.** The tiles are the children.

```tsx
import { useEffect, useRef } from 'react'
import { createExpandingTiles } from '@/beamish/effects/expanding-tiles/core'

export function Tiles({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const grid = createExpandingTiles(host.current, { lead: 0.22 })
    grid.start()
    return () => grid.destroy()
  }, [children])

  return <div ref={host} className="grid">{children}</div>
}
```

The dependency on `children` is deliberate: a different set of tiles is a
different grid and the cells have to be measured again.

**Vue.** The tiles come in through the default slot.

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createExpandingTiles } from '@/beamish/effects/expanding-tiles/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let grid: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  grid = createExpandingTiles(host.value)
  grid.start()
})

onBeforeUnmount(() => grid?.destroy())
</script>

<template>
  <div ref="host" class="grid"><slot /></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `duration` | number | `620` | 120 to 2000 ms (looks right between 480 and 900) | Milliseconds the opening takes. This is a navigation rather than a flourish, so it wants to be short enough that it never stands between the press and the page: past about a second it stops reading as a transition and starts reading as a wait. |
| `closeDuration` | number | `420` | 100 to 2000 ms | Milliseconds the closing takes. Shorter than the opening on purpose: opening is the thing you asked for and is worth watching, closing is getting out of the way and should not be. |
| `bleed` | number | `0.04` | 0 to 0.3 | How far the rules run past the window, as a share of its size. A rule that stops exactly at the edge looks like it was measured to fit; one that runs off reads as a line that carries on past the page. |
| `rule` | number | `1` | 0 to 6 px | Width of the travelling rules. At 0 none are drawn and the tile simply opens, which is the quieter version and the right one if your grid has no visible lines of its own. |
| `ruleColour` | color | `rgba(54, 54, 48, 0.28)` | any CSS hex | Colour of the travelling rules. Match whatever your grid already draws between the cells, because the whole idea is that these are those lines moving. |
| `lead` | number | `0.18` | 0 to 1 | How far ahead of the clip the rules run, as a share of the duration. At 0 the rules arrive with the edge they bound and read as a border; a little ahead and they read as the lines pulling the tile open behind them. |
| `follow` | boolean | `true` | `true` · `false` | Follow the opened tile's href once it has finished opening. Turn it off to use the gesture as a disclosure, where the tile opens over the grid and closes back. A tile with no href stays open whatever this says. |

## 5. Accessibility. Do not skip this

Every tile stays in the accessibility tree and in the tab order, and because
they are links they work without the effect at all. That is the right fallback:
with JavaScript off, pressing a tile goes to its page with no animation.

`aria-expanded` is maintained on each tile. The rules layer is `aria-hidden`,
because it is decoration.

Escape closes an open tile. If you set `follow: false` and the tiles hold
interactive content, give the tiles behind the open one `inert`: they are
pointer-blocked while one is open but still reachable by keyboard, and that is
yours to decide rather than something a visual effect should impose.

## 6. Cleanup and SSR

`destroy()` restores every property it set on the tiles and their children,
removes the rules layer from the body, and drops both listeners. There is no GPU
resource to release and no DOM to rebuild.

All the tiles render on the server, laid out by your own CSS, which means the
grid is complete and navigable before the first frame. Nothing is hidden waiting
for JavaScript, so a page with this on it degrades to a plain grid of links.

## 7. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is 0: the grid at rest, with nothing open.

Because the tiles are ordinary links, that is not a loss of function. A press
goes straight to the page without the opening, which is exactly what someone who
asked for less motion wants.

## 8. The three mistakes most likely to be made here

1. **Growing the tile with a transform.** The type stretches and settles, and no
   amount of easing hides it. Put the tile at its final size and clip it.

2. **Forgetting to carry the content.** The title jumps to where the full-size
   layout puts it, which is outside the clip at the start, so it blinks out on
   press and reappears halfway through.

3. **Guessing the carry distance.** A centred tile and a top-left tile move
   their content to different places. Measure it, once per size.

4. **Rules that arrive with the edge.** They read as a border instead of as a
   movement. Let them lead.

5. **Opening into an empty page.** The gesture promises something the size of a
   window. If there is nothing there, it reads as broken.

6. **Making the tiles divs.** Then you have built a modal, you own focus
   management and the back button, and the gesture no longer means anything. Use
   links.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
