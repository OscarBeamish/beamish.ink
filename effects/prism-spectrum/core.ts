/*
 * PrismSpectrum: Beamish
 * https://beamish.ink/effects/prism-spectrum
 *
 * A beam of white light through a slowly turning prism, on a dark ground.
 * WebGL2, no three.js, no dependencies.
 *
 * The fan is traced rather than drawn: sixteen wavelengths, each with its own
 * refractive index from Cauchy's equation, refracted at both faces and cast as
 * its own ray. The shader says why that is worth the trouble.
 *
 * The GL boilerplate is inline rather than imported. This file is published and
 * read on its own, and a reader should not have to fetch a second module to find
 * out how a program gets compiled.
 *
 * The shader source is generated from shaders/prism-spectrum.frag and
 * shaders/prism-spectrum.vert. Edit those, then run `pnpm generate`. The markers
 * are load-bearing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type PrismSpectrumOptions = BaseOptions & {
  /** The room behind it. Dark: this is light on a ground, not a pattern. */
  background: string
  /** Apex angle of the prism in degrees. 60 is the one in every textbook. */
  apex: number
  /** Angle the beam arrives at, in degrees. */
  incidence: number
  /** Cauchy's A: roughly the index in the middle of the visible band. */
  index: number
  /** Cauchy's B in micrometres squared. This is the dispersion itself. */
  dispersion: number
  /** How large the prism is, as a share of the short side. */
  size: number
  /** Width of the beams. */
  spread: number
  /** Strength of the light. */
  brightness: number
  /** How visible the glass is, 0 to 1. Low: the light is the subject. */
  glass: number
  /** How the prism is set in the frame, in degrees. This is the aim. */
  tilt: number
  /** How far the prism rocks, in radians. */
  sway: number
  /** Sensor noise of a long exposure, 0 to 1. Static, not crawling film grain. */
  grain: number
  /** Seconds for one full cycle. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const prismSpectrumDefaults: PrismSpectrumOptions = {
  background: '#07080c',
  apex: 60,
  incidence: 10,
  index: 1.52,
  dispersion: 0.012,
  size: 0.34,
  spread: 0.012,
  brightness: 1,
  glass: 0.8,
  tilt: -30,
  sway: 0.22,
  grain: 0.3,
  period: 48,
  reducedMotionTime: 12
}

// beamish:shader-begin shaders/prism-spectrum.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/prism-spectrum.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * PrismSpectrum: a beam of white light through a turning prism.
 *
 * The fan is not a rainbow gradient drawn at an angle. It is traced: sixteen
 * wavelengths, each refracted at the entry face, carried through the glass,
 * refracted again on the way out, and drawn as its own ray.
 *
 * What makes that worth doing is that every property people recognise falls
 * out of it rather than being arranged:
 *
 *   Red bends least and violet most, because the refractive index of glass
 *   rises towards the blue end. That ordering is not a choice here. Reverse the
 *   dispersion constant and the spectrum reverses, as it would in a material
 *   with anomalous dispersion.
 *
 *   The fan is narrow. A real 60 degree prism in crown glass spreads the
 *   visible band by about one degree, which is why a prism throws a long thin
 *   spectrum rather than a wide one, and why the picture everyone has in mind
 *   is of a spectrum cast several metres away.
 *
 *   The spread changes as the prism turns, and it is least near minimum
 *   deviation, where the beam passes symmetrically. That is the one place the
 *   fan tightens as it sweeps, and it is the detail that says this is being
 *   worked out rather than painted.
 *
 * The index comes from Cauchy's equation, n = A + B / lambda squared, which is
 * the two-term fit every glass catalogue starts with. A is roughly the index in
 * the middle of the band and B is the dispersion.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_background;
uniform float u_apex;
uniform float u_incidence;
uniform float u_index;
uniform float u_dispersion;
uniform float u_size;
uniform float u_spread;
uniform float u_brightness;
uniform float u_glass;
uniform float u_tilt;
uniform float u_sway;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;
const float PI = 3.14159265359;
const int SAMPLES = 16;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 turn(vec2 p, float a) {
  float s = sin(a), c = cos(a);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

/*
 * Ray against one edge, as a segment rather than an infinite line, so the hit
 * is on the prism rather than on its continuation.
 */
bool hitEdge(vec2 o, vec2 d, vec2 p0, vec2 p1, out float t, out vec2 nrm) {
  vec2 e = p1 - p0;
  float den = d.x * e.y - d.y * e.x;
  if (abs(den) < 1e-7) return false;
  vec2 diff = p0 - o;
  float tt = (diff.x * e.y - diff.y * e.x) / den;
  float u = (diff.x * d.y - diff.y * d.x) / den;
  if (tt <= 1e-4 || u < 0.0 || u > 1.0) return false;
  t = tt;
  nrm = normalize(vec2(e.y, -e.x));
  return true;
}

