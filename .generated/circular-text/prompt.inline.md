You are adding **CircularText** from Beamish to this project.

> Type set round a ring that closes exactly, because the string is fitted to the circumference rather than placed letter by letter. Type · effect · MIT.
> https://beamish.ink/effects/circular-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- An SVG textPath, which is the thing in the platform built for this, rather than a rotation and a translation per character. Placing letters by hand loses kerning, because the browser is handed ten one-character strings and kerning happens between characters in a string, and it never closes the ring, because the spacing comes from a guess at the arc each letter subtends
- The fit is the whole trick: the string is given a textLength equal to the circumference and lengthAdjust of spacing, so the browser opens or closes the spaces until it fits exactly. The ring closes at any radius, in any face, with any string, and there is no number to tune
- spacing rather than spacingAndGlyphs. A fit that stretches the letterforms has changed the typeface, which is the one thing a typesetter may not do. The option to do it anyway is there and it is off
- The circle is drawn as two arcs. A single arc of 360 degrees is degenerate, its start and end points coincide, and the renderer has no way to know which way round to go, so it draws nothing
- Letters hang inside the ring by reversing the path rather than by flipping the text: the baseline side follows the direction of travel, so the letters turn over without being touched
- The turn is one transform on one group. Animating startOffset instead re-lays out the text sixty times a second to produce a picture that is a rotation of the one before it
- The path gets an id unique to the instance. Two rings on a page sharing a path id is the one failure here that nothing in the markup hints at: the second textPath silently uses the first one's circle
- The face, weight and tracking are inherited from the element. A text effect that picks its own typeface is a graphic
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

**`src/beamish/effects/circular-text/core.ts`**

