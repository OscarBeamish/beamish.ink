/*
 * Sundial: Beamish
 * https://beamish.ink/effects/sundial
 *
 * A still life of matte forms standing on paper, lit by one sun that travels a
 * full circuit over the loop. The subject is the shadows, not the objects: they
 * lengthen, sweep and cross each other, and come back exactly where they began.
 *
 * A real three.js scene: perspective camera, meshes, materials, a shadow map,
 * rather than a full-bleed shader pretending to be one.
 */

import * as THREE from 'three'
import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type SundialOptions = BaseOptions & {
  /** The paper the forms stand on. Match it to your page background. */
  paper: string
  /** The forms themselves. Slightly lighter than the paper reads as objects on it. */
  stone: string
  /** One form carries colour. Set it to your own brand colour. */
  accent: string
  /** Sun height above the horizon, degrees. Low means long shadows. */
  elevation: number
  /** Shadow edge softness, 0 to 1. */
  softness: number
  /** How dark the shadows fall on the paper, 0 to 1. */
  shadow: number
  /** How much of the frame the group fills, 0 to 1. */
  zoom: number
  /** Camera height, 0 is eye level with the paper, 1 is looking straight down. */
  tilt: number
  /** Seconds for one full circuit of the sun. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const sundialDefaults: SundialOptions = {
  paper: '#fbfaf4',
  stone: '#f5f2e9',
  accent: '#c44400',
  elevation: 30,
  softness: 0.68,
  shadow: 0.3,
  zoom: 0.66,
  tilt: 0.52,
  period: 5,
  reducedMotionTime: 1.1
}

/*
 * The arrangement is written down rather than generated. A seeded random layout
 * gives you a different mediocre composition every time; this one was placed by
 * hand until it read as a still life from every azimuth the sun visits.
 *
 * x/z are on the paper, h is height, r is footprint radius.
 */
type Form = {
  kind: 'cylinder' | 'box' | 'cone' | 'torus' | 'sphere'
  x: number
  z: number
  h: number
  r: number
  spin: number
  /** Multiplier on the stone colour. A still life is never one flat tone. */
  tone: number
  accent?: boolean
}

const FORMS: Form[] = [
  { kind: 'cylinder', x: -0.95, z: -0.15, h: 1.55, r: 0.2, spin: 0, tone: 1 },
  { kind: 'box', x: -0.15, z: 0.62, h: 0.95, r: 0.34, spin: 0.35, tone: 0.965 },
  { kind: 'cone', x: 0.78, z: -0.55, h: 1.32, r: 0.4, spin: 0, tone: 1.01 },
  { kind: 'sphere', x: -0.72, z: 1.28, h: 0.72, r: 0.36, spin: 0, tone: 1, accent: true },
  { kind: 'torus', x: 1.4, z: 0.5, h: 0.98, r: 0.36, spin: -0.6, tone: 0.98 },
  { kind: 'cylinder', x: -1.62, z: 0.82, h: 0.7, r: 0.28, spin: 0, tone: 1.02 },
  { kind: 'box', x: 1.05, z: 1.3, h: 0.42, r: 0.23, spin: 0.9, tone: 0.95 }
]

const TAU = Math.PI * 2
const DEG = Math.PI / 180

function geometryFor(form: Form): THREE.BufferGeometry {
  switch (form.kind) {
    case 'cylinder':
      return new THREE.CylinderGeometry(form.r, form.r, form.h, 48)
    case 'box':
      return new THREE.BoxGeometry(form.r * 2, form.h, form.r * 2)
    case 'cone':
      return new THREE.ConeGeometry(form.r, form.h, 48)
    case 'sphere':
      return new THREE.SphereGeometry(form.h / 2, 48, 32)
    case 'torus':
      return new THREE.TorusGeometry(form.h / 2 - form.r / 2, form.r / 2, 24, 72)
  }
}

class SundialSurface implements Surface<SundialOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private sun: THREE.DirectionalLight | null = null
  private bounce: THREE.DirectionalLight | null = null
  private fill: THREE.HemisphereLight | null = null
  private ground: THREE.Mesh | null = null
  private meshes: THREE.Mesh[] = []
  private aspect = 1

  setup(ctx: { canvas: HTMLCanvasElement }): void {
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
    // No tone mapping on purpose: filmic curves pull white paper towards grey,
    // and paper staying paper is the whole premise.
    renderer.toneMapping = THREE.NoToneMapping
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const scene = new THREE.Scene()

    const camera = new THREE.PerspectiveCamera(26, 1, 0.5, 60)

    // Sky/ground hemisphere rather than a flat ambient: it puts a faint bounce
    // from the paper onto the undersides, which is what stops the forms looking
    // pasted on.
    const fill = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.05)

    // A dim second light directly opposite the sun, standing in for bounce off
    // the paper. Without it the shaded sides go dead and the forms read as
    // cut-outs; with it they read as objects in a room.
    const bounce = new THREE.DirectionalLight(0xffffff, 0.42)

    const sun = new THREE.DirectionalLight(0xfff6e8, 2.5)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const extent = 5
    const shadowCamera = sun.shadow.camera as THREE.OrthographicCamera
    shadowCamera.left = -extent
    shadowCamera.right = extent
    shadowCamera.top = extent
    shadowCamera.bottom = -extent
    shadowCamera.near = 0.5
    shadowCamera.far = 26
    // Normal bias rather than a constant bias: the ground is a single large
    // plane and a constant bias detaches contact shadows from their objects.
    sun.shadow.normalBias = 0.02
    sun.shadow.bias = -0.0004
    scene.add(sun)
    scene.add(sun.target)
    scene.add(bounce)
    scene.add(fill)

    /*
     * The ground is a ShadowMaterial, not a lit surface. A lit plane picks up the
     * sun at a grazing angle and comes out somewhere around 85% of its own
     * colour, a warm grey, not paper. This way the paper is exactly the colour
     * asked for and the shadow is the only thing drawn on it, which is both more
     * accurate and far easier to art-direct.
     */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShadowMaterial({ opacity: 0.26, color: 0x3a3026 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    const meshes: THREE.Mesh[] = []
    for (const form of FORMS) {
      const mesh = new THREE.Mesh(
        geometryFor(form),
        new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 })
      )
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.position.set(form.x, form.kind === 'sphere' ? form.h / 2 : form.h / 2, form.z)
      if (form.kind === 'torus') mesh.position.y = form.h / 2
      mesh.rotation.y = form.spin
      mesh.userData['form'] = form
      scene.add(mesh)
      meshes.push(mesh)
    }

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.sun = sun
    this.bounce = bounce
    this.fill = fill
    this.ground = ground
    this.meshes = meshes
  }

  resize(size: { pixelWidth: number; pixelHeight: number }): void {
    this.aspect = size.pixelWidth / size.pixelHeight
    this.renderer?.setSize(size.pixelWidth, size.pixelHeight, false)
    if (this.camera) {
      this.camera.aspect = this.aspect
      this.camera.updateProjectionMatrix()
    }
  }

  render(t: number, opts: SundialOptions): void {
    const { renderer, scene, camera, sun, ground } = this
    if (!renderer || !scene || !camera || !sun || !ground) return

    scene.background = new THREE.Color(opts.paper)
    ;(ground.material as THREE.ShadowMaterial).opacity = opts.shadow

    for (const mesh of this.meshes) {
      const form = mesh.userData['form'] as Form
      const material = mesh.material as THREE.MeshStandardMaterial
      material.color.set(form.accent ? opts.accent : opts.stone)
      if (!form.accent) material.color.multiplyScalar(form.tone)
    }

    // The sun makes one complete circuit per period, so the last frame of a loop
    // is the frame before the first and there is no seam to hide.
    const azimuth = TAU * (t / Math.max(opts.period, 0.001))
    const elevation = opts.elevation * DEG
    const distance = 12
    sun.position.set(
      Math.cos(azimuth) * distance * Math.cos(elevation),
      distance * Math.sin(elevation),
      Math.sin(azimuth) * distance * Math.cos(elevation)
    )
    sun.target.position.set(0, 0.4, 0)
    sun.target.updateMatrixWorld()
    sun.shadow.radius = 1 + opts.softness * 7
    this.bounce?.position.set(-sun.position.x, distance * 0.45, -sun.position.z)

    /*
     * Frame the group rather than the viewport. Portrait and landscape need very
     * different camera distances for the same composition, and a single fixed
     * position gives you a good 16:9 and a useless 9:16.
     */
    const reach = 4.6 / Math.max(opts.zoom, 0.05)
    const widthFit = this.aspect < 1 ? reach / Math.max(this.aspect, 0.35) : reach
    const height = 0.5 + opts.tilt * 9
    camera.position.set(0, height, widthFit)
    camera.lookAt(0, 0.3, 0)

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return (this.renderer?.getContext() as WebGL2RenderingContext | undefined) ?? null
  }

  teardown(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    this.meshes = []
    if (this.ground) {
      this.ground.geometry.dispose()
      ;(this.ground.material as THREE.Material).dispose()
      this.ground = null
    }
    this.sun?.shadow.map?.dispose()
    this.sun?.dispose()
    this.bounce?.dispose()
    this.fill?.dispose()
    this.scene?.clear()
    // Frees three's own GPU objects. The runtime then hands the context itself
    // back to the browser, which is the part that matters for the context budget.
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.sun = null
    this.fill = null
  }
}

/**
 * Mount Sundial into `el`. The element needs a size. Give it width and height
 * in CSS, not just content.
 *
 * ```ts
 * const sundial = createSundial(document.querySelector('#hero')!)
 * sundial.start()
 * // …later
 * sundial.destroy()
 * ```
 */
export function createSundial(el: HTMLElement, opts: Partial<SundialOptions> = {}): EffectHandle {
  return mount<SundialOptions>(el, opts, {
    defaults: sundialDefaults,
    create: () => new SundialSurface()
  })
}

export default createSundial
