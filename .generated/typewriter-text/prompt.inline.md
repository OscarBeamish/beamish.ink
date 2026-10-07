You are adding **TypewriterText** from Beamish to this project.

> Text typed on a machine with type bars: an uneven hand, a breath at the punctuation, and every letter struck a little off square. Type · effect · MIT.
> https://beamish.ink/effects/typewriter-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. The string is already in the element and the untyped part is hidden rather than absent, so the line boxes are final from the first frame and a paragraph typing itself in the middle of a page does not push the page about
- The rhythm is uneven. Each character takes its own interval from a hash, spread around the mean rather than added to it, so raising the unevenness does not also slow the whole thing down
- It takes a breath at the punctuation: a full stop costs the full pause, a comma a third of it, a space an eighth. That pause is most of what makes typing sound like language rather than like a machine gun, and it is the one thing an even timer can never give you
- Every letter is struck rather than placed. It lands a fraction off the baseline, a fraction off square, and with more or less ink depending on how it was hit. All three come off one hash of the letter's index, so the same string always types the same way and the recorder gets the same frames
- The caret is solid while typing and blinks once it stops, which is what a caret does. The blink runs on its own clock rather than on the typing one, so it does not stutter when the rhythm does
- One caret element for the whole string, moved to the cell the next character will land in. A caret per character is 2N elements for something only one of them is ever doing
- The schedule is built from the text rather than from the clock, so seeking to the middle of a run costs one scan and the effect is pure in t
- The original string stays in the accessibility tree as one label. The alternative is a label that grows a character at a time, which is a live region nobody asked for
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

**`src/beamish/effects/typewriter-text/core.ts`**

