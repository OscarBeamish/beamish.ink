/*
 * MoltenMetal: Beamish
 * https://beamish.ink/effects/molten-metal
 *
 * Heat tint on a slow-moving metal surface, on a dark ground. WebGL2, no
 * three.js, no dependencies.
 *
 * The colour is thin-film interference rather than a palette: the same physics
 * that colours an oil slick, a soap bubble and steel heated in air. The shader
 * says why that matters and what it buys.
 *
 * The GL boilerplate is inline rather than imported. This file is published and
 * read on its own, and a reader should not have to fetch a second module to find
 * out how a program gets compiled.
 *
 * The shader source is generated from shaders/molten-metal.frag and
 * shaders/molten-metal.vert. Edit those, then run `pnpm generate`. The markers
 * are load-bearing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type MoltenMetalOptions = BaseOptions & {
  /** The metal under the film. Dark: the colour comes from the film, not from this. */
  metal: string
  /** Size of the swell. Lower is fewer, larger features. */
  scale: number
  /** How steep the surface is. It scales the slope, because the eye reads angle. */
  relief: number
  /** How far the surface is dragged out of shape before it is read. */
  flow: number
  /** Mean film thickness in nanometres, which is what picks the colour family. */
  film: number
  /** How much the thickness follows the surface, 0 to 1. */
  variation: number
  /** Strength of the interference colour against the bare metal. */
  iridescence: number
  /** Strength of the specular highlight. */
  sheen: number
  /** Tightness of that highlight. Low is a broad satin sheen, high is a glint. */
  shine: number
  /** How brushed the metal is, 0 to 0.95. It smears the highlight along the grain. */
  brush: number
  /** Light direction across the frame, -1 to 1. */
  lightX: number
  /** Light direction up the frame, -1 to 1. */
  lightY: number
  /** Sensor noise of a long exposure, 0 to 1. Static, not crawling film grain. */
  grain: number
  /** Seconds for one full cycle. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const moltenMetalDefaults: MoltenMetalOptions = {
  metal: '#6f757e',
  scale: 0.34,
  relief: 0.5,
  flow: 0.16,
  film: 300,
  variation: 0.14,
  iridescence: 0.9,
  sheen: 0.9,
  shine: 22,
  brush: 0.9,
  lightX: 0.35,
  lightY: 0.6,
  grain: 0.3,
  period: 48,
  reducedMotionTime: 8
}

// beamish:shader-begin shaders/molten-metal.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/molten-metal.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * MoltenMetal: heat tint on a slow-moving metal surface.
 *
 * The colour here is not a palette and not a hue ramp. It is thin-film
 * interference, which is the same thing that colours an oil slick, a soap
 * bubble, anodised titanium and steel that has been heated in air: light
 * reflecting off the top of a very thin transparent film and light reflecting
 * off the bottom of it travel different distances, and where that difference is
 * half a wavelength they cancel. Each wavelength cancels at a different
 * thickness, so what is left is a colour that belongs to the film rather than
 * to the paint.
 *
 * Three consequences, and they are what make it read as metal rather than as a
 * gradient:
 *
 *   The colour follows the slope. The path difference depends on the angle light
 *   takes through the film, so tilting the surface shifts the colour. A ramp
 *   between two colours cannot do that, and it is the first thing that gives
 *   those away.
 *
 *   The bands repeat. Thickness keeps increasing, the cancellation comes round
 *   again, and you get order after order of the same sequence, paler each time.
 *
 *   It is strongest at a glancing angle, where the reflection off the top of the
 *   film finally matches the reflection off the metal in strength.
 *
 * Everything that moves is a sum of waves whose time coefficients are whole
 * numbers of turns over the period, so the loop closes exactly, and every normal
 * is an analytic derivative rather than a sampled difference.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_metal;
uniform float u_scale;
uniform float u_relief;
uniform float u_flow;
uniform float u_film;
uniform float u_variation;
uniform float u_iridescence;
uniform float u_sheen;
uniform float u_shine;
uniform float u_brush;
uniform vec2  u_light;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;
const float PI = 3.14159265359;

/* Refractive index of the film. Oxide on steel sits around here. */
const float FILM_IOR = 1.45;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * A field of travelling waves, returned as height and slope together.
 *
 * The frequencies are in cycles rather than radians, because a frequency is
 * only meaningful against the width it has to cross: p spans a little over one
 * unit on a wide frame, so a term written as sin(dot(p, dir)) turns through a
 * fifth of a cycle from one side of the canvas to the other. That is a tilt,
 * not a wave, and it is the mistake that made the first draft of this a soft
 * grey blur.
 *
 * The time coefficients are whole numbers of turns over the period, so the loop
 * closes. Returning the derivative from the same expression rather than sampling
 * the height twice is not an optimisation: a sampled normal quantises to the
 * sample spacing and the flat runs come out faceted, which on something meant to
 * be polished is the illusion gone.
 */
