You are adding **DepthPointCloud** from Beamish to this project.

> A photograph taken apart into points and pushed into depth by its own brightness. Surfaces · effect · MIT.
> https://beamish.ink/effects/depth-point-cloud

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- There is no depth map, and the item does not pretend otherwise. It reads luminance and treats it as height, which is wrong about the world and right about photographs: a photographer lights the subject and lets the ground fall away, so in most pictures the bright parts really are nearer. A bright sky or a dark subject breaks it, and `relief` is how much you are willing to claim
- Rec. 709 luminance rather than the average of the channels. The eye is far more sensitive to green than to blue, and an average puts a blue sky and a green field at the same height when nobody sees them that way
- Every point keeps the colour of the pixel it came from, which is what keeps the picture readable as it comes apart. A point cloud in one colour is an abstract, and an abstract is a much weaker thing than a photograph you can still recognise
- The picture is read by drawing it into a small canvas at grid resolution and reading that back, so every cell is a proper average. Picking every nth pixel of the full-size image aliases badly, and a photograph is nothing but detail
- The wander is in the vertex shader. Twenty thousand points moved on the CPU is twenty thousand vectors uploaded every frame; moved on the GPU it is one uniform, and the positions never change
- Each point carries a phase, so the cloud does not travel as a sheet, and the displacement is a sine of whole turns per period, so every point is exactly where it started when the loop comes round
- Point size falls off with distance. Without that the far points are as large as the near ones and the whole thing flattens into a texture, which is the usual way this kind of effect fails
- Points are round, cut from the square the hardware gives you. Square points read as a screen door laid over the picture: the grid becomes the subject
- The cloud turns a little either side of square-on rather than rotating. A point cloud seen edge-on is a line and a photograph seen from behind is nothing, so the useful range is small
- Built for a dark ground and declared as one. The points are the picture's own colours against the fill, and on paper the pale half of the photograph disappears into the page
- The <img> may not have decoded when the effect mounts, so the cloud is built on the first frame where the picture is readable rather than once at setup. A cross-origin image taints the canvas and cannot be read back at all, in which case nothing is drawn
- The phase hash is a sine hash of the two grid coordinates, not the index times a constant. Walking the index through a modulus steps through phases in a regular cycle, and since the index runs along each row that cycle lines up with the grid: the first version drew visible vertical stripes across the whole cloud, which is the grid announcing itself
- The default density is as much about the codec as about the picture. A field of tiny high-contrast dots is the worst case a video encoder can be given: at 240 across, the take came out at 57MB against a 3500kB budget, which is sixteen times over and not a thing crf can rescue. Fewer and slightly larger points compress enormously better and, as the recipe already said, read better at card size, so the coarsening was owed anyway
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/depth-point-cloud/core.ts`**

```ts
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
```

**`src/beamish/shared/runtime.ts`**

```ts
/*
 * Beamish effect runtime.
 *
 * Every tier-1 effect is a thin `Surface` plugged into `mount()`. The host owns
 * everything that is the same for all of them and easy to get wrong: DPR capping,
 * resize, pausing offscreen, pausing on tab hide, reduced motion, WebGL context
 * loss and restore, and full teardown.
 *
 * An effect's core.ts should contain drawing, and nothing else.
 */

import { resolveAutoGrounds } from './ground'

export type EffectHandle = {
  start(): void
  stop(): void
  update(opts: Record<string, unknown>): void
  /** Deterministic: the same `t` must always yield the same frame. */
  renderAtTime(t: number): void
  /** Release the WebGL context, RAF and every listener. */
  destroy(): void
}

export type Size = {
  /** CSS pixels. */
  width: number
  height: number
  /** Device pixels, DPR already capped. Use these for the drawing buffer. */
  pixelWidth: number
  pixelHeight: number
  dpr: number
}

export type Pointer = {
  /**
   * 0 to 1 across the element, origin top-left. Centre until first move.
   *
   * Under `pointerScope: 'window'` this is not clamped: 1.4 means the cursor is
   * 40% of the element's width past its right edge. An effect that reaches
   * beyond its own box needs to know how far.
   */
  x: number
  y: number
  /** False until the pointer has entered, so effects can idle sensibly. */
  active: boolean
}