```ts
/*
 * TypewriterText: Beamish
 * https://beamish.ink/effects/typewriter-text
 *
 * Text typed one character at a time, on a machine with type bars rather than a
 * cursor that reveals a string.
 *
 * The usual implementation animates the width of a box, or appends to a string
 * on a timer, and both have the same two problems. The rhythm is perfectly even,
 * which no typist has ever managed, and every letter lands in exactly the right
 * place, which no typewriter has ever managed either. What you get is a progress
 * bar made of letters.
 *
 * So four things here, and all four are cheap:
 *
 *   The rhythm is uneven. Each character gets its own interval from a hash, so
 *   the hand has a texture to it, and the intervals are a fixed schedule rather
 *   than a running timer.
 *
 *   It slows at punctuation. A typist pauses after a full stop and a comma, and
 *   that pause is most of what makes typing sound like language rather than like
 *   a machine gun.
 *
 *   Each letter is struck rather than placed. A type bar lands a fraction off
 *   the baseline and a fraction off square, and the ribbon gives it more or less
 *   ink depending on how hard it was hit. All three come off the same hash, so
 *   they are fixed for a given letter in a given string.
 *
 *   The caret is solid while typing and blinks when it stops, which is what a
 *   caret does, and the blink is on its own clock rather than on the typing one.
 *
 * Nothing reflows. The whole string is in the element from the start and the
 * untyped part is hidden rather than absent, so a paragraph typing itself in the
 * middle of a page does not push the page about. The letters are invisible, so
 * it looks the same either way, and the layout is the layout it will end at.
 *
 * It is pure in `t`. How many characters have landed is a lookup against a
 * schedule, and every per-letter offset is a hash of its index.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type TypewriterTextOptions = BaseOptions & {
  /** Average milliseconds between one character and the next. */
  pace: number
  /** How uneven the rhythm is, 0 to 1. 0 is a machine. */
  rhythm: number
  /** Extra milliseconds after a full stop. Commas get a third of it. */
  pause: number
  /** Milliseconds before the first character. */
  hold: number
  /** How far a letter lands off the baseline, in ems. */
  jitter: number
  /** How far off square a letter lands, in degrees. */
  skew: number
  /** How much the ribbon varies, 0 to 1. The ink each strike leaves. */
  ribbon: number
  /** Width of the caret in ems. 0 for no caret. */
  caret: number
  /** Milliseconds for one blink of the caret once typing has stopped. */
  blink: number
  /** Seed for the rhythm and the strikes. The same seed gives the same hand. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const typewriterTextDefaults: TypewriterTextOptions = {
  pace: 62,
  rhythm: 0.6,
  pause: 420,
  hold: 300,
  jitter: 0.035,
  skew: 1.1,
  ribbon: 0.35,
  caret: 0.09,
  blink: 1060,
  seed: 7,
  reducedMotionTime: 999
}

/*
 * A hash rather than a generator, for the same reason as everywhere else here:
 * it has to answer what letter 12 looks like without having drawn letters 0 to
 * 11 first.
 */
function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

/* Where a typist takes a breath. */
function restAfter(character: string): number {
  if (character === '.' || character === '!' || character === '?') return 1
  if (character === ',' || character === ';' || character === ':') return 0.34
  if (character === ' ') return 0.12
  return 0
}

class TypewriterTextSurface implements Surface<TypewriterTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private cells: HTMLElement[] = []
  private letters: string[] = []
  /** Seconds at which each character lands. Built once, from the text. */
  private schedule: number[] = []
  private scheduleFor = ''
  private caret: HTMLElement | null = null
  private built = false
  private struck = -1

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  private build(): void {
    const host = this.host
    if (!host || this.built) return

    host.textContent = ''
    this.cells = []
    this.letters = []

    // The text a screen reader gets: one string, unchanged, out of sight. The
    // alternative is a label that grows by a character at a time, which is a
    // live region nobody asked for.
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
        // Hidden rather than absent, so the line boxes are final from the first
        // frame and nothing below moves as the text arrives.
        cell.style.visibility = 'hidden'
        wrapper.append(cell)
        this.cells.push(cell)
        this.letters.push(character)
      }
      visual.append(wrapper)
      if (index < words.length - 1) {
        const space = document.createElement('span')
        space.textContent = ' '
        space.style.visibility = 'hidden'
        visual.append(space)
        this.cells.push(space)
        this.letters.push(' ')
      }
    })

    /*
     * One caret, moved to the cell the next character will land in. One element
     * and one offset read a frame, rather than a caret element per character.
     */
    const caret = document.createElement('span')
    caret.setAttribute('aria-hidden', 'true')
    caret.style.cssText =
      'position:absolute;top:0;left:0;background:currentColor;pointer-events:none;will-change:transform,opacity'
    this.caret = caret

    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.append(label, visual, caret)
    this.built = true
  }

  /*
   * The schedule: the second each character lands. Built from the text rather
   * than from the clock, so it is the same schedule every run and seeking to
   * the middle of it costs one scan.
   */
  private plan(opts: TypewriterTextOptions): void {
    const key = `${this.original}|${opts.pace}|${opts.rhythm}|${opts.pause}|${opts.hold}|${opts.seed}`
    if (this.scheduleFor === key) return
    this.scheduleFor = key

    const pace = Math.max(opts.pace, 1) / 1000
    const rhythm = Math.max(0, Math.min(1, opts.rhythm))
    const pause = Math.max(opts.pause, 0) / 1000

    this.schedule = []
    let at = Math.max(opts.hold, 0) / 1000
    for (let i = 0; i < this.letters.length; i++) {
      // Spread around the mean rather than added to it, so raising the unevenness
      // does not also slow the whole thing down.
      const spread = 1 + (hash2(i + 1, opts.seed) - 0.5) * 2 * rhythm * 0.85
      at += pace * spread
      this.schedule.push(at)
      at += pause * restAfter(this.letters[i]!)
    }
  }

  resize(): void {}

  render(t: number, opts: TypewriterTextOptions): void {
    this.build()
    if (this.cells.length === 0) return
    this.plan(opts)

    /*
     * How many have landed. The schedule rises, so this is a scan rather than a
     * search, and the string is short enough that a binary search would be
     * ceremony.
     */
    let struck = 0
    while (struck < this.schedule.length && this.schedule[struck]! <= t) struck++

    if (struck !== this.struck) {
      /*
       * Only the letters that changed state are touched. Typing a paragraph
       * writes one style per frame rather than one per character per frame,
       * which on three hundred characters is the difference between a frame and
       * several.
       */
      const from = Math.min(Math.max(this.struck, 0), struck)
      const to = Math.max(this.struck, struck)
      for (let i = from; i < to && i < this.cells.length; i++) {
        const cell = this.cells[i]!
        if (i < struck) {
          cell.style.visibility = 'visible'
          /*
           * The strike. A type bar lands a little off the baseline and a little
           * off square, and the ribbon leaves more or less ink depending on how
           * it was hit. Three numbers off one hash, fixed for this letter in
           * this string, which is why the same text always types the same way.
           */
          const n = hash2(i + 101, opts.seed)
          const m = hash2(i + 211, opts.seed)
          const drop = (n - 0.5) * 2 * opts.jitter
          const turn = (m - 0.5) * 2 * opts.skew
          cell.style.transform = `translateY(${drop.toFixed(4)}em) rotate(${turn.toFixed(2)}deg)`
          cell.style.opacity = (1 - hash2(i + 307, opts.seed) * opts.ribbon * 0.5).toFixed(3)
        } else {
          cell.style.visibility = 'hidden'
          cell.style.transform = ''
          cell.style.opacity = ''
        }
      }
      this.struck = struck
    }

    const caret = this.caret
    if (!caret) return
    if (opts.caret <= 0) {
      caret.style.opacity = '0'
      return
    }

    /*
     * The caret sits in the cell the next character will land in, which is the
     * cell after the last one struck, or the last cell once there is no next.
     */
    const target = this.cells[Math.min(struck, this.cells.length - 1)]!
    const atEnd = struck >= this.cells.length
    const left = target.offsetLeft + (atEnd ? target.offsetWidth : 0)
    caret.style.transform = `translate(${left}px, ${target.offsetTop}px)`
    caret.style.width = `${opts.caret.toFixed(3)}em`
    caret.style.height = `${target.offsetHeight}px`

    /*
     * Solid while typing, blinking once it stops. That is what a caret does,
     * and the blink runs on its own clock rather than on the typing one, so it
     * does not stutter when the rhythm does.
     */
    const done = this.schedule.length > 0 && t > this.schedule[this.schedule.length - 1]!
    const blink = Math.max(opts.blink, 1) / 1000
    const phase = ((t / blink) % 1 + 1) % 1
    caret.style.opacity = done ? (phase < 0.5 ? '1' : '0') : '1'
  }

  teardown(): void {
    if (this.host && this.original) {
      this.host.textContent = this.original
      this.host.style.position = ''
    }
    this.cells = []
    this.letters = []
    this.schedule = []
    this.scheduleFor = ''
    this.caret = null
    this.built = false
    this.struck = -1
    this.host = null
  }
}

/**
 * Mount TypewriterText into `el`. The element must already contain the text.
 *
 * ```ts
 * const typed = createTypewriterText(document.querySelector('#intro')!)
 * typed.start()
 * // …later
 * typed.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left exactly as it
 * was found.
 */
