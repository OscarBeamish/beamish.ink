You are adding **MoltenMetal** from Beamish to this project.

> Heat tint on a slow-moving metal surface, coloured by thin-film interference rather than by a palette. Backdrops · effect · MIT.
> https://beamish.ink/effects/molten-metal

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Built for a dark ground and declared as one. The colour is a reflection off a film, so it needs something dark underneath to reflect against
- The colour is thin-film interference, the same physics that colours an oil slick, a soap bubble, anodised titanium and steel heated in air. Light reflecting off the top of the film and light reflecting off the bottom travel different distances, and each wavelength cancels at a different thickness
- That is why it is not a hue ramp: the path difference depends on the angle light takes through the film, so tilting the surface shifts the colour, and the bands repeat order after order as the thickness grows. A gradient between two colours can do neither
- Snell's law is applied, so the angle used is the one inside the film rather than outside it. At a glancing angle the two differ by most of a band, which is where the film is most visible
- The half-wavelength phase flip on reflection off a denser medium is in the expression. Leave it out and every colour is its own complement, which looks plausible until you hold it next to a photograph of a soap film
- The surface normal is the analytic derivative of the same sum of waves that makes the height, not a sampled difference. A sampled normal quantises to the sample spacing and the flat runs come out faceted
- Every moving term is a sum of waves whose time coefficients are whole numbers of turns over the period, so the loop closes exactly
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/molten-metal/core.ts`**

```ts
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
  metal: '#454c58',
  scale: 0.6,
  relief: 0.5,
  flow: 0.25,
  film: 420,
  variation: 0.3,
  iridescence: 1,
  sheen: 0.3,
  shine: 20,
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

  // The specular, which is the light itself rather than the film. On a crease it
  // runs as a line rather than sitting as a blob, which is the whole reason the
  // creases are there.
  vec3 halfway = normalize(lightDir + view);
  float spec = pow(max(dot(n, halfway), 0.0), max(u_shine, 1.0)) * u_sheen;
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
```

**`src/beamish/shared/runtime.ts`**

```ts
/*
 * Beamish effect runtime.
 *
 * Every tier-1 effect is a thin `Surface` plugged into `mount()`. The host owns
 * everything that is the same for all of them and easy to get wrong: DPR capping,
 * resize, pausing offscreen, pausing on tab hide, reduced motion, WebGL context
 * loss and restore, and full teardown.
 *
 * An effect's core.ts should contain drawing, and nothing else.
 */

export type EffectHandle = {
  start(): void
  stop(): void
  update(opts: Record<string, unknown>): void
  /** Deterministic: the same `t` must always yield the same frame. */
  renderAtTime(t: number): void
  /** Release the WebGL context, RAF and every listener. */
  destroy(): void
}

export type Size = {
  /** CSS pixels. */
  width: number
  height: number
  /** Device pixels, DPR already capped. Use these for the drawing buffer. */
  pixelWidth: number
  pixelHeight: number
  dpr: number
}

export type Pointer = {
  /**
   * 0 to 1 across the element, origin top-left. Centre until first move.
   *
   * Under `pointerScope: 'window'` this is not clamped: 1.4 means the cursor is
   * 40% of the element's width past its right edge. An effect that reaches
   * beyond its own box needs to know how far.
   */
  x: number
  y: number
  /** False until the pointer has entered, so effects can idle sensibly. */
  active: boolean
}

/** One sample of a scripted cursor path. `t` is seconds; x/y are 0 to 1. */
export type PointerKey = { t: number; x: number; y: number }

export type Scroll = {
  /**
   * How far the host has travelled through the viewport. 0 when its top edge is
   * level with the bottom of the viewport, 1 when its bottom edge is level with
   * the top. Outside that range the element is off screen.
   */
  progress: number
  /**
   * Signed rate of change of `progress`, in units per second, already smoothed.
   * Negative is scrolling back up.
   *
   * This is the interesting one. Position tells an effect where it is; velocity
   * tells it how hard it was thrown, which is what anything physical has to know.
   */
  velocity: number
  /** False until the page has actually been scrolled. */
  active: boolean
}

/** One sample of a scripted scroll path. `t` is seconds; progress is 0 to 1. */
export type ScrollKey = { t: number; progress: number }

