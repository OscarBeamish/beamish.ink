You are adding **SphereCluster** from Beamish to this project.

> A drift of lit spheres that breathes on its own and opens where you point. Backdrops · effect · MIT.
> https://beamish.ink/effects/sphere-cluster

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- One InstancedMesh rather than a mesh each: one geometry, one draw call and a matrix per sphere. The scene this is taken from builds a hundred and twenty eight separate spheres at sixty-four segments square, which is about a million triangles and a draw call apiece for balls a few dozen pixels across.
- No shadow map. A cluster of spheres is all curvature, so the bright side, the terminator and the fill carry the form; a shadow pass over this many instances costs a second pass over every one of them to darken contacts nobody is looking for.
- The layout is a hash of the sphere index, not a table. A direction and a cube-rooted radius rather than three independent axes, because three axes fill a box and the corners of it read as corners.
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/sphere-cluster/core.ts`**

```ts
/*
 * SphereCluster: Beamish
 * https://beamish.ink/effects/sphere-cluster
 *
 * A drift of lit spheres, breathing, that opens where you point.
 *
 * WHY THIS IS NOT THE SIMULATION IT CAME FROM
 *
 * The scene this is taken from is a physics toy: pointing at a sphere adds a
 * force to it, the force decays by five per cent a frame, and every pair of
 * spheres is tested for overlap and pushed apart. All three of those are
 * accumulators. The position of a sphere at a given moment depends on how it
 * got there rather than on the clock, which means the scene cannot be seeked,
 * cannot be recorded without a visible jump where the take wraps, and drifts
 * into a different arrangement every time it is loaded.
 *
 * So the state is gone and every sphere is a closed form in `t`:
 *
 *   Where it sits comes from a hash of its index, which never changes.
 *   How it breathes is a sine of `t` with a per-sphere phase, and the
 *   frequency is a whole number of turns over the period, so the cluster is
 *   exactly where it started when the period is up.
 *   How far the pointer has moved it is a function of where the pointer is
 *   now, not of where it has been.
 *
 * What is lost is the squash: a sphere no longer carries momentum away from
 * the cursor and settle back. What is gained is that `renderAtTime(t)` can be
 * called with any time in any order, which is the contract every item here
 * keeps and the only reason the recorder works.
 *
 * The collision pass is gone too, and not only because it accumulates. It is
 * every pair, so the cost is the square of the count: at the hundred and
 * twenty eight spheres of the original that is eight thousand distance tests
 * a frame to stop an overlap the layout can simply not create.
 *
 * ONE GEOMETRY, MANY SPHERES
 *
 * An InstancedMesh rather than a mesh each. The scene it came from builds a
 * hundred and twenty eight separate spheres at sixty-four segments square,
 * which is about a million triangles and a draw call each. One geometry at a
 * sensible tessellation, instanced, is one draw call and a matrix per sphere.
 */

import * as THREE from 'three'
import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type Pointer,
  type Surface
} from '../../shared/runtime'

export type SphereClusterOptions = BaseOptions & {
  /** Behind the cluster. Nothing is drawn there, so it is a flat fill. */
  background: string
  /** The spheres themselves. */
  body: string
  /** The key light, which is what gives every sphere its bright side. */
  light: string
  /** The fill, which decides how dark the turned-away side goes. */
  fill: string
  /** How many spheres. The count is the cost: one matrix each, one draw call. */
  count: number
  /** How far the cluster spreads, in scene units. */
  spread: number
  /** How flat the cluster is. 1 is a ball of spheres, 0.3 a drift of them. */
  flatten: number
  /** The largest sphere, in scene units. */
  size: number
  /** How much the sizes vary. At 0 every sphere is the same. */
  sizeVariation: number
  /** How far each sphere drifts as it breathes. */
  breathe: number
  /** How far the pointer pushes a sphere aside. */
  part: number
  /** How wide the parting is, in scene units. */
  partRadius: number
  /** Seed for the layout: where the spheres sit and how big each one is. */
  seed: number
  /** Seconds for one cycle of the breathing. The loop closes exactly on it. */
  period: number
}

export const sphereClusterDefaults: SphereClusterOptions = {
  background: '#07060f',
  body: '#ddd4e8',
  light: '#ffb870',
  fill: '#5f3fe8',
  count: 120,
  spread: 6.6,
  flatten: 0.45,
  size: 0.74,
  sizeVariation: 0.72,
  breathe: 0.16,
  part: 1.1,
  partRadius: 3.4,
  seed: 7,
  period: 20,
  maxDpr: 2,
  reducedMotionTime: 5
}

