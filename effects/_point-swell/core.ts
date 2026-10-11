/*
 * PointSwell: Beamish
 * https://beamish.ink/effects/point-swell
 *
 * A sea of glowing points rolling toward you, with the camera diving into it
 * as the page scrolls.
 *
 * The surface is a sum of travelling waves rather than scrolling noise, and
 * that is the one decision everything else follows from.
 *
 * The obvious way to build this is two octaves of simplex noise with the
 * sample point sliding forward every frame, which is how almost every version
 * of it is written. It looks right and it cannot loop. Simplex is not periodic
 * in any direction, so a field that slides forward never returns, and an
 * effect that never returns cannot be recorded without a visible jump where
 * the take wraps. It also cannot be driven by `renderAtTime`, because sliding
 * forward means accumulating: the position of the field at a given moment
 * depends on how it got there rather than on the clock.
 *
 * Travelling waves have neither problem. Each mode is a sine of
 * `k·x - omega·t`, which is a closed form in `t` and so needs no accumulator,
 * and if every omega is a whole number of turns per period then the entire
 * surface is exactly where it started when the period is up. The waves move
 * toward the camera because that is what a positive omega against a forward
 * wavevector does, so the streaming is the physics rather than an offset
 * being added to a sample point.
 *
 * The cost is that a sea needs far more modes than it first appears. A sum of
 * a few plane waves is quasi-periodic and lays itself out in a visible
 * lattice, which is the same lesson WaterCaustics learned the hard way: the
 * count is what stops it reading as a pattern, not the weighting.
 *
 * There is no bloom pass. The glow is tens of thousands of additively blended
 * points overlapping, which is what the brightness in this kind of scene
 * actually comes from; a composer stack on top of it buys a halo for the cost
 * of three full-screen render targets and a second pair of passes, and this
 * is a backdrop that has to sit behind a page rather than be the page.
 */

import * as THREE from 'three'
import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type Scroll,
  type Pointer,
  type Surface
} from '../../shared/runtime'

