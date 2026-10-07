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
