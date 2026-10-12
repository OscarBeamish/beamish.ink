You are adding **SphereCluster** from Beamish to this project.

> A hundred and one lit spheres that fly in, settle, breathe, and open where you point. Backdrops · effect · MIT.
> https://beamish.ink/effects/sphere-cluster

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- One InstancedMesh rather than a mesh each: the same geometry at the same tessellation, one draw call and one matrix per sphere instead of a hundred and one draw calls.
- The entrance is a closed form in t rather than a timeline. Three stages per sphere, staggered, with the z bulge a half sine over each of the first two so it returns to the resting z exactly. A timeline would have been easier to write and could not be seeked, which would mean no recorded take.
- The warmth survives into the shadow side because it is the material emissive rather than a light. An ambient cannot colour a shadow side: it adds the same amount to every surface whichever way it faces.
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
 * A hundred and one lit spheres that fly in, settle, breathe, and open where
 * you point. The hero of a landing page, as an item.
 *
 * WHAT IS THE SAME AS THE SCENE IT CAME FROM
 *
 * The arrangement, to the hand-placed coordinate: a hundred and one spheres
 * at the positions and radii its author chose, which is most of why the
 * cluster reads as deliberate rather than scattered. The material, including
 * the red emissive that is doing more for the colour than the diffuse is. The
 * three lights and their intensities. The camera, at twenty-five degrees and
 * pulled back on a narrow frame so the cluster still fits. The entrance: each
 * sphere rises from twenty-five below, overshoots, falls back and eases home,
 * staggered two hundredths of a second apart. And the breathing, a sine in y
 * against a cosine in z at half the amplitude, offset a fifth of a radian per
 * sphere.
 *
 * WHAT CANNOT BE
 *
 * Two things, and both for the same reason: `renderAtTime(t)` has to be a pure
 * function of `t` or the recorder cannot seek and nothing can be recorded.
 *
 * The pointer push there adds a force to a sphere and decays it five per cent
 * a frame, so where a sphere is depends on where the cursor has been. Here the
 * displacement is a function of where the cursor IS. The cluster opens the
 * same way and does not carry momentum back out of the opening.
 *
 * The collision pass there tests every pair and pushes overlaps apart, which
 * is both an accumulator and the square of the count. The layout it is
 * resolving overlaps in is hand-placed and does not have any.
 *
 * ONE DRAW CALL
 *
 * An InstancedMesh rather than a mesh each. Same geometry, same tessellation,
 * one draw call and one matrix per sphere instead of a hundred and one draw
 * calls.
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
  /** The spheres' own colour, before the light and the glow reach them. */
  body: string
  /** The glow every sphere carries regardless of the light. */
  glow: string
  /** The key light. */
  light: string
  /** How bright the key is. */
  keyStrength: number
  /** The flat light that reaches every surface whichever way it faces. */
  ambient: string
  /** How bright the flat light is. */
  ambientStrength: number
  /** How far the cluster is from the camera, in scene units. */
  distance: number
  /** Seconds the entrance takes, before the stagger. 0 starts it settled. */
  intro: number
  /** Seconds between one sphere setting off and the next. */
  stagger: number
  /** How far below the frame the spheres start. */
  drop: number
  /** How far the spheres overshoot on the way in. */
  overshoot: number
  /** How far each sphere drifts as it breathes. */
  breathe: number
  /** How fast it breathes, in radians a second. */
  breatheSpeed: number
  /** How far the pointer pushes a sphere aside. */
  part: number
  /** How wide the parting is, in scene units. */
  partRadius: number
}

export const sphereClusterDefaults: SphereClusterOptions = {
  /*
   * The scene's own values. The body is a dusty rose and the glow is pure red,
   * which is a strange pair written down and the reason the cluster reads warm
   * from every angle: the emissive is not lit, so it survives into the shadow
   * side where the diffuse has gone.
   */
  background: '#fbfaff',
  body: '#c7a5a5',
  glow: '#7a1414',
  light: '#ffffff',
  keyStrength: 0.52,
  ambient: '#ffffff',
  ambientStrength: 1,
  distance: 24,
  intro: 2.6,
  stagger: 0.02,
  drop: 25,
  overshoot: 4,
  breathe: 0.1,
  breatheSpeed: 2,
  part: 0.9,
  partRadius: 3,
  maxDpr: 2,
  /* Far enough in that the poster and a reduced-motion reader both get the
     settled cluster rather than a frame of it still arriving. */
  reducedMotionTime: 8
}

