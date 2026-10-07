You are adding **Cipher** from Beamish to this project.

> Text resolving out of a run of cipher glyphs, one character at a time, without the line moving while it does. Type · effect · MIT.
> https://beamish.ink/effects/cipher

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. It splits the text already in the element and swaps the characters that have not landed yet
- Pure in t. The usual way to write this is Math.random on a timer, which cannot be seeked, cannot be recorded, and shows something different every time anybody looks at it. The glyph at each position is a hash of the position, the seed and the frame number, so the same t always gives the same frame
- The glyphs change on their own cadence rather than once per frame. A per-frame swap is a grey blur at 120Hz and a legible stream at 30, which means the effect would look like a different effect depending on the monitor
- Each character is held in a box the width of the letter it will become, so a line decoding in the middle of a page does not push the page about. Turn `steady` off for monospace, where every box is the same width anyway
- Whitespace and punctuation are left alone. They carry the shape of the sentence, and scrambling the spaces turns text being decoded into a block of noise. It is also what keeps the word wrapping intact
- The original string stays in the accessibility tree as one label, so a screen reader reads the sentence rather than a live stream of junk
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

**`src/beamish/effects/cipher/core.ts`**

```ts
/*
 * Cipher: Beamish
 * https://beamish.ink/effects/cipher
 *
 * Text that resolves out of a run of cipher glyphs, one character at a time.
 * The thing on the hover of every studio nav bar, and on the headline of about
 * half the sites that win awards for being hard to read.
 *
 * No canvas and no dependencies. It takes an element that already contains
 * text, splits it, and swaps the characters that have not landed yet. The
 * original string stays in the accessibility tree as one label, because a
 * screen reader handed a live stream of junk reads out a live stream of junk.
 *
 * Three decisions separate this from the version everybody writes in an
 * afternoon:
 *
 *   It is pure in `t`. The obvious implementation calls Math.random() on a
 *   timer and mutates as it goes, which cannot be seeked, cannot be recorded,
 *   and shows something different every time anybody looks at it. Here the
 *   glyph at each position is a hash of the position, the seed and the frame
 *   number, so the same `t` always gives the same frame.
 *
 *   The glyphs change on their own clock rather than per frame. At 120Hz a
 *   per-frame swap is a grey blur with no characters in it; at 30 it reads as
 *   text being typed by something in a hurry. Pinning the cadence means the
 *   effect looks the same on a 60Hz laptop, a 144Hz monitor and in a recording.
 *
 *   Nothing moves. Each character is measured once and held in a box the width
 *   of the letter it will become, so a paragraph decoding in the middle of a
 *   page does not push the rest of the page about while it does it. This is the
 *   detail that decides whether the effect can be used on anything other than a
 *   line of monospace sitting on its own.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type CipherOrder = 'forward' | 'reverse' | 'centre' | 'random'

export type CipherOptions = BaseOptions & {
  /** The characters it cycles through before each letter lands. */
  glyphs: string
  /** The order the characters land in. */
  order: CipherOrder
  /** Milliseconds between one character landing and the next. */
  stagger: number
  /** Milliseconds of cipher before the first character lands. */
  hold: number
  /** Glyph changes per second. This is a cadence, not a frame rate. */
  rate: number
  /** How much paler an unlanded glyph is than the settled text, 0 to 1. */
  dim: number
  /** Hold each character in a box the width of the letter it will become. */
  steady: boolean
  /** Seed for the glyphs and the random order. The same seed gives the same run. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const cipherDefaults: CipherOptions = {
  glyphs: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+-=?/<>[]{}',
  order: 'forward',
  stagger: 45,
  hold: 160,
  rate: 18,
  dim: 0.45,
  steady: true,
  seed: 7,
  reducedMotionTime: 999
}

/*
 * A hash rather than a generator. A generator has to be run in order and from
 * the start, which is the whole problem: this has to answer what is at position
 * 12 on frame 40 without having drawn frames 0 to 39.
 */
function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | (c | 0))
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

function orderFor(mode: CipherOrder, count: number, seed: number): number[] {
  const indices = Array.from({ length: count }, (_, i) => i)
  if (mode === 'reverse') return indices.map(i => count - 1 - i)
  if (mode === 'centre') {
    const middle = (count - 1) / 2
    return indices.map(i => Math.round(Math.abs(i - middle)))
  }
  if (mode === 'random') {
    // A shuffled rank per character, not a shuffled list: each letter keeps its
    // place in the word and only its turn changes.
    const ranks = indices.slice()
    for (let i = ranks.length - 1; i > 0; i--) {
      const j = Math.floor(hash3(i, 0, seed) * (i + 1))
      const swap = ranks[i]!
      ranks[i] = ranks[j]!
      ranks[j] = swap
    }
    return ranks
  }
  return indices
}

/*
 * Whitespace and punctuation are left alone. They carry the shape of the
 * sentence, and a line with its spaces scrambled is not text being decoded, it
 * is a block of noise. Leaving the spaces also keeps the word wrapping intact.
 */
const SCRAMBLES = /[a-z0-9]/i

/*
 * A substitute takes the case of the letter it is standing in for. The glyph
 * set is written in capitals because that is how everybody writes one, and a
 * capital standing in a lowercase box is both too wide for it and too tall for
 * the line: set a word in a display face and the run comes out as a row of
 * letters colliding with each other over an x-height that keeps changing.
 * Matching the case fixes the width and the height at the same time.
 */
function matchCase(glyph: string, letter: string): string {
  if (letter >= 'a' && letter <= 'z') return glyph.toLowerCase()
  if (letter >= 'A' && letter <= 'Z') return glyph.toUpperCase()
  return glyph
}

class CipherSurface implements Surface<CipherOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private cells: HTMLElement[] = []
  private letters: string[] = []
  private ranks: number[] = []
  private pools: string[][] = []
  private probe: HTMLElement | null = null
  private built = false
  private measured = false
  private measuredFor = ''
  private fontsPending = false

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

    // The text a screen reader gets: one string, unchanged, out of sight.
    const label = document.createElement('span')
    label.textContent = this.original
    label.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'

    const visual = document.createElement('span')
    visual.setAttribute('aria-hidden', 'true')

    const words = this.original.split(' ')
    words.forEach((word, index) => {
      // Words stay whole so the text still wraps. The characters are swapped
      // inside them, which is the only way to take type apart without taking
      // line breaking apart with it.
      const wrapper = document.createElement('span')
      wrapper.style.display = 'inline-block'
      wrapper.style.whiteSpace = 'nowrap'
      for (const character of Array.from(word)) {
        const cell = document.createElement('span')
        cell.textContent = character
        cell.style.display = 'inline-block'
        wrapper.append(cell)
        this.cells.push(cell)
        this.letters.push(character)
      }
      visual.append(wrapper)
      if (index < words.length - 1) visual.append(document.createTextNode(' '))
    })

    /*
     * Somewhere to measure glyphs that is inside the element, so it inherits
     * the face, the size and the tracking the text is actually set in. Hidden
     * rather than detached, because a detached node has no font at all.
     */
    const probe = document.createElement('span')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText =
      'position:absolute;visibility:hidden;white-space:pre;pointer-events:none;top:0;left:0'
    visual.append(probe)
    this.probe = probe

    host.append(label, visual)
    this.built = true

    /*
     * Widths measured in the fallback face are the wrong widths, and the boxes
     * would be pinned to them for the life of the page. Measure again once the
     * real face has arrived.
     */
    if (!this.fontsPending && typeof document !== 'undefined' && document.fonts) {
      this.fontsPending = true
      document.fonts.ready.then(() => {
        this.measured = false
      })
    }
  }

  /*
   * Each box is pinned to the width of the letter it will become, and the
   * substitute is centred in it. The alternative, pinning the width of the
   * whole element, stops the page moving but still lets the letters inside it
   * jostle, which is the part that actually catches the eye.
   */
  private measure(steady: boolean, glyphs: string): void {
    const probe = this.probe
    if (this.measured && this.measuredFor === glyphs) return
    this.measuredFor = glyphs

    if (!steady || !probe) {
      for (const cell of this.cells) {
        cell.style.width = ''
        cell.style.textAlign = ''
      }
      this.pools = []
      this.measured = true
      return
    }

    // Every character that could be shown, measured once each in this face.
    const widths = new Map<string, number>()
    const width = (character: string): number => {
      const known = widths.get(character)
      if (known !== undefined) return known
      probe.textContent = character
      const measured = probe.getBoundingClientRect().width
      widths.set(character, measured)
      return measured
    }

    const set = Array.from(glyphs)
    this.pools = []

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]!
      const letter = this.letters[i]!
      if (!SCRAMBLES.test(letter)) {
        cell.style.width = ''
        cell.style.textAlign = ''
        this.pools.push([])
        continue
      }

      const target = width(letter)
      cell.style.width = `${target.toFixed(2)}px`
      cell.style.textAlign = 'center'

      /*
       * The substitutes for this character, nearest in width first. Pinning
       * the box stops the line moving, but on its own it only moves the
       * problem: a w standing in the box of an i overflows it on both sides
       * and collides with its neighbours, which at headline size is the most
       * visible thing on the page. Choosing from the glyphs that fit the box
       * is the fix, and it has the side effect of keeping the colour of the
       * line even, because the run never swaps a thin letter for a thick one.
       */
      const nearest = set
        .map((glyph, index) => {
          const fitted = matchCase(glyph, letter)
          return { glyph: fitted, index, gap: Math.abs(width(fitted) - target) }
        })
        .sort((a, b) => a.gap - b.gap || a.index - b.index)

      /*
       * Everything that fits, rather than a fixed number of the nearest. The
       * count is the tempting way to write it and it is wrong in the case that
       * matters most: in a monospace face every gap is zero, the sort is a tie
       * the whole way down, and a fixed count hands back whichever glyphs
       * happen to come first in the string. The run then cycles through A to J
       * for ever, which does not read as cipher, it reads as a spelling
       * mistake.
       */
      const tolerance = Math.max(target * 0.14, 0.5)
      const fits = nearest.filter(entry => entry.gap <= tolerance)
      const pool = fits.length >= 5 ? fits : nearest.slice(0, 5)
      this.pools.push(pool.map(entry => entry.glyph))
    }

    this.measured = true
  }

  resize(): void {
    // The face can change with the viewport, so the boxes are measured again.
    this.measured = false
  }

  render(t: number, opts: CipherOptions): void {
    this.build()
    if (this.cells.length === 0) return
    const glyphs = opts.glyphs.length > 0 ? opts.glyphs : cipherDefaults.glyphs
    this.measure(opts.steady, glyphs)

    if (this.ranks.length !== this.cells.length) {
      this.ranks = orderFor(opts.order, this.cells.length, opts.seed)
    }

    const stagger = opts.stagger / 1000
    const hold = opts.hold / 1000
    /*
     * The cadence, floored to a whole number of swaps. Everything still running
     * changes on the same tick, which is what makes the line read as one
     * mechanism rather than as a row of independent ones.
     */
    const frame = Math.floor(t * Math.max(opts.rate, 0.001))
    const dim = String(1 - Math.max(0, Math.min(1, opts.dim)))
    const set = Array.from(glyphs)

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]!
      const letter = this.letters[i]!
      const landed = t >= hold + this.ranks[i]! * stagger || !SCRAMBLES.test(letter)
      // The pool is the measured set when the boxes are pinned, and the whole
      // glyph set when they are not, where nothing is being fitted to anything.
      const pool = this.pools[i]
      const pick = (source: string[] | string) =>
        source[Math.floor(hash3(i + 1, frame, opts.seed) * source.length)] ?? letter
      const next = landed
        ? letter
        : pool && pool.length > 0
          ? pick(pool)
          : matchCase(pick(set), letter)

      /*
       * Written only on a change. Setting textContent every frame on a long
       * paragraph is a layout invalidation per character per frame, for a
       * string that is usually the same string it was last frame.
       */
      if (cell.textContent !== next) cell.textContent = next
      const opacity = landed ? '' : dim
      if (cell.style.opacity !== opacity) cell.style.opacity = opacity
    }
  }

  teardown(): void {
    if (this.host && this.original) this.host.textContent = this.original
    this.cells = []
    this.letters = []
    this.ranks = []
    this.pools = []
    this.probe = null
    this.built = false
    this.measured = false
    this.measuredFor = ''
    this.host = null
  }
}

/**
 * Mount Cipher into `el`. The element must already contain the text.
 *
 * ```ts
 * const cipher = createCipher(document.querySelector('h1')!)
 * cipher.start()
 * // …later
 * cipher.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left exactly as it
 * was found.
 */
