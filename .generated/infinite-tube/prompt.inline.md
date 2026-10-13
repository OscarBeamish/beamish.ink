You are adding **InfiniteTube** from Beamish to this project.

> Flying through the inside of a tube that has no end, because the tube is a closed loop. Backdrops · effect · MIT.
> https://beamish.ink/effects/infinite-tube

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- Build a tube along a curve, turn the material inside out so you see its far wall, put the camera inside. The idea is from a Codrops article by Louis Hoebregts, credited below
- The usual way to make the flight endless is to scroll the texture a little further along the tube every frame. That is a running total, and a running total is the one thing an effect here may not keep: renderAtTime has to answer for any moment on its own, so the recorder can seek
- So the tube is a closed curve instead. It comes back to where it started, the camera goes round it, and after one lap everything is exactly as it was. The flight has no end because the road has no end, rather than because a counter keeps going up, and the loop is perfect for free because the last frame IS the first frame
- The tube has to bend. A straight one gives a stationary circle with a pattern sliding down it, which reads as a screensaver; corners coming at you are what sells the movement and what makes the far end disappear and reappear
- The camera looks ahead along the curve rather than at a fixed point, so going into a bend swings the view the way a car does
- It has to go dark in the distance, squared rather than linear. Without the fade you can see the whole tube and there is nothing to arrive out of; with a linear fade there is a visible grey disc at the far end that reads as the tube being capped
- getPointAt, not getPoint. The first is spaced by distance along the curve and the second by the parameter, and on a curve whose segments differ in length the parameter version speeds up and slows down on its own, which reads as the tube breathing
- The control points sit on a circle and are then pushed about by the seed, so the loop is always a loop. Scattering them freely was the first attempt and about one seed in three produced a curve that passed through itself, which from the inside is a wall
- The lines are widened by one pixel of their own gradient, measured with fwidth. Without it the far end of the tube is a field of moire rather than a pattern
- The wall is drawn by a shader rather than a texture, so there is no image to fetch and the rings stay sharp at any resolution
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/infinite-tube/core.ts`**

```ts
/*
 * InfiniteTube: Beamish
 * https://beamish.ink/effects/infinite-tube
 *
 * Flying through the inside of a tube that has no end.
 *
 * The idea is from a Codrops article by Louis Hoebregts, credited in
 * meta.json: build a tube along a curve, turn the material inside out so you
 * see its far wall, and put the camera inside it.
 *
 * WHY IT IS A CLOSED LOOP AND NOT AN ENDLESS ONE
 *
 * The usual way to make the flight endless is to scroll the texture along the
 * tube a little further every frame. That is a running total, and a running
 * total is the one thing an effect here may not keep: `renderAtTime(t)` has to
 * answer for any moment on its own, so the recorder can seek.
 *
 * So the tube is a closed curve instead. It comes back to where it started,
 * the camera goes round it, and after one lap everything is exactly as it was.
 * The flight has no end because the road has no end, rather than because a
 * counter keeps going up. That also makes the loop perfect for free: there is
 * nothing to line up, because the last frame IS the first frame.
 *
 * WHAT MAKES IT READ AS SPEED
 *
 * Three things, none of which is the speed.
 *
 *   The tube has to bend. A straight one gives you a stationary circle with a
 *   pattern sliding down it, which reads as a screensaver. Corners coming at
 *   you are what sells the movement, and they are also what makes the far end
 *   disappear and reappear.
 *
 *   The camera looks AHEAD along the curve rather than at a fixed point, so
 *   going into a bend swings the view the way a car does.
 *
 *   It has to go dark in the distance. Without that you can see the whole
 *   tube, there is nothing to arrive out of, and the corners stop mattering.
 *
 * The wall is drawn by a shader rather than a texture, so there is no image to
 * fetch and the rings stay sharp whatever the resolution.
 */

