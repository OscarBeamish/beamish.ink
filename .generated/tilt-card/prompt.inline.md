You are adding **TiltCard** from Beamish to this project.

> A panel that leans towards the cursor, with a sheen raking across it. Surfaces · effect · MIT.
> https://beamish.ink/effects/tilt-card

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. One CSS transform and one radial gradient
- The easing is a CSS transition rather than a per-frame spring, so nothing integrates and renderAtTime stays pure
- The sheen uses mix-blend-mode: soft-light, which is unsupported below Safari 15.4 and simply does not paint there
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

**`src/beamish/effects/tilt-card/core.ts`**

```ts
/*
 * Tilt: Beamish
 * https://beamish.ink/effects/tilt-card
 *
 * A panel that leans towards the cursor, with a sheen raking across it as it
 * goes. No canvas, no WebGL, no dependencies: one transform and one gradient.
 *
 * The easing is a CSS transition rather than a per-frame spring, which keeps
 * `renderAtTime` pure in `t` and lets the recorder scrub the smoothing along
 * with everything else.
 */

import { mount, type BaseOptions, type EffectHandle, type Pointer, type Surface } from '../../shared/runtime'

export type TiltCardOptions = BaseOptions & {
  /** Most it leans at the corners, in degrees. */
  maxTilt: number
  /** Perspective distance in pixels. Lower is a wider, more theatrical lens. */
  perspective: number
  /** Scale while the pointer is over it. 1 is no lift. */
  scale: number
  /** Strength of the sheen, 0 to 1. Zero removes the overlay entirely. */
  sheen: number
  /** Colour of the sheen. On paper a warm white reads as light, not as gloss. */
  sheenColor: string
  /** How wide the sheen pool is, as a fraction of the panel. */
  sheenSize: number
  /** Milliseconds the panel takes to follow the cursor, and to settle back. */
  ease: number
  /** Reverse the lean, so it tips away from the cursor. */
  invert: boolean
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const tiltCardDefaults: TiltCardOptions = {
  maxTilt: 9,
  perspective: 900,
  scale: 1.02,
  sheen: 0.5,
  sheenColor: '#ffffff',
  sheenSize: 0.75,
  ease: 320,
  invert: false,
  reducedMotionTime: 0
}

class TiltCardSurface implements Surface<TiltCardOptions> {
  private host: HTMLElement | null = null
  private sheen: HTMLElement | null = null
  private previousPosition = ''
  private previousTransformStyle = ''

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host

    // A static host cannot hold an absolutely positioned overlay, and the sheen
    // has to be inside the panel so it tilts with it.
    this.previousPosition = host.style.position
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    this.previousTransformStyle = host.style.transformStyle
    host.style.transformStyle = 'preserve-3d'
    host.style.willChange = 'transform'

    const sheen = document.createElement('div')
    sheen.setAttribute('aria-hidden', 'true')
    sheen.style.cssText =
      'position:absolute;inset:0;pointer-events:none;opacity:0;border-radius:inherit;mix-blend-mode:soft-light'
    host.appendChild(sheen)
    this.sheen = sheen
  }

  resize(): void {}

  render(_t: number, opts: TiltCardOptions, pointer: Pointer): void {
    const host = this.host
    if (!host) return

    // Everything eases through one CSS transition. Nothing here integrates, so
    // the same time always produces the same declared style.
    const ease = `${Math.max(opts.ease, 0)}ms var(--ease-out-expo, cubic-bezier(0.22, 1, 0.36, 1))`
    host.style.transition = `transform ${ease}`

    if (!pointer.active) {
      host.style.transform = ''
      if (this.sheen) {
        this.sheen.style.transition = `opacity ${ease}`
        this.sheen.style.opacity = '0'
      }
      return
    }

    // Origin at the centre, so the corners are the extremes and the middle is
    // flat. x tips around the vertical axis, y around the horizontal one.
    const x = pointer.x * 2 - 1
    const y = pointer.y * 2 - 1
    const direction = opts.invert ? -1 : 1

    host.style.transform = [
      `perspective(${opts.perspective}px)`,
      `rotateX(${-y * opts.maxTilt * direction}deg)`,
      `rotateY(${x * opts.maxTilt * direction}deg)`,
      `scale(${opts.scale})`
    ].join(' ')

    if (!this.sheen) return
    if (opts.sheen <= 0) {
      this.sheen.style.opacity = '0'
      return
    }
    const size = Math.max(opts.sheenSize, 0.05) * 100
    this.sheen.style.transition = `opacity ${ease}, background ${ease}`
    this.sheen.style.background = `radial-gradient(${size}% ${size}% at ${pointer.x * 100}% ${pointer.y * 100}%, ${opts.sheenColor} 0%, transparent 100%)`
    this.sheen.style.opacity = String(opts.sheen)
  }

  teardown(): void {
    const host = this.host
    if (host) {
      host.style.transform = ''
      host.style.transition = ''
      host.style.willChange = ''
      host.style.position = this.previousPosition
      host.style.transformStyle = this.previousTransformStyle
    }
    this.sheen?.remove()
    this.sheen = null
    this.host = null
  }
}

/**
 * Mount Tilt onto `el`. The element itself is what leans, so put it on the card,
 * not on a wrapper around the card.
 *
 * ```ts
 * const tilt = createTiltCard(document.querySelector('.card')!)
 * tilt.start()
 * // …later
 * tilt.destroy()
 * ```
 *
 * `destroy()` removes the sheen and clears every style it set.
 */
export function createTiltCard(el: HTMLElement, opts: Partial<TiltCardOptions> = {}): EffectHandle {
  return mount<TiltCardOptions>(el, opts, {
    defaults: tiltCardDefaults,
    kind: 'dom',
    create: () => new TiltCardSurface()
  })
}

export default createTiltCard
```

