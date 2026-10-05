You are adding **MisprintText** from Beamish to this project.

> A printing plate slipping out of register, so the word prints twice in two inks. Type · effect · MIT.
> https://beamish.ink/effects/misprint-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. Three stacked copies of the text, moved with transforms
- The offset plates use mix-blend-mode: multiply, because overlapping ink is darker than either colour. A channel split goes brighter where the channels meet, which is light rather than ink
- The in-register plate stays in normal flow and is the one that can be selected. The other two are aria-hidden and pointer-events: none
- Offsets are in em, so one setting works at every type size
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

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
    if (!running) draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed)
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

**`src/beamish/effects/misprint-text/core.ts`**

```ts
/*
 * MisprintText: Beamish
 * https://beamish.ink/effects/misprint-text
 *
 * A plate slipping out of register.
 *
 * The usual version of this splits the red and blue channels apart and calls it
 * a glitch, which is a television fault: an analogue signal arriving at the
 * wrong time. Paper has its own version of the same idea and it looks quite
 * different. A press lays one plate per ink, and if a plate is a fraction out of
 * position its colour prints beside the others instead of on top of them. You
 * get the word twice in two inks, offset, with the overlap darker than either.
 *
 * So this is three layers of the same word, two of them coloured and offset, and
 * the stack multiplies rather than composites, because that is what overlapping
 * ink does. The overlap going darker is the whole tell: a channel split goes
 * brighter where the channels meet, which is light, not ink.
 *
 * Registration does not drift. A plate sits wrong for a whole run and then gets
 * knocked, so the offset holds still and then jumps, driven by a hash of which
 * interval you are in. Easing it would turn a press into a wobble.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type MisprintTextOptions = BaseOptions & {
  /** The plate that is in register. */
  ink: string
  /** The first plate that is not. */
  accent: string
  /** The second plate that is not. */
  second: string
  /** How far a plate slips, in em, so it tracks the type size. */
  slip: number
  /** Seconds a plate holds its position before being knocked. */
  hold: number
  /** Share of intervals where the plates are actually out. */
  chance: number
  /** How far a slipped plate also turns, in degrees. */
  skew: number
  /** Seed for which intervals slip and how far. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const misprintTextDefaults: MisprintTextOptions = {
  ink: '#36362f',
  accent: '#c44400',
  second: '#6f8fae',
  slip: 0.045,
  hold: 1.4,
  chance: 0.55,
  skew: 0.4,
  seed: 7,
  reducedMotionTime: 0
}

/* Deterministic, so the same `t` always gives the same registration. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123
  return x - Math.floor(x)
}

class MisprintTextSurface implements Surface<MisprintTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private plates: HTMLElement[] = []
  private built = false

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  /*
   * Three copies of the word stacked on each other. Built once: rebuilding per
   * frame would throw away the layout and make the text unselectable.
   */
  private build(): void {
    const host = this.host
    if (!host || this.built) return

    host.textContent = ''
    host.style.position = 'relative'
    host.style.display = 'inline-block'
    // Each plate is taken out of flow, so the host needs something to size
    // itself by. The in-register plate stays in flow and does that job.
    this.plates = []

    const make = (offset: boolean) => {
      const plate = document.createElement('span')
      plate.textContent = this.original
      plate.style.display = 'block'
      plate.style.willChange = 'transform'
      if (offset) {
        plate.setAttribute('aria-hidden', 'true')
        plate.style.position = 'absolute'
        plate.style.inset = '0'
        /*
         * Multiply, not normal. Two inks crossing are darker than either, and
         * compositing them would put one on top of the other and lose the
         * overlap entirely. This is the same reason TranslucentSheets multiplies.
         */
        plate.style.mixBlendMode = 'multiply'
        plate.style.pointerEvents = 'none'
      }
      this.plates.push(plate)
      host.append(plate)
      return plate
    }

    // In-register first so it is the one in normal flow and the one a mouse can
    // select. The two that move are decoration and are hidden from the tree.
    make(false)
    make(true)
    make(true)
    this.built = true
  }

  resize(): void {}

  render(t: number, opts: MisprintTextOptions): void {
    this.build()
    if (this.plates.length < 3) return

    this.plates[0]!.style.color = opts.ink
    this.plates[1]!.style.color = opts.accent
    this.plates[2]!.style.color = opts.second

    /*
     * Which run we are in. A plate holds its position for a whole interval and
     * then jumps, so the offset is a step function of time rather than a curve.
     * Flooring the interval is what makes it hold.
     */
    const hold = Math.max(opts.hold, 0.05)
    const run = Math.floor(t / hold)

    for (let i = 1; i < 3; i++) {
      const plate = this.plates[i]!
      const base = run * 3 + i * 17 + opts.seed * 101

      // Most runs are in register. A press that is always wrong is not a press
      // that is nearly right, which is what a misprint actually looks like.
      const out = hash(base) < opts.chance ? 1 : 0
      const angle = hash(base + 1) * Math.PI * 2
      const reach = (0.35 + hash(base + 2) * 0.65) * opts.slip * out
      const turn = (hash(base + 3) - 0.5) * 2 * opts.skew * out

      const x = Math.cos(angle) * reach
      const y = Math.sin(angle) * reach
      plate.style.transform = `translate(${x}em, ${y}em) rotate(${turn}deg)`
    }
  }

  teardown(): void {
    // Put the markup back. The effect borrowed the element; it does not own it.
    if (this.host) {
      this.host.textContent = this.original
      this.host.style.position = ''
      this.host.style.display = ''
    }
    this.plates = []
    this.built = false
    this.host = null
  }
}

/**
 * Mount MisprintText onto an element that already contains the text.
 *
 * ```html
 * <h1 id="title">Out of register</h1>
 * ```
 *
 * ```ts
 * const misprint = createMisprintText(document.querySelector('#title')!)
 * misprint.start()
 * ```
 */
export function createMisprintText(
  el: HTMLElement,
  opts: Partial<MisprintTextOptions> = {}
): EffectHandle {
  return mount<MisprintTextOptions>(el, opts, {
    defaults: misprintTextDefaults,
    create: () => new MisprintTextSurface(),
    // A text treatment animates content that is already on the page, so it gets
    // the host element rather than a canvas it would never draw into.
    kind: 'dom'
  })
}

export default createMisprintText
```

