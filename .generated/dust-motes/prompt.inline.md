You are adding **DustMotes** from Beamish to this project.

> Dust hanging in a lit room, built as a field rather than a particle system, with most of it out of focus. Backdrops · effect · MIT.
> https://beamish.ink/effects/dust-motes

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- A field, not a particle system. The frame is a lattice, each cell holds one mote whose position is a function of the cell, a seed and the clock, and a pixel looks only at the nine cells around it. Nothing is stored and nothing is advanced
- That is not an optimisation, it is what makes the item possible here. An array of particles advanced each frame cannot be seeked, so it cannot be recorded; it drifts on a dropped frame, because each position depends on the last; and its cost grows with the count. This way the count is a division rather than a loop, so ten thousand motes cost exactly what a hundred do
- Most motes are out of focus, and that is the clearest difference between dust and snow. A real mote is a few micrometres across, so at any focal distance nearly all of them are blurred smudges and only a handful are sharp
- A blurred mote is drawn both wider and fainter, because a lens spreads the same light over more area. Those two together are what make a wide smudge and a tight point read as the same object at different distances rather than as two different things
- The motes catch the light rather than emitting it, so where one sits in the frame decides how bright it is. Without that the field has no direction and reads as static
- They rise as often as they fall. Dust in a lit room is moved by convection rather than by gravity: it hangs. Falling dust is snow
- Each mote is a gaussian rather than a disc, because a mote has no edge whether it is in focus or not
- Built for a dark ground and declared as one. This is light caught on something, and on a pale ground there is nothing for it to be brighter than
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- Measured at 0.018 mean absolute change per frame on a 0 to 255 scale and 0.37ms at 640 by 360, with a loop seam of exactly zero. The first version drifted 0.7 turns on the vertical and the seam measured 2.59: a time coefficient has to be a whole number of turns over the period or the loop never comes home
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/dust-motes/core.ts`**

```ts
/*
 * DustMotes: Beamish
 * https://beamish.ink/effects/dust-motes
 *
 * Dust in a room, lit from one side. Not a particle system: a field.
 *
 * Every version of this keeps an array of particles, advances each one every
 * frame, and respawns the ones that drift out. That buys you nothing here and
 * costs you three things. It cannot be seeked, so it cannot be recorded. It
 * drifts on a dropped frame, because each position depends on the last. And the
 * cost grows with the count, so a thousand motes is a thousand objects to walk.
 *
 * This is a shader over a lattice instead. The frame is divided into cells, each
 * cell holds one mote at a position that is a function of the cell, a seed and
 * the clock, and a pixel only ever looks at the nine cells around it. Nothing is
 * stored, nothing is advanced, and the count is a division rather than a loop:
 * ten thousand motes cost exactly what a hundred do.
 *
 * Three things make it read as dust rather than as snow:
 *
 *   Motes go in and out of focus. A real one is a few micrometres across and
 *   the depth of field at that scale is tiny, so most of what you see is a
 *   blurred smudge and only a few are sharp. Drawing them all sharp is the
 *   single clearest giveaway, and it is also what makes a field of white dots
 *   read as a screensaver.
 *
 *   They catch the light rather than emit it. A mote is lit from somewhere, so
 *   the ones on the lit side of the frame are bright and the ones away from it
 *   are nearly invisible, which is what gives the air a direction.
 *
 *   They rise and settle rather than falling. Dust in a lit room is moved by
 *   convection, not by gravity: it goes up as often as down, and it hangs.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type DustMotesOptions = BaseOptions & {
  /** The air. What shows where there is no dust. */
  ground: string
  /** The motes. */
  mote: string
  /** Cell size in CSS pixels. One mote per cell, so this is the density. */
  pitch: number
  /** Mote radius, in CSS pixels, for one in perfect focus. */
  size: number
  /** How much of the field is out of focus, 0 to 1. */
  haze: number
  /** Where the light comes from, in degrees. */
  light: number
  /** How strongly the light falls off across the frame, 0 to 1. */
  falloff: number
  /** How far a mote drifts, as a share of the pitch. */
  drift: number
  /** Share of motes that are bright enough to read as sharp, 0 to 1. */
  sparkle: number
  /** Seed for the field. The same seed gives the same air. */
  seed: number
  /** Seconds for one cycle of the drift. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const dustMotesDefaults: DustMotesOptions = {
  ground: '#17171c',
  mote: '#fdf6e4',
  pitch: 34,
  size: 1.5,
  haze: 0.72,
  light: 125,
  falloff: 0.65,
  drift: 0.75,
  sparkle: 0.12,
  seed: 7,
  period: 44,
  reducedMotionTime: 11
}

// beamish:shader-begin shaders/dust-motes.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/dust-motes.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * DustMotes: dust in a room, as a field rather than a particle system.
 *
 * The frame is a lattice. Each cell holds one mote whose position is a function
 * of the cell, a seed and the clock, and a pixel looks only at the nine cells
 * around it. Nothing is stored and nothing is advanced, so the whole thing is
 * pure in t and the count is a division rather than a loop: ten thousand motes
 * cost what a hundred do.
 *
 * The depth of field is the part that matters. A real mote is a few micrometres
 * across, so at any focal distance nearly all of them are blurred smudges and
 * only a handful are sharp. Draw them all sharp and you have snow. Here each
 * mote carries a focus taken from its own hash, which sets both how wide it is
 * drawn and how faint: a blurred mote is spread over more area and so is dimmer,
 * which is what a lens does and what makes the two read as the same object at
 * different distances.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_mote;
uniform float u_pitch;
uniform float u_size;
uniform float u_haze;
uniform float u_light;
uniform float u_falloff;
uniform float u_drift;
uniform float u_sparkle;
uniform float u_seed;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  return vec2(hash12(p + u_seed), hash12(p + u_seed + 37.19));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);

  float pitch = max(u_pitch, 4.0);
  vec2 cell = cssPx / pitch;
  vec2 id = floor(cell);

  float phase = TAU * u_time / max(u_period, 0.001);

  /*
   * The light. A mote catches light rather than emitting it, so where it sits
   * in the frame decides how bright it is: the ones on the lit side read, the
   * ones away from it are nearly gone. Without this the field has no direction
   * and reads as static.
   */
  float a = radians(u_light);
  vec2 towards = vec2(cos(a), sin(a));
  vec2 fromCentre = (cssPx - cssRes * 0.5) / shortSide;
  float lit = 1.0 - u_falloff * (0.5 - dot(fromCentre, towards)) ;

  float ink = 0.0;

  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 nid = id + vec2(float(ox), float(oy));
      vec2 rnd = hash22(nid);

      /*
       * Where this cell's mote sits. It drifts on a closed path, so after one
       * period every mote is back where it started and the loop closes, and it
       * rises as often as it falls: dust in a lit room is moved by convection
       * rather than by gravity, and it hangs.
       */
      /*
       * One turn across, two turns up, both whole numbers over the period, so
       * every mote is back where it started when the loop comes round. The
       * first version used 0.7 turns on the vertical, which is a figure that
       * never returns: the seam measured 2.59 against a requirement of zero.
       */
      float wobble = phase + rnd.x * TAU;
      vec2 at = nid + 0.5 + (rnd - 0.5) * 0.8 +
        vec2(cos(wobble), sin(phase * 2.0 + rnd.y * TAU)) * u_drift * 0.5;

      /*
       * How far out of focus this one is. Most are, because at the scale of a
       * mote the depth of field is almost nothing. A blurred mote is spread
       * over more area and is therefore fainter, which is what a lens does: the
       * two together are what make a wide smudge and a tight point read as the
       * same object at different distances.
       */
      float focus = hash12(nid + 11.3);
      float blurred = u_haze * focus;
      float radius = (u_size / pitch) * (1.0 + blurred * 7.0);
      float brightness = 1.0 / (1.0 + blurred * 9.0);

      // A few are bright enough to read as sharp specks. Dust in a sunbeam does
      // this, and it is most of what makes the air look occupied.
      if (hash12(nid + 73.1) < u_sparkle) brightness *= 2.6;

      float d = length(cell - at);
      // A gaussian rather than a disc: a mote has no edge, in or out of focus.
      ink += exp(-(d * d) / max(radius * radius, 1e-6)) * brightness;
    }
  }

  vec3 col = u_ground + u_mote * clamp(ink, 0.0, 4.0) * max(lit, 0.0) * 0.5;

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
  'u_mote',
  'u_pitch',
  'u_size',
  'u_haze',
  'u_light',
  'u_falloff',
  'u_drift',
  'u_sparkle',
  'u_seed'
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
  if (!shader) throw new Error('DustMotes: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`DustMotes: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class DustMotesSurface implements Surface<DustMotesOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('DustMotes needs a canvas')
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
    if (!gl) throw new Error('DustMotes needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('DustMotes: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`DustMotes: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: DustMotesOptions): void {
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
    gl.uniform3fv(loc('u_mote'), rgb(opts.mote))
    gl.uniform1f(loc('u_pitch'), opts.pitch)
    gl.uniform1f(loc('u_size'), opts.size)
    gl.uniform1f(loc('u_haze'), opts.haze)
    gl.uniform1f(loc('u_light'), opts.light)
    gl.uniform1f(loc('u_falloff'), opts.falloff)
    gl.uniform1f(loc('u_drift'), opts.drift)
    gl.uniform1f(loc('u_sparkle'), opts.sparkle)
    gl.uniform1f(loc('u_seed'), opts.seed)

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
 * Mount DustMotes into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const air = createDustMotes(document.querySelector('#hero')!)
 * air.start()
 * // …later
 * air.destroy()
 * ```
 */
export function createDustMotes(
  el: HTMLElement,
  opts: Partial<DustMotesOptions> = {}
): EffectHandle {
  return mount<DustMotesOptions>(el, opts, {
    defaults: dustMotesDefaults,
    create: () => new DustMotesSurface()
  })
}

export default createDustMotes
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

DustMotes is dust hanging in a lit room. It is a **field**, not a particle
system, and that is the most important thing about it.

Every version of this keeps an array of particles, advances each one every
frame, and respawns the ones that drift out. That costs three things and buys
nothing. It cannot be seeked, so it cannot be recorded. It drifts on a dropped
frame, because each position depends on the last. And its cost grows with the
count, so a thousand motes is a thousand objects to walk.

This is a shader over a lattice. The frame is divided into cells, each cell
holds one mote at a position that is a function of the cell, a seed and the
clock, and a pixel only ever looks at the nine cells around it. Nothing is
stored and nothing is advanced, so **the count is a division rather than a
loop**: ten thousand motes cost exactly what a hundred do.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="room" style="height: 70vh"></div>

<script type="module">
  import { createDustMotes } from './beamish/effects/dust-motes/core.js'

  const air = createDustMotes(document.querySelector('#room'))
  air.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createDustMotes } from '@/beamish/effects/dust-motes/core'

export function Air() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const air = createDustMotes(host.current, { pitch: 34 })
    air.start()
    return () => air.destroy()
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
import { createDustMotes } from '@/beamish/effects/dust-motes/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let air: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  air = createDustMotes(host.value)
  air.start()
})