/*
 * The cluster, four numbers a sphere: x, y, z, radius.
 *
 * Hand-placed by the author of the scene this came from, and the reason it
 * reads as composed. A hash fills a volume evenly, which is a different and
 * worse thing: the big spheres here are placed where they hold the silhouette
 * together and the small ones fill between them. Credited in meta.json.
 */
const LAYOUT = [
  0, 0, 0, 1, 1.2, 0.9, -0.5, 0.6, 1.8, -0.3, 0, 0.8, -1, -1, 0, 0.4,
  -1, 1.62, 0, 0.9, -1.65, 0, -0.4, 0.7, -2.13, -1.54, -0.4, 0.9, 0.8, 0.94, 0.3, 0.3,
  0.5, -1, 1.2, 0.2, -0.16, -1.2, 0.9, 0.5, 1.5, 1.2, 0.8, 0.6, 0.5, -1.58, 1.4, 0.4,
  -1.5, 1, 1.15, 0.5, -1.5, -1.5, 0.99, 0.6, -1.5, -1.5, -1.9, 0.7, 1.85, 0.8, 0.05, 0.3,
  1.5, -1.2, -0.75, 0.4, 0.9, -1.62, 0.22, 0.8, 0.45, 2, 0.65, 0.7, 2.5, 1.22, -0.2, 0.5,
  2.35, 0.7, 0.55, 0.4, -1.8, -0.35, 0.85, 0.6, -1.02, 0.2, 0.9, 0.35, 0.2, 1, 1, 0.38,
  -2.88, 0.7, 1, 0.9, -2, -0.95, 1.5, 0.3, -2.3, 2.4, -0.1, 0.6, -2.5, 1.9, 1.2, 0.4,
  -1.8, 0.37, 1.2, 0.2, -2.4, 1.42, 0.05, 0.35, -2.72, -0.9, 1.1, 0.5, -1.8, -1.34, 1.67, 0.15,
  -1.6, 1.66, 0.91, 0.2, -2.8, 1.58, 1.69, 0.25, -2.97, 2.3, 0.65, 0.4, 1.1, -0.2, -1.45, 0.8,
  -4, 1.78, 0.38, 0.76, 0.12, 1.4, -1.29, 0.8, -1.64, 1.4, -1.79, 1, -3.5, -0.58, 0.1, 0.8,
  -0.1, -1, -2, 0.7, -4.5, 0.55, -0.5, 0.8, -3.87, 0, 1, 0.3, -4.6, -0.1, 0.65, 0.5,
  -3, 1.5, -0.7, 0.6, -0.5, 0.2, -1.5, 0.55, -1.3, -0.45, -1.5, 0.42, -3.35, 0.25, -1.5, 0.75,
  -4.76, -1.26, 0.4, 0.66, -4.32, 0.85, 1.4, 0.6, -3.5, -1.82, 0.9, 0.7, -3.6, -0.6, 1.46, 0.5,
  -4.55, -1.5, 1.63, 0.6, -3.8, -1.15, 2.1, 0.35, -2.9, -0.25, 1.86, 0.35, -2.2, -0.4, 1.86, 0.35,
  -5.1, -0.24, 1.86, 0.8, -5.27, 1.24, 0.76, 0.6, -5.27, 2, -0.4, 0.7, -6.4, 0.4, 1, 0.8,
  -5.15, 0.95, 2, 0.4, -6.2, 0.5, -0.8, 0.89, -4, 0.08, 1.8, 0.3, 2, -0.95, 1.5, 0.3,
  2.3, 2.4, -0.1, 0.6, 2.5, 1.9, 1.2, 0.4, 1.8, 0.37, 1.2, 0.2, 3.24, 0.6, 1.05, 0.52,
  2.72, -0.9, 1.1, 0.5, 1.8, -1.34, 1.67, 0.15, 1.6, 1.99, 0.91, 0.2, 2.8, 1.58, 1.69, 0.25,
  2.97, 2.3, 0.65, 0.4, -1.3, -0.2, -2.5, 0.8, 4, 1.78, 0.38, 0.76, 1.72, 1.4, -1.29, 0.8,
  2.5, -1.2, -2, 1, 3.5, -0.58, 0.1, 0.8, 0.1, 0.4, -2.42, 0.7, 4.5, 0.55, -0.5, 0.8,
  3.87, 0, 1, 0.3, 4.6, -0.1, 0.65, 0.5, 3, 1.5, -0.7, 0.6, 2.3, 0.6, -2.6, 0.8,
  4, 1.5, -1.6, 0.7, 3.35, 0.25, -1.5, 0.75, 4.76, -1.26, 0.4, 0.66, 4.32, 0.85, 1.4, 0.6,
  3.5, -1.82, 0.9, 0.7, 3.6, -0.6, 1.46, 0.5, 4.55, -1.5, 1.63, 0.6, 3.8, -1.15, 2.1, 0.35,
  2.9, -0.25, 1.86, 0.35, 2.2, -0.4, 1.86, 0.35, 5.1, -0.24, 1.86, 0.8, 5.27, 1.24, 0.76, 0.6,
  5.27, 2, -0.4, 0.7, 6.4, 0.4, 1, 0.8, 5.15, 0.95, 2, 0.4, 6.2, 0.5, -0.8, 0.89,
  4, 0.08, 1.8, 0.3
]

