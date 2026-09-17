You are adding **CastShadowScene** from Beamish to this project.

> Matte forms on paper, and one sun making a full circuit of them. Backdrops · effect · MIT.
> https://beamish.ink/effects/cast-shadow-scene

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL1 or better
- three.js must already be a dependency of the project. It is not bundled
- A 2048² shadow map is allocated; on a very old integrated GPU drop it to 1024
- Falls back to a still frame under prefers-reduced-motion, handled in the runtime
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

**`src/beamish/effects/cast-shadow-scene/core.ts`**

```ts
/*
 * Sundial: Beamish
 * https://beamish.ink/effects/cast-shadow-scene
 *
 * A still life of matte forms standing on paper, lit by one sun that travels a
 * full circuit over the loop. The subject is the shadows, not the objects: they
 * lengthen, sweep and cross each other, and come back exactly where they began.
 *
 * A real three.js scene: perspective camera, meshes, materials, a shadow map,
 * rather than a full-bleed shader pretending to be one.
 */

import * as THREE from 'three'
import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type CastShadowSceneOptions = BaseOptions & {
  /** The paper the forms stand on. Match it to your page background. */
  paper: string
  /** The forms themselves. Slightly lighter than the paper reads as objects on it. */
  stone: string
  /** One form carries colour. Set it to your own brand colour. */
  accent: string
  /** Sun height above the horizon, degrees. Low means long shadows. */
  elevation: number
  /** Shadow edge softness, 0 to 1. */
  softness: number
  /** How dark the shadows fall on the paper, 0 to 1. */
  shadow: number
  /** How much of the frame the group fills, 0 to 1. */
  zoom: number
  /** Camera height, 0 is eye level with the paper, 1 is looking straight down. */
  tilt: number
  /** Seconds for one full circuit of the sun. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const castShadowSceneDefaults: CastShadowSceneOptions = {
  paper: '#fbfaf4',
  stone: '#f5f2e9',
  accent: '#c44400',
  elevation: 30,
  softness: 0.68,
  shadow: 0.3,
  zoom: 0.66,
  tilt: 0.52,
  period: 5,
  reducedMotionTime: 1.1
}

/*
 * The arrangement is written down rather than generated. A seeded random layout
 * gives you a different mediocre composition every time; this one was placed by
 * hand until it read as a still life from every azimuth the sun visits.
 *
 * x/z are on the paper, h is height, r is footprint radius.
 */
type Form = {
  kind: 'cylinder' | 'box' | 'cone' | 'torus' | 'sphere'
  x: number
  z: number
  h: number
  r: number
  spin: number
  /** Multiplier on the stone colour. A still life is never one flat tone. */
  tone: number
  accent?: boolean
}

const FORMS: Form[] = [
  { kind: 'cylinder', x: -0.95, z: -0.15, h: 1.55, r: 0.2, spin: 0, tone: 1 },
  { kind: 'box', x: -0.15, z: 0.62, h: 0.95, r: 0.34, spin: 0.35, tone: 0.965 },
  { kind: 'cone', x: 0.78, z: -0.55, h: 1.32, r: 0.4, spin: 0, tone: 1.01 },
  { kind: 'sphere', x: -0.72, z: 1.28, h: 0.72, r: 0.36, spin: 0, tone: 1, accent: true },
  { kind: 'torus', x: 1.4, z: 0.5, h: 0.98, r: 0.36, spin: -0.6, tone: 0.98 },
  { kind: 'cylinder', x: -1.62, z: 0.82, h: 0.7, r: 0.28, spin: 0, tone: 1.02 },
  { kind: 'box', x: 1.05, z: 1.3, h: 0.42, r: 0.23, spin: 0.9, tone: 0.95 }
]

const TAU = Math.PI * 2
const DEG = Math.PI / 180

function geometryFor(form: Form): THREE.BufferGeometry {
  switch (form.kind) {
    case 'cylinder':
      return new THREE.CylinderGeometry(form.r, form.r, form.h, 48)
    case 'box':
      return new THREE.BoxGeometry(form.r * 2, form.h, form.r * 2)
    case 'cone':
      return new THREE.ConeGeometry(form.r, form.h, 48)
    case 'sphere':
      return new THREE.SphereGeometry(form.h / 2, 48, 32)
    case 'torus':
      return new THREE.TorusGeometry(form.h / 2 - form.r / 2, form.r / 2, 24, 72)
  }
}

class CastShadowSceneSurface implements Surface<CastShadowSceneOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private sun: THREE.DirectionalLight | null = null
  private bounce: THREE.DirectionalLight | null = null
  private fill: THREE.HemisphereLight | null = null
  private ground: THREE.Mesh | null = null
  private meshes: THREE.Mesh[] = []
  private aspect = 1

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('Sundial needs a canvas')
    const renderer = new THREE.WebGLRenderer({
      canvas: ctx.canvas,
      antialias: true,
      alpha: false,
      // The recorder reads pixels back after the draw, and without this the
      // buffer may already have been cleared.
      preserveDrawingBuffer: true,
      powerPreference: 'low-power'
    })
    // The runtime owns sizing and has already capped DPR, so three must not
    // apply a device pixel ratio of its own on top.
    renderer.setPixelRatio(1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    // No tone mapping on purpose: filmic curves pull white paper towards grey,
    // and paper staying paper is the whole premise.
    renderer.toneMapping = THREE.NoToneMapping
    renderer.shadowMap.enabled = true
    /*
     * PCF, not PCFSoft. They sound the other way round, but shadow.radius is
     * only read by the PCF branch of three's shadow shader: under PCFSoft the
     * kernel is fixed and the softness control silently does nothing.
     */
    renderer.shadowMap.type = THREE.PCFShadowMap

    const scene = new THREE.Scene()

    const camera = new THREE.PerspectiveCamera(26, 1, 0.5, 60)

    // Sky/ground hemisphere rather than a flat ambient: it puts a faint bounce
    // from the paper onto the undersides, which is what stops the forms looking
    // pasted on.
    const fill = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.05)

    // A dim second light directly opposite the sun, standing in for bounce off
    // the paper. Without it the shaded sides go dead and the forms read as
    // cut-outs; with it they read as objects in a room.
    const bounce = new THREE.DirectionalLight(0xffffff, 0.42)

    const sun = new THREE.DirectionalLight(0xfff6e8, 2.5)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const extent = 5
    const shadowCamera = sun.shadow.camera as THREE.OrthographicCamera
    shadowCamera.left = -extent
    shadowCamera.right = extent
    shadowCamera.top = extent
    shadowCamera.bottom = -extent
    shadowCamera.near = 0.5
    shadowCamera.far = 26
    // Normal bias rather than a constant bias: the ground is a single large
    // plane and a constant bias detaches contact shadows from their objects.
    sun.shadow.normalBias = 0.02
    sun.shadow.bias = -0.0004
    scene.add(sun)
    scene.add(sun.target)
    scene.add(bounce)
    scene.add(fill)

    /*
     * The ground is a ShadowMaterial, not a lit surface. A lit plane picks up the
     * sun at a grazing angle and comes out somewhere around 85% of its own
     * colour, a warm grey, not paper. This way the paper is exactly the colour
     * asked for and the shadow is the only thing drawn on it, which is both more
     * accurate and far easier to art-direct.
     */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShadowMaterial({ opacity: 0.26, color: 0x3a3026 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    const meshes: THREE.Mesh[] = []
    for (const form of FORMS) {
      const mesh = new THREE.Mesh(
        geometryFor(form),
        new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 })
      )
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.position.set(form.x, form.kind === 'sphere' ? form.h / 2 : form.h / 2, form.z)
      if (form.kind === 'torus') mesh.position.y = form.h / 2
      mesh.rotation.y = form.spin
      mesh.userData['form'] = form
      scene.add(mesh)
      meshes.push(mesh)
    }

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.sun = sun
    this.bounce = bounce
    this.fill = fill
    this.ground = ground
    this.meshes = meshes
  }

  resize(size: { pixelWidth: number; pixelHeight: number }): void {
    this.aspect = size.pixelWidth / size.pixelHeight
    this.renderer?.setSize(size.pixelWidth, size.pixelHeight, false)
    if (this.camera) {
      this.camera.aspect = this.aspect
      this.camera.updateProjectionMatrix()
    }
  }

  render(t: number, opts: CastShadowSceneOptions): void {
    const { renderer, scene, camera, sun, ground } = this
    if (!renderer || !scene || !camera || !sun || !ground) return

    scene.background = new THREE.Color(opts.paper)
    ;(ground.material as THREE.ShadowMaterial).opacity = opts.shadow

    for (const mesh of this.meshes) {
      const form = mesh.userData['form'] as Form
      const material = mesh.material as THREE.MeshStandardMaterial
      material.color.set(form.accent ? opts.accent : opts.stone)
      if (!form.accent) material.color.multiplyScalar(form.tone)
    }

    // The sun makes one complete circuit per period, so the last frame of a loop
    // is the frame before the first and there is no seam to hide.
    const azimuth = TAU * (t / Math.max(opts.period, 0.001))
    const elevation = opts.elevation * DEG
    const distance = 12
    sun.position.set(
      Math.cos(azimuth) * distance * Math.cos(elevation),
      distance * Math.sin(elevation),
      Math.sin(azimuth) * distance * Math.cos(elevation)
    )
    sun.target.position.set(0, 0.4, 0)
    sun.target.updateMatrixWorld()
    sun.shadow.radius = 1 + opts.softness * 7
    this.bounce?.position.set(-sun.position.x, distance * 0.45, -sun.position.z)

    /*
     * Frame the group rather than the viewport. Portrait and landscape need very
     * different camera distances for the same composition, and a single fixed
     * position gives you a good 16:9 and a useless 9:16.
     */
    const reach = 4.6 / Math.max(opts.zoom, 0.05)
    const widthFit = this.aspect < 1 ? reach / Math.max(this.aspect, 0.35) : reach
    const height = 0.5 + opts.tilt * 9
    camera.position.set(0, height, widthFit)
    camera.lookAt(0, 0.3, 0)

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return (this.renderer?.getContext() as WebGL2RenderingContext | undefined) ?? null
  }

  teardown(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    this.meshes = []
    if (this.ground) {
      this.ground.geometry.dispose()
      ;(this.ground.material as THREE.Material).dispose()
      this.ground = null
    }
    this.sun?.shadow.map?.dispose()
    this.sun?.dispose()
    this.bounce?.dispose()
    this.fill?.dispose()
    this.scene?.clear()
    // Frees three's own GPU objects. The runtime then hands the context itself
    // back to the browser, which is the part that matters for the context budget.
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.sun = null
    this.fill = null
  }
}

/**
 * Mount Sundial into `el`. The element needs a size. Give it width and height
 * in CSS, not just content.
 *
 * ```ts
 * const sundial = createCastShadowScene(document.querySelector('#hero')!)
 * sundial.start()
 * // …later
 * sundial.destroy()
 * ```
 */
export function createCastShadowScene(el: HTMLElement, opts: Partial<CastShadowSceneOptions> = {}): EffectHandle {
  return mount<CastShadowSceneOptions>(el, opts, {
    defaults: castShadowSceneDefaults,
    create: () => new CastShadowSceneSurface()
  })
}

export default createCastShadowScene
```

