You are adding **EmbossedText** from Beamish to this project.

> Type pressed into paper rather than extruded off it, with the impression biting unevenly across the line. Type · effect · MIT.
> https://beamish.ink/effects/embossed-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. Two text shadows and a colour per character, and getting those right is the whole job
- It presses in rather than standing out. The effect this is a recast of extrudes letters towards the viewer with a stack of shadows going down and to the right, which is a sign or a plastic badge. Letterpress leaves the type below the surface: the paper is deformed and what you read is light on the walls of the impression
- The dark edge goes on the side the light comes from, because that wall of the impression is turned away from it, and the light edge goes opposite. Reversed, the letter stands up off the page, and that is the most common way this gets written
- The impression is uneven across the line. Getting a forme to print evenly is a job with a name, makeready, and before it is done some letters bite harder than others. That unevenness is the difference between a press and a filter
- Ink is optional, and a blind emboss with none at all is the best thing here: the letter face is the same paper as the page and the impression is the only thing to read. It needs the `paper` option to match the actual page colour, because the letter face really is painted that colour
- The whole line presses at once, because a platen is one surface coming down. The variation is in how hard each letter bites, not in when
- The press overshoots and settles, since paper is compressed past where it ends up and pushes some of it back. The curve is divided by its own value at 1 so it finishes at exactly 1 whatever the spring is: without that the last frame of a recording does not match the resting state
- Depth and softness are in ems, so an impression looks the same at every size
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

**`src/beamish/effects/embossed-text/core.ts`**

