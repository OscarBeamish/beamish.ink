/*
 * StippleField: Beamish
 * https://beamish.ink/effects/stipple-field
 *
 * Tone carried by how many dots there are, not how big they are.
 *
 * That is the whole distinction from a halftone, and it is worth being exact
 * about because the two look superficially alike. A halftone puts a dot in the
 * middle of every cell of a regular grid and varies its size: the count is
 * fixed and the area does the work. A stipple engraver has one nib, so every
 * mark is the same size, and darker means more marks closer together.
 *
 * The grid here is only a way of avoiding a sort. Each cell holds at most one
 * dot, thrown off centre by a hash, and whether it exists at all comes from
 * comparing a second hash against the tone wanted at that point. Off-grid
 * positions and a population that thins out is what reads as a hand rather than
 * as a screen.
 */

import { mount, type BaseOptions, type EffectHandle, type Pointer, type Surface } from '../../shared/runtime'

export type StippleFieldOptions = BaseOptions & {
  /** The paper behind the marks. */
  paper: string
  /** The nib. */
  ink: string
  /** A second nib, on a small share of the marks. */
  accent: string
  /** Cell size in CSS pixels. One mark per cell at most, so this is spacing. */
  pitch: number
  /** How far each mark is thrown off the centre of its cell. */
  jitter: number
  /** Size of the tone field. Lower is broader country. */
  scale: number
  /** Radius of a mark, in cells. Every mark is the same size. */
  weight: number
  /** How hard the field pushes away from the midtone. */
  contrast: number
  /** Share of marks that take the second nib. */
  accentShare: number
  /** Paper tooth under the marks. */
  grain: number
  /** How much tone the cursor works up under itself. Zero leaves it ambient. */
  touch: number
  /** How far the hand reaches, as a share of the short side. */
  reach: number
  /** Seconds for one loop of the drift. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const stippleFieldDefaults: StippleFieldOptions = {
  paper: '#fbfaf4',
  ink: '#36362f',
  accent: '#c44400',
  pitch: 7,
  jitter: 0.75,
  scale: 1.6,
  weight: 0.19,
  contrast: 1.9,
  accentShare: 0.06,
  grain: 0.4,
  touch: 0.65,
  reach: 0.45,
  period: 36,
  reducedMotionTime: 4
}

// beamish:shader-begin shaders/stipple-field.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/stipple-field.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * StippleField: tone carried by how many dots there are, not how big they are.
 *
 * That is the whole distinction from a halftone, and it is worth being exact
 * about because the two look superficially alike. A halftone puts a dot in the
 * middle of every cell of a regular grid and varies its size: the count is
 * fixed and the area does the work. A stipple engraver has one nib, so every
 * mark is the same size, and darker means more marks closer together.
 *
 * So the grid here is only a way of not having to sort anything. Each cell
 * holds at most one dot, thrown off centre by a hash, and whether that dot
 * exists at all is decided by comparing a second hash against the tone wanted
 * at that point. Off-grid positions and a population that thins out is what
 * reads as a hand rather than as a screen.
 *
 * The tone field drifts on a closed orbit through noise space, so the loop
 * returns to exactly where it started.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_ink;
uniform vec3  u_accent;
uniform float u_pitch;
uniform float u_jitter;
uniform float u_scale;
uniform float u_weight;
uniform float u_contrast;
uniform float u_accentShare;
uniform float u_grain;
uniform vec2  u_pointer;
uniform float u_active;
uniform float u_touch;
uniform float u_reach;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  return vec2(hash12(p), hash12(p + 37.19));
}

/* Value noise. Smoothstepped so the tone field has no visible cell edges. */
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
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 p = (cssPx - cssRes * 0.5) / (shortSide * 0.5);

  /*
   * A closed orbit through noise space. The field is sampled at a point that
   * travels a circle, so after one period it is back where it began and the
   * loop is seamless rather than crossfaded.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  vec2 orbit = vec2(cos(phase), sin(phase)) * 0.35;

  float tone = fbm(p * u_scale + orbit);
  // Centred on 0.5 before the contrast is applied, so raising contrast opens
  // the field out from the midtone rather than dragging the whole thing dark.
  tone = clamp((tone - 0.5) * u_contrast + 0.5, 0.0, 1.0);

  /*
   * The hand. Tone is how many marks there are, so working an area up is adding
   * marks to it, and that is exactly what the pointer does: it raises the tone
   * it is over and the population thickens to match.
   *
   * Gaussian rather than a disc with a soft edge. An engraver working a passage
   * has no boundary to their attention, and a circle of darker stipple with a
   * findable edge reads as a torch being shone on the drawing instead.
   *
   * Nothing is integrated here. The tone under the cursor is a function of
   * where the cursor is, so a scripted path replays identically and
   * renderAtTime stays pure.
   */
  vec2 hand = p - (vec2(u_pointer.x, 1.0 - u_pointer.y) * cssRes - cssRes * 0.5) / (shortSide * 0.5);
  float near = exp(-dot(hand, hand) / max(u_reach * u_reach, 0.0001));
  float working = near * u_active;
  tone = clamp(tone + u_touch * working, 0.0, 1.0);

  /*
   * And a second pass with the other nib where the hand is.
   *
   * Tone saturates, which is the whole problem with raising it alone: an area
   * already carrying a mark in every cell cannot take another one, so the hand
   * showed up beautifully in the light passages and did nothing whatever in the
   * dark ones. Changing which nib is working is something the dense passages
   * can answer to.
   */
  float share = u_accentShare + (0.8 - u_accentShare) * u_touch * working;

  /*
   * The cell grid lives in CSS pixels rather than in the normalised space, so
   * the dots stay the same size on screen whatever shape the element is and
   * however the field is scaled.
   */
  vec2 cell = cssPx / max(u_pitch, 1.0);
  vec2 id = floor(cell);
  vec2 f = fract(cell);

  /*
   * Neighbours as well as this cell. A dot thrown off centre crosses into the
   * next cell, and testing only its own would clip it at the boundary: the
   * jitter would read as dots being sliced rather than as dots being scattered.
   */
  float aa = max(fwidth(cell.x), fwidth(cell.y)) * 0.8 + 0.001;
  float cover = 0.0;
  float accent = 0.0;

  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 nid = id + vec2(float(ox), float(oy));

      /*
       * Whether that cell carries a mark at all. One nib, so the decision is
       * present or absent rather than large or small, and a fixed hash per cell
       * compared against the tone is what makes the population thin out
       * smoothly as the field lightens.
       */
      if (hash12(nid + 11.3) > tone) continue;

      // The neighbour's dot, in this pixel's own cell coordinates.
      vec2 jitter = (hash22(nid) - 0.5) * u_jitter;
      vec2 centre = vec2(float(ox), float(oy)) + 0.5 + jitter;

      float mark = smoothstep(u_weight + aa, u_weight - aa, length(f - centre));
      cover = max(cover, mark);
      if (hash12(nid + 71.7) < share) accent = max(accent, mark);
    }
  }

  vec3 ink = mix(u_ink, u_accent, accent);
  vec3 col = mix(u_paper, ink, cover);

  float tooth = hash12(floor(cssPx * 0.5) + 5.0) - 0.5;
  col += tooth * 0.05 * u_grain;

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
  'u_ink',
  'u_accent',
  'u_pitch',
  'u_jitter',
  'u_scale',
  'u_weight',
  'u_contrast',
  'u_accentShare',
  'u_grain',
  'u_pointer',
  'u_active',
  'u_touch',
  'u_reach'
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
  if (!shader) throw new Error('StippleField: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`StippleField: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class StippleFieldSurface implements Surface<StippleFieldOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('StippleField needs a canvas')
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
    if (!gl) throw new Error('StippleField needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('StippleField: could not create program')
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
      throw new Error(`StippleField: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: StippleFieldOptions, pointer: Pointer): void {
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
    gl.uniform3fv(loc('u_ink'), rgb(opts.ink))
    gl.uniform3fv(loc('u_accent'), rgb(opts.accent))
    gl.uniform1f(loc('u_pitch'), opts.pitch)
    gl.uniform1f(loc('u_jitter'), opts.jitter)
    gl.uniform1f(loc('u_scale'), opts.scale)
    gl.uniform1f(loc('u_weight'), opts.weight)
    gl.uniform1f(loc('u_contrast'), opts.contrast)
    gl.uniform1f(loc('u_accentShare'), opts.accentShare)
    gl.uniform1f(loc('u_grain'), opts.grain)
    gl.uniform2f(loc('u_pointer'), pointer.x, pointer.y)
    gl.uniform1f(loc('u_active'), pointer.active ? 1 : 0)
    gl.uniform1f(loc('u_touch'), opts.touch)
    gl.uniform1f(loc('u_reach'), opts.reach)

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
 * Mount StippleField into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const marbled = createStippleField(document.querySelector('#hero')!)
 * marbled.start()
 * // …later
 * marbled.destroy()
 * ```
 */
export function createStippleField(
  el: HTMLElement,
  opts: Partial<StippleFieldOptions> = {}
): EffectHandle {
  return mount<StippleFieldOptions>(el, opts, {
    defaults: stippleFieldDefaults,
    create: () => new StippleFieldSurface()
  })
}

export default createStippleField
