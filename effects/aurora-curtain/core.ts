/*
 * AuroraCurtain: Beamish
 * https://beamish.ink/effects/aurora-curtain
 *
 * The northern lights, on a night sky. WebGL2, no three.js, no dependencies.
 *
 * This one is built for a dark ground and says so in its meta. It is the first
 * item in the library that is: paper is the house style here rather than a rule
 * about what can exist, and an aurora on warm paper would be a worse aurora for
 * no reason.
 *
 * The GL boilerplate is inline rather than imported. This file is published and
 * read on its own, and a reader should not have to fetch a second module to find
 * out how a program gets compiled.
 *
 * The shader source is generated from shaders/aurora-curtain.frag and
 * shaders/aurora-curtain.vert. Edit those, then run `pnpm generate`. The markers
 * are load-bearing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type AuroraCurtainOptions = BaseOptions & {
  /** The night sky behind it. Dark, and not black: a sky has a colour. */
  sky: string
  /** The colour at the foot. Oxygen's green line, which is where it is brightest. */
  low: string
  /** The colour at the top. The slower red transition, high up where the air is thin. */
  high: string
  /** How many curtains, 1 to 3. Each is further away, lower and dimmer. */
  curtains: number
  /** How far up the frame a curtain reaches, as a share of its height. */
  height: number
  /** How hard the curtains fold along their length. 0 is a flat band. */
  fold: number
  /** Contrast of the vertical rays. The single most recognisable thing about an aurora. */
  rays: number
  /** How fine the rays are. Higher is more of them. */
  pitch: number
  /** Overall strength of the light. */
  brightness: number
  /** Stars, 0 to 1. They do not twinkle: see the shader. */
  stars: number
  /** Light on the horizon, 0 to 1. There is always a town somewhere behind you. */
  horizon: number
  /** Sensor noise of a long exposure, 0 to 1. Static, not crawling film grain. */
  grain: number
  /** Seconds for one full cycle. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const auroraCurtainDefaults: AuroraCurtainOptions = {
  sky: '#070b18',
  low: '#45efa0',
  high: '#d8468f',
  curtains: 3,
  height: 0.3,
  fold: 0.62,
  rays: 0.8,
  pitch: 40,
  brightness: 0.8,
  stars: 0.5,
  horizon: 0.45,
  grain: 0.3,
  period: 36,
  reducedMotionTime: 7
}

// beamish:shader-begin shaders/aurora-curtain.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/aurora-curtain.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * AuroraCurtain: the northern lights, built the way they are made.
 *
 * It is not a rainbow gradient with some noise on it, and the difference is
 * most of why those read as wallpaper. An aurora is emission: electrons follow
 * the magnetic field down into the atmosphere and excite gas along the way, so
 * everything about its shape follows from that.
 *
 *   It hangs in vertical rays, because the field lines are near vertical at
 *   those latitudes and the light is emitted along them. That is the striation,
 *   and it is the single most recognisable thing about an aurora.
 *
 *   The bottom edge is sharp and the top is not. The electrons stop at the
 *   altitude where the air finally gets thick enough, which is an abrupt floor
 *   at around 100km, and thin out upwards over hundreds of kilometres.
 *
 *   The colour is altitude. Atomic oxygen gives the green line at 557.7nm low
 *   down, and the red line at 630nm higher up where collisions are rare enough
 *   to let the slower transition happen. So green at the foot running to red at
 *   the top, never the other way round and never a hue cycle.
 *
 *   The curtain folds along its length rather than waving as a whole. What you
 *   are looking at is a sheet seen edge on, so a fold reads as a bright rib.
 *
 * Everything moves on sums of sines whose time coefficients are whole numbers
 * of turns over the period, so the loop closes exactly. A noise field advanced
 * by time would never return to its first frame, and the recorder needs it to.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_sky;
uniform vec3  u_low;
uniform vec3  u_high;

uniform float u_curtains;
uniform float u_height;
uniform float u_fold;
uniform float u_rays;
uniform float u_pitch;
uniform float u_brightness;
uniform float u_stars;
uniform float u_horizon;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * The fold of one curtain along its length.
 *
 * Three sines, and the time coefficients are 1, 2 and 3 turns over the period.
 * Whole numbers are not a detail: a fractional one never comes back to where it
 * started, and the video jumps once a cycle.
 */
