You are adding **PrismSpectrum** from Beamish to this project.

> A beam of white light through a turning prism, split into a spectrum by tracing it rather than drawing it. Backdrops · effect · MIT.
> https://beamish.ink/effects/prism-spectrum

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Built for a dark ground and declared as one. This is light on a ground rather than a pattern on a surface
- The fan is traced, not drawn: sixteen wavelengths, each refracted at the entry face, carried through the glass and refracted again on the way out, each cast as its own ray
- The index comes from Cauchy's equation, n = A + B over lambda squared, which is the two-term fit every glass catalogue starts with. Red bends least and violet most because the index rises towards the blue end, so the ordering is a consequence rather than a choice: reverse the dispersion constant and the spectrum reverses
- The fan is narrow on purpose. A real 60 degree prism in crown glass spreads the visible band by about a degree, which is why a prism throws a long thin spectrum rather than a wide one
- Total internal reflection is handled rather than papered over: where a wavelength cannot leave the second face, no ray is drawn for it, which is a real thing a prism does
- The tints are the CIE 1931 colour matching functions converted to linear sRGB and evaluated at build time. Several are outside the gamut and clamp, which is unavoidable: a monitor cannot show a spectral green, and desaturating the whole spectrum to make it fit would be worse
- The prism rocks rather than spins. A whole turn spends most of its time with the beam missing the glass or leaving by the face it came in through, and the pass through minimum deviation goes by in a moment
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/prism-spectrum/core.ts`**

```ts
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

A beam of white light through a slowly turning prism, on a dark ground.

The fan is **traced, not drawn**. Sixteen wavelengths, each with its own
refractive index, each refracted at the entry face, carried through the glass
and refracted again on the way out, each cast as its own ray.

That matters because everything people recognise about a prism then falls out
of it rather than being arranged:

**Red bends least and violet most**, because the refractive index of glass rises
towards the blue end. The ordering is not a choice here. Reverse `dispersion`
and the spectrum reverses, as it would in a material with anomalous dispersion.

**The fan is narrow.** A real 60 degree prism in crown glass spreads the visible
band by about one degree. That is why a prism throws a long thin spectrum rather
than a wide one, and why the picture everybody has in mind is of a spectrum cast
several metres away.

**The spread changes as it turns**, and it is tightest near minimum deviation,
where the beam passes through symmetrically. That is the one moment in the cycle
when the fan narrows and brightens, and it is the detail that says this is being
worked out rather than painted.

**Some wavelengths do not get out.** Where the angle inside the glass is past
the critical angle the ray is totally internally reflected and no line is drawn
for it, which is a real thing a prism does and not a case to paper over.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `background` | color | `#07080c` | any CSS hex | The room behind it. Dark, because everything drawn here is light being added to it: on a pale ground the beams have nothing to be brighter than. |
| `apex` | number | `60` | 20 to 110 deg | Apex angle of the prism. 60 is the one in every textbook and the one that spreads the band usefully; a shallow prism barely splits the light, and past about 75 degrees most of the beam is lost to total internal reflection. |
| `incidence` | number | `10` | -40 to 40 deg | The angle the beam arrives at. Together with the sway this decides how near the pass is to minimum deviation, which is where the fan is tightest and brightest. |
| `tilt` | number | `-30` | -90 to 90 deg | How the prism is set in the frame. This is the aim: it decides where the spectrum lands and how much of the canvas it crosses, and together with incidence it sets how near the pass is to minimum deviation. |
| `index` | number | `1.52` | 1.3 to 2.2 | Cauchy's A, which is roughly the refractive index in the middle of the visible band. 1.52 is crown glass, 1.46 fused silica, 2.42 diamond. |
| `dispersion` | number | `0.012` | 0 to 0.05 | Cauchy's B, in micrometres squared, and the dispersion itself. 0.0045 is about right for crown glass; flint glass is two or three times that, which is why it is what you cut a chandelier from. At 0 the glass still bends the beam and no longer splits it. |
| `size` | number | `0.34` | 0.1 to 0.7 | How large the prism is, as a share of the short side of the frame. Larger glass means a longer path inside it and a wider fan on the way out. |
| `spread` | number | `0.012` | 0.002 to 0.05 | Width of the beams. This is the one number here that is a drawing decision rather than an optical one: a real beam is as wide as its source, and this is how wide you want it to read. |
| `brightness` | number | `1` | 0.1 to 3 | Strength of the light. A soft shoulder keeps the crossings from clipping, so a high value goes white where the rays overlap the way a photograph does rather than flattening into a hard patch. |
| `glass` | number | `0.8` | 0 to 2 | How visible the prism itself is. Low on purpose: the light is the subject, and a prism drawn as a solid object in front of its own spectrum is a paperweight. |
| `sway` | number | `0.22` | 0 to 1 | How far the prism rocks, in radians, over one cycle. At 0 it is a still composition, which is a legitimate way to use this and the quietest thing in the library. |
| `grain` | number | `0.3` | 0 to 1 | The sensor noise of a long exposure. Static rather than crawling: film grain that moves is a different effect and a far noisier one. |
| `period` | number | `48` | 12 to 120 s | Seconds for one full cycle, and the pace control. Long on purpose: a backdrop has to survive being ignored, and a spectrum sweeping across a page is about as distracting as a backdrop can be. |

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
never starts and one frame is drawn, at `reducedMotionTime`. With `sway` at 0
there is nothing to reduce, because nothing was moving.

## 7. The three mistakes most likely to be made here

1. **Turning the dispersion up to see it better.** Past about 0.02 the fan stops
   being a spectrum and becomes a set of separate coloured beams, because the
   wavelengths are no longer overlapping enough to blend.

2. **A pale background.** Everything here is light added to the ground. On a
   light page there is nothing for the beams to be brighter than.

3. **Expecting a wide rainbow.** The spread of a real prism is about a degree.
   If you want the fan to fill the frame, move the exit further from the edge by
   raising `size`, which is what a longer throw does in life.

4. **Expecting it on paper.** `ground` says dark.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
