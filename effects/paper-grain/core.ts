/*
 * PaperGrain: Beamish
 * https://beamish.ink/effects/paper-grain
 *
 * The surface of a sheet of paper, with nothing on it. No pattern laid over a
 * background: the paper is the subject, and what you are looking at is light
 * falling across its own roughness.
 *
 * Three things make a surface read as paper rather than as noise, and all three
 * are in here because leaving any one out gives you grey static:
 *
 *   Fibre. A sheet is a mat of fibres, and on a machine-made sheet they lie
 *   more along one axis than the other, because the stock runs in a direction.
 *   So the noise is stretched along that axis rather than isotropic. This is
 *   the machine direction, and it is why a sheet tears cleanly one way.
 *
 *   Formation. Hold a sheet up to a window and you see cloud: the fibre is not
 *   spread evenly, and the patches are far larger than the fibres. Papermakers
 *   call it formation, or look-through, and it is what separates good stock
 *   from newsprint.
 *
 *   PaperGrain. The micro-roughness that takes the ink. Too small to see as shape,
 *   so it is not in the surface at all: it is a flicker in the light, and it
 *   only shows where the light is raking.
 *
 * Which of those three goes into the height and which goes into the tone is the
 * whole shape of this thing, rather than a detail of it. Only the fibre is
 * surface: it is differenced into a normal and lit. Formation is a density, so
 * it changes how much light comes back and not which way the sheet faces, and
 * it belongs in the tone. Put both in the height, which is the obvious way to
 * write this, and the broad field contributes almost nothing because a broad
 * field has almost no slope, while the fine fibre dominates the derivative: the
 * first version of this was rough-cast plaster, and no amount of retuning the
 * numbers was going to make it paper.
 *
 * Nothing in the paper moves. The light swings, slowly, through a few degrees.
 * Grain that crawls is film grain, which is a different effect and a far
 * noisier one, and the measured change per frame here is about a hundredth of
 * what a drifting field costs.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type PaperGrainOptions = BaseOptions & {
  /** The stock. A warm white by default; set it dark for card. */
  paper: string
  /** What the fibre is tinted towards where it lies thickest. */
  fibre: string
  /** Fibres across the short side. Higher is a finer, harder sheet. */
  scale: number
  /** Machine direction, in degrees. The axis the fibre lies along. */
  direction: number
  /** How far the fibre is drawn out along that axis. 1 is no direction at all. */
  stretch: number
  /** Strength of the cloud: the uneven spread of fibre you see in look-through. */
  formation: number
  /** The micro-roughness that takes ink. Shows only where the light rakes. */
  tooth: number
  /** Height of the light, 0 raking along the surface, 1 straight down on it. */
  light: number
  /** How strongly the surface is lit by its own slope. */
  relief: number
  /** Degrees the light swings over one period. */
  sweep: number
  /** Specks of unbeaten fibre in the stock. Papermakers call it shive. */
  shive: number
  /** Seconds for one swing of the light. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const paperGrainDefaults: PaperGrainOptions = {
  paper: '#f7f5ed',
  fibre: '#fffdf6',
  scale: 340,
  direction: 12,
  stretch: 3.4,
  formation: 0.55,
  tooth: 0.5,
  light: 0.18,
  relief: 0.6,
  sweep: 26,
  shive: 0.35,
  period: 36,
  reducedMotionTime: 9
}

// beamish:shader-begin shaders/paper-grain.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/paper-grain.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * PaperGrain: the surface of a sheet of paper, with nothing on it.
 *
 * The image is a lighting calculation, not a pattern. One noise field becomes a
 * height, the height is differenced into a normal, and the normal meets one low
 * light. Draw that same field as tone instead and the result is a grey cloud
 * that could be anything; light it and it is a sheet of paper.
 *
 * The fibre is stretched along the machine direction, because the stock runs in
 * a direction on a paper machine and the fibres lie along it. Formation, the
 * cloud you see holding a sheet to a window, is a density rather than a shape,
 * so it goes into the tone. The tooth is smaller than a pixel, so it goes into
 * neither: it is a flicker added to the light, weighted by how much the light
 * rakes, because roughness you cannot resolve only shows as sparkle in grazing
 * light.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_fibre;
uniform float u_scale;
uniform float u_direction;
uniform float u_stretch;
uniform float u_formation;
uniform float u_tooth;
uniform float u_light;
uniform float u_relief;
uniform float u_sweep;
uniform float u_shive;

out vec4 fragColor;

const float TAU = 6.28318530718;
const float PI = 3.14159265359;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/* Value noise, smoothstepped so the fields have no cell edges in them. */
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
    p = p * 2.03 + 17.3;
    amp *= 0.5;
  }
  return sum;
}

/*
 * The fibre, in a frame rotated to the machine direction and squashed across
 * it, which is what makes the grain run one way. Isotropic noise here is the
 * single thing that stops a paper texture reading as paper: the sheets that
 * really are isotropic are the handmade ones, and they look like felt.
 */
float fibreAt(vec2 p) {
  float a = radians(u_direction);
  mat2 toGrain = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 g = toGrain * p;
  g.x /= max(u_stretch, 0.05);
  return fbm(g * u_scale);
}

