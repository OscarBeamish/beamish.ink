/*
 * MarbledPaper: Beamish
 * https://beamish.ink/effects/marbled-paper
 *
 * Ink floated on size, dropped, then raked. Real marbling, not noise dressed up
 * as it.
 *
 * Every operation a marbler performs on a tray has a closed-form inverse. A drop
 * of ink pushes everything already floating outward by an exact amount. A comb
 * drawn through displaces points along its own direction by an amount that
 * depends only on how far they sit from it. Both invert in one step, with no
 * iteration and no search.
 *
 * So rather than simulating the tray forwards into a buffer, each pixel runs the
 * session backwards: undo the combs, then undo the drops from the last to the
 * first, and the moment the point falls inside one you know which ink it was.
 * One pass, no render targets, no feedback, and the pattern is exact rather than
 * approximated.
 *
 * It also gives the rings away for free. A drop laid down later pushes an
 * earlier one into an annulus around itself, and walking backwards reproduces
 * that rather than having to draw it.
 *
 * The maths is the published treatment of marbling as a sequence of invertible
 * mappings. Written from scratch.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type MarbledPaperOptions = BaseOptions & {
  /** The size in the tray, and what shows wherever no ink reached. */
  paper: string
  /** The main ink. Most drops are this, or this thinned toward the paper. */
  ink: string
  /** The second ink, on roughly a third of the drops. */
  accent: string
  /** How many drops go into the tray. Each one pushes all the earlier ones. */
  drops: number
  /** How much of the pattern fits in the frame. */
  scale: number
  /** How far the drops are scattered. Low stacks them into one rosette. */
  spread: number
  /** How big each drop is before anything pushes it. */
  size: number
  /** How far the comb pulls the ink across. */
  rake: number
  /** Teeth per unit across the comb. Higher is a finer comb. */
  comb: number
  /** The second comb, drawn at right angles to the first. */
  swirl: number
  /** Paper tooth over the whole thing. */
  grain: number
  /** Seconds for one pass of the comb. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const marbledPaperDefaults: MarbledPaperOptions = {
  paper: '#fbfaf4',
  ink: '#36362f',
  accent: '#c44400',
  drops: 44,
  scale: 1,
  spread: 0.95,
  size: 0.17,
  rake: 0.25,
  comb: 9,
  swirl: 0.12,
  grain: 0.5,
  period: 12,
  reducedMotionTime: 3
}

// beamish:shader-begin shaders/marbled-paper.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/marbled-paper.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * MarbledPaper: ink floated on size, dropped, then raked.
 *
 * This is not noise dressed up as marbling. Every operation a marbler performs
 * on a tray has a closed-form inverse, which is the fact the whole effect rests
 * on. A drop of ink pushes everything already floating outward by an exact
 * amount; a comb drawn through displaces points along its own direction by an
 * amount that depends only on how far they sit from it. Both are invertible in
 * one step, with no iteration and no search.
 *
 * So instead of simulating the tray forwards into a buffer, each pixel runs the
 * session backwards. Undo the combs, then undo the drops one at a time from the
 * last to the first, and the moment the point falls inside a drop you know which
 * ink it was. That is the colour. No render targets, no feedback, no history:
 * one pass, and the pattern is exact rather than approximated.
 *
 * It also explains the rings. A drop laid down later pushes an earlier one into
 * an annulus around itself, and walking the operations backwards reproduces that
 * for free rather than having to draw it.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_ink;
uniform vec3  u_accent;
uniform float u_drops;
uniform float u_scale;
uniform float u_spread;
uniform float u_size;
uniform float u_rake;
uniform float u_comb;
uniform float u_swirl;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453123);
}

vec2 hash21(float n) {
  return vec2(hash11(n), hash11(n + 71.3));
}

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * Undo one pass of the comb.
 *
 * Forward, the comb displaces a point along \`dir\` by an amount that varies with
 * how far along the perpendicular it sits. The displacement therefore never
 * changes the quantity the displacement is computed from, so subtracting the
 * same vector is an exact inverse rather than an approximation of one. That is
 * the only reason the combs can be undone before the drops are.
 */
vec2 uncomb(vec2 p, vec2 dir, float amp, float freq, float phase) {
  vec2 n = vec2(-dir.y, dir.x);
  return p - dir * amp * sin(dot(p, n) * freq + phase);
}

