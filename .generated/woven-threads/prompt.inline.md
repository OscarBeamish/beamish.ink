You are adding **WovenThreads** from Beamish to this project.

> Cloth: warp one way, weft the other, and one of them on top at every crossing. Backdrops · effect · MIT.
> https://beamish.ink/effects/woven-threads

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The interlacing is the item, and it is one comparison per crossing. Two sets of lines crossing is a grid: the threads pass through each other and the surface has no structure at all. The comparison is what turns it into cloth
- Changing that comparison from alternating to shifting is the difference between plain weave and twill, and the diagonal appears in the surface the moment it does. That is why denim has a diagonal in it
- The threads are round, shaded by their own cylindrical profile: the height across a cylinder is the root of one minus the square of the across-coordinate, and the slope of that is the normal. Flat threads are stripes
- The thread that goes under is darkened where it passes beneath, which is the shadow of the one above it. Without it the interlacing reads as a hard edge rather than as depth
- The cloth moves by having its threads wander along their length rather than by being translated, so the weave breathes the way fabric does when there is air in the room. A translated weave reads as a backdrop sliding past
- Because the wander moves a thread's centre, the nearest thread is found from the undisplaced grid and then corrected by that thread's own offset. Exact for any wander under half a pitch, which is far more than cloth does
- Two GLSL traps in one file: half is a reserved word and step is a builtin, and a variable named either fails at compile time rather than at run time
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- Measured at 0.035 mean absolute change per frame on a 0 to 255 scale and 1.23ms at 640 by 360, which makes it one of the quietest items here: the threads wander rather than travel
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/woven-threads/core.ts`**

```ts
/*
 * WovenThreads: Beamish
 * https://beamish.ink/effects/woven-threads
 *
 * Cloth. Warp threads one way, weft the other, and at every crossing one of
 * them is on top.
 *
 * That last clause is the whole thing. Every version of this effect that goes
 * around draws two sets of lines crossing, which is a grid: the threads pass
 * through each other and the surface has no structure. What makes cloth cloth
 * is the interlacing, and the interlacing is one comparison per crossing. Plain
 * weave alternates every crossing. Twill shifts the float by one each row,
 * which is why denim has a diagonal in it, and you can see that diagonal appear
 * the moment the comparison changes.
 *
 * Two things besides:
 *
 *   The threads are round, not flat. Each one is shaded by its own cylindrical
 *   profile, which is what makes a woven surface read as made of something
 *   rather than printed. A flat thread is a stripe.
 *
 *   The thread that goes under is darkened where it passes beneath. That is the
 *   shadow of the thread on top of it, and without it the interlacing is
 *   visible only as a hard edge rather than as depth.
 *
 * The cloth moves by having its threads wander, not by being translated. A
 * thread is displaced along its length by a slow wave, so the weave breathes
 * the way fabric does when there is air in the room. The waves are whole
 * numbers of turns over the period, so the loop closes exactly.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type WovenThreadsOptions = BaseOptions & {
  /** What shows between the threads. */
  ground: string
  /** The threads running one way. */
  warp: string
  /** The threads running the other. */
  weft: string
  /** Distance from one thread to the next, in CSS pixels. */
  pitch: number
  /** Thread width, as a share of the pitch. 1 is a closed cloth. */
  width: number
  /** Floats per repeat: 1 is plain weave, 2 or 3 give a twill. */
  float: number
  /** How strongly the round threads are lit. */
  relief: number
  /** Where the light comes from, in degrees. */
  light: number
  /** How dark the thread underneath goes where it passes beneath. */
  crimp: number
  /** How far the threads wander, as a share of the pitch. */
  wander: number
  /** Seconds for one cycle of the wander. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const wovenThreadsDefaults: WovenThreadsOptions = {
  ground: '#efece1',
  warp: '#f7f5ed',
  weft: '#d9d4c4',
  pitch: 13,
  width: 0.86,
  float: 1,
  relief: 0.55,
  light: 135,
  crimp: 0.45,
  wander: 0.1,
  period: 36,
  reducedMotionTime: 9
}

// beamish:shader-begin shaders/woven-threads.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/woven-threads.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * WovenThreads: warp one way, weft the other, and one of them on top at every
 * crossing.
 *
 * The interlacing is the item. Two sets of lines crossing is a grid, and a grid
 * has no structure: the threads pass through each other. One comparison per
 * crossing turns it into cloth, and changing that comparison from alternating
 * to shifting is the difference between plain weave and twill, which is why
 * denim has a diagonal in it.
 *
 * The threads wander rather than translate. Each is displaced along its length
 * by a slow wave, so the weave breathes the way fabric does rather than sliding
 * past like a backdrop. Because the displacement moves a thread's centre, the
 * index of the nearest thread is found from the undisplaced grid and then
 * refined with that thread's own offset: exact for any wander under half a
 * pitch, which is far more than cloth does.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_warp;
uniform vec3  u_weft;
uniform float u_pitch;
uniform float u_width;
uniform float u_float;
uniform float u_relief;
uniform float u_light;
uniform float u_crimp;
uniform float u_wander;

out vec4 fragColor;

const float TAU = 6.28318530718;

/*
 * How far a thread has wandered from its nominal line. A function of which
 * thread it is and how far along it you are, so a single thread snakes rather
 * than the whole cloth sliding. Two turns over the period, so it closes.
 */
