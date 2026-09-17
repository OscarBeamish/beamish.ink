You are adding **ScrambleText** from Beamish to this project.

> Type set one character at a time, in the order you choose. Type · effect · MIT.
> https://beamish.ink/effects/scramble-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. It splits the text already in the element and animates the pieces
- The original string stays in the accessibility tree as one label, so a screen reader does not read sixty separate characters
- destroy() puts the original text back, leaving the element as it was found
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
   * Velocity is measured on the scroll event and bled off in the frame loop
   * rather than being recomputed per frame. A scroll event does not fire every
   * frame, so a per-frame difference reads zero on most of them and the effect
   * stutters. Decaying instead means a flick lands once and eases out.
   *
   * This is the one piece of state in the runtime that is not a function of `t`,
   * which is why `scrollPath` exists to replace it wholesale for the recorder.
   */
  let scrollMeasuredAt = 0
  function decayScroll(dt: number) {
    if (scroll.velocity === 0) return
    // Halves roughly every 90ms. Slow enough to feel like weight, fast enough
    // that the effect is at rest by the time the reader has stopped.
    const keep = Math.pow(0.0005, dt)
    scroll.velocity *= keep
    if (Math.abs(scroll.velocity) < 1e-4) scroll.velocity = 0
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
    decayScroll(dt)
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

  const readScroll = () => {
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

    const now = performance.now()
    const gap = (now - scrollMeasuredAt) / 1000
    // The first event has no previous sample to difference against, and a stale
    // one after a long pause would read as an enormous flick.
    if (scrollMeasuredAt > 0 && gap > 0 && gap < 0.25) {
      scroll.velocity = (next - scroll.progress) / gap
    }
    scrollMeasuredAt = now
    scroll.progress = next
    scroll.active = true
  }

  // Passive: this never calls preventDefault, and saying so lets the browser
  // scroll without waiting to find out.
  window.addEventListener('scroll', readScroll, { passive: true })
  readScroll()

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
      window.removeEventListener('scroll', readScroll)
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

**`src/beamish/effects/scramble-text/core.ts`**

```ts
/*
 * Sort: Beamish
 * https://beamish.ink/effects/scramble-text
 *
 * Per-character reveal. A sort is one piece of metal type, and this sets them one
 * at a time.
 *
 * No canvas and no dependencies. It takes an element that already contains text,
 * splits it, and animates the pieces. The original text stays in the accessibility
 * tree as a single string, because a screen reader handed sixty one-character
 * spans reads out sixty characters.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type SortSplit = 'char' | 'word' | 'line'
export type SortOrder = 'forward' | 'reverse' | 'centre' | 'random'

export type ScrambleTextOptions = BaseOptions & {
  /** What each animated piece is. */
  split: SortSplit
  /** The order pieces arrive in. */
  order: SortOrder
  /** Milliseconds between one piece and the next. */
  stagger: number
  /** Milliseconds each piece takes on its own. */
  duration: number
  /** How far each piece travels, in pixels. Negative falls from above. */
  rise: number
  /** Blur each piece starts at, in pixels. Zero is cheaper and often better. */
  blur: number
  /** Scale each piece starts at. 1 is no scaling. */
  scale: number
  /** Seed for the random order. The same seed always gives the same order. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const scrambleTextDefaults: ScrambleTextOptions = {
  split: 'char',
  order: 'forward',
  stagger: 26,
  duration: 720,
  rise: 22,
  blur: 5,
  scale: 1,
  seed: 7,
  reducedMotionTime: 999
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** The one easing this library uses for arrivals. Matches --ease-out-expo. */
const easeOutExpo = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k))

/** Mulberry32. Small, fast, and identical across browsers for a given seed. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function orderFor(mode: SortOrder, count: number, seed: number): number[] {
  const indices = Array.from({ length: count }, (_, i) => i)
  if (mode === 'forward') return indices
  if (mode === 'reverse') return indices.map(i => count - 1 - i)
  if (mode === 'centre') {
    const middle = (count - 1) / 2
    return indices.map(i => Math.round(Math.abs(i - middle)))
  }
  // Random: a shuffled rank per piece, not a shuffled list, so each piece keeps
  // its place in the sentence and only its turn changes.
  const random = seeded(seed)
  const ranks = indices.slice()
  for (let i = ranks.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[ranks[i], ranks[j]] = [ranks[j]!, ranks[i]!]
  }
  return ranks
}

class ScrambleTextSurface implements Surface<ScrambleTextOptions> {
  private host: HTMLElement | null = null
  private original = ''
  private pieces: HTMLElement[] = []
  private ranks: number[] = []
  private builtFor: SortSplit | null = null

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.original = (ctx.host.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  /*
   * Splitting is destructive, so it happens once per split mode rather than once
   * per frame, and the original string is kept for teardown.
   */
  private build(split: SortSplit): void {
    const host = this.host
    if (!host || this.builtFor === split) return

    host.textContent = ''
    this.pieces = []

    // The text a screen reader gets: one string, unchanged, out of sight.
    const label = document.createElement('span')
    label.textContent = this.original
    label.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0'

    const visual = document.createElement('span')
    visual.setAttribute('aria-hidden', 'true')

    const makePiece = (text: string) => {
      const piece = document.createElement('span')
      piece.textContent = text
      piece.style.display = 'inline-block'
      piece.style.willChange = 'transform, opacity'
      this.pieces.push(piece)
      return piece
    }

    if (split === 'line') {
      visual.append(makePiece(this.original))
    } else {
      const words = this.original.split(' ')
      words.forEach((word, index) => {
        // Words stay whole so the text still wraps. Characters are animated
        // inside them, which is the only way to split type without breaking
        // line breaking.
        const wrapper = document.createElement('span')
        wrapper.style.display = 'inline-block'
        wrapper.style.whiteSpace = 'nowrap'
        if (split === 'word') {
          wrapper.append(makePiece(word))
        } else {
          for (const character of Array.from(word)) wrapper.append(makePiece(character))
        }
        visual.append(wrapper)
        if (index < words.length - 1) visual.append(document.createTextNode(' '))
      })
    }

    host.append(label, visual)
    this.builtFor = split
  }

  resize(): void {}

  render(t: number, opts: ScrambleTextOptions): void {
    this.build(opts.split)
    if (this.pieces.length === 0) return

    if (this.ranks.length !== this.pieces.length) {
      this.ranks = orderFor(opts.order, this.pieces.length, opts.seed)
    }

    const stagger = opts.stagger / 1000
    const duration = Math.max(opts.duration, 1) / 1000

    for (let i = 0; i < this.pieces.length; i++) {
      const piece = this.pieces[i]!
      const progress = easeOutExpo(clamp01((t - this.ranks[i]! * stagger) / duration))
      const remaining = 1 - progress

      piece.style.opacity = String(progress)
      const shift = remaining * opts.rise
      const scale = 1 - remaining * (1 - opts.scale)
      piece.style.transform =
        scale === 1 ? `translateY(${shift}px)` : `translateY(${shift}px) scale(${scale})`
      // Dropping the filter entirely once a piece has landed matters: a
      // permanent blur(0px) still forces every one of them onto its own layer.
      piece.style.filter = opts.blur > 0 && remaining > 0.01 ? `blur(${remaining * opts.blur}px)` : ''
    }
  }

  teardown(): void {
    if (this.host && this.original) this.host.textContent = this.original
    this.pieces = []
    this.ranks = []
    this.builtFor = null
    this.host = null
  }
}

/**
 * Mount Sort into `el`. The element must already contain the text.
 *
 * ```ts
 * const sort = createScrambleText(document.querySelector('h1')!)
 * sort.start()
 * // …later
 * sort.destroy()
 * ```
 *
 * `destroy()` puts the original text back, so the element is left exactly as it
 * was found.
 */
export function createScrambleText(el: HTMLElement, opts: Partial<ScrambleTextOptions> = {}): EffectHandle {
  return mount<ScrambleTextOptions>(el, opts, {
    defaults: scrambleTextDefaults,
    kind: 'dom',
    create: () => new ScrambleTextSurface()
  })
}

export default createScrambleText
```

## 2. What it is

Sort sets type one piece at a time. A sort is a single piece of metal type, and
that is what each animated fragment here is: a character, a word or a whole line,
arriving on a stagger.

It takes an element that already contains text, splits it, and animates the
pieces. There is no canvas, no WebGL and no npm dependency.

Two things it does that most text-splitters do not. Characters are grouped inside
their word, so the text still wraps at the right places. And the original string
stays in the accessibility tree as one label, so a screen reader reads a sentence
rather than sixty separate characters.

`destroy()` puts the original text back. The element is left as it was found.

## 3. Wire it in

**Plain HTML.** The text must already be in the element. Sort splits what it
finds.

```html
<h1 id="headline">Come to my arms, my beamish boy</h1>

<script type="module">
  import { createScrambleText } from './beamish/effects/scramble-text/core.js'

  const sort = createScrambleText(document.querySelector('#headline'))
  sort.start()
</script>
```

**React.** Render the text as children, then split it in an effect. Do not build
the spans in JSX: React will fight the DOM changes on the next render.

```tsx
import { useEffect, useRef } from 'react'
import { createScrambleText } from '@/beamish/effects/scramble-text/core'

export function Headline({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sort = createScrambleText(host.current, { split: 'char', stagger: 26 })
    sort.start()
    return () => sort.destroy()
  }, [children])

  return <h1 ref={host}>{children}</h1>
}
```

The dependency on `children` is deliberate here, unlike the WebGL effects. If the
text changes, the split has to be rebuilt.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createScrambleText } from '@/beamish/effects/scramble-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sort: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sort = createScrambleText(host.value)
  sort.start()
})