import * as THREE from 'three'
import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type InfiniteTubeOptions = BaseOptions & {
  /** Seconds for one lap of the loop. */
  period: number
  /** How wide the tube is. */
  radius: number
  /** How many bends the loop has. */
  bends: number
  /** How far the bends swing off the straight. */
  sway: number
  /** Rings down the length of the tube. */
  rings: number
  /** Lines running around it. */
  spokes: number
  /** How thick the lines are drawn, 0 to 1 of the gap between them. */
  weight: number
  /** How far down the tube you can see before it goes dark. */
  reach: number
  /** The wall between the lines. */
  wall: string
  /** The lines themselves. */
  line: string
  /** How wide an angle the camera takes in, in degrees. */
  lens: number
  /** Seed for the shape of the loop. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const infiniteTubeDefaults: InfiniteTubeOptions = {
  period: 12,
  radius: 2.6,
  bends: 7,
  sway: 11,
  rings: 300,
  spokes: 16,
  weight: 0.045,
  reach: 20,
  wall: '#0a0a12',
  line: '#5de4ff',
  lens: 78,
  seed: 4,
  maxDpr: 2,
  reducedMotionTime: 3
}

/** A small deterministic generator, so a seed always gives the same loop. */
function rng(seed: number): () => number {
  let s = (seed | 0) >>> 0
  if (s === 0) s = 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

const VERT = `
varying vec2 vUv;
varying float vDepth;

void main() {
  vUv = uv;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  /* Distance from the camera, which is what the wall fades on. */
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

const FRAG = `
precision highp float;

varying vec2 vUv;
varying float vDepth;

uniform vec3  u_wall;
uniform vec3  u_line;
uniform float u_rings;
uniform float u_spokes;
uniform float u_weight;
uniform float u_reach;

/*
 * One line, drawn as a band around the nearest multiple of its spacing.
 *
 * Widened by one pixel of its own gradient, which is what keeps a ring a
 * hairline when it is close and still visible when it is a hundred units away
 * and squeezed into nothing. Without it the far end of the tube turns into a
 * field of moire.
 */
float rule(float coord, float count, float weight) {
  float at = coord * count;
  /* Distance to the NEAREST line, which is zero on one and a half a spacing
     away midway between two. Measuring the distance to the midpoint instead
     draws the gaps and leaves the lines blank, which is a quick way to end up
     with a bright tube and dark rings. */
  float d = 0.5 - abs(fract(at) - 0.5);
  float w = max(fwidth(at), 0.0001);
  return 1.0 - smoothstep(weight - w, weight + w, d);
}

void main() {
  float rings = rule(vUv.x, u_rings, u_weight);
  float spokes = rule(vUv.y, u_spokes, u_weight);
  float ink = max(rings, spokes);

  vec3 colour = mix(u_wall, u_line, ink);

  /*
   * Into the dark. Squared, so the fade starts gently and then takes
   * everything: a linear one leaves a visible grey disc at the far end that
   * reads as the tube being capped.
   */
  float far = clamp(vDepth / max(u_reach, 0.001), 0.0, 1.0);
  colour *= 1.0 - far * far;

  gl_FragColor = vec4(colour, 1.0);
}
`

class InfiniteTubeSurface implements Surface<InfiniteTubeOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private mesh: THREE.Mesh | null = null
  private material: THREE.ShaderMaterial | null = null
  private curve: THREE.CatmullRomCurve3 | null = null
  private builtFor = ''

  private at = new THREE.Vector3()
  private ahead = new THREE.Vector3()

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('InfiniteTube needs a canvas')
    const renderer = new THREE.WebGLRenderer({ canvas: ctx.canvas, antialias: true })
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(78, 1, 0.1, 400)
    scene.add(camera)

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
  }

  resize(size: { pixelWidth: number; pixelHeight: number }): void {
    this.renderer?.setSize(size.pixelWidth, size.pixelHeight, false)
    const camera = this.camera
    if (camera) {
      camera.aspect = size.pixelWidth / Math.max(size.pixelHeight, 1)
      camera.updateProjectionMatrix()
    }
  }

  /*
   * The loop, and the tube wrapped round it.
   *
   * The curve is closed, which is the whole trick: CatmullRomCurve3 with
   * `closed` joins the last point back to the first with the same smoothness
   * as every other join, so there is no seam to fly through.
   *
   * Points are placed round a circle and then pushed about by the seed, so the
   * loop is always a loop and never ties itself in a knot. Scattering them
   * freely was the first attempt and roughly one seed in three produced a
   * curve that passed through itself, which from the inside is a wall.
   */
  private build(opts: InfiniteTubeOptions): void {
    const scene = this.scene
    if (!scene) return

    const bends = Math.max(3, Math.round(opts.bends))
    const key = [bends, opts.sway, opts.radius, opts.seed].join('/')
    if (key === this.builtFor) return

    if (this.mesh) {
      scene.remove(this.mesh)
      this.mesh.geometry.dispose()
    }

    const random = rng(opts.seed)
    const points: THREE.Vector3[] = []
    const ring = 26
    for (let i = 0; i < bends; i++) {
      const a = (i / bends) * Math.PI * 2
      points.push(
        new THREE.Vector3(
          Math.cos(a) * ring + (random() - 0.5) * opts.sway,
          (random() - 0.5) * opts.sway,
          Math.sin(a) * ring + (random() - 0.5) * opts.sway
        )
      )
    }

    const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5)
    const geometry = new THREE.TubeGeometry(curve, bends * 28, opts.radius, 24, true)

    const material =
      this.material ??
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        /* Inside out, because the camera is in here and what you need to see
           is the far wall rather than the outside of the pipe. */
        side: THREE.BackSide,
        uniforms: {
          u_wall: { value: new THREE.Color(opts.wall) },
          u_line: { value: new THREE.Color(opts.line) },
          u_rings: { value: opts.rings },
          u_spokes: { value: opts.spokes },
          u_weight: { value: opts.weight },
          u_reach: { value: opts.reach }
        }
      })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    scene.add(mesh)

    this.mesh = mesh
    this.material = material
    this.curve = curve
    this.builtFor = key
  }

  render(t: number, opts: InfiniteTubeOptions): void {
    const renderer = this.renderer
    const scene = this.scene
    const camera = this.camera
    if (!renderer || !scene || !camera) return
    this.build(opts)

    const curve = this.curve
    const material = this.material
    if (!curve || !material) return

    material.uniforms['u_wall']!.value.set(opts.wall)
    material.uniforms['u_line']!.value.set(opts.line)
    material.uniforms['u_rings']!.value = Math.max(1, opts.rings)
    material.uniforms['u_spokes']!.value = Math.max(1, opts.spokes)
    material.uniforms['u_weight']!.value = Math.min(Math.max(opts.weight, 0), 0.49)
    material.uniforms['u_reach']!.value = Math.max(opts.reach, 0.1)

    if (camera.fov !== opts.lens) {
      camera.fov = opts.lens
      camera.updateProjectionMatrix()
    }

    /*
     * Where on the loop we are. `fract` rather than a running total, so any
     * `t` can be asked for directly and one lap is one period exactly.
     */
    const where = ((t / Math.max(opts.period, 0.001)) % 1 + 1) % 1

    /*
     * `getPointAt` rather than `getPoint`: the first is spaced by distance
     * along the curve and the second by the parameter, and on a curve whose
     * segments are not the same length the parameter version speeds up and
     * slows down on its own. That reads as the tube breathing.
     */
    curve.getPointAt(where, this.at)
    curve.getPointAt((where + 0.012) % 1, this.ahead)

    camera.position.copy(this.at)
    camera.lookAt(this.ahead)

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.renderer?.getContext() ?? null
  }

  teardown(): void {
    if (this.mesh) {
      this.scene?.remove(this.mesh)
      this.mesh.geometry.dispose()
    }
    this.material?.dispose()
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.mesh = null
    this.material = null
    this.curve = null
    this.builtFor = ''
  }
}

/**
 * Mount InfiniteTube into `el`.
 *
 * ```ts
 * const tube = createInfiniteTube(document.querySelector('#hero')!)
 * tube.start()
 * // …later
 * tube.destroy()
 * ```
 */
export function createInfiniteTube(
  el: HTMLElement,
  opts: Partial<InfiniteTubeOptions> = {}
): EffectHandle {
  return mount<InfiniteTubeOptions>(el, opts, {
    defaults: infiniteTubeDefaults,
    create: () => new InfiniteTubeSurface()
  })
}

export default createInfiniteTube
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

InfiniteTube flies you through the inside of a tube that never ends.

Build a tube along a curve, turn the material inside out so you see its far
wall rather than its outside, and put the camera in it. That part is from a
[Codrops article by Louis
Hoebregts](https://tympanus.net/codrops/2017/05/09/infinite-tubes-with-three-js/).

## 3. Wire it in

**Plain HTML.**

```html
<div id="hero" style="position: relative; height: 100vh"></div>

<script type="module">
  import { createInfiniteTube } from './beamish/effects/infinite-tube/core.js'

  const tube = createInfiniteTube(document.querySelector('#hero'))
  tube.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createInfiniteTube } from '@/beamish/effects/infinite-tube/core'

export function Hero() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const tube = createInfiniteTube(host.current, { period: 24 })
    tube.start()
    return () => tube.destroy()
  }, [])

  return <div ref={host} style={{ height: '100vh' }} />
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createInfiniteTube } from '@/beamish/effects/infinite-tube/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let tube: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  tube = createInfiniteTube(host.value)
  tube.start()
})

