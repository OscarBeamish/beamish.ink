You are adding **MoireScreens** from Beamish to this project.

> Two halftone screens laid over each other at a small angle, with the fringes left to emerge rather than drawn. Backdrops · effect · MIT.
> https://beamish.ink/effects/moire-screens

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Nothing in the shader draws a fringe or knows where one is. There are two regular screens and the interference is what comes out, which is why the fringes behave correctly when the angle changes: the spacing of the beat goes as the pitch over twice the sine of half the angle, so it runs away towards infinity as the screens line up
- The anti-aliasing is load-bearing rather than a polish pass. A regular screen at this frequency aliases against the pixel grid, and that aliasing is itself a moire, so the fringes would be partly the screens beating with the display rather than with each other and the effect would be a rendering artefact wearing the costume of an optical one. Each screen's coverage is computed analytically and softened by exactly one pixel's footprint, measured with fwidth
- The inks multiply rather than add, because that is what ink does: two transparent layers pass the product of what each passes. Added instead, the overlaps saturate and the fringes flatten at the dark end, which is the difference between reading as print and reading as two gels on a lightbox
- Element size is derived from coverage properly, through the area of a disc in a square cell for dots and half the covered width for lines, so `coverage` means the same thing in both modes
- This is a printing fault induced on purpose, and the reason process colour is screened at 15, 45, 75 and 105 degrees is to avoid it. Set `separation` to 30 for the industry's answer and 4 for the thing every printer has had to explain to a client
- The drift is a sine rather than a continuous turn, so the loop closes. A screen turning continuously passes through the angles where the beat vanishes and comes out the other side, which is a busier effect and a different one
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- Measured at 0.103 mean absolute change per frame on a 0 to 255 scale at the default drift, which is in line with MeshGradient at 0.091, and 1.1ms at 640 by 360. The change per frame is exactly linear in the drift, so halving one halves the other
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/moire-screens/core.ts`**

```ts
/*
 * MoireScreens: Beamish
 * https://beamish.ink/effects/moire-screens
 *
 * Two halftone screens laid over each other at a small angle, beating. The
 * fringes are not drawn: they are what you get when two regular patterns
 * interfere, and the only things in the shader are the two screens.
 *
 * This is a printing fault, induced on purpose. It is the reason process colour
 * is screened at fifteen, forty-five, seventy-five and a hundred and five
 * degrees: those angles are chosen so the four screens do not do this. Set
 * `separation` to 30 and you have the industry's answer; set it to 4 and you
 * have the thing every printer has had to explain to a client.
 *
 * The important part of the implementation is the anti-aliasing, and it is not
 * a polish pass. A regular screen at high frequency aliases against the pixel
 * grid, and that aliasing is itself a moire: the fringes you would see would
 * be partly the screens beating with the display rather than with each other.
 * The whole effect would be a rendering artefact wearing the costume of an
 * optical one. So each screen's coverage is computed analytically, with the
 * edge softened by exactly the width of one pixel's footprint in screen space,
 * and what is left on the canvas is the real interference.
 *
 * The inks multiply rather than add, because that is what ink does: two
 * transparent layers pass the product of what each passes. Added instead, the
 * overlaps saturate and the fringes flatten out at the dark end.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type MoireScreensOptions = BaseOptions & {
  /** The sheet. */
  paper: string
  /** The first screen's ink. */
  first: string
  /** The second screen's ink. */
  second: string
  /** Distance between screen elements, in CSS pixels. */
  pitch: number
  /** Share of the sheet each screen covers, 0 to 1. */
  coverage: number
  /** Angle between the two screens, in degrees. This sets the fringe spacing. */
  separation: number
  /** How the first screen is set in the frame, in degrees. */
  angle: number
  /** Degrees the second screen turns over one period. */
  drift: number
  /** Fine lines rather than dots. */
  lines: boolean
  /** Difference in pitch between the screens, as a share of `pitch`. */
  detune: number
  /** Seconds for one cycle of the drift. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const moireScreensDefaults: MoireScreensOptions = {
  paper: '#fbfaf4',
  first: '#36362f',
  second: '#c44400',
  pitch: 14,
  coverage: 0.3,
  separation: 3.2,
  angle: 15,
  drift: 0.8,
  lines: false,
  detune: 0.04,
  period: 28,
  reducedMotionTime: 10
}

// beamish:shader-begin shaders/moire-screens.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/moire-screens.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * MoireScreens: two halftone screens at a small angle, beating.
 *
 * The fringes are not in this shader. Nothing here draws a fringe, or knows
 * where one is: there are two regular screens, and the interference is what
 * comes out. That is the whole point of building it this way rather than
 * drawing the pattern directly, and it is why the fringes behave correctly when
 * the angle changes. A small angle gives enormous fringes because that is what
 * the geometry says: the spacing of the beat goes as the pitch over twice the
 * sine of half the angle, so it runs away towards infinity as the screens line
 * up.
 *
 * The anti-aliasing is load-bearing. A regular screen at this frequency aliases
 * against the pixel grid, and that aliasing is itself a moire, so the fringes
 * would be partly the screens beating with the display rather than with each
 * other. Each screen's coverage is computed analytically and its edge softened
 * by exactly one pixel's footprint, measured with fwidth, which leaves the real
 * interference and nothing else.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_first;
uniform vec3  u_second;
uniform float u_pitch;
uniform float u_coverage;
uniform float u_separation;
uniform float u_angle;
uniform float u_drift;
uniform float u_lines;
uniform float u_detune;

out vec4 fragColor;

const float TAU = 6.28318530718;

mat2 turn(float degrees) {
  float a = radians(degrees);
  return mat2(cos(a), -sin(a), sin(a), cos(a));
}

/*
 * One screen's ink coverage at this pixel.
 *
 * The distance to the nearest element is worked out in pixels, and the edge is
 * softened by the footprint of this pixel in that same measure, which is what
 * fwidth gives. Hard-edged instead, the screen aliases, and the aliasing is a
 * moire of its own against the display grid: the effect would be reporting on
 * the monitor rather than on the two screens.
 */
