/*
 * Guilloche: Beamish
 * https://beamish.ink/effects/guilloche-lines
 *
 * The engine-turned line work on a banknote, drawn on warm paper. WebGL2, no
 * three.js, no dependencies.
 *
 * The GL boilerplate is inline rather than imported. This file is published and
 * read on its own, and a reader should not have to fetch a second module to find
 * out how a program gets compiled.
 *
 * The shader source is generated from shaders/guilloche-lines.frag and
 * shaders/guilloche-lines.vert. Edit those, then run `pnpm generate`. The markers are
 * load-bearing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type GuillocheLinesOptions = BaseOptions & {
  /** The paper the plate is printed on. */
  paper: string
  /** The engraving. A desaturated near-black reads as ink. */
  ink: string
  /** The second colour, printed over one band of the pattern. */
  accent: string
  /** Size of the whole rosette. */
  scale: number
  /** Lines per unit of radius. Higher is finer engraving. */
  pitch: number
  /** Lobes on the first rosette. Whole numbers only, or the curve never closes. */
  lobes: number
  /** Spokes in the family that runs around the circle rather than out from it. */
  waves: number
  /** How far each rosette's radius wobbles. */
  depth: number
  /** Weight of the engraved line, 0 to 1. */
  weight: number
  /** Where the second colour band sits, as a radius. */
  accentBand: number
  /** Paper tooth, 0 to 1. Static, not film grain. */
  grain: number
  /** Seconds for one turn of the gears. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const guillocheLinesDefaults: GuillocheLinesOptions = {
  paper: '#fbfaf4',
  ink: '#2f2b26',
  accent: '#c44400',
  scale: 0.92,
  pitch: 26,
  lobes: 7,
  waves: 24,
  depth: 0.07,
  weight: 0.35,
  accentBand: 0.22,
  grain: 0.28,
  period: 6,
  reducedMotionTime: 5
}

// beamish:shader-begin shaders/guilloche-lines.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/guilloche-lines.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * Guilloche: the engine-turned line work on a banknote, a share certificate or
 * the bezel of a watch.
 *
 * It is not noise and it is not a gradient. A real rose engine cuts one
 * continuous line whose radius is modulated by a set of gears, so the pattern
 * is a family of curves with a strict harmonic relationship. That is exactly
 * what this draws: several rosettes, each a circle whose radius wobbles at an
 * integer number of lobes, rendered as a line field rather than a fill.
 *
 * The integer lobe counts are the whole thing. Fractional ones never close, and
 * an open curve reads as a mistake rather than as engraving.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;
uniform vec3  u_paper;
uniform vec3  u_ink;
uniform vec3  u_accent;
uniform float u_scale;
uniform float u_pitch;
uniform float u_lobes;
uniform float u_waves;
uniform float u_depth;
uniform float u_weight;
uniform float u_accentBand;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * One engraved line family. \`spacing\` is how far apart the lines sit; the
 * derivative keeps them a constant width on screen however fast the field is
 * changing, which is what stops the centre turning into a solid disc.
 */
float engrave(float field, float weight) {
  float band = fract(field);
  float aa = fwidth(field);
  float edge = aa * (0.5 + weight * 2.0);
  return 1.0 - smoothstep(0.0, edge, min(band, 1.0 - band));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  vec2 p = (cssPx - cssRes * 0.5) / (shortSide * 0.5);
  p /= max(u_scale, 0.05);

  float phase = TAU * u_time / max(u_period, 0.001);

  float r = length(p);
  float a = atan(p.y, p.x);

  /*
   * Three rosettes turning against each other, the way a rose engine stacks
   * gears. Their lobe counts are coprime, so the interference pattern takes a
   * long time to repeat and never looks like a simple grid.
   */
  float lobesA = floor(u_lobes);
  float lobesB = floor(u_lobes * 1.75) + 1.0;
  float lobesC = floor(u_lobes * 0.5) + 2.0;

  float waveA = sin(a * lobesA + phase) * u_depth;
  float waveB = sin(a * lobesB - phase * 1.5) * u_depth * 0.55;
  float waveC = cos(a * lobesC + phase * 0.5) * u_depth * 0.8;

  // Each family is the radius plus its own wobble, scaled into line spacing.
  float fieldA = (r + waveA) * u_pitch;
  float fieldB = (r + waveB) * u_pitch * 1.31;

  // The third runs around the circle rather than out from the centre, which is
  // what turns two ring families into woven guilloche instead of a moire.
  float fieldC = (a / TAU * u_waves + waveC + r * 0.35) * u_pitch * 0.42;

  float lineA = engrave(fieldA, u_weight);
  float lineB = engrave(fieldB, u_weight);
  /*
   * The angular family is singular at the origin: every spoke meets there, and
   * without this the middle of the rosette collapses into a solid blot. A real
   * rose engine has a centre finding of its own for the same reason.
   */
  float lineC = engrave(fieldC, u_weight) * smoothstep(0.0, 0.3, r);

  vec3 col = u_paper;
  // Multiplied, not added: this is ink on paper, and two lines crossing are
  // darker than one.
  col *= mix(vec3(1.0), u_ink, lineA * 0.85);
  col *= mix(vec3(1.0), u_ink, lineB * 0.7);
  col *= mix(vec3(1.0), u_ink, lineC * 0.5);

  /*
   * A single band of the pattern printed in the second colour, the way a
   * certificate prints one guilloche in red over the rest in black. It rides
   * the same field, so it is part of the engraving rather than a highlight laid
   * on top of it.
   */
  float ring = smoothstep(u_accentBand + 0.16, u_accentBand, abs(r - u_accentBand - 0.28));
  col = mix(col, col * mix(vec3(1.0), u_accent, lineA * 0.9), ring);

  float tooth = hash12(floor(cssPx * 0.5)) - 0.5;
  col += tooth * 0.05 * u_grain;

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
  'u_ink',
  'u_accent',
  'u_scale',
  'u_pitch',
  'u_lobes',
  'u_waves',
  'u_depth',
  'u_weight',
  'u_accentBand',
  'u_grain'
] as const

