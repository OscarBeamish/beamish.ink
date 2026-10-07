/*
 * DustMotes: Beamish
 * https://beamish.ink/effects/dust-motes
 *
 * Dust in a room, lit from one side. Not a particle system: a field.
 *
 * Every version of this keeps an array of particles, advances each one every
 * frame, and respawns the ones that drift out. That buys you nothing here and
 * costs you three things. It cannot be seeked, so it cannot be recorded. It
 * drifts on a dropped frame, because each position depends on the last. And the
 * cost grows with the count, so a thousand motes is a thousand objects to walk.
 *
 * This is a shader over a lattice instead. The frame is divided into cells, each
 * cell holds one mote at a position that is a function of the cell, a seed and
 * the clock, and a pixel only ever looks at the nine cells around it. Nothing is
 * stored, nothing is advanced, and the count is a division rather than a loop:
 * ten thousand motes cost exactly what a hundred do.
 *
 * Three things make it read as dust rather than as snow:
 *
 *   Motes go in and out of focus. A real one is a few micrometres across and
 *   the depth of field at that scale is tiny, so most of what you see is a
 *   blurred smudge and only a few are sharp. Drawing them all sharp is the
 *   single clearest giveaway, and it is also what makes a field of white dots
 *   read as a screensaver.
 *
 *   They catch the light rather than emit it. A mote is lit from somewhere, so
 *   the ones on the lit side of the frame are bright and the ones away from it
 *   are nearly invisible, which is what gives the air a direction.
 *
 *   They rise and settle rather than falling. Dust in a lit room is moved by
 *   convection, not by gravity: it goes up as often as down, and it hangs.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type DustMotesOptions = BaseOptions & {
  /** The air. What shows where there is no dust. */
  ground: string
  /** The motes. */
  mote: string
  /** Cell size in CSS pixels. One mote per cell, so this is the density. */
  pitch: number
  /** Mote radius, in CSS pixels, for one in perfect focus. */
  size: number
  /** How much of the field is out of focus, 0 to 1. */
  haze: number
  /** Where the light comes from, in degrees. */
  light: number
  /** How strongly the light falls off across the frame, 0 to 1. */
  falloff: number
  /** How far a mote drifts, as a share of the pitch. */
  drift: number
  /** Share of motes that are bright enough to read as sharp, 0 to 1. */
  sparkle: number
  /** Seed for the field. The same seed gives the same air. */
  seed: number
  /** Seconds for one cycle of the drift. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const dustMotesDefaults: DustMotesOptions = {
  ground: '#17171c',
  mote: '#fdf6e4',
  pitch: 34,
  size: 1.5,
  haze: 0.72,
  light: 125,
  falloff: 0.65,
  drift: 0.75,
  sparkle: 0.12,
  seed: 7,
  period: 44,
  reducedMotionTime: 11
}

// beamish:shader-begin shaders/dust-motes.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/dust-motes.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * DustMotes: dust in a room, as a field rather than a particle system.
 *
 * The frame is a lattice. Each cell holds one mote whose position is a function
 * of the cell, a seed and the clock, and a pixel looks only at the nine cells
 * around it. Nothing is stored and nothing is advanced, so the whole thing is
 * pure in t and the count is a division rather than a loop: ten thousand motes
 * cost what a hundred do.
 *
 * The depth of field is the part that matters. A real mote is a few micrometres
 * across, so at any focal distance nearly all of them are blurred smudges and
 * only a handful are sharp. Draw them all sharp and you have snow. Here each
 * mote carries a focus taken from its own hash, which sets both how wide it is
 * drawn and how faint: a blurred mote is spread over more area and so is dimmer,
 * which is what a lens does and what makes the two read as the same object at
 * different distances.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_mote;
uniform float u_pitch;
uniform float u_size;
uniform float u_haze;
uniform float u_light;
uniform float u_falloff;
uniform float u_drift;
uniform float u_sparkle;
uniform float u_seed;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  return vec2(hash12(p + u_seed), hash12(p + u_seed + 37.19));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);

  float pitch = max(u_pitch, 4.0);
  vec2 cell = cssPx / pitch;
  vec2 id = floor(cell);

  float phase = TAU * u_time / max(u_period, 0.001);

  /*
   * The light. A mote catches light rather than emitting it, so where it sits
   * in the frame decides how bright it is: the ones on the lit side read, the
   * ones away from it are nearly gone. Without this the field has no direction
   * and reads as static.
   */
  float a = radians(u_light);
  vec2 towards = vec2(cos(a), sin(a));
  vec2 fromCentre = (cssPx - cssRes * 0.5) / shortSide;
  float lit = 1.0 - u_falloff * (0.5 - dot(fromCentre, towards)) ;

  float ink = 0.0;

  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 nid = id + vec2(float(ox), float(oy));
      vec2 rnd = hash22(nid);

      /*
       * Where this cell's mote sits. It drifts on a closed path, so after one
       * period every mote is back where it started and the loop closes, and it
       * rises as often as it falls: dust in a lit room is moved by convection
       * rather than by gravity, and it hangs.
       */
      /*
       * One turn across, two turns up, both whole numbers over the period, so
       * every mote is back where it started when the loop comes round. The
       * first version used 0.7 turns on the vertical, which is a figure that
       * never returns: the seam measured 2.59 against a requirement of zero.
       */
      float wobble = phase + rnd.x * TAU;
      vec2 at = nid + 0.5 + (rnd - 0.5) * 0.8 +
        vec2(cos(wobble), sin(phase * 2.0 + rnd.y * TAU)) * u_drift * 0.5;

      /*
       * How far out of focus this one is. Most are, because at the scale of a
       * mote the depth of field is almost nothing. A blurred mote is spread
       * over more area and is therefore fainter, which is what a lens does: the
       * two together are what make a wide smudge and a tight point read as the
       * same object at different distances.
       */
      float focus = hash12(nid + 11.3);
      float blurred = u_haze * focus;
      float radius = (u_size / pitch) * (1.0 + blurred * 7.0);
      float brightness = 1.0 / (1.0 + blurred * 9.0);

      // A few are bright enough to read as sharp specks. Dust in a sunbeam does
      // this, and it is most of what makes the air look occupied.
      if (hash12(nid + 73.1) < u_sparkle) brightness *= 2.6;

      float d = length(cell - at);
      // A gaussian rather than a disc: a mote has no edge, in or out of focus.
      ink += exp(-(d * d) / max(radius * radius, 1e-6)) * brightness;
    }
  }

  vec3 col = u_ground + u_mote * clamp(ink, 0.0, 4.0) * max(lit, 0.0) * 0.5;

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
  'u_mote',
  'u_pitch',
  'u_size',
  'u_haze',
  'u_light',
  'u_falloff',
  'u_drift',
  'u_sparkle',
  'u_seed'
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
  if (!shader) throw new Error('DustMotes: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`DustMotes: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class DustMotesSurface implements Surface<DustMotesOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('DustMotes needs a canvas')
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
    if (!gl) throw new Error('DustMotes needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('DustMotes: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`DustMotes: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: DustMotesOptions): void {
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
    gl.uniform3fv(loc('u_mote'), rgb(opts.mote))
    gl.uniform1f(loc('u_pitch'), opts.pitch)
    gl.uniform1f(loc('u_size'), opts.size)
    gl.uniform1f(loc('u_haze'), opts.haze)
    gl.uniform1f(loc('u_light'), opts.light)
    gl.uniform1f(loc('u_falloff'), opts.falloff)
    gl.uniform1f(loc('u_drift'), opts.drift)
    gl.uniform1f(loc('u_sparkle'), opts.sparkle)
    gl.uniform1f(loc('u_seed'), opts.seed)

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
 * Mount DustMotes into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const air = createDustMotes(document.querySelector('#hero')!)
 * air.start()
 * // …later
 * air.destroy()
 * ```
 */
export function createDustMotes(
  el: HTMLElement,
  opts: Partial<DustMotesOptions> = {}
): EffectHandle {
  return mount<DustMotesOptions>(el, opts, {
    defaults: dustMotesDefaults,
    create: () => new DustMotesSurface()
  })
}

export default createDustMotes
