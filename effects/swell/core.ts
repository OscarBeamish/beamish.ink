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
