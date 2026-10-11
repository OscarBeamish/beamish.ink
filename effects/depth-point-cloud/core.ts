/*
 * DepthPointCloud: Beamish
 * https://beamish.ink/effects/depth-point-cloud
 *
 * A photograph taken apart into points and pushed into the third dimension by
 * its own brightness.
 *
 * There is no depth map. A photograph does not carry one, and the honest thing
 * to say is that this does not know where anything is: it reads luminance and
 * treats it as height. That is wrong about the world and right about pictures,
 * because photographers light the subject and let the ground fall away, so in
 * most photographs the bright parts really are nearer. Where that fails, which
 * is a bright sky or a dark subject, it fails interestingly rather than
 * wrongly, and `relief` is how much you are willing to claim.
 *
 * Every point keeps the colour of the pixel it came from, so the thing stays
 * recognisable as the photograph while coming apart. That is the whole trick:
 * a point cloud in one colour is an abstract, and an abstract is much less
 * interesting than a picture you can still read.
 *
 * The wander is in the vertex shader rather than in JavaScript. Twenty-odd
 * thousand points moved on the CPU is twenty-odd thousand floats uploaded
 * every frame; moved on the GPU it is one uniform. Each point carries a phase
 * so they do not travel as a sheet, and the displacement is a sine of whole
 * turns per period, so every point is exactly where it started when the loop
 * comes round and `renderAtTime` is pure in `t`.
 *
 * The picture is read once, at the resolution the grid asks for, by drawing it
 * into a small 2D canvas and reading that back. Sampling a 1400-wide
 * photograph for a 200-wide grid through the browser's own downscale is both
 * faster and better than picking every nth pixel, which aliases badly on
 * anything with detail in it.
 */

