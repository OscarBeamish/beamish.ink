You are adding **TerrainRelief** from Beamish to this project.

> A topographic relief on paper, printed with its own contour lines. Backdrops · effect · MIT.
> https://beamish.ink/effects/terrain-relief

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL1 or better
- three.js must already be a dependency of the project. It is not bundled
- The displacement runs in the vertex shader, so a 160 square grid is one upload and costs memory rather than frame time
- The same displacement is injected into a custom depth material. Without that the land casts the shadow of a flat plane and the relief detaches from its own shading
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

**`src/beamish/effects/terrain-relief/core.ts`**

```ts
/*
 * Contour: Beamish
 * https://beamish.ink/effects/terrain-relief
 *
 * A topographic relief on paper. Matte white land, one low sun, and contour
 * lines printed on the surface at fixed height intervals.
 *
 * The displacement happens in the vertex shader, not in JavaScript, so the
 * geometry is uploaded once and a 160×160 grid costs nothing per frame. The
 * catch is that three's shadow pass uses a different material, which knows
 * nothing about the displacement, so the shadows would detach from the land and
 * lie flat. The same code is therefore injected into a custom depth material as
 * well. That is the part most terrain demos get wrong.
 *
 * The land morphs along a closed orbit through noise space, the same trick
 * Overprint uses, so the loop returns to its start exactly.
 *
 * Concept credit: Ridgeline, Codrops, July 2026. Written from scratch.
 */

import * as THREE from 'three'
import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type TerrainReliefOptions = BaseOptions & {
  /** The paper behind the land, and the land's own colour at full light. */
  paper: string
  /** The land. Slightly off the paper so the horizon is readable. */
  land: string
  /** The contour lines. */
  ink: string
  /** Every fifth line is an index contour, drawn in this. */
  indexInk: string
  /** Height of the relief. */
  relief: number
  /** Size of the landforms. Lower is broader country. */
  scale: number
  /** Contour lines per unit of height. More lines is a steeper-looking map. */
  density: number
  /** Weight of the lines, 0 to 1. */
  weight: number
  /** Sun height above the horizon, degrees. Low rakes the ridges. */
  elevation: number
  /** Sun direction around the compass, degrees. */
  azimuth: number
  /** Camera height. 0 is on the deck, 1 looks straight down. */
  tilt: number
  /** How much of the frame the land fills. */
  zoom: number
  /** Seconds for one loop of the morph. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const terrainReliefDefaults: TerrainReliefOptions = {
  paper: '#fbfaf4',
  land: '#f4f1e7',
  ink: '#6f665a',
  indexInk: '#c44400',
  relief: 1.9,
  scale: 0.3,
  density: 1.7,
  weight: 0.72,
  elevation: 26,
  azimuth: 38,
  tilt: 0.5,
  zoom: 0.55,
  period: 6,
  reducedMotionTime: 3
}

const TAU = Math.PI * 2
const DEG = Math.PI / 180

/*
 * Shared by the surface material and the depth material. Both have to agree to
 * the last decimal or the shadows drift away from the land they belong to.
 */
const TERRAIN_GLSL = /* glsl */ `
uniform float u_relief;
uniform float u_scale;
uniform vec2  u_orbit;

vec2 c_hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}