export function createTypewriterText(
  el: HTMLElement,
  opts: Partial<TypewriterTextOptions> = {}
): EffectHandle {
  return mount<TypewriterTextOptions>(el, opts, {
    defaults: typewriterTextDefaults,
    kind: 'dom',
    create: () => new TypewriterTextSurface()
  })
}

export default createTypewriterText
```

## 2. What it is

TypewriterText types text one character at a time, on a machine with type bars
rather than a cursor that reveals a string.

The usual implementation animates the width of a box, or appends to a string on
a timer, and both have the same two faults: the rhythm is perfectly even, which
no typist has managed, and every letter lands exactly in place, which no
typewriter has managed either. The result is a progress bar made of letters.

Four things here instead, and all four are cheap.

**The rhythm is uneven.** Each character takes its own interval from a hash,
spread around the mean rather than added to it, so turning the unevenness up
does not also slow the run down.

**It takes a breath at the punctuation.** A full stop costs the full pause, a
comma a third of it, a space an eighth. This is most of what makes typing sound
like language rather than like a machine gun, and it is the one thing an even
timer can never give you.

**Each letter is struck rather than placed.** It lands a fraction off the
baseline, a fraction off square, and with more or less ink depending on how it
was hit. All three come off one hash of the letter's index, so the same string
always types the same way.

**The caret is solid while typing and blinks once it stops**, which is what a
caret does, on its own clock rather than on the typing one.

Nothing reflows. The whole string is in the element from the start and the
untyped part is hidden rather than absent, so a paragraph typing itself in the
middle of a page does not push the page about. The letters are invisible either
way, so it looks the same, and the layout is the one it will finish at.

## 3. Wire it in

**Plain HTML.** The text must already be in the element.

```html
<p id="intro">It is uneven on purpose.</p>

<script type="module">
  import { createTypewriterText } from './beamish/effects/typewriter-text/core.js'

  const typed = createTypewriterText(document.querySelector('#intro'))
  typed.start()
</script>
```

**React.** Pass the text as children. Do not build the characters in JSX: React
overwrites the DOM on the next render and the typing stops half way.

```tsx
import { useEffect, useRef } from 'react'
import { createTypewriterText } from '@/beamish/effects/typewriter-text/core'

