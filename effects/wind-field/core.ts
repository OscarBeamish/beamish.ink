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