export type SurfaceContext = {
  /** The element the effect was mounted into. */
  host: HTMLElement
  /**
   * The generated canvas, or null for a `kind: 'dom'` effect. A text treatment
   * has nothing to draw into and should not be handed a canvas it will not use.
   */
  canvas: HTMLCanvasElement | null
  size: Size
}

/**
 * The per-effect half. `setup` runs on mount and again after the GPU hands the
 * context back, so it must be safe to call more than once.
 */
export interface Surface<O> {
  setup(ctx: SurfaceContext): void
  resize(size: Size): void
  /**
   * Draw one frame. `t` is absolute seconds from the start of the loop.
   *
   * Must be pure in `t`. Do not integrate against the previous frame, or the
   * recorder cannot produce a clean loop and `renderAtTime` breaks.
   */
  render(t: number, opts: O, pointer: Pointer, scroll: Scroll): void
  teardown(): void
  /** Return the GL context if there is one, so the host can release it. */
  context?(): WebGLRenderingContext | WebGL2RenderingContext | null
}

export type BaseOptions = {
  /**
   * Scripted cursor path. When set, the live pointer is ignored and the pointer
   * is sampled from this path at the current time, which is what makes
   * pointer-driven effects deterministic for the recorder.
   */
  pointerPath?: PointerKey[]
  /** Seconds the scripted path takes to run once before repeating. */
  pointerPathDuration?: number
  /**
   * Scripted scroll path. When set, the real scroll position is ignored and both
   * progress and velocity are read from this path at the current time.
   *
   * Velocity is the slope of the segment rather than a difference against the
   * last frame, so it is a function of `t` alone. That is the whole point: an
   * effect driven by a real scrollbar cannot be replayed, and the recorder needs
   * frame 90 to look the same every time it asks for it.
   */
  scrollPath?: ScrollKey[]
  /** Seconds the scripted scroll path takes to run once before repeating. */
  scrollPathDuration?: number
  /** Frame shown when the user prefers reduced motion. Pick one that composes. */
  reducedMotionTime?: number
  /** Cap on device pixel ratio. Above 2 the cost is real and the gain is not. */
  maxDpr?: number
  /** Set false to opt out of pausing when scrolled offscreen. */
  pauseWhenOffscreen?: boolean
  /**
   * Where the pointer is read from.
   *
   * `element` fires only while the cursor is over the host and reports 0 to 1.
   * `window` follows the cursor everywhere and reports element-relative
   * coordinates that go outside 0 to 1, which is what an effect needs if it
   * reacts to a cursor that has not arrived yet.
   */
  pointerScope?: 'element' | 'window'
}

export type MountConfig<O> = {
  /** Merged over on every `update()`. */
  defaults: O
  create(): Surface<O>
  /**
   * `canvas` generates a canvas filling the host and watches it for context
   * loss. `dom` generates nothing and hands the host element straight to the
   * surface, which is what a text or layout effect wants.
   */
  kind?: 'canvas' | 'dom'
  /** Extra classes for the generated canvas. Ignored when kind is 'dom'. */
  canvasClass?: string
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Linear sample of a scripted path, wrapping at `duration` so it loops. */
export const samplePointerPath = (keys: PointerKey[], t: number, duration: number): Pointer => {
  if (keys.length === 0) return { x: 0.5, y: 0.5, active: false }
  const first = keys[0]!
  if (keys.length === 1) return { x: first.x, y: first.y, active: true }

  const span = duration > 0 ? duration : keys[keys.length - 1]!.t
  const local = span > 0 ? ((t % span) + span) % span : 0

  let a = first
  let b = keys[keys.length - 1]!
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i]!
    const hi = keys[i + 1]!
    if (local >= lo.t && local <= hi.t) {
      a = lo
      b = hi
      break
    }
  }

  const gap = b.t - a.t
  const k = gap > 0 ? clamp01((local - a.t) / gap) : 0
  // Smoothstep between keys: a linear cursor reads as a machine, which is what
  // it is, but it looks wrong next to eased motion.
  const e = k * k * (3 - 2 * k)
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, active: true }
}

/**
 * Linear sample of a scripted scroll path, wrapping at `duration` so it loops.
 *
 * Velocity comes out of the same smoothstep by differentiating it rather than by
 * comparing against the previous frame, which is what keeps the whole thing a
 * function of `t`. The derivative of the smoothstep is 6k(1-k), so velocity is
 * zero at each key and peaks halfway between: the scroll eases in and out of
 * every stop by construction.
 */