onBeforeUnmount(() => tube?.destroy())
</script>

<template><div ref="host" class="hero" /></template>
```

**Astro.** Nothing extra is required, but `three` has to be installed.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `period` | number | `12` | 4 to 120 s (looks right between 10 and 30) | Seconds for one lap of the loop, which is also the speed: the distance is fixed, so a shorter period is a faster flight. Under about 10 the bends arrive faster than the eye can follow and it stops reading as travel. |
| `radius` | number | `2.6` | 0.6 to 8 (looks right between 1.6 and 4) | How wide the tube is. Narrow is claustrophobic and fast because the wall is close; wide is calm and the bends matter less. It interacts with `lens`: a wide tube through a wide lens is just a room. |
| `bends` | number | `7` | 3 to 20 (looks right between 5 and 11) | How many control points the loop has, which is roughly how many corners you go round per lap. Three is a triangle with rounded corners. Past about fifteen the bends are shorter than the visible distance and they stop registering as separate corners. |
| `sway` | number | `11` | 0 to 24 (looks right between 6 and 15) | How far the control points are pushed off their circle, so how wild the loop is. At 0 it is a perfectly round doughnut and the flight is a constant gentle curve. High values eventually fold the tube through itself, and from the inside that is a wall. |
| `rings` | number | `300` | 10 to 900 (looks right between 120 and 400) | Rings down the length of the tube. These are the thing that actually shows the speed, because they are what streams past. Too few and there is nothing to measure the movement against. |
| `spokes` | number | `16` | 0 to 64 (looks right between 8 and 24) | Lines running around the tube. They do not move relative to the camera, so they read as the structure of the tunnel rather than as speed. At 0 you get rings only, which is cleaner and reads more like a scan. |
| `weight` | number | `0.045` | 0.005 to 0.45 (looks right between 0.04 and 0.16) | How thick a line is, as a share of the gap between lines. Thin. Past about 0.3 the lines meet and you have a solid tube with gaps in it instead of a tube with lines on it. |
| `reach` | number | `20` | 6 to 160 (looks right between 12 and 36) | How far down the tube you can see before it goes dark. This is the one that decides whether there is a tunnel at all: too long and the far end stays lit, there is no hole to fly into and nothing arrives out of anything. Short is a tunnel; long is a pipe with the lights on. |
| `wall` | color | `#0a0a12` | any CSS hex | The wall between the lines. Near-black rather than black, so the tube still has a surface where no line is falling. |
| `line` | color | `#5de4ff` | any CSS hex | The lines. One bright colour against a dark wall is the whole palette, which is why this reads as something lit rather than something painted. |
| `lens` | number | `78` | 30 to 120 deg (looks right between 60 and 95) | How wide an angle the camera takes in. Wide exaggerates the speed, because things at the edge of the frame move much faster than things in the middle. Past about 100 the walls bow and it stops being a tube. |
| `seed` | number | `4` | 1 to 9999 | Seed for the shape of the loop. Worth clicking through a few: the character of the flight changes completely between a loop with one long straight and one that never stops turning. |
| `maxDpr` | number | `2` | 1 to 3 | Device pixel ratio ceiling. The lines are antialiased in the shader, so this costs fill rate rather than changing how they look. |
| `reducedMotionTime` | number | `3` | 0 to 60 s | The single frame shown when the user prefers reduced motion. Any moment works, since every point on the loop looks like a tunnel; this one happens to be on a bend, which is more interesting than a straight. |

