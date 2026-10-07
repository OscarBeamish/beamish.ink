/*
 * WovenThreads: Beamish
 * https://beamish.ink/effects/woven-threads
 *
 * Cloth. Warp threads one way, weft the other, and at every crossing one of
 * them is on top.
 *
 * That last clause is the whole thing. Every version of this effect that goes
 * around draws two sets of lines crossing, which is a grid: the threads pass
 * through each other and the surface has no structure. What makes cloth cloth
 * is the interlacing, and the interlacing is one comparison per crossing. Plain
 * weave alternates every crossing. Twill shifts the float by one each row,
 * which is why denim has a diagonal in it, and you can see that diagonal appear
 * the moment the comparison changes.
 *
 * Two things besides:
 *
 *   The threads are round, not flat. Each one is shaded by its own cylindrical
 *   profile, which is what makes a woven surface read as made of something
 *   rather than printed. A flat thread is a stripe.
 *
 *   The thread that goes under is darkened where it passes beneath. That is the
 *   shadow of the thread on top of it, and without it the interlacing is
 *   visible only as a hard edge rather than as depth.
 *
 * The cloth moves by having its threads wander, not by being translated. A
 * thread is displaced along its length by a slow wave, so the weave breathes
 * the way fabric does when there is air in the room. The waves are whole
 * numbers of turns over the period, so the loop closes exactly.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type WovenThreadsOptions = BaseOptions & {
  /** What shows between the threads. */
  ground: string
  /** The threads running one way. */
  warp: string
  /** The threads running the other. */
  weft: string
  /** Distance from one thread to the next, in CSS pixels. */
  pitch: number
  /** Thread width, as a share of the pitch. 1 is a closed cloth. */
  width: number
  /** Floats per repeat: 1 is plain weave, 2 or 3 give a twill. */
  float: number
  /** How strongly the round threads are lit. */
  relief: number
  /** Where the light comes from, in degrees. */
  light: number
  /** How dark the thread underneath goes where it passes beneath. */
  crimp: number
  /** How far the threads wander, as a share of the pitch. */
  wander: number
  /** Seconds for one cycle of the wander. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const wovenThreadsDefaults: WovenThreadsOptions = {
  ground: '#efece1',
  warp: '#f7f5ed',
  weft: '#d9d4c4',
  pitch: 13,
  width: 0.86,
  float: 1,
  relief: 0.55,
  light: 135,
  crimp: 0.45,
  wander: 0.1,
  period: 36,
  reducedMotionTime: 9
}

// beamish:shader-begin shaders/woven-threads.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/woven-threads.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * WovenThreads: warp one way, weft the other, and one of them on top at every
 * crossing.
 *
 * The interlacing is the item. Two sets of lines crossing is a grid, and a grid
 * has no structure: the threads pass through each other. One comparison per
 * crossing turns it into cloth, and changing that comparison from alternating
 * to shifting is the difference between plain weave and twill, which is why
 * denim has a diagonal in it.
 *
 * The threads wander rather than translate. Each is displaced along its length
 * by a slow wave, so the weave breathes the way fabric does rather than sliding
 * past like a backdrop. Because the displacement moves a thread's centre, the
 * index of the nearest thread is found from the undisplaced grid and then
 * refined with that thread's own offset: exact for any wander under half a
 * pitch, which is far more than cloth does.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_warp;
uniform vec3  u_weft;
uniform float u_pitch;
uniform float u_width;
uniform float u_float;
uniform float u_relief;
uniform float u_light;
uniform float u_crimp;
uniform float u_wander;

out vec4 fragColor;

const float TAU = 6.28318530718;

/*
 * How far a thread has wandered from its nominal line. A function of which
 * thread it is and how far along it you are, so a single thread snakes rather
 * than the whole cloth sliding. Two turns over the period, so it closes.
 */