float wanderOf(float index, float along, float phase) {
  return (sin(along * 0.021 + phase + index * 1.7) * 0.6 +
          sin(along * 0.047 - phase * 2.0 + index * 0.9) * 0.4) * u_wander * u_pitch;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float phase = TAU * u_time / max(u_period, 0.001);

  float pitch = max(u_pitch, 2.0);
  // Not half, which GLSL reserves, and not step, which it defines.
  float reach = pitch * 0.5 * clamp(u_width, 0.05, 1.0);

  /*
   * Which thread, and how far across it. The nominal index comes from the
   * undisplaced grid and is then corrected by that thread's own wander, which
   * is exact while the wander stays under half a pitch.
   */
  float wi = floor(cssPx.x / pitch);
  float wCentre = (wi + 0.5) * pitch + wanderOf(wi, cssPx.y, phase);
  if (abs(cssPx.x - wCentre) > pitch * 0.5) {
    wi += cssPx.x > wCentre ? 1.0 : -1.0;
    wCentre = (wi + 0.5) * pitch + wanderOf(wi, cssPx.y, phase);
  }

  float fj = floor(cssPx.y / pitch);
  float fCentre = (fj + 0.5) * pitch + wanderOf(fj + 37.0, cssPx.x, -phase);
  if (abs(cssPx.y - fCentre) > pitch * 0.5) {
    fj += cssPx.y > fCentre ? 1.0 : -1.0;
    fCentre = (fj + 0.5) * pitch + wanderOf(fj + 37.0, cssPx.x, -phase);
  }

  // Across-thread coordinates, normalised so 1 is the edge of the thread.
  float uWarp = (cssPx.x - wCentre) / max(reach, 0.001);
  float uWeft = (cssPx.y - fCentre) / max(reach, 0.001);

  bool onWarp = abs(uWarp) <= 1.0;
  bool onWeft = abs(uWeft) <= 1.0;

  /*
   * The interlacing. One comparison, and it is the whole difference between
   * cloth and a grid. With float at 1 the pattern alternates every crossing,
   * which is plain weave; higher values let a thread float over several in a
   * row and shift by one each line, which is a twill and brings a diagonal
   * with it.
   */
  float repeat = 2.0 * max(u_float, 1.0);
  float slot = mod(wi + fj * max(u_float, 1.0), repeat);
  bool warpOver = slot < max(u_float, 1.0);

  /*
   * A round thread, shaded by its own profile. The height across a cylinder is
   * the root of one minus the square of the across-coordinate, and the slope of
   * that is the normal. Flat instead, and the cloth is a set of stripes.
   */
  float sun = radians(u_light);
  vec2 sunDir = vec2(cos(sun), sin(sun));

  vec3 col = u_ground;
  float lit = 0.0;
  bool drawWarp = onWarp && (warpOver || !onWeft);
  bool drawWeft = onWeft && (!warpOver || !onWarp);

  if (drawWarp) {
    float u = clamp(uWarp, -1.0, 1.0);
    float h = sqrt(max(1.0 - u * u, 0.0));
    // The slope across the thread, dotted with the light's across-component.
    lit = (-u / max(h, 0.25)) * sunDir.x;
    col = u_warp;
  } else if (drawWeft) {
    float u = clamp(uWeft, -1.0, 1.0);
    float h = sqrt(max(1.0 - u * u, 0.0));
    lit = (-u / max(h, 0.25)) * sunDir.y;
    col = u_weft;
  }

  if (drawWarp || drawWeft) {
    col *= 1.0 + clamp(lit, -1.0, 1.0) * u_relief * 0.5;

    /*
     * Crimp. The thread that goes under is in the shadow of the one above it,
     * and the shadow is deepest where the two cross. Without this the
     * interlacing reads as a hard edge rather than as one thread passing
     * beneath another.
     */
    float under = drawWarp ? (1.0 - clamp(abs(uWeft), 0.0, 1.0)) : (1.0 - clamp(abs(uWarp), 0.0, 1.0));
    bool isUnder = drawWarp ? !warpOver : warpOver;
    if (isUnder) col *= 1.0 - under * u_crimp;
  }

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_ground',
  'u_warp',
  'u_weft',
  'u_pitch',
  'u_width',
  'u_float',
  'u_relief',
  'u_light',
  'u_crimp',
  'u_wander'
] as const