const COUNT = LAYOUT.length / 4

/* GSAP's power1.out, which is what the entrance was authored against. */
const easeOut = (k: number) => 1 - (1 - k) * (1 - k)

class SphereClusterSurface implements Surface<SphereClusterOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private mesh: THREE.InstancedMesh | null = null
  private material: THREE.MeshLambertMaterial | null = null
  private key: THREE.DirectionalLight | null = null
  private ambient: THREE.AmbientLight | null = null
  private under: THREE.DirectionalLight | null = null
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
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    /*
     * The colour pipeline the scene was lit against, not the current one.
     *
     * It was built on three r128, where colour management did not exist and
     * the renderer wrote linear values straight out. Modern three enables
     * management by default and converts to sRGB on the way out, so the same
     * material and the same light intensities come out darker and far more
     * saturated: a dusty rose under a red emissive renders as pale blush under
     * the old pipeline and as flat signal red under the new one. Matching the
     * look by re-picking the colours would mean inventing numbers; turning the
     * pipeline back to the one they were chosen for reproduces them.
     */
    THREE.ColorManagement.enabled = false

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 1000)
    camera.position.set(0, 0, 24)

    /*
     * Three lights, at the intensities the scene was lit with. The flat one is
     * at full strength and is most of what you see; the spot is half of that
     * and does the modelling. An ambient cannot make a shadow side a different
     * colour, which is why the warmth here comes from the material's emissive
     * instead.
     */
    const ambient = new THREE.AmbientLight(0xffffff, 1)
    scene.add(ambient)
    /*
     * A directional where the scene has a spot, at the same place and the same
     * intensity.
     *
     * A SpotLight's intensity is candela now and falls off with the square of
     * the distance; in r128 it was a plain multiplier. At forty units away
     * 0.52 candela is indistinguishable from no light at all, which left the
     * ambient as the only illumination and the cluster flat. A directional has
     * no falloff, so the number means what it meant when it was chosen.
     *
     * What it costs is the cone, and the cone was doing nothing: it is wider
     * than the cluster from that distance. What it buys is the reason the
     * cluster looks lit at all: ambient at 1 plus this at 0.52 plus the
     * underlight at 0.2 is more irradiance than the material can hold, so the
     * bright side clips to white and the rest stays pale. Those white
     * highlights are the clipping.
     */
    const key = new THREE.DirectionalLight(0xffffff, 0.52)
    key.position.set(14, 24, 30)
    key.castShadow = true
    scene.add(key)
    this.under = new THREE.DirectionalLight(0xffffff, 0.2)
    this.under.position.set(0, -4, 0)
    scene.add(this.under)

    /* Same tessellation as the scene it came from. Expensive per sphere and
       affordable once, because every instance shares it. */
    const geometry = new THREE.SphereGeometry(1, 64, 64)
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff })
    const mesh = new THREE.InstancedMesh(geometry, material, COUNT)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.castShadow = true
    mesh.receiveShadow = true
    /*
     * Never culled, which for one mesh that is the whole picture is free, and
     * without which this effect records blank.
     *
     * An InstancedMesh computes its bounding sphere once and keeps it. The
     * recorder captures frame zero first, and at t = 0 every sphere is still
     * at its drop height below the frame, so the bounds are computed down
     * there and cached. Every frame after that is culled against bounds the
     * cluster has long since left, and the take comes out as a hundred and
     * sixty-eight frames of empty background with no error anywhere.
     *
     * It does not reproduce by rendering a late frame on its own, which is how
     * it survived a frame grab, a headless run and a run with the recorder's
     * own clock stub: the bug needs the frames in order, which is exactly what
     * the recorder does and nothing else did.
     */
    mesh.frustumCulled = false
    scene.add(mesh)

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.mesh = mesh
    this.material = material
    this.key = key
    this.ambient = ambient
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
    const mesh = this.mesh
    if (!renderer || !scene || !camera || !mesh) return

    this.material?.color.set(opts.body)
    this.material?.emissive.set(opts.glow)
    this.key?.color.set(opts.light)
    if (this.key) this.key.intensity = opts.keyStrength
    this.ambient?.color.set(opts.ambient)
    if (this.ambient) this.ambient.intensity = opts.ambientStrength
    scene.background = new THREE.Color(opts.background)

    /* Pulled back on a narrow frame so the cluster still fits, which is what
       the scene does on resize and is worth keeping: at a phone's aspect the
       cluster otherwise runs off both sides. */
    camera.position.setLength(Math.max(opts.distance, (opts.distance + 4) / camera.aspect))

    const reachY = Math.tan((camera.fov * Math.PI) / 360) * camera.position.length()
    const pointerX = pointer.active ? (pointer.x - 0.5) * 2 * reachY * camera.aspect : 0
    const pointerY = pointer.active ? -(pointer.y - 0.5) * 2 * reachY : 0
    const parting = pointer.active ? opts.part : 0
    const radius = Math.max(opts.partRadius, 0.001)

    const half = Math.max(opts.intro, 0) / 2.6
    const riseFor = half * 1
    const fallFor = half * 1
    const homeFor = half * 0.6

    for (let i = 0; i < COUNT; i++) {
      const ox = LAYOUT[i * 4]!
      const oy = LAYOUT[i * 4 + 1]!
      const oz = LAYOUT[i * 4 + 2]!
      const r = LAYOUT[i * 4 + 3]!

      let x = ox
      let y = oy
      let z = oz

      /*
       * The entrance, as a closed form rather than a timeline.
       *
       * Three stages, staggered per sphere: up from below the frame, past the
       * resting height and back down, then eased home. The z bulge is a half
       * sine over each of the first two stages, out on the way up and back on
       * the way down, so it returns to the resting z exactly.
       *
       * A timeline would have been easier to write and could not be seeked.
       * Every one of these is a function of t, so the recorder can ask for the
       * frames in any order and two runs are identical.
       */
      const local = t - i * Math.max(opts.stagger, 0)
      const settled = riseFor + fallFor + homeFor

      if (opts.intro > 0 && local < settled) {
        if (local <= 0) {
          y = -opts.drop
        } else if (local < riseFor) {
          const p = easeOut(local / riseFor)
          y = -opts.drop + (opts.overshoot + opts.drop) * p
          z = oz + Math.sin(p * Math.PI) * opts.overshoot
        } else if (local < riseFor + fallFor) {
          const p = easeOut((local - riseFor) / fallFor)
          y = opts.overshoot + (-opts.drop / 5 - opts.overshoot) * p
          z = oz - Math.sin(p * Math.PI) * opts.overshoot
        } else {
          const p = easeOut((local - riseFor - fallFor) / homeFor)
          y = -opts.drop / 5 + (oy + opts.drop / 5) * p
        }
      } else {
        /*
         * Breathing: a sine in y against a cosine in z at half the amplitude,
         * a fifth of a radian apart per sphere, which is what makes the
         * cluster shimmer rather than pulse as one body.
         */
        const phase = t * opts.breatheSpeed + i * 0.2
        y = oy + Math.sin(phase) * opts.breathe
        z = oz + Math.cos(phase) * opts.breathe * 0.5
      }

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

      this.place.set(x, y, z)
      this.matrix.makeScale(r, r, r)
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
  }
}