type UniformName = (typeof UNIFORMS)[number]

/** '#rgb' | '#rrggbb' | 'rgb(r g b)' → linear-ish 0 to 1 triple. */
function parseColor(input: string): [number, number, number] {
  const value = input.trim()
  if (value.startsWith('#')) {
    let hex = value.slice(1)
    if (hex.length === 3) hex = hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!
    const n = Number.parseInt(hex.slice(0, 6), 16)
    if (Number.isNaN(n)) return [0, 0, 0]
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  }
  const nums = value.match(/[\d.]+/g)
  if (nums && nums.length >= 3) {
    return [Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255]
  }
  return [0, 0, 0]
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Guilloche: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Guilloche: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class GuillocheLinesSurface implements Surface<GuillocheLinesOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('Guilloche needs a canvas')
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
    if (!gl) throw new Error('Guilloche needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('Guilloche: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    // Shader objects are reference-counted by the program; drop our references
    // now so they are freed the moment the program is.
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`Guilloche: program failed to link\n${log ?? ''}`)
    }

    // WebGL2 requires a bound VAO even when the draw uses no attributes.
    const vao = gl.createVertexArray()

    this.gl = gl
    this.program = program
    this.vao = vao
    this.locations.clear()
    for (const name of UNIFORMS) {
      this.locations.set(name, gl.getUniformLocation(program, name))
    }
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
    this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight)
  }

  render(t: number, opts: GuillocheLinesOptions): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)

    const at = (name: UniformName) => this.locations.get(name) ?? null
    gl.uniform2f(at('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(at('u_dpr'), this.size.dpr)
    gl.uniform1f(at('u_time'), t)
    gl.uniform1f(at('u_period'), opts.period)
    gl.uniform3fv(at('u_paper'), parseColor(opts.paper))
    gl.uniform3fv(at('u_ink'), parseColor(opts.ink))
    gl.uniform3fv(at('u_accent'), parseColor(opts.accent))
    gl.uniform1f(at('u_scale'), opts.scale)
    gl.uniform1f(at('u_pitch'), opts.pitch)
    gl.uniform1f(at('u_lobes'), opts.lobes)
    gl.uniform1f(at('u_waves'), opts.waves)
    gl.uniform1f(at('u_depth'), opts.depth)
    gl.uniform1f(at('u_weight'), opts.weight)
    gl.uniform1f(at('u_accentBand'), opts.accentBand)
    gl.uniform1f(at('u_grain'), opts.grain)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  context(): WebGL2RenderingContext | null {
    return this.gl
  }

  teardown(): void {
    const gl = this.gl
    if (!gl) return
    if (this.vao) gl.deleteVertexArray(this.vao)
    if (this.program) gl.deleteProgram(this.program)
    this.vao = null
    this.program = null
    this.locations.clear()
    this.gl = null
  }
}

/**
 * Mount Guilloche into `el`. The element needs a size. Give it width and height
 * in CSS, not just content.
 *
 * ```ts
 * const guilloche = createGuillocheLines(document.querySelector('#bg')!)
 * guilloche.start()
 * // …later
 * guilloche.destroy()
 * ```
 */
export function createGuillocheLines(
  el: HTMLElement,
  opts: Partial<GuillocheLinesOptions> = {}
): EffectHandle {
  return mount<GuillocheLinesOptions>(el, opts, {
    defaults: guillocheLinesDefaults,
    create: () => new GuillocheLinesSurface()
  })
}

export default createGuillocheLines
