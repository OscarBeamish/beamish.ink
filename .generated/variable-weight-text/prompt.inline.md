You are adding **VariableWeightText** from Beamish to this project.

> Type that puts on weight under the cursor, on a line that does not move while it does. Pointer · effect · MIT.
> https://beamish.ink/effects/variable-weight-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- Needs a variable font with the axis being driven. A static face ignores font-variation-settings without complaining, which is the one way this fails silently: the effect mounts, runs, and does nothing visible
- The line does not move, and that is the whole item. A weight axis changes the advance width of every glyph it touches, so a line of individually weighted letters reflows continuously as the cursor crosses it: characters shuffle sideways, the line end breathes, and anything laid out after it moves too. That is why most versions of this only ever appear on a single centred word
- Each character is measured once at the heaviest value the axis will reach, which is the widest it can ever be, and held in a box that wide with the letter centred in it. One measuring pass, and it is the difference between an effect you can put on a paragraph and one you can put on a word
- The falloff has a shoulder rather than being linear. Pressure does not fall off in a straight line from a nib, and a linear ramp reads as a triangle of bold sliding along the line
- The axis is a setting rather than a constant. Weight is the obvious one and the default, but a face with a width or a slant axis will do this just as well and only three strings change
- The value is written to one decimal place. A weight axis quantised to a tenth is finer than any face resolves, and it stops the style being rewritten every frame for a change nothing can draw
- Like every pointer effect here it eases against its own last frame, so it is deliberately not pure in t, and the recorder drives it from the scripted path in this file
- The original string stays in the accessibility tree as one label, so a screen reader reads the sentence rather than the characters
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

**`src/beamish/effects/variable-weight-text/core.ts`**

