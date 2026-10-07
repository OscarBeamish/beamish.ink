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
  pitch: 10,
  coverage: 0.3,
  separation: 3.2,
  angle: 15,
  drift: 0.8,
  lines: false,
  detune: 0.04,
  period: 40,
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