float c_gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = dot(c_hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(c_hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(c_hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(c_hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/*
 * Ridged fbm. Taking the absolute value and inverting each octave turns rolling
 * hills into ridges and valleys, which is what makes contour lines worth
 * drawing: smooth noise gives you concentric blobs.
 */
float c_terrain(vec2 p) {
  p = p * u_scale + u_orbit;
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    float n = 1.0 - abs(c_gnoise(p));
    sum += amp * n * n;
    p *= 2.07;
    amp *= 0.5;
  }
  return (sum - 0.55) * u_relief;
}
`

class TerrainReliefSurface implements Surface<TerrainReliefOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private sun: THREE.DirectionalLight | null = null
  private fill: THREE.HemisphereLight | null = null
  private land: THREE.Mesh | null = null
  private uniforms: Record<string, THREE.IUniform> = {}
  private paper = new THREE.Color()
  private aspect = 1

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('Contour needs a canvas')

    const renderer = new THREE.WebGLRenderer({
      canvas: ctx.canvas,
      antialias: true,
      alpha: false,
      // The recorder reads pixels back after the draw, and without this the
      // buffer may already have been cleared.
      preserveDrawingBuffer: true,
      powerPreference: 'low-power'
    })
    // The runtime owns sizing and has already capped DPR.
    renderer.setPixelRatio(1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NoToneMapping
    renderer.shadowMap.enabled = true
    // PCF, not PCFSoft: shadow.radius is only read by the PCF branch.
    renderer.shadowMap.type = THREE.PCFShadowMap

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200)

    const fill = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.0)
    const sun = new THREE.DirectionalLight(0xfff4e4, 2.6)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const extent = 13
    const shadowCamera = sun.shadow.camera as THREE.OrthographicCamera
    shadowCamera.left = -extent
    shadowCamera.right = extent
    shadowCamera.top = extent
    shadowCamera.bottom = -extent
    shadowCamera.near = 0.5
    shadowCamera.far = 70
    sun.shadow.radius = 3
    sun.shadow.normalBias = 0.04
    sun.shadow.bias = -0.0006
    scene.add(sun, sun.target, fill)

    // One shared uniform object, so the surface and the depth pass cannot drift.
    this.uniforms = {
      u_relief: { value: terrainReliefDefaults.relief },
      u_scale: { value: terrainReliefDefaults.scale },
      u_orbit: { value: new THREE.Vector2() },
      u_land: { value: new THREE.Color(terrainReliefDefaults.land) },
      u_ink: { value: new THREE.Color(terrainReliefDefaults.ink) },
      u_indexInk: { value: new THREE.Color(terrainReliefDefaults.indexInk) },
      u_density: { value: terrainReliefDefaults.density },
      u_weight: { value: terrainReliefDefaults.weight }
    }

    /*
     * A 160 square grid is 25,600 vertices and one upload. The displacement is
     * per-vertex on the GPU, so the resolution costs memory rather than frame
     * time, which is the trade worth making here.
     */
    const geometry = new THREE.PlaneGeometry(24, 24, 160, 160)
    // Baked flat rather than rotated on the mesh, so the shader can displace
    // straight up in y instead of reasoning about the object's rotation.
    geometry.rotateX(-Math.PI / 2)

    const material = new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0 })
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = `varying float v_height;\n${TERRAIN_GLSL}\n${shader.vertexShader}`
        .replace(
          '#include <beginnormal_vertex>',
          `
          float h = c_terrain(position.xz);
          v_height = h;
          // Normals from finite differences on the same function. Deriving them
          // from the displaced geometry would need a second pass; this is exact
          // and costs two extra noise samples.
          float e = 0.06;
          float hx = c_terrain(position.xz + vec2(e, 0.0)) - c_terrain(position.xz - vec2(e, 0.0));
          float hz = c_terrain(position.xz + vec2(0.0, e)) - c_terrain(position.xz - vec2(0.0, e));
          vec3 objectNormal = normalize(vec3(-hx, 2.0 * e, -hz));
          `
        )
        .replace(
          '#include <begin_vertex>',
          `
          vec3 transformed = vec3(position.x, position.y + h, position.z);
          `
        )

      shader.fragmentShader = `
        varying float v_height;
        uniform vec3  u_land;
        uniform vec3  u_ink;
        uniform vec3  u_indexInk;
        uniform float u_density;
        uniform float u_weight;
        ${shader.fragmentShader}
      `.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        {
          float scaled = v_height * u_density;
          float band = fract(scaled);
          // fwidth keeps the line one pixel wide wherever the slope is, which is
          // the whole difficulty: on a flat plateau a fixed threshold paints the
          // entire region, and on a cliff it disappears.
          float aa = fwidth(scaled);
          float line = 1.0 - smoothstep(0.0, aa * (0.6 + u_weight * 2.2), min(band, 1.0 - band));

          // Every fifth line is an index contour, the one a real map labels.
          bool isIndex = mod(floor(scaled), 5.0) == 0.0;
          vec3 inkColor = isIndex ? u_indexInk : u_ink;
          float strength = line * (isIndex ? 1.0 : 0.72) * u_weight;

          diffuseColor.rgb = mix(u_land, inkColor, clamp(strength, 0.0, 1.0));
        }
        `
      )
    }
    // Changing onBeforeCompile after a program exists needs a new key.
    material.customProgramCacheKey = () => 'beamish-terrain-relief'

    /*
     * The shadow pass renders with its own material, which knows nothing about
     * the displacement above. Without this the land casts the shadow of a flat
     * plane and the whole relief detaches from its own shading.
     */
    const depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking
    })
    depthMaterial.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = `${TERRAIN_GLSL}\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `
        vec3 transformed = vec3(position.x, position.y + c_terrain(position.xz), position.z);
        `
      )
    }
    depthMaterial.customProgramCacheKey = () => 'beamish-terrain-relief-depth'

    const land = new THREE.Mesh(geometry, material)
    land.customDepthMaterial = depthMaterial
    land.castShadow = true
    land.receiveShadow = true
    // The bounds are computed from the undisplaced plane, so three would cull it
    // the moment the camera looked along the deck.
    land.frustumCulled = false
    scene.add(land)

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.sun = sun
    this.fill = fill
    this.land = land
  }

  resize(size: { pixelWidth: number; pixelHeight: number }): void {
    this.aspect = size.pixelWidth / size.pixelHeight
    this.renderer?.setSize(size.pixelWidth, size.pixelHeight, false)
    if (this.camera) {
      this.camera.aspect = this.aspect
      this.camera.updateProjectionMatrix()
    }
  }

  render(t: number, opts: TerrainReliefOptions): void {
    const { renderer, scene, camera, sun } = this
    if (!renderer || !scene || !camera || !sun) return

    this.paper.set(opts.paper)
    scene.background = this.paper

    const u = this.uniforms
    u['u_relief']!.value = opts.relief
    u['u_scale']!.value = opts.scale
    u['u_density']!.value = opts.density
    u['u_weight']!.value = opts.weight
    ;(u['u_land']!.value as THREE.Color).set(opts.land)
    ;(u['u_ink']!.value as THREE.Color).set(opts.ink)
    ;(u['u_indexInk']!.value as THREE.Color).set(opts.indexInk)

    // A closed orbit through noise space: the land morphs and returns exactly.
    const phase = TAU * (t / Math.max(opts.period, 0.001))
    ;(u['u_orbit']!.value as THREE.Vector2).set(Math.cos(phase) * 0.6, Math.sin(phase) * 0.6)

    const elevation = opts.elevation * DEG
    const azimuth = opts.azimuth * DEG
    const distance = 30
    sun.position.set(
      Math.cos(azimuth) * distance * Math.cos(elevation),
      distance * Math.sin(elevation),
      Math.sin(azimuth) * distance * Math.cos(elevation)
    )
    sun.target.position.set(0, 0, 0)
    sun.target.updateMatrixWorld()

    const back = 15 / Math.max(opts.zoom, 0.05)
    const fitted = this.aspect < 1 ? back / Math.max(this.aspect, 0.4) : back
    camera.position.set(0, fitted * (0.18 + opts.tilt * 1.1), fitted)
    camera.lookAt(0, 0, 0)

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return (this.renderer?.getContext() as WebGL2RenderingContext | undefined) ?? null
  }

  teardown(): void {
    if (this.land) {
      this.land.geometry.dispose()
      ;(this.land.material as THREE.Material).dispose()
      this.land.customDepthMaterial?.dispose()
      this.land = null
    }
    this.sun?.shadow.map?.dispose()
    this.sun?.dispose()
    this.fill?.dispose()
    this.scene?.clear()
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.sun = null
    this.fill = null
    this.uniforms = {}
  }
}

/**
 * Mount Contour into `el`. The element needs a size, in CSS, not just content.
 *
 * ```ts
 * const contour = createTerrainRelief(document.querySelector('#hero')!)
 * contour.start()
 * // …later
 * contour.destroy()
 * ```
 */
export function createTerrainRelief(el: HTMLElement, opts: Partial<TerrainReliefOptions> = {}): EffectHandle {
  return mount<TerrainReliefOptions>(el, opts, {
    defaults: terrainReliefDefaults,
    create: () => new TerrainReliefSurface()
  })
}

export default createTerrainRelief
```