onBeforeUnmount(() => sort?.destroy())
</script>

<template>
  <h1 ref="host">Come to my arms, my beamish boy</h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Replaying it.** Sort runs once from `t = 0`. To play it again, reset the clock
and start:

```ts
sort.stop()
sort.renderAtTime(0)
sort.start()
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a scroll-triggered reveal with no extra code.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `split` | enum | `char` | `char` · `word` · `line` | What each animated piece is. Characters are grouped inside their word so the text still wraps. |
| `order` | enum | `forward` | `forward` · `reverse` · `centre` · `random` | The order pieces arrive in. `centre` starts in the middle and works outwards. `random` keeps every piece in its place in the sentence and only changes its turn. |
| `stagger` | number | `26` | 0 to 200 ms (looks right between 15 and 45) | Milliseconds between one piece and the next. On a long heading this multiplies fast: 40ms across 60 characters is a two and a half second wait. |
| `duration` | number | `720` | 100 to 3000 ms (looks right between 500 and 900) | Milliseconds each piece takes on its own. |
| `rise` | number | `22` | -80 to 80 px (looks right between 12 and 34) | How far each piece travels. Negative falls from above instead of rising from below. |
| `blur` | number | `5` | 0 to 20 (looks right between 0 and 8) | Blur each piece starts at. Zero is cheaper and often better at small sizes, where the blur just reads as a smudge. |
| `scale` | number | `1` | 0.4 to 1.6 (looks right between 0.9 and 1.1) | Scale each piece starts at. 1 is no scaling, which is usually right for text. |
| `seed` | number | `7` | 0 to 9999 | Seed for the random order. The same seed always gives the same order, so a recorded video and a live page match. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot reveal this should be a time after the animation has finished, so the text simply appears. |

## 5. Accessibility. Do not skip this

The split version is marked `aria-hidden`, and a visually hidden copy of the
original string sits alongside it. A screen reader reads the sentence. This is
the part most text-splitting libraries get wrong, and the symptom is a screen
reader spelling a headline out letter by letter.

Do not put an `aria-label` on the element as well. Two labels is worse than none.

## 6. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text, and stays readable if the
JavaScript never arrives. Splitting only happens on the first frame. Call
`createScrambleText` from `useEffect`, `onMounted`, or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For a one-shot reveal that default is 999, which is any time after the animation
has finished. The text simply appears, fully set, which is the correct outcome.
Do not set it to 0: that leaves the headline invisible.

## 7. The three mistakes most likely to be made here

1. **Building the spans in JSX or a template.** React and Vue will overwrite the
   DOM on the next render and the animation stops mid-way. Pass plain text as
   children and let `createScrambleText` do the splitting inside an effect.

2. **Leaving `stagger` at 26ms on a long heading.** It multiplies. Sixty
   characters at 40ms is a two and a half second wait before the last one lands,
   which reads as a broken page rather than a reveal. Above about 40 characters,
   switch `split` to `word`.

3. **Setting `reducedMotionTime` to 0.** That is the frame before anything has
   arrived, so the text stays invisible for anyone who has asked for less motion.
   It wants to be a time after the animation ends.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