export function createCipher(el: HTMLElement, opts: Partial<CipherOptions> = {}): EffectHandle {
  return mount<CipherOptions>(el, opts, {
    defaults: cipherDefaults,
    kind: 'dom',
    create: () => new CipherSurface()
  })
}

export default createCipher
```

## 2. What it is

Cipher resolves text out of a run of substitute glyphs, one character at a time.
It is the effect on the hover of every studio nav bar, and on a good number of
the headlines that win awards for being difficult to read.

It takes an element that already contains text, splits it into characters, and
swaps the ones that have not landed yet. There is no canvas, no WebGL and no npm
dependency.

Three things it does that the version written in an afternoon does not.

It is pure in `t`. The obvious implementation calls `Math.random()` on a timer
and mutates as it goes, which cannot be seeked, cannot be recorded, and shows
something different every time anybody looks at it. Here the glyph at each
position is a hash of the position, the seed and the frame number, so the same
`t` always gives the same frame.

The glyphs change on their own cadence rather than once per display frame. At
120Hz a per-frame swap is a grey blur with no characters in it; at 30 it reads as
text being typed by something in a hurry. Fixing the cadence means the effect
looks the same on a 60Hz laptop, on a 144Hz monitor, and in a recording of
either.

Nothing moves. Each character is held in a box the width of the letter it will
become, and the substitutes are chosen from the glyphs that fit that box, so a
line decoding in the middle of a page neither pushes the page about nor collides
with itself while it runs.

`destroy()` puts the original text back. The element is left as it was found.

## 3. Wire it in

**Plain HTML.** The text must already be in the element. Cipher splits what it
finds.

```html
<h1 id="headline">A headline sits here</h1>

