You are adding **WindField** from Beamish to this project.

> The wind on a weather map, combed into streaks that travel along the flow, with the speed read as colour. Backdrops · effect · MIT.
> https://beamish.ink/effects/wind-field

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Line integral convolution, not a particle system. Each pixel walks a short way up the flow and a short way down it, samples a fixed noise field at each step, and sums those samples under a travelling kernel: along a streamline they agree and the pixel is bright, across the flow they disagree and cancel
- That is not a stylistic choice. A particle's position depends on the one before it, so an advected field cannot be seeked, cannot be recorded, drifts on a dropped frame, and is wrong on the first frame after a resize, because the trail is feedback on the canvas. The page this was taken from runs fourteen thousand particles with a 0.07 erase per frame and there is no value of t you can ask it for
- The streaks move because the kernel's phase moves, not because anything in the field is advected. `turns` is a whole number of turns over the period and is rounded in core.ts rather than trusted, because it is the one value that can stop the loop closing and it arrives from a prompt
- Each system orbits its own home once per period, so the weather changes without the loop failing to come home
- Field space is y from 0 to 1 and x across the aspect ratio, rather than uv. A system placed in uv is an ellipse on a wide canvas
- Colour is a legend rather than a palette. Speed picks the hue through two interpolations, because a straight line between two colours gives one hue and a tint of it, and a chart like this is read by hue
- Built for a dark ground and declared as one. The streaks are drawn by addition onto the ground, which is what lets them overlap without going muddy, and on paper that makes them brighter than the paper rather than darker
- Four systems by default rather than eight. Eight small vortices read as a decorative swirl; four large overlapping ones read as a chart, because a real synoptic map is mostly one system's skirt running into another's
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/wind-field/core.ts`**

```ts
/*
 * WindField: Beamish
 * https://beamish.ink/effects/wind-field
 *
 * The wind on a weather map: a few pressure systems, a prevailing drift, and
 * the air between them combed into streaks that travel along the flow.
 *
 * WHY THIS IS NOT A PARTICLE SYSTEM
 *
 * Every wind map on the web advects a few thousand particles and leaves a
 * fading trail behind them, and that look is right. The method is not available
 * here. A particle's position depends on the one before it, so the frame is a
 * function of every frame that came before: it cannot be seeked, so it cannot
 * be recorded; it drifts whenever a frame is dropped; and the trail is feedback
 * on the canvas, so the first frame after a resize is wrong. Those are the same
 * three costs DustMotes avoids by being a field rather than a system, and they
 * are not theoretical: the page this was taken from runs fourteen thousand
 * particles with a 0.07 erase per frame, and there is no value of t you can ask
 * it for.
 *
 * So the streaks are drawn by line integral convolution instead. For each pixel
 * the shader walks a little way up the flow and a little way down it, samples a
 * fixed noise field at each step, and sums those samples under a travelling
 * kernel. Along a streamline the samples agree and the pixel is bright; across
 * the flow they disagree and cancel. The streak is the agreement.
 *
 * The movement is the phase of the kernel rather than movement of the noise,
 * which is what keeps the whole frame a function of t. A whole number of turns
 * over the period, so it comes home.
 *
 * WHAT MAKES IT READ AS WEATHER RATHER THAN AS A PATTERN
 *
 *   The systems have to be few and large. Eight small vortices read as a
 *   decorative swirl; four big overlapping ones read as a chart, because a real
 *   synoptic map is mostly one system's skirt running into another's.
 *
 *   The colour is a legend, not a palette. Speed picks the hue through two
 *   interpolations rather than one, because a straight line between two colours
 *   gives you one hue and a tint of it, and a wind map is read by hue.
 *
 *   There is a prevailing drift. Without it the systems sit in dead air and the
 *   field has no direction, which is the clearest way to make this look like a
 *   screensaver.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type WindFieldOptions = BaseOptions & {
  /** The ground the streaks are drawn on. What shows where there is no wind. */
  ground: string
  /** The slowest air. */
  calm: string
  /** The middle of the ramp. */
  mid: string
  /** The fastest air. */
  strong: string
  /** How many pressure systems are in the field, 1 to 8. */
  systems: number
  /** The prevailing drift across the frame, in field units per unit. */
  drift: number
  /** How far each system wanders from its home, as a share of the height. */
  wander: number
  /** Cell size of the noise the streaks are made of, in CSS pixels. */
  scale: number
  /** How long a streak is, in CSS pixels. */
  length: number
  /** Whole turns the streaks travel along the flow in one period. */
  turns: number
  /** How hard the streaks are stretched away from flat grey, 0 to 1. */
  contrast: number
  /** Seed for the systems. The same seed gives the same weather. */
  seed: number
  /** Seconds for one cycle. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const windFieldDefaults: WindFieldOptions = {
  ground: '#0d141a',
  calm: '#3f6f93',
  mid: '#58a58c',
  strong: '#d8a04a',
  systems: 4,
  drift: 0.42,
  wander: 0.06,
  scale: 2.2,
  length: 60,
  turns: 3,
  contrast: 0.46,
  seed: 11,
  period: 24,
  maxDpr: 1.5,
  reducedMotionTime: 0
}

// beamish:shader-begin shaders/wind-field.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/wind-field.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * WindField: the wind on a weather map, combed into streaks along the flow.
 *
 * NOT A PARTICLE SYSTEM, AND THE REASON MATTERS
 *
 * Every wind map on the web advects a few thousand particles and leaves a
 * fading trail behind them. That look is right and the method cannot be used
 * here. A particle's position depends on the one before it, so the frame is a
 * function of every frame that preceded it: it cannot be seeked, which means it
 * cannot be recorded; it drifts whenever a frame is dropped; and the trail is
 * feedback, which means the first frame after a resize is wrong.
 *
 * This draws the same thing by line integral convolution instead. For every
 * pixel the shader walks a little way up the flow and a little way down it,
 * samples a fixed noise field at each step, and adds the samples up under a
 * travelling kernel. Where the walk follows a streamline the samples agree and
 * the pixel is bright; across the flow they disagree and it cancels. The streak
 * is the agreement, and nothing is stored between frames: every pixel is a
 * function of its own coordinates and t, so the whole frame is.
 *
 * The movement is the phase of the kernel rather than movement of the noise. A
 * whole number of turns over the period, so the loop closes exactly.
 *
 * THE FIELD
 *
 * A few pressure systems and a prevailing drift, which is what a real synoptic
 * chart is. Each system is a rotating vortex with a radius and a sign, and each
 * one orbits its own home once per period so the weather changes without the
 * loop ever failing to come home.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_calm;
uniform vec3  u_mid;
uniform vec3  u_strong;

uniform float u_systems;
uniform float u_drift;
uniform float u_wander;
uniform float u_scale;
uniform float u_length;
uniform float u_turns;
uniform float u_contrast;
uniform float u_seed;

out vec4 fragColor;

const float TAU = 6.28318530718;

/*
 * The walk, split into two loops for a reason that decides how this looks.
 *
 * Line integral convolution only combs if consecutive samples land on
 * DIFFERENT noise and the ones along a streamline agree. The first version of
 * this stepped 7px at a time through noise with 7px cells, so every step
 * landed in the same cell as the last: the samples agreed everywhere, nothing
 * cancelled, and the result was smeared blobs rather than hair. It read as wet
 * paint, which is what it was.
 *
 * So the noise is now nearly per-pixel and the step is about a pixel. That
 * wants far more samples, and samples are cheap; what is expensive is
 * evaluating the field, which walks every pressure system. The two are
 * separated here: SEGMENTS field evaluations, each followed by SUB samples
 * taken in a straight line along the direction that evaluation gave. A
 * streamline is locally straight over a couple of pixels, so nothing is lost
 * and the cost stays where it was.
 *
 * The one rule that has to hold: the step must be no longer than a noise cell.
 * Step past a cell and consecutive samples are independent, which is static;
 * step well inside one and they are identical, which is smear. About one cell
 * per step is where it combs.
 */