/** One sample of a scripted cursor path. `t` is seconds; x/y are 0 to 1. */
export type PointerKey = { t: number; x: number; y: number }

/**
 * One scripted press. `t` is seconds from the start of the loop; x/y are 0 to 1
 * across the element.
 *
 * A path can say where the cursor is at any moment, but a press is an instant
 * rather than a position, so it needs its own list. An effect that answers to
 * clicks reads this alongside whatever real presses it has seen, which is what
 * lets the recorder produce a take with clicks in it without anything having
 * been clicked.
 */
export type PressKey = { t: number; x: number; y: number }

export type Scroll = {
  /**
   * How far the host has travelled through the viewport. 0 when its top edge is
   * level with the bottom of the viewport, 1 when its bottom edge is level with
   * the top. Outside that range the element is off screen.
   */
  progress: number
  /**
   * Signed rate of change of `progress`, in units per second, already smoothed.
   * Negative is scrolling back up.
   *
   * This is the interesting one. Position tells an effect where it is; velocity
   * tells it how hard it was thrown, which is what anything physical has to know.
   */
  velocity: number
  /** False until the page has actually been scrolled. */
  active: boolean
}

/** One sample of a scripted scroll path. `t` is seconds; progress is 0 to 1. */
export type ScrollKey = { t: number; progress: number }

export type SurfaceContext = {
  /** The element the effect was mounted into. */
  host: HTMLElement
  /**
   * The generated canvas, or null for a `kind: 'dom'` effect. A text treatment
   * has nothing to draw into and should not be handed a canvas it will not use.
   */
  canvas: HTMLCanvasElement | null
  size: Size
}

/**
 * The per-effect half. `setup` runs on mount and again after the GPU hands the
 * context back, so it must be safe to call more than once.
 */
export interface Surface<O> {
  setup(ctx: SurfaceContext): void
  resize(size: Size): void
  /**
   * Draw one frame. `t` is absolute seconds from the start of the loop.
   *
   * Must be pure in `t`. Do not integrate against the previous frame, or the
   * recorder cannot produce a clean loop and `renderAtTime` breaks.
   */
  render(t: number, opts: O, pointer: Pointer, scroll: Scroll): void
  teardown(): void
  /** Return the GL context if there is one, so the host can release it. */
  context?(): WebGLRenderingContext | WebGL2RenderingContext | null
}

export type BaseOptions = {
  /**
   * Scripted cursor path. When set, the live pointer is ignored and the pointer
   * is sampled from this path at the current time, which is what makes
   * pointer-driven effects deterministic for the recorder.
   */
  pointerPath?: PointerKey[]
  /** Seconds the scripted path takes to run once before repeating. */
  pointerPathDuration?: number
  /**
   * Scripted presses, for effects that answer to a click. Each is a time and a
   * point, and an effect treats them exactly as it treats a real press that
   * happened at that moment, so a recorded take and a live page agree.
   *
   * Unlike `pointerPath`, this does not replace the live input: a scripted press
   * and a real one are the same kind of event, and an effect that ignored the
   * cursor while a script was running would be dead on the page.
   */
  pressPath?: PressKey[]
  /**
   * Scripted scroll path. When set, the real scroll position is ignored and both
   * progress and velocity are read from this path at the current time.
   *
   * Velocity is the slope of the segment rather than a difference against the
   * last frame, so it is a function of `t` alone. That is the whole point: an
   * effect driven by a real scrollbar cannot be replayed, and the recorder needs
   * frame 90 to look the same every time it asks for it.
   */
  scrollPath?: ScrollKey[]
  /** Seconds the scripted scroll path takes to run once before repeating. */
  scrollPathDuration?: number
  /** Frame shown when the user prefers reduced motion. Pick one that composes. */
  reducedMotionTime?: number
  /** Cap on device pixel ratio. Above 2 the cost is real and the gain is not. */
  maxDpr?: number
  /** Set false to opt out of pausing when scrolled offscreen. */
  pauseWhenOffscreen?: boolean
  /**
   * Where the pointer is read from.
   *
   * `element` fires only while the cursor is over the host and reports 0 to 1.
   * `window` follows the cursor everywhere and reports element-relative
   * coordinates that go outside 0 to 1, which is what an effect needs if it
   * reacts to a cursor that has not arrived yet.
   */
  pointerScope?: 'element' | 'window'
}