```ts
/*
 * EmbossedText: Beamish
 * https://beamish.ink/effects/embossed-text
 *
 * Type pressed into paper. A platen comes down, the sheet takes the impression,
 * and the paper springs back a little.
 *
 * The version of this that goes around is called depth text and it extrudes the
 * letters towards the viewer in fake 3D, with a stack of shadows going down and
 * to the right. That is a sign, or a plastic badge. Letterpress goes the other
 * way: the type is below the surface afterwards, the paper is deformed, and what
 * you can see is the light catching the walls of the impression.
 *
 * Which means the whole thing is two shadows and a colour, and getting them
 * right is the entire job:
 *
 *   A dark edge on the side the light comes from, because that wall of the
 *   impression faces away from it. A light edge opposite. Everybody writing a
 *   debossed text shadow gets these the wrong way round at least once, and the
 *   result is a letter standing up off the page.
 *
 *   The impression is uneven across the line. Getting a forme to print evenly is
 *   a job with a name, makeready, and before it is done some letters bite harder
 *   than others. That unevenness is the difference between a press and a filter.
 *
 *   Ink is optional. A blind emboss has no ink at all: the letter face is the
 *   same paper as the page, and all you are reading is the impression. It is the
 *   best thing this effect does and it is one setting.
 *
 * The whole line presses at once, because a platen is one surface coming down.
 * The variation is in how hard each letter bites, not in when.
 *
 * It is pure in `t`. The press is an eased function of the clock and the
 * unevenness is a hash of each letter's index.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type EmbossedTextOptions = BaseOptions & {
  /** The sheet. The letter face is this colour when no ink has transferred. */
  paper: string
  /** The ink on the type. */
  ink: string
  /** How much ink transferred, 0 to 1. 0 is a blind emboss. */
  transfer: number
  /** How deep the impression is, in ems. */
  depth: number
  /** Where the light comes from, in degrees. 0 is from the right. */
  light: number
  /** Softness of the walls of the impression, in ems. */
  softness: number
  /** Milliseconds for the platen to come down. */
  press: number
  /** Milliseconds before it does. */
  hold: number
  /** How much the paper springs back, 0 to 1. */
  spring: number
  /** How uneven the impression is across the line, 0 to 1. */
  makeready: number
  /** Seed for the unevenness. The same seed gives the same forme. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const embossedTextDefaults: EmbossedTextOptions = {
  paper: '#fbfaf4',
  ink: '#2b2b24',
  transfer: 0,
  depth: 0.045,
  light: 125,
  softness: 0.012,
  press: 620,
  hold: 240,
  spring: 0.35,
  makeready: 0.45,
  seed: 7,
  reducedMotionTime: 999
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

function rgb(value: string): [number, number, number] {
  const hex = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ]
  }
  const nums = value.match(/[\d.]+/g)
  if (nums && nums.length >= 3) return [Number(nums[0]), Number(nums[1]), Number(nums[2])]
  return [0, 0, 0]
}

/*
 * The press. It overshoots and settles, because paper is not clay: it is
 * compressed past where it ends up and pushes some of that back. A plain
 * ease-out arrives and stops, which reads as a letter fading in rather than as
 * a sheet being struck.
 *
 * Two curves blended by `spring`, rather than one curve with a parameter in it.
 * The settled one is a plain exponential approach and the sprung one is a damped
 * oscillation whose first overshoot lands around 45% of the way through. Both
 * start at exactly 0, and the blend is divided by its own value at 1 so the
 * press finishes at exactly 1 whatever the spring is: without that the end of
 * the animation is a hundredth short, which is invisible on screen and shows up
 * as the last frame of a recording not matching the resting state.
 */
function platen(x: number, spring: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const curve = (u: number) =>
    (1 - Math.exp(-5.5 * u)) * (1 - spring) + (1 - Math.exp(-4 * u) * Math.cos(6.9 * u)) * spring
  return curve(x) / curve(1)
}

class EmbossedTextSurface implements Surface<EmbossedTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private cells: HTMLElement[] = []
  private built = false

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  private build(): void {
    const host = this.host
    if (!host || this.built) return

    host.textContent = ''
    this.cells = []

    // The text a screen reader gets: one string, unchanged, out of sight.
    const label = document.createElement('span')
    label.textContent = this.original
    label.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'

    const visual = document.createElement('span')
    visual.setAttribute('aria-hidden', 'true')

    const words = this.original.split(' ')
    words.forEach((word, index) => {
      // Words stay whole so the text still wraps where it would have wrapped.
      const wrapper = document.createElement('span')
      wrapper.style.display = 'inline-block'
      wrapper.style.whiteSpace = 'nowrap'
      for (const character of Array.from(word)) {
        const cell = document.createElement('span')
        cell.textContent = character
        cell.style.display = 'inline-block'
        wrapper.append(cell)
        this.cells.push(cell)
      }
      visual.append(wrapper)
      if (index < words.length - 1) visual.append(document.createTextNode(' '))
    })

    host.append(label, visual)
    this.built = true
  }

  resize(): void {}

  render(t: number, opts: EmbossedTextOptions): void {
    this.build()
    if (this.cells.length === 0) return

    const press = Math.max(opts.press, 1) / 1000
    const hold = Math.max(opts.hold, 0) / 1000
    const pressed = platen((t - hold) / press, clamp01(opts.spring))

    /*
     * Which way the walls face. The dark edge goes on the side the light comes
     * from, because that wall of the impression is turned away from it, and the
     * light edge goes opposite. Reverse these two and the letter stands up off
     * the page instead, which is the single most common way this is written.
     */
    const a = (opts.light * Math.PI) / 180
    const dx = Math.cos(a)
    const dy = -Math.sin(a)

    const paper = rgb(opts.paper)
    const ink = rgb(opts.ink)
    const transfer = clamp01(opts.transfer) * pressed
    const face = `rgb(${paper
      .map((channel, i) => Math.round(channel + (ink[i]! - channel) * transfer))
      .join(',')})`

    const blur = Math.max(opts.softness, 0)

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]!

      /*
       * Makeready. Before a forme is made ready some letters bite harder than
       * others, and that unevenness is the difference between a press and a
       * filter. Fixed per letter, so the same line always presses the same way.
       */
      const bite = 1 - hash2(i + 1, opts.seed) * clamp01(opts.makeready) * 0.7
      const depth = opts.depth * pressed * bite

      const shadow =
        `${(dx * depth).toFixed(4)}em ${(dy * depth).toFixed(4)}em ${blur.toFixed(4)}em rgba(0,0,0,0.42), ` +
        `${(-dx * depth).toFixed(4)}em ${(-dy * depth).toFixed(4)}em ${blur.toFixed(4)}em rgba(255,255,255,0.72)`

      if (cell.style.textShadow !== shadow) cell.style.textShadow = shadow
      if (cell.style.color !== face) cell.style.color = face
    }
  }

  teardown(): void {
    if (this.host && this.original) this.host.textContent = this.original
    this.cells = []
    this.built = false
    this.host = null
  }
}

/**
 * Mount EmbossedText into `el`. The element must already contain the text.
 *
 * ```ts
 * const pressed = createEmbossedText(document.querySelector('h1')!)
 * pressed.start()
 * // …later
 * pressed.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left exactly as it
 * was found.
 */