const int SEGMENTS = 7;
const int SUB = 4;
/* Room for eight systems. u_systems says how many are actually walked. */
const int MAX_SYSTEMS = 8;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  return vec2(hash12(p + u_seed), hash12(p + u_seed + 41.7));
}

/*
 * Value noise. This is the thing the streaks are made of: the convolution
 * smears it along the flow, so its cell size sets how coarse the combing looks
 * and nothing else in here does.
 */
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/*
 * The wind at a point, in field space, where y spans 0 to 1 and x spans the
 * aspect ratio. Working in a square-ish space rather than in uv is what keeps
 * a system circular on a wide canvas instead of stretched into an ellipse.
 */
vec2 wind(vec2 q, float aspect, float phase) {
  vec2 v = vec2(u_drift, 0.0);

  for (int i = 0; i < MAX_SYSTEMS; i++) {
    if (float(i) >= u_systems) break;
    float fi = float(i);
    vec2 rnd = hash22(vec2(fi * 3.17 + 1.0, fi * 7.91 + 2.0));

    /*
     * Where this system sits, and the small circuit it makes around that.
     * Exactly one turn over the period: a fractional number here is how a
     * looping effect ends up with a visible jump once a cycle.
     */
    vec2 home = vec2((0.12 + 0.76 * rnd.x) * aspect, 0.14 + 0.72 * rnd.y);
    float a = phase + rnd.x * TAU;
    vec2 centre = home + vec2(cos(a), sin(a)) * u_wander;

    float spin = fract(rnd.y * 7.3) < 0.5 ? -1.0 : 1.0;
    float rad = 0.15 + 0.17 * fract(rnd.x * 13.1);
    float strength = 0.65 + 0.5 * fract(rnd.y * 5.7);

    vec2 d = q - centre;
    /*
     * A gaussian skirt rather than a hard edge, so systems blend into each
     * other the way pressure does. The tangent is the perpendicular of d, which
     * is what makes it a rotation rather than a source.
     */
    float k = exp(-dot(d, d) / (2.0 * rad * rad));
    v += spin * strength * vec2(-d.y, d.x) / rad * k;
  }

  return v;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float height = max(cssRes.y, 1.0);
  float aspect = cssRes.x / height;

  vec2 q = vec2(cssPx.x / height, cssPx.y / height);
  float phase = TAU * u_time / max(u_period, 0.001);

  /* Step length along the streamline, in field units. stepLen rather than
     step, because \`step\` is a GLSL built-in and a variable of that name hides
     it for the rest of the shader. */
  float samples = float(SEGMENTS * SUB);
  float stepLen = (max(u_length, 4.0) / samples) / height;
  float noiseScale = height / max(u_scale, 0.8);

  /*
   * The travelling kernel. Its phase is the only thing in here that moves the
   * streaks, and u_turns is how many times it goes round in a period. Whole
   * turns, so frame zero and frame last are the same frame.
   */
  float travel = TAU * u_turns * u_time / max(u_period, 0.001);

  float sum = 0.0;
  float weight = 0.0;

  /*
   * Walk both ways from the pixel. Forward and backward in the same loop, so
   * the field is evaluated twice per iteration rather than the loop running
   * twice: the same work, one set of bookkeeping.
   */
  vec2 fwd = q;
  vec2 back = q;
  float speedHere = length(wind(q, aspect, phase));
  float walked = 0.0;

  for (int seg = 0; seg < SEGMENTS; seg++) {
    /* One field evaluation per segment, in each direction. */
    vec2 vf = wind(fwd, aspect, phase);
    vec2 vb = wind(back, aspect, phase);
    vec2 df = (vf / max(length(vf), 1e-4)) * stepLen;
    vec2 db = (vb / max(length(vb), 1e-4)) * stepLen;

    for (int k = 0; k < SUB; k++) {
      fwd += df;
      back -= db;
      walked += 1.0;
      float s = walked / samples;

      /*
       * A raised cosine down the length of the kernel, so a streak fades out
       * at both ends instead of stopping, times a travelling wave that slides
       * that envelope along the streamline. The second term is the only thing
       * in here that moves.
       */
      float w = (0.5 + 0.5 * cos(TAU * s * 0.5)) *
                (0.62 + 0.38 * cos(TAU * s * 1.5 - travel));

      sum += vnoise(fwd * noiseScale) * w;
      sum += vnoise(back * noiseScale) * w;
      weight += 2.0 * w;
    }
  }

  float ink = sum / max(weight, 1e-4);

  /*
   * Stretch around the mean. Raw LIC output sits in a narrow band around 0.5
   * because it is an average of a uniform field, and without this the whole
   * thing is a flat grey with a hint of structure in it.
   */
  ink = clamp(0.5 + (ink - 0.5) * (1.0 + u_contrast * 7.0), 0.0, 1.0);

  /*
   * Then thin it, so there is dark between the streaks for them to be shapes
   * against. Squared rather than cubed: the cube was tuned against the blobby
   * version, where it was hiding the smear, and on properly combed hair it
   * eats the mid-tones and leaves only the brightest few strands.
   */
  ink = ink * ink;

  /*
   * Colour by speed, the way every chart of this kind does: the ramp is the
   * legend. Two interpolations rather than one, because wind maps are read by
   * hue and a straight line between two colours gives you one hue and a tint.
   *
   * The floor and the span are measured against the field this draws rather
   * than assumed: a prevailing drift of 0.34 with four systems puts almost
   * everything between 0.15 and 1.0, and mapping the whole of 0 upwards left
   * the top of the ramp for the few pixels on a system's shoulder.
   */
  float speed = clamp((speedHere - 0.14) / 0.72, 0.0, 1.0);
  vec3 ramp = speed < 0.5
    ? mix(u_calm, u_mid, speed * 2.0)
    : mix(u_mid, u_strong, (speed - 0.5) * 2.0);

  /*
   * Fast air is drawn brighter as well as warmer. A wind map that draws still
   * air as hard as a jet reads as a texture, and it is also what buries the
   * prevailing drift: the calm corners fill in and there is nothing left for
   * the moving part to be moving against.
   */
  vec3 col = u_ground + ramp * ink * (0.18 + 0.82 * speed);

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
  'u_calm',
  'u_mid',
  'u_strong',
  'u_systems',
  'u_drift',
  'u_wander',
  'u_scale',
  'u_length',
  'u_turns',
  'u_contrast',
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
  if (!shader) throw new Error('WindField: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`WindField: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class WindFieldSurface implements Surface<WindFieldOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('WindField needs a canvas')
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
    if (!gl) throw new Error('WindField needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('WindField: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`WindField: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: WindFieldOptions): void {
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
    gl.uniform3fv(loc('u_calm'), rgb(opts.calm))
    gl.uniform3fv(loc('u_mid'), rgb(opts.mid))
    gl.uniform3fv(loc('u_strong'), rgb(opts.strong))
    gl.uniform1f(loc('u_systems'), opts.systems)
    gl.uniform1f(loc('u_drift'), opts.drift)
    gl.uniform1f(loc('u_wander'), opts.wander)
    gl.uniform1f(loc('u_scale'), opts.scale)
    gl.uniform1f(loc('u_length'), opts.length)
    /*
     * Rounded here rather than trusted. A fractional number of turns is the one
     * way this effect can fail to close its loop, and the option is a number an
     * agent fills in from a prompt.
     */
    gl.uniform1f(loc('u_turns'), Math.max(1, Math.round(opts.turns)))
    gl.uniform1f(loc('u_contrast'), opts.contrast)
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
 * Mount WindField into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const air = createWindField(document.querySelector('#hero')!)
 * air.start()
 * // …later
 * air.destroy()
 * ```
 */
export function createWindField(
  el: HTMLElement,
  opts: Partial<WindFieldOptions> = {}
): EffectHandle {
  return mount<WindFieldOptions>(el, opts, {
    defaults: windFieldDefaults,
    create: () => new WindFieldSurface()
  })
}

export default createWindField
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

WindField is the wind on a weather map: a few pressure systems, a prevailing
drift, and the air between them combed into streaks that travel along the flow
with their speed read as colour.

It is **line integral convolution**, not a particle system, and that is the most
important thing about it.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="chart" style="height: 70vh"></div>

<script type="module">
  import { createWindField } from './beamish/effects/wind-field/core.js'

  const wind = createWindField(document.querySelector('#chart'))
  wind.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createWindField } from '@/beamish/effects/wind-field/core'

export function Weather() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const wind = createWindField(host.current, { systems: 4, length: 58 })
    wind.start()
    return () => wind.destroy()
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
import { createWindField } from '@/beamish/effects/wind-field/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let wind: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  wind = createWindField(host.value)
  wind.start()
})