export type MountConfig<O> = {
  /** Merged over on every `update()`. */
  defaults: O
  create(): Surface<O>
  /**
   * `canvas` generates a canvas filling the host and watches it for context
   * loss. `dom` generates nothing and hands the host element straight to the
   * surface, which is what a text or layout effect wants.
   */
  kind?: 'canvas' | 'dom'
  /** Extra classes for the generated canvas. Ignored when kind is 'dom'. */
  canvasClass?: string
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Linear sample of a scripted path, wrapping at `duration` so it loops. */
export const samplePointerPath = (keys: PointerKey[], t: number, duration: number): Pointer => {
  if (keys.length === 0) return { x: 0.5, y: 0.5, active: false }
  const first = keys[0]!
  if (keys.length === 1) return { x: first.x, y: first.y, active: true }

  const span = duration > 0 ? duration : keys[keys.length - 1]!.t
  const local = span > 0 ? ((t % span) + span) % span : 0

  let a = first
  let b = keys[keys.length - 1]!
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i]!
    const hi = keys[i + 1]!
    if (local >= lo.t && local <= hi.t) {
      a = lo
      b = hi
      break
    }
  }

  const gap = b.t - a.t
  const k = gap > 0 ? clamp01((local - a.t) / gap) : 0
  // Smoothstep between keys: a linear cursor reads as a machine, which is what
  // it is, but it looks wrong next to eased motion.
  const e = k * k * (3 - 2 * k)
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, active: true }
}

/**
 * Linear sample of a scripted scroll path, wrapping at `duration` so it loops.
 *
 * Velocity comes out of the same smoothstep by differentiating it rather than by
 * comparing against the previous frame, which is what keeps the whole thing a
 * function of `t`. The derivative of the smoothstep is 6k(1-k), so velocity is
 * zero at each key and peaks halfway between: the scroll eases in and out of
 * every stop by construction.
 */
export const sampleScrollPath = (keys: ScrollKey[], t: number, duration: number): Scroll => {
  if (keys.length === 0) return { progress: 0, velocity: 0, active: false }
  const first = keys[0]!
  if (keys.length === 1) return { progress: first.progress, velocity: 0, active: true }

  const span = duration > 0 ? duration : keys[keys.length - 1]!.t
  const local = span > 0 ? ((t % span) + span) % span : 0

  let a = first
  let b = keys[keys.length - 1]!
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i]!
    const hi = keys[i + 1]!
    if (local >= lo.t && local <= hi.t) {
      a = lo
      b = hi
      break
    }
  }

  const gap = b.t - a.t
  const k = gap > 0 ? clamp01((local - a.t) / gap) : 0
  const e = k * k * (3 - 2 * k)
  const delta = b.progress - a.progress
  return {
    progress: a.progress + delta * e,
    velocity: gap > 0 ? (delta * 6 * k * (1 - k)) / gap : 0,
    active: true
  }
}

