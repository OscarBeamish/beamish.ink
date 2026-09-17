You are adding **Magnet** from Beamish to this project.

> An element that leans towards the cursor before the cursor arrives. Pointer · effect · MIT.
> https://beamish.ink/effects/magnet

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. One CSS transform
- Reads the pointer at window scope, because the point is reacting to a cursor that is still outside the element
- The easing is a CSS transition rather than a per-frame spring, so nothing integrates and renderAtTime stays pure
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

**`src/beamish/effects/magnet/core.ts`**

```ts
/*
 * Magnet: Beamish
 * https://beamish.ink/effects/magnet
 *
 * An element that leans towards the cursor before the cursor arrives, and lets
 * go once it has passed. No canvas, no WebGL, no dependencies.
 *
 * It reads the pointer at window scope, because the whole point is reacting to a
 * cursor that is still outside the element. The runtime reports element-relative
 * coordinates that go past 0 and 1, so "how far outside" is a number rather than
 * a guess.
 *
 * Easing is a CSS transition rather than a per-frame spring, which keeps
 * `renderAtTime` pure in `t` and lets the recorder scrub the smoothing.
 */

import { mount, type BaseOptions, type EffectHandle, type Pointer, type Surface } from '../../shared/runtime'

export type MagnetOptions = BaseOptions & {
  /**
   * How far outside the element the pull starts, as a multiple of its own size.
   * 1 means one element-width of empty space around it.
   */
  reach: number
  /** How far the element travels towards the cursor, as a fraction of the gap. */
  strength: number
  /** Cap on the travel in pixels, whatever the strength works out to. */
  maxShift: number
  /** Scale at full pull. 1 is no growth. */
  scale: number
  /** Degrees of lean at full pull. Zero keeps it upright. */
  rotate: number
  /** Milliseconds to follow the cursor, and to let go. */
  ease: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const magnetDefaults: MagnetOptions = {
  reach: 1.1,
  strength: 0.34,
  maxShift: 26,
  scale: 1.04,
  rotate: 0,
  ease: 420,
  pointerScope: 'window',
  reducedMotionTime: 0
}

class MagnetSurface implements Surface<MagnetOptions> {
  private host: HTMLElement | null = null

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    ctx.host.style.willChange = 'transform'
  }

  resize(): void {}

  render(_t: number, opts: MagnetOptions, pointer: Pointer): void {
    const host = this.host
    if (!host) return

    const ease = `${Math.max(opts.ease, 0)}ms var(--ease-out-expo, cubic-bezier(0.22, 1, 0.36, 1))`
    host.style.transition = `transform ${ease}`

    if (!pointer.active) {
      host.style.transform = ''
      return
    }

    // Distance from the element's centre, in element widths and heights. Zero is
    // dead centre, 0.5 is the edge, 1.5 is one full element outside it.
    const dx = pointer.x - 0.5
    const dy = pointer.y - 0.5
    const distance = Math.hypot(dx, dy)

    // The pull starts at the edge of the reach and rises to full at the centre.
    const edge = 0.5 + Math.max(opts.reach, 0)
    const pull = Math.max(0, 1 - distance / edge)
    if (pull <= 0) {
      host.style.transform = ''
      return
    }

    // Eased so the element does not twitch the instant the cursor enters range.
    const strength = pull * pull * opts.strength
    const rect = host.getBoundingClientRect()
    const shiftX = Math.max(
      -opts.maxShift,
      Math.min(opts.maxShift, dx * rect.width * strength)
    )
    const shiftY = Math.max(
      -opts.maxShift,
      Math.min(opts.maxShift, dy * rect.height * strength)
    )

    const scale = 1 + (opts.scale - 1) * pull
    const lean = opts.rotate === 0 ? '' : ` rotate(${dx * opts.rotate * pull * 2}deg)`
    host.style.transform = `translate(${shiftX}px, ${shiftY}px) scale(${scale})${lean}`
  }

  teardown(): void {
    if (this.host) {
      this.host.style.transform = ''
      this.host.style.transition = ''
      this.host.style.willChange = ''
    }
    this.host = null
  }
}

/**
 * Mount Magnet onto `el`. The element itself is what moves, so put it on the
 * button, not on a wrapper around the button.
 *
 * ```ts
 * const magnet = createMagnet(document.querySelector('.cta')!)
 * magnet.start()
 * // …later
 * magnet.destroy()
 * ```
 */
export function createMagnet(el: HTMLElement, opts: Partial<MagnetOptions> = {}): EffectHandle {
  return mount<MagnetOptions>(el, opts, {
    defaults: magnetDefaults,
    kind: 'dom',
    create: () => new MagnetSurface()
  })
}

export default createMagnet
```