## 2. What it is

Sundial is a still life. Seven matte forms stand on paper, lit by one sun that
makes a complete circuit over the loop. The forms never move. The shadows are the
subject: they lengthen, swing round, cross each other, and arrive back exactly
where they started.

It is a real three.js scene. A perspective camera, seven meshes, standard
materials, a directional light with a shadow map, and a dim bounce light standing
in for light coming back off the paper. Not a full-bleed shader pretending to be
three-dimensional.

The paper is never lit. It is the scene background, and the ground plane is a
`ShadowMaterial` that draws nothing but the shadow. A lit plane picks up the sun
at a grazing angle and lands around 85% of its own colour, which on warm paper is
a warm grey. This way the paper comes out the colour you asked for.

The forms sit in the middle and the sun keeps the edges clear, so there is room
for a headline over the top. That is what it is for.

## 3. Wire it in

**Plain HTML.** three.js must already be available to your build. This file
imports it and does not bundle it.

```html
<div id="hero" style="width: 100%; aspect-ratio: 16 / 9"></div>

<script type="module">
  import { createCastShadowScene } from './beamish/effects/cast-shadow-scene/core.js'

  const sundial = createCastShadowScene(document.querySelector('#hero'), {
    accent: '#c44400'
  })
  sundial.start()
</script>
```