## 2. What it is

Contour is a topographic relief on paper: matte land, one low sun, and contour
lines printed on the surface at fixed height intervals. Every fifth line is an
index contour, the one a real map would label, drawn in a second colour.

It is a real three.js scene, and the displacement runs in the vertex shader
rather than in JavaScript. A 160 square grid is 25,600 vertices uploaded once,
after which the resolution costs memory and not frame time.

The part worth knowing about is the shadow. three renders the shadow pass with a
different material, which knows nothing about a displacement written into the
surface shader, so the land would cast the shadow of a flat plane and the whole
relief would detach from its own shading. The same terrain function is therefore
injected into a custom depth material as well. That is the step most terrain
demos skip, and it is why theirs look painted on.

The height field is ridged rather than smooth. Taking the absolute value of each
octave and inverting it turns rolling hills into ridges and valleys, which is
what makes contour lines worth drawing at all: smooth noise gives you concentric
blobs.

The land morphs along a closed orbit through noise space, so the loop returns to
its start exactly and any span of `period` seconds joins back on itself.

## 3. Wire it in

**Plain HTML.** three.js must already be available to your build. This file
imports it and does not bundle it.

```html
<div id="hero" style="width: 100%; aspect-ratio: 16 / 9"></div>

<script type="module">
  import { createTerrainRelief } from './beamish/effects/terrain-relief/core.js'

  const contour = createTerrainRelief(document.querySelector('#hero'), {
    indexInk: '#c44400'
  })
  contour.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createTerrainRelief } from '@/beamish/effects/terrain-relief/core'

export function Hero() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const contour = createTerrainRelief(host.current, { relief: 1.9 })
    contour.start()
    return () => contour.destroy()
  }, [])

  return <div ref={host} className="aspect-video w-full" />
}
```

