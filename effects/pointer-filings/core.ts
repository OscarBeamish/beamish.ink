/*
 * PointerFilings: Beamish
 * https://beamish.ink/effects/pointer-filings
 *
 * Iron filings over a magnet, and the magnet is the cursor.
 *
 * Filings do not point at a magnet, which is the thing most versions of this get
 * wrong. They align with the field, and the field of a dipole loops: out of one
 * pole, round, and back into the other. Spokes radiating from a point are what a
 * single charge gives, and a single magnetic charge is not a thing that exists.
 *
 * So the shader evaluates the real dipole expression and lays a short segment
 * along it. The loops come out of the maths rather than being drawn.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface, type Pointer } from '../../shared/runtime'

export type PointerFilingsOptions = BaseOptions & {
  /** The tray the filings are scattered on. */
  paper: string
  /** A filing lying flat, away from the magnet. */
  ink: string
  /** A filing standing up in a strong field. */
  accent: string
  /** Cell size in CSS pixels. One filing per cell, so this is the scatter. */
  pitch: number
  /** Length of a filing, in cells, where the field is strongest. */
  length: number
  /** Half the thickness of a filing, in cells. */
  weight: number
  /** How far the magnet reaches before the filings stop caring. */
  reach: number
  /** How far each filing is thrown off the centre of its cell. */
  jitter: number
  /** Angle of the bar magnet, degrees. Turns the whole pattern. */
  tilt: number
  /** Paper tooth under the filings. */
  grain: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const pointerFilingsDefaults: PointerFilingsOptions = {
  paper: '#fbfaf4',
  ink: '#8d8577',
  accent: '#36362f',
  pitch: 13,
  length: 0.42,
  weight: 0.055,
  reach: 0.02,
  jitter: 0.6,
  tilt: 0,
  grain: 0.4,
  reducedMotionTime: 0,
  /*
   * Window scope, so the filings have already begun to turn as the cursor comes
   * toward the element rather than snapping the moment it crosses the edge.
   */
  pointerScope: 'window'
}

// beamish:shader-begin shaders/pointer-filings.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/pointer-filings.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * PointerFilings: iron filings over a magnet, and the magnet is the cursor.
 *
 * Filings do not point at a magnet, which is the thing most versions of this get
 * wrong. They align with the field, and the field of a dipole loops: out of one
 * pole, round, and back into the other. Spokes radiating from a point are what
 * you get from a single charge, and a single magnetic charge is not a thing that
 * exists.
 *
 * So this evaluates the real dipole expression. For a moment m at distance r the
 * field runs along 3(m . rhat)rhat - m, and every mark is a short segment laid
 * along it. The loops come out of the maths rather than being drawn.
 *
 * One mark per cell, thrown off centre, so the grid the marks are organised by
 * never shows. Each pixel is tested against the nine cells around it, because a
 * segment is long enough to cross well into its neighbours.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform vec2  u_pointer;
uniform float u_active;

uniform vec3  u_paper;
uniform vec3  u_ink;
uniform vec3  u_accent;
uniform float u_pitch;
uniform float u_length;
uniform float u_weight;
uniform float u_reach;
uniform float u_jitter;
uniform float u_tilt;
uniform float u_grain;

out vec4 fragColor;

const float DEG = 0.01745329252;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  return vec2(hash12(p), hash12(p + 37.19));
}

/*
 * Distance to a line segment of halfLen-length \`halfLen\` centred on the origin and
 * lying along \`dir\`. Clamping the projection is what makes it a segment rather
 * than an infinite line, and it is the whole of the shape.
 */
float segment(vec2 p, vec2 dir, float halfLen, float radius) {
  float t = clamp(dot(p, dir), -halfLen, halfLen);
  return length(p - dir * t) - radius;
}

/*
 * The field of a dipole with moment m at offset r. This is the expression a
 * physics text gives, minus the constants, which only scale something that is
 * normalised two lines later anyway.
 */
