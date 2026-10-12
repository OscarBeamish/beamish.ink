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
  part: 2.2,
  partRadius: 4.5,
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

    /*
     * Which single sphere the cursor is nearest, found before anything is
     * placed.
     *
     * Only one sphere moves, which is the whole difference between this
     * reading as a swarm being disturbed and reading as a bite taken out of
     * it. Two earlier versions displaced every sphere within a radius: the
     * first pushed them straight out and drew a clean circular void, and the
     * second pushed them mostly towards the camera and still drew one,
     * because a dense cluster has no slack and moving any group of them
     * reveals the background behind. The scene this came from never had that
     * problem because it raycasts: one sphere is hit and one sphere moves.
     *
     * This is the same answer without the raycast. The resting positions are
     * known, the cursor is already on the z = 0 plane, so the nearest sphere
     * is a loop over a hundred and one distances and no intersection maths.
     */
    let poked = -1
    if (parting > 0) {
      let nearest = radius
      for (let i = 0; i < COUNT; i++) {
        const dx = LAYOUT[i * 4]! - pointerX
        const dy = LAYOUT[i * 4 + 1]! - pointerY
        const away = Math.hypot(dx, dy)
        /* Biased towards the big ones, which are the ones a cursor over this
           cluster is visually on top of. */
        const reach = away - LAYOUT[i * 4 + 3]!
        if (reach < nearest) {
          nearest = reach
          poked = i
        }
      }
    }

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

      /*
       * The swarm swells towards you rather than opening a hole.
       *
       * The first version pushed every sphere within the radius straight out
       * from the cursor, and what that draws is a clean circular void: a bite
       * taken out of the cluster, with a hard rim where the falloff ends. It
       * tracked the cursor correctly and still read as wrong, because a
       * cluster of spheres has no reason to evacuate a disc.
       *
       * So most of the displacement is towards the camera and only a little of
       * it is sideways. Coming forward makes a sphere larger on screen and
       * moves it in front of its neighbours, which reads as the swarm noticing
       * the cursor; going sideways only makes a gap. The falloff is a
       * smoothstep rather than a square, so there is no rim at the edge of the
       * radius where the displacement stops.
       */
      /*
       * The poke. Towards the camera and a little away from the cursor, which
       * lifts this one sphere clear of its neighbours instead of shouldering
       * them aside.
       */
      if (i === poked) {
        const dx = x - pointerX
        const dy = y - pointerY
        const inv = 1 / Math.max(Math.hypot(dx, dy), 0.0001)
        x += dx * inv * parting * 0.3
        y += dy * inv * parting * 0.3
        z += parting
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