Do not put option values in the dependency array. That tears the context down and
recompiles both shaders. Call `update()` instead:

```tsx
useEffect(() => {
  contourRef.current?.update({ density })
}, [density])
```

Every option here is a uniform, so `update()` is free. Nothing rebuilds.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createTerrainRelief } from '@/beamish/effects/terrain-relief/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let contour: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  contour = createTerrainRelief(host.value, { relief: 1.9 })
  contour.start()
})

onBeforeUnmount(() => contour?.destroy())
</script>

<template>
  <div ref="host" class="hero" />
</template>
```

**Astro.** Nothing extra is required. Use the React or Vue file as an island with
`client:visible`, or call `createTerrainRelief` from a plain `<script>` in the page.

**Using it flat.** Set `tilt` to 1 and `weight` to 0.9 and you get a printed map
seen from directly above rather than a relief. Both are the same effect and the
map version makes a much quieter page background.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper behind the land. Match it to your page background or the horizon reads as a hard edge. |
| `land` | color | `#f4f1e7` | any CSS hex | The land itself. Keep it close to the paper but not identical, or the horizon disappears entirely. |
| `ink` | color | `#6f665a` | any CSS hex | The contour lines. A warm grey reads as print; pure black reads as a wireframe. |
| `indexInk` | color | `#c44400` | any CSS hex | Every fifth line is an index contour, the one a real map would label. This is the obvious place for your own colour. |
| `relief` | number | `1.9` | 0.2 to 5 (looks right between 1 and 2.4) | Height of the land. Past about 3 the ridges are steeper than the sun can light and the far side goes black. |
| `scale` | number | `0.3` | 0.1 to 2 (looks right between 0.2 and 0.5) | Size of the landforms. Lower is broader country with fewer, longer ridges. |
| `density` | number | `1.7` | 0.5 to 12 (looks right between 1.2 and 3) | Contour lines per unit of height. More lines reads as steeper country. Past about 8 the lines are closer than the pixels and the map turns grey. |
| `weight` | number | `0.72` | 0 to 1 (looks right between 0.45 and 0.85) | Weight of the lines. Zero is bare land with no map printed on it, which is a perfectly good backdrop in its own right. |
| `elevation` | number | `26` | 5 to 80 deg (looks right between 15 and 40) | Sun height above the horizon. Low rakes the ridges and is most of where the depth comes from. High flattens the whole thing into a map. |
| `azimuth` | number | `38` | 0 to 360 deg (looks right between 20 and 70) | Sun direction around the compass. Convention on a printed map is light from the north west, which is about 315. |
| `tilt` | number | `0.5` | 0 to 1 (looks right between 0.3 and 0.7) | Camera height. Zero is down on the deck with a horizon, one looks straight down at a map. The interesting ground is in between. |
| `zoom` | number | `0.55` | 0.3 to 2 (looks right between 0.45 and 0.8) | How much of the frame the land fills. |
| `period` | number | `6` | 4 to 120 s (looks right between 6 and 40) | Seconds for one loop of the morph. The land travels a closed orbit through noise space and returns exactly. The default is 6 so the preview video is a whole cycle; 20 to 40 is right behind a page, where the land should be moving slowly enough that nobody catches it. |
| `reducedMotionTime` | number | `3` | 0 to 120 s | The single frame shown when the user prefers reduced motion. Any time works here: a still relief is a map, which is a finished thing to look at. |

## 5. Cleanup and SSR

Call `destroy()`. It disposes the geometry, both materials, the shadow map and
the three.js renderer, then releases the WebGL context itself.

A page that mounts and unmounts scenes without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createTerrainRelief` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A. The land moves on its own for more than five seconds, so
it must be pausable. `stop()` and `start()` are on the handle for that. Surface
them as a real control in your own build.

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`.

This effect needs no care here. Any frame of it is a map, which is a finished
thing to look at, so the default of 3 is as good as any other number.

## 7. The three mistakes most likely to be made here

1. **Raising `relief` past about 3.** The ridges become steeper than a 26-degree
   sun can light, the far sides go black, and a library built for warm paper
   suddenly has a large dark shape in it. If you want more drama, lower
   `elevation` instead: long shadows read as height without any of the land
   going dark.

2. **Raising `density` to get more lines.** Past about 8 lines per unit the
   contours are closer together than the pixels that have to draw them, and the
   whole surface turns to flat grey. The lines already anti-alias against the
   local slope, so they will not disappear at low values either.

3. **Setting `land` to exactly `paper`.** The horizon then vanishes and the
   relief looks like it is floating in fog. Keep them close, because that is what
   makes it read as a paper model, but not identical.

---

Concept credit: real-time terrain with shader displacement, by Codrops, https://tympanus.net/codrops/2026/07/22/building-ridgeline-engineering-a-real-time-3d-experience-in-webflow/.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
