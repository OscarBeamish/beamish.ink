/*
 * ChromeForm: Beamish
 * https://beamish.ink/effects/chrome-form
 *
 * A turned metal form, rotating, with a studio built for it to reflect.
 *
 * A mirror has no colour and no shading of its own. Everything you see on a
 * chrome object is somewhere else in the room, which is why chrome rendered in
 * an empty scene looks like grey plastic: there is nothing to be a reflection
 * of. So most of this file is not the object. It is the room.
 *
 * The room is painted into a canvas and handed to three as an equirectangular
 * environment: a dark surround, a brighter floor, and two or three soft strip
 * lights laid across it, which is what a photographer would actually put round
 * something shiny. The strips are the point. A gradient alone gives a smooth
 * tonal wash that still reads as plastic, and what says metal is a hard edge
 * between light and dark sliding across a curve.
 *
 * It is run through three's PMREM generator rather than used raw, because the
 * roughness control has to mean something: prefiltering is what lets a rough
 * surface sample a blurred version of the room and a polished one sample the
 * sharp version. Without it, roughness only darkens.
 *
 * The shape is a lathe rather than a torus knot. A knot is what every WebGL
 * demo reaches for and it says nothing about this library; a profile revolved
 * about an axis is how a metal object of this kind is actually made, it gives
 * the long uninterrupted curves that show a reflection off best, and the
 * profile is three numbers rather than a model file.
 *
 * Rotation is a whole number of turns per period, so the loop closes exactly,
 * and the angle is computed from `t` rather than accumulated. The recorder
 * asks for frame 90 directly and expects the same pixels every time.
 */