import * as THREE from 'three'
import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type DepthPointCloudOptions = BaseOptions & {
  /** Behind the cloud. */
  background: string
  /** How far the brightest points stand off the darkest, in scene units. */
  relief: number
  /** Points across the picture. The square of this is the point count. */
  density: number
  /** Point size, in scene units at the plane of the picture. */
  size: number
  /** How far points wander from where the picture puts them. */
  drift: number
  /** Degrees the cloud turns either side of square-on. */
  spin: number
  /** Seconds for one cycle of the turn and the wander. */
  period: number
  /** How far the points are pulled towards `ink`, 0 for the photograph's own colour. */
  wash: number
  /** The colour points are pulled towards. */
  ink: string
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const depthPointCloudDefaults: DepthPointCloudOptions = {
  background: '#0a0b0f',
  relief: 1.15,
  density: 150,
  size: 0.026,
  drift: 0.008,
  spin: 7,
  period: 40,
  wash: 0.25,
  ink: '#8fd8ff',
  reducedMotionTime: 8
}

const TAU = Math.PI * 2
const DEG = Math.PI / 180

// beamish:shader-begin shaders/depth-point-cloud.vert
const VERT = `
/*
 * The wander lives here rather than in JavaScript.
 *
 * Twenty thousand points moved on the CPU means twenty thousand vectors
 * uploaded every frame; moved here it is one uniform and the positions never
 * change. Each point carries its own phase so the cloud does not travel as a
 * sheet, and the displacement is a sine of whole turns per period, so every
 * point is exactly where it started when the loop comes round.
 */

attribute float aPhase;

uniform float u_time;
uniform float u_period;
uniform float u_drift;
uniform float u_size;
uniform float u_scale;

varying vec3 vColor;

const float TAU2 = 6.28318530718;

void main() {
  vColor = color;

  float turn = TAU2 * u_time / max(u_period, 0.001);

  /*
   * Two turns one way and three the other, which are whole numbers so the
   * loop closes, and coprime so a point does not retrace the same short path
   * several times a cycle.
   */
  vec3 wander = vec3(
    sin(2.0 * turn + aPhase),
    cos(3.0 * turn + aPhase * 1.7),
    sin(3.0 * turn + aPhase * 2.3)
  ) * u_drift;

  vec4 world = modelViewMatrix * vec4(position + wander, 1.0);

  /*
   * Size falls off with distance, which is what makes the cloud read as having
   * depth at all. Without it the far points are as big as the near ones and
   * the whole thing flattens into a texture, which is the most common way this
   * kind of effect goes wrong.
   */
  gl_PointSize = u_size * u_scale / max(-world.z, 0.001);
  gl_Position = projectionMatrix * world;
}
`
// beamish:shader-end

// beamish:shader-begin shaders/depth-point-cloud.frag
const FRAG = `
precision mediump float;

varying vec3 vColor;

void main() {
  /*
   * Round points, cut out of the square one the hardware gives you, with the
   * edge softened by one pixel's worth of the point's own coordinate. Square
   * points read as a screen door over the picture: the grid they sit on
   * becomes the subject, which is the opposite of what this is for.
   */
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  float alpha = 1.0 - smoothstep(0.42, 0.5, r);
  if (alpha <= 0.001) discard;

  gl_FragColor = vec4(vColor, alpha);
}
`
// beamish:shader-end

type Sampled = {
  positions: Float32Array
  colors: Float32Array
  phases: Float32Array
  count: number
}

/*
 * Read the picture at grid resolution.
 *
 * Drawn into a small canvas and read back, rather than sampling every nth
 * pixel of the full-size image. The browser's downscale is a proper filter, so
 * every grid cell is the average of what was there; picking one pixel in seven
 * aliases badly on anything with detail in it, and a photograph is nothing but
 * detail.
 */
function samplePicture(
  image: HTMLImageElement,
  density: number,
  relief: number
): Sampled | null {
  const across = Math.max(8, Math.min(400, Math.round(density)))
  const aspect = image.naturalWidth / Math.max(image.naturalHeight, 1)
  const down = Math.max(4, Math.round(across / Math.max(aspect, 0.0001)))

  const canvas = document.createElement('canvas')
  canvas.width = across
  canvas.height = down
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, across, down)

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, across, down).data
  } catch {
    /* A cross-origin image taints the canvas and cannot be read back. Nothing
       to draw, and the caller leaves the scene empty rather than throwing. */
    return null
  }

  const count = across * down
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const phases = new Float32Array(count)

  /* The picture is two units wide, so the camera framing does not depend on
     the photograph that happens to be in it. */
  const width = 2
  const height = width / Math.max(aspect, 0.0001)

  for (let y = 0; y < down; y += 1) {
    for (let x = 0; x < across; x += 1) {
      const i = y * across + x
      const p = i * 4
      const r = data[p]! / 255
      const g = data[p + 1]! / 255
      const b = data[p + 2]! / 255

      /*
       * Rec. 709 luminance, not the average of the channels. The eye is far
       * more sensitive to green than to blue, and an average puts a blue sky
       * and a green field at the same height when nobody sees them that way.
       */
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b

      positions[i * 3] = (x / (across - 1) - 0.5) * width
      positions[i * 3 + 1] = (0.5 - y / (down - 1)) * height
      positions[i * 3 + 2] = (luma - 0.5) * relief

      colors[i * 3] = r
      colors[i * 3 + 1] = g
      colors[i * 3 + 2] = b

      /*
       * Deterministic, so two mounts of the same picture agree and the
       * recorder gets the same frame every time it asks, and decorrelated in
       * both axes, which the obvious version is not. Multiplying the index by
       * a constant and taking a modulus walks through phases in a regular
       * cycle, and since the index runs along each row that cycle lines up
       * with the grid: the first version drew visible vertical stripes across
       * the whole cloud, which is the grid announcing itself.
       */
      const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
      phases[i] = (h - Math.floor(h)) * TAU
    }
  }

  return { positions, colors, phases, count }
}

