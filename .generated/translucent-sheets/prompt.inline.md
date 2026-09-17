You are adding **TranslucentSheets** from Beamish to this project.

> A drifting stack of translucent paper that goes darker where the sheets cross. Backdrops · effect · MIT.
> https://beamish.ink/effects/translucent-sheets

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL1 or better
- three.js must already be a dependency of the project. It is not bundled
- The sheets multiply rather than composite, which is order-independent, so the whole pile is one InstancedMesh and there is no transparency sorting to get wrong
- Nothing in the scene can be brighter than the paper. A multiply has no way to add light, so there is no specular highlight and there cannot be one
- No shadow map. Nothing here is opaque enough to cast one
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

**`src/beamish/effects/translucent-sheets/core.ts`**

```ts
/*
 * Vellum: Beamish
 * https://beamish.ink/effects/translucent-sheets
 *
 * A loose stack of translucent paper, drifting. Where two sheets cross the paper
 * goes darker, and you can read the order of the stack by how dark it gets.
 *
 * The blend mode is the whole design. These sheets multiply rather than composite:
 * the result is destination times source, which is what ink on a diffusing sheet
 * actually does, and it is order-independent. That last part matters more than it
 * sounds. Ordinary alpha-blended transparency has to be sorted back to front, and
 * sorting inside a single InstancedMesh is not possible, so most stacked-plane
 * demos either flicker or give up on instancing. Multiplying sidesteps the problem
 * rather than solving it: fourteen sheets draw in one call, in any order, and the
 * picture is the same.
 *
 * The cost is that nothing can be brighter than the paper. There is no specular
 * highlight here and there cannot be one. Where a sheet turns into the light it
 * fades toward no tint at all, which within a multiply is the only direction
 * "brighter" exists in, and reads correctly as paper catching a lamp.
 *
 * Concept credit: Infinite Liquid Glass Grid, Codrops, September 2026, for the
 * idea that the glass can be faked in the shader with no refraction pass at all.
 * Written from scratch, and recast from glass to paper.
 */

import * as THREE from 'three'
import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type TranslucentSheetsOptions = BaseOptions & {
  /** The paper behind the stack. */
  paper: string
  /** What each sheet multiplies the paper by. Most of the stack is this. */
  ink: string
  /** A few sheets are printed in this instead. */
  accent: string
  /** How many sheets. */
  sheets: number
  /** How dark one sheet is on its own. The stack compounds from here. */
  density: number
  /** How far the sheets are scattered. Low is a neat pile. */
  spread: number
  /** Corner radius of a sheet, 0 is square cut. */
  radius: number
  /** How much the sheets lift toward the light as they turn into it. */
  sheen: number
  /** Paper fibre. */
  fibre: number
  /** Light height above the horizon, degrees. */
  elevation: number
  /** Light direction around the compass, degrees. */
  azimuth: number
  /** Camera height. 0 is edge on, 1 looks straight down at the pile. */
  tilt: number
  /** How much of the frame the stack fills. */
  zoom: number
  /** Seconds for one loop of the drift. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const translucentSheetsDefaults: TranslucentSheetsOptions = {
  paper: '#fbfaf4',
  ink: '#9a8e79',
  accent: '#c44400',
  sheets: 14,
  density: 0.12,
  spread: 1,
  radius: 0.08,
  sheen: 0.55,
  fibre: 0.5,
  elevation: 34,
  azimuth: 42,
  tilt: 0.42,
  zoom: 0.62,
  period: 12,
  reducedMotionTime: 3
}

const TAU = Math.PI * 2
const DEG = Math.PI / 180

/*
 * Deterministic, and deliberately not Math.random. The recorder stubs the clock
 * and redraws the same frame numbers expecting the same picture, so the layout
 * of the pile has to be a function of the sheet's index and nothing else.
 */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123
  return x - Math.floor(x)
}

const VERTEX = /* glsl */ `
  attribute float a_seed;
  attribute float a_accent;

  varying vec2  v_uv;
  varying vec3  v_normal;
  varying float v_seed;
  varying float v_accent;

  void main() {
    v_uv = uv;
    v_seed = a_seed;
    v_accent = a_accent;

    mat4 world = modelMatrix * instanceMatrix;
    v_normal = normalize(mat3(world) * normal);

    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3  u_ink;
  uniform vec3  u_accent;
  uniform vec3  u_light;
  uniform float u_density;
  uniform float u_radius;
  uniform float u_sheen;
  uniform float u_fibre;

  varying vec2  v_uv;
  varying vec3  v_normal;
  varying float v_seed;
  varying float v_accent;

  float hash12(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void main() {
    /*
     * A rounded rectangle cut out of the plane, in the plane's own coordinates.
     * Real vellum is guillotined, not die-cut, so the radius wants to stay small;
     * this exists mostly so the corners do not read as a hard polygon.
     */
    vec2 p = v_uv * 2.0 - 1.0;
    vec2 q = abs(p) - (1.0 - u_radius);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_radius;

    // fwidth, so the cut edge is one pixel wide however steeply the sheet is
    // foreshortened. A sheet seen almost edge on is most of the stack.
    float aa = max(fwidth(d), 1e-5);
    float inside = 1.0 - smoothstep(-aa, aa, d);

    // Cut fibres catch more light than the face does, so the very edge of a
    // sheet of tracing paper is always a shade darker than the middle of it.
    float rim = 1.0 - smoothstep(0.0, 0.06, -d);

    /*
     * abs(), because the sheets are double sided and half of them are seen from
     * behind. Paper does not care which way round it is; a signed dot would make
     * every other sheet in the pile go flat.
     */
    float facing = abs(dot(normalize(v_normal), u_light));
    // Within a multiply, "brighter" only exists as "less tint", so this lifts
    // the sheet toward no tint at all rather than toward white.
    float lift = pow(facing, 3.0) * u_sheen;

    float grain = (hash12(floor(v_uv * 420.0) + v_seed * 37.0) - 0.5) * 0.35 * u_fibre;

    vec3 tint = mix(u_ink, u_accent, v_accent);
    float amount = (u_density + rim * u_density * 1.4 + grain) * (1.0 - lift);
    amount = clamp(amount, 0.0, 1.0) * inside;

    // 1.0 is the identity for this blend, so everything outside the cut leaves
    // the paper exactly as it found it. No discard, and the edge antialiases.
    gl_FragColor = vec4(mix(vec3(1.0), tint, amount), 1.0);
  }
`

class TranslucentSheetsSurface implements Surface<TranslucentSheetsOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private sheets: THREE.InstancedMesh | null = null
  private material: THREE.ShaderMaterial | null = null
  private geometry: THREE.PlaneGeometry | null = null
  private uniforms: Record<string, THREE.IUniform> = {}
  private paper = new THREE.Color()
  private aspect = 1
  private built = 0

  // Scratch, so the per-frame matrix rebuild allocates nothing.
  private readonly matrix = new THREE.Matrix4()
  private readonly position = new THREE.Vector3()
  private readonly quaternion = new THREE.Quaternion()
  private readonly euler = new THREE.Euler()
  private readonly scale = new THREE.Vector3()
  private readonly light = new THREE.Vector3()

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('Vellum needs a canvas')

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
    // No shadow map at all. Nothing here is opaque enough to cast one, and a
    // translucent sheet throwing a hard shadow is the tell that gives these
    // scenes away.

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200)

    this.uniforms = {
      u_ink: { value: new THREE.Color(translucentSheetsDefaults.ink) },
      u_accent: { value: new THREE.Color(translucentSheetsDefaults.accent) },
      u_light: { value: new THREE.Vector3(0, 1, 0) },
      u_density: { value: translucentSheetsDefaults.density },
      u_radius: { value: translucentSheetsDefaults.radius },
      u_sheen: { value: translucentSheetsDefaults.sheen },
      u_fibre: { value: translucentSheetsDefaults.fibre }
    }

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.DoubleSide,
      /*
       * Destination times source. Order-independent, which is what lets the
       * whole pile live in one InstancedMesh: there is no correct order to sort
       * into, so there is nothing to get wrong.
       */
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.ZeroFactor,
      // Neither test nor write. Every sheet has to reach the framebuffer, and a
      // sheet occluding another one is exactly what must not happen here.
      depthTest: false,
      depthWrite: false
    })

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.material = material
  }

  /*
   * Rebuilt only when the count changes. The per-sheet seeds and the accent
   * flags are attributes rather than uniforms, so the pile is one draw call.
   */
  private build(count: number): void {
    const { scene, material } = this
    if (!scene || !material) return

    if (this.sheets) {
      scene.remove(this.sheets)
      this.sheets.dispose()
      this.sheets = null
    }
    this.geometry?.dispose()

    const geometry = new THREE.PlaneGeometry(1, 1)
    const seeds = new Float32Array(count)
    const accents = new Float32Array(count)
    for (let i = 0; i < count; i += 1) {
      seeds[i] = rand(i + 1) * 10
      // Roughly one sheet in five, and never the first, so the accent never
      // lands alone at the bottom of the pile where nothing crosses it.
      accents[i] = i > 0 && rand(i + 91) > 0.8 ? 1 : 0
    }
    geometry.setAttribute('a_seed', new THREE.InstancedBufferAttribute(seeds, 1))
    geometry.setAttribute('a_accent', new THREE.InstancedBufferAttribute(accents, 1))

    const sheets = new THREE.InstancedMesh(geometry, material, count)
    sheets.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // The instance matrices are rebuilt every frame and the bounds are computed
    // from the undisplaced plane, so three would cull the pile at some angles.
    sheets.frustumCulled = false
    scene.add(sheets)

    this.geometry = geometry
    this.sheets = sheets
    this.built = count
  }

  resize(size: { pixelWidth: number; pixelHeight: number }): void {
    this.aspect = size.pixelWidth / size.pixelHeight
    this.renderer?.setSize(size.pixelWidth, size.pixelHeight, false)
    if (this.camera) {
      this.camera.aspect = this.aspect
      this.camera.updateProjectionMatrix()
    }
  }

  render(t: number, opts: TranslucentSheetsOptions): void {
    const { renderer, scene, camera } = this
    if (!renderer || !scene || !camera) return

    const count = Math.max(1, Math.round(opts.sheets))
    if (count !== this.built) this.build(count)
    const sheets = this.sheets
    if (!sheets) return

    this.paper.set(opts.paper)
    scene.background = this.paper

    const u = this.uniforms
    ;(u['u_ink']!.value as THREE.Color).set(opts.ink)
    ;(u['u_accent']!.value as THREE.Color).set(opts.accent)
    u['u_density']!.value = opts.density
    u['u_radius']!.value = Math.min(Math.max(opts.radius, 0), 0.5)
    u['u_sheen']!.value = opts.sheen
    u['u_fibre']!.value = opts.fibre

    const elevation = opts.elevation * DEG
    const azimuth = opts.azimuth * DEG
    this.light
      .set(
        Math.cos(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.sin(azimuth) * Math.cos(elevation)
      )
      .normalize()
    ;(u['u_light']!.value as THREE.Vector3).copy(this.light)

    const phase = TAU * (t / Math.max(opts.period, 0.001))

    for (let i = 0; i < count; i += 1) {
      const a = rand(i + 1)
      const b = rand(i + 41)
      const c = rand(i + 77)

      /*
       * Every sheet travels a closed circle and every wobble is a sine of the
       * same phase, so the whole pile returns to exactly where it started after
       * `period` seconds. That is what makes renderAtTime pure in t, which is
       * what the recorder is built on.
       */
      const own = phase + a * TAU

      const drift = 0.7 * opts.spread
      this.position.set(
        (a - 0.5) * 7.4 * opts.spread + Math.cos(own) * drift,
        (b - 0.5) * 4.2 * opts.spread + Math.sin(own * 0.7 + b * TAU) * drift * 0.6,
        // Depth is by index rather than random, so adding a sheet lays it on top
        // of the pile instead of shuffling the whole thing.
        (i / count - 0.5) * 4.0 * opts.spread + Math.sin(own * 1.3) * 0.18
      )

      this.euler.set(
        (c - 0.5) * 0.9 + Math.sin(own) * 0.18,
        (a - 0.5) * 0.9 + Math.cos(own * 1.1) * 0.18,
        (b - 0.5) * TAU + Math.sin(own * 0.6) * 0.12
      )
      this.quaternion.setFromEuler(this.euler)

      // Deliberately larger than the frame. This is a backdrop, and sheets that
      // stop short of the edge read as a pile of cards on a table instead.
      const size = 6.2 + c * 3.4
      // A4 is close enough to root two, and a pile of squares reads as tiles.
      this.scale.set(size, size / 1.414, 1)

      this.matrix.compose(this.position, this.quaternion, this.scale)
      sheets.setMatrixAt(i, this.matrix)
    }
    sheets.instanceMatrix.needsUpdate = true

    const back = 14 / Math.max(opts.zoom, 0.05)
    const fitted = this.aspect < 1 ? back / Math.max(this.aspect, 0.4) : back
    camera.position.set(0, fitted * opts.tilt, fitted * (1 - opts.tilt * 0.55))
    camera.lookAt(0, 0, 0)

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return (this.renderer?.getContext() as WebGL2RenderingContext | undefined) ?? null
  }

  teardown(): void {
    if (this.sheets) {
      this.scene?.remove(this.sheets)
      this.sheets.dispose()
      this.sheets = null
    }
    this.geometry?.dispose()
    this.material?.dispose()
    this.scene?.clear()
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.geometry = null
    this.material = null
    this.uniforms = {}
    this.built = 0
  }
}

/**
 * Mount Vellum into `el`. The element needs a size, in CSS, not just content.
 *
 * ```ts
 * const vellum = createTranslucentSheets(document.querySelector('#hero')!)
 * vellum.start()
 * // …later
 * vellum.destroy()
 * ```
 */
export function createTranslucentSheets(el: HTMLElement, opts: Partial<TranslucentSheetsOptions> = {}): EffectHandle {
  return mount<TranslucentSheetsOptions>(el, opts, {
    defaults: translucentSheetsDefaults,
    create: () => new TranslucentSheetsSurface()
  })
}

export default createTranslucentSheets
```

## 2. What it is

A loose stack of translucent paper, drifting. Where two sheets cross the paper
goes darker, and you can read the order of the pile by how dark it gets.

The blend mode is the whole design. These sheets multiply rather than composite:
the result is destination times source, which is what a diffusing sheet laid over
another one actually does. More usefully, multiplying is order-independent. Two
sheets crossing give the same answer whichever is drawn first.

That matters more than it sounds. Ordinary alpha-blended transparency has to be
sorted back to front, and there is no way to sort inside a single InstancedMesh,
so stacked-plane scenes usually either flicker as the sort order flips or give up
on instancing and take a draw call per sheet. Multiplying sidesteps the problem
rather than solving it. Fourteen sheets draw in one call, in any order, and the
picture is the same.

The cost is real and worth stating. Nothing here can be brighter than the paper.
A multiply has no way to add light, so there is no specular highlight and there
cannot be one. Where a sheet turns into the light it fades toward no tint at all,
which within a multiply is the only direction "brighter" exists in, and which
happens to be what paper catching a lamp looks like anyway.

There is no shadow map either. Nothing in the scene is opaque enough to cast one,
and a translucent sheet throwing a hard shadow is the tell that gives these scenes
away. The overlaps are the depth cue.

Concept credit: [Infinite Liquid Glass
Grid](https://tympanus.net/codrops/), Codrops, September 2026, for the idea that
the glass can be faked in the shader with no refraction pass at all. Written from
scratch, and recast from glass to paper.

## 3. Wire it in

**Plain HTML.** three.js has to be a dependency of your project already. It is
not bundled and it is not fetched.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createTranslucentSheets } from './beamish/effects/translucent-sheets/core.js'

  const vellum = createTranslucentSheets(document.querySelector('#backdrop'), {
    sheets: 14,
    period: 30
  })
  vellum.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createTranslucentSheets } from '@/beamish/effects/translucent-sheets/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const vellum = createTranslucentSheets(host.current, { period: 30 })
    vellum.start()
    return () => vellum.destroy()
  }, [])

  return <div ref={host} className="fixed inset-0 -z-10" />
}
```

Do not put option values in the dependency array. Call `update()` instead. Every
option but one is a uniform or a camera value, so nothing rebuilds.

The exception is `sheets`. Changing the count disposes the geometry and builds a
new InstancedMesh, so do not animate it or bind it to a slider that fires on every
pixel of drag.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createTranslucentSheets } from '@/beamish/effects/translucent-sheets/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let vellum: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  vellum = createTranslucentSheets(host.value, { period: 30 })
  vellum.start()
})

onBeforeUnmount(() => vellum?.destroy())
</script>

<template>
  <div ref="host" class="backdrop" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

**Behind content.** Bring `density` down to about 0.06 and raise `period` to 30.
Fourteen sheets compound fast, and the middle of the pile is where they all cross,
so that is where your text will be. Do not reach for opacity: it greys the paper
and loses the thing that makes the overlaps look like paper rather than like
layers.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper behind the stack. Everything else multiplies down from here, so this is the lightest value in the scene. |
| `ink` | color | `#9a8e79` | any CSS hex | What each sheet multiplies the paper by. Most of the stack is this. A warm grey reads as tracing paper; push it green and it becomes drafting film. |
| `accent` | color | `#c44400` | any CSS hex | Roughly one sheet in five is printed in this instead. Never the first, so the accent always has something crossing it. |
| `sheets` | number | `14` | 3 to 30 | How many sheets. Changing it rebuilds the pile, which is the one option here that is not free. Depth is by index, so a new sheet lands on top rather than shuffling the stack. |
| `density` | number | `0.12` | 0.02 to 0.5 | How dark one sheet is on its own. The stack compounds from here, so small numbers go a long way: fourteen sheets at 0.3 is a solid brown blot in the middle where they all cross. Behind content, come down rather than reaching for opacity. |
| `spread` | number | `1` | 0.2 to 2 | How far the sheets are scattered. Low is a neat pile with heavy overlap, high is a table strewn with them. |
| `radius` | number | `0.08` | 0 to 0.5 | Corner radius of a sheet. Real vellum is guillotined rather than die-cut, so keep it small. It exists so the corners do not read as a hard polygon. |
| `sheen` | number | `0.55` | 0 to 1 | How much a sheet lifts toward the light as it turns into it. Within a multiply this can only mean less tint, never more light, which is what paper catching a lamp actually looks like. |
| `fibre` | number | `0.5` | 0 to 1 | Paper fibre. At zero the sheets are film rather than paper. |
| `elevation` | number | `34` | 0 to 90 | Light height above the horizon, degrees. |
| `azimuth` | number | `42` | 0 to 360 | Light direction around the compass, degrees. |
| `tilt` | number | `0.42` | 0 to 1 | Camera height. 0 is edge on to the pile, which is mostly cut edges. 1 looks straight down at it. |
| `zoom` | number | `0.62` | 0.15 to 1.4 | How much of the frame the stack fills. |
| `period` | number | `12` | 2 to 60 | Seconds for one loop of the drift. Every sheet travels a closed circle, so the pile returns to exactly where it started and the loop is seamless. Behind content, raise it. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, disposes the geometry and material,
cancels the RAF, disconnects both observers and removes every listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever runs
out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createTranslucentSheets` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable. `stop()` and `start()` are on the handle for that. Surface them as a
real control in your own build. Reduced motion does not cover this, and plenty of
people who need a pause button have not set that preference.

Handled in the runtime with a live `matchMedia` listener. Under reduced motion the
loop never starts and one frame is drawn at `reducedMotionTime`.

Any frame of this is a finished picture, so the default is as good as any other
number. If you want a particular arrangement, scrub `renderAtTime` until you find
one you like and set `reducedMotionTime` to it.

## 7. The three mistakes most likely to be made here

1. **Raising `density` to make it more visible.** It compounds. One sheet at 0.3
   looks reasonable and fourteen of them produce a solid brown blot in the middle
   where they all cross. If the effect is too faint, add sheets or reduce `spread`
   so they overlap more. Density is the last thing to touch.

2. **Expecting a highlight.** There is no way to add light inside a multiply. If
   you need a sheet to gleam, `sheen` is as far as it goes, and what it does is
   remove tint rather than add brightness.

3. **Animating `sheets`.** It is the one option that rebuilds. Everything else is
   free to change per frame; this one disposes a geometry and allocates a new
   InstancedMesh.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing. Give the host `position: fixed; inset: 0`, or an
   explicit height.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