<script type="module">
  import { createCipher } from './beamish/effects/cipher/core.js'

  const cipher = createCipher(document.querySelector('#headline'))
  cipher.start()
</script>
```

**React.** Render the text as children, then split it in an effect. Do not build
the spans in JSX: React will fight the DOM changes on the next render.

```tsx
import { useEffect, useRef } from 'react'
import { createCipher } from '@/beamish/effects/cipher/core'

export function Headline({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const cipher = createCipher(host.current, { stagger: 45 })
    cipher.start()
    return () => cipher.destroy()
  }, [children])

  return <h1 ref={host}>{children}</h1>
}
```

The dependency on `children` is deliberate. If the text changes, the split has to
be rebuilt.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createCipher } from '@/beamish/effects/cipher/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let cipher: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  cipher = createCipher(host.value)
  cipher.start()
})

onBeforeUnmount(() => cipher?.destroy())
</script>

<template>
  <h1 ref="host">A headline sits here</h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Replaying it.** Cipher runs once from `t = 0`. To play it again, reset the clock
and start:

```ts
cipher.stop()
cipher.renderAtTime(0)
cipher.start()
```

**On hover, which is what it is for.** Mount it without starting, and replay on
`pointerenter`. Let the run finish rather than reversing it on the way out: a
label abandoned half decoded is unreadable, and it is unreadable at exactly the
moment somebody is trying to read it.

```ts
const link = document.querySelector('#nav-link')
const cipher = createCipher(link, { stagger: 28, hold: 0 })