float screenAt(vec2 cssPx, float pitch, float degrees, float radius, float asLines) {
  vec2 q = (turn(-degrees) * cssPx) / max(pitch, 0.5);

  float d;
  if (asLines > 0.5) {
    // A line screen measures across the lines only, so the beat is in one axis.
    d = abs(fract(q.x) - 0.5) * max(pitch, 0.5);
  } else {
    vec2 cell = fract(q) - 0.5;
    d = length(cell) * max(pitch, 0.5);
  }

  float aa = max(fwidth(d), 0.0001);
  return clamp(smoothstep(radius + aa, radius - aa, d), 0.0, 1.0);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 centred = cssPx - cssRes * 0.5;

  /*
   * The drift is a sine of the phase, so the second screen returns to where it
   * started and the loop closes. A screen turning continuously would pass
   * through the angles at which the beat vanishes and come out the other side,
   * which is a different and much busier effect.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  float second = u_angle + u_separation + u_drift * sin(phase);

  /*
   * Element radius from coverage. For dots the area of a disc in a square cell
   * is pi r squared over pitch squared, so the radius is the pitch times the
   * root of coverage over pi. For lines it is simply half the covered width.
   * Doing this properly is what makes coverage mean the same thing in both.
   */
  float pitchA = max(u_pitch, 0.5);
  float pitchB = pitchA * (1.0 + u_detune);
  float cover = clamp(u_coverage, 0.0, 1.0);
  float radiusA = u_lines > 0.5 ? pitchA * cover * 0.5 : pitchA * sqrt(cover / 3.14159265);
  float radiusB = u_lines > 0.5 ? pitchB * cover * 0.5 : pitchB * sqrt(cover / 3.14159265);

  float a = screenAt(centred, pitchA, u_angle, radiusA, u_lines);
  float b = screenAt(centred, pitchB, second, radiusB, u_lines);

  /*
   * Ink multiplies. Two transparent layers pass the product of what each
   * passes, so the sheet under both is the product of the two transmittances.
   * Added instead, the overlaps saturate and the fringes flatten at the dark
   * end, which is the difference between this reading as print and reading as
   * two translucent screens on a lightbox.
   */
  vec3 col = u_paper;
  col *= mix(vec3(1.0), u_first / max(u_paper, vec3(0.001)), a);
  col *= mix(vec3(1.0), u_second / max(u_paper, vec3(0.001)), b);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_paper',
  'u_first',
  'u_second',
  'u_pitch',
  'u_coverage',
  'u_separation',
  'u_angle',
  'u_drift',
  'u_lines',
  'u_detune'
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
  if (!shader) throw new Error('MoireScreens: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`MoireScreens: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class MoireScreensSurface implements Surface<MoireScreensOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('MoireScreens needs a canvas')
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
    if (!gl) throw new Error('MoireScreens needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('MoireScreens: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`MoireScreens: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: MoireScreensOptions): void {
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
    gl.uniform3fv(loc('u_paper'), rgb(opts.paper))
    gl.uniform3fv(loc('u_first'), rgb(opts.first))
    gl.uniform3fv(loc('u_second'), rgb(opts.second))
    gl.uniform1f(loc('u_pitch'), opts.pitch)
    gl.uniform1f(loc('u_coverage'), opts.coverage)
    gl.uniform1f(loc('u_separation'), opts.separation)
    gl.uniform1f(loc('u_angle'), opts.angle)
    gl.uniform1f(loc('u_drift'), opts.drift)
    gl.uniform1f(loc('u_lines'), opts.lines ? 1 : 0)
    gl.uniform1f(loc('u_detune'), opts.detune)

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
 * Mount MoireScreens into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const beat = createMoireScreens(document.querySelector('#hero')!)
 * beat.start()
 * // …later
 * beat.destroy()
 * ```
 */
export function createMoireScreens(
  el: HTMLElement,
  opts: Partial<MoireScreensOptions> = {}
): EffectHandle {
  return mount<MoireScreensOptions>(el, opts, {
    defaults: moireScreensDefaults,
    create: () => new MoireScreensSurface()
  })
}

export default createMoireScreens
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
    const dt = Math.min(stamp - lastStamp, 100) / 1000 // clamp tab-switch spikes
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

MoireScreens lays two halftone screens over each other at a small angle and
lets them beat.

The fringes are not drawn. Nothing in the shader draws a fringe or knows where
one is: there are two regular screens, and the interference is what comes out.
That is the point of building it this way rather than drawing the pattern, and
it is why the fringes behave correctly when the angle changes. The spacing of
the beat is the pitch over twice the sine of half the angle, so it runs away
towards infinity as the screens line up: ten degrees gives a tight rosette, two
gives fringes the size of the frame, and zero gives nothing at all.

This is a printing fault, induced on purpose. It is the reason process colour is
screened at fifteen, forty-five, seventy-five and a hundred and five degrees:
those angles are chosen so four screens do not do this. Set `separation` to 30
and you have the industry's answer. Set it to 4 and you have the thing every
printer has had to explain to a client.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="hero" style="height: 70vh"></div>

<script type="module">
  import { createMoireScreens } from './beamish/effects/moire-screens/core.js'

  const beat = createMoireScreens(document.querySelector('#hero'))
  beat.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createMoireScreens } from '@/beamish/effects/moire-screens/core'

export function Beat() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const beat = createMoireScreens(host.current, { separation: 3.2 })
    beat.start()
    return () => beat.destroy()
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
import { createMoireScreens } from '@/beamish/effects/moire-screens/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let beat: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  beat = createMoireScreens(host.value)
  beat.start()
})