export function createEmbossedText(
  el: HTMLElement,
  opts: Partial<EmbossedTextOptions> = {}
): EffectHandle {
  return mount<EmbossedTextOptions>(el, opts, {
    defaults: embossedTextDefaults,
    kind: 'dom',
    create: () => new EmbossedTextSurface()
  })
}

export default createEmbossedText
```

## 2. What it is

EmbossedText presses type into paper. A platen comes down, the sheet takes the
impression, and the paper springs back a little.

The effect this is a recast of is called depth text, and it extrudes the letters
towards the viewer in fake 3D with a stack of shadows going down and to the
right. That is a sign, or a plastic badge. Letterpress goes the other way: the
type ends up below the surface, the paper is deformed, and what you read is
light catching the walls of the impression.

So the whole thing is two shadows and a colour, and getting those right is the
entire job.

**A dark edge on the side the light comes from**, because that wall of the
impression is turned away from it, and a light edge opposite. Reverse the two
and the letter stands up off the page instead. Everybody writing a debossed text
shadow does this at least once.

**The impression bites unevenly across the line.** Getting a forme to print
evenly is a job with a name, makeready, and before it is done some letters bite
harder than others. That unevenness is the difference between a press and a CSS
filter, and at `makeready: 0` the two are indistinguishable.

**Ink is optional.** A blind emboss has none at all: the letter face is the same
paper as the page, and the impression is the only thing to read. It is the best
thing this effect does and it is one setting.

The whole line presses at once, because a platen is one surface coming down. The
variation is in how hard each letter bites, not in when.

## 3. Wire it in

**Plain HTML.** The text must already be in the element.

```html
<h1 id="masthead">Pressed into the sheet</h1>

<script type="module">
  import { createEmbossedText } from './beamish/effects/embossed-text/core.js'

  const pressed = createEmbossedText(document.querySelector('#masthead'), {
    paper: '#fbfaf4'
  })
  pressed.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createEmbossedText } from '@/beamish/effects/embossed-text/core'

export function Masthead({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pressed = createEmbossedText(host.current, { paper: '#fbfaf4' })
    pressed.start()
    return () => pressed.destroy()
  }, [children])

  return <h1 ref={host}>{children}</h1>
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createEmbossedText } from '@/beamish/effects/embossed-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pressed: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pressed = createEmbossedText(host.value, { paper: '#fbfaf4' })
  pressed.start()
})

onBeforeUnmount(() => pressed?.destroy())
</script>

<template>
  <h1 ref="host">Pressed into the sheet</h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Pulling it again.**

