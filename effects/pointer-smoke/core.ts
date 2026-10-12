/*
 * PointerSmoke: Beamish
 * https://beamish.ink/effects/pointer-smoke
 *
 * Smoke off the cursor, spreading and thinning as it drifts.
 *
 * Not a comet and not a glow. A puff of smoke does two things while it hangs
 * there: it widens, because nothing is holding it together, and it thins,
 * because the same amount of it is spread over more room. So an older puff is
 * bigger and fainter than a new one, which is the opposite of a particle trail,
 * where older means smaller.
 *
 * Every puff carries its own age in seconds. That is the part worth reading.
 * The first version laid one puff per frame and took each one's age from its
 * position in the list, which made the whole effect frame-rate dependent: the
 * same gesture left a third of a second of smoke on a 60Hz display and a sixth
 * of a second on a 120Hz one. The long version read as something heavy being
 * dragged along behind the cursor, which is the one thing a pointer effect
 * cannot afford. A trail measured in seconds behaves the same everywhere, and
 * it thins out and goes when the cursor stops rather than hanging there.
 *
 * A trail needs history, and history is not a function of `t`. That is a problem
 * here, because the recorder asks for frames and expects the same answer every
 * time it asks for one.
 *
 * The way out is that the recorder already supplies the history. When
 * `pointerPath` is set the whole cursor track is known in advance, so the trail
 * is read backwards off the path rather than accumulated: puff `i` is simply
 * where the cursor was at `t - i * life / marks`, aged to match. That is pure in
 * `t`, so the recorded take is identical however the frames are asked for. With
 * a live pointer there is no path to read, so it keeps its own stamps.
 */

import {
  mount,
  samplePointerPath,
  type BaseOptions,
  type EffectHandle,
  type Pointer,
  type Surface
} from '../../shared/runtime'

/** Matches MARKS in the shader. Changing one without the other truncates the trail. */
const MARKS = 28