## 5. Why it is a closed loop

The usual way to make the flight endless is to scroll the texture a little
further along the tube every frame. That is a running total, and a running
total is the one thing an effect here may not keep: `renderAtTime(t)` has to
answer for any moment on its own, so the recorder can seek.

So the tube is a **closed curve** instead. `CatmullRomCurve3` with `closed`
joins the last point back to the first with the same smoothness as every other
join, so there is no seam to fly through. The camera goes round it, and after
one lap everything is exactly as it was.

The flight has no end because the road has no end, rather than because a
counter keeps going up. That also gives a perfect loop for nothing: there is
nothing to line up, because the last frame **is** the first frame.

## 6. Three things make it read as speed, and none of them is the speed

**The tube has to bend.** A straight one gives you a stationary circle with a
pattern sliding down it, which reads as a screensaver. Corners coming at you
are what sell the movement, and they are what makes the far end of the tube
disappear and reappear.

**The camera looks ahead along the curve**, not at a fixed point. Going into a
bend then swings the view the way a car does, instead of the tunnel sliding
past a camera that is staring straight through it.

**It has to go dark in the distance.** Without the fade you can see the whole
tube at once, there is nothing to arrive out of, and the corners stop
mattering. Fade it *squared* rather than linearly: a linear fade leaves a
visible grey disc at the far end that reads as the tube being capped.

