You are adding **PointSwell** from Beamish to this project.

> A sea of glowing points rolling toward you, with the camera diving into it as the page scrolls. Backdrops · effect · MIT.
> https://beamish.ink/effects/point-swell

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- Travelling waves, not scrolling noise. The usual way to build this is two octaves of simplex with the sample point sliding forward each frame, which looks right and cannot loop: simplex is not periodic in any direction, so a field that slides forward never returns. It also cannot be driven by renderAtTime, because sliding forward means accumulating and the surface then depends on how it got there rather than on the clock
- Each mode is a sine of k dot x minus omega t, which is a closed form in t, and every omega is a whole number of turns per period, so the sea is exactly where it started when the period comes round. The waves travel toward the camera because that is what a positive omega against a forward wavevector does: the streaming is the physics rather than an offset added to a sample point
- Eighteen modes, because a sum of a few plane waves is quasi-periodic and lays itself out in a visible lattice however it is weighted. The count is what stops it reading as a pattern
- The headings fan about straight-on rather than spreading over the full circle. A real swell has a direction; waves arriving from everywhere average into chop, and what reads as a sea rolling toward you is a narrow fan with a little disagreement in it
- Deep-water dispersion, so a long wave runs faster than a short one as the root of the wavelength, rounded to whole turns because that is what closes the loop
- No bloom pass. The glow is tens of thousands of additively blended points overlapping, which is where the brightness in this kind of scene actually comes from. A composer stack buys a halo for three full-screen render targets and a second pair of passes, and this is a backdrop that sits behind a page rather than being the page
- A grid, not a reshaped sphere. Scenes of this kind often start from a SphereGeometry and throw the shape away in the vertex shader, which works and leaves the point spacing bunched at the poles of a sphere nobody can see
- The grid is jittered off its lattice. A perfectly regular sheet of points shows its rows as moire at a shallow angle, and a shallow angle is the only one this is ever seen at
- The cursor parts the surface sideways along the ground plane rather than lifting it. A sea that bulges towards whoever is looking at it is the wrong physical story and a much louder one
- Built for a dark ground and declared as one. Additive points on a near-black fill is the whole idea, and added light on paper is invisible
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/point-swell/core.ts`**

```ts
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
  /*
   * How far the pointer moves the camera, in scene units. The pointer does
   * not touch the water: it moves the viewer. An earlier version parted the
   * surface under the cursor, which is the more obvious thing to do and reads
   * as the sea noticing you. Moving the camera instead reads as leaning over
   * it, which is what somebody looking at a sea is actually doing.
   */
  parallax: number
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
  background: '#080616',
  colorLow: '#3f2a9e',
  colorHigh: '#72f2ff',
  density: 300,
  pointSize: 7.2,
  opacity: 0.95,
  swell: 1.15,
  scale: 1.5,
  waves: 18,
  dive: 1,
  parallax: 1.2,
  period: 32,
  seed: 4,
  reducedMotionTime: 9
}

/* The sheet, in scene units. Wide enough to run past the frame at the near
   edge and long enough that the far edge is lost in the fog. */
const SHEET_WIDTH = 84
const SHEET_DEPTH = 96

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
uniform vec3 uColLow;
uniform vec3 uColHigh;

varying vec3 vColor;
varying float vFade;

const float TAU = 6.28318530718;

