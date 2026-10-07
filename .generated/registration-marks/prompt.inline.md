You are adding **RegistrationMarks** from Beamish to this project.

> The marks a printer puts outside the trim, with the plates slightly out of register and drifting. Backdrops · effect · MIT.
> https://beamish.ink/effects/registration-marks

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- A registration mark is a ring with a cross through it, and the arms run past the ring on all four sides. That is not a style: the ring reads rotation and the arms read translation, so a printer can judge both through a loupe at once
- The subject is the error. Three plates, each drifting on its own closed orbit, which is what a press operator is looking for when they pull a sheet and hold it up. At spread 0 it is a sheet in perfect register, which is the correct answer and much the duller picture
- The inks multiply. Where all three plates land together the mark goes nearly black, and where they have come apart you see three coloured marks beside each other, which is exactly how misregistration announces itself. Added instead, that difference is lost
- Everything is a signed distance in CSS pixels, softened by one pixel's footprint. That is not for looks: these are hairlines moving by fractions of a pixel, and a hairline without anti-aliasing crawls between whole pixels as it drifts. The sub-pixel movement is the entire subject, so it has to be the thing that survives
- The plates orbit rather than wander, a third of a turn apart, so after one period every plate is back where it started and the loop closes. A press drifts because something is turning
- The colour bar along the foot is the other half of what a printer reads off a sheet: one solid patch per plate, for a densitometer
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- Measured at 0.023 mean absolute change per frame on a 0 to 255 scale, which makes it the quietest backdrop here after PaperGrain, and 0.55ms at 640 by 360. Nearly all of the frame is bare paper
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/registration-marks/core.ts`**

```ts
/*
 * RegistrationMarks: Beamish
 * https://beamish.ink/effects/registration-marks
 *
 * The marks a printer puts outside the trim so the plates can be lined up, with
 * the plates very slightly out of register and drifting.
 *
 * A registration mark is a ring with a cross through it, and the cross runs
 * past the ring on all four sides. That is not decoration: the ring tells you
 * about rotation and the arms tell you about translation, and you can read both
 * at a glance through a loupe. Each ink gets its own set, printed in its own
 * colour, and when the press is right they sit exactly on top of one another
 * and read as one black mark.
 *
 * So the whole subject of this is the error. Three plates, each offset by a
 * fraction of a pixel to a few pixels, drifting on closed orbits: what you see
 * is the thing a printer is looking for when they pull a sheet and hold it up.
 * At `spread: 0` it is a sheet in perfect register, which is both the correct
 * answer and much the duller picture.
 *
 * Two details carry it. The inks multiply, so where all three plates land
 * together the mark goes nearly black and where they have come apart you see
 * the three colours separately, which is exactly how misregistration announces
 * itself. And every shape is drawn as a signed distance and softened by one
 * pixel's footprint, because a hairline rule that is not anti-aliased crawls as
 * it moves, and sub-pixel drift is the entire effect.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type RegistrationMarksOptions = BaseOptions & {
  /** The sheet. */
  paper: string
  /** The first plate. */
  first: string
  /** The second plate. */
  second: string
  /** The third plate. */
  third: string
  /** Radius of a mark's ring, in CSS pixels. */
  size: number
  /** Thickness of the rules, in CSS pixels. */
  weight: number
  /** How far the arms run past the ring, as a share of the radius. */
  arms: number
  /** How far the marks sit in from the edge, as a share of the short side. */
  margin: number
  /** Worst misregistration, in CSS pixels. */
  spread: number
  /** Height of the colour bar along the foot, in CSS pixels. 0 for none. */
  bar: number
  /** Seconds for one cycle of the drift. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const registrationMarksDefaults: RegistrationMarksOptions = {
  paper: '#fbfaf4',
  first: '#1b6f8c',
  second: '#c44400',
  third: '#36362f',
  size: 17,
  weight: 1.4,
  arms: 1.8,
  margin: 0.13,
  spread: 3.2,
  bar: 18,
  period: 32,
  reducedMotionTime: 8
}

// beamish:shader-begin shaders/registration-marks.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/registration-marks.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * RegistrationMarks: the marks outside the trim, with the plates out of
 * register.
 *
 * Everything is a signed distance in CSS pixels, turned into coverage with a
 * softening of exactly one pixel's footprint. That is not for looks. These are
 * hairlines moving by fractions of a pixel, and a hairline without
 * anti-aliasing crawls between whole pixels as it drifts: the sub-pixel
 * movement is the entire subject here, so it has to be the thing that survives.
 *
 * The inks multiply. Where the three plates land together the mark goes nearly
 * black; where they have come apart you see three coloured marks beside each
 * other. That difference is precisely how misregistration announces itself on a
 * real sheet, and adding the inks instead loses it.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_first;
uniform vec3  u_second;
uniform vec3  u_third;
uniform float u_size;
uniform float u_weight;
uniform float u_arms;
uniform float u_margin;
uniform float u_spread;
uniform float u_bar;

out vec4 fragColor;

const float TAU = 6.28318530718;

/* A rule of a given half-length and half-width, as a signed distance. */
float rule(vec2 p, vec2 extent) {
  // Not half, and the swatch below is not patch. Both are reserved words in
  // GLSL, held for types the language does not have, and both fail at compile
  // rather than at run time.
  vec2 d = abs(p) - extent;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

/*
 * One registration mark: a ring with a cross through it, the arms running past
 * the ring on all four sides. The ring reads rotation and the arms read
 * translation, which is why the real thing has both.
 */
float markAt(vec2 p, float radius, float weight) {
  float ring = abs(length(p) - radius) - weight * 0.5;
  float reach = radius * max(u_arms, 1.0);
  float across = rule(p, vec2(reach, weight * 0.5));
  float down = rule(p, vec2(weight * 0.5, reach));
  return min(ring, min(across, down));
}

/* One plate's ink coverage at this pixel, marks and bar together. */
float plateAt(vec2 cssPx, vec2 cssRes, vec2 offset, float slot, float slots) {
  vec2 p = cssPx - offset;
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);
  vec2 inset = cssRes * 0.5 - vec2(u_margin * shortSide);

  // Four marks, one at each corner of the inset rectangle.
  vec2 centred = p - cssRes * 0.5;
  vec2 folded = abs(centred) - inset;
  float d = markAt(folded, max(u_size, 1.0), max(u_weight, 0.3));

  /*
   * The colour bar along the foot: one solid patch per plate, side by side, the
   * way a press sheet carries them for a densitometer. They are the other half
   * of what a printer reads off the sheet.
   */
  if (u_bar > 0.5) {
    float barWidth = min(cssRes.x * 0.1, 58.0);
    float gap = barWidth * 0.18;
    float total = slots * barWidth + (slots - 1.0) * gap;
    float left = cssRes.x * 0.5 - total * 0.5 + slot * (barWidth + gap);
    vec2 swatch = p - vec2(left + barWidth * 0.5, cssRes.y - u_margin * shortSide * 0.45);
    d = min(d, rule(swatch, vec2(barWidth * 0.5, u_bar * 0.5)));
  }

  float aa = max(fwidth(d), 0.0001);
  return clamp(smoothstep(aa, -aa, d), 0.0, 1.0);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  // y down, so the foot of the sheet is the foot of the frame.
  cssPx.y = cssRes.y - cssPx.y;

  /*
   * Each plate drifts on a closed orbit, a third of a turn apart, so after one
   * period every plate is back where it started and the loop closes. Circles
   * rather than a wander: a press drifts because something is turning.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  vec2 a = vec2(cos(phase), sin(phase * 2.0)) * u_spread * 0.5;
  vec2 b = vec2(cos(phase + 2.094), sin(phase * 2.0 + 1.047)) * u_spread;
  vec2 c = vec2(cos(phase + 4.189), sin(phase * 2.0 + 3.142)) * u_spread * 0.7;

  float ia = plateAt(cssPx, cssRes, a, 0.0, 3.0);
  float ib = plateAt(cssPx, cssRes, b, 1.0, 3.0);
  float ic = plateAt(cssPx, cssRes, c, 2.0, 3.0);

  vec3 col = u_paper;
  col *= mix(vec3(1.0), u_first / max(u_paper, vec3(0.001)), ia);
  col *= mix(vec3(1.0), u_second / max(u_paper, vec3(0.001)), ib);
  col *= mix(vec3(1.0), u_third / max(u_paper, vec3(0.001)), ic);

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
  'u_third',
  'u_size',
  'u_weight',
  'u_arms',
  'u_margin',
  'u_spread',
  'u_bar'
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
  if (!shader) throw new Error('RegistrationMarks: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`RegistrationMarks: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class RegistrationMarksSurface implements Surface<RegistrationMarksOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('RegistrationMarks needs a canvas')
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
    if (!gl) throw new Error('RegistrationMarks needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('RegistrationMarks: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`RegistrationMarks: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: RegistrationMarksOptions): void {
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
    gl.uniform3fv(loc('u_third'), rgb(opts.third))
    gl.uniform1f(loc('u_size'), opts.size)
    gl.uniform1f(loc('u_weight'), opts.weight)
    gl.uniform1f(loc('u_arms'), opts.arms)
    gl.uniform1f(loc('u_margin'), opts.margin)
    gl.uniform1f(loc('u_spread'), opts.spread)
    gl.uniform1f(loc('u_bar'), opts.bar)

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
 * Mount RegistrationMarks into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const sheet = createRegistrationMarks(document.querySelector('#hero')!)
 * sheet.start()
 * // …later
 * sheet.destroy()
 * ```
 */
export function createRegistrationMarks(
  el: HTMLElement,
  opts: Partial<RegistrationMarksOptions> = {}
): EffectHandle {
  return mount<RegistrationMarksOptions>(el, opts, {
    defaults: registrationMarksDefaults,
    create: () => new RegistrationMarksSurface()
  })
}

export default createRegistrationMarks
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
  let opts: O = { ...config.defaults, ...(userOpts ?? {}) }

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
      opts = { ...opts, ...(next as Partial<O>) }
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

RegistrationMarks draws the marks a printer puts outside the trim so the plates
can be lined up, with the plates slightly out of register and drifting.

A registration mark is a ring with a cross through it, and the arms run past the
ring on all four sides. That is not a style choice: the ring reads rotation and
the arms read translation, so an operator can judge both through a loupe at
once. Each ink gets its own set in its own colour, and when the press is right
they sit exactly on top of one another and read as a single black mark.

So the subject here is the error. Three plates, each drifting on its own closed
orbit, which is what a press operator is looking at when they pull a sheet and
hold it up to the light. At `spread: 0` the plates land together and the marks
go black, which is the correct answer and much the duller picture.

Along the foot is the colour bar: one solid patch per plate, the way a sheet
carries them for a densitometer. It is the other half of what a printer reads
off a sheet.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<section id="sheet" style="height: 80vh"></section>

<script type="module">
  import { createRegistrationMarks } from './beamish/effects/registration-marks/core.js'

  const sheet = createRegistrationMarks(document.querySelector('#sheet'))
  sheet.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createRegistrationMarks } from '@/beamish/effects/registration-marks/core'

