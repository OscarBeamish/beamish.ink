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