vec2 dipole(vec2 r, vec2 m) {
  float d = max(length(r), 1e-4);
  vec2 rhat = r / d;
  return (3.0 * dot(m, rhat) * rhat - m) / (d * d * d);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);

  // The pointer arrives 0 to 1 across the element with y down the page, and
  // gl_FragCoord counts up from the bottom.
  vec2 magnet = vec2(u_pointer.x, 1.0 - u_pointer.y) * cssRes;

  // The bar the moment lies along. Tilting it turns the whole pattern, which is
  // what you would do by turning the magnet on the bench.
  vec2 m = vec2(cos(u_tilt * DEG), sin(u_tilt * DEG));

  vec2 cell = cssPx / max(u_pitch, 2.0);
  vec2 id = floor(cell);
  vec2 f = fract(cell);

  float aa = max(fwidth(cell.x), fwidth(cell.y)) * 0.9 + 0.001;
  float cover = 0.0;
  float heat = 0.0;

  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 nid = id + vec2(float(ox), float(oy));
      vec2 jitter = (hash22(nid) - 0.5) * u_jitter;
      vec2 centre = vec2(float(ox), float(oy)) + 0.5 + jitter;

      // Where this mark sits on screen, so the field is sampled at the mark
      // rather than at the pixel. Sampling per pixel bends each segment into a
      // curve, which no single filing does.
      vec2 markPx = (id + centre) * max(u_pitch, 2.0);
      vec2 r = (markPx - magnet) / shortSide;

      vec2 b = dipole(r, m);
      float strength = length(b);
      vec2 dir = strength > 1e-6 ? b / strength : vec2(1.0, 0.0);

      /*
       * Near the magnet the dipole expression runs away to infinity, so the
       * falloff is a ratio rather than a product: it saturates at 1 instead of
       * producing a handful of enormous marks at the centre.
       */
      float pull = strength / (strength + 1.0 / max(u_reach, 0.001));

      // Unaligned filings lie flat and short; a strong field stands them up in
      // a line. Length carrying the strength is what makes the pattern legible
      // without the marks changing weight.
      float halfLen = u_length * mix(0.18, 1.0, pull);
      float sd = segment(f - centre, dir, halfLen, u_weight);
      float mark = smoothstep(aa, -aa, sd);

      cover = max(cover, mark);
      heat = max(heat, mark * pull);
    }
  }

  // Idle: with no pointer the field is centred and the pattern is static, which
  // is a filing tray nobody has touched rather than a broken effect.
  cover *= mix(0.55, 1.0, u_active);

  vec3 ink = mix(u_ink, u_accent, smoothstep(0.1, 0.55, heat));
  vec3 col = mix(u_paper, ink, cover);

  float tooth = hash12(floor(cssPx * 0.5) + 3.0) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_pointer',
  'u_active',
  'u_paper',
  'u_ink',
  'u_accent',
  'u_pitch',
  'u_length',
  'u_weight',
  'u_reach',
  'u_jitter',
  'u_tilt',
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

class PointerFilingsSurface implements Surface<PointerFilingsOptions> {
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

  render(_t: number, opts: PointerFilingsOptions, pointer: Pointer): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)

    const loc = (name: UniformName) => this.locations.get(name) ?? null

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform2f(loc('u_pointer'), pointer.x, pointer.y)
    gl.uniform1f(loc('u_active'), pointer.active ? 1 : 0)
    gl.uniform3fv(loc('u_paper'), parseColor(opts.paper))
    gl.uniform3fv(loc('u_ink'), parseColor(opts.ink))
    gl.uniform3fv(loc('u_accent'), parseColor(opts.accent))
    gl.uniform1f(loc('u_pitch'), opts.pitch)
    gl.uniform1f(loc('u_length'), opts.length)
    gl.uniform1f(loc('u_weight'), opts.weight)
    gl.uniform1f(loc('u_reach'), opts.reach)
    gl.uniform1f(loc('u_jitter'), opts.jitter)
    gl.uniform1f(loc('u_tilt'), opts.tilt)
    gl.uniform1f(loc('u_grain'), opts.grain)

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
 * const foil = createPointerFilings(document.querySelector('#stamp')!)
 * foil.start()
 * // …later
 * foil.destroy()
 * ```
 */
export function createPointerFilings(el: HTMLElement, opts: Partial<PointerFilingsOptions> = {}): EffectHandle {
  return mount<PointerFilingsOptions>(el, opts, {
    defaults: pointerFilingsDefaults,
    create: () => new PointerFilingsSurface()
  })
}

export default createPointerFilings