export type PointerSmokeOptions = BaseOptions & {
  /** The paper the smoke drifts over. */
  paper: string
  /** The body of it, once it has spread. */
  smoke: string
  /** What warmth the freshest smoke carries. */
  accent: string
  /** How many puffs the trail holds. */
  marks: number
  /** Radius of a fresh puff, as a share of the short side. */
  size: number
  /** How much wider a puff gets by the end of its life. */
  spread: number
  /** How quickly a puff gives up. Higher is a shorter trail. */
  fade: number
  /** How much of a puff is its soft shoulder rather than its body. */
  edge: number
  /** Seconds a puff lasts. This is the length of the trail. */
  life: number
  /** Paper tooth under the smoke. */
  grain: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const pointerSmokeDefaults: PointerSmokeOptions = {
  paper: '#fbfaf4',
  smoke: '#b4afa4',
  accent: '#bfae9e',
  marks: 28,
  size: 0.026,
  spread: 2.4,
  fade: 2.4,
  edge: 0.95,
  life: 0.45,
  grain: 0.4,
  reducedMotionTime: 0,
  pointerScope: 'window'
}

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_marks',
  'u_ages',
  'u_count',
  'u_active',
  'u_paper',
  'u_smoke',
  'u_accent',
  'u_size',
  'u_spread',
  'u_fade',
  'u_edge',
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
  if (!shader) throw new Error('PointerSmoke: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`PointerSmoke: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

// beamish:shader-begin shaders/pointer-smoke.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/pointer-smoke.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * PointerSmoke: smoke off the cursor, spreading and thinning as it drifts.
 *
 * Not a comet and not a glow. A puff of smoke does two things while it hangs
 * there: it widens, because nothing is holding it together, and it thins,
 * because the same amount of it is spread over more room. So an older puff is
 * bigger and fainter than a new one, which is the opposite of a particle trail,
 * where older means smaller, and it is the thing that makes this read as smoke
 * rather than as a cursor with a tail.
 *
 * The puffs multiply rather than compositing. Two that overlap are denser than
 * either, which is how smoke in front of smoke behaves and is what stops a
 * doubled-back trail reading as a flat shape.
 *
 * Age is carried per puff rather than derived from its index. The index version
 * worked out to one puff per frame, which made the whole effect frame-rate
 * dependent: the same gesture left a third of a second of smoke on a 60Hz
 * display and a sixth on a 120Hz one, and the long version read as something
 * heavy being dragged along behind the cursor.
 */

#define MARKS 28

uniform vec2  u_resolution;
uniform float u_dpr;
uniform vec2  u_marks[MARKS];
uniform float u_ages[MARKS];
uniform float u_count;
uniform float u_active;

uniform vec3  u_paper;
uniform vec3  u_smoke;
uniform vec3  u_accent;
uniform float u_size;
uniform float u_spread;
uniform float u_fade;
uniform float u_edge;
uniform float u_grain;

out vec4 fragColor;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  int count = int(clamp(u_count, 0.0, float(MARKS)));
  float density = 0.0;
  float freshest = 0.0;

  for (int i = 0; i < MARKS; i++) {
    if (i >= count) break;

    /*
     * Age runs 0 for a puff that has just left to 1 for one that has gone. It
     * is supplied per puff rather than taken from the index, which is what
     * makes a trail the same length in seconds whatever the display is doing.
     */
    float age = u_ages[i];
    if (age >= 1.0) continue;

    vec2 markPx = vec2(u_marks[i].x, 1.0 - u_marks[i].y) * cssRes;
    float d = length(cssPx - markPx) / shortSide;

    // Spreading and thinning. A puff that has been out longer is wider and
    // weaker, which is what smoke does and what a particle does not.
    float radius = u_size * (1.0 + age * u_spread);
    float strength = pow(1.0 - age, max(u_fade, 0.01));

    /*
     * A soft shoulder rather than a disc. Smoke has no edge at all, and \`edge\`
     * sets how much of a puff is that shoulder: at 0 you get plates of grey.
     */
    float puff = 1.0 - smoothstep(radius * (1.0 - u_edge), radius, d);
    float mark = puff * strength;

    // Multiplied, not added: two puffs crossing are denser than either, which
    // is what stops a doubled-back trail reading as one flat shape.
    density = 1.0 - (1.0 - density) * (1.0 - mark);
    freshest = max(freshest, mark * (1.0 - age));
  }

  density *= u_active;

  // The freshest smoke is the densest and carries what warmth there is. The
  // rest of it settles back to the body colour as it thins.
  vec3 colour = mix(u_smoke, u_accent, smoothstep(0.25, 0.8, freshest));
  vec3 col = mix(u_paper, colour, clamp(density, 0.0, 1.0));

  float tooth = hash12(floor(cssPx * 0.5) + 19.0) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

class PointerSmokeSurface implements Surface<PointerSmokeOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  /* Newest first. Each puff carries the time it was laid, not its rank. */
  private history: number[] = new Array(MARKS * 2).fill(0.5)
  private stamps: number[] = new Array(MARKS).fill(-1e9)
  private held = 0
  private lastAt = -1e9
  private readonly buffer = new Float32Array(MARKS * 2)
  private readonly ages = new Float32Array(MARKS)

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('PointerSmoke needs a canvas')
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
    if (!gl) throw new Error('PointerSmoke needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('PointerSmoke: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`PointerSmoke: program failed to link\n${log ?? ''}`)
    }

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

  render(t: number, opts: PointerSmokeOptions, pointer: Pointer): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    const wanted = Math.max(1, Math.min(Math.round(opts.marks), MARKS))
    const path = opts.pointerPath

    const life = Math.max(opts.life, 0.05)
    // One puff per slice of the life, so the trail is always `marks` long and
    // always `life` seconds old at its tail whatever the display is doing.
    const gap = life / wanted

    if (path && path.length > 0) {
      /*
       * The path is known in advance, so the trail is read backwards off it
       * rather than accumulated. Puff i is where the cursor was at t - i * gap,
       * aged to match, which makes the whole thing a function of `t` and the
       * recorded take identical however the frames are asked for.
       */
      const duration = opts.pointerPathDuration ?? 0
      for (let i = 0; i < wanted; i++) {
        const sample = samplePointerPath(path, t - i * gap, duration)
        this.buffer[i * 2] = sample.x
        this.buffer[i * 2 + 1] = sample.y
        this.ages[i] = i / wanted
      }
      this.held = wanted
    } else {
      /*
       * No path, so the history has to be kept. A puff is laid on a clock
       * rather than once per frame, which is what makes the trail the same
       * length in seconds on any display, and the ones that have outlived
       * `life` simply stop being drawn.
       *
       * The clock is reset rather than caught up when `t` jumps, so a replay or
       * a tab coming back from the background does not fire off a burst of
       * puffs along a path the cursor never took.
       */
      if (t < this.lastAt || t - this.lastAt > life * 4) this.lastAt = t - gap

      if (t - this.lastAt >= gap) {
        for (let i = MARKS - 1; i > 0; i--) {
          this.history[i * 2] = this.history[(i - 1) * 2]!
          this.history[i * 2 + 1] = this.history[(i - 1) * 2 + 1]!
          this.stamps[i] = this.stamps[i - 1]!
        }
        this.history[0] = pointer.x
        this.history[1] = pointer.y
        this.stamps[0] = t
        this.held = Math.min(this.held + 1, wanted)
        this.lastAt = t
      }

      for (let i = 0; i < wanted; i++) {
        this.buffer[i * 2] = this.history[i * 2]!
        this.buffer[i * 2 + 1] = this.history[i * 2 + 1]!
        this.ages[i] = Math.min((t - this.stamps[i]!) / life, 1)
      }
    }

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)

    const loc = (name: UniformName) => this.locations.get(name) ?? null

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform2fv(loc('u_marks'), this.buffer)
    gl.uniform1fv(loc('u_ages'), this.ages)
    gl.uniform1f(loc('u_count'), this.held)
    gl.uniform1f(loc('u_active'), pointer.active || Boolean(path) ? 1 : 0)
    gl.uniform3fv(loc('u_paper'), rgb(opts.paper))
    gl.uniform3fv(loc('u_smoke'), rgb(opts.smoke))
    gl.uniform3fv(loc('u_accent'), rgb(opts.accent))
    gl.uniform1f(loc('u_size'), opts.size)
    gl.uniform1f(loc('u_spread'), opts.spread)
    gl.uniform1f(loc('u_fade'), opts.fade)
    gl.uniform1f(loc('u_edge'), opts.edge)
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
    this.held = 0
    this.locations.clear()
  }
}

/**
 * Mount PointerSmoke into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const trail = createPointerSmoke(document.querySelector('#sheet')!)
 * trail.start()
 * ```
 */
export function createPointerSmoke(
  el: HTMLElement,
  opts: Partial<PointerSmokeOptions> = {}
): EffectHandle {
  return mount<PointerSmokeOptions>(el, opts, {
    defaults: pointerSmokeDefaults,
    create: () => new PointerSmokeSurface()
  })
}

export default createPointerSmoke
