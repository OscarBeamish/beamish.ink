You are adding **Swell** from Beamish to this project.

> A field of matte forms on paper, rippling around the cursor. Pointer · effect · MIT.
> https://beamish.ink/effects/swell

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL1 or better
- three.js must already be a dependency of the project. It is not bundled
- One InstancedMesh, so 324 forms cost one draw call and one shadow pass
- The ripple is a standing wave centred on the cursor, not a propagating one with memory. renderAtTime has to be pure in t, and a wave with history is not
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

**`src/beamish/effects/swell/core.ts`**

```ts
/*
 * Swell: Beamish
 * https://beamish.ink/effects/swell
 *
 * A field of matte forms standing on paper, rippling around the cursor. Real
 * three.js: one instanced mesh, a directional light and a shadow map, in the same
 * family as Sundial.
 *
 * The ripple is a standing wave centred on the pointer rather than a propagating
 * one with memory. That is a deliberate constraint, not a shortcut: a wave with
 * history integrates against the previous frame, and `renderAtTime` has to be
 * pure in `t` or the recorder cannot drive it. A standing wave that follows the
 * cursor is indistinguishable at a glance and reproducible to the pixel.
 *
 * Concept credit: Interactive Wave Propagation Cube Grid, Codrops, July 2026.
 * Written from scratch.
 */

import * as THREE from 'three'
import { mount, type BaseOptions, type EffectHandle, type Pointer, type Surface } from '../../shared/runtime'

export type SwellForm = 'cylinder' | 'box'

export type SwellOptions = BaseOptions & {
  /** The paper the field stands on. Match it to your page background. */
  paper: string
  /** The forms at rest. */
  stone: string
  /** The forms at the crest of the ripple. */
  accent: string
  /** Forms per side. 24 is 576 of them, which is the sensible ceiling. */
  count: number
  /** Shape of each form. */
  form: SwellForm
  /** Width of each form as a fraction of its cell. */
  thickness: number
  /** Height of a form at rest. */
  base: number
  /** How far the crest rises above the base. */
  amplitude: number
  /** Rings per unit of distance. Higher is a tighter ripple. */
  frequency: number
  /** How quickly the ripple fades with distance from the cursor. */
  falloff: number
  /** Sun height above the horizon, degrees. */
  elevation: number
  /** How dark the shadows fall on the paper, 0 to 1. */
  shadow: number
  /** Shadow edge softness, 0 to 1. */
  softness: number
  /** Camera height. 0 is eye level with the paper, 1 looks straight down. */
  tilt: number
  /** How much of the frame the field fills. */
  zoom: number
  /** Seconds for one loop of the idle swell. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const swellDefaults: SwellOptions = {
  paper: '#fbfaf4',
  stone: '#f2efe6',
  accent: '#c44400',
  count: 18,
  form: 'cylinder',
  thickness: 0.58,
  base: 0.14,
  amplitude: 1.9,
  frequency: 1.9,
  falloff: 0.26,
  elevation: 36,
  shadow: 0.26,
  softness: 0.5,
  tilt: 0.6,
  zoom: 0.8,
  period: 5,
  reducedMotionTime: 1.4
}

const TAU = Math.PI * 2
const DEG = Math.PI / 180
/** Whole cycles of the idle swell per loop. An integer keeps the loop closed. */
const IDLE_CYCLES = 2

class SwellSurface implements Surface<SwellOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private sun: THREE.DirectionalLight | null = null
  private fill: THREE.HemisphereLight | null = null
  private ground: THREE.Mesh | null = null
  private field: THREE.InstancedMesh | null = null
  private dummy = new THREE.Object3D()
  private colour = new THREE.Color()
  private stone = new THREE.Color()
  private crest = new THREE.Color()
  private builtFor = ''
  private aspect = 1

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('Swell needs a canvas')

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
    // No tone mapping: filmic curves pull white paper towards grey, and paper
    // staying paper is the premise of the whole library.
    renderer.toneMapping = THREE.NoToneMapping
    renderer.shadowMap.enabled = true
    /*
     * PCF, not PCFSoft. They sound the other way round, but shadow.radius is
     * only read by the PCF branch of three's shadow shader: under PCFSoft the
     * kernel is fixed and the softness control silently does nothing.
     */
    renderer.shadowMap.type = THREE.PCFShadowMap

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(28, 1, 0.5, 120)

    const fill = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.15)
    const sun = new THREE.DirectionalLight(0xfff6e8, 2.2)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const extent = 14
    const shadowCamera = sun.shadow.camera as THREE.OrthographicCamera
    shadowCamera.left = -extent
    shadowCamera.right = extent
    shadowCamera.top = extent
    shadowCamera.bottom = -extent
    shadowCamera.near = 0.5
    shadowCamera.far = 60
    sun.shadow.normalBias = 0.03
    sun.shadow.bias = -0.0005
    scene.add(sun, sun.target, fill)

    /*
     * The ground draws the shadow and nothing else. A lit plane picks the sun up
     * at a grazing angle and lands around 85% of its own colour, which on warm
     * paper is a warm grey.
     */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.26, color: 0x3a3026 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.sun = sun
    this.fill = fill
    this.ground = ground
  }

  /*
   * Rebuilding the instanced mesh is the only expensive thing here, so it
   * happens when the shape or the count changes and never per frame.
   */
  private buildField(opts: SwellOptions): void {
    const scene = this.scene
    if (!scene) return
    const signature = `${opts.form}:${opts.count}:${opts.thickness}`
    if (this.builtFor === signature) return

    if (this.field) {
      scene.remove(this.field)
      this.field.geometry.dispose()
      ;(this.field.material as THREE.Material).dispose()
      this.field.dispose()
    }

    const side = Math.max(2, Math.round(opts.count))
    const radius = opts.thickness / 2
    const geometry =
      opts.form === 'box'
        ? new THREE.BoxGeometry(opts.thickness, 1, opts.thickness)
        : new THREE.CylinderGeometry(radius, radius, 1, 20)
    // Unit height with the origin at the base, so scaling y is the whole
    // animation and nothing has to be repositioned.
    geometry.translate(0, 0.5, 0)

    const material = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 })
    const field = new THREE.InstancedMesh(geometry, material, side * side)
    field.castShadow = true
    field.receiveShadow = true
    field.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    scene.add(field)

    this.field = field
    this.builtFor = signature
  }

  resize(size: { pixelWidth: number; pixelHeight: number }): void {
    this.aspect = size.pixelWidth / size.pixelHeight
    this.renderer?.setSize(size.pixelWidth, size.pixelHeight, false)
    if (this.camera) {
      this.camera.aspect = this.aspect
      this.camera.updateProjectionMatrix()
    }
  }

  render(t: number, opts: SwellOptions, pointer: Pointer): void {
    const { renderer, scene, camera, sun, ground } = this
    if (!renderer || !scene || !camera || !sun || !ground) return

    this.buildField(opts)
    const field = this.field
    if (!field) return

    scene.background = new THREE.Color(opts.paper)
    ;(ground.material as THREE.ShadowMaterial).opacity = opts.shadow
    this.stone.set(opts.stone)
    this.crest.set(opts.accent)

    const side = Math.max(2, Math.round(opts.count))
    const span = side - 1
    const half = span / 2

    // The pointer lands on the field in the same units as the grid. y on screen
    // runs down and z in the scene runs towards the camera, so it inverts.
    const px = (pointer.x * 2 - 1) * half
    const pz = (pointer.y * 2 - 1) * half
    const reach = pointer.active ? 1 : 0

    const phase = TAU * IDLE_CYCLES * (t / Math.max(opts.period, 0.001))

    let index = 0
    for (let ix = 0; ix < side; ix++) {
      for (let iz = 0; iz < side; iz++) {
        const x = ix - half
        const z = iz - half

        // Idle motion, so the field is alive before anyone touches it. Periodic
        // in `phase`, which is periodic in `t`, so the loop closes exactly.
        const diagonal = (x + z) * 0.35
        const idle = Math.sin(diagonal - phase) * 0.5 + 0.5

        // The ripple: a standing wave centred on the cursor, fading with
        // distance. Pure in t and pointer, so the recorder can drive it.
        const distance = Math.hypot(x - px, z - pz)
        const wave = Math.sin(distance * opts.frequency - phase * 1.5) * 0.5 + 0.5
        const fade = Math.exp(-distance * opts.falloff)
        const ripple = wave * fade * reach

        const lift = idle * 0.3 + ripple
        const height = Math.max(opts.base + lift * opts.amplitude, 0.01)

        this.dummy.position.set(x, 0, z)
        this.dummy.scale.set(1, height, 1)
        this.dummy.updateMatrix()
        field.setMatrixAt(index, this.dummy.matrix)

        // Colour follows height rather than the raw wave, so the tint and the
        // silhouette agree and the ripple reads in a still frame.
        const tint = Math.min(ripple * 1.4, 1)
        this.colour.copy(this.stone).lerp(this.crest, tint * tint)
        field.setColorAt(index, this.colour)

        index++
      }
    }
    field.count = index
    field.instanceMatrix.needsUpdate = true
    if (field.instanceColor) field.instanceColor.needsUpdate = true
    // The field is always in frame and its bounds change every frame, so culling
    // it costs a bounding-sphere rebuild and saves nothing.
    field.frustumCulled = false

    const azimuth = TAU * 0.12
    const elevation = opts.elevation * DEG
    const distance = span * 2.4
    sun.position.set(
      Math.cos(azimuth) * distance * Math.cos(elevation),
      distance * Math.sin(elevation),
      Math.sin(azimuth) * distance * Math.cos(elevation)
    )
    sun.target.position.set(0, 0, 0)
    sun.target.updateMatrixWorld()
    sun.shadow.radius = 1 + opts.softness * 6

    /*
     * Frame the field rather than the viewport. Portrait and landscape need very
     * different camera distances for the same composition.
     */
    const back = (span * 1.2) / Math.max(opts.zoom, 0.05)
    const fitted = this.aspect < 1 ? back / Math.max(this.aspect, 0.35) : back
    // Height is a ratio of the distance, so tilt is an angle rather than a number
    // whose meaning changes with the size of the grid.
    camera.position.set(0, fitted * (0.3 + opts.tilt * 1.1), fitted)
    camera.lookAt(0, 0, 0)

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return (this.renderer?.getContext() as WebGL2RenderingContext | undefined) ?? null
  }

  teardown(): void {
    if (this.field) {
      this.field.geometry.dispose()
      ;(this.field.material as THREE.Material).dispose()
      this.field.dispose()
      this.field = null
    }
    if (this.ground) {
      this.ground.geometry.dispose()
      ;(this.ground.material as THREE.Material).dispose()
      this.ground = null
    }
    this.sun?.shadow.map?.dispose()
    this.sun?.dispose()
    this.fill?.dispose()
    this.scene?.clear()
    // Frees three's own GPU objects. The runtime then hands the context back to
    // the browser, which is the part that matters for the context budget.
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.sun = null
    this.fill = null
    this.builtFor = ''
  }
}

/**
 * Mount Swell into `el`. The element needs a size, in CSS, not just content.
 *
 * ```ts
 * const swell = createSwell(document.querySelector('#field')!)
 * swell.start()
 * // …later
 * swell.destroy()
 * ```
 */
export function createSwell(el: HTMLElement, opts: Partial<SwellOptions> = {}): EffectHandle {
  return mount<SwellOptions>(el, opts, {
    defaults: swellDefaults,
    create: () => new SwellSurface()
  })
}

export default createSwell
```

