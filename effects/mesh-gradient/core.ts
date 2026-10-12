/*
 * MeshGradient: Beamish
 * https://beamish.ink/effects/mesh-gradient
 *
 * The soft flowing colour field behind half the software marketing on the web.
 * WebGL2, no three.js, no dependencies.
 *
 * Layered waves, a domain warp, and shading taken from the slope of the same
 * field. The shader says why the third one is what separates this from
 * wallpaper.
 *
 * The GL boilerplate is inline rather than imported. This file is published and
 * read on its own, and a reader should not have to fetch a second module to find
 * out how a program gets compiled.
 *
 * The shader source is generated from shaders/mesh-gradient.frag and
 * shaders/mesh-gradient.vert. Edit those, then run `pnpm generate`. The markers
 * are load-bearing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type MeshGradientOptions = BaseOptions & {
  /** What the colours are laid over. Usually the palest of the four. */
  base: string
  /** The first colour layer. */
  one: string
  /** The second. */
  two: string
  /** The third. */
  three: string
  /** Size of the shapes. Lower is fewer and larger. */
  scale: number
  /** How far the field is bent before it is read. 0 leaves parallel stripes. */
  warp: number
  /** Width of the transition between layers, 0 to 1. */
  softness: number
  /** How much the field is lit by its own slope. */
  relief: number
  /** Grain, 0 to 1. Static, not crawling film grain. */
  grain: number
  /** Seconds for one full cycle. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const meshGradientDefaults: MeshGradientOptions = {
  base: '#fbfaf4',
  one: '#ffc9e3',
  two: '#a9d8ff',
  three: '#cdbcff',
  scale: 0.75,
  warp: 0.42,
  softness: 0.6,
  relief: 0.16,
  grain: 0.3,
  period: 36,
  reducedMotionTime: 9
}

// beamish:shader-begin shaders/mesh-gradient.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/mesh-gradient.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * MeshGradient: the soft flowing colour field that sits behind half the
 * software marketing on the web, and behind Stripe's home page in particular.
 *
 * It is worth being precise about what that effect actually is, because the
 * name people give it is wrong in a way that matters. It is not a CSS gradient
 * with more stops and it is not a blurred photograph of some blobs. The
 * original is a plane cut into a grid of a few hundred vertices, each one
 * pushed around by layered noise, with three or four colour layers blended over
 * each other by more noise. The faint sense of a surface being folded rather
 * than a picture being blurred comes from the geometry: the shading follows the
 * displacement.
 *
 * This reproduces that in a fragment shader, with the three ingredients the
 * original has and nothing else:
 *
 *   Layered waves. Several octaves, each finer and weaker than the last. That
 *   is what gives the field its scale: broad shapes with detail inside them,
 *   rather than one smooth blob or one busy texture.
 *
 *   A domain warp. The field is read at a position pushed sideways by another
 *   field, which is what bends the bands around each other instead of leaving
 *   them as parallel stripes.
 *
 *   Shading from the slope. The same derivative that would have moved a vertex
 *   is used to light the result, so the colour has a direction to it. Take this
 *   out and the whole thing flattens into wallpaper, which is the difference
 *   between this and most of the copies of it.
 *
 * The diagonal edge people associate with the effect is not in here and should
 * not be: on the original it is the container, skewed with CSS and clipped. The
 * recipe says how, because it is two lines and it is not the shader's business.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_base;
uniform vec3  u_one;
uniform vec3  u_two;
uniform vec3  u_three;

uniform float u_scale;
uniform float u_warp;
uniform float u_softness;
uniform float u_relief;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * A field of travelling waves, returned as value and slope together.
 *
 * The frequencies are in cycles across the unit square rather than radians,
 * because a frequency only means anything against the width it has to cross.
 * The time coefficients are whole numbers of turns over the period, so the loop
 * closes exactly: the alternative is noise advanced by time, which never
 * returns to its first frame and which the recorder cannot use.
 *
 * The slope comes from the same expression as the value. It is not an
 * optimisation, it is the shading: on the original effect the light follows the
 * displacement of the mesh, and this is the same derivative that displacement
 * would have used.
 */