vec3 waves(vec2 p, float phase, float seed, float ridge) {
  vec2 dirs[5] = vec2[5](
    vec2(0.92, 0.39),
    vec2(-0.52, 0.85),
    vec2(0.37, -0.93),
    vec2(-0.86, -0.51),
    vec2(0.14, 0.99)
  );
  float freq[5] = float[5](0.42, 0.79, 1.37, 2.31, 3.89);
  float amp[5] = float[5](1.0, 0.56, 0.31, 0.17, 0.09);
  /*
   * How many turns each wave takes over one period, and the two finest octaves
   * take none at all.
   *
   * This is the motion budget, and it is measured rather than judged. At 1, 2,
   * 3, 5, 7 the change was 1.4 per frame against the 0.2 a quiet item sits
   * under, and halving the harmonics only got it to 0.67: the fine detail is
   * what costs, because iridescence turns a small change in slope into a large
   * change in colour. Holding the last two octaves still leaves the large forms
   * drifting and the texture on them stationary, which is also what a heavy
   * liquid actually does.
   */
  float harm[5] = float[5](1.0, 1.0, 1.0, 0.0, 0.0);

  float h = 0.0;
  vec2 slope = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    float k = freq[i] * TAU;
    float arg = dot(p, dirs[i]) * k + phase * harm[i] + seed * (float(i) + 1.3);
    float w = sin(arg);
    float d = cos(arg);

    /*
     * \`ridge\` folds the wave at its zero crossings, which puts a crease there.
     * A crease is what turns a highlight from a smudge into a line, and a line
     * is most of what says metal. It is a blend rather than a switch because
     * folding every octave hard gives a quilt: the creases of five plane waves
     * at once are a lattice, and a lattice is the one thing this is not.
     *
     * The fold stays analytic. The derivative of abs(sin(u)) is
     * sign(sin(u)) * cos(u) * du, so there is still no sampling here.
     */
    float folded = abs(w) * 2.0 - 1.0;
    float dFolded = sign(w) * d * 2.0;

    h += amp[i] * mix(w, folded, ridge);
    slope += amp[i] * mix(d, dFolded, ridge) * k * dirs[i];
  }
  return vec3(h, slope);
}

/*
 * The interference, as a reflectance rather than as a colour.
 *
 * \`opd\` is the optical path difference in nanometres: the extra distance the ray
 * reflected off the bottom of the film travels. Two reflections, so twice the
 * thickness, times the index, times the cosine of the angle inside the film.
 *
 * \`top\` is how much the top surface reflects, and it is the interesting number.
 * Against the metal's 0.85 it is 0.04 looking straight down, and two beams that
 * unequal cannot cancel, only dip. At a glancing angle it climbs towards 1, the
 * two match, and the colour goes vivid. That is why a photograph of oil on a
 * puddle is saturated and a glance straight down at one is nearly grey.
 *
 * The PI is a real term and not a fudge. Reflection off the top surface is off a
 * denser medium, which flips the phase by half a wavelength; the reflection off
 * the bottom is not. Leave it out and every colour is its own complement, which
 * looks plausible until you hold it next to a photograph of a soap film.
 *
 * Normalised about its own mean, so what comes back is how much more of each
 * wavelength this point returns than a bare surface would, and the strength of
 * the effect stays a separate decision from its colour.
 */
