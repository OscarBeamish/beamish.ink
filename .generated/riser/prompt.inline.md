You are adding **Riser** from Beamish to this project.

> Children arrive on a stagger, held until the container is on screen. Reveals · effect · MIT.
> https://beamish.ink/effects/riser

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. It moves the children already in the element
- No IntersectionObserver of its own: the runtime already holds the loop until the element is on screen
- destroy() clears every style it set, leaving the children as they were found
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
  /** 0 to 1 across the element, origin top-left. Centre until first move. */
  x: number
  y: number
  /** False until the pointer has entered, so effects can idle sensibly. */
  active: boolean
}

/** One sample of a scripted cursor path. `t` is seconds; x/y are 0 to 1. */
export type PointerKey = { t: number; x: number; y: number }

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
  render(t: number, opts: O, pointer: Pointer): void
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
  /** Frame shown when the user prefers reduced motion. Pick one that composes. */
  reducedMotionTime?: number
  /** Cap on device pixel ratio. Above 2 the cost is real and the gain is not. */
  maxDpr?: number
  /** Set false to opt out of pausing when scrolled offscreen. */
  pauseWhenOffscreen?: boolean
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

  function draw(t: number) {
    if (!surface || contextLost) return
    surface.render(t, opts, pointerAt(t))
  }

  function tick(stamp: number) {
    if (!running) return
    elapsed += Math.min(stamp - lastStamp, 100) / 1000 // clamp tab-switch spikes
    lastStamp = stamp
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

  const onPointerMove = (event: PointerEvent) => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    pointer.x = clamp01((event.clientX - rect.left) / rect.width)
    pointer.y = clamp01((event.clientY - rect.top) / rect.height)
    pointer.active = true
  }

  const onPointerLeave = () => {
    pointer.active = false
  }

  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerleave', onPointerLeave)

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
      el.removeEventListener('pointermove', onPointerMove)
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

**`src/beamish/effects/riser/core.ts`**

```ts
/*
 * Riser: Beamish
 * https://beamish.ink/effects/riser
 *
 * Children arrive on a stagger. The plainest thing in the library and the one
 * most pages actually need.
 *
 * No canvas and no dependencies. It takes a container, finds the elements to
 * animate, and moves them. There is no IntersectionObserver here on purpose: the
 * runtime already holds the loop until the element is on screen, so calling
 * start() on mount gives a scroll-triggered reveal with no extra code.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type RiserOrder = 'forward' | 'reverse' | 'centre'

export type RiserOptions = BaseOptions & {
  /** CSS selector for the children to animate. Empty means direct children. */
  select: string
  /** The order children arrive in. */
  order: RiserOrder
  /** Milliseconds between one child and the next. */
  stagger: number
  /** Milliseconds each child takes on its own. */
  duration: number
  /** How far each child travels, in pixels. Negative falls from above. */
  rise: number
  /** Scale each child starts at. 1 is no scaling. */
  scale: number
  /** Blur each child starts at, in pixels. */
  blur: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const riserDefaults: RiserOptions = {
  select: '',
  order: 'forward',
  stagger: 90,
  duration: 900,
  rise: 34,
  scale: 1,
  blur: 0,
  reducedMotionTime: 999
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Matches --ease-out-expo. The one easing this library uses for arrivals. */
const easeOutExpo = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k))

class RiserSurface implements Surface<RiserOptions> {
  private children: HTMLElement[] = []
  private host: HTMLElement | null = null
  private selectedWith: string | null = null

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
  }

  private collect(select: string): void {
    const host = this.host
    if (!host || this.selectedWith === select) return
    this.children = select
      ? Array.from(host.querySelectorAll<HTMLElement>(select))
      : (Array.from(host.children) as HTMLElement[])
    for (const child of this.children) child.style.willChange = 'transform, opacity'
    this.selectedWith = select
  }

  resize(): void {}

  render(t: number, opts: RiserOptions): void {
    this.collect(opts.select)
    const count = this.children.length
    if (count === 0) return

    const stagger = opts.stagger / 1000
    const duration = Math.max(opts.duration, 1) / 1000
    const middle = (count - 1) / 2

    for (let i = 0; i < count; i++) {
      const child = this.children[i]!
      const rank =
        opts.order === 'reverse'
          ? count - 1 - i
          : opts.order === 'centre'
            ? Math.round(Math.abs(i - middle))
            : i

      const progress = easeOutExpo(clamp01((t - rank * stagger) / duration))
      const remaining = 1 - progress

      child.style.opacity = String(progress)
      const shift = remaining * opts.rise
      const scale = 1 - remaining * (1 - opts.scale)
      child.style.transform =
        scale === 1 ? `translateY(${shift}px)` : `translateY(${shift}px) scale(${scale})`
      // Dropping the filter once a child has landed matters: a permanent
      // blur(0px) still forces every one of them onto its own layer.
      child.style.filter = opts.blur > 0 && remaining > 0.01 ? `blur(${remaining * opts.blur}px)` : ''
    }
  }

  teardown(): void {
    for (const child of this.children) {
      child.style.opacity = ''
      child.style.transform = ''
      child.style.filter = ''
      child.style.willChange = ''
    }
    this.children = []
    this.selectedWith = null
    this.host = null
  }
}

/**
 * Mount Riser into `el`. Its children are what move.
 *
 * ```ts
 * const riser = createRiser(document.querySelector('.grid')!)
 * riser.start()
 * // …later
 * riser.destroy()
 * ```
 *
 * `destroy()` clears every style it set, so the children are left as they were
 * found.
 */
export function createRiser(el: HTMLElement, opts: Partial<RiserOptions> = {}): EffectHandle {
  return mount<RiserOptions>(el, opts, {
    defaults: riserDefaults,
    kind: 'dom',
    create: () => new RiserSurface()
  })
}

export default createRiser
```