let running = false
link.addEventListener('pointerenter', () => {
  if (running) return
  running = true
  cipher.renderAtTime(0)
  cipher.start()
  // The run is hold plus stagger per character, and it is worth working out
  // rather than guessing: the guard is what stops a cursor swept along a bar
  // from stacking three runs on the same label.
  const length = 0 + 28 * link.textContent.length
  setTimeout(() => {
    cipher.stop()
    running = false
  }, length + 200)
})
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a scroll-triggered reveal with no extra code.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `glyphs` | string | `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+-=?/<>[]{}` | any value | The characters it cycles through before each letter lands. Keep them the same case and roughly the same weight as the text, or the line flickers between dark and light as it runs. Katakana is the one everybody reaches for and the one that dates the effect hardest. |
| `order` | enum | `forward` | `forward` · `reverse` · `centre` · `random` | The order the characters land in. Forward reads as something being typed or decoded. Random reads as something settling, and is the better one for a paragraph, where a left to right sweep takes long enough to watch. |
| `stagger` | number | `45` | 0 to 300 ms (looks right between 20 and 90) | Milliseconds between one character landing and the next. This is the control that sets the length of the whole run, because the last character lands at hold plus stagger times the number of characters. Short text can afford to be slow; a paragraph at 45ms is a run most of a minute long. |
| `hold` | number | `160` | 0 to 2000 ms (looks right between 0 and 400) | Milliseconds of cipher before the first character lands. A short hold is what makes it read as text arriving from somewhere rather than as text already there and merely untidy. |
| `rate` | number | `18` | 2 to 60 per second (looks right between 12 and 24) | Glyph changes per second, and a cadence rather than a frame rate: everything still running changes on the same tick, which is what makes the line read as one mechanism rather than a row of independent ones. Past about 30 the characters stop being readable and the whole thing greys out. |
| `dim` | number | `0.45` | 0 to 1 | How much paler an unlanded glyph is than the settled text. The reason to have it at all is that it separates the two states by more than the letters themselves do, so the text reads as arriving rather than as correcting itself. |
| `steady` | boolean | `true` | `true` · `false` | Hold each character in a box the width of the letter it will become. On for anything set in a proportional face, where an I becoming a W is enough to shift the rest of the line. Off for monospace, where the boxes are all the same width and measuring them is work for nothing. |
| `seed` | number | `7` | 0 to 9999 | Seed for the glyphs and for the random order. The same seed always gives the same run, so a recorded video and a live page match character for character. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot reveal this should be a time after the run has finished, so the text simply appears. |