onBeforeUnmount(() => wind?.destroy())
</script>

<template>
  <div ref="host" class="chart" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `ground` | color | `#0d141a` | any CSS hex | The ground, and what shows where there is no wind. Dark, because the streaks are added onto it: that is what lets them cross each other without going muddy, and it is also why this item does not work on paper without inverting the idea. |
| `calm` | color | `#3f6f93` | any CSS hex | The slowest air, at the bottom of the ramp. Cool and close to the ground, so the still parts of the field recede and the fast parts are what you look at. |
| `mid` | color | `#58a58c` | any CSS hex | The middle of the ramp. It exists so the ramp is read by hue rather than by lightness: a straight line from calm to strong gives one hue and a tint of it, which is the look of a gradient rather than of a chart. |
| `strong` | color | `#d8a04a` | any CSS hex | The fastest air, which in practice means the air close in around a system. Warm, because that is the convention every wind map uses and conventions are worth keeping where they cost nothing. |
| `systems` | number | `4` | 1 to 8 (looks right between 3 and 5) | How many pressure systems are in the field. Few and large reads as weather; many and small reads as decoration, because a real chart is mostly one system's skirt running into another's. This is also the main cost: the field is evaluated eighteen times per pixel and each evaluation walks this many systems. |
| `drift` | number | `0.42` | 0 to 1.5 (looks right between 0.2 and 0.6) | The prevailing wind across the frame, before any system touches it. At 0 the systems sit in dead air and the field has no direction, which is the single clearest way to make this look like a screensaver. |
| `wander` | number | `0.06` | 0 to 0.3 | How far each system travels from its home over a period, as a share of the height. Small: weather moves, but a backdrop that moves its structure around is a backdrop you keep looking at. At 0 the field is fixed and only the streaks travel, which is a legitimate and very quiet way to use this. |
| `scale` | number | `2.2` | 0.8 to 12 px (looks right between 1.2 and 3) | Cell size of the noise the streaks are made of. It sets how coarse the combing is, and nothing else in here does. Large values give a few wide ribbons; small ones give fine hair, and below about 3 it starts to alias into sparkle. |
| `length` | number | `60` | 10 to 180 px (looks right between 40 and 90) | How long a streak is. This is the distance the walk covers, so it is also how far the shader can see along the flow: long streaks follow a curve further and make the field legible, and past about 120 they start to straighten the tight air near a system centre into chords. |
| `turns` | number | `3` | 1 to 12 (looks right between 2 and 5) | Whole turns the streaks travel along the flow in one period. Whole, because a fraction means the loop never comes home, and core.ts rounds it rather than trusting it. With the default period of 36 seconds, 3 is a streak pattern that takes twelve seconds to repeat. |
| `contrast` | number | `0.46` | 0 to 1 (looks right between 0.35 and 0.7) | How hard the result is stretched away from its mean. Line integral convolution of a uniform field sits in a narrow band around the middle, so at 0 this is a flat wash with a hint of structure. Past about 0.8 the streaks go to hard black and white and the field stops reading as air. |
| `seed` | number | `11` | 0 to 9999 | Seed for the systems: where they sit, which way they turn, how big and how strong. The same seed gives the same weather, so a recording and a live page agree streak for streak. |
| `period` | number | `24` | 10 to 180 s (looks right between 24 and 90) | Seconds for one cycle. Long, because a backdrop has to survive being ignored: this is both how long a system takes to go round its home and the time in which the streaks make `turns` complete passes. |