onBeforeUnmount(() => air?.destroy())
</script>

<template>
  <div ref="host" class="room" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `ground` | color | `#17171c` | any CSS hex | The air, and what shows where there is no dust. Dark, because everything drawn here is light caught on something: on a pale ground the motes have nothing to be brighter than and the whole thing disappears. |
| `mote` | color | `#fdf6e4` | any CSS hex | The motes. Warm rather than white, because the light catching them came from somewhere and nothing in a room is lit by a pure white source. |
| `pitch` | number | `34` | 8 to 160 px (looks right between 22 and 60) | Cell size, and so the density: one mote per cell. A fine pitch costs nothing extra per pixel, because a pixel always looks at the same nine cells, so this is the one density control in the library that is free to turn up. Below about 15 the motes start to overlap into a fog. |
| `size` | number | `1.5` | 0.3 to 8 px | Radius of a mote in perfect focus, in pixels. Small: a sharp mote is a speck, and it is the blurred ones that take up room. Raising this makes the sharp ones into dots, which is the look of snow. |
| `haze` | number | `0.72` | 0 to 1 (looks right between 0.5 and 0.9) | How much of the field is out of focus. High, because at the scale of a mote the depth of field is almost nothing and nearly everything you see is a smudge. At 0 every mote is sharp, which is the single clearest way to make dust look like a screensaver. |
| `light` | number | `125` | 0 to 360 deg | Where the light comes from. It decides which side of the frame the dust is visible on, which is what gives the air a direction. Pair it with LightShafts set to the same angle and the motes are in the beam. |
| `falloff` | number | `0.65` | 0 to 1 | How hard the light falls off across the frame. At 0 the dust is evenly lit everywhere, which reads as a texture rather than as a room with a window in it. |
| `drift` | number | `0.75` | 0 to 2 | How far a mote wanders, as a share of the cell. It travels a closed path, so it comes back: dust hangs rather than going anywhere. At 0 it is a still field, which is a legitimate way to use this and very quiet. |
| `sparkle` | number | `0.12` | 0 to 1 | Share of motes bright enough to read as sharp specks. A few, and they are most of what makes the air look occupied: it is the thing you notice in a sunbeam. Past about a third it stops being dust and becomes glitter. |
| `seed` | number | `7` | 0 to 9999 | Seed for the field. The same seed gives the same air, so a recording and a live page match mote for mote. |
| `period` | number | `44` | 10 to 180 s | Seconds for one cycle of the drift. Long, because dust moves slowly and a backdrop has to survive being ignored. |