## 2. What it is

Swell is a field of matte forms standing on paper, rippling around the cursor.
324 of them by default, drawn as one instanced mesh, lit by a single sun with a
real shadow map. Same family as Sundial: matte forms, warm paper, shadows doing
the work.

The ripple is a standing wave centred on the pointer rather than a propagating
one with memory. That is a deliberate constraint. A wave with history integrates
against the previous frame, and `renderAtTime` has to be pure in `t` or the
effect cannot be recorded or scrubbed. A standing wave that follows the cursor is
indistinguishable at a glance and reproducible to the pixel.

With no pointer the field keeps a slow diagonal swell of its own, so it is alive
before anyone touches it and the loop still closes.

The crest is tinted towards the accent colour. That is what makes the wave
legible in a still frame, which matters for the poster, for reduced motion, and
for anybody who arrives on a touch screen.

## 3. Wire it in

**Plain HTML.** three.js must already be available to your build. This file
imports it and does not bundle it.

```html
<div id="field" style="width: 100%; aspect-ratio: 16 / 9"></div>

<script type="module">
  import { createSwell } from './beamish/effects/swell/core.js'

  const swell = createSwell(document.querySelector('#field'), { count: 18 })
  swell.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createSwell } from '@/beamish/effects/swell/core'

export function Field() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const swell = createSwell(host.current, { count: 18, accent: '#c44400' })
    swell.start()
    return () => swell.destroy()
  }, [])

  return <div ref={host} className="aspect-video w-full" />
}
```

