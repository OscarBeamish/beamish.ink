/*
 * LightShafts: Beamish
 * https://beamish.ink/effects/light-shafts
 *
 * Light coming into a room through something, and falling across the frame in
 * bands. Sun through a blind, or through glazing bars, or through slats.
 *
 * Every version of this effect anybody ships is a few pale triangles fanned out
 * from a corner, and they all have the same tell: the beams are solid, they
 * have hard edges all the way along, and nothing accounts for why they are
 * there at all. A shaft of light is not a shape. It is the gap in whatever is
 * between you and the sun.
 *
 * So this is built the way the thing itself works:
 *
 *   There is a source, off frame, at a distance. Everything is drawn from the
 *   angle to it, which is what makes the beams fan rather than run parallel.
 *   Move the source far enough away and they do run parallel, because that is
 *   what distance does to a fan, and the sun is the limiting case.
 *
 *   There is an occluder: a repeating profile of bars and gaps, crossed by the
 *   rays. The bright bands are the gaps.
 *
 *   The edges go soft with distance. A shadow edge is only sharp where it is
 *   near the thing that cast it, because the source has width, and the
 *   half-shadow it throws grows as the shadow travels. This is the single
 *   detail that separates a beam of light from a triangle, and it costs one
 *   multiplication.
 *
 *   The beam is only visible because of what is in the air. Light in a vacuum
 *   is invisible from the side, so the motes are not decoration: they are the
 *   reason you can see the shaft, and they are drawn only inside it.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type LightShaftsOptions = BaseOptions & {
  /** The ground the light falls on. */
  ground: string
  /** The light itself. */
  light: string
  /** Where the source sits, in degrees around the frame. 0 is to the right. */
  angle: number
  /** How far off frame the source is, in frame widths. Far is parallel beams. */
  distance: number
  /** Bars the light comes through. */
  bars: number
  /** Share of each repeat that is open. 0.5 is a blind at half tilt. */
  gap: number
  /** Softness of a shadow edge where it leaves the bar. */
  softness: number
  /** How much softer the edge gets with distance travelled. */
  spread: number
  /** How far the light reaches across the frame, in frame widths. */
  reach: number
  /** Brightness of the light. */
  strength: number
  /** Motes in the air. The reason the shaft is visible at all. */
  dust: number
  /** Degrees the source swings over one period. */
  drift: number
  /** Seconds for one swing. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const lightShaftsDefaults: LightShaftsOptions = {
  ground: '#fbfaf4',
  light: '#fff6e2',
  angle: 128,
  distance: 1.6,
  bars: 7,
  gap: 0.44,
  softness: 0.06,
  spread: 1.5,
  reach: 2.1,
  strength: 0.26,
  dust: 0.7,
  drift: 4,
  period: 42,
  reducedMotionTime: 10
}

// beamish:shader-begin shaders/light-shafts.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/light-shafts.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * LightShafts: light through an occluder, falling across the frame in bands.
 *
 * The whole image comes from one quantity: the angle from the source to the
 * pixel. The occluder is a repeating profile of bars and gaps read against that
 * angle, which is why the beams fan out from the source rather than running
 * parallel down the frame. Push the source far enough away and the fan becomes
 * parallel on its own, because that is what distance does to a fan.
 *
 * Two details carry it, and both are cheap.
 *
 * The shadow edges soften with distance travelled. A shadow is sharp only near
 * the thing that cast it: the source has width, so the half-shadow grows as the
 * shadow runs. Leave this out and the beams are triangles with hard sides, which
 * is what every version of this effect looks like.
 *
 * The motes are drawn only inside the beams. Light in clean air is invisible
 * from the side, so the dust is not decoration laid over the shafts, it is the
 * reason there is anything to see.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_light;
uniform float u_angle;
uniform float u_distance;
uniform float u_bars;
uniform float u_gap;
uniform float u_softness;
uniform float u_spread;
uniform float u_reach;
uniform float u_strength;
uniform float u_dust;
uniform float u_drift;

out vec4 fragColor;

const float TAU = 6.28318530718;

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

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);
  vec2 p = (cssPx - cssRes * 0.5) / shortSide;

  /*
   * The source, off frame. The swing is a sine of the phase so it returns to
   * where it started: a source that travels a full circle crosses the frame on
   * the way round, and a light passing through the room it is lighting is a
   * different effect entirely.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  float a = radians(u_angle + u_drift * sin(phase));
  vec2 source = vec2(cos(a), sin(a)) * max(u_distance, 0.02);

  vec2 toPixel = p - source;
  float travelled = length(toPixel);
  float bearing = atan(toPixel.y, toPixel.x);

  /*
   * The occluder, read against the bearing. Scaled by the distance of the
   * source so the bars keep the same apparent width on the frame as the source
   * is moved out: without this, pushing the light away to straighten the beams
   * also squeezes them all into a sliver.
   */
  float across = bearing * max(u_distance, 0.02) * u_bars;
  float within = abs(fract(across) - 0.5) * 2.0;

  /*
   * The penumbra. The edge of a shadow is sharp only near the thing that cast
   * it, because the source has width and the half-shadow it throws grows with
   * the distance the shadow has run. One multiplication, and it is the whole
   * difference between a beam and a triangle.
   */
  float blur = u_softness * (1.0 + u_spread * travelled);
  float edge = 1.0 - clamp(u_gap, 0.01, 0.99);
  float open = smoothstep(edge + blur, max(edge - blur, 0.0), within);

  // How far the light gets. Beyond its reach the room is just the room.
  float falloff = exp(-travelled / max(u_reach, 0.01));

  float beam = open * falloff * u_strength;

  /*
   * Motes, and only inside the beam. They drift across it rather than along it,
   * because dust in a room is moved by the air and not by the light, and the
   * drift is a whole number of turns over the period so the loop closes.
   *
   * The drift is very small on purpose. Dust hangs: it does not stream. The
   * first pass moved the mote field fifteen of its own widths over a period,
   * which measured three times the change per frame of everything else here put
   * together, for something that read as the air being blown out of the room.
   */
  vec2 air = p * 26.0 + vec2(sin(phase) * 0.14, cos(phase) * 0.09);
  float motes = noise(air) * noise(air * 2.7 + 11.0);
  motes = smoothstep(0.34, 0.72, motes);
  beam *= 1.0 + motes * u_dust * 1.1;

  // Plus the light that has bounced around the room and arrives from nowhere in
  // particular. Without it the unlit bands are flat and the frame reads as two
  // colours rather than as one room.
  float ambient = falloff * 0.22 * u_strength;

  vec3 col = u_ground + u_light * (beam + ambient);

  float tooth = hash12(floor(gl_FragCoord.xy)) - 0.5;
  col += tooth * 0.012;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_ground',
  'u_light',
  'u_angle',
  'u_distance',
  'u_bars',
  'u_gap',
  'u_softness',
  'u_spread',
  'u_reach',
  'u_strength',
  'u_dust',
  'u_drift'
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
  if (!shader) throw new Error('LightShafts: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`LightShafts: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class LightShaftsSurface implements Surface<LightShaftsOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('LightShafts needs a canvas')
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
    if (!gl) throw new Error('LightShafts needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('LightShafts: could not create program')
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
      throw new Error(`LightShafts: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: LightShaftsOptions): void {
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
    gl.uniform3fv(loc('u_ground'), rgb(opts.ground))
    gl.uniform3fv(loc('u_light'), rgb(opts.light))
    gl.uniform1f(loc('u_angle'), opts.angle)
    gl.uniform1f(loc('u_distance'), opts.distance)
    gl.uniform1f(loc('u_bars'), opts.bars)
    gl.uniform1f(loc('u_gap'), opts.gap)
    gl.uniform1f(loc('u_softness'), opts.softness)
    gl.uniform1f(loc('u_spread'), opts.spread)
    gl.uniform1f(loc('u_reach'), opts.reach)
    gl.uniform1f(loc('u_strength'), opts.strength)
    gl.uniform1f(loc('u_dust'), opts.dust)
    gl.uniform1f(loc('u_drift'), opts.drift)

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
 * Mount LightShafts into `el`. The element needs a size, in CSS, not just content.
 *
 * ```ts
 * const light = createLightShafts(document.querySelector('#hero')!)
 * light.start()
 * // …later
 * light.destroy()
 * ```
 */
export function createLightShafts(el: HTMLElement, opts: Partial<LightShaftsOptions> = {}): EffectHandle {
  return mount<LightShaftsOptions>(el, opts, {
    defaults: lightShaftsDefaults,
    create: () => new LightShaftsSurface()
  })
}

export default createLightShafts