```ts
/*
 * CircularText: Beamish
 * https://beamish.ink/effects/circular-text
 *
 * Type set round a ring, turning slowly. A roundel, a seal, the stamp on a
 * bottle of something.
 *
 * Nearly every version of this on the web places each character by hand, with a
 * rotation and a translation per letter, and it is wrong in two ways that are
 * hard to unsee once you know. The letters are positioned but not fitted, so
 * the spacing comes from a guess at the arc each one subtends and the ring never
 * quite closes: there is always a gap, or an overlap, at the join. And each
 * letter is rotated as a rigid block, so a pair that should be kerned is not,
 * because the browser has been given ten separate one-character strings and
 * kerning happens between characters in a string.
 *
 * This uses an SVG textPath instead, which is the thing in the platform built
 * for exactly this, and gets both back for free. The text is laid out as text,
 * so it kerns and it ligates. And it is given a `textLength` equal to the
 * circumference of the circle, with `lengthAdjust="spacing"`, so the browser
 * fits the string to the ring by opening or closing the spaces between letters
 * and never by distorting the letterforms. The ring closes exactly, at any
 * radius, in any face, with any string. There is no number to tune.
 *
 * The turn is one transform on one group, rather than a new `startOffset` every
 * frame. Moving the offset re-lays out the text sixty times a second to produce
 * a picture that is a rotation of the one before it.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type CircularTextOptions = BaseOptions & {
  /** Radius of the ring, as a share of the shorter side of the box. */
  radius: number
  /** How many times the text goes round. */
  repeat: number
  /** What sits between one copy and the next. */
  separator: string
  /** Letter height, as a share of the radius. */
  size: number
  /** Degrees the ring turns over one period. Negative turns the other way. */
  spin: number
  /** Hang the letters inside the ring rather than standing them on it. */
  inside: boolean
  /** Let the fit stretch the letterforms as well as the spaces. */
  distort: boolean
  /** Seconds for one turn of `spin`. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const circularTextDefaults: CircularTextOptions = {
  radius: 0.38,
  repeat: 2,
  separator: ' · ',
  size: 0.17,
  spin: 360,
  inside: false,
  distort: false,
  period: 24,
  reducedMotionTime: 0
}

const SVG = 'http://www.w3.org/2000/svg'
/* The viewBox the ring is drawn in. Everything scales with the host, so the
   numbers below are a share of this box rather than pixels. */
const BOX = 100

class CircularTextSurface implements Surface<CircularTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private group: SVGGElement | null = null
  private path: SVGPathElement | null = null
  private text: SVGTextElement | null = null
  private textPath: SVGTextPathElement | null = null
  private built = false
  private shapedFor = ''

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  private build(): void {
    const host = this.host
    if (!host || this.built) return

    host.textContent = ''

    // The text a screen reader gets: one string, unchanged, out of sight. The
    // ring is a picture of it.
    const label = document.createElement('span')
    label.textContent = this.original
    label.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'

    const svg = document.createElementNS(SVG, 'svg')
    svg.setAttribute('viewBox', `0 0 ${BOX} ${BOX}`)
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    svg.style.cssText = 'display:block;width:100%;height:100%;overflow:visible'

    /*
     * An id unique to this instance. Two rings on one page sharing a path id is
     * the one way this breaks that nothing in the markup hints at: the second
     * textPath silently uses the first one's circle.
     */
    const id = `beamish-ring-${Math.random().toString(36).slice(2, 9)}`

    const defs = document.createElementNS(SVG, 'defs')
    const path = document.createElementNS(SVG, 'path')
    path.setAttribute('id', id)
    path.setAttribute('fill', 'none')
    defs.append(path)

    const group = document.createElementNS(SVG, 'g')
    const text = document.createElementNS(SVG, 'text')
    text.setAttribute('fill', 'currentColor')
    // Inherited, so the ring is set in whatever the element was set in. A text
    // effect that picks its own face is a graphic, not a text effect.
    text.style.fontFamily = 'inherit'
    text.style.fontWeight = 'inherit'
    text.style.fontStyle = 'inherit'

    const textPath = document.createElementNS(SVG, 'textPath')
    textPath.setAttribute('href', `#${id}`)
    text.append(textPath)
    group.append(text)
    svg.append(defs, group)
    host.append(label, svg)

    this.group = group
    this.path = path
    this.text = text
    this.textPath = textPath
    this.built = true
  }

  /*
   * The ring, and the fit. Both depend only on the options, so this runs when
   * they change rather than every frame.
   */
  private shape(opts: CircularTextOptions): void {
    const path = this.path
    const text = this.text
    const textPath = this.textPath
    if (!path || !text || !textPath) return

    const key = `${this.original}|${opts.radius}|${opts.repeat}|${opts.separator}|${opts.size}|${opts.inside}|${opts.distort}`
    if (this.shapedFor === key) return
    this.shapedFor = key

    const radius = Math.max(opts.radius, 0.01) * BOX
    const centre = BOX / 2

    /*
     * One full circle as two arcs, because a single arc of 360 degrees is
     * degenerate: the start and end points coincide and the renderer has no way
     * to know which way round to go, so it draws nothing.
     *
     * Clockwise from the top for letters standing on the ring. Anticlockwise
     * for letters hanging inside it, which is not a flag on the text but the
     * path running the other way: the baseline side follows the direction of
     * travel, so reversing the path turns the letters over without touching
     * them.
     */
    const sweep = opts.inside ? 0 : 1
    path.setAttribute(
      'd',
      `M ${centre} ${centre - radius} ` +
        `A ${radius} ${radius} 0 1 ${sweep} ${centre} ${centre + radius} ` +
        `A ${radius} ${radius} 0 1 ${sweep} ${centre} ${centre - radius}`
    )

    const copies = Math.max(1, Math.round(opts.repeat))
    const once = this.original + opts.separator
    textPath.textContent = copies > 1 ? once.repeat(copies) : this.original

    text.style.fontSize = `${(Math.max(opts.size, 0.01) * radius).toFixed(3)}px`
    // Letters hanging inside the ring hang from the baseline, so the baseline
    // has to move to the top of them.
    textPath.setAttribute('dominant-baseline', opts.inside ? 'hanging' : 'auto')

    /*
     * The fit. The string is given the circumference as its length, so the
     * browser opens or closes the spaces between letters until it fits exactly
     * and the join closes at any radius, in any face, with any string.
     *
     * `spacing` rather than `spacingAndGlyphs`: a fit that stretches the
     * letterforms is a fit that has changed the typeface, which is the one
     * thing a typesetter is not allowed to do.
     */
    const circumference = 2 * Math.PI * radius
    textPath.setAttribute('textLength', circumference.toFixed(4))
    textPath.setAttribute('lengthAdjust', opts.distort ? 'spacingAndGlyphs' : 'spacing')
  }

  resize(): void {}

  render(t: number, opts: CircularTextOptions): void {
    this.build()
    this.shape(opts)
    const group = this.group
    if (!group) return

    // One transform, on one group. A whole number of degrees over the period,
    // so the loop closes exactly.
    const turn = (t / Math.max(opts.period, 0.001)) * opts.spin
    group.setAttribute('transform', `rotate(${turn.toFixed(3)} ${BOX / 2} ${BOX / 2})`)
  }

  teardown(): void {
    if (this.host && this.original) this.host.textContent = this.original
    this.group = null
    this.path = null
    this.text = null
    this.textPath = null
    this.built = false
    this.shapedFor = ''
    this.host = null
  }
}

/**
 * Mount CircularText into `el`. The element must already contain the text, and
 * it needs a size: the ring fills the box it is given.
 *
 * ```ts
 * const ring = createCircularText(document.querySelector('#seal')!)
 * ring.start()
 * // …later
 * ring.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left exactly as it
 * was found.
 */
export function createCircularText(
  el: HTMLElement,
  opts: Partial<CircularTextOptions> = {}
): EffectHandle {
  return mount<CircularTextOptions>(el, opts, {
    defaults: circularTextDefaults,
    kind: 'dom',
    create: () => new CircularTextSurface()
  })
}