type UniformName = (typeof UNIFORMS)[number]

function rgb(value: string): [number, number, number] {
  const hex = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    ]
  }
  const nums = value.match(/[\d.]+/g)
  if (nums && nums.length >= 3) {
    return [Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255]
  }
  return [0, 0, 0]
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('WovenThreads: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`WovenThreads: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class WovenThreadsSurface implements Surface<WovenThreadsOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('WovenThreads needs a canvas')
    const gl = ctx.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      // The recorder reads pixels back after the draw call, and without this the
      // buffer may already have been cleared.
      preserveDrawingBuffer: true,
      powerPreference: 'low-power'
    })
    if (!gl) throw new Error('WovenThreads needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('WovenThreads: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`WovenThreads: program failed to link\n${log ?? ''}`)
    }

    this.gl = gl
    this.program = program
    this.vao = gl.createVertexArray()
    this.locations.clear()
    for (const name of UNIFORMS) {
      this.locations.set(name, gl.getUniformLocation(program, name))
    }
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
    this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight)
  }

  render(t: number, opts: WovenThreadsOptions): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)
    const loc = (name: UniformName) => this.locations.get(name) ?? null

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform1f(loc('u_time'), t)
    gl.uniform1f(loc('u_period'), opts.period)
    gl.uniform3fv(loc('u_ground'), rgb(opts.ground))
    gl.uniform3fv(loc('u_warp'), rgb(opts.warp))
    gl.uniform3fv(loc('u_weft'), rgb(opts.weft))
    gl.uniform1f(loc('u_pitch'), opts.pitch)
    gl.uniform1f(loc('u_width'), opts.width)
    gl.uniform1f(loc('u_float'), opts.float)
    gl.uniform1f(loc('u_relief'), opts.relief)
    gl.uniform1f(loc('u_light'), opts.light)
    gl.uniform1f(loc('u_crimp'), opts.crimp)
    gl.uniform1f(loc('u_wander'), opts.wander)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.gl
  }

  teardown(): void {
    const gl = this.gl
    if (gl) {
      if (this.program) gl.deleteProgram(this.program)
      if (this.vao) gl.deleteVertexArray(this.vao)
    }
    this.gl = null
    this.program = null
    this.vao = null
    this.locations.clear()
  }
}

/**
 * Mount WovenThreads into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const cloth = createWovenThreads(document.querySelector('#hero')!)
 * cloth.start()
 * // …later
 * cloth.destroy()
 * ```
 */
export function createWovenThreads(
  el: HTMLElement,
  opts: Partial<WovenThreadsOptions> = {}
): EffectHandle {
  return mount<WovenThreadsOptions>(el, opts, {
    defaults: wovenThreadsDefaults,
    create: () => new WovenThreadsSurface()
  })
}

export default createWovenThreads
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

WovenThreads is cloth. Warp threads one way, weft the other, and at every
crossing one of them is on top.

That last clause is the whole thing. Every version of this effect draws two sets
of lines crossing, which is a grid: the threads pass through each other and the
surface has no structure at all. What makes cloth cloth is the interlacing, and
the interlacing is **one comparison per crossing**.

Change that comparison from alternating to shifting and the weave changes with
it. `float: 1` is plain weave, the checkerboard. `float: 2` is a twill, and a
diagonal appears in the surface, which is the single most recognisable thing
about denim. Past four the floats are long enough that it reads as satin:
shiny, and structureless.

Two things besides.

**The threads are round.** Each is shaded by its own cylindrical profile: the
height across a cylinder is the root of one minus the square of the
across-coordinate, and the slope of that is the normal. Flat threads are
stripes.

**The thread underneath is darkened where it passes beneath**, which is the
shadow of the one above it. Without it the interlacing reads as a hard edge
rather than as one thread going under another.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="cloth" style="height: 60vh"></div>

<script type="module">
  import { createWovenThreads } from './beamish/effects/woven-threads/core.js'

  const cloth = createWovenThreads(document.querySelector('#cloth'))
  cloth.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createWovenThreads } from '@/beamish/effects/woven-threads/core'

export function Cloth() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const cloth = createWovenThreads(host.current, { pitch: 13 })
    cloth.start()
    return () => cloth.destroy()
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
import { createWovenThreads } from '@/beamish/effects/woven-threads/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let cloth: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  cloth = createWovenThreads(host.value)
  cloth.start()
})

onBeforeUnmount(() => cloth?.destroy())
</script>

<template>
  <div ref="host" class="cloth" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `ground` | color | `#efece1` | any CSS hex | What shows between the threads. On an open cloth this is most of what you see, so it is doing as much work as either thread colour. Set it dark and a loose weave reads as mesh over a void. |