export function mount<O extends BaseOptions>(
  el: HTMLElement,
  userOpts: Partial<O> | undefined,
  config: MountConfig<O>
): EffectHandle {
  /*
   * `auto` in a colour option means take it from the page. Resolved here, at
   * the one point that has both the host element and the merged options, so no
   * item has to reach into the DOM from inside its own render loop.
   */
  let opts: O = resolveAutoGrounds(el, { ...config.defaults, ...(userOpts ?? {}) })

  const kind = config.kind ?? 'canvas'

  let canvas: HTMLCanvasElement | null = null
  if (kind === 'canvas') {
    canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    /*
     * Its own compositor layer, so the page cannot resample it.
     *
     * A canvas whose box lands on a half pixel has to be resampled to the
     * device grid, and which way it snaps is the compositor's business rather
     * than ours. Snapping one way on one frame and the other way on the next
     * moves the whole picture by a pixel, which is a flicker between two
     * positions that leaves no trace anywhere: the drawing buffer is perfect,
     * the clock is smooth, the box never changes and every number comes back
     * clean. It was reported on a canvas sitting at x = 683.5, and the same
     * effect at x = 123.5 on another machine was steady.
     *
     * translateZ(0) rather than will-change, because will-change is a hint
     * the browser is free to drop and this needs to be a promise. The cost is
     * one layer per live effect, and there is only ever one.
     */
    canvas.style.transform = 'translateZ(0)'
    canvas.style.backfaceVisibility = 'hidden'
    /*
     * Hidden until the first frame is in it.
     *
     * A WebGL canvas with `alpha: false` starts opaque black, and it is in the
     * document from the moment it is created, so between that and the first
     * draw the browser has a black rectangle to paint. On a warm cache that is
     * one frame and it reads as a flash; on a cold one the gap is longer.
     *
     * visibility rather than display, because display: none gives the element
     * no size and the first measure would come back zero.
     */
    canvas.style.visibility = 'hidden'
    if (config.canvasClass) canvas.className = config.canvasClass
    el.appendChild(canvas)
  }

  let surface: Surface<O> | null = null
  let size: Size = measure()
  let raf = 0
  let running = false
  let destroyed = false
  let contextLost = false

  // Wall-clock is accumulated rather than read, so stopping and starting does not
  // jump the animation and the loop stays reproducible.
  let elapsed = 0
  let lastStamp = 0

  const pointer: Pointer = { x: 0.5, y: 0.5, active: false }
  const scroll: Scroll = { progress: 0, velocity: 0, active: false }

  /*
   * Scroll is sampled once per frame, in the loop, rather than on the scroll
   * event.
   *
   * The event is the obvious place and it is the wrong one. Measured on a real
   * wheel scroll, scroll events arrive at about 6Hz while the effect renders at
   * 60, so a value taken on the event is reused for up to five frames running
   * and the effect moves in visible steps. Decaying it between events does not
   * fix that; it just turns the steps into a sawtooth.
   *
   * Reading the rect every frame costs about 20 microseconds, measured, which
   * is a tenth of a percent of a frame. It is a read with no write in front of
   * it, so it forces no layout.
   *
   * This is the one piece of state in the runtime that is not a function of
   * `t`, which is why `scrollPath` exists to replace it wholesale for the
   * recorder.
   */
  let scrollStarted = false
  let scrollSeeded = false

  /*
   * Half-life of the velocity smoothing. A per-frame difference is noisy enough
   * that handing it straight to a shader looks like chatter, and frame times
   * are not uniform. 70ms is short enough to feel attached to the input and
   * long enough to hide that jitter.
   */
  const VELOCITY_HALF_LIFE = 0.07

  function sampleScroll(dt: number) {
    const rect = el.getBoundingClientRect()
    const viewport = window.innerHeight || 1
    /*
     * 0 when the top edge is level with the bottom of the viewport, 1 when the
     * bottom edge is level with the top. Measured against the element's own
     * height plus the viewport, so a tall hero and a short strip both travel
     * the full range, which is what makes the number worth handing to an
     * effect at all.
     */
    const span = viewport + rect.height
    const next = span > 0 ? clamp01((viewport - rect.top) / span) : 0

    if (!scrollSeeded) {
      // Nothing to difference against on the first frame, and seeding it with a
      // zero gap would read as an infinite velocity.
      scroll.progress = next
      scrollSeeded = true
      return
    }

    if (dt > 0) {
      const instant = (next - scroll.progress) / dt
      const k = 1 - Math.pow(0.5, dt / VELOCITY_HALF_LIFE)
      scroll.velocity += (instant - scroll.velocity) * k
      if (Math.abs(scroll.velocity) < 1e-4) scroll.velocity = 0
    }

    if (next !== scroll.progress) scrollStarted = true
    scroll.progress = next
    scroll.active = scrollStarted
  }

  const motionQuery =
    typeof matchMedia === 'function' ? matchMedia(REDUCED_MOTION_QUERY) : null
  let reduced = motionQuery?.matches ?? false

  function measure(): Size {
    const rect = el.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    const cap = opts.maxDpr ?? 2
    const dpr = Math.min(window.devicePixelRatio || 1, cap)
    return {
      width,
      height,
      pixelWidth: Math.max(1, Math.round(width * dpr)),
      pixelHeight: Math.max(1, Math.round(height * dpr)),
      dpr
    }
  }

  function applySize() {
    size = measure()
    if (canvas) {
      if (canvas.width !== size.pixelWidth) canvas.width = size.pixelWidth
      if (canvas.height !== size.pixelHeight) canvas.height = size.pixelHeight
    }
    surface?.resize(size)
  }

  function pointerAt(t: number): Pointer {
    const path = opts.pointerPath
    if (path && path.length > 0) {
      return samplePointerPath(path, t, opts.pointerPathDuration ?? 0)
    }
    return pointer
  }

  function scrollAt(t: number): Scroll {
    const path = opts.scrollPath
    if (path && path.length > 0) {
      return sampleScrollPath(path, t, opts.scrollPathDuration ?? 0)
    }
    return scroll
  }

  function draw(t: number) {
    if (!surface || contextLost) return
    surface.render(t, opts, pointerAt(t), scrollAt(t))
    // There is something in the canvas now, so it can be shown. Cheap: a style
    // write that is already the current value does not invalidate anything.
    if (canvas && canvas.style.visibility === 'hidden') canvas.style.visibility = ''
  }

  function tick(stamp: number) {
    if (!running) return
    /*
     * Clamped at both ends.
     *
     * The top end is the tab-switch spike this always guarded against. The
     * bottom end is that a rAF timestamp is the moment the frame began, which
     * can be EARLIER than the performance.now() start() took a moment before:
     * the subtraction is then negative, Math.min keeps it, and the effect's
     * clock runs backwards. Measured on WindField, elapsed began at -0.1088
     * and four frames were rendered at a negative t before it climbed past
     * zero. A shader handed a smaller t than last frame draws an earlier
     * picture, which is a visible jump backwards on every start, and start
     * runs again every time the panel scrolls into view or the tab is
     * returned to.
     */
    const dt = Math.min(Math.max(stamp - lastStamp, 0), 100) / 1000
    elapsed += dt
    lastStamp = stamp
    sampleScroll(dt)
    draw(elapsed)
    raf = requestAnimationFrame(tick)
  }

  function ensureSurface() {
    if (surface || destroyed) return
    surface = config.create()
    surface.setup({ host: el, canvas, size })
    surface.resize(size)
  }

  function start() {
    if (destroyed || running || contextLost) return
    ensureSurface()
    if (reduced) {
      // WCAG 2.3.3: no loop at all. Still show a composed frame rather than a
      // blank panel. See reducedMotionTime.
      draw(opts.reducedMotionTime ?? 0)
      return
    }
    running = true
    lastStamp = performance.now()
    raf = requestAnimationFrame(tick)
  }

  function stop() {
    running = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    /*
     * Velocity is sampled in the loop, so a paused effect would otherwise keep
     * whatever it was last handed. Resuming after being scrolled past would
     * then show one frame of a flick that happened seconds ago.
     */
    scroll.velocity = 0
  }

  // --- context loss ------------------------------------------------------
  // Chromium hands a lost context back when an active one is released, so this
  // path fires in ordinary use, not only on a GPU crash.

  const onLost = (event: Event) => {
    event.preventDefault() // without this the context is not recoverable
    contextLost = true
    stop()
    surface?.teardown()
    surface = null
  }

  const onRestored = () => {
    contextLost = false
    if (destroyed) return
    ensureSurface()
    applySize()
    if (visible) start()
  }

  // Only a canvas can lose a GL context. A DOM effect has nothing to listen for.
  canvas?.addEventListener('webglcontextlost', onLost as EventListener, false)
  canvas?.addEventListener('webglcontextrestored', onRestored, false)

  // --- pointer -----------------------------------------------------------

  const windowScope = opts.pointerScope === 'window'

  const onPointerMove = (event: PointerEvent) => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    // Window scope reports unclamped coordinates on purpose. An effect that
    // reaches past its own edge has to know how far past, and clamping would
    // pin it to the border instead.
    pointer.x = windowScope ? x : clamp01(x)
    pointer.y = windowScope ? y : clamp01(y)
    pointer.active = true
  }

  const onPointerLeave = () => {
    pointer.active = false
  }

  const pointerTarget: EventTarget = windowScope ? window : el
  pointerTarget.addEventListener('pointermove', onPointerMove as EventListener)
  // Only element scope has a leave: the window one is never left.
  if (!windowScope) el.addEventListener('pointerleave', onPointerLeave)

  // --- scroll ------------------------------------------------------------

  /*
   * No scroll listener. The position is read in the frame loop above, which is
   * both smoother and one fewer thing to remove on teardown. An effect that is
   * not running does not need a scroll position, because nothing is drawing it.
   */

  // --- visibility and viewport -------------------------------------------

  let visible = true
  let wantedByUser = false

  const resizeObserver = new ResizeObserver(() => {
    if (destroyed) return
    applySize()
    /*
     * Always redraw, not only when stopped.
     *
     * Assigning canvas.width or canvas.height resets the drawing buffer, and a
     * WebGL buffer resets to opaque black. Leaving that for the next animation
     * frame means one black frame every time the element changes size, and
     * since the observer fires once on its first observation, that was a black
     * flash on every mount: the canvas showed its first drawn frame, the
     * observer cleared it, and the page painted the hole before the next tick
     * filled it.
     */
    draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed)
  })
  resizeObserver.observe(el)

  const intersectionObserver =
    opts.pauseWhenOffscreen === false
      ? null
      : new IntersectionObserver(
          entries => {
            const entry = entries[entries.length - 1]
            if (!entry) return
            visible = entry.isIntersecting
            if (visible) {
              if (wantedByUser) start()
            } else {
              stop()
            }
          },
          { threshold: 0 }
        )
  /*
   * The gate watches the element's parent, not the element.
   *
   * Watching the element deadlocks any effect that clips or moves its own host.
   * A reveal starts with its host clipped to nothing, the observer reports that
   * as not intersecting, the runtime stops the loop, and the clip therefore
   * never advances off the host: blank for ever, with the replay button unable
   * to escape it because `visible` can never become true again. The gate's
   * input must not be geometry the effect controls.
   *
   * The parent is laid out by the page rather than by the effect, so it breaks
   * the cycle. It is usually a little larger, which means an effect can start a
   * frame or two before it is strictly on screen. That is the cheaper mistake.
   */
  intersectionObserver?.observe(el.parentElement ?? el)

  const onVisibilityChange = () => {
    if (document.hidden) stop()
    else if (wantedByUser && visible) start()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  // Live listener, not a one-time read, so toggling the OS setting mid-session
  // takes effect without a reload.
  const onMotionChange = (event: MediaQueryListEvent) => {
    reduced = event.matches
    if (reduced) {
      stop()
      ensureSurface()
      draw(opts.reducedMotionTime ?? 0)
    } else if (wantedByUser && visible) {
      start()
    }
  }
  motionQuery?.addEventListener('change', onMotionChange)

  // --- handle ------------------------------------------------------------

  const handle: EffectHandle = {
    start() {
      wantedByUser = true
      if (visible && !document.hidden) start()
    },
    stop() {
      wantedByUser = false
      stop()
    },
    update(next) {
      opts = resolveAutoGrounds(el, { ...opts, ...(next as Partial<O>) })
      applySize()
      if (!running) draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed)
    },
    renderAtTime(t) {
      if (destroyed) return
      ensureSurface()
      elapsed = t
      draw(t)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      stop()

      motionQuery?.removeEventListener('change', onMotionChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      intersectionObserver?.disconnect()
      resizeObserver.disconnect()
      pointerTarget.removeEventListener('pointermove', onPointerMove as EventListener)
      el.removeEventListener('pointerleave', onPointerLeave)
      canvas?.removeEventListener('webglcontextlost', onLost as EventListener)
      canvas?.removeEventListener('webglcontextrestored', onRestored)

      const gl = surface?.context?.() ?? null
      surface?.teardown()
      surface = null

      // Hand the context back now rather than waiting for GC. The browser budget
      // is 16 contexts or 16M pixels, whichever comes first, and a page that
      // navigates between demos will hit it otherwise.
      gl?.getExtension('WEBGL_lose_context')?.loseContext()

      canvas?.remove()
    }
  }

  return handle
}
```

## 2. What it is

DepthPointCloud takes a photograph apart into points and pushes it into the
third dimension using its own brightness.

There is no depth map, and the item does not pretend there is. A photograph
does not carry one. This reads luminance and treats it as height, which is
wrong about the world and right about pictures: a photographer lights the
subject and lets the ground fall away, so in most photographs the bright parts
really are the near ones. Where that is false, which is a bright sky or a dark
subject, it fails interestingly rather than wrongly.

`relief` is how much you are willing to claim.

Every point keeps the colour of the pixel it came from, and that is the whole
trick. A point cloud in a single colour is an abstract; a photograph you can
still recognise while it comes apart is a much stronger thing.

## 3. Wire it in

**React.** `three` is a peer dependency.

```tsx
import { useEffect, useRef } from 'react'
import { createDepthPointCloud } from '@/beamish/effects/depth-point-cloud/core'