## 2. What it is

Riser brings a container's children in on a stagger. It is the plainest thing in
this library and the one most pages actually need.

There is no canvas, no WebGL and no npm dependency. It takes a container, finds
the children, and moves them.

There is no `IntersectionObserver` in it either, which is the part worth knowing.
The runtime already has one: it holds the loop until the element is on screen. So
calling `start()` on mount gives you a scroll-triggered reveal, and adding your
own observer on top would only fight it.

`destroy()` clears every style it set. The children are left as they were found.

## 3. Wire it in

**Plain HTML.**

```html
<div id="grid">
  <article>…</article>
  <article>…</article>
  <article>…</article>
</div>

<script type="module">
  import { createRiser } from './beamish/effects/riser/core.js'

  const riser = createRiser(document.querySelector('#grid'))
  riser.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createRiser } from '@/beamish/effects/riser/core'

export function Grid({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const riser = createRiser(host.current, { stagger: 90, rise: 34 })
    riser.start()
    return () => riser.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

If the children are fetched and the list changes length, destroy and remount. The
selection is taken once, on the first frame.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createRiser } from '@/beamish/effects/riser/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let riser: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  riser = createRiser(host.value)
  riser.start()
})

onBeforeUnmount(() => riser?.destroy())
</script>

<template>
  <div ref="host"><slot /></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Playing it again.** Riser runs once from `t = 0`:

```ts
riser.stop()
riser.renderAtTime(0)
riser.start()
```

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `select` | string | `` | any value | CSS selector for the children to animate, scoped to the container. Empty means every direct child, which is what you want most of the time. |
| `order` | enum | `forward` | `forward` · `reverse` · `centre` | The order children arrive in. `centre` starts in the middle and works outwards, which suits a row of three or five. |
| `stagger` | number | `90` | 0 to 400 ms (looks right between 60 and 140) | Milliseconds between one child and the next. Past about 150 a list of eight takes over a second to finish and people start scrolling away from it. |
| `duration` | number | `900` | 100 to 3000 ms (looks right between 600 and 1100) | Milliseconds each child takes on its own. |
| `rise` | number | `34` | -120 to 120 px (looks right between 20 and 50) | How far each child travels. Negative falls from above. Large values read as a page that has not finished loading. |
| `scale` | number | `1` | 0.5 to 1.5 (looks right between 0.94 and 1.06) | Scale each child starts at. 1 is no scaling. Anything below 0.9 makes text resample and look soft on the way in. |
| `blur` | number | `0` | 0 to 20 (looks right between 0 and 6) | Blur each child starts at. Off by default: on a card with an image inside, a blur costs far more than the transform does. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot reveal this should be a time after the animation has finished, so the content simply appears. |

## 5. Cleanup and SSR

`destroy()` clears opacity, transform, filter and `will-change` from every child,
cancels the RAF, and disconnects both observers. There is no GPU resource to
release.

The content renders on the server as ordinary markup and stays visible if the
JavaScript never arrives, because the styles are only applied on the first frame.
Call `createRiser` from `useEffect`, `onMounted`, or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For a one-shot reveal that default is 999, which is any time after the animation
has finished. The content simply appears. Do not set it to 0: that leaves the
whole container invisible for anyone who has asked for less motion, which is the
worst possible outcome of a motion preference.

## 7. The three mistakes most likely to be made here

1. **Adding your own `IntersectionObserver`.** The runtime has one. Yours will
   start the loop while the element is offscreen, the animation will finish
   before anyone sees it, and the content will simply be there when they scroll
   down.

2. **Mounting it on a container whose children arrive later.** The selection is
   taken on the first frame. If the list is fetched, mount after the data lands,
   or destroy and remount when it changes.

3. **Setting `reducedMotionTime` to 0.** That is the frame before anything has
   arrived, so the content stays invisible. It wants to be a time after the
   animation ends.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