## 5. Why not particles

Every wind map on the web advects a few thousand particles and leaves a fading
trail behind them. That look is right and the method cannot be used here, for
three reasons that all come from the same fact: a particle's position depends on
the one before it.

- **It cannot be seeked.** Frame 900 is only reachable by drawing frames 0 to
  899, so it cannot be recorded, and `renderAtTime(t)` is a lie.
- **It drifts on a dropped frame.** Two machines running the same page for a
  minute show different weather.
- **The trail is feedback on the canvas.** The first frame after a resize is
  whatever was left in the buffer.

So each pixel here walks a short way up the flow and a short way down it,
samples a fixed noise field at each step, and sums those samples under a
travelling kernel. Along a streamline the samples agree and the pixel is bright.
Across the flow they disagree and cancel. **The streak is the agreement**, and
nothing is stored between frames.

The streaks move because the kernel's phase moves, not because anything is
advected. `turns` is how many whole turns that phase makes in a `period`, and
`core.ts` rounds it rather than trusting it, because a fraction is the one way
this effect can fail to close its loop.

## 6. Three things that make it weather and not a pattern

**Few systems, large.** Eight small vortices read as a decorative swirl. Four
large overlapping ones read as a chart, because a real synoptic map is mostly
one system's skirt running into another's. `systems: 4` is the default for that
reason rather than for cost, though it is also the main cost.