float wanderOf(float index, float along, float phase) {
  return (sin(along * 0.021 + phase + index * 1.7) * 0.6 +
          sin(along * 0.047 - phase * 2.0 + index * 0.9) * 0.4) * u_wander * u_pitch;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float phase = TAU * u_time / max(u_period, 0.001);

  float pitch = max(u_pitch, 2.0);
  // Not half, which GLSL reserves, and not step, which it defines.
  float reach = pitch * 0.5 * clamp(u_width, 0.05, 1.0);

  /*
   * Which thread, and how far across it. The nominal index comes from the
   * undisplaced grid and is then corrected by that thread's own wander, which
   * is exact while the wander stays under half a pitch.
   */
  float wi = floor(cssPx.x / pitch);
  float wCentre = (wi + 0.5) * pitch + wanderOf(wi, cssPx.y, phase);
  if (abs(cssPx.x - wCentre) > pitch * 0.5) {
    wi += cssPx.x > wCentre ? 1.0 : -1.0;
    wCentre = (wi + 0.5) * pitch + wanderOf(wi, cssPx.y, phase);
  }

  float fj = floor(cssPx.y / pitch);
  float fCentre = (fj + 0.5) * pitch + wanderOf(fj + 37.0, cssPx.x, -phase);
  if (abs(cssPx.y - fCentre) > pitch * 0.5) {
    fj += cssPx.y > fCentre ? 1.0 : -1.0;
    fCentre = (fj + 0.5) * pitch + wanderOf(fj + 37.0, cssPx.x, -phase);
  }

  // Across-thread coordinates, normalised so 1 is the edge of the thread.
  float uWarp = (cssPx.x - wCentre) / max(reach, 0.001);
  float uWeft = (cssPx.y - fCentre) / max(reach, 0.001);

  bool onWarp = abs(uWarp) <= 1.0;
  bool onWeft = abs(uWeft) <= 1.0;

  /*
   * The interlacing. One comparison, and it is the whole difference between
   * cloth and a grid. With float at 1 the pattern alternates every crossing,
   * which is plain weave; higher values let a thread float over several in a
   * row and shift by one each line, which is a twill and brings a diagonal
   * with it.
   */
  float repeat = 2.0 * max(u_float, 1.0);
  float slot = mod(wi + fj * max(u_float, 1.0), repeat);
  bool warpOver = slot < max(u_float, 1.0);

  /*
   * A round thread, shaded by its own profile. The height across a cylinder is
   * the root of one minus the square of the across-coordinate, and the slope of
   * that is the normal. Flat instead, and the cloth is a set of stripes.
   */
  float sun = radians(u_light);
  vec2 sunDir = vec2(cos(sun), sin(sun));

  vec3 col = u_ground;
  float lit = 0.0;
  bool drawWarp = onWarp && (warpOver || !onWeft);
  bool drawWeft = onWeft && (!warpOver || !onWarp);

  if (drawWarp) {
    float u = clamp(uWarp, -1.0, 1.0);
    float h = sqrt(max(1.0 - u * u, 0.0));
    // The slope across the thread, dotted with the light's across-component.
    lit = (-u / max(h, 0.25)) * sunDir.x;
    col = u_warp;
  } else if (drawWeft) {
    float u = clamp(uWeft, -1.0, 1.0);
    float h = sqrt(max(1.0 - u * u, 0.0));
    lit = (-u / max(h, 0.25)) * sunDir.y;
    col = u_weft;
  }

  if (drawWarp || drawWeft) {
    col *= 1.0 + clamp(lit, -1.0, 1.0) * u_relief * 0.5;

    /*
     * Crimp. The thread that goes under is in the shadow of the one above it,
     * and the shadow is deepest where the two cross. Without this the
     * interlacing reads as a hard edge rather than as one thread passing
     * beneath another.
     */
    float under = drawWarp ? (1.0 - clamp(abs(uWeft), 0.0, 1.0)) : (1.0 - clamp(abs(uWarp), 0.0, 1.0));
    bool isUnder = drawWarp ? !warpOver : warpOver;
    if (isUnder) col *= 1.0 - under * u_crimp;
  }

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
  'u_warp',
  'u_weft',
  'u_pitch',
  'u_width',
  'u_float',
  'u_relief',
  'u_light',
  'u_crimp',
  'u_wander'
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
  if (!shader) throw new Error('WovenThreads: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`WovenThreads: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class WovenThreadsSurface implements Surface<WovenThreadsOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('WovenThreads needs a canvas')
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
    if (!gl) throw new Error('WovenThreads needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('WovenThreads: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`WovenThreads: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: WovenThreadsOptions): void {
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
    gl.uniform3fv(loc('u_warp'), rgb(opts.warp))
    gl.uniform3fv(loc('u_weft'), rgb(opts.weft))
    gl.uniform1f(loc('u_pitch'), opts.pitch)
    gl.uniform1f(loc('u_width'), opts.width)
    gl.uniform1f(loc('u_float'), opts.float)
    gl.uniform1f(loc('u_relief'), opts.relief)
    gl.uniform1f(loc('u_light'), opts.light)
    gl.uniform1f(loc('u_crimp'), opts.crimp)
    gl.uniform1f(loc('u_wander'), opts.wander)

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
 * Mount WovenThreads into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const cloth = createWovenThreads(document.querySelector('#hero')!)
 * cloth.start()
 * // …later
 * cloth.destroy()
 * ```
 */
export function createWovenThreads(
  el: HTMLElement,
  opts: Partial<WovenThreadsOptions> = {}
): EffectHandle {
  return mount<WovenThreadsOptions>(el, opts, {
    defaults: wovenThreadsDefaults,
    create: () => new WovenThreadsSurface()
  })
}

export default createWovenThreads