/*
 * Undo one drop of radius r at c.
 *
 * A drop pushes everything already on the surface radially outward, conserving
 * area, so a point at distance m from the centre came from one at
 * sqrt(m * m - r * r). The max() guards the inside of the drop, where there is
 * nothing earlier to recover: the caller checks for that case first and takes
 * the ink colour instead.
 */
vec2 undrop(vec2 p, vec2 c, float r) {
  vec2 d = p - c;
  float m2 = dot(d, d);
  return c + d * sqrt(max(1.0 - (r * r) / m2, 0.0));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  vec2 p = (cssPx - cssRes * 0.5) / (shortSide * 0.5);
  p /= max(u_scale, 0.05);

  float phase = TAU * u_time / max(u_period, 0.001);

  /*
   * Two combs at right angles, which is how a gel-git pattern is made: one pass
   * across, one pass down. Undone in the reverse of the order a marbler would
   * draw them, because this is the session running backwards.
   *
   * Their phases are whole multiples of the same angle, so the comb returns to
   * where it started after exactly one period and the loop closes.
   */
  p = uncomb(p, vec2(0.0, 1.0), u_swirl, u_comb * 0.73, phase);
  p = uncomb(p, vec2(1.0, 0.0), u_rake, u_comb, -phase);

  int count = int(clamp(u_drops, 1.0, 72.0));
  vec3 col = u_paper;
  bool found = false;

  /*
   * Backwards through the drops. The first one that contains the point is the
   * ink you can see, because anything dropped after it would have pushed this
   * point out of the way.
   */
  for (int i = 71; i >= 0; i--) {
    if (i >= count) continue;

    float fi = float(i);
    vec2 c = (hash21(fi * 3.73 + 1.0) - 0.5) * 2.0 * u_spread;
    float r = u_size * (0.62 + hash11(fi * 9.17) * 0.76);

    vec2 d = p - c;
    if (dot(d, d) <= r * r) {
      // Three inks off two colours: the accent, the ink, and the ink thinned
      // toward the paper, which is what a second pass of the same colour looks
      // like when the first has already spread.
      float pick = hash11(fi * 5.31 + 4.2);
      col = pick < 0.3 ? u_accent : (pick < 0.68 ? u_ink : mix(u_ink, u_paper, 0.4));
      found = true;
      break;
    }

    p = undrop(p, c, r);
  }

  // Anything that fell through every drop never had ink on it.
  if (!found) col = u_paper;

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
  'u_drops',
  'u_scale',
  'u_spread',
  'u_size',
  'u_rake',
  'u_comb',
  'u_swirl',
  'u_grain'
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
  if (!shader) throw new Error('MarbledPaper: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`MarbledPaper: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class MarbledPaperSurface implements Surface<MarbledPaperOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('MarbledPaper needs a canvas')
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
    if (!gl) throw new Error('MarbledPaper needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('MarbledPaper: could not create program')
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
      throw new Error(`MarbledPaper: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: MarbledPaperOptions): void {
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
    gl.uniform3fv(loc('u_ink'), rgb(opts.ink))
    gl.uniform3fv(loc('u_accent'), rgb(opts.accent))
    gl.uniform1f(loc('u_drops'), opts.drops)
    gl.uniform1f(loc('u_scale'), opts.scale)
    gl.uniform1f(loc('u_spread'), opts.spread)
    gl.uniform1f(loc('u_size'), opts.size)
    gl.uniform1f(loc('u_rake'), opts.rake)
    gl.uniform1f(loc('u_comb'), opts.comb)
    gl.uniform1f(loc('u_swirl'), opts.swirl)
    gl.uniform1f(loc('u_grain'), opts.grain)

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
 * Mount MarbledPaper into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const marbled = createMarbledPaper(document.querySelector('#hero')!)
 * marbled.start()
 * // …later
 * marbled.destroy()
 * ```
 */
export function createMarbledPaper(
  el: HTMLElement,
  opts: Partial<MarbledPaperOptions> = {}
): EffectHandle {
  return mount<MarbledPaperOptions>(el, opts, {
    defaults: marbledPaperDefaults,
    create: () => new MarbledPaperSurface()
  })
}

export default createMarbledPaper