## 5. Three things that make it dust and not snow

**Most of it is out of focus.** A real mote is a few micrometres across, so at
any focal distance nearly all of them are blurred smudges and only a handful are
sharp. Drawing them all sharp is the single clearest way to turn dust into a
screensaver.

A blurred mote here is drawn both **wider and fainter**, because a lens spreads
the same light over more area. Those two together are what make a wide smudge
and a tight point read as the same object at different distances, rather than as
two different things.

**It catches the light rather than emitting it.** Where a mote sits in the frame
decides how bright it is, which is what gives the air a direction. Without it
the field is evenly lit everywhere and reads as a texture.

**It rises as often as it falls.** Dust in a lit room is moved by convection,
not gravity: it hangs. Falling dust is snow.

## 6. It needs a dark ground

Everything drawn here is light caught on something. On a pale ground the motes
have nothing to be brighter than and the effect disappears entirely, which is
why it declares `ground: "dark"`.

Set `ground` to whatever your dark section actually is, rather than leaving the
default: the motes are added to it, so a mismatch shows as a rectangle.

## 7. Pairing it with LightShafts

Give both the same `light` angle and the motes are in the beam. That is the
combination worth reaching for, and it is also the honest one: LightShafts draws
its own motes inside the beams for exactly this reason, and turning those down
while this one carries the air gives you dust through the whole room rather than
only where the light is.

