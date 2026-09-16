/*
 * Contour: Beamish
 * https://beamish.ink/effects/contour
 *
 * A topographic relief on paper. Matte white land, one low sun, and contour
 * lines printed on the surface at fixed height intervals.
 *
 * The displacement happens in the vertex shader, not in JavaScript, so the
 * geometry is uploaded once and a 160×160 grid costs nothing per frame. The
 * catch is that three's shadow pass uses a different material, which knows
 * nothing about the displacement, so the shadows would detach from the land and
 * lie flat. The same code is therefore injected into a custom depth material as
 * well. That is the part most terrain demos get wrong.
 *
 * The land morphs along a closed orbit through noise space, the same trick
 * Overprint uses, so the loop returns to its start exactly.
 *
 * Concept credit: Ridgeline, Codrops, July 2026. Written from scratch.
 */

import * as THREE from 'three'
import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type ContourOptions = BaseOptions & {
  /** The paper behind the land, and the land's own colour at full light. */
  paper: string
  /** The land. Slightly off the paper so the horizon is readable. */
  land: string
  /** The contour lines. */
  ink: string
  /** Every fifth line is an index contour, drawn in this. */
  indexInk: string
  /** Height of the relief. */
  relief: number
  /** Size of the landforms. Lower is broader country. */
  scale: number
  /** Contour lines per unit of height. More lines is a steeper-looking map. */
  density: number
  /** Weight of the lines, 0 to 1. */
  weight: number
  /** Sun height above the horizon, degrees. Low rakes the ridges. */
  elevation: number
  /** Sun direction around the compass, degrees. */
  azimuth: number
  /** Camera height. 0 is on the deck, 1 looks straight down. */
  tilt: number
  /** How much of the frame the land fills. */
  zoom: number
  /** Seconds for one loop of the morph. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const contourDefaults: ContourOptions = {
  paper: '#fbfaf4',
  land: '#f4f1e7',
  ink: '#6f665a',
  indexInk: '#c44400',
  relief: 1.9,
  scale: 0.3,
  density: 1.7,
  weight: 0.72,
  elevation: 26,
  azimuth: 38,
  tilt: 0.5,
  zoom: 0.55,
  period: 6,
  reducedMotionTime: 3
}

const TAU = Math.PI * 2
const DEG = Math.PI / 180

/*
 * Shared by the surface material and the depth material. Both have to agree to
 * the last decimal or the shadows drift away from the land they belong to.
 */
const TERRAIN_GLSL = /* glsl */ `
uniform float u_relief;
uniform float u_scale;
uniform vec2  u_orbit;

vec2 c_hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}

float c_gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = dot(c_hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(c_hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(c_hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(c_hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/*
 * Ridged fbm. Taking the absolute value and inverting each octave turns rolling
 * hills into ridges and valleys, which is what makes contour lines worth
 * drawing: smooth noise gives you concentric blobs.
 */
float c_terrain(vec2 p) {
  p = p * u_scale + u_orbit;
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    float n = 1.0 - abs(c_gnoise(p));
    sum += amp * n * n;
    p *= 2.07;
    amp *= 0.5;
  }
  return (sum - 0.55) * u_relief;
}
`

class ContourSurface implements Surface<ContourOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private sun: THREE.DirectionalLight | null = null
  private fill: THREE.HemisphereLight | null = null
  private land: THREE.Mesh | null = null
  private uniforms: Record<string, THREE.IUniform> = {}
  private paper = new THREE.Color()
  private aspect = 1

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('Contour needs a canvas')

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
    renderer.shadowMap.enabled = true
    // PCF, not PCFSoft: shadow.radius is only read by the PCF branch.
    renderer.shadowMap.type = THREE.PCFShadowMap

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200)

    const fill = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.0)
    const sun = new THREE.DirectionalLight(0xfff4e4, 2.6)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const extent = 13
    const shadowCamera = sun.shadow.camera as THREE.OrthographicCamera
    shadowCamera.left = -extent
    shadowCamera.right = extent
    shadowCamera.top = extent
    shadowCamera.bottom = -extent
    shadowCamera.near = 0.5
    shadowCamera.far = 70
    sun.shadow.radius = 3
    sun.shadow.normalBias = 0.04
    sun.shadow.bias = -0.0006
    scene.add(sun, sun.target, fill)

    // One shared uniform object, so the surface and the depth pass cannot drift.
    this.uniforms = {
      u_relief: { value: contourDefaults.relief },
      u_scale: { value: contourDefaults.scale },
      u_orbit: { value: new THREE.Vector2() },
      u_land: { value: new THREE.Color(contourDefaults.land) },
      u_ink: { value: new THREE.Color(contourDefaults.ink) },
      u_indexInk: { value: new THREE.Color(contourDefaults.indexInk) },
      u_density: { value: contourDefaults.density },
      u_weight: { value: contourDefaults.weight }
    }

    /*
     * A 160 square grid is 25,600 vertices and one upload. The displacement is
     * per-vertex on the GPU, so the resolution costs memory rather than frame
     * time, which is the trade worth making here.
     */
    const geometry = new THREE.PlaneGeometry(24, 24, 160, 160)
    // Baked flat rather than rotated on the mesh, so the shader can displace
    // straight up in y instead of reasoning about the object's rotation.
    geometry.rotateX(-Math.PI / 2)

    const material = new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0 })
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = `varying float v_height;\n${TERRAIN_GLSL}\n${shader.vertexShader}`
        .replace(
          '#include <beginnormal_vertex>',
          `
          float h = c_terrain(position.xz);
          v_height = h;
          // Normals from finite differences on the same function. Deriving them
          // from the displaced geometry would need a second pass; this is exact
          // and costs two extra noise samples.
          float e = 0.06;
          float hx = c_terrain(position.xz + vec2(e, 0.0)) - c_terrain(position.xz - vec2(e, 0.0));
          float hz = c_terrain(position.xz + vec2(0.0, e)) - c_terrain(position.xz - vec2(0.0, e));
          vec3 objectNormal = normalize(vec3(-hx, 2.0 * e, -hz));
          `
        )
        .replace(
          '#include <begin_vertex>',
          `
          vec3 transformed = vec3(position.x, position.y + h, position.z);
          `
        )

      shader.fragmentShader = `
        varying float v_height;
        uniform vec3  u_land;
        uniform vec3  u_ink;
        uniform vec3  u_indexInk;
        uniform float u_density;
        uniform float u_weight;
        ${shader.fragmentShader}
      `.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        {
          float scaled = v_height * u_density;
          float band = fract(scaled);
          // fwidth keeps the line one pixel wide wherever the slope is, which is
          // the whole difficulty: on a flat plateau a fixed threshold paints the
          // entire region, and on a cliff it disappears.
          float aa = fwidth(scaled);
          float line = 1.0 - smoothstep(0.0, aa * (0.6 + u_weight * 2.2), min(band, 1.0 - band));

          // Every fifth line is an index contour, the one a real map labels.
          bool isIndex = mod(floor(scaled), 5.0) == 0.0;
          vec3 inkColor = isIndex ? u_indexInk : u_ink;
          float strength = line * (isIndex ? 1.0 : 0.72) * u_weight;

          diffuseColor.rgb = mix(u_land, inkColor, clamp(strength, 0.0, 1.0));
        }
        `
      )
    }
    // Changing onBeforeCompile after a program exists needs a new key.
    material.customProgramCacheKey = () => 'beamish-contour'

    /*
     * The shadow pass renders with its own material, which knows nothing about
     * the displacement above. Without this the land casts the shadow of a flat
     * plane and the whole relief detaches from its own shading.
     */
    const depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking
    })
    depthMaterial.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = `${TERRAIN_GLSL}\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `
        vec3 transformed = vec3(position.x, position.y + c_terrain(position.xz), position.z);
        `
      )
    }
    depthMaterial.customProgramCacheKey = () => 'beamish-contour-depth'

    const land = new THREE.Mesh(geometry, material)
    land.customDepthMaterial = depthMaterial
    land.castShadow = true
    land.receiveShadow = true
    // The bounds are computed from the undisplaced plane, so three would cull it
    // the moment the camera looked along the deck.
    land.frustumCulled = false
    scene.add(land)

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.sun = sun
    this.fill = fill
    this.land = land
  }

  resize(size: { pixelWidth: number; pixelHeight: number }): void {
    this.aspect = size.pixelWidth / size.pixelHeight
    this.renderer?.setSize(size.pixelWidth, size.pixelHeight, false)
    if (this.camera) {
      this.camera.aspect = this.aspect
      this.camera.updateProjectionMatrix()
    }
  }

  render(t: number, opts: ContourOptions): void {
    const { renderer, scene, camera, sun } = this
    if (!renderer || !scene || !camera || !sun) return

    this.paper.set(opts.paper)
    scene.background = this.paper

    const u = this.uniforms
    u['u_relief']!.value = opts.relief
    u['u_scale']!.value = opts.scale
    u['u_density']!.value = opts.density
    u['u_weight']!.value = opts.weight
    ;(u['u_land']!.value as THREE.Color).set(opts.land)
    ;(u['u_ink']!.value as THREE.Color).set(opts.ink)
    ;(u['u_indexInk']!.value as THREE.Color).set(opts.indexInk)

    // A closed orbit through noise space: the land morphs and returns exactly.
    const phase = TAU * (t / Math.max(opts.period, 0.001))
    ;(u['u_orbit']!.value as THREE.Vector2).set(Math.cos(phase) * 0.6, Math.sin(phase) * 0.6)

    const elevation = opts.elevation * DEG
    const azimuth = opts.azimuth * DEG
    const distance = 30
    sun.position.set(
      Math.cos(azimuth) * distance * Math.cos(elevation),
      distance * Math.sin(elevation),
      Math.sin(azimuth) * distance * Math.cos(elevation)
    )
    sun.target.position.set(0, 0, 0)
    sun.target.updateMatrixWorld()

    const back = 15 / Math.max(opts.zoom, 0.05)
    const fitted = this.aspect < 1 ? back / Math.max(this.aspect, 0.4) : back
    camera.position.set(0, fitted * (0.18 + opts.tilt * 1.1), fitted)
    camera.lookAt(0, 0, 0)

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return (this.renderer?.getContext() as WebGL2RenderingContext | undefined) ?? null
  }

  teardown(): void {
    if (this.land) {
      this.land.geometry.dispose()
      ;(this.land.material as THREE.Material).dispose()
      this.land.customDepthMaterial?.dispose()
      this.land = null
    }
    this.sun?.shadow.map?.dispose()
    this.sun?.dispose()
    this.fill?.dispose()
    this.scene?.clear()
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.sun = null
    this.fill = null
    this.uniforms = {}
  }
}

/**
 * Mount Contour into `el`. The element needs a size, in CSS, not just content.
 *
 * ```ts
 * const contour = createContour(document.querySelector('#hero')!)
 * contour.start()
 * // …later
 * contour.destroy()
 * ```
 */
export function createContour(el: HTMLElement, opts: Partial<ContourOptions> = {}): EffectHandle {
  return mount<ContourOptions>(el, opts, {
    defaults: contourDefaults,
    create: () => new ContourSurface()
  })
}

export default createContour