```ts
/*
 * VariableWeightText: Beamish
 * https://beamish.ink/effects/variable-weight-text
 *
 * Type that puts on weight under the cursor. The hand presses, the letters take
 * more ink, and the line stays exactly where it was.
 *
 * That last clause is the whole problem, and it is why most versions of this
 * are unusable on anything but a single centred word. A variable font's weight
 * axis changes the advance width of every glyph it touches: go from 400 to 700
 * and the letters get wider, so a line whose letters are individually weighted
 * reflows continuously as the cursor crosses it. Characters shuffle sideways,
 * the line end breathes, and anything laid out after it moves too.
 *
 * So each character is measured once at the heaviest weight it will ever carry
 * and held in a box that wide. The letters are centred in their boxes, the
 * tracking opens very slightly, and nothing moves again for the life of the
 * page. It costs one measuring pass and it is the difference between an effect
 * you can put on a paragraph and one you can put on a word.
 *
 * Two other things worth knowing.
 *
 * The falloff has a shoulder rather than being linear. Pressure does not fall
 * off in a straight line from a nib, and a linear ramp reads as a triangle of
 * bold sliding along the line, which is the second giveaway after the jitter.
 *
 * The axis is a setting, not a constant. Weight is the obvious one and the
 * default, but a face with a width or a slant axis will do this just as well,
 * and the only thing that changes is three strings.
 */

import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type Pointer,
  type Surface
} from '../../shared/runtime'

export type VariableWeightTextOptions = BaseOptions & {
  /** The variation axis to drive. Four letters, as the font declares it. */
  axis: string
  /** Where the axis sits with the cursor far away. */
  rest: number
  /** Where it goes directly under the cursor. */
  peak: number
  /** How far the hand reaches, as a share of the element's width. */
  reach: number
  /** Shape of the falloff. 1 is linear, higher keeps the peak tighter. */
  shoulder: number
  /** How fast the letters follow the hand, 0 to 1 per frame. */
  ease: number
  /** Hold each character in a box as wide as its heaviest form. */
  steady: boolean
  /** Extra tracking, in ems. A little room stops the heavy letters touching. */
  tracking: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const variableWeightTextDefaults: VariableWeightTextOptions = {
  axis: 'wght',
  rest: 400,
  peak: 700,
  reach: 0.22,
  shoulder: 2.4,
  ease: 0.22,
  steady: true,
  tracking: 0.012,
  reducedMotionTime: 0
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

class VariableWeightTextSurface implements Surface<VariableWeightTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private cells: HTMLElement[] = []
  /** Each character's current axis value, eased behind the hand. */
  private at: number[] = []
  private built = false
  private measured = false
  private measuredFor = ''
  private fontsPending = false
  private box = { width: 1, height: 1 }
  private started = false

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
        cell.style.willChange = 'font-variation-settings'
        wrapper.append(cell)
        this.cells.push(cell)
      }
      visual.append(wrapper)
      if (index < words.length - 1) visual.append(document.createTextNode(' '))
    })

    host.append(label, visual)
    this.built = true
    this.at = this.cells.map(() => variableWeightTextDefaults.rest)

    /*
     * Widths measured in the fallback face are the wrong widths, and the boxes
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
   * The measuring pass, and the reason this works on a paragraph.
   *
   * A weight axis changes the advance width of every glyph it touches, so a
   * line of individually weighted letters reflows as the cursor crosses it.
   * Each box is pinned to the width of its own character at the heaviest value
   * the axis will reach, which is the widest it can ever be, and the letter is
   * centred in it. After this nothing moves again.
   */
  private measure(opts: VariableWeightTextOptions): void {
    const key = `${opts.axis}|${opts.peak}|${opts.rest}|${opts.steady}|${opts.tracking}`
    if (this.measured && this.measuredFor === key) return
    this.measuredFor = key

    const heaviest = Math.max(opts.rest, opts.peak)
    for (const cell of this.cells) {
      cell.style.letterSpacing = `${opts.tracking}em`
      if (!opts.steady) {
        cell.style.width = ''
        cell.style.textAlign = ''
        continue
      }
      const settings = `"${opts.axis}" ${heaviest}`
      const before = cell.style.fontVariationSettings
      cell.style.width = ''
      cell.style.fontVariationSettings = settings
      cell.style.width = `${cell.getBoundingClientRect().width.toFixed(2)}px`
      cell.style.textAlign = 'center'
      cell.style.fontVariationSettings = before
    }
    this.measured = true
  }

  resize(size: { width: number; height: number }): void {
    this.box = { width: size.width, height: size.height }
    this.measured = false
  }

  render(_t: number, opts: VariableWeightTextOptions, pointer: Pointer): void {
    this.build()
    if (this.cells.length === 0) return
    this.measure(opts)

    const reach = Math.max(opts.reach, 0.001) * this.box.width
    const ease = Math.min(Math.max(opts.ease, 0.01), 1)
    const shoulder = Math.max(opts.shoulder, 0.1)
    const px = pointer.x * this.box.width
    const py = pointer.y * this.box.height
    const near = pointer.active

    const base = this.host?.getBoundingClientRect()
    if (!base) return

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]!
      const rect = cell.getBoundingClientRect()
      const cx = rect.left - base.left + rect.width / 2
      const cy = rect.top - base.top + rect.height / 2

      /*
       * Distance to the hand, with a shoulder on the falloff. Pressure does not
       * fall off in a straight line from a nib, and a linear ramp reads as a
       * triangle of bold sliding along the line.
       */
      const distance = Math.hypot(px - cx, py - cy)
      const closeness = near ? Math.pow(1 - clamp01(distance / reach), shoulder) : 0
      const want = opts.rest + (opts.peak - opts.rest) * closeness

      /*
       * Eased against the last frame, like every pointer effect here, so it is
       * deliberately not pure in `t`. The recorder drives it from a scripted
       * path instead.
       */
      const current = this.at[i] ?? opts.rest
      const value = this.started ? current + (want - current) * ease : want
      this.at[i] = value

      // Written to one decimal. A weight axis quantised to a tenth is finer
      // than any face resolves, and it stops the style being rewritten every
      // frame for a change nothing can draw.
      const settings = `"${opts.axis}" ${value.toFixed(1)}`
      if (cell.style.fontVariationSettings !== settings) {
        cell.style.fontVariationSettings = settings
      }
    }
    this.started = true
  }

  teardown(): void {
    if (this.host && this.original) this.host.textContent = this.original
    this.cells = []
    this.at = []
    this.built = false
    this.measured = false
    this.measuredFor = ''
    this.started = false
    this.host = null
  }
}

/**
 * Mount VariableWeightText into `el`. The element must already contain the
 * text, and the face must have the axis being driven: a static font will
 * ignore it silently.
 *
 * ```ts
 * const pressed = createVariableWeightText(document.querySelector('h1')!)
 * pressed.start()
 * // …later
 * pressed.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left exactly as it
 * was found.
 */
export function createVariableWeightText(
  el: HTMLElement,
  opts: Partial<VariableWeightTextOptions> = {}
): EffectHandle {
  return mount<VariableWeightTextOptions>(el, opts, {
    defaults: variableWeightTextDefaults,
    kind: 'dom',
    create: () => new VariableWeightTextSurface()
  })
}