## 2. What it is

Magnet leans an element towards the cursor before the cursor gets there, and lets
go once it has passed. One CSS transform. No canvas, no WebGL, no npm dependency.

It reads the pointer at window scope rather than element scope, because the whole
point is reacting to a cursor that is still outside. The runtime reports
element-relative coordinates that go past 0 and 1, so "one and a half element
widths away, up and to the right" is a number rather than a guess.

The easing is a CSS transition, not a per-frame spring. Nothing integrates
against the previous frame, so `renderAtTime` stays pure and the recorder can
scrub it. The release is what people actually notice, and a transition handles
the release better than most springs do.

`destroy()` clears every style it set.

## 3. Wire it in

**Plain HTML.** Mount it on the element that should move, not on a wrapper.

```html
<button class="cta">Get prompt</button>

<script type="module">
  import { createMagnet } from './beamish/effects/magnet/core.js'

  const magnet = createMagnet(document.querySelector('.cta'))
  magnet.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createMagnet } from '@/beamish/effects/magnet/core'

export function Cta({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!host.current) return
    const magnet = createMagnet(host.current, { strength: 0.34 })
    magnet.start()
    return () => magnet.destroy()
  }, [])

  return <button ref={host}>{children}</button>
}
```

Do not put option values in the dependency array. Call `update()` instead.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createMagnet } from '@/beamish/effects/magnet/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let magnet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  magnet = createMagnet(host.value)
  magnet.start()
})

onBeforeUnmount(() => magnet?.destroy())
</script>

<template>
  <button ref="host"><slot /></button>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Several of them.** One instance per element. Each holds a window-scoped
`pointermove` listener, so a page with thirty magnets has thirty listeners
running on every mouse move. That is fine for a handful of buttons and wrong for
a grid of cards; for a grid, mount one Magnet on the grid itself.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `reach` | number | `1.1` | 0 to 4 (looks right between 0.6 and 1.6) | How far outside the element the pull starts, as a multiple of its own size. 1 is one element-width of empty space around it. Large values on a small button make it twitch at things happening on the other side of the page. |
| `strength` | number | `0.34` | 0 to 1 (looks right between 0.2 and 0.5) | How far the element travels towards the cursor, as a fraction of the gap. Above 0.6 the cursor can never catch it, which is funny once and annoying afterwards. |
| `maxShift` | number | `26` | 0 to 120 px (looks right between 15 and 40) | Cap on the travel, whatever the strength works out to. This is what stops a wide element sliding out of its own layout. |
| `scale` | number | `1.04` | 0.9 to 1.4 (looks right between 1 and 1.08) | Scale at full pull. 1 is no growth. |
| `rotate` | number | `0` | 0 to 20 deg (looks right between 0 and 6) | Degrees of lean at full pull, following the cursor left and right. Off by default: on text it reads as a wobble rather than a lean. |
| `ease` | number | `420` | 0 to 1500 ms (looks right between 280 and 600) | How long it takes to follow the cursor, and to let go. Low is a rubber band; high is treacle. The release matters more than the catch. |
| `reducedMotionTime` | number | `0` | 0 to 60 s | The single frame shown when the user prefers reduced motion. At rest there is no pointer, so this draws the element unmoved, which is the right answer. |

## 5. Cleanup and SSR

`destroy()` clears the transform, transition and `will-change`, removes the
window listener, cancels the RAF and disconnects both observers.

The window listener is the one worth being careful about. An element that unmounts
without `destroy()` leaves a `pointermove` handler running for the life of the
page, holding a reference to a node that is no longer in the document.

The element renders on the server as ordinary markup and behaves completely
normally without JavaScript. Call `createMagnet` from `useEffect`, `onMounted`,
or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`, which is 0.

At `t = 0` there is no pointer, so the element draws unmoved. That is the right
answer: the button is still a button, it simply does not chase anything.

## 7. The three mistakes most likely to be made here

1. **Putting it on a large element.** Magnet moves the whole element, and on a
   full-width bar that means shunting the layout sideways. It is for buttons,
   icons and small marks. `maxShift` caps the damage but does not make it a good
   idea.

2. **Raising `strength` past about 0.6.** The element then outruns the cursor and
   can never be clicked, which is funny exactly once. If you want more presence,
   raise `scale` or `reach` instead.

3. **Mounting one per card in a grid.** Each instance adds a window-scoped
   `pointermove` listener. Thirty of them fire thirty times per mouse move. Mount
   one on the grid and move the grid, or use a hover state instead.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