export function Cloud() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const cloud = createDepthPointCloud(host.current, { relief: 1.15 })
    cloud.start()
    return () => cloud.destroy()
  }, [])

  return (
    <div ref={host} className="absolute inset-0 -z-10">
      <img src="/photograph.jpg" alt="" className="hidden" />
    </div>
  )
}
```

Mount once. Option changes go through `update()` rather than a remount, because
a remount is a new WebGL context and the budget for those is small. `density`
and `relief` rebuild the cloud when they change; everything else is free.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createDepthPointCloud } from '@/beamish/effects/depth-point-cloud/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let cloud: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  cloud = createDepthPointCloud(host.value)
  cloud.start()
})

onBeforeUnmount(() => cloud?.destroy())
</script>

<template>
  <div ref="host" class="cloud">
    <img src="/photograph.jpg" alt="" style="display: none" />
  </div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `background` | color | `#0a0b0f` | any CSS hex | Behind the cloud. Dark, because the points carry the photograph's own colours and a pale fill swallows the pale half of it. |
| `relief` | number | `1.15` | 0 to 4 (looks right between 0.6 and 1.8) | How far the brightest points stand off the darkest, in scene units where the picture is two wide. This is the claim the item is making about the photograph, and it is a claim: at 0 it is a flat plane of points, and past about 2.5 the bright areas tear away from everything else. |
| `density` | number | `150` | 40 to 400 (looks right between 110 and 200) | Points across the picture. The square of this, near enough, is the point count, so it is the whole cost. Below about 100 the picture stops being recognisable, which is the thing worth keeping. |
| `size` | number | `0.026` | 0.002 to 0.06 (looks right between 0.014 and 0.032) | Point size in scene units, converted to pixels against the viewport height so it looks the same on a phone and a monitor. Large enough to close the gaps and the cloud becomes a solid sheet; small enough to see between them is the point. |
| `drift` | number | `0.008` | 0 to 0.4 (looks right between 0.004 and 0.03) | How far points wander from where the picture puts them. Very small: this is a photograph breathing, not a particle system. It is also the main thing that decides how busy the item is, and at 0.035 the whole frame changes faster than a backdrop should. Past about 0.1 the image stops being legible and you have confetti. |
| `spin` | number | `7` | 0 to 60 deg (looks right between 5 and 16) | Degrees the cloud turns either side of square-on. Enough to show the picture has thickness, not enough to lose the picture. |
| `period` | number | `40` | 8 to 120 s (looks right between 24 and 60) | Seconds for one cycle of the turn and the wander. Both complete whole turns in it, so the loop has no join. |
| `wash` | number | `0.25` | 0 to 1 | How far the points are pulled towards `ink`. At 0 you get the photograph's own colours, which is the most legible. At 1 the picture is one colour and reads as data rather than as a photograph, which is occasionally what you want. |
| `ink` | color | `#8fd8ff` | any CSS hex | The colour points are pulled towards. Only does anything when `wash` is above 0. |