class DepthPointCloudSurface implements Surface<DepthPointCloudOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private points: THREE.Points | null = null
  private material: THREE.ShaderMaterial | null = null
  private image: HTMLImageElement | null = null
  private background = new THREE.Color()
  private ink = new THREE.Color()
  private builtFor = { density: 0, relief: 0, ready: false }
  /* The photograph's own colours, kept so the wash is always applied to the
     original rather than to the last washed result, which would compound. */
  private baseColors: Float32Array | null = null
  private washedFor: { wash: number; ink: string } = { wash: -1, ink: '' }

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('DepthPointCloud needs a canvas')

    const image = ctx.host.querySelector('img')
    if (!image) {
      throw new Error('DepthPointCloud needs an <img> inside the element it mounts on')
    }
    this.image = image

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

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
    camera.position.set(0, 0, 3.4)

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      vertexColors: true,
      transparent: true,
      depthWrite: true,
      uniforms: {
        u_time: { value: 0 },
        u_period: { value: depthPointCloudDefaults.period },
        u_drift: { value: depthPointCloudDefaults.drift },
        u_size: { value: depthPointCloudDefaults.size },
        u_scale: { value: 1 }
      }
    })

    const points = new THREE.Points(new THREE.BufferGeometry(), material)
    scene.add(points)

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.material = material
    this.points = points
    this.builtFor = { density: 0, relief: 0, ready: false }
  }

  /*
   * Built when the picture is actually decodable, and rebuilt only when the
   * grid or the relief changes.
   *
   * An <img> in the markup may not have arrived yet when the effect mounts,
   * and a surface that reads it once at setup gets an empty cloud for ever.
   * This is checked every frame because that is the only honest moment to ask:
   * there is no event the runtime hands down for it.
   */
  private ensureCloud(opts: DepthPointCloudOptions): void {
    const image = this.image
    const points = this.points
    if (!image || !points) return
    if (!image.complete || image.naturalWidth === 0) return
    if (
      this.builtFor.ready &&
      this.builtFor.density === opts.density &&
      this.builtFor.relief === opts.relief
    ) {
      return
    }

    const sampled = samplePicture(image, opts.density, opts.relief)
    if (!sampled) return

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(sampled.positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(sampled.colors, 3))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(sampled.phases, 1))

    points.geometry.dispose()
    points.geometry = geometry
    this.baseColors = Float32Array.from(sampled.colors)
    /* A fresh cloud is unwashed, so force the tint to be reapplied. */
    this.washedFor = { wash: -1, ink: '' }
    this.builtFor = { density: opts.density, relief: opts.relief, ready: true }
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    const { renderer, camera, material } = this
    if (!renderer || !camera) return
    renderer.setSize(size.pixelWidth, size.pixelHeight, false)
    camera.aspect = size.pixelWidth / Math.max(size.pixelHeight, 1)
    camera.updateProjectionMatrix()

    /*
     * Point size is given in scene units and gl_PointSize is in pixels, so the
     * shader needs to know how many pixels a scene unit is worth at the
     * picture's distance. Without this a point is a different physical size on
     * every screen, and on a phone the cloud turns into a solid block.
     */
    if (material) {
      material.uniforms['u_scale']!.value = size.pixelHeight
    }
  }

  render(t: number, opts: DepthPointCloudOptions): void {
    const { renderer, scene, camera, points, material } = this
    if (!renderer || !scene || !camera || !points || !material) return

    this.ensureCloud(opts)

    this.background.set(opts.background)
    scene.background = this.background

    const u = material.uniforms
    u['u_time']!.value = t
    u['u_period']!.value = opts.period
    u['u_drift']!.value = opts.drift
    u['u_size']!.value = opts.size

    /*
     * The wash is applied to the geometry colours rather than in the shader,
     * because it changes rarely and the shader runs per point per frame. It is
     * cheap to do here and free afterwards.
     */
    const colors = points.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
    const source = this.baseColors
    if (colors && source && (this.washedFor.wash !== opts.wash || this.washedFor.ink !== opts.ink)) {
      this.ink.set(opts.ink)
      const array = colors.array as Float32Array
      for (let i = 0; i < array.length; i += 3) {
        array[i] = source[i]! + (this.ink.r - source[i]!) * opts.wash
        array[i + 1] = source[i + 1]! + (this.ink.g - source[i + 1]!) * opts.wash
        array[i + 2] = source[i + 2]! + (this.ink.b - source[i + 2]!) * opts.wash
      }
      colors.needsUpdate = true
      this.washedFor = { wash: opts.wash, ink: opts.ink }
    }

    /*
     * A turn either side of square-on rather than a full rotation. A point
     * cloud seen edge-on is a line, and a photograph seen from behind is
     * nothing at all, so the useful range is small: enough to show that the
     * picture has thickness, not enough to lose the picture.
     */
    points.rotation.y = Math.sin(TAU * (t / Math.max(opts.period, 0.001))) * opts.spin * DEG
    points.rotation.x = Math.sin(TAU * 2 * (t / Math.max(opts.period, 0.001))) * opts.spin * 0.25 * DEG

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return (this.renderer?.getContext() as WebGL2RenderingContext | undefined) ?? null
  }

  teardown(): void {
    if (this.points) {
      this.points.geometry.dispose()
      this.points = null
    }
    this.material?.dispose()
    this.scene?.clear()
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.material = null
    this.image = null
    this.baseColors = null
    this.washedFor = { wash: -1, ink: '' }
    this.builtFor = { density: 0, relief: 0, ready: false }
  }
}

/**
 * Mount DepthPointCloud into `el`. The element must contain an `<img>`, and it
 * needs a size in CSS.
 *
 * ```html
 * <div id="hero" style="height: 70vh">
 *   <img src="/photograph.jpg" alt="" />
 * </div>
 * ```
 *
 * ```ts
 * const cloud = createDepthPointCloud(document.querySelector('#hero')!)
 * cloud.start()
 * // …later
 * cloud.destroy()
 * ```
 */
export function createDepthPointCloud(
  el: HTMLElement,
  opts: Partial<DepthPointCloudOptions> = {}
): EffectHandle {
  return mount<DepthPointCloudOptions>(el, opts, {
    defaults: depthPointCloudDefaults,
    create: () => new DepthPointCloudSurface()
  })
}

export default createDepthPointCloud