**React.** Start in an effect. Destroy in its cleanup. StrictMode runs the effect
twice in development. That is fine, because `destroy()` fully releases the
context, which is the case StrictMode exists to catch.

```tsx
import { useEffect, useRef } from 'react'
import { createCastShadowScene } from '@/beamish/effects/cast-shadow-scene/core'

export function Hero() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sundial = createCastShadowScene(host.current, { accent: '#c44400' })
    sundial.start()
    return () => sundial.destroy()
  }, [])

  return <div ref={host} className="aspect-video w-full" />
}
```

Do not put option values in the dependency array. That tears the WebGL context
down and rebuilds the whole scene on every keystroke. Call `update()` instead:

```tsx
useEffect(() => {
  sundialRef.current?.update({ elevation })
}, [elevation])
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createCastShadowScene } from '@/beamish/effects/cast-shadow-scene/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let sundial: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sundial = createCastShadowScene(host.value, { accent: '#c44400' })
  sundial.start()
})

onBeforeUnmount(() => sundial?.destroy())
</script>

<template>
  <div ref="host" class="hero" />
</template>
```

**Astro.** Nothing extra is required. Use the React or Vue file as an island with
`client:visible`, or call `createCastShadowScene` from a plain `<script>` in the page. The
core is a standard ES module.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper the forms stand on. Match it to your page background or the panel reads as a pasted-in rectangle. |
| `stone` | color | `#f5f2e9` | any CSS hex | The forms. Slightly lighter than the paper is what makes them read as objects standing on it rather than holes cut in it. |
| `accent` | color | `#c44400` | any CSS hex | One form carries colour. This is the obvious place to put your own brand colour. |
| `elevation` | number | `30` | 8 to 80 deg (looks right between 22 and 45) | How high the sun sits. Low is long dramatic shadows; above about 60 the shadows disappear under the objects and the whole thing goes flat. |
| `softness` | number | `0.68` | 0 to 1 (looks right between 0.35 and 0.75) | Shadow edge softness. Zero is a hard midday edge, one is heavy overcast. |
| `shadow` | number | `0.3` | 0 to 1 (looks right between 0.18 and 0.45) | How dark the shadows fall on the paper. The paper is never lit. It stays exactly the colour you set, so the shadow is the only thing drawn on it. |
| `zoom` | number | `0.66` | 0.3 to 1.6 (looks right between 0.6 and 1) | How much of the frame the group fills. |
| `tilt` | number | `0.52` | 0 to 1 (looks right between 0.2 and 0.55) | Camera height. Zero is eye level with the paper, one looks straight down. Around 0.35 is a table seen from a chair. |
| `period` | number | `5` | 2 to 120 s (looks right between 5 and 30) | Seconds for one full circuit of the sun. The default is 5 so the preview video is a whole cycle. Use 20 to 30 for something you leave running behind a page. |
| `reducedMotionTime` | number | `1.1` | 0 to 120 s | The single frame shown when the user prefers reduced motion. Pick a sun angle that composes. For those users the still is the whole effect. |