onBeforeUnmount(() => beat?.destroy())
</script>

<template>
  <div ref="host" class="beat" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The sheet both screens are printed on, and what shows where neither covers. |
| `first` | color | `#36362f` | any CSS hex | The first screen's ink. Since the two multiply, this is the colour the sheet takes where only this screen covers. |
| `second` | color | `#c44400` | any CSS hex | The second screen's ink. Two different inks make the fringes read as colour as well as tone, which is what makes the beat visible at low coverage. The same colour twice is the purer demonstration and the duller picture. |
| `pitch` | number | `14` | 2 to 40 (looks right between 8 and 18) | Distance between screen elements, in CSS pixels. Fine pitches give large fringes for a given angle and read as an optical event; coarse ones read as two patterns you can see individually. It is also the one setting that decides what this costs to ship: a screen is high-frequency detail across the whole frame, so halving the pitch roughly quadruples the dot count and the video with it. At 10 the take would not fit in the repo's budget at any frame rate worth watching; at 14 it does, and the dots read more clearly as dots. Below about 3 the screen is at the limit of what a display can resolve and the effect starts depending on the device. |
| `coverage` | number | `0.3` | 0.02 to 0.98 (looks right between 0.3 and 0.6) | Share of the sheet each screen covers. The fringes are strongest near a half, because that is where a small change in overlap makes the biggest difference to how much paper is left. At the extremes there is either nothing to overlap or nothing left uncovered. |
| `separation` | number | `3.2` | 0 to 45 (looks right between 1 and 12) | The angle between the two screens, and the control that matters. It sets the fringe spacing through the pitch over twice the sine of half of it, so the relationship is violently non-linear: 10 degrees gives a tight rosette, 2 gives fringes the size of the frame, and 0 gives no beat at all because the screens are in register. |
| `angle` | number | `15` | 0 to 90 deg | How the first screen is set in the frame. It does not affect the beat at all, only which way the whole thing is turned. 15 is where a printer would put the first screen of a four-colour job. |
| `drift` | number | `0.8` | 0 to 20 deg (looks right between 0.4 and 2) | Degrees the second screen turns over one period, and the one setting that decides how busy this is. Tiny numbers are enough, because the fringe spacing depends so sharply on the angle that a degree sweeps the fringes right across the frame. It is also exactly linear in the change per frame: measured at 0.0514, 0.1028 and 0.2055 for 0.4, 0.8 and 1.6 degrees, so this is the dial to turn if it is too much. At 0 it is a still image, which is a perfectly good way to use this. |
| `lines` | boolean | `false` | `true` · `false` | Fine lines rather than dots. A line screen beats in one axis only, so the fringes are bands rather than a rosette, which is the version you see when a striped shirt is photographed. Dots are the print version. |
| `detune` | number | `0.04` | -0.3 to 0.3 | Difference in pitch between the two screens, as a share of the first. The other way to make a beat: two screens at the same angle but slightly different pitch give straight fringes rather than turned ones. A little of both is more interesting than either alone. |
| `period` | number | `28` | 12 to 180 s | Seconds for one cycle of the drift. Long, because the fringes move much faster than the angle does and a backdrop has to survive being ignored. |