/* The nearest of the three edges. */
bool hitPrism(vec2 o, vec2 d, vec2 a, vec2 b, vec2 c, out float t, out vec2 nrm) {
  bool found = false;
  t = 1e9;
  float tt;
  vec2 nn;
  if (hitEdge(o, d, a, b, tt, nn) && tt < t) { t = tt; nrm = nn; found = true; }
  if (hitEdge(o, d, b, c, tt, nn) && tt < t) { t = tt; nrm = nn; found = true; }
  if (hitEdge(o, d, c, a, tt, nn) && tt < t) { t = tt; nrm = nn; found = true; }
  return found;
}

/* Distance from a point to a segment, and to a half-line. */
float distSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
  return length(pa - ba * h);
}

float distRay(vec2 p, vec2 o, vec2 d) {
  float h = max(dot(p - o, d), 0.0);
  return length(p - o - d * h);
}

/* Signed distance to the triangle, negative inside. */
float sdTriangle(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 q0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 q1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 q2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(
    min(vec2(dot(q0, q0), s * (v0.x * e0.y - v0.y * e0.x)),
        vec2(dot(q1, q1), s * (v1.x * e1.y - v1.y * e1.x))),
    vec2(dot(q2, q2), s * (v2.x * e2.y - v2.y * e2.x))
  );
  return -sqrt(d.x) * sign(d.y);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 p = (cssPx - cssRes * 0.5) / max(shortSide, 1.0);

  float phase = TAU * u_time / max(u_period, 0.001);

  /*
   * The prism: an isoceles triangle of the given apex angle, turning slowly.
   *
   * The sway is a sine rather than a spin. A prism rotating through a whole
   * turn spends most of the cycle with the beam missing it or exiting through
   * the face it came in by, and the interesting part, the pass through minimum
   * deviation, goes by in a moment. Rocking it through a few degrees keeps the
   * spectrum on the screen and sweeps it across the one range that matters.
   */
  float apex = radians(clamp(u_apex, 20.0, 110.0));
  float height = u_size;
  float halfBase = height * tan(apex * 0.5);
  float angle = radians(u_tilt) + u_sway * sin(phase);

  /*
   * Set high and to the right rather than in the middle of the frame. The beam
   * arrives from the left and the spectrum leaves downward, so a centred prism
   * throws its fan off the bottom corner within a third of the width. Put the
   * glass where the light has somewhere to go and both halves of the picture
   * get a diagonal to run along.
   */
  vec2 centre = vec2(0.26, 0.15);
  vec2 v0 = centre + turn(vec2(0.0, height * 0.6), angle);
  vec2 v1 = centre + turn(vec2(-halfBase, -height * 0.4), angle);
  vec2 v2 = centre + turn(vec2(halfBase, -height * 0.4), angle);

  // The incoming beam, aimed at the middle of the left face.
  vec2 aim = mix(v0, v1, 0.55);
  vec2 dir = vec2(cos(radians(u_incidence)), sin(radians(u_incidence)));
  vec2 start = aim - dir * 1.6;

  vec3 col = u_background;

  float entryT;
  vec2 entryN;
  bool entered = hitPrism(start, dir, v0, v1, v2, entryT, entryN);
  vec2 entry = start + dir * entryT;

  // The beam on its way in. One white line, because nothing has split yet.
  float incident = exp(-pow(distSegment(p, start, entry) / u_spread, 2.0));
  col += vec3(1.0, 0.98, 0.94) * incident * u_brightness * (entered ? 1.0 : 1.0);

  if (entered) {
    /*
     * Which face it leaves by is worked out once, with the middle of the band,
     * rather than per wavelength. The rays inside the glass differ by a fraction
     * of a degree, so they leave through the same face as each other; tracing
     * all sixteen against all three edges would be three times the work for a
     * difference below a pixel.
     */
    float nMid = u_index + u_dispersion / (0.55 * 0.55);
    vec2 inwardN = dot(entryN, dir) > 0.0 ? entryN : -entryN;
    vec2 midDir = refract(dir, -inwardN, 1.0 / nMid);

    float exitT;
    vec2 exitN;
    bool leaves = hitPrism(entry, midDir, v0, v1, v2, exitT, exitN);

    if (leaves) {
      vec2 exitPoint = entry + midDir * exitT;

      // The beam inside the glass. Still nearly white: the split is there, it
      // is just a fraction of a degree wide over this distance.
      float inside = exp(-pow(distSegment(p, entry, exitPoint) / (u_spread * 0.9), 2.0));
      col += vec3(0.92, 0.95, 1.0) * inside * u_brightness * 0.55;

      /*
       * And the fan. Sixteen wavelengths, each with its own index from Cauchy's
       * equation, refracted twice and drawn as its own ray from where it leaves
       * the glass.
       *
       * The tints are the CIE 1931 colour matching functions converted to
       * linear sRGB, evaluated at build time. Several of them are outside the
       * gamut and clamp, which is correct and unavoidable: a monitor cannot
       * show a spectral green, and the honest thing is to let it sit on the
       * edge of what it can show rather than desaturate the whole spectrum to
       * make it fit.
       */
      const float LAMBDA[16] = float[16](
        400.0, 420.0, 440.0, 460.0, 480.0, 500.0, 520.0, 540.0,
        560.0, 580.0, 600.0, 620.0, 640.0, 660.0, 680.0, 700.0
      );
      const vec3 TINT[16] = vec3[16](
        vec3(0.0054, 0.0000, 0.0674),
        vec3(0.1276, 0.0000, 0.7261),
        vec3(0.2799, 0.0000, 1.9288),
        vec3(0.0000, 0.0000, 1.8474),
        vec3(0.0000, 0.2053, 0.8696),
        vec3(0.0000, 0.6500, 0.2298),
        vec3(0.0000, 1.3153, 0.0000),
        vec3(0.0000, 1.5814, 0.0000),
        vec3(0.4478, 1.3301, 0.0000),
        vec3(1.7127, 0.7767, 0.0000),
        vec3(2.5520, 0.1742, 0.0000),
        vec3(2.2871, 0.0000, 0.0000),
        vec3(1.2581, 0.0000, 0.0000),
        vec3(0.4373, 0.0000, 0.0000),
        vec3(0.0953, 0.0000, 0.0000),
        vec3(0.0123, 0.0027, 0.0000)
      );

      vec2 outwardN = dot(exitN, midDir) < 0.0 ? -exitN : exitN;

      for (int i = 0; i < SAMPLES; i++) {
        float um = LAMBDA[i] * 0.001;
        float n = u_index + u_dispersion / (um * um);

        vec2 inDir = refract(dir, -inwardN, 1.0 / n);
        if (dot(inDir, inDir) < 1e-6) continue;

        /*
         * Carried the same distance through the glass as the middle of the
         * band. The rays inside differ by a fraction of a degree, so over the
         * width of a prism they arrive within a pixel of each other, and
         * intersecting each one against the faces again would be three times
         * the work for a difference nobody can see.
         */
        vec2 x = entry + inDir * exitT;

        vec2 outDir = refract(inDir, outwardN, n);
        // Total internal reflection: no ray leaves at this wavelength, which is
        // a real thing a prism does and not a case to paper over.
        if (dot(outDir, outDir) < 1e-6) continue;
        outDir = normalize(outDir);

        float d = distRay(p, x, outDir);
        float reach = exp(-max(dot(p - x, outDir), 0.0) * 0.3);
        float ray = exp(-pow(d / (u_spread * 1.35), 2.0));
        col += TINT[i] * ray * reach * u_brightness * 0.22;
      }
    }
  }

  /*
   * The glass itself, last and faintly. It is a window rather than an object:
   * what you are meant to look at is the light, and a prism drawn as a solid
   * shape in front of its own spectrum is a paperweight.
   */
  float sd = sdTriangle(p, v0, v1, v2);
  float body = smoothstep(0.004, -0.004, sd);
  float edge = exp(-pow(abs(sd) / 0.0045, 2.0));
  col += vec3(0.55, 0.62, 0.78) * body * 0.05 * u_glass;
  col += vec3(0.8, 0.86, 1.0) * edge * 0.5 * u_glass;

  // A soft shoulder rather than a clamp, so where the rays cross they go white
  // the way a photograph does rather than flattening into a hard patch.
  col = vec3(1.0) - exp(-col);

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
  'u_background',
  'u_apex',
  'u_incidence',
  'u_index',
  'u_dispersion',
  'u_size',
  'u_spread',
  'u_brightness',
  'u_glass',
  'u_tilt',
  'u_sway',
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
  if (!shader) throw new Error('PrismSpectrum: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`PrismSpectrum: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class PrismSpectrumSurface implements Surface<PrismSpectrumOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('PrismSpectrum needs a canvas')
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
    if (!gl) throw new Error('PrismSpectrum needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('PrismSpectrum: could not create program')
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
      throw new Error(`PrismSpectrum: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: PrismSpectrumOptions): void {
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
    gl.uniform3fv(at('u_background'), parseColor(opts.background))
    gl.uniform1f(at('u_apex'), opts.apex)
    gl.uniform1f(at('u_incidence'), opts.incidence)
    gl.uniform1f(at('u_index'), opts.index)
    gl.uniform1f(at('u_dispersion'), opts.dispersion)
    gl.uniform1f(at('u_size'), opts.size)
    gl.uniform1f(at('u_spread'), opts.spread)
    gl.uniform1f(at('u_brightness'), opts.brightness)
    gl.uniform1f(at('u_glass'), opts.glass)
    gl.uniform1f(at('u_tilt'), opts.tilt)
    gl.uniform1f(at('u_sway'), opts.sway)
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
 * Mount PrismSpectrum into `el`. The element needs a size. Give it width and
 * height in CSS, not just content.
 *
 * ```ts
 * const prism = createPrismSpectrum(document.querySelector('#bg')!)
 * prism.start()
 * // …later
 * prism.destroy()
 * ```
 */
export function createPrismSpectrum(
  el: HTMLElement,
  opts: Partial<PrismSpectrumOptions> = {}
): EffectHandle {
  return mount<PrismSpectrumOptions>(el, opts, {
    defaults: prismSpectrumDefaults,
    create: () => new PrismSpectrumSurface()
  })
}

export default createPrismSpectrum