export type PointSwellOptions = BaseOptions & {
  /** Behind the sea. Nothing is drawn there, so it is a flat fill. */
  background: string
  /** The troughs, and the colour a point starts from. */
  colorLow: string
  /** The crests. The whole range of the sea is between this and `colorLow`. */
  colorHigh: string
  /** Points across the sheet. The count goes as the square of it. */
  density: number
  /** Point size in pixels at the near edge. */
  pointSize: number
  /** How much light each point adds. They are additive, so this compounds. */
  opacity: number
  /** Height of the swell, in scene units. */
  swell: number
  /** Waves across the sheet, for the longest one. */
  scale: number
  /** Modes in the surface. Below about twelve the sea reads as a lattice. */
  waves: number
  /** How far the camera drops into the sea between scroll 0 and scroll 1. */
  dive: number
  /** How far the cursor moves the camera, in scene units. */
  parallax: number
  /** How far the cursor pushes the surface aside. */
  part: number
  /** How wide the parting is, in scene units. */
  partRadius: number
  /** Seconds for one cycle. Every mode completes whole turns in it. */
  period: number
  /** Seed for the wave directions and phases. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const pointSwellDefaults: PointSwellOptions = {
  background: '#02160c',
  colorLow: '#04281a',
  colorHigh: '#34e89a',
  density: 300,
  pointSize: 3.6,
  opacity: 0.8,
  swell: 1.15,
  scale: 1.5,
  waves: 18,
  dive: 1,
  parallax: 1.2,
  part: 0.9,
  partRadius: 7,
  period: 32,
  seed: 4,
  reducedMotionTime: 9
}

/* The sheet, in scene units. Wide enough to run past the frame at the near
   edge and long enough that the far edge is lost in the fog. */
const SHEET_WIDTH = 84
const SHEET_DEPTH = 96
const MAX_WAVES = 24

// beamish:shader-begin shaders/point-swell.vert
const VERT = `
/*
 * The surface, as a sum of travelling waves.
 *
 * Every mode is sin(k·x - omega·t), which is a closed form in t: there is no
 * accumulator anywhere in this effect and renderAtTime can be called with any
 * time in any order. Every omega is a whole number of turns per period, so
 * the whole sea is exactly where it started when the period comes round.
 *
 * The directions fan about straight-on by a fixed spread rather than over
 * the full circle. A real swell has a heading: waves arriving from every
 * direction at once average out into chop, and what reads as a sea rolling
 * toward you is a narrow fan of headings with a little disagreement in it.
 */

attribute float aRipple;

uniform float uTime;
uniform float uPeriod;
uniform float uSwell;
uniform float uScale;
uniform float uWaves;
uniform float uSize;
uniform float uSeed;
uniform vec3 uCursor;
uniform float uPartRadius;
uniform float uPart;
uniform float uActivity;
uniform vec3 uColLow;
uniform vec3 uColHigh;

varying vec3 vColor;
varying float vFade;

const float TAU = 6.28318530718;

void main() {
  vec3 p = position;

  float total = 0.0;
  float height = 0.0;
  int count = int(clamp(uWaves, 3.0, float(${MAX_WAVES})));

  for (int i = 0; i < ${MAX_WAVES}; i++) {
    if (i >= count) break;
    float fi = float(i);

    /*
     * A fan about straight-on, stepped by the golden angle so no two modes
     * share a heading and the set never lies on a lattice.
     */
    float spread = 0.85;
    float theta = sin(fi * 2.39996323 + uSeed) * spread;
    vec2 dir = vec2(sin(theta), cos(theta));

    /* Geometric wavenumbers: a spectrum rather than a chord. */
    float k = TAU * uScale * pow(1.17, fi) / 12.0;

    /*
     * Deep water disperses, so a long wave runs faster than a short one, as
     * the root of the wavelength. Rounded to whole turns because that is what
     * closes the loop; the rounding bends the dispersion by an amount nobody
     * can see and removes a join everybody would.
     */
    float turns = max(1.0, floor(2.0 * sqrt(TAU * uScale / 12.0 / k) + 0.5));
    float omega = turns * TAU / uPeriod;

    /* Amplitude falls with wavenumber, which is what keeps the fine modes as
       texture on the big ones rather than as noise over them. */
    float a = pow(0.82, fi);
    total += a;

    height += a * sin(k * dot(dir, p.xz) - omega * uTime + fi * 1.7 + uSeed);
  }

  p.y = height / max(total, 0.0001) * uSwell;

  /* The crest is what gets the light. */
  float lift = clamp(p.y / max(uSwell, 0.0001) * 0.5 + 0.5, 0.0, 1.0);

  vec4 world = modelMatrix * vec4(p, 1.0);

  /*
   * The cursor parts the surface. Pushed outward along the ground plane only:
   * lifting points towards the camera reads as the sea bulging at whoever is
   * looking at it, which is the wrong physical story and much louder.
   */
  vec3 away = vec3(world.x - uCursor.x, 0.0, world.z - uCursor.z);
  float d = length(away);
  float fall = smoothstep(uPartRadius, 0.0, d);
  world.xyz += normalize(away + vec3(0.0001, 0.0, 0.0001)) * fall * uPart * uActivity;

  vec4 mv = viewMatrix * world;

  vColor = mix(uColLow, uColHigh, lift);

  /*
   * Near points are brighter as well as larger. Without it the far edge of
   * the sheet is as present as the near edge and the whole thing reads as a
   * flat texture rather than as a surface going away from you.
   */
  vFade = smoothstep(0.5, 5.0, -mv.z) * (1.0 - smoothstep(48.0, 92.0, -mv.z));
  vFade *= 0.55 + 0.45 * aRipple;

  gl_PointSize = uSize * (14.0 / max(-mv.z, 0.001));
  gl_PointSize = max(gl_PointSize, 1.0);
  gl_Position = projectionMatrix * mv;
}
`
// beamish:shader-end

// beamish:shader-begin shaders/point-swell.frag
const FRAG = `
precision mediump float;

uniform float uOpacity;
varying vec3 vColor;
varying float vFade;

void main() {
  /*
   * Round, with the edge softened across the whole radius rather than at it.
   * A hard disc at this size aliases into a square, and tens of thousands of
   * squares read as a dither pattern rather than as light.
   */
  vec2 d = gl_PointCoord - 0.5;
  float l = length(d);
  if (l > 0.5) discard;
  float a = smoothstep(0.5, 0.0, l);
  a *= a;

  gl_FragColor = vec4(vColor, a * vFade * uOpacity);
}
`
// beamish:shader-end

const Lerp = (a: number, b: number, t: number) => a + (b - a) * t

class PointSwellSurface implements Surface<PointSwellOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private points: THREE.Points | null = null
  private material: THREE.ShaderMaterial | null = null
  private background = new THREE.Color()
  private builtFor = 0

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('PointSwell needs a canvas')

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
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400)

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      /*
       * Additive, which is where the glow comes from. Thousands of dim points
       * overlapping is a brighter thing than any one of them, so a crest
       * reads as lit without a single light in the scene.
       */
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPeriod: { value: pointSwellDefaults.period },
        uSwell: { value: pointSwellDefaults.swell },
        uScale: { value: pointSwellDefaults.scale },
        uWaves: { value: pointSwellDefaults.waves },
        uSize: { value: pointSwellDefaults.pointSize },
        uSeed: { value: pointSwellDefaults.seed },
        uOpacity: { value: pointSwellDefaults.opacity },
        uCursor: { value: new THREE.Vector3() },
        uPartRadius: { value: pointSwellDefaults.partRadius },
        uPart: { value: pointSwellDefaults.part },
        uActivity: { value: 0 },
        uColLow: { value: new THREE.Color(pointSwellDefaults.colorLow) },
        uColHigh: { value: new THREE.Color(pointSwellDefaults.colorHigh) }
      }
    })

    const points = new THREE.Points(new THREE.BufferGeometry(), material)
    points.frustumCulled = false
    scene.add(points)

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.material = material
    this.points = points
    this.builtFor = 0
  }

  /*
   * The sheet, built once per density.
   *
   * A grid rather than a reshaped sphere. The scene this came from started
   * from a SphereGeometry and threw the shape away in the vertex shader,
   * which works and leaves the point spacing bunched at the poles of a sphere
   * nobody can see.
   */
  private ensureSheet(opts: PointSwellOptions): void {
    const points = this.points
    if (!points) return
    const across = Math.max(24, Math.min(400, Math.round(opts.density)))
    if (this.builtFor === across) return

    /* Even spacing in both directions: the sheet is seen at a shallow
       angle, so rows coarser than columns show as banding. */
    const deep = Math.round(across * (SHEET_DEPTH / SHEET_WIDTH))
    const count = across * deep
    const position = new Float32Array(count * 3)
    const ripple = new Float32Array(count)

    for (let z = 0; z < deep; z += 1) {
      for (let x = 0; x < across; x += 1) {
        const i = z * across + x
        /*
         * Jittered off the lattice. A perfectly regular grid of points shows
         * its rows as moire the moment it is seen at a shallow angle, which
         * is the only angle this is ever seen at.
         */
        const jx = (Math.sin(i * 12.9898) * 43758.5453) % 1
        const jz = (Math.sin(i * 78.233) * 43758.5453) % 1
        position[i * 3] = (x / (across - 1) - 0.5 + jx * 0.6 / across) * SHEET_WIDTH
        position[i * 3 + 1] = 0
        position[i * 3 + 2] = 16 - (z / (deep - 1) + (jz * 0.6) / deep) * SHEET_DEPTH
        ripple[i] = (Math.sin(i * 3.7) * 0.5 + 0.5)
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('aRipple', new THREE.BufferAttribute(ripple, 1))
    points.geometry.dispose()
    points.geometry = geometry
    this.builtFor = across
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    const { renderer, camera } = this
    if (!renderer || !camera) return
    renderer.setSize(size.pixelWidth, size.pixelHeight, false)
    camera.aspect = size.pixelWidth / Math.max(size.pixelHeight, 1)
    camera.updateProjectionMatrix()
  }

  render(t: number, opts: PointSwellOptions, pointer: Pointer, scroll: Scroll): void {
    const { renderer, scene, camera, material } = this
    if (!renderer || !scene || !camera || !material) return

    this.ensureSheet(opts)

    this.background.set(opts.background)
    scene.background = this.background

    const u = material.uniforms
    u['uTime']!.value = t
    u['uPeriod']!.value = opts.period
    u['uSwell']!.value = opts.swell
    u['uScale']!.value = opts.scale
    u['uWaves']!.value = opts.waves
    u['uSize']!.value = opts.pointSize
    u['uSeed']!.value = opts.seed
    u['uOpacity']!.value = opts.opacity
    u['uPartRadius']!.value = opts.partRadius
    u['uPart']!.value = opts.part
    ;(u['uColLow']!.value as THREE.Color).set(opts.colorLow)
    ;(u['uColHigh']!.value as THREE.Color).set(opts.colorHigh)

    /*
     * The dive, eased over the first third of the travel.
     *
     * smoothstep rather than linear because the interesting part of this
     * movement is the arrival, and a linear descent reads as a lift going
     * down. The rest of the scroll holds the low view, which is the one worth
     * holding.
     */
    const progress = Math.max(0, Math.min(1, scroll.progress))
    const a = Math.min(progress / 0.35, 1)
    const e = a * a * (3 - 2 * a) * Math.max(0, Math.min(1, opts.dive))

    const px = pointer.active ? (pointer.x - 0.5) * 2 : 0
    const py = pointer.active ? (pointer.y - 0.5) * 2 : 0

    camera.position.set(px * opts.parallax, Lerp(7, 0.8, e) + py * opts.parallax * 0.3, Lerp(16, -2, e))
    camera.lookAt(px * opts.parallax * 0.5, Lerp(0, 0.6, e), Lerp(2, -16, e))

    /*
     * The cursor, put on the water rather than on the screen. The pointer
     * arrives as a fraction of the element; where it lands in the scene is
     * wherever the ray through it meets y = 0, which is the surface the sea
     * is drawn on.
     */
    const cursor = u['uCursor']!.value as THREE.Vector3
    if (pointer.active) {
      const ndc = new THREE.Vector3(px, py, 0.5).unproject(camera)
      const dir = ndc.sub(camera.position).normalize()
      if (Math.abs(dir.y) > 1e-4) {
        const travel = -camera.position.y / dir.y
        if (travel > 0 && Number.isFinite(travel)) {
          cursor.copy(camera.position).addScaledVector(dir, travel)
        }
      }
    }
    u['uActivity']!.value = pointer.active ? 1 : 0

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
    this.builtFor = 0
  }
}

/**
 * Mount PointSwell into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const sea = createPointSwell(document.querySelector('#hero')!)
 * sea.start()
 * // …later
 * sea.destroy()
 * ```
 */
export function createPointSwell(
  el: HTMLElement,
  opts: Partial<PointSwellOptions> = {}
): EffectHandle {
  return mount<PointSwellOptions>(el, opts, {
    defaults: pointSwellDefaults,
    create: () => new PointSwellSurface()
  })
}

export default createPointSwell
