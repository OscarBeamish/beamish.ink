/*
 * Overprint — Beamish
 * https://beamish.ink/effects/overprint
 *
 * Two ink plates drifting out of registration behind a halftone screen, on warm
 * paper. WebGL2, no three.js, no dependencies.
 *
 * The GL boilerplate is inline rather than imported. This file is published and
 * read on its own, and a reader should not have to fetch a second module to find
 * out how a program gets compiled.
 *
 * The shader source is generated from shaders/overprint.frag and
 * shaders/overprint.vert — edit those, then run `pnpm generate`. The markers are
 * load-bearing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type OverprintOptions = BaseOptions & {
  /** Paper colour. The whole effect is designed against a warm off-white. */
  paper: string
  /** First plate. A desaturated near-black reads as ink; pure black does not. */
  inkA: string
  /** Second plate. This is where the colour lives. */
  inkB: string
  /** Size of the ink shapes. Lower is broader. */
  scale: number
  /** Halftone dots per 100 CSS pixels. Above ~40 the screen stops reading as one. */
  screen: number
  /** Screen angle of plate A, degrees. */
  angleA: number
  /** Screen angle of plate B, degrees. Keep ~30 from angleA or the plates moiré. */
  angleB: number
  /** Registration error in CSS pixels — how far the plates slide apart. */
  drift: number
  /** Ink density, 0–1. */
  coverage: number
  /** Paper tooth, 0–1. Static, not film grain. */
  grain: number
  /** Seconds for one full loop. The animation is exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const overprintDefaults: OverprintOptions = {
  paper: '#fbfaf4',
  inkA: '#363630',
  inkB: '#c44400',
  scale: 1.9,
  screen: 8,
  angleA: 15,
  angleB: 75,
  drift: 5,
  coverage: 0.42,
  grain: 0.35,
  period: 5,
  reducedMotionTime: 1.4
}

// beamish:shader-begin shaders/overprint.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID — no buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/overprint.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * Overprint — two ink plates drifting out of registration behind a halftone
 * screen, composited the way ink actually behaves on paper: multiplied, not
 * added. Additive light on a dark canvas is the easy version of this and it is
 * the one everybody else ships.
 *
 * Everything animates on a circle in noise space, so the loop is exactly
 * periodic over u_period and the recorded video is seamless with no crossfade.
 */

uniform vec2  u_resolution;  // drawing buffer, device px
uniform float u_dpr;
uniform float u_time;        // seconds
uniform float u_period;      // loop length, seconds
uniform vec3  u_paper;
uniform vec3  u_inkA;
uniform vec3  u_inkB;
uniform float u_scale;
uniform float u_screen;      // halftone dots per 100 CSS px
uniform float u_angleA;      // screen angle, degrees
uniform float u_angleB;
uniform float u_drift;       // registration error, CSS px
uniform float u_coverage;    // 0..1 ink density
uniform float u_grain;       // 0..1 paper tooth

out vec4 fragColor;

const float TAU = 6.28318530718;

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * gnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