export function Sheet() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sheet = createRegistrationMarks(host.current, { spread: 3.2 })
    sheet.start()
    return () => sheet.destroy()
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
import { createRegistrationMarks } from '@/beamish/effects/registration-marks/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sheet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sheet = createRegistrationMarks(host.value)
  sheet.start()
})

onBeforeUnmount(() => sheet?.destroy())
</script>

<template>
  <div ref="host" class="sheet" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The sheet. Nearly all of the frame is this, which is the point: registration marks live in the margin and the margin is mostly empty. |
| `first` | color | `#1b6f8c` | any CSS hex | The first plate. Process colours are the honest choice here, but any three inks that can be told apart will do: the whole effect depends on seeing which plate has moved. |
| `second` | color | `#c44400` | any CSS hex | The second plate. |
| `third` | color | `#36362f` | any CSS hex | The third plate. Making one of them the key black is worth it, because black over the other two is what a mark in register actually looks like. |
| `size` | number | `17` | 5 to 60 px (looks right between 12 and 26) | Radius of a mark's ring. Real ones are a few millimetres across and read at arm's length, so keep them small: a large registration mark is a logo. |
| `weight` | number | `1.4` | 0.4 to 6 px | Thickness of the rules. Hairline, because the whole purpose of the mark is to resolve a small error, and a thick rule cannot show a small error. It is also why the anti-aliasing matters so much here. |
| `arms` | number | `1.8` | 1 to 4 | How far the cross runs past the ring, as a share of the radius. At 1 the arms stop at the ring and it is a target rather than a registration mark. |
| `margin` | number | `0.13` | 0.02 to 0.45 | How far the marks sit in from the edge, as a share of the short side. On a press sheet they are outside the trim, so near the edge is the truthful setting and also the one that leaves the middle of the frame free. |
| `spread` | number | `3.2` | 0 to 30 px (looks right between 1.5 and 6) | Worst misregistration, in pixels, and the whole subject. A few pixels is a press that needs attention; twenty is a sheet nobody would let off the floor. At 0 the plates sit exactly on top of each other and the marks read as one black mark, which is what a printer is aiming for and the dullest version of this. |
| `bar` | number | `18` | 0 to 60 px | Height of the colour bar along the foot, one solid patch per plate. 0 leaves only the marks, which is cleaner and loses the other half of what a printer reads off a sheet. |
| `period` | number | `32` | 8 to 180 s | Seconds for one cycle of the drift. A press does not go out of register quickly, and this is a backdrop, so long. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createRegistrationMarks` from `useEffect`, `onMounted`, or a
`client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`.
The marks are the thing and they are all there in one frame, so nothing is
lost.

## 7. The three mistakes most likely to be made here

1. **Hard-edged rules.** A hairline that is not anti-aliased crawls between
   whole pixels as it drifts, which is the one thing this effect must not do:
   the sub-pixel movement is what it is about.

2. **Adding the inks.** Where plates overlap you want them to go dark, because
   that is what tells you they are in register. Added, they go bright.

3. **Arms that stop at the ring.** Then it is a target, not a registration
   mark. The arms running past are how translation is read.

4. **Making them large.** Real ones are a few millimetres and read at arm's
   length. A big registration mark is a logo.

5. **Using it under a finished page.** It says production, press sheet, work in
   progress. That is a strong note to strike by accident.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