/**
 * Mount SphereCluster into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const cluster = createSphereCluster(document.querySelector('#hero')!)
 * cluster.start()
 * // …later
 * cluster.destroy()
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
| `background` | color | `#fbfaff` | any CSS hex | Behind the cluster. The near-white the hero sits on in the page this came from; the spheres are a pale blush and need a light ground to be pale against. |
| `body` | color | `#c7a5a5` | any CSS hex | The spheres' own colour, before the light and the glow reach them. A dusty rose, which with a pure red glow over it is what gives the cluster its colour from every angle. |
| `glow` | color | `#7a1414` | any CSS hex | The glow every sphere carries regardless of the light. This is the emissive, and it is doing more for the colour than the body is: an emissive is not lit, so it survives into the shadow side where the diffuse has gone, which is why the cluster reads warm all over rather than warm on one side. The scene this came from sets it to pure red. On r128's colour pipeline that renders as a blush; on a current one it saturates the red channel completely, which stops the bright side clipping to white and leaves every sphere a flat coral. A darker red puts the highlights back. |
| `light` | color | `#ffffff` | any CSS hex | The key light, which does the modelling. |
| `keyStrength` | number | `0.52` | 0 to 3 (looks right between 0.3 and 1) | How bright the key is. Half the flat light, which is the balance the scene was lit at: the flat light is most of what you see and the key only has to say where the form is. |
| `ambient` | color | `#ffffff` | any CSS hex | The flat light that reaches every surface whichever way it faces. |
| `ambientStrength` | number | `1` | 0 to 3 (looks right between 0.6 and 1.4) | How bright the flat light is. At full strength, as the scene has it, which is why the cluster is evenly lit and the shapes are carried by the silhouette rather than by shading. |
| `distance` | number | `24` | 8 to 60 (looks right between 18 and 34) | How far the camera sits from the cluster, in scene units. It is pulled back further on a narrow frame so the cluster still fits, which matters on a phone: at that aspect it otherwise runs off both sides. |
| `intro` | number | `2.6` | 0 to 8 (looks right between 2 and 4) | Seconds the entrance takes for one sphere, before the stagger. At 0 the cluster starts settled, which is what a backdrop behind a page that is already open wants. |
| `stagger` | number | `0.02` | 0 to 0.2 (looks right between 0.01 and 0.04) | Seconds between one sphere setting off and the next. The whole entrance therefore lasts the intro plus a hundred of these, so at the default it is finished a little after four and a half seconds. |
| `drop` | number | `25` | 2 to 60 | How far below the frame the spheres start, in scene units. Far enough that none of them is in shot before it sets off. |
| `overshoot` | number | `4` | 0 to 12 | How far past its resting place each sphere flies before falling back, and how far it bulges towards the camera on the way. The bulge is a half sine over each stage, so it returns to the resting depth exactly. |
| `breathe` | number | `0.1` | 0 to 1 (looks right between 0.05 and 0.25) | How far each sphere drifts once settled: a sine in height against a cosine in depth at half the amplitude. At 0 the settled cluster is still. |
| `breatheSpeed` | number | `2` | 0.1 to 8 (looks right between 1 and 3) | How fast it breathes, in radians a second. Each sphere is a fifth of a radian behind the one before it, which is what makes the cluster shimmer rather than pulse as one body. |
| `part` | number | `0.9` | 0 to 4 | How far the pointer pushes a sphere aside. Instantaneous rather than a force that decays: a decaying force is an accumulator, so where a sphere sits would depend on where the cursor had been, and renderAtTime could no longer be seeked. The cluster opens the same way and does not carry momentum back out of the opening, which is what that costs. |
| `partRadius` | number | `3` | 0.5 to 10 | How wide the parting is, in scene units. |

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

Concept credit: The whole scene: the hundred and one hand-placed sphere positions and radii, the dusty rose body under a red emissive, the three light intensities, the twenty-five degree camera, and the staggered three-stage entrance. The arrangement is placed rather than generated and that is most of why it reads as composed, so it is carried across as his rather than replaced with a hash. What could not come across is the physics: its pointer force decays frame to frame and its collision pass tests every pair, and both are accumulators that would stop renderAtTime being seekable., by Ray Velez, https://github.com/RayVelez27/instalanding.ai.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