## 2. What it is

A printing plate slipping out of register, so the word prints twice in two inks.

The usual version of this splits the red and blue channels apart and calls it a
glitch. That is a television fault: an analogue signal arriving at the wrong
time. Paper has its own version of the same idea and it looks quite different. A
press lays one plate per ink, and if a plate is a fraction out of position its
colour prints beside the others rather than on top of them.

So this is three copies of the same text, two of them coloured and offset, and
the stack **multiplies** rather than composites, because that is what overlapping
ink does. The overlap going darker is the whole tell. A channel split goes
brighter where the channels meet, which is light, not ink, and it is the thing
that makes the usual version read as a screen rather than as a page.

Registration does not drift, either. A plate sits wrong for a whole run and then
gets knocked, so the offset holds still and then jumps. Easing it would turn a
press into a wobble, and a wobble is a very different and much less interesting
fault.

No canvas and no WebGL. Three stacked spans and two transforms per frame.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `ink` | color | `#36362f` | any CSS hex | The plate that is in register. This is the one in normal flow and the one a mouse can select; the other two are decoration. |
| `accent` | color | `#c44400` | any CSS hex | The first plate that is not in register. |
| `second` | color | `#6f8fae` | any CSS hex | The second plate that is not. Two is what makes it read as a press rather than as a drop shadow. |
| `slip` | number | `0.045` | 0 to 0.3 | How far a plate slips, in em, so it tracks the type size rather than needing a different number at every heading level. Past about 0.12 the words separate and you are reading three of them. |
| `hold` | number | `1.4` | 0.1 to 10 | Seconds a plate holds its position before being knocked. Registration does not drift: a plate sits wrong for a whole run and then moves, so this is a step rather than a speed. |
| `chance` | number | `0.55` | 0 to 1 | Share of runs where the plates are actually out. A press that is always wrong is not a press that is nearly right, and at 1 the text never settles. |
| `skew` | number | `0.4` | 0 to 4 | How far a slipped plate also turns, in degrees. Small: a plate that is out by a whole degree is a plate that has fallen off. |
| `seed` | number | `7` | 0 to 999 | Which runs slip and how far. Change it for a different sequence; the same seed always gives the same one. |

## 5. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no WebGL context to release.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable, and this moves indefinitely. `stop()` and `start()` are on the handle
for that. Surface them as a real control in your own build.

The jump rate is also worth a thought under WCAG 2.3.1, which is Level A and
allows at most three changes a second. The default `hold` of 1.4 seconds is well
inside that. If you drop it below about 0.34 you are in breach, so do not.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn, at `reducedMotionTime`, which defaults to 0.

Whether that frame is in or out of register depends on `seed`. If you want it
reliably settled for those readers, mount with `chance: 0` when
`matchMedia('(prefers-reduced-motion: reduce)')` matches: clean type is the
correct outcome and it costs nothing.

## 7. The three mistakes most likely to be made here

1. **Using it on a paragraph.** Three stacked copies of a block of body text is
   unreadable, and the offset is per-element rather than per-line so a wrapped
   paragraph moves as one slab. It is for a heading.

2. **Raising `chance` to 1.** The text never returns to register, so there is
   nothing to read the misprint against and it stops looking like an error. The
   effect lives in the contrast between right and nearly right.

3. **Picking two dark inks.** They multiply, so the overlap is darker than
   either. Two near-blacks give you a slightly blacker black and no visible
   separation. One of the three wants to be light.

4. **Expecting it to work on a background colour.** `mix-blend-mode: multiply`
   blends with whatever is painted behind, which is the point on paper and a
   problem over a photograph. On a busy background, put it on its own layer.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
