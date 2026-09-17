/*
 * Foil: Beamish
 * https://beamish.ink/effects/pointer-foil-sheen
 *
 * A hot-foil stamp on paper, lit by the cursor. Moving the pointer rakes the
 * highlight across the relief the way tilting a real foil-stamped card does.
 * WebGL2, no three.js, no dependencies.
 *
 * With no pointer the light takes a slow closed orbit of its own, so the panel
 * is alive before anyone touches it, and the recorded loop still has no seam.
 *
 * The GL boilerplate is inline rather than imported. This file is published and
 * read on its own, and a reader should not have to fetch a second module to find
 * out how a program gets compiled.
 *
 * The shader source is generated from shaders/pointer-foil-sheen.frag and shaders/pointer-foil-sheen.vert.
 * Edit those, then run `pnpm generate`. The markers are load-bearing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface, type Pointer } from '../../shared/runtime'

export type PointerFoilSheenOptions = BaseOptions & {
  /** The paper the stamp is pressed into. Match it to your page background. */
  paper: string
  /** The foil in shadow. */
  foilLow: string
  /** The foil at the highlight. */
  foilHigh: string
  /** Points on the rosette. */
  spokes: number
  /** Size of the stamp relative to the shorter side of the element. */
  scale: number
  /** Depth of the brushed relief, 0 to 1. */
  relief: number
  /** How tight the highlight is, 0 to 1. */
  sharpness: number
  /** Spectral shift at grazing angles, 0 to 1. */
  iridescence: number
  /** How far above the surface the light sits. Low is a harder rake. */
  lightHeight: number
  /** Paper tooth, 0 to 1. Static, not film grain. */
  grain: number
  /** Seconds for one orbit of the idle light. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const pointerFoilSheenDefaults: PointerFoilSheenOptions = {
  paper: '#fbfaf4',
  foilLow: '#7a3410',
  foilHigh: '#f0b070',
  spokes: 12,
  scale: 0.86,
  relief: 0.38,
  sharpness: 0.42,
  iridescence: 0.3,
  lightHeight: 0.42,
  grain: 0.3,
  period: 5,
  reducedMotionTime: 0.9
}

// beamish:shader-begin shaders/pointer-foil-sheen.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/pointer-foil-sheen.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * Foil: a hot-foil stamp on paper, lit by the cursor.
 *
 * The stamp is an SDF rosette with a brushed relief pressed into it. The cursor
 * is the light: a point source just above the surface, so moving it rakes the
 * highlight across the foil the way tilting a real foil-stamped card does.
 *
 * There is no texture and no image. The whole thing is the height field, its
 * gradient, and one specular term.
 */

uniform vec2  u_resolution;   // drawing buffer, device px
uniform float u_dpr;
uniform float u_time;
uniform float u_period;
uniform vec2  u_pointer;      // 0..1 across the element, y down
uniform float u_pointerActive;
uniform vec3  u_paper;
uniform vec3  u_foilLow;
uniform vec3  u_foilHigh;
uniform float u_spokes;
uniform float u_scale;
uniform float u_relief;
uniform float u_sharpness;
uniform float u_iridescence;
uniform float u_lightHeight;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * The stamp, as a height field in 0..1. Everything the light does is derived
 * from this one function, sampled five times per pixel: once for the mask and
 * four times for the gradient.
 */
