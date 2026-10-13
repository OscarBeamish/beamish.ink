You are adding **LightTrails** from Beamish to this project.

> A motorway at night on a long exposure, two rivers of light running away and toward you. Backdrops · effect · MIT.
> https://beamish.ink/effects/light-trails

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- One stretched box drawn many times with an InstancedMesh, each copy running down its own lane. The idea is from a Codrops article by Daniel Velasquez, which took it from an Akira poster
- Two directions, two colours. Tail lights going away are red and headlights coming toward you are white. One colour in one direction is a tunnel of stripes; the pair of opposing streams is what says motorway
- The oncoming ones cross the frame much faster, because their speed and yours add up. That difference does most of the work and it comes free from pointing them the other way
- The trails are different lengths. A real exposure is as long as the shutter was open and as fast as the car was going, so no two streaks match; equal lengths read as a conveyor belt
- Each trail covers a whole number of road lengths in one period, so its position is a mod of a function of t with no running total in it, and after one period everything is exactly where it started. Choosing speeds freely looks identical and never repeats, so the recording jumps on its last frame
- A box rather than a plane. Seen from a low camera a flat streak disappears whenever it is edge on, which makes the traffic flicker
- three's own fog rather than a hand-written fade. It is per-vertex, which is enough here because a trail is long: its two ends are far enough apart for the fog to differ along it, so a streak fades out along its own length
- Without the fog the road ends in a hard line of lights sitting on nothing and the frame has no depth at all
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/light-trails/core.ts`**

```ts
/*
 * LightTrails: Beamish
 * https://beamish.ink/effects/light-trails
 *
 * A motorway at night, shot on a long exposure: two rivers of light running
 * away and toward you.
 *
 * The idea is from a Codrops article by Daniel Velasquez, credited in
 * meta.json, which took it from an Akira poster. One stretched shape, drawn
 * many times with an instanced mesh, each copy running down its own lane.
 *
 * WHAT MAKES IT A ROAD AND NOT A SCREENSAVER
 *
 *   Two directions, two colours. Tail lights going away are red; headlights
 *   coming toward you are white. One colour in one direction is a tunnel of
 *   stripes; it is the pair of opposing streams that says motorway. The
 *   oncoming ones also move much faster across the frame, because their speed
 *   and yours add up, and that difference does most of the work.
 *
 *   The trails are different lengths. A real exposure is as long as the
 *   shutter was open and as fast as the car was going, so no two streaks match.
 *   Equal lengths read as a conveyor belt.
 *
 *   It has to go into fog. Without the distance fade the road ends in a hard
 *   line of lights sitting on nothing, and the frame stops having any depth.
 *
 * HOW IT LOOPS
 *
 * Each trail runs a whole number of road lengths over one period. Its position
 * is then `mod(phase + t * speed, road)`, which is a function of `t` alone with
 * no running total in it, and after one period every trail is exactly where it
 * started.
 *
 * Choosing speeds freely was the first attempt. It looks identical and it
 * never repeats, so the recording jumps on its last frame. The speeds are
 * therefore picked from the few that divide the period, and the spread between
 * them is what you hear as traffic rather than as a machine.
 */

