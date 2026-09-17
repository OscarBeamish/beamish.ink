/*
 * Vellum: Beamish
 * https://beamish.ink/effects/vellum
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

export type VellumOptions = BaseOptions & {
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
export const vellumDefaults: VellumOptions = {
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

class VellumSurface implements Surface<VellumOptions> {
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
      u_ink: { value: new THREE.Color(vellumDefaults.ink) },
      u_accent: { value: new THREE.Color(vellumDefaults.accent) },
      u_light: { value: new THREE.Vector3(0, 1, 0) },
      u_density: { value: vellumDefaults.density },
      u_radius: { value: vellumDefaults.radius },
      u_sheen: { value: vellumDefaults.sheen },
      u_fibre: { value: vellumDefaults.fibre }
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

  render(t: number, opts: VellumOptions): void {
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
 * const vellum = createVellum(document.querySelector('#hero')!)
 * vellum.start()
 * // …later
 * vellum.destroy()
 * ```
 */
export function createVellum(el: HTMLElement, opts: Partial<VellumOptions> = {}): EffectHandle {
  return mount<VellumOptions>(el, opts, {
    defaults: vellumDefaults,
    create: () => new VellumSurface()
  })
}

export default createVellum