float stamp(vec2 p, float spokes, float relief) {
  float r = length(p);
  float a = atan(p.y, p.x);

  // Petal boundary: a circle modulated by a cosine, which is the whole rosette.
  float edge = 0.60 + 0.15 * cos(a * spokes);
  float body = smoothstep(edge, edge - 0.05, r);

  // A hub, so the centre does not collapse where the petals meet.
  float hub = smoothstep(0.21, 0.17, r);

  // A thin ring holding the composition together.
  float ring = smoothstep(0.92, 0.885, r) * smoothstep(0.825, 0.86, r);

  float mask = clamp(max(max(body, hub), ring), 0.0, 1.0);

  // Brushed relief. This is the part the highlight rakes over. Without it the
  // foil is a flat shape that changes brightness, which reads as plastic.
  //
  // The amplitude falls away towards the centre. Radial lines all converge on
  // the origin, and at full strength that convergence is the first thing the eye
  // goes to, which is not what the piece is about.
  float brush = 0.5 + 0.5 * sin(a * spokes * 3.0 + r * 24.0);
  float depth = relief * smoothstep(0.12, 0.42, r);
  return mask * (1.0 - depth * 0.5 + depth * 0.5 * brush);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  // Origin at the centre, ±1 across the short axis.
  vec2 p = (cssPx - cssRes * 0.5) / (shortSide * 0.5);
  p /= max(u_scale, 0.05);

  // gl_FragCoord counts up from the bottom and the pointer counts down from the
  // top, so one of them has to be flipped. It is always this line that is wrong.
  vec2 pointerPx = vec2(u_pointer.x * cssRes.x, (1.0 - u_pointer.y) * cssRes.y);
  vec2 lightXY = (pointerPx - cssRes * 0.5) / (shortSide * 0.5) / max(u_scale, 0.05);

  // With no pointer the light takes a slow closed orbit, so the effect is alive
  // before anyone touches it and the loop still has no seam.
  float phase = TAU * u_time / max(u_period, 0.001);
  vec2 idle = vec2(cos(phase), sin(phase)) * 0.85;
  lightXY = mix(idle, lightXY, u_pointerActive);

  float height = stamp(p, u_spokes, u_relief);

  // Finite differences in world units rather than screen derivatives, so the
  // relief is the same depth at any resolution or DPR.
  float eps = 2.4 / shortSide / max(u_scale, 0.05);
  float dx = stamp(p + vec2(eps, 0.0), u_spokes, u_relief) - stamp(p - vec2(eps, 0.0), u_spokes, u_relief);
  float dy = stamp(p + vec2(0.0, eps), u_spokes, u_relief) - stamp(p - vec2(0.0, eps), u_spokes, u_relief);
  vec3 normal = normalize(vec3(-dx * 0.55, -dy * 0.55, 2.0 * eps));

  vec3 toLight = normalize(vec3(lightXY - p, max(u_lightHeight, 0.05)));
  vec3 toEye = vec3(0.0, 0.0, 1.0);
  vec3 half3 = normalize(toLight + toEye);
  float ndh = clamp(dot(normal, half3), 0.0, 1.0);
  float ndl = clamp(dot(normal, toLight), 0.0, 1.0);

  float tight = pow(ndh, 8.0 + u_sharpness * 220.0);
  float broad = pow(ndh, 3.0);

  // Metal has almost no diffuse term. The colour comes from the highlight, which
  // is why a foil looks like foil and a matte print does not.
  vec3 foil = mix(u_foilLow, u_foilHigh, smoothstep(0.15, 0.95, ndh));

  // A narrow spectral shift near grazing angles. Restrained on purpose. A full
  // rainbow is a hologram, not a foil.
  float shift = fract(ndh * 1.6 + 0.35);
  vec3 spectral = 0.5 + 0.5 * cos(TAU * (vec3(0.0, 0.28, 0.55) + shift));
  foil = mix(foil, foil * (0.6 + 0.8 * spectral), u_iridescence * (1.0 - ndh) * 0.9);

  foil += vec3(1.0, 0.97, 0.92) * tight * 1.35;
  foil += u_foilHigh * broad * 0.22;
  foil *= 0.48 + 0.52 * ndl;

  // The stamp is pressed into the paper, so it throws a short shadow away from
  // the light. Sampling the height field at an offset is the cheapest honest way
  // to get one.
  vec2 offset = normalize(vec2(lightXY - p) + vec2(1e-5)) * 0.014;
  float under = stamp(p - offset, u_spokes, u_relief);
  float press = clamp(under - height, 0.0, 1.0);

  vec3 col = u_paper * (1.0 - press * 0.22);
  col = mix(col, foil, clamp(height * 1.35, 0.0, 1.0));

  // Paper tooth, static. Animated grain flickers, and a flicker this fine is
  // exactly what WCAG 2.3.1 is about.
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
  'u_pointer',
  'u_pointerActive',
  'u_paper',
  'u_foilLow',
  'u_foilHigh',
  'u_spokes',
  'u_scale',
  'u_relief',
  'u_sharpness',
  'u_iridescence',
  'u_lightHeight',
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
  if (!shader) throw new Error('Foil: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Foil: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class PointerFoilSheenSurface implements Surface<PointerFoilSheenOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('Foil needs a canvas')
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
    if (!gl) throw new Error('Foil needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('Foil: could not create program')
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
      throw new Error(`Foil: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: PointerFoilSheenOptions, pointer: Pointer): void {
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
    gl.uniform2f(at('u_pointer'), pointer.x, pointer.y)
    gl.uniform1f(at('u_pointerActive'), pointer.active ? 1 : 0)
    gl.uniform3fv(at('u_paper'), parseColor(opts.paper))
    gl.uniform3fv(at('u_foilLow'), parseColor(opts.foilLow))
    gl.uniform3fv(at('u_foilHigh'), parseColor(opts.foilHigh))
    gl.uniform1f(at('u_spokes'), opts.spokes)
    gl.uniform1f(at('u_scale'), opts.scale)
    gl.uniform1f(at('u_relief'), opts.relief)
    gl.uniform1f(at('u_sharpness'), opts.sharpness)
    gl.uniform1f(at('u_iridescence'), opts.iridescence)
    gl.uniform1f(at('u_lightHeight'), opts.lightHeight)
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
 * Mount Foil into `el`. The element needs a size. Give it width and height in
 * CSS, not just content.
 *
 * ```ts
 * const foil = createPointerFoilSheen(document.querySelector('#stamp')!)
 * foil.start()
 * // …later
 * foil.destroy()
 * ```
 */
export function createPointerFoilSheen(el: HTMLElement, opts: Partial<PointerFoilSheenOptions> = {}): EffectHandle {
  return mount<PointerFoilSheenOptions>(el, opts, {
    defaults: pointerFoilSheenDefaults,
    create: () => new PointerFoilSheenSurface()
  })
}

export default createPointerFoilSheen