/* The layout is a hash rather than a table. The scene this came from places a
   hundred and twenty eight spheres by hand, which is a lovely arrangement and
   also somebody else's data; a hash gives a different cluster per seed and one
   fewer thing to keep in step. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123
  return s - Math.floor(s)
}

class SphereClusterSurface implements Surface<SphereClusterOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private mesh: THREE.InstancedMesh | null = null
  private material: THREE.MeshLambertMaterial | null = null
  private key: THREE.DirectionalLight | null = null
  private fill: THREE.DirectionalLight | null = null
  private built = -1
  private seeded = Number.NaN
  /* The resting layout, computed once per seed and never per frame. */
  private home: { x: number; y: number; z: number; r: number; phase: number }[] = []
  private matrix = new THREE.Matrix4()
  private place = new THREE.Vector3()

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('SphereCluster needs a canvas')
    const renderer = new THREE.WebGLRenderer({
      canvas: ctx.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'low-power',
      // The recorder reads pixels back after the draw, and without this the
      // buffer may already have been cleared.
      preserveDrawingBuffer: true
    })
    renderer.setPixelRatio(1)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(26, 1, 0.5, 120)
    camera.position.set(0, 0, 22)

    /*
     * A warm key and a cool fill, opposed, and no shadow map.
     *
     * The fill has to be a DIRECTIONAL light from the other side. An ambient
     * light was tried first and cannot do this job: ambient adds the same
     * amount to every surface whatever way it faces, so a coloured one tints
     * the whole cluster evenly and the turned-away side comes out as the lit
     * side with less of it. What makes a sphere read as lit rather than as
     * coloured in is that its two halves disagree about the colour of the
     * light, and only a second direction can make them disagree.
     *
     * No shadow map. A cluster of spheres is all curvature, so the bright
     * side, the terminator and the fill carry the form; a shadow pass over
     * this many instances costs a second pass over every one of them to
     * darken contacts nobody is looking for.
     */
    const ambient = new THREE.AmbientLight(0xffffff, 0.12)
    scene.add(ambient)
    const key = new THREE.DirectionalLight(0xffffff, 1.35)
    key.position.set(6, 9, 11)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 1.15)
    fill.position.set(-7, -5, -3)
    scene.add(fill)

    const material = new THREE.MeshLambertMaterial({ color: 0xffffff })

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.material = material
    this.key = key
    this.fill = fill
  }

  /* One geometry, one draw call, one matrix per sphere. Rebuilt only when the
     count changes, because an InstancedMesh is sized at construction. */
  private build(count: number): void {
    const scene = this.scene
    const material = this.material
    if (!scene || !material) return
    if (this.mesh) {
      scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh.dispose()
    }
    /*
     * 20 by 14 segments rather than 64 by 64. At this size on screen the
     * silhouette is already smooth, and the original's tessellation is about
     * eight thousand triangles a sphere for a ball a few dozen pixels across.
     */
    const geometry = new THREE.SphereGeometry(1, 20, 14)
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    scene.add(mesh)
    this.mesh = mesh
    this.built = count
  }

  /*
   * Where every sphere rests, and the phase it breathes on. A function of the
   * seed alone, so it is computed when the seed changes rather than per frame.
   */
  private layout(opts: SphereClusterOptions, count: number): void {
    const home: typeof this.home = []
    for (let i = 0; i < count; i++) {
      const n = i + opts.seed * 977
      /*
       * A direction and a radius rather than three independent axes. Three
       * axes fill a box and the corners of it read as corners; a direction
       * with a cube-rooted radius fills a ball evenly, which is what a drift
       * of spheres wants to be before it is flattened.
       */
      const a = hash(n * 1.7) * Math.PI * 2
      const z = hash(n * 3.1) * 2 - 1
      const rim = Math.sqrt(Math.max(0, 1 - z * z))
      const reach = Math.cbrt(hash(n * 5.3))
      home.push({
        x: Math.cos(a) * rim * reach,
        y: z * reach,
        z: Math.sin(a) * rim * reach,
        /* Squared, so a few are large and most are small. A uniform spread of
           radii reads as gravel. */
        r: 0.3 + 0.7 * (1 - hash(n * 7.9) ** 2),
        phase: hash(n * 11.3) * Math.PI * 2
      })
    }
    this.home = home
    this.seeded = opts.seed
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    const renderer = this.renderer
    const camera = this.camera
    if (!renderer || !camera) return
    renderer.setPixelRatio(size.dpr)
    renderer.setSize(size.pixelWidth / size.dpr, size.pixelHeight / size.dpr, false)
    camera.aspect = size.pixelWidth / Math.max(size.pixelHeight, 1)
    camera.updateProjectionMatrix()
  }

  render(t: number, opts: SphereClusterOptions, pointer: Pointer): void {
    const renderer = this.renderer
    const scene = this.scene
    const camera = this.camera
    if (!renderer || !scene || !camera) return

    const count = Math.max(1, Math.min(400, Math.round(opts.count)))
    if (count !== this.built) this.build(count)
    if (opts.seed !== this.seeded || this.home.length !== count) this.layout(opts, count)
    const mesh = this.mesh
    if (!mesh) return

    this.material?.color.set(opts.body)
    this.key?.color.set(opts.light)
    this.fill?.color.set(opts.fill)
    scene.background = new THREE.Color(opts.background)

    /*
     * A whole number of turns over the period, so the first frame and the
     * last are the same frame and the loop joins with nothing to hide.
     */
    const turn = (Math.PI * 2 * t) / Math.max(opts.period, 0.001)

    /*
     * Where the pointer is, on the plane the cluster sits in. Read once per
     * frame rather than per sphere, and from where the pointer IS rather than
     * from where it has been: a force that decays is an accumulator and would
     * take renderAtTime's determinism with it.
     */
    const reachX = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z * camera.aspect
    const reachY = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z
    const pointerX = pointer.active ? (pointer.x - 0.5) * 2 * reachX : 0
    const pointerY = pointer.active ? -(pointer.y - 0.5) * 2 * reachY : 0
    const parting = pointer.active ? opts.part : 0
    const radius = Math.max(opts.partRadius, 0.001)

    for (let i = 0; i < count; i++) {
      const h = this.home[i]!
      const flat = Math.max(0.05, opts.flatten)

      let x = h.x * opts.spread
      let y = h.y * opts.spread * flat
      let z = h.z * opts.spread

      /* Breathing: a drift along the cluster's own radius, so the whole thing
         swells and settles rather than sliding. */
      const swell = Math.sin(turn + h.phase) * opts.breathe
      x += h.x * swell
      y += h.y * swell
      z += h.z * swell

      /*
       * The parting. Pushed away from the pointer in the plane of the screen
       * only: moving spheres towards the camera reads as the cluster bulging
       * at whoever is looking at it, which is the wrong story and much louder.
       */
      if (parting > 0) {
        const dx = x - pointerX
        const dy = y - pointerY
        const away = Math.hypot(dx, dy)
        if (away < radius) {
          const fall = 1 - away / radius
          const push = fall * fall * parting
          const inv = 1 / Math.max(away, 0.0001)
          x += dx * inv * push
          y += dy * inv * push
        }
      }

      const scale = Math.max(0.01, opts.size) * (1 - opts.sizeVariation * (1 - h.r))
      this.place.set(x, y, z)
      this.matrix.makeScale(scale, scale, scale)
      this.matrix.setPosition(this.place)
      mesh.setMatrixAt(i, this.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.renderer?.getContext() ?? null
  }

  teardown(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose()
      this.mesh.dispose()
    }
    this.material?.dispose()
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.mesh = null
    this.material = null
    this.home = []
    this.built = -1
    this.seeded = Number.NaN
  }
}

