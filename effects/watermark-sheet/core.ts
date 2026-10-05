/*
 * WatermarkSheet: Beamish
 * https://beamish.ink/effects/watermark-sheet
 *
 * A sheet of handmade paper held up to the light.
 *
 * Everything here is thickness. Paper is translucent, so what you see against a
 * light is not ink but where the sheet is thinner and lets more through. The
 * laid lines are the close-set wires of the mould the sheet was formed on. The
 * chain lines are the heavier wires at right angles holding those together, an
 * inch or so apart. The formation is the cloudiness, because fibres never settle
 * evenly, and that is most of what separates a handmade sheet from a machine
 * one. The watermark proper is a wire device sewn onto the mould, where the
 * sheet is thinnest and brightest.
 *
 * Nothing in here darkens. Every term lightens the paper, because every term is
 * somewhere the sheet is thinner.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type WatermarkSheetOptions = BaseOptions & {
  /** The sheet seen front on. */
  paper: string
  /** What comes through where the sheet is thinnest. */
  light: string
  /** How much light the close-set mould wires let through. */
  laid: number
  /** Laid wires across the sheet. Higher is a finer mould. */
  laidPitch: number
  /** How much light the heavy cross wires let through. */
  chain: number
  /** Chain wires across the sheet. Rarely more than a handful. */
  chainPitch: number
  /** How unevenly the fibres settled. */
  formation: number
  /** Size of the cloudiness. Lower is a coarser, blotchier sheet. */
  cloud: number
  /** How brightly the wire device shows. */
  device: number
  /** Size of the device, as a share of the short side. */
  deviceSize: number
  /** Angle of the mould to the frame, degrees. */
  angle: number
  /** Paper tooth over the whole thing. */
  grain: number
  /** Seconds for one tilt against the light. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const watermarkSheetDefaults: WatermarkSheetOptions = {
  paper: '#efede7',
  light: '#fffdf6',
  laid: 0.32,
  laidPitch: 210,
  chain: 0.5,
  chainPitch: 1.6,
  formation: 0.5,
  cloud: 2.4,
  device: 0.75,
  deviceSize: 0.4,
  angle: 4,
  grain: 0.35,
  period: 40,
  reducedMotionTime: 5
}

// beamish:shader-begin shaders/watermark-sheet.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/watermark-sheet.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * WatermarkSheet: a sheet of handmade paper held up to the light.
 *
 * Everything here is thickness. Paper is translucent, so what you see against a
 * light is not ink but where the sheet is thinner and lets more through. Three
 * things make it thinner, and all three are on the mould the sheet was formed
 * on rather than in the pulp.
 *
 * The laid lines are the close-set wires of the mould, so the sheet is slightly
 * thinner over each one. The chain lines are the heavier wires at right angles
 * holding those together, spaced an inch or so apart. And the formation is the
 * cloudiness: fibres never settle evenly, and the blotchy variation that gives
 * is the difference between handmade paper and a machine sheet.
 *
 * The watermark proper is a wire device sewn onto the mould. The sheet is much
 * thinner there, which is why a watermark is brighter than everything around it
 * and why it only shows against a light.
 *
 * Nothing in here darkens. Every term lightens the paper, because every term is
 * somewhere the sheet is thinner.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_light;
uniform float u_laid;
uniform float u_laidPitch;
uniform float u_chain;
uniform float u_chainPitch;
uniform float u_formation;
uniform float u_cloud;
uniform float u_device;
uniform float u_deviceSize;
uniform float u_angle;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;
const float DEG = 0.01745329252;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += noise(p) * amp;
    p *= 2.07;
    amp *= 0.5;
  }
  return sum;
}

vec2 rot(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
}

/*
 * A ring with a bar across it: a countermark, the plain device a mill used when
 * it was not using its own emblem. Drawn as a signed distance so the wire has an
 * even thickness all the way round, which a wire does.
 */