Do not put option values in the dependency array. That tears the context down and
rebuilds the whole field. Call `update()` instead:

```tsx
useEffect(() => {
  swellRef.current?.update({ falloff })
}, [falloff])
```

Note that `count`, `form` and `thickness` rebuild the instanced mesh when they
change, which is the one expensive thing here. The other options are free.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSwell } from '@/beamish/effects/swell/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let swell: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  swell = createSwell(host.value, { count: 18 })
  swell.start()
})

onBeforeUnmount(() => swell?.destroy())
</script>

<template>
  <div ref="host" class="field" />
</template>
```

**Astro.** Nothing extra is required. Use the React or Vue file as an island with
`client:visible`, or call `createSwell` from a plain `<script>` in the page.

**Driving it without a cursor.** Pass `pointerPath`, a list of `{ t, x, y }` keys
in 0 to 1 element coordinates, plus `pointerPathDuration`. The runtime samples it
at exactly the time being drawn and ignores the live pointer. That is how the
video on the site is recorded, and it is the way to run this as a hero that
animates on its own.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper the field stands on. Match it to your page background or the panel reads as a pasted-in rectangle. |
| `stone` | color | `#f2efe6` | any CSS hex | The forms at rest. Slightly lighter than the paper is what makes them read as objects standing on it. |
| `accent` | color | `#c44400` | any CSS hex | The forms at the crest of the ripple. The colour is what makes the wave legible in a still frame, so do not set it to the same value as stone. |
| `count` | number | `18` | 6 to 40 (looks right between 16 and 26) | Forms per side. 18 is 324 of them. Past 30 the forms are narrower than their own shadows and the field turns to fur. |
| `form` | enum | `cylinder` | `cylinder` · `box` | Shape of each form. Cylinders read as softer and hide the grid; boxes keep the rows visible, which suits a lower count. |
| `thickness` | number | `0.58` | 0.1 to 0.95 (looks right between 0.4 and 0.7) | Width of each form as a fraction of its cell. Above 0.9 neighbours touch and the field becomes a surface. |
| `base` | number | `0.14` | 0.01 to 1 (looks right between 0.05 and 0.3) | Height of a form at rest. Low is a floor that rises; high is a forest that sways. |
| `amplitude` | number | `1.9` | 0.1 to 4 (looks right between 1.2 and 2.6) | How far the crest rises above the base. |
| `frequency` | number | `1.9` | 0.5 to 8 (looks right between 1.5 and 3.5) | Rings per unit of distance. Above about 5 the rings are finer than the grid and it aliases into noise. |
| `falloff` | number | `0.26` | 0.05 to 2 (looks right between 0.18 and 0.6) | How quickly the ripple fades away from the cursor. Low spreads across the whole field; high is a tight pool underneath it. |
| `elevation` | number | `36` | 8 to 80 deg (looks right between 25 and 50) | Sun height above the horizon. Low throws long shadows between the forms, which is most of what gives the field depth. |
| `shadow` | number | `0.26` | 0 to 1 (looks right between 0.15 and 0.4) | How dark the shadows fall on the paper. The paper is never lit, so this is the only thing drawn on it. |
| `softness` | number | `0.5` | 0 to 1 (looks right between 0.3 and 0.7) | Shadow edge softness. Zero is a hard midday edge, one is heavy overcast. |
| `tilt` | number | `0.6` | 0 to 1 (looks right between 0.4 and 0.75) | Camera height. Zero is eye level with the paper, one looks straight down. Low is dramatic and hides the ripple; high shows the pattern and flattens the forms. |
| `zoom` | number | `0.8` | 0.3 to 1.6 (looks right between 0.6 and 1) | How much of the frame the field fills. |
| `period` | number | `5` | 2 to 60 s (looks right between 5 and 20) | Seconds for one loop of the idle swell, the motion used when no pointer is present. Exactly periodic, so the loop closes. |
| `reducedMotionTime` | number | `1.4` | 0 to 60 s | The single frame shown when the user prefers reduced motion. Pick a time where the idle swell has some variation across the field rather than one where it is flat. |