export const sampleScrollPath = (keys: ScrollKey[], t: number, duration: number): Scroll => {
  if (keys.length === 0) return { progress: 0, velocity: 0, active: false }
  const first = keys[0]!
  if (keys.length === 1) return { progress: first.progress, velocity: 0, active: true }

  const span = duration > 0 ? duration : keys[keys.length - 1]!.t
  const local = span > 0 ? ((t % span) + span) % span : 0

  let a = first
  let b = keys[keys.length - 1]!
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i]!
    const hi = keys[i + 1]!
    if (local >= lo.t && local <= hi.t) {
      a = lo
      b = hi
      break
    }
  }

  const gap = b.t - a.t
  const k = gap > 0 ? clamp01((local - a.t) / gap) : 0
  const e = k * k * (3 - 2 * k)
  const delta = b.progress - a.progress
  return {
    progress: a.progress + delta * e,
    velocity: gap > 0 ? (delta * 6 * k * (1 - k)) / gap : 0,
    active: true
  }
}

export function mount<O extends BaseOptions>(
  el: HTMLElement,
  userOpts: Partial<O> | undefined,
  config: MountConfig<O>
): EffectHandle {
  let opts: O = { ...config.defaults, ...(userOpts ?? {}) }

  const kind = config.kind ?? 'canvas'

  let canvas: HTMLCanvasElement | null = null
  if (kind === 'canvas') {
    canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    /*
     * Hidden until the first frame is in it.
     *
     * A WebGL canvas with `alpha: false` starts opaque black, and it is in the
     * document from the moment it is created, so between that and the first
     * draw the browser has a black rectangle to paint. On a warm cache that is
     * one frame and it reads as a flash; on a cold one the gap is longer.
     *
     * visibility rather than display, because display: none gives the element
     * no size and the first measure would come back zero.
     */
    canvas.style.visibility = 'hidden'
    if (config.canvasClass) canvas.className = config.canvasClass
    el.appendChild(canvas)
  }

  let surface: Surface<O> | null = null
  let size: Size = measure()
  let raf = 0
  let running = false
  let destroyed = false
  let contextLost = false

  // Wall-clock is accumulated rather than read, so stopping and starting does not
  // jump the animation and the loop stays reproducible.
  let elapsed = 0
  let lastStamp = 0

  const pointer: Pointer = { x: 0.5, y: 0.5, active: false }
  const scroll: Scroll = { progress: 0, velocity: 0, active: false }

  /*
   * Scroll is sampled once per frame, in the loop, rather than on the scroll
   * event.
   *
   * The event is the obvious place and it is the wrong one. Measured on a real
   * wheel scroll, scroll events arrive at about 6Hz while the effect renders at
   * 60, so a value taken on the event is reused for up to five frames running
   * and the effect moves in visible steps. Decaying it between events does not
   * fix that; it just turns the steps into a sawtooth.
   *
   * Reading the rect every frame costs about 20 microseconds, measured, which
   * is a tenth of a percent of a frame. It is a read with no write in front of
   * it, so it forces no layout.
   *
   * This is the one piece of state in the runtime that is not a function of
   * `t`, which is why `scrollPath` exists to replace it wholesale for the
   * recorder.
   */
  let scrollStarted = false
  let scrollSeeded = false

  /*
   * Half-life of the velocity smoothing. A per-frame difference is noisy enough
   * that handing it straight to a shader looks like chatter, and frame times
   * are not uniform. 70ms is short enough to feel attached to the input and
   * long enough to hide that jitter.
   */
  const VELOCITY_HALF_LIFE = 0.07

  function sampleScroll(dt: number) {
    const rect = el.getBoundingClientRect()
    const viewport = window.innerHeight || 1
    /*
     * 0 when the top edge is level with the bottom of the viewport, 1 when the
     * bottom edge is level with the top. Measured against the element's own
     * height plus the viewport, so a tall hero and a short strip both travel
     * the full range, which is what makes the number worth handing to an
     * effect at all.
     */
    const span = viewport + rect.height
    const next = span > 0 ? clamp01((viewport - rect.top) / span) : 0

    if (!scrollSeeded) {
      // Nothing to difference against on the first frame, and seeding it with a
      // zero gap would read as an infinite velocity.
      scroll.progress = next
      scrollSeeded = true
      return
    }

    if (dt > 0) {
      const instant = (next - scroll.progress) / dt
      const k = 1 - Math.pow(0.5, dt / VELOCITY_HALF_LIFE)
      scroll.velocity += (instant - scroll.velocity) * k
      if (Math.abs(scroll.velocity) < 1e-4) scroll.velocity = 0
    }

    if (next !== scroll.progress) scrollStarted = true
    scroll.progress = next
    scroll.active = scrollStarted
  }

  const motionQuery =
    typeof matchMedia === 'function' ? matchMedia(REDUCED_MOTION_QUERY) : null
  let reduced = motionQuery?.matches ?? false

  function measure(): Size {
    const rect = el.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    const cap = opts.maxDpr ?? 2
    const dpr = Math.min(window.devicePixelRatio || 1, cap)
    return {
      width,
      height,
      pixelWidth: Math.max(1, Math.round(width * dpr)),
      pixelHeight: Math.max(1, Math.round(height * dpr)),
      dpr
    }
  }

  function applySize() {
    size = measure()
    if (canvas) {
      if (canvas.width !== size.pixelWidth) canvas.width = size.pixelWidth
      if (canvas.height !== size.pixelHeight) canvas.height = size.pixelHeight
    }
    surface?.resize(size)
  }

  function pointerAt(t: number): Pointer {
    const path = opts.pointerPath
    if (path && path.length > 0) {
      return samplePointerPath(path, t, opts.pointerPathDuration ?? 0)
    }
    return pointer
  }

  function scrollAt(t: number): Scroll {
    const path = opts.scrollPath
    if (path && path.length > 0) {
      return sampleScrollPath(path, t, opts.scrollPathDuration ?? 0)
    }
    return scroll
  }

  function draw(t: number) {
    if (!surface || contextLost) return
    surface.render(t, opts, pointerAt(t), scrollAt(t))
    // There is something in the canvas now, so it can be shown. Cheap: a style
    // write that is already the current value does not invalidate anything.
    if (canvas && canvas.style.visibility === 'hidden') canvas.style.visibility = ''
  }

  function tick(stamp: number) {
    if (!running) return
    const dt = Math.min(stamp - lastStamp, 100) / 1000 // clamp tab-switch spikes
    elapsed += dt
    lastStamp = stamp
    sampleScroll(dt)
    draw(elapsed)
    raf = requestAnimationFrame(tick)
  }

  function ensureSurface() {
    if (surface || destroyed) return
    surface = config.create()
    surface.setup({ host: el, canvas, size })
    surface.resize(size)
  }

  function start() {
    if (destroyed || running || contextLost) return
    ensureSurface()
    if (reduced) {
      // WCAG 2.3.3: no loop at all. Still show a composed frame rather than a
      // blank panel. See reducedMotionTime.
      draw(opts.reducedMotionTime ?? 0)
      return
    }
    running = true
    lastStamp = performance.now()
    raf = requestAnimationFrame(tick)
  }

  function stop() {
    running = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    /*
     * Velocity is sampled in the loop, so a paused effect would otherwise keep
     * whatever it was last handed. Resuming after being scrolled past would
     * then show one frame of a flick that happened seconds ago.
     */
    scroll.velocity = 0
  }

  // --- context loss ------------------------------------------------------
  // Chromium hands a lost context back when an active one is released, so this
  // path fires in ordinary use, not only on a GPU crash.

  const onLost = (event: Event) => {
    event.preventDefault() // without this the context is not recoverable
    contextLost = true
    stop()
    surface?.teardown()
    surface = null
  }

  const onRestored = () => {
    contextLost = false
    if (destroyed) return
    ensureSurface()
    applySize()
    if (visible) start()
  }

  // Only a canvas can lose a GL context. A DOM effect has nothing to listen for.
  canvas?.addEventListener('webglcontextlost', onLost as EventListener, false)
  canvas?.addEventListener('webglcontextrestored', onRestored, false)

  // --- pointer -----------------------------------------------------------

  const windowScope = opts.pointerScope === 'window'

  const onPointerMove = (event: PointerEvent) => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    // Window scope reports unclamped coordinates on purpose. An effect that
    // reaches past its own edge has to know how far past, and clamping would
    // pin it to the border instead.
    pointer.x = windowScope ? x : clamp01(x)
    pointer.y = windowScope ? y : clamp01(y)
    pointer.active = true
  }

  const onPointerLeave = () => {
    pointer.active = false
  }

  const pointerTarget: EventTarget = windowScope ? window : el
  pointerTarget.addEventListener('pointermove', onPointerMove as EventListener)
  // Only element scope has a leave: the window one is never left.
  if (!windowScope) el.addEventListener('pointerleave', onPointerLeave)

  // --- scroll ------------------------------------------------------------

  /*
   * No scroll listener. The position is read in the frame loop above, which is
   * both smoother and one fewer thing to remove on teardown. An effect that is
   * not running does not need a scroll position, because nothing is drawing it.
   */

  // --- visibility and viewport -------------------------------------------

  let visible = true
  let wantedByUser = false

  const resizeObserver = new ResizeObserver(() => {
    if (destroyed) return
    applySize()
    /*
     * Always redraw, not only when stopped.
     *
     * Assigning canvas.width or canvas.height resets the drawing buffer, and a
     * WebGL buffer resets to opaque black. Leaving that for the next animation
     * frame means one black frame every time the element changes size, and
     * since the observer fires once on its first observation, that was a black
     * flash on every mount: the canvas showed its first drawn frame, the
     * observer cleared it, and the page painted the hole before the next tick
     * filled it.
     */
    draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed)
  })
  resizeObserver.observe(el)

  const intersectionObserver =
    opts.pauseWhenOffscreen === false
      ? null
      : new IntersectionObserver(
          entries => {
            const entry = entries[entries.length - 1]
            if (!entry) return
            visible = entry.isIntersecting
            if (visible) {
              if (wantedByUser) start()
            } else {
              stop()
            }
          },
          { threshold: 0 }
        )
  intersectionObserver?.observe(el)

  const onVisibilityChange = () => {
    if (document.hidden) stop()
    else if (wantedByUser && visible) start()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  // Live listener, not a one-time read, so toggling the OS setting mid-session
  // takes effect without a reload.
  const onMotionChange = (event: MediaQueryListEvent) => {
    reduced = event.matches
    if (reduced) {
      stop()
      ensureSurface()
      draw(opts.reducedMotionTime ?? 0)
    } else if (wantedByUser && visible) {
      start()
    }
  }
  motionQuery?.addEventListener('change', onMotionChange)

  // --- handle ------------------------------------------------------------

  const handle: EffectHandle = {
    start() {
      wantedByUser = true
      if (visible && !document.hidden) start()
    },
    stop() {
      wantedByUser = false
      stop()
    },
    update(next) {
      opts = { ...opts, ...(next as Partial<O>) }
      applySize()
      if (!running) draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed)
    },
    renderAtTime(t) {
      if (destroyed) return
      ensureSurface()
      elapsed = t
      draw(t)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      stop()

      motionQuery?.removeEventListener('change', onMotionChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      intersectionObserver?.disconnect()
      resizeObserver.disconnect()
      pointerTarget.removeEventListener('pointermove', onPointerMove as EventListener)
      el.removeEventListener('pointerleave', onPointerLeave)
      canvas?.removeEventListener('webglcontextlost', onLost as EventListener)
      canvas?.removeEventListener('webglcontextrestored', onRestored)

      const gl = surface?.context?.() ?? null
      surface?.teardown()
      surface = null

      // Hand the context back now rather than waiting for GC. The browser budget
      // is 16 contexts or 16M pixels, whichever comes first, and a page that
      // navigates between demos will hit it otherwise.
      gl?.getExtension('WEBGL_lose_context')?.loseContext()

      canvas?.remove()
    }
  }

  return handle
}
```

## 2. What it is

Heat tint on a slow-moving metal surface, on a dark ground.

The colour is **thin-film interference**, which is the same thing that colours
an oil slick, a soap bubble, anodised titanium, and steel that has been heated
in air. It is not a palette and not a hue ramp, and that difference is the whole
item.

Light reflecting off the top of a very thin transparent film and light
reflecting off the bottom of it travel different distances. Where that
difference is half a wavelength they cancel, and because each wavelength
cancels at a different thickness, what is left is a colour that belongs to the
film rather than to the paint.

```glsl
vec3 reflectance(float opd, float top) {
  float base = top + 0.85;              // the metal underneath reflects 85%
  float swing = 2.0 * sqrt(top * 0.85); // and the film's own surface, this much
  return base + swing * cos(TAU * opd / lambda + PI);
}
```

Three things fall out of that, and they are what make it read as metal:

**The colour follows the slope, not the position.** The path difference depends
on the angle light takes through the film, so tilting the surface moves the
colour. A gradient between two colours cannot do that, and the moment you put
them side by side it is obvious which is which.

**The bands repeat.** Thickness keeps increasing, the cancellation comes round
again, and you get order after order of the same sequence, paler each time.

**It lives at the rim.** Reflection off the film is strongest at a glancing
angle, so the colour is strongest where the surface turns away from you.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `metal` | color | `#454c58` | any CSS hex | The metal under the film, as its own reflectance. A steel grey is the honest starting point: the darkness in the frame comes from the lighting rather than from the base colour, and a base dark enough to be a backdrop on its own leaves the interference nothing to tint. |
| `scale` | number | `0.6` | 0.2 to 4 | Size of the swell. Lower is fewer and larger features, which is what you want full screen; higher packs the bands tighter and starts to read as fabric rather than metal. |
| `relief` | number | `0.5` | 0.05 to 2 | How steep the surface is. It scales the slope rather than the height, because what the eye reads is the angle, and the angle is what the colour is a function of. |
| `flow` | number | `0.25` | 0 to 1.2 | How far the surface is dragged out of shape before it is read. At 0 it is five plane waves added together, which is quasi-periodic however the directions are chosen and shows its lattice the moment there is any contrast. This is what turns that into swirls and folds, and it is the difference between a surface and a pattern. |
| `film` | number | `420` | 150 to 1200 nm | Mean thickness of the film in nanometres, and the one control that picks the colour family. Around 250 gives the straw and brown of lightly heated steel, 420 the blues and purples, past 800 the pale higher orders that a soap film shows just before it pops. |
| `variation` | number | `0.3` | 0 to 1 | How much the thickness follows the surface. At 0 the colour comes only from the viewing angle, which is the cleaner and colder look; raising it makes the bands follow the shape the way a real oxide does. |
| `iridescence` | number | `1` | 0 to 6 | How far the interference is pushed past its physical strength. 1 is the real thing for a surface seen face on, and it is paler than people expect, because every photograph of oil on a puddle is taken at a glancing angle where the two reflections are closer in strength and the colour goes vivid. At 0 this is a dark lit metal with a sheen on it, which is a perfectly good quiet backdrop. |
| `sheen` | number | `0.3` | 0 to 1.5 | Strength of the specular highlight, which is the light itself rather than the film. It is what tells you the surface is polished. |
| `shine` | number | `20` | 4 to 160 | Tightness of that highlight. Low is a broad satin sheen across the whole swell; high is a small hard glint on the one facet pointing at the light. |
| `lightX` | number | `0.35` | -1 to 1 | Light direction across the frame. The highlight moves with it because the surface is lit rather than painted. |
| `lightY` | number | `0.6` | -1 to 1 | Light direction up the frame. Positive is from above, which is where light usually is and where the eye expects it. |
| `grain` | number | `0.3` | 0 to 1 | The sensor noise of a long exposure. Static rather than crawling: film grain that moves is a different effect and a far noisier one. |
| `period` | number | `48` | 12 to 120 s | Seconds for one full cycle, and the pace control. Long on purpose: a backdrop has to survive being ignored, and iridescence that hurries is a screensaver. |

## 5. Cleanup and SSR

`destroy()` releases the context, deletes the program and the VAO, cancels the
RAF and disconnects the observers. Call it.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`, which is
already on the React adapter.

## 6. Pausing and reduced motion

Handled in the runtime, and non-negotiable: WCAG 2.2.2 is Level A and it
describes every ambient backdrop. The handle has `stop()` and `start()`.

Also handled in the runtime. Under `prefers-reduced-motion: reduce` the loop
never starts and one frame is drawn, at `reducedMotionTime`.

## 7. The three mistakes most likely to be made here

1. **A pale metal.** The colour is a reflection off the film. On a light base
   there is nothing for it to reflect against and the whole effect washes out.

2. **Reaching for the hue.** If the colours are wrong, the control is `film`,
   not a hue rotation. Rotating the hue breaks the one thing that makes this
   read as a material: that the sequence of colours is the sequence a real film
   goes through.

3. **Flattening it.** At low `relief` there is no angle for the interference to
   vary over, so you get a flat wash. The colour needs the shape.

4. **Expecting it on paper.** `ground` says dark.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