**A prevailing drift.** Without `drift` the systems sit in dead air and the
field has no direction. It is the clearest single way to make this look like a
screensaver.

**Colour as a legend.** Speed picks the hue through two interpolations, `calm`
to `mid` to `strong`, because a straight line between two colours gives you one
hue and a tint of it. A chart like this is read by hue.

## 7. It needs a dark ground

The streaks are **added** onto `ground`, which is what lets them cross each
other without going muddy. On paper that makes them brighter than the paper
rather than darker, so the whole thing turns into a pale haze. It declares
`ground: "dark"` for that reason.

Set `ground` to whatever your dark section actually is rather than leaving the
default, or the mismatch shows as a rectangle.

## 8. It is expensive

Twenty-eight samples per pixel along the streamline, but only seven field
evaluations each way: the field is what costs, and a streamline is straight
enough over a couple of pixels that the samples between evaluations are nearly
free. Measured at 1280 by 720 that is 1.0ms for a draw and a forced flush,
against DustMotes at 0.7 and MarbledPaper at 2.2 on the same machine.

Cost is segments times systems. Two knobs before anything else:

- **`systems`** is an option. Three instead of five is a quarter off.
- **SEGMENTS** is a constant at the top of the shader. SUB is nearly free and
  is what controls whether the hair combs; SEGMENTS is what controls how
  faithfully a streak follows a curve.