export default createVariableWeightText
```

## 2. What it is

VariableWeightText makes type put on weight under the cursor. The hand presses,
the letters take more ink, and the line stays exactly where it was.

That last clause is the whole item, and it is why most versions of this only
ever appear on a single centred word.

A variable font's weight axis changes the **advance width** of every glyph it
touches. Go from 400 to 700 and the letters get wider, so a line whose letters
are individually weighted reflows continuously as the cursor crosses it:
characters shuffle sideways, the line end breathes, and anything laid out after
it moves too.

So each character is measured once at the heaviest value the axis will ever
reach, which is the widest it can ever be, and held in a box that wide with the
letter centred in it. One measuring pass, and after it nothing moves again. It
is the difference between an effect you can put on a paragraph and one you can
put on a word.

Two smaller things. The falloff has a shoulder rather than being linear, because
pressure does not fall off in a straight line from a nib and a linear ramp reads
as a triangle of bold sliding along the line. And the axis is a setting rather
than a constant: weight is the obvious one, but a width or slant axis works the
same way and only the strings change.

## 3. Wire it in

**Plain HTML.** The text must already be in the element.

```html
<h1 id="masthead">Pressure of the press</h1>

<script type="module">
  import { createVariableWeightText } from './beamish/effects/variable-weight-text/core.js'

  const pressed = createVariableWeightText(document.querySelector('#masthead'))
  pressed.start()
</script>
```

**React.** Pass the text as children. Do not build the characters in JSX: React
overwrites the DOM on the next render and the measuring is lost with it.

```tsx
import { useEffect, useRef } from 'react'
import { createVariableWeightText } from '@/beamish/effects/variable-weight-text/core'

export function Masthead({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pressed = createVariableWeightText(host.current, { reach: 0.3 })
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
import { createVariableWeightText } from '@/beamish/effects/variable-weight-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pressed: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pressed = createVariableWeightText(host.value)
  pressed.start()
})

onBeforeUnmount(() => pressed?.destroy())
</script>

<template>
  <h1 ref="host">Pressure of the press</h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `axis` | string | `wght` | any value | The variation axis to drive, spelled as the font declares it. Four lower-case letters for a registered axis: wght for weight, wdth for width, slnt for slant, opsz for optical size. A custom axis is upper case. Name one the face does not have and nothing happens, with no error anywhere. |
| `rest` | number | `400` | 1 to 1000 | Where the axis sits with the cursor far away, which is to say what the text looks like to everybody who never moves a mouse over it. It should be the weight you would have set anyway. |
| `peak` | number | `700` | 1 to 1000 | Where the axis goes directly under the cursor. Stay inside the range the face actually has: asking for 900 of a 400 to 700 font clamps to 700, so the effect quietly gets weaker as the cursor arrives rather than stronger. |
| `reach` | number | `0.22` | 0.02 to 1 (looks right between 0.12 and 0.35) | How far the hand reaches, as a share of the element's width. Relative, so the same setting works on a heading and on a column. Wide reaches read as the whole line breathing; narrow ones as a finger pressing on one letter. |
| `shoulder` | number | `2.4` | 0.5 to 8 (looks right between 1.6 and 4) | Shape of the falloff. 1 is linear, which reads as a triangle of bold sliding along the line and is the giveaway of every version of this. Higher keeps the peak tight and lets it fall away quickly, which is what pressure from a nib actually does. |
| `ease` | number | `0.22` | 0.02 to 1 | How fast the letters follow the hand, per frame. At 1 they are welded to the cursor, which looks like a bug rather than like ink. Paper takes a moment to give. |
| `steady` | boolean | `true` | `true` · `false` | Hold each character in a box as wide as its heaviest form. On, always, unless the face has no width change across the axis: a slant axis does not need it, and a weight axis absolutely does. Turn it off once on a paragraph to see why it is here. |
| `tracking` | number | `0.012` | 0 to 0.1 em | Extra tracking. A little room stops the heaviest letters touching their neighbours, since every box is as wide as its own character needs and not as wide as the pair does. |

## 5. Accessibility. Do not skip this

The characters are marked `aria-hidden` and a visually hidden copy of the
original string sits alongside them, so a screen reader reads the sentence
rather than the letters.

`rest` is what the text looks like to everyone who never moves a pointer over
it, which is most people and all touch users. Set it to the weight you would
have chosen anyway, and treat everything above it as a flourish nobody needs to
see.

## 6. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The characters are only split on the first frame. Call
`createVariableWeightText` from `useEffect`, `onMounted`, or a `client:*` island.

## 7. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts, so the text simply sits at `rest`. Nothing is lost: the
resting state is the design.

## 8. The three mistakes most likely to be made here

1. **Not pinning the boxes.** The line reflows under the cursor. It is the only
   reason you ever see this effect on one word in the middle of a page, and it
   is one measuring pass to fix.

2. **A static font.** `font-variation-settings` is ignored in silence. There is
   no error to find.

3. **A `peak` outside the face's range.** It clamps, so the effect gets weaker
   as the cursor arrives instead of stronger, which reads as a bug in the
   falloff.

4. **A linear falloff.** `shoulder: 1` is a triangle of bold sliding along the
   line. Pressure from a nib does not do that.

5. **Using it on body copy.** Three hundred rects a frame, for an effect that at
   that size is a smudge. It is for a heading.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