/**
 * Mount SphereCluster into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const drift = createSphereCluster(document.querySelector('#hero')!)
 * drift.start()
 * // …later
 * drift.destroy()
 * ```
 */
export function createSphereCluster(
  el: HTMLElement,
  opts: Partial<SphereClusterOptions> = {}
): EffectHandle {
  return mount<SphereClusterOptions>(el, opts, {
    defaults: sphereClusterDefaults,
    create: () => new SphereClusterSurface()
  })
}

export default createSphereCluster
```

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

import { resolveAutoGrounds } from './ground'

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

/**
 * One scripted press. `t` is seconds from the start of the loop; x/y are 0 to 1
 * across the element.
 *
 * A path can say where the cursor is at any moment, but a press is an instant
 * rather than a position, so it needs its own list. An effect that answers to
 * clicks reads this alongside whatever real presses it has seen, which is what
 * lets the recorder produce a take with clicks in it without anything having
 * been clicked.
 */
export type PressKey = { t: number; x: number; y: number }

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
   * Scripted presses, for effects that answer to a click. Each is a time and a
   * point, and an effect treats them exactly as it treats a real press that
   * happened at that moment, so a recorded take and a live page agree.
   *
   * Unlike `pointerPath`, this does not replace the live input: a scripted press
   * and a real one are the same kind of event, and an effect that ignored the
   * cursor while a script was running would be dead on the page.
   */
  pressPath?: PressKey[]
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
  /*
   * `auto` in a colour option means take it from the page. Resolved here, at
   * the one point that has both the host element and the merged options, so no
   * item has to reach into the DOM from inside its own render loop.
   */
  let opts: O = resolveAutoGrounds(el, { ...config.defaults, ...(userOpts ?? {}) })

  const kind = config.kind ?? 'canvas'

  let canvas: HTMLCanvasElement | null = null
  if (kind === 'canvas') {
    canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    /*
     * Its own compositor layer, so the page cannot resample it.
     *
     * A canvas whose box lands on a half pixel has to be resampled to the
     * device grid, and which way it snaps is the compositor's business rather
     * than ours. Snapping one way on one frame and the other way on the next
     * moves the whole picture by a pixel, which is a flicker between two
     * positions that leaves no trace anywhere: the drawing buffer is perfect,
     * the clock is smooth, the box never changes and every number comes back
     * clean. It was reported on a canvas sitting at x = 683.5, and the same
     * effect at x = 123.5 on another machine was steady.
     *
     * translateZ(0) rather than will-change, because will-change is a hint
     * the browser is free to drop and this needs to be a promise. The cost is
     * one layer per live effect, and there is only ever one.
     */
    canvas.style.transform = 'translateZ(0)'
    canvas.style.backfaceVisibility = 'hidden'
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
    /*
     * Clamped at both ends.
     *
     * The top end is the tab-switch spike this always guarded against. The
     * bottom end is that a rAF timestamp is the moment the frame began, which
     * can be EARLIER than the performance.now() start() took a moment before:
     * the subtraction is then negative, Math.min keeps it, and the effect's
     * clock runs backwards. Measured on WindField, elapsed began at -0.1088
     * and four frames were rendered at a negative t before it climbed past
     * zero. A shader handed a smaller t than last frame draws an earlier
     * picture, which is a visible jump backwards on every start, and start
     * runs again every time the panel scrolls into view or the tab is
     * returned to.
     */
    const dt = Math.min(Math.max(stamp - lastStamp, 0), 100) / 1000
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
  /*
   * The gate watches the element's parent, not the element.
   *
   * Watching the element deadlocks any effect that clips or moves its own host.
   * A reveal starts with its host clipped to nothing, the observer reports that
   * as not intersecting, the runtime stops the loop, and the clip therefore
   * never advances off the host: blank for ever, with the replay button unable
   * to escape it because `visible` can never become true again. The gate's
   * input must not be geometry the effect controls.
   *
   * The parent is laid out by the page rather than by the effect, so it breaks
   * the cycle. It is usually a little larger, which means an effect can start a
   * frame or two before it is strictly on screen. That is the cheaper mistake.
   */
  intersectionObserver?.observe(el.parentElement ?? el)

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
      opts = resolveAutoGrounds(el, { ...opts, ...(next as Partial<O>) })
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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `background` | color | `#07060f` | any CSS hex | Behind the cluster. Nothing is drawn there, so it is a flat fill, and a near-black with a trace of the fill hue in it rather than a neutral grey: a neutral ground flattens whatever stands in front of it. |
| `body` | color | `#ddd4e8` | any CSS hex | The spheres. One colour for all of them, because what separates one sphere from the next is the light falling across it rather than its own hue. |
| `light` | color | `#ffb870` | any CSS hex | The key light, which is what gives every sphere its bright side. Warm against a cool fill is the whole palette: it is the same split that makes metal and skin read as lit rather than as coloured in. |
| `fill` | color | `#5f3fe8` | any CSS hex | The fill light, from the opposite side to the key, which decides what colour the turned-away half of a sphere goes. It has to be a direction rather than an ambient: ambient adds the same amount to every surface whatever way it faces, so a coloured one tints the whole cluster evenly and the shadowed side comes out as the lit side with less of it. What makes a sphere read as lit rather than as coloured in is that its two halves disagree about the colour of the light. |
| `count` | number | `120` | 8 to 400 (looks right between 60 and 180) | How many spheres. This is the cost and it is linear: one matrix written per sphere per frame and one draw call for all of them. |
| `spread` | number | `6.6` | 1 to 12 (looks right between 3.5 and 7) | How far the cluster reaches, in scene units. Large and sparse reads as a galaxy; small and dense reads as a single mass with a lumpy edge. |
| `flatten` | number | `0.45` | 0.05 to 1 (looks right between 0.3 and 0.7) | How flat the cluster is. At 1 it is a ball of spheres and mostly hides itself; lower values spread it across the frame, which is what a backdrop wants, and let the light reach further into it. |
| `size` | number | `0.74` | 0.1 to 2.5 | The largest sphere, in scene units. Past about 1.4 at the default spread the big ones meet and the cluster becomes one surface. |
| `sizeVariation` | number | `0.72` | 0 to 1 (looks right between 0.5 and 0.85) | How much the sizes differ. The spread is squared so a few are large and most are small: a uniform spread of radii reads as gravel. At 0 every sphere is the same size, which reads as a diagram. |
| `breathe` | number | `0.16` | 0 to 1 (looks right between 0.1 and 0.35) | How far each sphere drifts along the cluster's own radius as it breathes, so the whole thing swells and settles rather than sliding. At 0 it is still, which costs nothing to draw and is a legitimate way to use it. |
| `part` | number | `1.1` | 0 to 4 | How far the pointer pushes a sphere aside. Instantaneous rather than a force that decays: a decaying force is an accumulator, and the frame would then depend on the frames before it, which renderAtTime cannot allow. The squash of the scene this came from is what that costs. |
| `partRadius` | number | `3.4` | 0.5 to 10 | How wide the parting is, in scene units. Wide and gentle reads as the cluster leaning away; narrow and strong reads as a hole being pushed through it. |
| `seed` | number | `7` | 0 to 999 | The layout: where every sphere sits and how big it is. Every value is a different cluster and none is better than another. |
| `period` | number | `20` | 6 to 90 s (looks right between 14 and 40) | Seconds for one cycle of the breathing. The loop closes exactly on it, because the frequency is a whole number of turns in that time. |