## 5. The anti-aliasing is the effect

This is the part that would be easy to treat as a polish pass and is actually
load-bearing.

A regular screen at this frequency aliases against the pixel grid, and **that
aliasing is itself a moire**. Draw the screens with hard edges and the fringes
you see are partly the screens beating with the display rather than with each
other: the effect becomes a rendering artefact wearing the costume of an optical
one, and it changes when you change monitor.

So each screen's coverage is computed analytically, and its edge is softened by
exactly the width of one pixel's footprint in screen space, which is what
`fwidth` gives. What is left on the canvas is the real interference.

## 6. Do not put text on it

This is the loudest thing in the library and it is loud on purpose: a screen at
thirty per cent coverage is a field of hard-edged dots, and a moire is by
definition a pattern that draws the eye. Nothing is readable over it.

Use it as a full-bleed panel, a section divider, a plate between blocks of
copy. If you need it behind something, drop `coverage` to around 0.12 and raise
`pitch`, which leaves the fringes and takes away most of the ink.

## 7. Two ways to make a beat

`separation` turns the second screen, which gives fringes that run at an angle
to both.

`detune` changes its pitch instead, which gives straight fringes parallel to the
screens. Two screens at the same angle and slightly different pitch is the other
half of the phenomenon and it looks quite different.

A little of both is more interesting than either alone, which is why the
defaults have some of each.

## 8. Cost and how busy it is

Measured at 0.103 mean absolute change per frame on a 0 to 255 scale, which is
in line with MeshGradient at 0.091, and 1.1ms at 640 by 360.

The change per frame is **exactly linear in `drift`**: 0.0514, 0.1028 and 0.2055
for 0.4, 0.8 and 1.6 degrees. If it is too busy, that is the dial, and halving
it halves the motion precisely.

## 9. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createMoireScreens` from `useEffect`, `onMounted`, or a `client:*`
island.

## 10. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For this item that matters more than most. A drifting moire is exactly the kind
of high-contrast, large-scale movement that triggers discomfort, and the still
frame loses nothing: the fringes are the subject and they are all there in one
frame.

## 11. The three mistakes most likely to be made here

1. **Hard-edged screens.** They alias, the aliasing is its own moire against the
   display, and the effect ends up reporting on the monitor. The edge has to be
   softened by one pixel's footprint, no more and no less.

2. **Adding the inks instead of multiplying them.** The overlaps saturate and
   the fringes flatten at the dark end. Two transparent layers pass the product
   of what each passes.

3. **A large `separation`.** Past about fifteen degrees the beat is a fine
   rosette and the effect looks like a texture. The interesting range is one to
   nine.

4. **Putting copy on it.** It is the loudest item here. That is not a defect; it
   is what a moire is.

5. **A fine `pitch` on a high-density display.** Below about three CSS pixels
   the screen is at the limit of what the device can resolve and the result
   starts to depend on the device, which is the one thing this item is built to
   avoid.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
