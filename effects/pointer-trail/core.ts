/*
 * PointerTrail: Beamish
 * https://beamish.ink/effects/pointer-trail
 *
 * Marks pressed into the paper, soaking in and fading.
 *
 * Not a comet and not a glow. A nib touching down repeatedly leaves a row of
 * blots, and each one does two things while it sits there: it spreads, because
 * the paper draws the ink sideways along its fibres, and it lightens, because
 * the ink is sinking in. So an older mark is wider and paler than a new one,
 * which is the opposite of a particle trail, where older means smaller.
 *
 * A trail needs history, and history is not a function of `t`. That is a problem
 * here, because the recorder asks for frames and expects the same answer every
 * time it asks for one.
 *
 * The way out is that the recorder already supplies the history. When
 * `pointerPath` is set the whole cursor track is known in advance, so the trail
 * is read backwards off the path rather than accumulated: mark `i` is simply
 * where the cursor was at `t - i * spacing`. That is pure in `t`, and it means
 * the recorded take is identical however the frames are asked for. With a live
 * pointer there is no path to read, so it falls back to a ring buffer.
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

export type PointerTrailOptions = BaseOptions & {
  /** The sheet the marks are pressed into. */
  paper: string
  /** Ink that has soaked in. */
  ink: string
  /** Ink that has only just landed. */
  accent: string
  /** How many marks the trail holds. */
  marks: number
  /** Radius of a fresh mark, as a share of the short side. */
  size: number
  /** How much wider a mark gets by the end of its life. */
  spread: number
  /** How quickly a mark gives up. Higher is a shorter trail. */
  fade: number
  /** How much of a mark is its soft shoulder rather than its body. */
  edge: number
  /** Seconds between one mark and the next when replaying a path. */
  spacing: number
  /** Paper tooth under the marks. */
  grain: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const pointerTrailDefaults: PointerTrailOptions = {
  paper: '#fbfaf4',
  ink: '#8d8577',
  accent: '#c44400',
  marks: 22,
  size: 0.032,
  spread: 1.6,
  fade: 1.8,
  edge: 0.85,
  spacing: 0.035,
  grain: 0.4,
  reducedMotionTime: 0,
  pointerScope: 'window'
}

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_marks',
  'u_count',
  'u_active',
  'u_paper',
  'u_ink',
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
  if (!shader) throw new Error('PointerTrail: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`PointerTrail: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

// beamish:shader-begin shaders/pointer-trail.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/pointer-trail.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * PointerTrail: marks pressed into the paper, soaking in and fading.
 *
 * Not a comet and not a glow. A nib touching down repeatedly leaves a row of
 * blots, and each one does two things as it sits: it spreads a little as the
 * paper draws the ink sideways along the fibres, and it lightens as it sinks in.
 * So an older mark here is wider and paler than a new one, which is the opposite
 * of a particle trail, where older means smaller.
 *
 * The marks multiply rather than compositing. Two blots that overlap are darker
 * than either, which is the behaviour that makes a trail of ink look wet rather
 * than look like a gradient.
 */

#define MARKS 28

uniform vec2  u_resolution;
uniform float u_dpr;
uniform vec2  u_marks[MARKS];
uniform float u_count;
uniform float u_active;

uniform vec3  u_paper;
uniform vec3  u_ink;
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
  float ink = 0.0;
  float freshest = 0.0;

  for (int i = 0; i < MARKS; i++) {
    if (i >= count) break;

    /*
     * Age runs 0 for the newest mark to 1 for the oldest. Index order is age
     * order, because the trail is written newest first, which saves carrying a
     * timestamp per mark.
     */
    float age = float(i) / max(float(count - 1), 1.0);

    vec2 markPx = vec2(u_marks[i].x, 1.0 - u_marks[i].y) * cssRes;
    float d = length(cssPx - markPx) / shortSide;

    // Spreading outward and sinking in. A mark that has been there longer is
    // wider and weaker, which is what ink does and what a particle does not.
    float radius = u_size * (1.0 + age * u_spread);
    float strength = pow(1.0 - age, max(u_fade, 0.01));

    /*
     * A soft shoulder rather than a hard disc. Ink on a fibrous surface has no
     * edge to speak of, and \`edge\` sets how much of the blot is that shoulder.
     */
    float blot = 1.0 - smoothstep(radius * (1.0 - u_edge), radius, d);
    float mark = blot * strength;

    // Multiplied, not added: two blots crossing are darker than either, which
    // is what makes a wet trail read as wet.
    ink = 1.0 - (1.0 - ink) * (1.0 - mark);
    freshest = max(freshest, mark * (1.0 - age));
  }

  ink *= u_active;

  // The freshest ink has not had time to sink, so it carries the accent and the
  // rest of the trail settles back to the body colour.
  vec3 colour = mix(u_ink, u_accent, smoothstep(0.25, 0.8, freshest));
  vec3 col = mix(u_paper, colour, clamp(ink, 0.0, 1.0));

  float tooth = hash12(floor(cssPx * 0.5) + 19.0) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

class PointerTrailSurface implements Surface<PointerTrailOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  /* Newest first, so the index is also the age. */
  private history: number[] = new Array(MARKS * 2).fill(0.5)
  private held = 0
  private readonly buffer = new Float32Array(MARKS * 2)

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('PointerTrail needs a canvas')
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
    if (!gl) throw new Error('PointerTrail needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('PointerTrail: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`PointerTrail: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: PointerTrailOptions, pointer: Pointer): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    const wanted = Math.max(1, Math.min(Math.round(opts.marks), MARKS))
    const path = opts.pointerPath

    if (path && path.length > 0) {
      /*
       * The path is known in advance, so the trail is read backwards off it
       * rather than accumulated. Mark i is where the cursor was at
       * t - i * spacing, which makes the whole thing a function of `t` and the
       * recorded take identical however the frames are asked for.
       */
      const duration = opts.pointerPathDuration ?? 0
      for (let i = 0; i < wanted; i++) {
        const at = t - i * opts.spacing
        const sample = samplePointerPath(path, at, duration)
        this.buffer[i * 2] = sample.x
        this.buffer[i * 2 + 1] = sample.y
      }
      this.held = wanted
    } else {
      // No path, so there is nothing to read backwards and the history has to
      // be kept. Newest first: shift down, write the head.
      for (let i = MARKS - 1; i > 0; i--) {
        this.history[i * 2] = this.history[(i - 1) * 2]!
        this.history[i * 2 + 1] = this.history[(i - 1) * 2 + 1]!
      }
      this.history[0] = pointer.x
      this.history[1] = pointer.y
      this.held = Math.min(this.held + 1, wanted)
      for (let i = 0; i < wanted; i++) {
        this.buffer[i * 2] = this.history[i * 2]!
        this.buffer[i * 2 + 1] = this.history[i * 2 + 1]!
      }
    }

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)

    const loc = (name: UniformName) => this.locations.get(name) ?? null

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform2fv(loc('u_marks'), this.buffer)
    gl.uniform1f(loc('u_count'), this.held)
    gl.uniform1f(loc('u_active'), pointer.active || Boolean(path) ? 1 : 0)
    gl.uniform3fv(loc('u_paper'), rgb(opts.paper))
    gl.uniform3fv(loc('u_ink'), rgb(opts.ink))
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
 * Mount PointerTrail into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const trail = createPointerTrail(document.querySelector('#sheet')!)
 * trail.start()
 * ```
 */
export function createPointerTrail(
  el: HTMLElement,
  opts: Partial<PointerTrailOptions> = {}
): EffectHandle {
  return mount<PointerTrailOptions>(el, opts, {
    defaults: pointerTrailDefaults,
    create: () => new PointerTrailSurface()
  })
}

export default createPointerTrail