import * as THREE from 'three'
import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type ChromeFormOptions = BaseOptions & {
  /** The page behind the object. Nothing reflects it; it is just the fill. */
  background: string
  /** Tint on the metal. Near white is chrome; warm it for brass, cool it for steel. */
  tint: string
  /** The strip lights, and so the bright parts of every reflection. */
  studio: string
  /**
   * How polished. At 0 it is a mirror and the room is sharp in it; by about
   * 0.4 the strips have softened into a sheen and it reads as brushed.
   */
  roughness: number
  /** How many strip lights are laid round the room. */
  lamps: number
  /** Height of the form, in scene units. */
  height: number
  /** Radius at the widest point. */
  girth: number
  /** How far the waist pulls in, as a share of `girth`. 0 is a plain barrel. */
  waist: number
  /** Degrees the axis is tipped towards the camera. */
  tilt: number
  /** Seconds for one full turn. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const chromeFormDefaults: ChromeFormOptions = {
  background: '#0c0d10',
  tint: '#eef1f4',
  studio: '#fff6e8',
  roughness: 0.13,
  lamps: 3,
  height: 2.6,
  girth: 0.78,
  waist: 0.42,
  tilt: 14,
  period: 36,
  reducedMotionTime: 9
}

const TAU = Math.PI * 2
const DEG = Math.PI / 180

/*
 * The room, painted.
 *
 * Equirectangular, so x is the way round and y is up and down. A dark surround
 * with a brighter floor gives the object a horizon to sit against, and the
 * strips are what make it read as metal: a mirror shows edges, and a room with
 * no edges in it produces a smooth wash that looks like plastic however shiny
 * the material claims to be.
 */
function paintStudio(studio: string, lamps: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ChromeForm: could not paint the environment')

  /* Sky to floor. The step at the horizon is deliberate and shows as the line
     that runs round the waist of anything reflective standing in it. */
  const wall = ctx.createLinearGradient(0, 0, 0, canvas.height)
  wall.addColorStop(0, '#5a6372')
  wall.addColorStop(0.44, '#8d97a8')
  wall.addColorStop(0.5, '#c3ccd8')
  wall.addColorStop(0.56, '#3d434f')
  wall.addColorStop(1, '#171a20')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  /*
   * Soft strips, spaced unevenly.
   *
   * Evenly spaced lamps put evenly spaced highlights round the object, and
   * evenly spaced highlights read as a pattern printed on it rather than as a
   * room it is standing in. These are placed on an irrational step for the
   * same reason the wave directions elsewhere in this library are.
   */
  const count = Math.max(1, Math.min(6, Math.round(lamps)))
  for (let i = 0; i < count; i += 1) {
    const x = ((0.12 + i * 0.381966) % 1) * canvas.width
    const w = canvas.width * (0.055 + 0.03 * ((i * 7) % 3) / 3)
    const top = canvas.height * (0.06 + 0.1 * ((i * 5) % 3) / 3)
    const h = canvas.height * (0.3 + 0.12 * ((i * 3) % 2))

    const glow = ctx.createLinearGradient(x - w, 0, x + w, 0)
    glow.addColorStop(0, 'rgba(0,0,0,0)')
    glow.addColorStop(0.5, studio)
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.globalAlpha = 0.9
    ctx.fillRect(x - w, top, w * 2, h)
  }
  ctx.globalAlpha = 1

  return canvas
}

/*
 * The profile that gets revolved.
 *
 * A cosine waist on a capped column: the ends round over so there is no hard
 * rim to catch the light wrongly, and the middle pulls in by `waist`. Three
 * numbers rather than a model, and every one of them is something you would
 * say out loud about the object.
 */
function profile(height: number, girth: number, waist: number): THREE.Vector2[] {
  const steps = 96
  const points: THREE.Vector2[] = []
  for (let i = 0; i <= steps; i += 1) {
    const v = i / steps
    /* Rounds the two ends so the silhouette closes. */
    const cap = Math.sin(Math.PI * v) ** 0.33
    /* Minimum in the middle. Written the other way round first, which put the
       pinch at both ends and the bulge in the centre: a diamond, not a
       spindle. */
    const pinch = 1 - waist * (0.5 - 0.5 * Math.cos(TAU * v))
    points.push(new THREE.Vector2(Math.max(girth * cap * pinch, 0.0005), (v - 0.5) * height))
  }
  return points
}

class ChromeFormSurface implements Surface<ChromeFormOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private form: THREE.Mesh | null = null
  private material: THREE.MeshStandardMaterial | null = null
  private environment: THREE.Texture | null = null
  private background = new THREE.Color()

  /* What the geometry was last built for, so it is rebuilt only when it has to
     be. A lathe of a hundred segments is cheap to make and not free, and
     update() can be called on every frame by a React render. */
  private builtFor = { height: 0, girth: 0, waist: 0 }
  private paintedFor = { studio: '', lamps: 0 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('ChromeForm needs a canvas')

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
    /*
     * ACES rather than none, which is unusual in this library and is here
     * because a mirror is the one thing that genuinely produces values above
     * one. A strip light seen square on is brighter than white, and clipping
     * it gives a flat white shape with a hard edge where the roll-off should
     * be, which is the look of a render rather than of metal.
     */
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100)
    camera.position.set(0, 0, 6.3)

    const material = new THREE.MeshStandardMaterial({
      metalness: 1,
      roughness: chromeFormDefaults.roughness,
      color: new THREE.Color(chromeFormDefaults.tint)
    })

    const form = new THREE.Mesh(new THREE.LatheGeometry(profile(2.6, 0.78, 0.42), 128), material)
    scene.add(form)

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.material = material
    this.form = form
    this.builtFor = { height: 2.6, girth: 0.78, waist: 0.42 }
    this.paintedFor = { studio: '', lamps: 0 }
  }

  /* Repainted only when the room has actually changed. PMREM is the expensive
     thing in this file and it has no business running once a frame. */
  private ensureStudio(opts: ChromeFormOptions): void {
    const renderer = this.renderer
    const scene = this.scene
    if (!renderer || !scene) return
    if (this.paintedFor.studio === opts.studio && this.paintedFor.lamps === opts.lamps) return

    const texture = new THREE.CanvasTexture(paintStudio(opts.studio, opts.lamps))
    texture.mapping = THREE.EquirectangularReflectionMapping
    texture.colorSpace = THREE.SRGBColorSpace

    /*
     * Prefiltered, so roughness means something. A raw environment map is
     * sampled at one level however rough the surface claims to be, which makes
     * the roughness control do nothing but darken. PMREM builds the blurred
     * levels a rough surface needs.
     */
    const pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()
    const prefiltered = pmrem.fromEquirectangular(texture).texture
    pmrem.dispose()
    texture.dispose()

    this.environment?.dispose()
    this.environment = prefiltered
    scene.environment = prefiltered
    this.paintedFor = { studio: opts.studio, lamps: opts.lamps }
  }

  private ensureGeometry(opts: ChromeFormOptions): void {
    const form = this.form
    if (!form) return
    const { height, girth, waist } = opts
    if (
      this.builtFor.height === height &&
      this.builtFor.girth === girth &&
      this.builtFor.waist === waist
    ) {
      return
    }
    form.geometry.dispose()
    form.geometry = new THREE.LatheGeometry(profile(height, girth, waist), 128)
    this.builtFor = { height, girth, waist }
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    const { renderer, camera } = this
    if (!renderer || !camera) return
    renderer.setSize(size.pixelWidth, size.pixelHeight, false)
    camera.aspect = size.pixelWidth / Math.max(size.pixelHeight, 1)
    camera.updateProjectionMatrix()
  }

  render(t: number, opts: ChromeFormOptions): void {
    const { renderer, scene, camera, form, material } = this
    if (!renderer || !scene || !camera || !form || !material) return

    this.ensureStudio(opts)
    this.ensureGeometry(opts)

    this.background.set(opts.background)
    scene.background = this.background

    material.roughness = opts.roughness
    material.color.set(opts.tint)

    /*
     * One whole turn per period, computed from t rather than accumulated. A
     * fractional turn count here is a jump once a cycle in the recorded video,
     * and accumulating would make renderAtTime depend on how it was reached.
     */
    form.rotation.y = TAU * (t / Math.max(opts.period, 0.001))
    form.rotation.z = opts.tilt * DEG

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return (this.renderer?.getContext() as WebGL2RenderingContext | undefined) ?? null
  }

  teardown(): void {
    if (this.form) {
      this.form.geometry.dispose()
      this.form = null
    }
    this.material?.dispose()
    this.environment?.dispose()
    this.scene?.clear()
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.material = null
    this.environment = null
  }
}

/**
 * Mount ChromeForm into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const form = createChromeForm(document.querySelector('#hero')!)
 * form.start()
 * // …later
 * form.destroy()
 * ```
 */
export function createChromeForm(
  el: HTMLElement,
  opts: Partial<ChromeFormOptions> = {}
): EffectHandle {
  return mount<ChromeFormOptions>(el, opts, {
    defaults: chromeFormDefaults,
    create: () => new ChromeFormSurface()
  })
}

export default createChromeForm