## 5. Accessibility. Do not skip this

The split version is marked `aria-hidden`, and a visually hidden copy of the
original string sits alongside it. A screen reader reads the sentence. Without
this the effect is worse than a split headline, which merely spells itself out:
a screen reader on a live cipher reads a stream of junk.

Do not put an `aria-label` on the element as well. Two labels is worse than none.

## 6. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text, and stays readable if the
JavaScript never arrives. Splitting only happens on the first frame. Call
`createCipher` from `useEffect`, `onMounted`, or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For a one-shot reveal that default is 999, which is any time after the run has
finished. The text simply appears, fully set, which is the correct outcome. Do
not set it to 0: that leaves the headline as a line of nonsense that never
resolves, which is the worst of the three states it could be in.

## 7. The three mistakes most likely to be made here

1. **Writing it with `Math.random()` on a `setInterval`.** It is the natural way
   to write it and it costs you the two things that matter: the effect can no
   longer be seeked or recorded, and it draws a different frame every time the
   page is loaded, so there is nothing to compare a change against.

2. **Swapping the glyph every frame.** The cadence is not the frame rate. A swap
   per frame is legible on a 60Hz monitor, a blur on a 144Hz one, and something
   else again in a 30fps recording of the same page.

3. **Leaving the boxes unpinned on a proportional face.** Every substitution
   changes the width of the line, so the text jitters, and anything laid out
   after it jitters too. This is why most versions of this effect only ever
   appear on short monospace labels.

4. **Scrambling the spaces.** Text with its spaces replaced is not text being
   decoded, it is a block of noise, and it rewraps on every tick. Cipher leaves
   whitespace and punctuation alone.

5. **Running it on hover with no guard.** A cursor swept along a nav bar starts a
   run on every label it crosses, and re-entering one that is still going stacks
   a second run on top of the first. One flag fixes it.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