## 2. What it is

Tilt leans a panel towards the cursor and rakes a pool of light across it as it
goes. One CSS transform and one radial gradient. No canvas, no WebGL, no npm
dependency.

The easing is a CSS transition rather than a per-frame spring. That is a
deliberate choice: nothing integrates against the previous frame, so
`renderAtTime` stays pure and the recorder scrubs the smoothing along with
everything else. A spring would look almost the same and would make the effect
impossible to record.

The sheen is a warm white by default, not a cool one. Cool white on a panel reads
as glass. Warm white reads as light falling on paper, which is the library this
belongs to.

`destroy()` removes the sheen and clears every style it set.

## 3. Wire it in

**Plain HTML.** Mount it on the card, not on a wrapper around the card. The
element itself is what leans.

```html
<article class="card">…</article>

<script type="module">
  import { createTiltCard } from './beamish/effects/tilt-card/core.js'

  const tilt = createTiltCard(document.querySelector('.card'), { maxTilt: 9 })
  tilt.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createTiltCard } from '@/beamish/effects/tilt-card/core'

export function Card({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!host.current) return
    const tilt = createTiltCard(host.current, { maxTilt: 9, sheen: 0.5 })
    tilt.start()
    return () => tilt.destroy()
  }, [])

  return <article ref={host} className="card">{children}</article>
}
```

Do not put option values in the dependency array. Call `update()` instead:

```tsx
useEffect(() => {
  tiltRef.current?.update({ maxTilt })
}, [maxTilt])
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createTiltCard } from '@/beamish/effects/tilt-card/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let tilt: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  tilt = createTiltCard(host.value, { maxTilt: 9 })
  tilt.start()
})

onBeforeUnmount(() => tilt?.destroy())
</script>

<template>
  <article ref="host" class="card"><slot /></article>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Many cards.** Mount one instance per card. Each one carries its own
`ResizeObserver` and `IntersectionObserver`, which is a few hundred bytes of
bookkeeping per card and nothing on the GPU, so a grid of twenty is fine. There
is no WebGL context involved, so the context budget does not apply here.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `maxTilt` | number | `9` | 0 to 30 deg (looks right between 5 and 14) | How far it leans at the corners. Past about 16 the text on the card starts to distort and people read it as a bug rather than a bevel. |
| `perspective` | number | `900` | 200 to 3000 px (looks right between 600 and 1400) | Perspective distance. Lower is a wider, more theatrical lens; higher flattens the lean into something closer to a skew. |
| `scale` | number | `1.02` | 0.9 to 1.2 (looks right between 1 and 1.05) | Scale while the pointer is over it. 1 is no lift. Above 1.06 the card starts covering its neighbours. |
| `sheen` | number | `0.5` | 0 to 1 (looks right between 0.3 and 0.7) | Strength of the light pool following the cursor. Zero switches the overlay off entirely. |
| `sheenColor` | color | `#ffffff` | any CSS hex | Colour of the sheen. On paper a warm white reads as light falling on the card. A cool white reads as glass, which is a different product. |
| `sheenSize` | number | `0.75` | 0.1 to 2 (looks right between 0.5 and 1.1) | How wide the light pool is, as a fraction of the panel. Small and bright reads as a torch; wide and faint reads as a window. |
| `ease` | number | `320` | 0 to 1200 ms (looks right between 200 and 450) | How long the panel takes to follow the cursor and to settle back. Zero locks it to the pointer, which feels precise and slightly cheap. |
| `invert` | boolean | `false` | `true` · `false` | Tip away from the cursor rather than towards it. Reads as pushing the card rather than lifting it. |
| `reducedMotionTime` | number | `0` | 0 to 60 s | The single frame shown when the user prefers reduced motion. At rest there is no pointer, so this draws the panel flat and unmodified, which is the right answer. |

## 5. Cleanup and SSR

`destroy()` removes the sheen element, clears the transform, transition,
`will-change`, `position` and `transform-style` it set, cancels the RAF and
disconnects both observers.

The card renders on the server as ordinary markup and looks completely normal if
the JavaScript never arrives. Call `createTiltCard` from `useEffect`, `onMounted`, or
a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`, which is 0
by default.

At `t = 0` there is no pointer, so the panel draws flat and unmodified. That is
the correct answer here: the card is still a card, it simply does not move. Do
not try to bake in a fixed lean for those users, because a permanently skewed
card reads as a rendering fault.

## 7. The three mistakes most likely to be made here

1. **Mounting it on a wrapper instead of the card.** The element you pass is the
   element that leans. Put it on the thing with the border and the padding, or
   you get a tilting invisible box with a static card inside it.

2. **Raising `maxTilt` past about 16 degrees.** Text on the card starts to
   distort and the whole thing reads as a rendering bug rather than a bevel. If
   it feels too subtle, lower `perspective` instead: that widens the lens and
   makes the same angle look like more.

3. **Overflow clipping the sheen.** The overlay inherits the panel's
   `border-radius`, but if the card has `overflow: hidden` on a child wrapper
   rather than on itself, the light pool will square off at the corners. Put the
   radius and the overflow on the same element you mount onto.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
