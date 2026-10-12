You are adding **ChromeForm** from Beamish to this project.

> A turned metal form rotating in a studio built for it to reflect, with no image files to ship. Backdrops · effect · MIT.
> https://beamish.ink/effects/chrome-form

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- Most of this item is the room rather than the object. A mirror has no colour and no shading of its own, so chrome in an empty scene looks like grey plastic: there is nothing for it to be a reflection of
- The environment is painted into a canvas at runtime and used as an equirectangular map, so nothing is shipped: no HDR, no cube faces, no image files at all. A dark surround, a brighter floor and a few soft strip lights, which is what a photographer would put round something shiny
- The strips are what say metal. A gradient alone gives a smooth tonal wash that still reads as plastic; what reads as polished is a hard edge between light and dark sliding across a curve. The horizon step in the surround does the same job round the waist
- Lamps are spaced on an irrational step. Evenly spaced lamps put evenly spaced highlights round the object, and evenly spaced highlights read as a pattern printed on it rather than as a room it is standing in
- Prefiltered through PMREM rather than used raw, because otherwise roughness does nothing but darken: a raw map is sampled at one level however rough the surface claims to be, and the blurred levels are what a rough surface needs
- A lathe, not a torus knot. A knot is what every WebGL demo reaches for and says nothing about anything; a revolved profile is how a metal object of this kind is actually made, it gives the long uninterrupted curves that show a reflection off best, and the profile is three numbers rather than a model file
- ACES tone mapping, which is unusual here and is the one case that needs it. A mirror genuinely produces values above one, and clipping a strip light gives a flat white shape with a hard edge where the roll-off should be
- Geometry and environment are rebuilt only when their inputs change, because update() can be called on every frame by a framework re-render and PMREM has no business running at 60Hz
- Built for a dark ground and declared as one. The room is dark so that the strips read as light; on paper the background would have to be pale, and a pale fill behind a dark-roomed mirror looks like a hole cut in the page
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/chrome-form/core.ts`**

```ts
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

ChromeForm is a turned metal form, rotating, with a studio built for it to
reflect.

Most of this item is not the object. It is the room.

A mirror has no colour and no shading of its own: everything you see on a
chrome object is somewhere else in the room. That is why chrome rendered in an
empty scene looks like grey plastic, and it is the one thing that goes wrong
with this kind of effect. So the environment is painted into a canvas at
runtime and used as an equirectangular map. Nothing is shipped: no HDR file, no
cube faces, no images at all.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it. `three` is a
peer dependency: this one is not dependency-free.

```html
<div id="hero" style="height: 70vh"></div>

<script type="module">
  import { createChromeForm } from './beamish/effects/chrome-form/core.js'

  const form = createChromeForm(document.querySelector('#hero'))
  form.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createChromeForm } from '@/beamish/effects/chrome-form/core'

export function Form() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const form = createChromeForm(host.current, { roughness: 0.13 })
    form.start()
    return () => form.destroy()
  }, [])

  return <div ref={host} className="absolute inset-0 -z-10" />
}
```

Mount once. Option changes go through `update()` rather than a remount, because
a remount is a new WebGL context and the budget for those is small.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createChromeForm } from '@/beamish/effects/chrome-form/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let form: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  form = createChromeForm(host.value)
  form.start()
})

onBeforeUnmount(() => form?.destroy())
</script>

<template>
  <div ref="host" class="form" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `background` | color | `#0c0d10` | any CSS hex | The page behind the object. Nothing reflects it, so it is only a fill, but it wants to be close to the dark end of the room or the object reads as cut out and pasted on. |
| `tint` | color | `#eef1f4` | any CSS hex | The metal. Near white is chrome; warm it towards #e8c89a for brass and cool it for steel. On a fully metallic surface this multiplies the reflection rather than adding a colour of its own, which is why a saturated one looks like coloured glass instead of metal. |
| `studio` | color | `#fff6e8` | any CSS hex | The strip lights, and therefore the bright part of every reflection. Slightly warm by default, because a neutral white room makes the metal read as grey. |
| `roughness` | number | `0.13` | 0 to 1 (looks right between 0.05 and 0.35) | How polished. At 0 it is a mirror with the room sharp in it; by about 0.4 the strips have softened into a sheen and it reads as brushed. Past about 0.6 there is nothing left to reflect and it goes to grey. |
| `lamps` | number | `3` | 1 to 6 (looks right between 2 and 4) | Strip lights round the room. Two is a photographer's key and fill. More than four and the object has highlights everywhere, which flattens it: the dark between the strips is what gives the form its shape. |
| `height` | number | `2.6` | 0.6 to 5 | Height of the form in scene units, where the camera frames about four. |
| `girth` | number | `0.78` | 0.1 to 2 | Radius at the widest point. |
| `waist` | number | `0.42` | 0 to 0.9 (looks right between 0.2 and 0.6) | How far the middle pulls in, as a share of girth. At 0 it is a plain capped barrel. The waist is what gives the reflection somewhere to bend sharply, which is the most metal-looking thing on the object. |
| `tilt` | number | `14` | -45 to 45 deg | Degrees the axis leans. A little off vertical is the difference between an object and a diagram of one. |
| `period` | number | `36` | 8 to 180 s (looks right between 24 and 60) | Seconds for one full turn. Exactly one turn, so the loop closes with no join. |