## 5. The element needs an `<img>` in it

The picture is the input, not the output. It is read once and never shown.

```html
<div id="hero" style="height: 70vh">
  <img src="/photograph.jpg" alt="" />
</div>
```

Hide it with CSS. The effect reads it from the host element, so if there is no
`img` inside, mounting throws and says so.

Two things to know about that read. It happens on the first frame where the
picture is actually decodable rather than once at mount, because an `img` in
the markup may not have arrived yet and a surface that reads it once gets an
empty cloud for ever. And a cross-origin image taints the canvas and cannot be
read back at all: if your photograph is on another domain, serve it with CORS
headers or nothing will be drawn.

## 6. Three details that decide whether it works

**Rec. 709 luminance, not the average of the channels.** The eye is far more
sensitive to green than to blue, and averaging puts a blue sky and a green
field at the same height when nobody sees them that way.

**The picture is downscaled, not sampled.** It is drawn into a small canvas at
grid resolution and read back, so every point is the average of the cell it
came from. Picking every nth pixel of a full-size photograph aliases badly, and
a photograph is nothing but detail.

**Point size falls off with distance.** Without that the far points are as big
as the near ones and the whole thing flattens into a texture, which is the
usual way this kind of effect fails. It is also why `size` is in scene units
rather than pixels: converted against the viewport height, a point is the same
apparent size on a phone and on a monitor.