export default createCircularText
```

## 2. What it is

CircularText sets type round a ring and turns it slowly. A roundel, a seal, the
stamp on a bottle of something.

Nearly every version of this on the web places each character by hand, with a
rotation and a translation per letter, and it is wrong in two ways that are hard
to unsee once you know about them.

The letters are positioned but never **fitted**, so the spacing comes from a
guess at the arc each one subtends and the ring never quite closes. There is
always a gap, or an overlap, at the join.

And each letter is rotated as a rigid block, so nothing **kerns**. The browser
has been handed ten separate one-character strings, and kerning happens between
characters in a string.

This uses an SVG `textPath`, which is the thing in the platform built for
exactly this, and gets both back for free. The text is laid out as text, so it
kerns and it ligates. And it is given a `textLength` equal to the circumference
with `lengthAdjust="spacing"`, so the browser fits the string to the ring by
opening or closing the spaces and never by distorting the letterforms.

The ring closes exactly, at any radius, in any face, with any string. There is
no number to tune.

## 3. Wire it in

**Plain HTML.** The text must already be in the element, and the element needs a
size: the ring fills the box it is given.

```html
<div id="seal" style="width: 320px; aspect-ratio: 1">
  Printed and bound in England
</div>

<script type="module">
  import { createCircularText } from './beamish/effects/circular-text/core.js'

  const ring = createCircularText(document.querySelector('#seal'))
  ring.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createCircularText } from '@/beamish/effects/circular-text/core'

export function Seal({ children }: { children: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const ring = createCircularText(host.current, { repeat: 2 })
    ring.start()
    return () => ring.destroy()
  }, [children])

  return (
    <div ref={host} style={{ width: 320, aspectRatio: '1' }}>
      {children}
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createCircularText } from '@/beamish/effects/circular-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let ring: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  ring = createCircularText(host.value)
  ring.start()
})

onBeforeUnmount(() => ring?.destroy())
</script>

<template>
  <div ref="host" class="seal">Printed and bound in England</div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `radius` | number | `0.38` | 0.1 to 0.5 (looks right between 0.3 and 0.45) | Radius of the ring, as a share of the box. 0.5 puts the baseline on the very edge, which leaves the ascenders outside it: the overflow is visible rather than clipped, on purpose, but 0.38 is the largest that keeps everything inside a square box. |
| `repeat` | number | `2` | 1 to 8 | How many times the text goes round. Because the string is fitted to the circumference, this is really a density control: one copy of a short phrase is set very wide, four copies of it are set tight. Pick the one that gives the tracking you want. |
| `separator` | string | ` · ` | any value | What sits between one copy and the next. A middle dot is the one every seal and every bottle label uses, for the good reason that it reads at any size and has no direction to it. It is also what tells a reader the ring repeats rather than running on. |
| `size` | number | `0.17` | 0.04 to 0.5 | Letter height, as a share of the radius, so the ring scales as one object. It does not affect the fit at all: the string fills the circumference whatever size the letters are, and this only decides how heavy the ring looks. |
| `spin` | number | `360` | -1440 to 1440 deg (looks right between 180 and 720) | Degrees the ring turns over one period. Negative turns it the other way. A whole number of degrees over the period, so the loop closes exactly; 360 is one unhurried revolution. |
| `inside` | boolean | `false` | `true` · `false` | Hang the letters inside the ring rather than standing them on it. This is the half of a seal that reads along the bottom, and it is done by reversing the path rather than by flipping the text, so the letters keep their own shapes. |
| `distort` | boolean | `false` | `true` · `false` | Let the fit stretch the letterforms as well as the spaces. Off, and it should stay off: it is here so that the choice is visible rather than hidden. Turn it on once to see what a stretched face looks like, then turn it off. |
| `period` | number | `24` | 6 to 240 s | Seconds for one revolution. Long: a ring is a mark, not an animation, and a seal turning fast enough to notice is a loading spinner. Twenty-four seconds is fifteen degrees a second, which is about the slowest a turn can be and still read as turning. |

## 5. Accessibility. Do not skip this

The SVG is marked `aria-hidden` and a visually hidden copy of the original
string sits alongside it. A screen reader reads the sentence, once, in order.

A ring of text is decorative by nature: the lower half of a continuous ring is
upside down, which no reader should be asked to work through. Keep anything that
has to be read out of it.

## 6. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The SVG is only built on the first frame. Call
`createCircularText` from `useEffect`, `onMounted`, or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`, which here is 0: the ring at its starting angle. The ring
is the thing, and the turn is only how it passes the time.

## 7. The three mistakes most likely to be made here

1. **Placing the letters yourself.** It loses kerning and it never closes the
   ring. `textPath` and `textLength` do both properly, and they are in every
   browser.

2. **`lengthAdjust="spacingAndGlyphs"`.** It fits by stretching the letterforms,
   which means it has changed the typeface. The option is here as `distort` so
   the choice is visible rather than hidden, and it should stay off.

3. **A single 360 degree arc.** Its start and end points coincide, the renderer
   has no way to know which way round to go, and it draws nothing. The circle
   here is two arcs.

4. **Animating `startOffset`.** It re-lays out the text every frame to produce a
   picture that is a rotation of the one before it. Rotate the group.

5. **Spinning it fast.** A seal turning fast enough to notice is a loading
   spinner. The default is one revolution in forty-eight seconds.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