## 5. Cleanup and SSR

Call `destroy()`. It disposes every geometry, material and shadow map, disposes
the three.js renderer, then releases the WebGL context itself.

A page that mounts and unmounts scenes without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createCastShadowScene` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

The runtime pauses the loop when the element scrolls offscreen and when the tab
is hidden, so the shadow map is not being redrawn behind a modal.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A and it applies here. Content that moves for more than five
seconds must be pausable. `stop()` and `start()` are on the handle for that.
Surface them as a real control in your own build. A small button in the corner is
enough.

Reduced motion does not cover this. Plenty of people who need a pause button have
not set that preference.

Handled in the runtime with a live `matchMedia` listener, so changing the OS
setting mid-session takes effect without a reload. Under reduced motion the loop
never starts and one frame is drawn instead, the one at `reducedMotionTime`.

This effect degrades better than most. One frame of it is a photograph, which is
a perfectly good thing for a hero to be. Choose a sun angle where the shadows
rake across the composition rather than hiding behind the forms.

## 7. The three mistakes most likely to be made here

1. **Not installing three.js, or installing a version older than 0.160.** This
   file imports `three` and does not bundle it. `ShadowMaterial`, `SRGBColorSpace`
   and the current light-intensity model all need a recent version. On an old one
   the scene renders about twice as dark and nothing obviously errors.

2. **Mounting into an element with no height.** The canvas is `width: 100%;
   height: 100%`. A `<div>` with no content and no CSS height is zero pixels tall
   and renders nothing. Give the host an `aspect-ratio` or an explicit height.

3. **Raising `elevation` to see it better.** Above about 60 degrees the sun is
   nearly overhead, the shadows vanish underneath the forms, and the scene goes
   flat. If it looks too dark, lower `shadow` towards 0.2 or lighten `stone`. Do
   not move the sun up.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