| `warp` | color | `#f7f5ed` | any CSS hex | The threads running one way. Warp is the set held under tension on the loom, which is why it is the one that runs the length of a bolt. |
| `weft` | color | `#d9d4c4` | any CSS hex | The threads running the other way, passed through the warp by the shuttle. Two slightly different colours is what makes the weave legible: identical ones give a surface whose structure you can only read from the shading. |
| `pitch` | number | `13` | 3 to 60 (looks right between 8 and 22) | Distance from one thread to the next, in CSS pixels. This is the count of the cloth: fine pitches read as a shirt, coarse ones as sacking or canvas. Below about 5 the shading of a round thread has nowhere to happen and the weave flattens into a check. |
| `width` | number | `0.86` | 0.1 to 1 (looks right between 0.7 and 0.95) | Thread width, as a share of the pitch. At 1 the cloth is closed and no ground shows; below about 0.6 it is a gauze and you are mostly looking at the gaps. Real cloth sits near the top of the range because a loom beats the weft up tight. |
| `float` | number | `1` | 1 to 5 | How many crossings a thread floats over before going under, which is the weave itself. 1 is plain weave, the alternating one. 2 and 3 are twills and bring a diagonal with them, which is the single most recognisable thing about denim. Past 4 the floats are long enough that the cloth reads as satin, shiny and structureless. |
| `relief` | number | `0.55` | 0 to 2 | How strongly the round threads are lit by their own profile. At 0 the cloth is flat colour and the weave is only readable as a pattern; this is what makes it read as made of something. |
| `light` | number | `135` | 0 to 360 deg | Where the light comes from. It falls differently on the two thread directions, since each is only lit across itself, so turning it shifts which set of threads is the brighter one. That is a real property of cloth and the reason fabric changes as you turn it. |
| `crimp` | number | `0.45` | 0 to 1 | How dark the thread underneath goes where it passes beneath. This is the shadow of the thread on top. At 0 the interlacing is a hard edge instead of depth, which is the difference between cloth and a woven-looking pattern. |
| `wander` | number | `0.1` | 0 to 0.45 | How far the threads wander from their lines, as a share of the pitch. Small: real cloth is regular, and this is the slack in it rather than a wave. At 0 it is a perfect machine weave, which is a legitimate and very still way to use this. |
| `period` | number | `36` | 8 to 180 s | Seconds for one cycle of the wander. Long, because this is a surface and not an animation. |

## 5. Choosing a cloth

`pitch` is the count. Fine pitches read as a shirt, coarse ones as canvas or
sacking. Below about five CSS pixels the shading of a round thread has nowhere
to happen and the weave flattens into a check, which is the point at which this
stops being worth its cost.

`width` is how tight the cloth is. Real cloth sits near the top of the range,
because a loom beats the weft up tight; below about 0.6 you have a gauze and
you are mostly looking at the gaps, which makes `ground` the dominant colour.

`float` is the weave. Try 1 and 2 side by side once: the diagonal arriving in
the surface from a single changed comparison is the most convincing thing here.

## 6. Light and the two directions

`light` falls differently on the two thread directions, because each thread is
only lit across itself. Turning the light shifts which set of threads is the
brighter one, and at some angles the weave nearly disappears.

That is a real property of cloth and the reason fabric changes as you turn it in
your hands. It is worth sweeping the setting once to find the angle that makes
your weave legible.

## 7. Cost and quiet

Measured at 0.035 mean absolute change per frame on a 0 to 255 scale, and
1.23ms at 640 by 360. It is one of the quietest things here, because the threads
wander rather than travel.

`wander: 0` makes it a perfect machine weave and perfectly still, which is a
legitimate way to use it: a static cloth is a texture, and textures do not need
to move.

## 8. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createWovenThreads` from `useEffect`, `onMounted`, or a `client:*`
island.

## 9. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. The cloth is the subject and the wander is only the air in
the room, so the still frame loses nothing.

## 10. The three mistakes most likely to be made here

1. **No interlacing.** Two sets of lines crossing is a grid. The threads pass
   through each other, the surface has no structure, and no amount of shading
   will rescue it. One comparison per crossing is the entire fix.

2. **Flat threads.** A thread without a round profile is a stripe, and a weave
   of stripes is a tartan.

3. **No crimp.** Then the interlacing is visible as a hard edge rather than as
   depth, and the cloth looks printed rather than woven.

4. **Translating the weave to animate it.** It reads as a backdrop sliding past.
   Cloth moves by its threads wandering along their length, which is what the
   air in a room does to fabric.

5. **A very fine pitch.** Under about five pixels there is no room for the
   profile, the weave flattens, and you are paying for a shader to draw a check.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