## 7. The stripes, which were the grid talking

The first version gave every point a phase with `index × constant % n`, which
is the usual quick hash. It drew visible vertical stripes across the entire
cloud.

The index runs along each row, so stepping through phases in a regular cycle
lines that cycle up with the grid, and the grid becomes visible in the
movement. A sine hash of the two coordinates separately has no such
relationship with either axis. Any hash you use here has to be decorrelated in
both directions, not just irregular.

## 8. Choosing a photograph

It wants a picture whose tones already describe its space: something lit in
front, something pale in the middle distance, something dark behind. A flatly
lit picture comes apart into a sheet with texture on it and proves nothing.

High-key pictures, where most of the frame is bright, give a cloud that is all
at the front. Pictures with a bright sky give a sky that hovers in front of the
subject, which is wrong but sometimes better than right.

## 9. It is for a dark ground

Declared `dark`. The points carry the photograph's own colours, which include
its pale ones, and on paper that half of the picture disappears into the page.
`wash` towards a dark ink is the nearest thing to a paper version and it is not
really one.

## 10. Cost and how busy it is

0.8ms at 1280 by 720, which is cheap: points cost very little and the movement
is all in the vertex shader, so nothing is uploaded per frame. Cost is the
square of `density`.

0.399 mean absolute change per frame on a 0 to 255 scale, against
MetaballField at 0.360 and WaterCaustics at 0.222. A field of small bright dots
is the hardest case for that measurement, because any movement switches whole
pixels between a dot and the background rather than shading them. `drift` and
`spin` are the dials: at `drift: 0.035` it measured 1.485, which is well past
the point where a backdrop has become something happening.

## 11. Cleanup and SSR

`destroy()` disposes the geometry, the material and the renderer, releases the
WebGL context, cancels the RAF, disconnects both observers and removes every
listener. One live context at a time is the budget, so call it.

There is nothing to render on the server. Call `createDepthPointCloud` from
`useEffect`, `onMounted`, or a `client:*` island. The `<img>` is ordinary
markup and can be server-rendered as usual.

## 12. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. A still of this is a photograph standing slightly off the
page, which is most of the idea.

## 13. The three mistakes most likely to be made here

1. **No `<img>` in the host.** It throws and tells you. The picture is an
   input, so it has to be in the DOM to be read.

2. **A cross-origin photograph without CORS headers.** The canvas is tainted,
   the pixels cannot be read back, and nothing is drawn. No error: there is
   nothing wrong, there is just nothing there.

3. **Too much `drift`.** It is the difference between a photograph breathing
   and confetti, and it is also the main thing that makes the item busy.

4. **Raising `density` to make the picture clearer.** Past the default it costs
   the square and buys very little: the limit on legibility is point size and
   drift, not point count.

5. **A flatly lit photograph.** Brightness is the only depth information there
   is. If the picture does not vary in tone, the cloud is a flat sheet.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