**The step must be about one noise cell.** `length / 28` is the step and
`scale` is the cell. Step past a cell and consecutive samples are independent,
which is static. Step well inside one and they are identical, which is smear.
The first version of this had both at 7px and produced neither.

`maxDpr` defaults to 1.5 rather than the usual 2, because what this draws is
noise at a cell size of a few pixels and the fourth sub-pixel buys nothing you
can see.

## 9. Reading the controls

`length` is how far the walk goes, so it is also how far the shader can see
along the flow. Long streaks follow a curve further and make the field legible;
past about 120 they straighten the tight air near a system centre into chords.

`scale` is the cell size of the noise the streaks are made of, and the only
thing that sets how coarse the combing looks. `contrast` stretches the result
away from its mean, which it needs: raw convolution of a uniform field sits in a
narrow band around the middle, so at 0 this is a flat wash.

## 10. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createWindField` from `useEffect`, `onMounted`, or a `client:*`
island.

## 11. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`. A
still field of streaks is a chart, which is a complete image: `turns: 0` is not
available, but `wander: 0` with the loop stopped gives the same thing
permanently.

## 12. The three mistakes most likely to be made here

1. **Advecting particles.** It cannot be seeked, so it cannot be recorded; it
   drifts on a dropped frame; and the trail is feedback, so a resize shows what
   was left in the buffer.

2. **A fractional number of turns.** The loop never comes home and the video
   jumps once a cycle, forever. `turns` is rounded in `core.ts` for that reason.

3. **Too many systems.** Eight is decoration. Weather is a few large ones
   overlapping.

4. **No drift.** Systems in dead air have no direction, and the field reads as a
   pattern rather than as moving air.

5. **A two-colour ramp.** One hue and a tint of it. The middle stop is what
   makes the speed legible.

6. **Placing systems in uv.** A system placed in 0-to-1 coordinates is an
   ellipse on a wide canvas. The field works in a space where y spans 0 to 1 and
   x spans the aspect ratio.

---

Concept credit: the field of named pressure systems behind the Wind Field Routing page, and the speed-as-colour ramp that goes with it. The method here is line integral convolution rather than fourteen thousand advected particles, because an advected field cannot be seeked, by Ray Velez, https://github.com/RayVelez27/instalanding.ai.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