/*
 * Formation: the uneven spread of fibre, in patches far larger than the fibres.
 *
 * It belongs in the tone and not in the height, and that is the whole shape of
 * this shader rather than a detail. Formation is a density variation, so what
 * it changes is how much light comes back, not which way the surface faces.
 * Put it in the height with the fibre and two things go wrong: it contributes
 * almost nothing, because a broad field has almost no slope, and the fine fibre
 * that is left dominates the derivative and the sheet comes out as rough-cast
 * plaster.
 */
float formationAt(vec2 p) {
  return fbm(p * u_scale * 0.03 + 53.1);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);
  vec2 p = (cssPx - cssRes * 0.5) / shortSide;

  /*
   * Forward differences at one CSS pixel. The step has to be the pixel rather
   * than some small constant: a normal measured over a shorter distance than
   * the screen can resolve is sampling detail that is not in the image, and it
   * comes back as sparkle that moves when the canvas is resized.
   */
  float e = 1.0 / shortSide;
  float here = fibreAt(p);
  float hx = fibreAt(p + vec2(e, 0.0)) - here;
  float hy = fibreAt(p + vec2(0.0, e)) - here;

  // Divided by the step, so the slope is a slope rather than a difference, and
  // relief means the same thing at every canvas size.
  vec2 slope = vec2(hx, hy) / e;
  vec3 normal = normalize(vec3(-slope * u_relief * 0.02, 1.0));

  /*
   * One light, low. The swing is a sine of the phase, so it returns to where it
   * started and the loop closes exactly: a light that travels a full circle
   * passes through the back of the sheet on the way, which on a flat surface
   * reads as the image inverting.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  float azimuth = radians(135.0 + u_sweep * sin(phase));
  float elevation = mix(0.04, 1.0, clamp(u_light, 0.0, 1.0)) * PI * 0.5;
  vec3 sun = vec3(cos(azimuth) * cos(elevation), sin(azimuth) * cos(elevation), sin(elevation));

  /*
   * Paper is not a mirror and it is not a void. Nearly all of what comes off a
   * sheet is bounced light, so the ambient term is much the larger of the two
   * and the lit term is a small correction on top of it. Weight these the way a
   * solid object is weighted and the sheet turns to stone.
   */
  float lambert = max(dot(normal, sun), 0.0);
  float shade = 0.94 + 0.16 * (lambert - 0.5);

  /*
   * PaperGrain. Smaller than a pixel, so it cannot be in the surface: it is a
   * flicker in the light, weighted by how level the light is. Overhead light
   * fills the pits and the sheet goes flat, which is exactly what happens to a
   * sheet of paper under a ceiling light and the reason nobody photographs
   * paper that way.
   */
  float rake = 1.0 - clamp(u_light, 0.0, 1.0);
  float speck = hash12(floor(gl_FragCoord.xy)) - 0.5;
  shade += speck * 0.028 * u_tooth * (0.25 + 0.75 * rake);

  // The cloud, as tone. Centred on zero so it lightens and darkens the stock
  // rather than dragging the whole sheet one way.
  float cloud = (formationAt(p) - 0.5) * u_formation * 0.085;
  vec3 col = mix(u_paper, u_fibre, clamp(0.5 + cloud * 6.0, 0.0, 1.0)) * (shade + cloud);

  /*
   * Shive: specks of fibre the beater did not break down, which end up darker
   * than the sheet and are the one thing in here that is a mark rather than a
   * surface. Sparse on purpose. A sheet with visible shive all over it is a
   * sheet nobody bought.
   */
  vec2 cell = floor(cssPx * 0.5);
  float pick = hash12(cell + 91.7);
  float speckle = step(1.0 - u_shive * 0.0045, pick);
  col *= 1.0 - speckle * (0.10 + 0.14 * hash12(cell + 13.9));

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
  'u_fibre',
  'u_scale',
  'u_direction',
  'u_stretch',
  'u_formation',
  'u_tooth',
  'u_light',
  'u_relief',
  'u_sweep',
  'u_shive'
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
  if (!shader) throw new Error('PaperGrain: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`PaperGrain: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class PaperGrainSurface implements Surface<PaperGrainOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('PaperGrain needs a canvas')
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
    if (!gl) throw new Error('PaperGrain needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('PaperGrain: could not create program')
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
      throw new Error(`PaperGrain: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: PaperGrainOptions): void {
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
    gl.uniform3fv(loc('u_fibre'), rgb(opts.fibre))
    gl.uniform1f(loc('u_scale'), opts.scale)
    gl.uniform1f(loc('u_direction'), opts.direction)
    gl.uniform1f(loc('u_stretch'), opts.stretch)
    gl.uniform1f(loc('u_formation'), opts.formation)
    gl.uniform1f(loc('u_tooth'), opts.tooth)
    gl.uniform1f(loc('u_light'), opts.light)
    gl.uniform1f(loc('u_relief'), opts.relief)
    gl.uniform1f(loc('u_sweep'), opts.sweep)
    gl.uniform1f(loc('u_shive'), opts.shive)

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
 * Mount PaperGrain into `el`. The element needs a size, in CSS, not just content.
 *
 * ```ts
 * const sheet = createPaperGrain(document.querySelector('#hero')!)
 * sheet.start()
 * // …later
 * sheet.destroy()
 * ```
 */
export function createPaperGrain(el: HTMLElement, opts: Partial<PaperGrainOptions> = {}): EffectHandle {
  return mount<PaperGrainOptions>(el, opts, {
    defaults: paperGrainDefaults,
    create: () => new PaperGrainSurface()
  })
}

export default createPaperGrain