## 5. What makes it read as metal

**Edges, not gradients.** A smooth tonal wash still reads as plastic however
shiny the material claims to be. What says polished is a hard edge between
light and dark sliding across a curve, which is why the room has soft strip
lights in it and a visible step at the horizon. The horizon is the line that
runs round the waist of anything reflective standing in a room, and its
absence is noticeable in a way nobody can name.

**Unevenly spaced lamps.** Evenly spaced lamps put evenly spaced highlights
round the object, and evenly spaced highlights read as a pattern printed on it
rather than as a room it is standing in. They sit on an irrational step.

**A prefiltered environment.** The map goes through three's PMREM generator
rather than being used raw, because otherwise `roughness` does nothing but
darken: a raw map is sampled at one level however rough the surface is. The
blurred levels are what a rough surface needs, and building them is what makes
the roughness dial mean something.

**ACES tone mapping**, which is unusual in this library and is the one case
that genuinely needs it. A mirror really does produce values above one. Clip a
strip light and you get a flat white shape with a hard edge where the roll-off
should be, which is the look of a render rather than of metal.

## 6. Why a lathe and not a torus knot

A knot is what every WebGL demo reaches for, and reaching for it says nothing
about the thing you are making. A profile revolved about an axis is how a metal
object of this sort is actually made; it gives long uninterrupted curves, which
are what show a reflection off best; and the profile is three numbers you could
say out loud rather than a model file to fetch.

`height`, `girth` and `waist`. The waist is the one that matters: it is where
the reflection has to bend sharply, and a bend is the most metal-looking thing
on the object. At `waist: 0` you have a capped barrel and the reflections run
straight down it.

## 7. Do not animate the room

`studio` and `lamps` rebuild the environment, and rebuilding means repainting a
canvas and running PMREM over it. Both are cached against their inputs here, so
changing them occasionally is free and changing them every frame is the one way
to make this item expensive. Change `period`, `roughness` or the profile
instead; none of those rebuild anything but geometry, and that only when it
actually differs.

## 8. Making it brass, or steel

`tint` multiplies the reflection on a fully metallic surface rather than adding
a colour of its own, which is the thing people get wrong. Near white is chrome.
Around `#e8c89a` is brass. A saturated tint does not give you coloured metal,
it gives you coloured glass, because the reflection is all there is and you
have put a filter over it.

`studio` is the other half of the colour. A neutral white room makes the metal
read as grey, which is why the default is slightly warm.

## 9. It is for a dark ground

Declared `dark`. The room is dark so that the strips read as light, and
`background` is a flat fill that nothing reflects. On paper you would have to
make that fill pale, and a pale fill behind an object that is mirroring a dark
room looks like a hole cut in the page.

## 10. Cost and how busy it is

1.2ms at 1280 by 720, against TerrainRelief at 1.80 on the same run, and 0.035
mean absolute change per frame on a 0 to 255 scale against TerrainRelief at
0.450.

That makes it one of the quietest items here, which is what a backdrop wants: a
single object turning slowly against a flat fill changes very few pixels. It is
also the only thing in this library you could reasonably put a headline on top
of without touching a setting.

## 11. Cleanup and SSR

`destroy()` disposes the geometry, the material, the environment and the
renderer, releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createChromeForm` from `useEffect`, `onMounted`, or a `client:*`
island.

## 12. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. A still of a polished object is a perfectly good still.

## 13. The three mistakes most likely to be made here

1. **Expecting chrome to look like chrome in an empty scene.** It cannot. With
   nothing to reflect it is grey plastic, and no amount of metalness fixes
   that. If you replace the environment, replace it with something that has
   edges in it.

2. **A saturated `tint`.** On a metal the tint multiplies the reflection, so a
   strong colour reads as tinted glass rather than as coloured metal.

3. **Too many lamps.** Past about four the object has highlights everywhere and
   flattens out. The dark between the strips is what gives the form its shape.

4. **Animating `studio` or `lamps`.** Every change rebuilds and prefilters the
   environment. They are cached, so this costs nothing until you put them in a
   loop, at which point it costs everything.

5. **`roughness` above about 0.6.** There is nothing left to reflect and you
   have an expensive grey object.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