vec3 interference(float opd, float top) {
  const float BOTTOM = 0.85;
  float base = top + BOTTOM;
  float swing = 2.0 * sqrt(top * BOTTOM);

  /*
   * Nine wavelengths across the visible band, weighted by the eye's own
   * response, rather than three samples at nominal red, green and blue.
   *
   * This is not fussiness, it is the colour. Sampling at 680, 550 and 440 makes
   * every thickness come out as one of a complementary pair, so the whole effect
   * swings between green and magenta and nothing else: the first draft of this
   * looked like an oil slick and never like heated steel. A real film runs
   * straw, bronze, purple, blue, cyan, gold, because the eye is integrating a
   * whole spectrum with the dips in different places.
   *
   * The weights are the CIE 1931 colour matching functions, from Wyman's
   * analytic fit, evaluated at build time rather than per pixel: the wavelengths
   * are fixed, so what is left in the shader is nine cosines and nine multiply
   * adds.
   */
  const float LAMBDA[9] = float[9](
    400.0, 437.5, 475.0, 512.5, 550.0, 587.5, 625.0, 662.5, 700.0
  );
  const vec3 BAR[9] = vec3[9](
    vec3(0.0115, 0.0013, 0.0608),
    vec3(0.3476, 0.0163, 1.7007),
    vec3(0.1446, 0.1119, 1.0449),
    vec3(0.0263, 0.5507, 0.1353),
    vec3(0.4341, 0.9945, 0.0088),
    vec3(1.0015, 0.7926, 0.0002),
    vec3(0.7589, 0.3164, 0.0000),
    vec3(0.1366, 0.0565, 0.0000),
    vec3(0.0057, 0.0043, 0.0000)
  );

  vec3 xyz = vec3(0.0);
  for (int i = 0; i < 9; i++) {
    xyz += BAR[i] * (base + swing * cos(TAU * opd / LAMBDA[i] + PI));
  }

  // XYZ to linear sRGB. The constructor takes columns, which is why this looks
  // transposed against the matrix as it is usually written down.
  mat3 toRGB = mat3(
    3.2406, -0.9689, 0.0557,
    -1.5372, 1.8758, -0.2040,
    -0.4986, 0.0415, 1.0570
  );

  /*
   * Divided by what a flat spectrum would give through the same nine samples,
   * so a surface with no interference comes back as exactly 1 and the strength
   * of the effect stays a separate decision from its colour.
   */
  const vec3 WHITE = vec3(3.4467, 2.6803, 2.6984);
  return (toRGB * xyz) / (WHITE * base);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);

  vec2 p = (cssPx - cssRes * 0.5) / max(shortSide, 1.0) * max(u_scale, 0.05);
  float phase = TAU * u_time / max(u_period, 0.001);

  /*
   * Domain warp: the field is not read at p but at p pushed sideways by two more
   * fields.
   *
   * This is the difference between a surface and a pattern. Five plane waves
   * added together are quasi-periodic however carefully the directions are
   * chosen, and at any real contrast the lattice shows: the first version with
   * creases in it came out as a quilt of identical diamonds. Bending the plane
   * they are read on destroys that regularity and leaves swirls and folds, which
   * is what a liquid surface does.
   *
   * The normal survives it by the chain rule. The warp has its own derivatives,
   * so the gradient of the warped field is the gradient of the field composed
   * with the Jacobian of the warp, and everything stays analytic.
   *
   * The warp itself is still: it takes no phase. Moving it as well doubles the
   * measured change per frame for no gain, because what you see then is the
   * whole frame sliding rather than a surface flowing through a shape. A river
   * moves; the bend it runs through does not.
   */
  vec3 wx = waves(p + vec2(3.7, 1.2), 0.0, 1.0, 0.0);
  vec3 wy = waves(p + vec2(-2.1, 5.4), 0.0, 2.0, 0.0);
  vec2 q = p + u_flow * vec2(wx.x, wy.x);

  /*
   * 0.55 rather than something softer. Dropping the fold to 0.32 was tried and
   * it takes the long highlights with it: the creases are what a streak of
   * light has to run along, and without them the surface reads as painted
   * sheets rather than as metal.
   */
  vec3 f = waves(q, phase, 3.0, 0.55);
  float height = f.x;
  vec2 grad = vec2(
    f.y * (1.0 + u_flow * wx.y) + f.z * (u_flow * wy.y),
    f.y * (u_flow * wx.z) + f.z * (1.0 + u_flow * wy.z)
  );

  // Relief scales the slope rather than the height, because what the eye reads
  // is the angle, and the angle is what the colour is a function of.
  vec3 n = normalize(vec3(-grad * u_relief, 1.0));
  vec3 view = vec3(0.0, 0.0, 1.0);
  vec3 lightDir = normalize(vec3(u_light, 0.9));

  float cosI = clamp(dot(n, view), 0.0, 1.0);

  /*
   * Snell, so the angle used is the one inside the film rather than the one
   * outside it. At a glancing angle the two differ by most of a band, which is
   * exactly where the film is most visible.
   */
  float sinI = sqrt(max(1.0 - cosI * cosI, 0.0));
  float sinT = sinI / FILM_IOR;
  float cosT = sqrt(max(1.0 - sinT * sinT, 0.0));

  // Thickness follows the surface, which is what makes the bands lie on the
  // shape rather than sitting over it like a decal.
  float thickness = max(u_film * (1.0 + u_variation * height * 0.5), 20.0);
  float opd = 2.0 * FILM_IOR * thickness * cosT;

  float fresnel = 0.04 + 0.96 * pow(1.0 - cosI, 5.0);
  vec3 film = interference(opd, fresnel);
  vec3 tint = vec3(1.0) + (film - vec3(1.0)) * u_iridescence;

  /*
   * Wrapped rather than clamped at the terminator. A polished surface under a
   * sky still returns light where it faces away from the lamp, and a hard
   * Lambert on a field this bumpy leaves half the frame black with the film
   * invisible in it.
   */
  float facing = dot(n, lightDir) * 0.5 + 0.5;
  float lit = 0.16 + 0.84 * facing * facing;

  vec3 col = u_metal * lit * tint;

  /*
   * The specular, which is the light itself rather than the film, and the one
   * place this says metal rather than oil.
   *
   * Rolled and brushed steel are anisotropic: the surface is covered in fine
   * parallel grooves, so a point of light does not reflect as a point. It
   * smears into a line across the grain, which is why a brushed panel has that
   * long soft streak in it and why a polished sphere does not.
   *
   * Compressing the normal along the grain before the highlight is worked out
   * gives exactly that: the surface then varies less in that direction as far
   * as the light is concerned, so the highlight stretches along it. Cheaper
   * than a real anisotropic BRDF and, at this scale, indistinguishable.
   */
  vec3 halfway = normalize(lightDir + view);
  vec2 grain2 = vec2(1.0, 0.0);
  float along = dot(n.xy, grain2);
  float across = dot(n.xy, vec2(-grain2.y, grain2.x));
  vec3 brushed = normalize(vec3(
    along * (1.0 - u_brush) * grain2 + across * vec2(-grain2.y, grain2.x),
    max(n.z, 0.05)
  ));
  float spec = pow(max(dot(brushed, halfway), 0.0), max(u_shine, 1.0)) * u_sheen;
  col += vec3(spec);

  /*
   * A soft shoulder rather than a clamp. A specular on a curved surface will run
   * past 1 somewhere, and clipping turns the highlight into a flat white shape
   * with a hard edge, which is the one thing polished metal never does.
   */
  col = vec3(1.0) - exp(-col);

  // Static grain. On a dark ground it reads as the noise of a long exposure
  // rather than as texture on the metal.
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
  'u_metal',
  'u_scale',
  'u_relief',
  'u_flow',
  'u_film',
  'u_variation',
  'u_iridescence',
  'u_sheen',
  'u_shine',
  'u_brush',
  'u_light',
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
  if (!shader) throw new Error('MoltenMetal: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`MoltenMetal: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class MoltenMetalSurface implements Surface<MoltenMetalOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('MoltenMetal needs a canvas')
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
    if (!gl) throw new Error('MoltenMetal needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('MoltenMetal: could not create program')
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
      throw new Error(`MoltenMetal: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: MoltenMetalOptions): void {
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
    gl.uniform3fv(at('u_metal'), parseColor(opts.metal))
    gl.uniform1f(at('u_scale'), opts.scale)
    gl.uniform1f(at('u_relief'), opts.relief)
    gl.uniform1f(at('u_flow'), opts.flow)
    gl.uniform1f(at('u_film'), opts.film)
    gl.uniform1f(at('u_variation'), opts.variation)
    gl.uniform1f(at('u_iridescence'), opts.iridescence)
    gl.uniform1f(at('u_sheen'), opts.sheen)
    gl.uniform1f(at('u_shine'), opts.shine)
    gl.uniform1f(at('u_brush'), opts.brush)
    gl.uniform2f(at('u_light'), opts.lightX, opts.lightY)
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
 * Mount MoltenMetal into `el`. The element needs a size. Give it width and
 * height in CSS, not just content.
 *
 * ```ts
 * const molten = createMoltenMetal(document.querySelector('#bg')!)
 * molten.start()
 * // …later
 * molten.destroy()
 * ```
 */
export function createMoltenMetal(
  el: HTMLElement,
  opts: Partial<MoltenMetalOptions> = {}
): EffectHandle {
  return mount<MoltenMetalOptions>(el, opts, {
    defaults: moltenMetalDefaults,
    create: () => new MoltenMetalSurface()
  })
}

export default createMoltenMetal