## 5. Why it is not the simulation it came from

The scene this is taken from is a physics toy. Pointing at a sphere adds a
force to it; the force decays five per cent a frame; every pair of spheres is
tested for overlap and pushed apart. All three are **accumulators** — a
sphere's position depends on how it got there, not on the clock.

That cannot be seeked, so it cannot be recorded without a jump where the take
wraps, and it arranges itself differently every time the page loads.

So the state is gone. Every sphere is a closed form in `t`:

| | |
| --- | --- |
| **where it sits** | a hash of its index, which never changes |
| **how it breathes** | `sin(t·ω + phase)`, ω a whole number of turns per period |
| **how far the pointer moved it** | a function of where the pointer **is**, never of where it has been |

**What that costs:** the squash. A sphere no longer carries momentum away from
the cursor and settles back. Everything else it buys — seeking, an exact loop,
the same cluster on every load — is worth more for a backdrop.

The collision pass goes too, and not only because it accumulates. It is every
pair, so the cost is the square of the count: 128 spheres is ~8,000 distance
tests a frame to prevent an overlap a hash layout simply does not create.

## 6. Drawing it

**One `InstancedMesh`**, not a mesh each. One geometry, one draw call, a matrix
per sphere. The original builds 128 separate spheres at 64×64 segments — about
a million triangles — for balls a few dozen pixels across. 20×14 is already
smooth at this size.

**No shadow map.** A cluster of spheres is all curvature, so the bright side,
the terminator and the fill carry the form. A shadow pass over this many
instances costs a second pass over every one of them to darken contacts nobody
is looking for.

## 7. The layout

Use a **direction and a cube-rooted radius**, not three independent axes.
Three axes fill a box and the corners of it read as corners. A direction with
`cbrt(random)` fills a ball evenly.

Square the size distribution so a few spheres are large and most are small. A
uniform spread of radii reads as gravel.

## 8. The light is the palette

One body colour for every sphere. What separates one from the next is the
light falling across it, so the colour lives in the **lights**: a warm key
against a cool, saturated ambient. The shadowed half of a sphere is the half
that shows you what the room is made of, so a grey ambient wastes it.

---

Concept credit: The scene: a cluster of lit spheres behind a hero, which you can push around with the cursor. Its version is a physics toy with accumulating forces and pairwise collisions, so none of that could come across; every sphere here is a closed form in t instead, and the squash is what that costs. The code is this repo's own., by Ray Velez, https://github.com/RayVelez27/instalanding.ai.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