## 7. Two things that were wrong first

**`getPointAt`, not `getPoint`.** The first is spaced by distance along the
curve; the second by the curve's parameter. On a curve whose segments are not
the same length, the parameter version speeds up and slows down on its own,
which reads as the tube breathing.

**The control points sit on a circle** and are then pushed about by the seed.
Scattering them freely was the first attempt, and roughly one seed in three
produced a curve that passed through itself. From the inside, that is a wall.

## 8. The wall is a shader, not a texture

No image to fetch, and the rings stay sharp at any resolution. Each line is
widened by one pixel of its own gradient, measured with `fwidth`. Without that,
the far end of the tube is a field of moire rather than a pattern, because the
rings get squeezed below one pixel apart long before they fade out.

## 9. Tuning it

1. **`seed`.** Click through a few before anything else. The character changes
   completely between a loop with one long straight in it and one that never
   stops turning.
2. **`period`.** The distance is fixed, so this is the speed. Under about 10
   seconds the bends arrive faster than the eye follows and it stops reading as
   travel.
3. **`reach`.** Short is a tunnel. Long is a pipe with the lights on, and it
   takes the mystery out of the corners because you can see what is coming.
4. **`rings`.** These are what actually shows the speed, because they are what
   streams past. The spokes do not move relative to the camera, so they read as
   structure rather than as motion. `spokes: 0` is cleaner and more like a scan.
5. **`lens`.** Wide exaggerates the speed, because things at the edge of the
   frame move much faster than things in the middle.

## 10. Behind content

It is a dark item with one bright colour in it, so light text sits on it
easily. Raise `period` and drop `reach` if it is behind something that has to
be read: a slow flight into a short distance is nearly a still.

## 11. Accessibility. Do not skip this

Decorative, and there is nothing in the canvas for assistive technology. Under
reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. Any moment works, since every point on the loop looks like
a tunnel.

This is a moving perspective into depth, which is the kind of motion most
likely to bother someone prone to motion sickness, so the reduced-motion path
matters more here than on a flat item.

## 12. Cleanup and SSR

`destroy()` releases the WebGL context, disposes the geometry and material,
cancels the RAF, disconnects the observers and removes every listener. One live
context at a time is the budget, so call it.

There is nothing to render on the server. The element is empty until the script
runs, so give it a height and a dark background.

## 13. The three mistakes most likely to be made here

1. **Scrolling a texture to fake the travel.** It works and it cannot be
   seeked, so it cannot be recorded cleanly and it never loops exactly.

2. **A straight tube.** A circle with a pattern sliding down it. The bends are
   the effect.

3. **Forgetting `BackSide`.** You are inside the mesh, so the faces pointing at
   you are the ones that get culled by default, and the tube renders as nothing
   at all.

4. **No fade into the distance.** You can see the whole tube, so there is
   nowhere to arrive from.

5. **Control points scattered freely.** The curve ties itself in a knot and you
   fly into a wall.

6. **`getPoint` instead of `getPointAt`.** The flight surges and slows on its
   own, on a loop that should be at a constant speed.

---

Concept credit: Building a tube along a curve, flipping the material to its back side and putting the camera inside, from the Codrops article Infinite Tubes with Three.js. Theirs scrolls a texture to fake the travel; this one flies round a closed curve so it can be seeked and so it loops exactly, by Louis Hoebregts, Codrops, https://tympanus.net/codrops/2017/05/09/infinite-tubes-with-three-js/.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