```ts
pressed.stop()
pressed.renderAtTime(0)
pressed.start()
```

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The sheet. This is not decoration: with no ink the letter face is painted this colour, so it has to match the page the text is actually sitting on, or the heading appears as a block of slightly wrong white and looks like a bug rather than a setting. The default is the house paper. If the page behind the text is a gradient or an image, a blind emboss cannot work at all: put ink on the type instead. |
| `ink` | color | `#2b2b24` | any CSS hex | The ink on the type, for when there is any. Letterpress ink sits in the bottom of the impression and reads darker than the same colour printed flat, so a softer black than you would normally pick is usually right. |
| `transfer` | number | `0` | 0 to 1 | How much ink transferred. 0 is a blind emboss, with no ink at all, and it is the setting worth trying first: it is the one thing this does that nothing else in the library does. Anything between is a light pull, which is a real thing and reads as one. |
| `depth` | number | `0.045` | 0 to 0.2 em (looks right between 0.03 and 0.08) | How deep the impression is, in ems, so it holds at any size. Small. A heavy impression is fashionable and it is also what a printer means by punching through the sheet; past about 0.1 this stops being a press and starts being a stamp. |
| `light` | number | `125` | 0 to 360 deg | Where the light comes from, with 0 to the right. Up and to the left is what nearly every photograph of printed matter uses, and it is what the eye reads as recessed rather than raised. Turn it 180 degrees and the same shadows read as embossing instead. |
| `softness` | number | `0.012` | 0 to 0.1 em | How soft the walls of the impression are. At 0 the edges are hard, which is a die cut rather than a press: paper compresses, so the wall of a real impression is a curve. |
| `press` | number | `620` | 60 to 3000 ms | Milliseconds for the platen to come down. A press is quick and heavy. Slow it far past a second and it reads as the letters fading in, which is the thing this is trying not to be. |
| `hold` | number | `240` | 0 to 4000 ms | Milliseconds before the press comes down. Also how you stagger two of these on one page. |
| `spring` | number | `0.35` | 0 to 1 | How much the paper pushes back. Paper is not clay: it compresses past where it ends up and returns some of that. At 0 the press arrives and stops, which reads as a fade rather than as a strike. |
| `makeready` | number | `0.45` | 0 to 1 | How uneven the impression is across the line. At 0 every letter bites identically, which is a forme that has been made ready properly and, on a screen, is indistinguishable from a CSS filter. The unevenness is the whole tell that something was pressed. |
| `seed` | number | `7` | 0 to 9999 | Seed for the unevenness. The same seed always gives the same forme, so a recorded video and a live page match letter for letter. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot press this should be a time after it has finished, so the text appears already pressed. That still frame is the whole effect with its one moving part stopped, which costs the viewer nothing here. |

## 5. Accessibility. Do not skip this

The characters are marked `aria-hidden` and a visually hidden copy of the
original string sits alongside them, so a screen reader reads the sentence.

A blind emboss has almost no contrast by design, which means it fails WCAG 1.4.3
as body copy and should only ever be decorative or a heading that is repeated in
accessible text nearby. That is not a flaw in the implementation, it is what the
print technique is: a blind emboss is for texture, and a reader who needs
contrast needs ink.

## 6. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives, though it will be the `paper` colour on the first
frame only once the effect has mounted. For a blind emboss above the fold, set
the heading's own `color` to the paper colour in CSS as well, so there is no
flash of dark text.

Call `createEmbossedText` from `useEffect`, `onMounted`, or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. For this item the still frame is the finished impression,
which costs the viewer nothing.

## 7. The three mistakes most likely to be made here

1. **The shadows the wrong way round.** The dark edge goes on the side the light
   comes from. The other way is embossing, which stands proud of the sheet, and
   the two look nothing alike once you have seen both.

2. **`paper` left at the default on a white page.** The letters become a block
   of cream on white. It has to be the page colour.

3. **`makeready: 0`.** Every letter bites identically and the result is
   indistinguishable from a static CSS filter. The unevenness is the tell.

4. **Using it at body size.** The impression is sub-pixel and disappears. It is
   a heading effect.

5. **A deep impression because it looks impressive.** Past about 0.1em it is no
   longer a press, it is a stamp, and a printer would tell you it is punching
   through the sheet.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
