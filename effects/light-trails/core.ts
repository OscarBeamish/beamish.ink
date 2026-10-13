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