## 8. Density is free

`pitch` is the cell size and so the density, and a finer pitch costs nothing
extra per pixel, because a pixel always looks at the same nine cells. It is the
one density control in this library that is free to turn up.

Below about 15 pixels the motes overlap into a fog, which is a different and
quite nice effect but no longer dust.

## 9. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createDustMotes` from `useEffect`, `onMounted`, or a `client:*`
island.

## 10. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. A still field of dust is a photograph of a room, which is a
complete image: `drift: 0` gives the same thing permanently.

## 11. The three mistakes most likely to be made here

1. **An array of particles.** It cannot be seeked, so it cannot be recorded; it
   drifts on a dropped frame; and it costs more as you add motes. A lattice has
   none of those properties and is less code.

2. **Every mote sharp.** It is snow. At the scale of a mote the depth of field
   is almost nothing, and most of what you can see is a smudge.

3. **Blurring without dimming.** A lens spreads the same light over more area,
   so a blurred mote must also be fainter. Without that the smudges read as
   bigger motes rather than as nearer ones.

4. **Dust that falls.** Convection moves dust, not gravity. It should go up as
   often as down and mostly just hang.

5. **A time coefficient that is not a whole number of turns.** The first version
   here drifted 0.7 turns on the vertical and the loop seam measured 2.59 where
   it has to be 0. One turn across and two turns up both come home.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