export function Intro({ children }: { children: string }) {
  const host = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (!host.current) return
    const typed = createTypewriterText(host.current, { pace: 26 })
    typed.start()
    return () => typed.destroy()
  }, [children])

  return <p ref={host}>{children}</p>
}
```

The dependency on `children` is deliberate. If the text changes, the schedule
and the characters have to be rebuilt.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createTypewriterText } from '@/beamish/effects/typewriter-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let typed: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  typed = createTypewriterText(host.value)
  typed.start()
})

onBeforeUnmount(() => typed?.destroy())
</script>

<template>
  <p ref="host">It is uneven on purpose.</p>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Typing it again.** It runs once from `t = 0`:

```ts
typed.stop()
typed.renderAtTime(0)
typed.start()
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a scroll-triggered reveal with no extra code.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `pace` | number | `62` | 8 to 400 ms (looks right between 25 and 110) | Average milliseconds between one character and the next. It multiplies by the length of the string, so a sentence at 62ms is about four seconds and a paragraph at 62ms is a minute. Heading slow, body fast: about 90 for a line somebody is meant to watch and about 25 for copy they are meant to read. |
| `rhythm` | number | `0.6` | 0 to 1 | How uneven the hand is. At 0 it is a machine, and an even typewriter is the single thing that gives away every version of this effect. Spread around the mean rather than added to it, so this does not change how long the run takes. |
| `pause` | number | `420` | 0 to 2000 ms (looks right between 200 and 600) | Extra milliseconds after a full stop. A comma takes a third of it and a space an eighth. This is the setting that makes it read as somebody writing: at 0 the punctuation goes by at the same speed as the letters and the whole thing flattens. |
| `hold` | number | `300` | 0 to 6000 ms | Milliseconds before the first character. Also how you stagger two of these: give the paragraph a hold long enough to let the heading finish. |
| `jitter` | number | `0.035` | 0 to 0.2 em (looks right between 0.02 and 0.06) | How far off the baseline a letter lands, in ems, so it holds at any size. Small. A type bar is a mechanism with slack in it, not a drunk. |
| `skew` | number | `1.1` | 0 to 8 deg (looks right between 0.5 and 2.5) | How far off square a letter lands. Past about three degrees it stops reading as a machine with slack and starts reading as a ransom note. |
| `ribbon` | number | `0.35` | 0 to 1 | How much the ribbon varies: the ink a strike leaves. A worn ribbon gives an uneven page, and this is the difference between type that was struck and type that was set. |
| `caret` | number | `0.09` | 0 to 0.6 em | Width of the caret, in ems. A real typewriter has no caret at all, so 0 is the historically honest setting and the one to use when the effect is standing in for a printed page rather than for a screen. |
| `blink` | number | `1060` | 200 to 3000 ms | Milliseconds for one blink, once typing has stopped. It runs on its own clock rather than on the typing one. Keep it slow: a fast blink is the fastest way to make a block of text hard to sit with. |
| `seed` | number | `7` | 0 to 9999 | Seed for the rhythm and the strikes. The same seed always gives the same hand, so a recorded video and a live page match letter for letter. Change it to give two blocks of text on the same page two different typists. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot reveal this should be a time after the typing has finished, so the text simply appears. The strikes are still there in that frame, which is the nice part: the page looks typed rather than set. |

## 5. Accessibility. Do not skip this

The characters are marked `aria-hidden` and a visually hidden copy of the
original string sits alongside them. A screen reader reads the sentence once,
whole. The alternative, a label that grows by a character at a time, is a live
region nobody asked for and it is genuinely unusable.

Do not put an `aria-label` on the element as well. Two labels is worse than
none.

## 6. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The characters are only split on the first frame. Call
`createTypewriterText` from `useEffect`, `onMounted`, or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For a one-shot reveal that default is 999, which is after the typing has
finished. The strikes are still in that frame, which is the nice part: the page
looks typed rather than set, with no motion at all.

## 7. The three mistakes most likely to be made here

1. **An even rhythm.** `rhythm: 0` is a machine, and it is the single thing that
   gives away every version of this effect. A typist does not keep time.

2. **No pause at the punctuation.** With `pause: 0` a full stop goes by at the
   same speed as a letter, and the whole thing flattens into a crawl. The
   pauses are the prosody.

3. **Leaving `pace` at the default for a paragraph.** It multiplies. Three
   hundred characters at 62ms is nearly twenty seconds of someone waiting.

4. **Revealing by removing the text.** Then the line boxes grow as it types and
   everything below the paragraph moves on every character. The untyped part is
   hidden here, not absent, which is why the page stays still.

5. **A fast caret blink.** It is the quickest way to make a block of text
   impossible to sit with. Slow, or `caret: 0`, which is also what a real
   typewriter has.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