float countermark(vec2 p, float size) {
  float ring = abs(length(p) - size) - size * 0.085;
  vec2 b = abs(p) - vec2(size * 1.25, size * 0.075);
  float bar = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);
  return min(ring, bar);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 p = (cssPx - cssRes * 0.5) / (shortSide * 0.5);

  // The mould sits at its own angle to the frame, so the wires are not
  // obediently square to the screen.
  vec2 mould = rot(p, u_angle * DEG);

  /*
   * The sheet is tilted slowly against the light rather than anything moving on
   * it. A closed orbit, so after one period it is back where it began.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  vec2 orbit = vec2(cos(phase), sin(phase)) * 0.22;

  // Laid lines: close-set wires, so a fine ripple rather than hard lines. The
  // sheet is thinner over each wire, so each one lets a little more light.
  float laid = (sin(mould.y * u_laidPitch) * 0.5 + 0.5) * u_laid;

  /*
   * Chain lines: the heavy wires at right angles, an inch or so apart. A narrow
   * band rather than a ripple, because the sheet is drawn down sharply over a
   * thick wire rather than following it.
   */
  float chainPhase = fract(mould.x * u_chainPitch);
  float chainBand = 1.0 - smoothstep(0.0, 0.06, min(chainPhase, 1.0 - chainPhase));
  float chain = chainBand * u_chain;

  // Formation: fibres never settle evenly, and this cloudiness is most of what
  // separates a handmade sheet from a machine one.
  float formation = (fbm(p * u_cloud + orbit) - 0.5) * u_formation;

  // The device, which is much thinner than anything else and therefore the
  // brightest thing on the sheet.
  float wire = countermark(rot(p, u_angle * DEG), max(u_deviceSize, 0.01));
  float aa = fwidth(wire) + 0.001;
  float device = (1.0 - smoothstep(0.0, aa * 2.0, wire)) * u_device;

  // Everything lightens. Every term is somewhere the sheet is thinner, and a
  // thin sheet passes more light; nothing here is ink.
  float through = clamp(laid + chain + formation + device, 0.0, 1.0);
  vec3 col = mix(u_paper, u_light, through);

  float tooth = hash12(floor(cssPx * 0.5) + 23.0) - 0.5;
  col += tooth * 0.045 * u_grain;

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
  'u_light',
  'u_laid',
  'u_laidPitch',
  'u_chain',
  'u_chainPitch',
  'u_formation',
  'u_cloud',
  'u_device',
  'u_deviceSize',
  'u_angle',
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
  if (!shader) throw new Error('WatermarkSheet: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`WatermarkSheet: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class WatermarkSheetSurface implements Surface<WatermarkSheetOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('WatermarkSheet needs a canvas')
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
    if (!gl) throw new Error('WatermarkSheet needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('WatermarkSheet: could not create program')
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
      throw new Error(`WatermarkSheet: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: WatermarkSheetOptions): void {
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
    gl.uniform3fv(loc('u_light'), rgb(opts.light))
    gl.uniform1f(loc('u_laid'), opts.laid)
    gl.uniform1f(loc('u_laidPitch'), opts.laidPitch)
    gl.uniform1f(loc('u_chain'), opts.chain)
    gl.uniform1f(loc('u_chainPitch'), opts.chainPitch)
    gl.uniform1f(loc('u_formation'), opts.formation)
    gl.uniform1f(loc('u_cloud'), opts.cloud)
    gl.uniform1f(loc('u_device'), opts.device)
    gl.uniform1f(loc('u_deviceSize'), opts.deviceSize)
    gl.uniform1f(loc('u_angle'), opts.angle)
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
 * Mount WatermarkSheet into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const marbled = createWatermarkSheet(document.querySelector('#hero')!)
 * marbled.start()
 * // …later
 * marbled.destroy()
 * ```
 */
export function createWatermarkSheet(
  el: HTMLElement,
  opts: Partial<WatermarkSheetOptions> = {}
): EffectHandle {
  return mount<WatermarkSheetOptions>(el, opts, {
    defaults: watermarkSheetDefaults,
    create: () => new WatermarkSheetSurface()
  })
}

export default createWatermarkSheet