float fold(float x, float phase, float seed) {
  float s = sin(x * 2.1 + phase + seed) * 0.55;
  s += sin(x * 4.3 - phase * 2.0 + seed * 2.1) * 0.3;
  s += sin(x * 8.7 + phase * 3.0 + seed * 3.7) * 0.15;
  return s;
}

/*
 * A note on those spatial frequencies, because the first version of this had
 * them ten times too low and the mistake is invisible in the maths.
 *
 * x spans the aspect ratio, so about 1.8 on a wide frame. A term at sin(x * 0.7)
 * turns through 1.25 radians across the whole canvas, which is a fifth of a
 * cycle: not a fold, a tilt. Every curtain came out as one smooth arc and the
 * stack of them read as a hillside. A frequency here is only meaningful against
 * the width it has to cross.
 */

/*
 * The vertical rays, as a modulation along the curtain rather than across it.
 *
 * Three more sines at a much higher spatial frequency. They drift faster than
 * the fold does, which is what makes the curtain look like it is being fed
 * light from somewhere rather than simply swaying.
 */
float striation(float x, float phase, float seed) {
  float s = sin(x * u_pitch + phase * 2.0 + seed) * 0.5;
  s += sin(x * u_pitch * 2.3 - phase * 3.0 + seed * 1.7) * 0.3;
  s += sin(x * u_pitch * 4.7 + phase * 5.0 + seed * 2.9) * 0.2;
  return s;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  // y runs 0 at the horizon to 1 at the top of the frame, which is the way an
  // aurora is measured and saves flipping it in every term below.
  vec2 uv = cssPx / cssRes;
  float aspect = cssRes.x / max(cssRes.y, 1.0);
  float x = (uv.x - 0.5) * aspect;

  float phase = TAU * u_time / max(u_period, 0.001);

  vec3 col = u_sky;

  /*
   * Stars first, so the aurora washes over them rather than sitting under them.
   *
   * One candidate per cell of a fixed grid, which needs no sorting and cannot
   * drift. They do not twinkle: a twinkle is atmospheric scintillation, it is
   * strongest near the horizon and nearly absent overhead, and faking it evenly
   * across the frame costs a per-frame change in every pixel for something
   * nobody looks at.
   */
  vec2 grid = uv * vec2(aspect, 1.0) * 150.0;
  vec2 cell = floor(grid);
  float pick = hash12(cell);
  vec2 at = vec2(hash12(cell + 11.3), hash12(cell + 27.7));
  float d = length(fract(grid) - at);
  float star = step(0.985, pick) * exp(-d * d * 90.0);
  // Brighter overhead, because low stars are seen through more air.
  col += vec3(0.85, 0.89, 1.0) * star * u_stars * smoothstep(0.0, 0.5, uv.y);

  /*
   * A little light on the horizon. Nowhere on Earth is the bottom of the sky
   * as dark as the top: there is always a town somewhere behind you.
   */
  col += u_sky * u_horizon * 3.5 * exp(-uv.y * 6.0);

  int count = int(clamp(u_curtains, 1.0, 3.0));
  vec3 glow = vec3(0.0);

  for (int i = 0; i < 3; i++) {
    if (i >= count) break;
    float fi = float(i);
    float seed = fi * 2.399;

    /*
     * Each curtain is further away than the last: lower in the frame, dimmer,
     * and folded on a slightly different scale. Depth is the whole reason to
     * draw more than one, so if they share a scale they read as one curtain
     * drawn three times.
     */
    float depth = 1.0 - fi * 0.26;
    float scale = 1.0 + fi * 0.37;

    /*
     * Where the foot of this curtain sits. Low in the frame but not at the
     * bottom of it: the bright core is the part worth looking at, and a foot on
     * the horizon line puts it half off the canvas.
     */
    float base = 0.3 + fi * 0.12 + u_fold * fold(x * scale, phase, seed) * 0.14;
    float h = uv.y - base;
    float reach = max(u_height * depth, 0.01);

    /*
     * Two falloffs rather than one, because an aurora is not an even glow: it
     * has a bright core just above the floor, where the air is still dense
     * enough to light up properly, and a long faint tail above it. One
     * exponential gives you the tail or the core, never both, and a single
     * middling one is the gradient wash this effect looked like at first.
     *
     * Both are exponentials, so a curtain still has no top edge. It runs out.
     */
    float tail = exp(-max(h, 0.0) / reach) * 0.22;
    float core = exp(-max(h, 0.0) / (reach * 0.34)) * 0.95;
    float floorEdge = smoothstep(-0.01, 0.018, h);
    // And a little spill below the foot, which is scattered light in the air
    // under it rather than emission.
    float spill = exp(-max(-h, 0.0) / (reach * 0.14)) * 0.16;

    /*
     * Where along its length this curtain is lit at all.
     *
     * This is the part that decides whether the thing reads as a sheet or as a
     * band of colour across the frame. A real curtain has ends and gaps: it is
     * bright in sections and absent in between, and without that every curtain
     * spans the whole width evenly and the eye has nothing to hold onto.
     */
    float env = 0.5 + 0.5 * fold(x * scale * 0.42 + 3.1, phase + 1.7, seed * 1.3);
    env = smoothstep(0.3, 0.95, env);

    float rays = 0.5 + 0.5 * striation(x * scale + fi * 7.0, phase, seed) * u_rays;
    float amount = ((tail + core) * floorEdge + spill) * max(rays, 0.0) * env * depth;

    // Green at the foot, red at the top. Altitude is the only thing that sets
    // the colour of an aurora, so it is the only thing that sets it here.
    vec3 tint = mix(u_low, u_high, clamp(h / (reach * 2.6), 0.0, 1.0));
    glow += tint * amount;
  }

  col += glow * u_brightness;

  /*
   * A soft shoulder rather than a clamp. Three curtains crossing can easily sum
   * past 1, and clipping turns the overlap into a flat white patch with a hard
   * edge, which is the one thing that never happens in the sky.
   */
  col = vec3(1.0) - exp(-col);

  // Grain, which on a dark ground reads as the sensor noise of a long exposure.
  // Static rather than per-frame: film grain that crawls is a different effect
  // and a far noisier one.
  float tooth = hash12(floor(gl_FragCoord.xy * 0.5)) - 0.5;
  col += tooth * 0.03 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_sky',
  'u_low',
  'u_high',
  'u_curtains',
  'u_height',
  'u_fold',
  'u_rays',
  'u_pitch',
  'u_brightness',
  'u_stars',
  'u_horizon',
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
  if (!shader) throw new Error('AuroraCurtain: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`AuroraCurtain: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class AuroraCurtainSurface implements Surface<AuroraCurtainOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('AuroraCurtain needs a canvas')
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
    if (!gl) throw new Error('AuroraCurtain needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('AuroraCurtain: could not create program')
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
      throw new Error(`AuroraCurtain: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: AuroraCurtainOptions): void {
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
    gl.uniform3fv(at('u_sky'), parseColor(opts.sky))
    gl.uniform3fv(at('u_low'), parseColor(opts.low))
    gl.uniform3fv(at('u_high'), parseColor(opts.high))
    gl.uniform1f(at('u_curtains'), opts.curtains)
    gl.uniform1f(at('u_height'), opts.height)
    gl.uniform1f(at('u_fold'), opts.fold)
    gl.uniform1f(at('u_rays'), opts.rays)
    gl.uniform1f(at('u_pitch'), opts.pitch)
    gl.uniform1f(at('u_brightness'), opts.brightness)
    gl.uniform1f(at('u_stars'), opts.stars)
    gl.uniform1f(at('u_horizon'), opts.horizon)
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
 * Mount AuroraCurtain into `el`. The element needs a size. Give it width and
 * height in CSS, not just content.
 *
 * ```ts
 * const aurora = createAuroraCurtain(document.querySelector('#sky')!)
 * aurora.start()
 * // …later
 * aurora.destroy()
 * ```
 */
export function createAuroraCurtain(
  el: HTMLElement,
  opts: Partial<AuroraCurtainOptions> = {}
): EffectHandle {
  return mount<AuroraCurtainOptions>(el, opts, {
    defaults: auroraCurtainDefaults,
    create: () => new AuroraCurtainSurface()
  })
}

export default createAuroraCurtain