void main() {
  vec3 p = position;

  float total = 0.0;
  float height = 0.0;
  /* 24 is the ceiling the loop is unrolled to. A literal rather than a
     JS interpolation: syncShaders escapes \${ on the way into core.ts, because
     a GLSL comment is allowed to contain one, so an interpolation here would
     arrive in the shader as its own source text. */
  int count = int(clamp(uWaves, 3.0, 24.0));

  for (int i = 0; i < 24; i++) {
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
    float a = pow(0.9, fi);
    total += a;

    height += a * sin(k * dot(dir, p.xz) - omega * uTime + fi * 1.7 + uSeed);
  }

  p.y = height / max(total, 0.0001) * uSwell;

  /* The crest is what gets the light. */
  /*
   * Stretched around the middle, not a straight read of the height. A sum of
   * sines spends most of its time near zero because the modes cancel, so a
   * plain remap leaves every point sitting on the middle of the ramp and the
   * sheet comes out one flat colour. The crest has to reach the high colour
   * or there is no point having one.
   */
  float lift = clamp(p.y / max(uSwell, 0.0001) * 1.7 + 0.5, 0.0, 1.0);

  vec4 world = modelMatrix * vec4(p, 1.0);

  vec4 mv = viewMatrix * world;

  vColor = mix(uColLow, uColHigh, lift);

  /*
   * Near points are brighter as well as larger. Without it the far edge of
   * the sheet is as present as the near edge and the whole thing reads as a
   * flat texture rather than as a surface going away from you.
   */
  vFade = smoothstep(0.5, 6.0, -mv.z) * (1.0 - smoothstep(70.0, 130.0, -mv.z));
  vFade *= 0.72 + 0.28 * aRipple;

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

    /*
     * Instant, not eased. Easing towards the pointer would mean keeping the
     * last camera position and moving a fraction of the way each frame, which
     * is an accumulator: the frame would depend on the frames before it and
     * renderAtTime could no longer be seeked. The recorder samples a pointer
     * path as a function of t, so a camera that is a function of the pointer
     * stays pure and a camera that chases it does not.
     *
     * All three axes rather than just across. Sliding sideways reads as the
     * image being dragged; a little height and a little depth with it reads
     * as leaning over the water, which is the thing being imitated.
     */
    camera.position.set(
      px * opts.parallax,
      Lerp(7, 0.8, e) + py * opts.parallax * 0.35,
      Lerp(16, -2, e) + py * opts.parallax * 0.3
    )
    camera.lookAt(px * opts.parallax * 0.4, Lerp(0, 0.6, e), Lerp(2, -16, e))

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `background` | color | `#080616` | any CSS hex | Behind the sea. Nothing is drawn there, so it is a flat fill, and it wants to be near black: the points are additive, so every bit of brightness in the fill is brightness the crests cannot add to. |
| `colorLow` | color | `#3f2a9e` | any CSS hex | The troughs. Close to the background, because a trough is the part of the sea with no light on it. |
| `colorHigh` | color | `#72f2ff` | any CSS hex | The crests. The whole range of the sea lies between this and colorLow, so the distance between the two is the contrast of the item. |
| `density` | number | `300` | 40 to 400 (looks right between 140 and 260) | Points across the sheet. The count goes as the square of it, so this is the whole cost. Below about 120 the sea stops being a surface and becomes a scatter. |
| `pointSize` | number | `7.2` | 0.5 to 10 (looks right between 1.8 and 4) | Point size at the near edge, falling off with distance. Large enough and the crests fuse into a solid ribbon, which loses the thing that makes it points. |
| `opacity` | number | `0.95` | 0.05 to 1 (looks right between 0.3 and 0.7) | How much light each point adds. They are additive, so this compounds where they overlap: the crests are bright because many dim points are stacked there, not because any one of them is. |
| `swell` | number | `1.15` | 0 to 4 (looks right between 0.7 and 2) | Height of the swell in scene units. At 0 it is a flat sheet of points, which is a different and quieter item. Past about 3 the crests reach the camera at the near edge. |
| `scale` | number | `1.5` | 0.3 to 5 (looks right between 1 and 2.5) | Waves across the sheet, for the longest one. The rest of the spectrum is built up from it, so this sets the size of the whole sea. |
| `waves` | number | `18` | 3 to 24 (looks right between 12 and 24) | Modes in the surface. The one that decides whether it reads as water: below about twelve the sum is quasi-periodic and the swell arranges itself on a visible lattice however the rest is tuned. |
| `dive` | number | `1` | 0 to 1 | How much of the camera's descent the scroll performs. At 0 the view stays high and the item is a sea seen from above; at 1 it finishes skimming the surface. Eased over the first third of the travel, because the interesting part of the move is the arrival. |
| `parallax` | number | `1.2` | 0 to 4 | How far the pointer moves the camera, in scene units. The pointer does not touch the water: it moves the viewer. Parting the surface under the cursor was tried first and reads as the sea noticing you, where moving the camera reads as leaning over it, which is what somebody looking at a sea is doing. The move is instant rather than eased, because easing means keeping the last position and moving a fraction of the way each frame, and that is an accumulator: it would make the frame depend on the frames before it and renderAtTime could no longer be seeked. |
| `period` | number | `32` | 8 to 120 s (looks right between 24 and 60) | Seconds for one cycle. Every mode completes a whole number of turns in it, so the sea returns exactly and the loop has no join. |
| `seed` | number | `4` | 0 to 9999 | Seed for the headings and phases. Two of these side by side want two seeds, or they are the same sea twice. |

## 5. Why it is a sum of waves and not scrolling noise

The scene this came from advances a simplex noise field with an accumulator:
each frame adds to the one before it. That cannot be seeked, so it cannot be
recorded, and it cannot loop, because there is no `t` at which it returns.

This is a sum of travelling waves instead. Every mode is a closed form in `t`,
and every angular frequency is rounded to a **whole number of turns over the
period**, so at `t = period` every mode is back where it started and the sea
returns exactly. Seeking backwards is free.

Deep-water dispersion sets the relationship: frequency goes as the square root
of wavenumber, so long waves travel faster than short ones. Ignore that and
the sheet reads as a vibrating membrane rather than as water.

## 6. The three things that decide whether it reads as a surface

1. **Point size against distance.** `gl_PointSize = size * k / -z`. Get this
   wrong and the far half of the sheet is one pixel per point, which reads as
   a sparse scatter rather than as a surface going away from you. It was the
   single biggest thing wrong with the first version.
2. **Crest contrast.** A sum of sines spends most of its time near zero,
   because the modes cancel. A plain remap of height to the colour ramp
   therefore leaves every point on the middle of the ramp and the whole sheet
   comes out one flat colour. Stretch it around the midpoint so the crests
   actually reach the high colour.
3. **The background is not neutral.** A dark green ground turns a blue sea
   green and there is no amount of point colour that fixes it. Keep the
   ground a near-black of the same family as the low colour.

## 7. Colour

Near-black ground with a trace of the low hue in it, a deep violet for the
troughs and a bright cyan for the crests. Two colours is a fade; what stops
this one reading as a fade is that the crest colour is only ever reached by a
small fraction of the points, so it works as light rather than as a gradient.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