import * as THREE from 'three'
import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type LightTrailsOptions = BaseOptions & {
  /** Seconds before everything is back where it started. */
  period: number
  /** How many trails, across both carriageways. */
  trails: number
  /** Lanes each way. */
  lanes: number
  /** How long a streak is at its longest, in road units. */
  length: number
  /** How thick a streak is. */
  weight: number
  /** How far down the road you can see before the fog takes it. */
  reach: number
  /** Tail lights, going away from you. */
  away: string
  /** Headlights, coming toward you. */
  toward: string
  /** The night behind it. */
  night: string
  /** How high the camera sits above the road. */
  height: number
  /** How wide an angle the camera takes in, in degrees. */
  lens: number
  /** Seed for the traffic. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const lightTrailsDefaults: LightTrailsOptions = {
  period: 8,
  trails: 260,
  lanes: 3,
  length: 18,
  weight: 0.34,
  reach: 190,
  away: '#ff2d2d',
  toward: '#fff2d0',
  night: '#07070c',
  height: 5.5,
  lens: 62,
  seed: 3,
  maxDpr: 2,
  reducedMotionTime: 2
}

/*
 * The road, in world units, and it is deliberately short.
 *
 * A long road spreads the traffic thin. The first version was 420 units with
 * a hundred and fifty trails, which is a third of a car per unit of depth: in
 * the near fifty units, where a streak is actually several pixels wide, that
 * left about three per lane. Everything else was a sub-pixel dash near the
 * vanishing point. It read as an empty road at night rather than as a
 * motorway, and no amount of fiddling with the fog changed it, because the
 * fog was never the problem.
 */
const ROAD = 200
/** How wide one lane is, and how far the two carriageways sit apart. */
const LANE = 3.1
const MEDIAN = 3.4

/** A small deterministic generator, so a seed always gives the same traffic. */
function rng(seed: number): () => number {
  let s = (seed | 0) >>> 0
  if (s === 0) s = 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/**
 * One trail: which lane, which way, how long, how fast, and where it started.
 *
 * `laps` is the whole number of road lengths it covers in one period, and it
 * is the reason the thing loops. A speed picked freely looks exactly the same
 * and never comes back.
 */
type Trail = {
  x: number
  dir: number
  len: number
  laps: number
  phase: number
}

class LightTrailsSurface implements Surface<LightTrailsOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private mesh: THREE.InstancedMesh | null = null
  private fog: THREE.Fog | null = null

  private traffic: Trail[] = []
  private builtFor = ''
  private matrix = new THREE.Matrix4()
  private colour = new THREE.Color()

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('LightTrails needs a canvas')
    const renderer = new THREE.WebGLRenderer({ canvas: ctx.canvas, antialias: true })
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, ROAD * 1.6)
    scene.add(camera)

    /*
     * three's own fog rather than a hand-written fade. It is per-vertex on a
     * basic material, which is all this needs because a trail is a long thin
     * box: its ends are far enough apart for the fog to differ along it, which
     * is what makes a streak fade out along its own length.
     */
    const fog = new THREE.Fog(0x07070c, 10, 210)
    scene.fog = fog

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.fog = fog
  }

  resize(size: { pixelWidth: number; pixelHeight: number }): void {
    this.renderer?.setSize(size.pixelWidth, size.pixelHeight, false)
    const camera = this.camera
    if (camera) {
      camera.aspect = size.pixelWidth / Math.max(size.pixelHeight, 1)
      camera.updateProjectionMatrix()
    }
  }

  private build(opts: LightTrailsOptions): void {
    const scene = this.scene
    if (!scene) return

    const count = Math.max(2, Math.round(opts.trails))
    const lanes = Math.max(1, Math.round(opts.lanes))
    const key = [count, lanes, opts.length, opts.weight, opts.seed, opts.away, opts.toward].join('/')
    if (key === this.builtFor) return

    if (this.mesh) {
      scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      ;(this.mesh.material as THREE.Material).dispose()
      this.mesh.dispose()
    }

    /*
     * One unit long, then stretched per instance. A box rather than a plane so
     * a streak has a side to it: seen from a low camera a flat one disappears
     * whenever it is edge on, which makes the traffic flicker.
     */
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ fog: true })
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.frustumCulled = false
    scene.add(mesh)

    const random = rng(opts.seed)
    const away = new THREE.Color(opts.away)
    const toward = new THREE.Color(opts.toward)
    const traffic: Trail[] = []

    for (let i = 0; i < count; i++) {
      /* Half each way, so neither carriageway is busier by accident. */
      const dir = i % 2 === 0 ? 1 : -1
      const lane = Math.floor(random() * lanes)
      const x = dir * (MEDIAN + lane * LANE + (random() - 0.5) * 0.5)

      /*
       * Whole laps per period. Two to five: one lap is too slow to read as
       * traffic at any sensible period, and past about six the streaks cross
       * the frame faster than the eye resolves them.
       */
      const laps = 2 + Math.floor(random() * 4)

      traffic.push({
        x,
        dir,
        len: opts.length * (0.35 + random() * 0.65),
        laps,
        phase: random() * ROAD
      })

      /*
       * Colour per instance. Oncoming headlights are warm white and the ones
       * going away are red, which is the single detail that makes this a road
       * rather than a field of stripes.
       */
      this.colour.copy(dir < 0 ? toward : away)
      mesh.setColorAt(i, this.colour)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    this.mesh = mesh
    this.traffic = traffic
    this.builtFor = key
  }

  render(t: number, opts: LightTrailsOptions): void {
    const renderer = this.renderer
    const scene = this.scene
    const camera = this.camera
    if (!renderer || !scene || !camera) return
    this.build(opts)

    const mesh = this.mesh
    const fog = this.fog
    if (!mesh || !fog) return

    scene.background = this.colour.set(opts.night).clone()
    fog.color.set(opts.night)
    /*
     * The fog starts most of the way out, not just in front of the camera.
     * Starting it near the camera was the first version: by the mid distance
     * everything was already half gone, so a road of a hundred and fifty cars
     * rendered as the nearest dozen and a smudge. The near and middle have to
     * stay bright or there is no traffic, only a few streaks.
     */
    fog.near = Math.max(opts.reach * 0.42, 1)
    fog.far = Math.max(opts.reach, fog.near + 1)

    camera.position.set(0, Math.max(opts.height, 0.4), ROAD * 0.5)
    camera.lookAt(0, Math.max(opts.height, 0.4) * 0.55, -ROAD * 0.1)
    if (camera.fov !== opts.lens) {
      camera.fov = opts.lens
      camera.updateProjectionMatrix()
    }

    const period = Math.max(opts.period, 0.1)
    const weight = Math.max(opts.weight, 0.02)

    for (let i = 0; i < this.traffic.length; i++) {
      const trail = this.traffic[i]!

      /*
       * `mod` of a function of t, never a running total. Every trail covers a
       * whole number of road lengths in one period, so this returns to its
       * starting value exactly when t does.
       */
      const travelled = (trail.laps * ROAD * t) / period

      /*
       * How far ahead of the camera this trail is, always between nothing and
       * the length of the road. Laying the trails out around the origin
       * instead was the first version and half of them were behind the
       * camera at any moment, so a hundred and fifty cars rendered as a dozen.
       */
      const ahead = (((trail.phase + travelled * trail.dir) % ROAD) + ROAD) % ROAD

      this.matrix.makeScale(weight, weight, trail.len)
      this.matrix.setPosition(trail.x, 0, camera.position.z - ahead)
      mesh.setMatrixAt(i, this.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.renderer?.getContext() ?? null
  }

  teardown(): void {
    const mesh = this.mesh
    if (mesh) {
      this.scene?.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    }
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.mesh = null
    this.fog = null
    this.traffic = []
    this.builtFor = ''
  }
}

/**
 * Mount LightTrails into `el`.
 *
 * ```ts
 * const road = createLightTrails(document.querySelector('#hero')!)
 * road.start()
 * // …later
 * road.destroy()
 * ```
 */
export function createLightTrails(
  el: HTMLElement,
  opts: Partial<LightTrailsOptions> = {}
): EffectHandle {
  return mount<LightTrailsOptions>(el, opts, {
    defaults: lightTrailsDefaults,
    create: () => new LightTrailsSurface()
  })
}

export default createLightTrails
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

## 2. What it is

LightTrails is a motorway at night shot on a long exposure: two rivers of
light, one running away from you and one coming toward you, fading into fog.

One stretched box, drawn many times with an instanced mesh, each copy running
down its own lane. The idea is from a [Codrops article by Daniel
Velasquez](https://tympanus.net/codrops/2019/11/13/high-speed-light-trails-in-three-js/),
which took it from an Akira poster.

## 3. Wire it in

**Plain HTML.**

```html
<div id="hero" style="position: relative; height: 100vh"></div>

<script type="module">
  import { createLightTrails } from './beamish/effects/light-trails/core.js'

  const road = createLightTrails(document.querySelector('#hero'))
  road.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createLightTrails } from '@/beamish/effects/light-trails/core'

export function Hero() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const road = createLightTrails(host.current, { height: 5.5 })
    road.start()
    return () => road.destroy()
  }, [])

  return <div ref={host} style={{ height: '100vh' }} />
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createLightTrails } from '@/beamish/effects/light-trails/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let road: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  road = createLightTrails(host.value)
  road.start()
})

onBeforeUnmount(() => road?.destroy())
</script>

<template><div ref="host" class="hero" /></template>
```

**Astro.** Nothing extra is required, but `three` has to be installed.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `period` | number | `8` | 2 to 60 s (looks right between 6 and 16) | Seconds before everything is back where it started. Every trail covers a whole number of road lengths in this time, which is what makes it loop, so this is also the traffic speed: shorter is faster. |
| `trails` | number | `260` | 4 to 600 (looks right between 80 and 260) | How many streaks, across both carriageways, split evenly between the two directions. It has to be high, because the road is seen end on: the trails are spread through depth, and only the nearest third are more than a couple of pixels wide. Below about 60 it is a quiet road at three in the morning, which is a different and quite good picture. |
| `lanes` | number | `3` | 1 to 6 (looks right between 2 and 4) | Lanes each way. More lanes spread the traffic sideways and fill the frame; one lane each way is a country road and leaves a lot of night. |
| `length` | number | `18` | 2 to 120 (looks right between 14 and 48) | The longest a streak gets, in road units. Each trail takes a random share of this, so it sets the spread as well as the maximum. Long is a slow shutter: the streaks start to overlap and the road turns into continuous ribbons. |
| `weight` | number | `0.34` | 0.04 to 2 (looks right between 0.2 and 0.6) | How thick a streak is. Thin reads as a distant motorway seen from a bridge; thick reads as being down among the traffic. |
| `reach` | number | `190` | 30 to 200 (looks right between 120 and 195) | How far down the road you can see before the fog takes it. The one that decides whether there is any depth: too far and the road ends in a hard line of lights sitting on nothing. |
| `away` | color | `#ff2d2d` | any CSS hex | Tail lights, going away from you. Red because that is what the back of a car is, and the moment you make both streams the same colour the whole thing stops being a road. |
| `toward` | color | `#fff2d0` | any CSS hex | Headlights, coming toward you. Warm white rather than pure: a headlight is a filament or a slightly blue LED, and pure white next to pure red reads as a test card. |
| `night` | color | `#07070c` | any CSS hex | The night behind it, and also what the fog fades into, so the two are the same value on purpose. A fog colour that differs from the background leaves a visible band where the road ends. |
| `height` | number | `5.5` | 0.5 to 40 (looks right between 3 and 12) | How high the camera sits above the road. Low is in the traffic and the lanes overlap into a tangle; high is a bridge, and the lanes separate into readable lines. This is the biggest single change to how it looks. |
| `lens` | number | `62` | 20 to 110 deg (looks right between 40 and 80) | How wide an angle the camera takes in. Narrow compresses the road and piles the distant traffic up, which is what a long lens does and is most of the look of the photographs this comes from. |
| `seed` | number | `3` | 1 to 9999 | Seed for the traffic: which lane each trail is in, how long it is, and how fast it goes. The same seed gives the same road. |
| `maxDpr` | number | `2` | 1 to 3 | Device pixel ratio ceiling. Thin bright streaks on a dark ground alias badly, so this is worth leaving at 2. |
| `reducedMotionTime` | number | `2` | 0 to 60 s | The single frame shown when the user prefers reduced motion. Any moment works: a still of this is a long-exposure photograph, which is what it was imitating in the first place. |

## 5. Three things make it a road

**Two directions, two colours.** Tail lights going away are red; headlights
coming toward you are white. One colour in one direction is a tunnel of
stripes. It is the pair of opposing streams that says motorway, and it costs
nothing: half the instances point the other way.

The oncoming ones also cross the frame much faster, because their speed and
yours add up. That difference does most of the work and you get it for free.

**The trails are different lengths.** A real exposure is as long as the shutter
was open and as fast as the car was going, so no two streaks match. Equal
lengths read as a conveyor belt.

**It has to go into fog.** Without the distance fade the road ends in a hard
line of lights sitting on nothing, and the frame has no depth at all.

## 6. How it loops

Each trail covers a **whole number of road lengths** in one period. Its
position is then a `mod` of a function of `t`, with no running total anywhere,
so it can be asked for at any moment and it returns to exactly where it started
when `t` does.

Choosing the speeds freely was the first attempt. It looks identical and it
never repeats, so the recording jumps on its last frame. The speeds are picked
from the few that divide the period, and the spread between those is what reads
as traffic rather than as a machine.

## 7. Two small decisions

**A box, not a plane.** Seen from a low camera a flat streak disappears
whenever it is edge on, which makes the whole road flicker.

**three's own fog**, not a hand-written fade. It is per-vertex on a basic
material, which is enough here precisely because a trail is long: its two ends
are far enough apart for the fog to differ along it, so a streak fades out
along its own length rather than as a block.

Set the fog colour and the background to the same value. A fog that fades to
something else leaves a visible band where the road ends.

## 8. Tuning it

1. **`height`.** The biggest single change to how it looks. Low is down among
   the traffic and the lanes overlap into a tangle; high is a bridge, and the
   lanes separate into readable lines.
2. **`lens`.** Narrow compresses the road and piles the distant traffic up,
   which is what a long lens does and is most of the look of the photographs
   this comes from.
3. **`reach`.** Whether there is any depth. Too far and the road ends in a hard
   line of lights.
4. **`length`.** A longer shutter. Push it up and the streaks overlap into
   continuous ribbons; pull it down and they become separate dashes.
5. **`trails`.** Under about 40 it is a quiet road at three in the morning,
   which is a different and quite good picture.

## 9. Behind content

It is dark with two bright colours in it, and the brightness is all in bands,
so text over the middle of the frame can land on a streak. Raise `height` and
drop `trails` to open it up, or put the copy in the upper third where the fog
has already taken most of the light.

## 10. Accessibility. Do not skip this

Decorative, and there is nothing in the canvas for assistive technology. Under
reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. Any moment works: a still of this is a long-exposure
photograph, which is the thing it was imitating.

## 11. Cleanup and SSR

`destroy()` releases the WebGL context, disposes the geometry and material,
cancels the RAF, disconnects the observers and removes every listener. One live
context at a time is the budget, so call it.

There is nothing to render on the server. The element is empty until the script
runs, so give it a height and a dark background.

## 12. The three mistakes most likely to be made here

1. **One colour, or one direction.** It stops being a road and becomes a field
   of stripes. The two opposing streams are the whole effect.

2. **Equal-length trails.** A conveyor belt. Real streaks vary because real
   shutters and real speeds do.

3. **Freely chosen speeds.** Looks right, never repeats, and the loop jumps on
   its last frame. They have to divide the period.

4. **No fog, or a fog colour that is not the background.** Either the road ends
   in a hard line of lights, or it ends in a visible band of the wrong colour.

5. **Flat planes instead of boxes.** From a low camera they vanish edge on and
   the traffic flickers.

---

Concept credit: A road of instanced light trails running in two directions into fog, from the Codrops article High-speed Light Trails in Three.js, which took it from an Akira poster, by Daniel Velasquez, Codrops, https://tympanus.net/codrops/2019/11/13/high-speed-light-trails-in-three-js/.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