vec3 field(vec2 p, float phase, float seed) {
  vec2 dirs[4] = vec2[4](
    vec2(0.93, 0.37),
    vec2(-0.48, 0.88),
    vec2(0.31, -0.95),
    vec2(-0.89, -0.46)
  );
  float freq[4] = float[4](0.38, 0.71, 1.29, 2.23);
  float amp[4] = float[4](1.0, 0.54, 0.28, 0.14);
  float harm[4] = float[4](1.0, 1.0, 2.0, 2.0);

  float v = 0.0;
  vec2 slope = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    float k = freq[i] * TAU;
    float arg = dot(p, dirs[i]) * k + phase * harm[i] + seed * (float(i) + 1.7);
    v += amp[i] * sin(arg);
    slope += amp[i] * cos(arg) * k * dirs[i];
  }
  return vec3(v / 1.96, slope / 1.96);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 p = (cssPx - cssRes * 0.5) / max(shortSide, 1.0) * max(u_scale, 0.05);

  float phase = TAU * u_time / max(u_period, 0.001);

  /*
   * The warp. Two more fields push the plane sideways before it is read, which
   * is what bends the bands around each other. Without it they are stripes, and
   * stripes are what gives away most attempts at this.
   *
   * It is frozen rather than moving: the layers drifting through a fixed warp
   * is a field flowing through a shape, and warping the warp as well doubles
   * the measured change per frame for something that reads as the whole image
   * sliding.
   */
  vec3 wx = field(p + vec2(4.1, 0.7), 0.0, 1.0);
  vec3 wy = field(p + vec2(-1.9, 3.3), 0.0, 2.0);
  vec2 q = p + u_warp * vec2(wx.x, wy.x);

  vec2 jx = vec2(1.0 + u_warp * wx.y, u_warp * wx.z);
  vec2 jy = vec2(u_warp * wy.y, 1.0 + u_warp * wy.z);

  vec3 col = u_base;
  vec2 shade = vec2(0.0);

  /*
   * Three colour layers, each its own field, each blended over what is already
   * there. Soft edges rather than hard ones: \`softness\` is the width of the
   * transition, and it is the single control that decides whether this reads as
   * a gradient or as a map of three countries.
   */
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 f = field(q * (1.0 + fi * 0.31), phase, 3.0 + fi * 2.3);
    float a = smoothstep(-u_softness, u_softness, f.x - 0.12 + fi * 0.06);

    vec3 tint = i == 0 ? u_one : (i == 1 ? u_two : u_three);
    col = mix(col, tint, a);

    // The slope of this layer, carried through the warp by the chain rule, and
    // weighted by how much of this layer is actually showing here.
    vec2 g = vec2(dot(f.yz, jx), dot(f.yz, jy));
    shade += g * a;
  }

  /*
   * Lit by its own slope. One light, from the upper left, which is where light
   * is in every photograph anybody has ever liked.
   */
  float lift = dot(normalize(shade + vec2(1e-4)), normalize(vec2(-0.6, 0.8)));
  col *= 1.0 + lift * u_relief * min(length(shade), 1.5);

  float tooth = hash12(floor(gl_FragCoord.xy * 0.5)) - 0.5;
  col += tooth * 0.035 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_base',
  'u_one',
  'u_two',
  'u_three',
  'u_scale',
  'u_warp',
  'u_softness',
  'u_relief',
  'u_grain'
] as const

type UniformName = (typeof UNIFORMS)[number]

/** '#rgb' | '#rrggbb' | 'rgb(r g b)' → 0 to 1 triple. */
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
  if (!shader) throw new Error('MeshGradient: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`MeshGradient: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class MeshGradientSurface implements Surface<MeshGradientOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('MeshGradient needs a canvas')
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
    if (!gl) throw new Error('MeshGradient needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('MeshGradient: could not create program')
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
      throw new Error(`MeshGradient: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: MeshGradientOptions): void {
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
    gl.uniform3fv(at('u_base'), parseColor(opts.base))
    gl.uniform3fv(at('u_one'), parseColor(opts.one))
    gl.uniform3fv(at('u_two'), parseColor(opts.two))
    gl.uniform3fv(at('u_three'), parseColor(opts.three))
    gl.uniform1f(at('u_scale'), opts.scale)
    gl.uniform1f(at('u_warp'), opts.warp)
    gl.uniform1f(at('u_softness'), opts.softness)
    gl.uniform1f(at('u_relief'), opts.relief)
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
 * Mount MeshGradient into `el`. The element needs a size. Give it width and
 * height in CSS, not just content.
 *
 * ```ts
 * const mesh = createMeshGradient(document.querySelector('#bg')!)
 * mesh.start()
 * // …later
 * mesh.destroy()
 * ```
 */
export function createMeshGradient(
  el: HTMLElement,
  opts: Partial<MeshGradientOptions> = {}
): EffectHandle {
  return mount<MeshGradientOptions>(el, opts, {
    defaults: meshGradientDefaults,
    create: () => new MeshGradientSurface()
  })
}

export default createMeshGradient