mat2 rot(float degrees) {
  float a = radians(degrees);
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

/*
 * Area-proportional halftone dot. Radius goes as sqrt(value) so apparent tone is
 * linear in \`value\`, which is what a real screen does. Anti-aliased against the
 * screen-space derivative, so it stays clean at any DPR instead of buzzing.
 */
float halftone(vec2 cssPx, float angle, float value, float freq) {
  vec2 g = rot(angle) * cssPx * freq;
  vec2 cell = fract(g) - 0.5;
  float d = length(cell) * 2.0;
  // 1.45, not 1.0: the cell corners are sqrt(2) from the centre, so a dot that
  // stops at 1.0 can never close up and the darkest tone tops out around 78%.
  float r = sqrt(clamp(value, 0.0, 1.0)) * 1.45;
  float aa = fwidth(d) * 1.2 + 1e-4;
  return 1.0 - smoothstep(r - aa, r + aa, d);
}

/*
 * fbm lands in roughly -0.5..0.5 and clusters hard around the middle. Left alone
 * that maps to one flat mid-tone across the whole canvas — a rug, not a print.
 * Amplify first, then window: the amplification buys real highlights where the
 * paper shows through, and real solids.
 */
float tone(float raw, float coverage) {
  float v = clamp(raw * 1.7 + 0.5, 0.0, 1.0);
  float edge = 1.0 - coverage;
  return smoothstep(edge - 0.30, edge + 0.30, v);
}

void main() {
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = min(u_resolution.x, u_resolution.y) / max(u_dpr, 0.001);
  vec2 uv = cssPx / max(shortSide, 1.0);

  float phase = TAU * u_time / max(u_period, 0.001);

  // A closed orbit through noise space. Any path that returns to its start works;
  // a circle is the one with no easing artefact at the seam.
  // Amplitudes are small on purpose. The loop is short so that a five-second
  // recording is a whole cycle; the calm comes from how far the field travels,
  // not from how long it takes.
  vec2 orbitA = vec2(cos(phase), sin(phase)) * 0.30;
  vec2 orbitB = vec2(cos(phase + 2.1), sin(phase + 2.1)) * 0.24 + vec2(11.3, -6.7);

  float rawA = fbm(uv * u_scale + orbitA);
  float rawB = fbm(uv * u_scale * 1.18 + orbitB);

  // Plate B carries a little less ink than plate A, which is what stops the two
  // reading as one muddy colour where they overlap.
  float valueA = tone(rawA, u_coverage);
  float valueB = tone(rawB, u_coverage * 0.88);

  float freq = u_screen / 100.0;

  // The registration error: plate B's screen slides against plate A's. Both
  // components are periodic in \`phase\`, so the seam is exact.
  vec2 misfit = vec2(cos(phase + 1.7), sin(phase * 2.0 + 0.4)) * u_drift;

  float dotA = halftone(cssPx, u_angleA, valueA, freq);
  float dotB = halftone(cssPx + misfit, u_angleB, valueB, freq);

  // Multiply, because that is what a second pass of ink does to the first.
  vec3 col = u_paper;
  col *= mix(vec3(1.0), u_inkA, dotA);
  col *= mix(vec3(1.0), u_inkB, dotB);

  // Static tooth, not animated film grain. Animated grain flickers, and a
  // flicker this fine is exactly what WCAG 2.3.1 is about.
  float tooth = hash12(floor(cssPx)) - 0.5;
  col += tooth * 0.055 * u_grain;

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
  'u_inkA',
  'u_inkB',
  'u_scale',
  'u_screen',
  'u_angleA',
  'u_angleB',
  'u_drift',
  'u_coverage',
  'u_grain'
] as const

type UniformName = (typeof UNIFORMS)[number]

/** '#rgb' | '#rrggbb' | 'rgb(r g b)' → linear-ish 0–1 triple. */
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
  if (!shader) throw new Error('Overprint: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Overprint: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class OverprintSurface implements Surface<OverprintOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement }): void {
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
    if (!gl) throw new Error('Overprint needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('Overprint: could not create program')
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
      throw new Error(`Overprint: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: OverprintOptions): void {
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
    gl.uniform3fv(at('u_inkA'), parseColor(opts.inkA))
    gl.uniform3fv(at('u_inkB'), parseColor(opts.inkB))
    gl.uniform1f(at('u_scale'), opts.scale)
    gl.uniform1f(at('u_screen'), opts.screen)
    gl.uniform1f(at('u_angleA'), opts.angleA)
    gl.uniform1f(at('u_angleB'), opts.angleB)
    gl.uniform1f(at('u_drift'), opts.drift)
    gl.uniform1f(at('u_coverage'), opts.coverage)
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
 * Mount Overprint into `el`. The element needs a size — give it width and height
 * in CSS, not just content.
 *
 * ```ts
 * const overprint = createOverprint(document.querySelector('#bg')!)
 * overprint.start()
 * // …later
 * overprint.destroy()
 * ```
 */
export function createOverprint(
  el: HTMLElement,
  opts: Partial<OverprintOptions> = {}
): EffectHandle {
  return mount<OverprintOptions>(el, opts, {
    defaults: overprintDefaults,
    create: () => new OverprintSurface()
  })
}

export default createOverprint