## 5. Cleanup and SSR

Call `destroy()`. It disposes the instanced mesh, its geometry and material, the
ground, the shadow map and the three.js renderer, then releases the WebGL context
itself.

A page that mounts and unmounts scenes without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createSwell` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A. The idle swell moves on its own for more than five
seconds, so it must be pausable. `stop()` and `start()` are on the handle for
that. Surface them as a real control in your own build.

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

Pick a time where the idle swell has variation across the field rather than one
where it happens to be flat. The still is the whole effect for those users, and a
flat grid of identical pins is not worth looking at.

## 7. The three mistakes most likely to be made here

1. **Raising `count` to make it look finer.** Past about 30 per side the forms
   are narrower than their own shadows, the field turns to fur, and the shadow
   pass gets expensive. If you want finer, lower `thickness` instead. The shadow
   map is the cost here, not the geometry.

2. **Putting it in a short, wide banner.** The camera frames the field, so a
   1600×200 strip shows you the front two rows and nothing else. Give it
   something close to 16:9 or squarer.

3. **Setting `accent` to the same value as `stone`.** The tint is what makes the
   ripple readable when it is not moving, which is every poster, every
   screenshot, and every visitor who has asked for reduced motion.

---

Concept credit: the wave-propagation grid, by Codrops, https://tympanus.net/codrops/2026/07/09/building-an-interactive-wave-propagation-cube-grid-with-three-js/.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
