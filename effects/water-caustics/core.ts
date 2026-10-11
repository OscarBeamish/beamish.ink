/*
 * WaterCaustics: Beamish
 * https://beamish.ink/effects/water-caustics
 *
 * The bright net of light on the floor of a swimming pool, worked out rather
 * than drawn.
 *
 * Nothing in the shader draws a caustic line, and nothing knows where one is.
 * There is a wavy water surface, and the light that goes through it lands on a
 * floor some distance below. Where the surface happens to be concave it acts
 * as a lens and squeezes a patch of light into a smaller patch of floor, and
 * the brightness there is however much the patch shrank by. The lines are what
 * is left when you plot that.
 *
 * The arithmetic is one step of optics. A ray through a surface of height h is
 * deflected by roughly the slope, so a point p on the surface lands at
 * p + d * grad(h) on a floor at depth d. That is a mapping from the surface to
 * the floor, and the brightness it produces is one over the determinant of its
 * Jacobian, which is the factor the area changed by. The Jacobian of that
 * mapping is I + d * H, where H is the Hessian of the height field, so the
 * whole effect is: build a height field whose second derivatives you know,
 * and divide by a two-by-two determinant.
 *
 * Doing it this way is worth the trouble because the caustics then behave.
 * Deepen the water and the filaments spread and brighten, because a longer
 * throw means more focusing. Flatten the waves and they fade out rather than
 * thinning. Where the determinant passes through zero the mapping has folded
 * over, and that fold is exactly where a real caustic is, which is why the
 * bright lines close into cells rather than lying about as stripes.
 *
 * The height field is a sum of directional sine waves. Sines are chosen
 * because their second derivatives are free: each wave contributes its own
 * outer product times a sine, so the Hessian costs one sine per wave and no
 * finite differencing, which would be both slower and wrong at this scale.
 *
 * There are eighteen of them, and the count is the difference between this and
 * a plaid. A sum of a few plane waves is quasi-periodic however the directions
 * and the weights are chosen, so the caustics lay themselves out on a lattice:
 * six waves gave columns, and reweighting them only changed which way the
 * columns ran. Water does not look like that because water is not six waves.
 *
 * The three colour channels are focused at three slightly different depths.
 * Water disperses, the short wavelengths bend further, and the real thing has
 * colour in the edges of the filaments for that reason. At `dispersion: 0` all
 * three agree and the net is monochrome.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type WaterCausticsOptions = BaseOptions & {
  /** The water. What the floor looks like where no light is focused on it. */
  water: string
  /** The light. What is added where the surface focuses it. */
  light: string
  /** Waves across the short side of the frame. */
  scale: number
  /**
   * How hard the surface focuses, which is the throw from it down to the
   * floor. Below about 0.8 the determinant never reaches zero and there are no
   * filaments at all, only a mottle. Past about 3 it folds everywhere and the
   * web breaks into noise, which is also what a real pool does in a chop.
   */
  depth: number
  /**
   * Modes in the surface, spread geometrically over about a decade of
   * wavelength. This is the one that decides whether it reads as water: below
   * about ten the sum is quasi-periodic and the caustics arrange themselves on
   * a visible lattice however the rest is tuned.
   */
  waves: number
  /**
   * Width of a filament, in pixels. Measured against the rate the determinant
   * is changing, so a line is this wide wherever it is and at any resolution.
   */
  thickness: number
  /**
   * How much light there is. The optics give an unbounded brightness and this
   * is where it meets a screen that stops at white.
   */
  exposure: number
  /** Pulls the dim half down without touching the blown-out cores. */
  contrast: number
  /** Difference in focal depth between red and blue, as a share of `depth`. */
  dispersion: number
  /** Seconds for one cycle. The surface is exactly where it started after this. */
  period: number
  /** Which way the waves run, in degrees. */
  heading: number
  /** Seed for the wave directions and phases. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const waterCausticsDefaults: WaterCausticsOptions = {
  water: '#0b1a22',
  light: '#9fe4f5',
  scale: 1.9,
  depth: 1.5,
  waves: 18,
  thickness: 1.6,
  exposure: 0.04,
  contrast: 1.35,
  dispersion: 0.03,
  period: 36,
  heading: 18,
  seed: 4,
  reducedMotionTime: 7
}

// beamish:shader-begin shaders/water-caustics.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/water-caustics.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * WaterCaustics: the light that gets through a wavy surface, not a picture of
 * it.
 *
 * There is no caustic in this shader. There is a height field and an optical
 * mapping, and the caustics are a consequence.
 *
 * A ray through a surface of height h(p) is deflected by the slope, so it
 * lands at q = p + d * grad(h) on a floor at depth d. Light is conserved, so
 * the brightness at q is the reciprocal of the factor by which that mapping
 * changed area: one over |det(dq/dp)|, and dq/dp is I + d * H with H the
 * Hessian of h.
 *
 * Where that determinant passes through zero, a patch of surface has been
 * squeezed to nothing and the mapping has folded. That is what a caustic is,
 * and it is why these lines form closed cells rather than stripes: the zero
 * set of a determinant is a curve, and it closes.
 *
 * The height field is a sum of directional sines, because the Hessian of a
 * sine is free. A wave of unit direction u and wavenumber k contributes
 * -k^2 * (u (x) u) * sin(phase), so the whole Hessian is one sine per wave and
 * three multiply-adds, with no finite differences anywhere. Finite differencing
 * a height field at this scale is both slower and visibly wrong: the second
 * difference of a sampled field is dominated by the sampling.
 *
 * Each colour channel is focused at a slightly different depth, because water
 * disperses and the short wavelengths bend further. That is where the colour in
 * the edges of the filaments comes from. It is one extra determinant per
 * channel and nothing else.
 */

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_period;

uniform vec3  u_water;
uniform vec3  u_light;
uniform float u_scale;
uniform float u_depth;
uniform float u_waves;
uniform float u_thickness;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_dispersion;
uniform float u_heading;
uniform float u_seed;

out vec4 fragColor;

const float TAU = 6.28318530718;

const int MAX_WAVES = 24;

/*
 * The accumulated Hessian of the height field, and nothing else.
 *
 * Returned as vec3(Hxx, Hyy, Hxy). The gradient is not needed: the brightness
 * depends on how the mapping stretches, not on where it lands.
 */
vec3 surfaceCurvature(vec2 p, float t) {
  vec3 H = vec3(0.0);
  float total = 0.0;

  int count = int(clamp(u_waves, 3.0, float(MAX_WAVES)));
  float k0 = TAU * u_scale;

  for (int i = 0; i < MAX_WAVES; i++) {
    if (i >= count) break;
    float fi = float(i);

    /*
     * The golden angle between directions. Any fixed set of directions sharing
     * a common factor lays the waves on a lattice, and a lattice gives a plaid
     * rather than water. 2.39996 radians never does.
     */
    float theta = radians(u_heading) + fi * 2.39996323 + u_seed * 0.7;
    vec2 u = vec2(cos(theta), sin(theta));

    /*
     * Wavenumbers spread geometrically over about a decade, which is a
     * spectrum rather than a chord.
     *
     * The count is the thing that matters here and it took three tries to
     * accept it. A sum of a few plane waves is quasi-periodic no matter how
     * the directions and weights are chosen, so the caustics lay themselves
     * out on a lattice: six waves gave columns, and reweighting them only
     * changed which way the columns ran. Water does not look like that because
     * water is not six waves. Twenty-odd modes across a decade of wavelength
     * is the smallest thing that stops reading as a pattern.
     */
    float k = k0 * pow(1.14, fi);

    /*
     * Curvature weight rather than amplitude. What the optics care about is
     * a * k^2, so carrying that directly keeps every wave contributing
     * comparable focusing however fine it is. Carrying amplitude instead lets
     * the fine waves run away with it, because curvature goes as the square of
     * the wavenumber and a fine wave of the same height is enormously more
     * curved.
     */
    float w = pow(0.955, fi);

    /*
     * Summed in quadrature, not plainly.
     *
     * Waves at independent phases do not add up, they add in quadrature: the
     * sum of N of them has a typical size of root N, not N. Dividing by the
     * plain sum of the weights therefore flattens the surface as you add
     * detail, and that is not a subtle error. Going from six waves to eighteen
     * with a plain sum took the curvature down by a factor of about two and
     * the caustics vanished completely: an almost black frame with a faint
     * mottle in it, which read as a broken shader rather than as the
     * normalisation it was.
     */
    total += w * w;

    /*
     * Deep water disperses: a long wave travels faster than a short one, as
     * the square root of the wavelength. That is why a real surface never
     * holds a shape, and why a set of waves all drifting at one speed reads as
     * a moving photograph of water rather than as water.
     *
     * Rounded to whole turns per period, because that is what closes the loop.
     * A fractional multiplier here is the fault that shipped twice in this
     * library and showed up as a jump once a cycle in the recorded video. The
     * rounding bends the dispersion slightly, which nobody can see, and the
     * join it removes is the first thing anybody sees.
     */
    float turns = max(1.0, floor(sqrt(k / k0) + 0.5));

    float phase = k * dot(u, p) + turns * TAU * t / u_period + fi * 1.7 + u_seed;
    float s = sin(phase) * w;

    H.x -= s * u.x * u.x;
    H.y -= s * u.y * u.y;
    H.z -= s * u.x * u.y;
  }

  return H / sqrt(max(total, 0.0001));
}

/* One over the area change of the refractive mapping, at focal depth d. */
float brightness(vec3 H, float d) {
  float det = (1.0 + d * H.x) * (1.0 + d * H.y) - (d * H.z) * (d * H.z);

  /*
   * One over the determinant, which is the physical answer: light is conserved,
   * so a patch squeezed to a tenth of its area is ten times as bright. Not
   * normalised to a peak of one. A first version divided by the softening width
   * instead, which capped every filament at the same brightness however hard it
   * was focusing, and the result was a contour map: thin even outlines with
   * nothing bright inside them. The whole character of a caustic is that the
   * tight folds blow out and the slack ones barely show.
   *
   * The softening width is set against how fast det is changing here rather
   * than by a constant, so a filament is the same number of pixels wide
   * wherever it is in the frame and at any resolution. A constant gives
   * hairlines where the field is slow and slabs where it is fast, and the slabs
   * are where the eye goes. It also keeps the division finite, which matters:
   * the determinant really does reach zero.
   */
  float w = max(fwidth(det), 1e-5) * u_thickness;
  return 1.0 / (abs(det) + w);
}

void main() {
  /*
   * Normalised on the short side, so the wave scale means the same thing in
   * portrait and landscape. Dividing by the width instead makes a tall panel
   * show four waves and a wide one show forty.
   */
  vec2 frag = gl_FragCoord.xy;
  vec2 p = (frag - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  vec3 H = surfaceCurvature(p, u_time);

  /*
   * Three focal depths, one per channel. Blue bends furthest, which is why the
   * colour that appears at the edge of a filament is blue on one side and warm
   * on the other rather than a uniform tint.
   */
  float d = u_depth;
  float spread = u_depth * u_dispersion;
  vec3 lit = vec3(
    brightness(H, d - spread),
    brightness(H, d),
    brightness(H, d + spread)
  );

  /*
   * Exposed and tone-mapped, the way a bright thing has to be handled when the
   * thing you are showing it on only goes up to one.
   *
   * 1 - exp(-x) because the brightness coming out of the optics is unbounded
   * and a clamp would flatten every core to a plateau with a hard edge. This
   * rolls off instead, so a tight fold reads as blown out rather than as a
   * white blob with a rim. The contrast exponent then pulls the dim half down
   * without touching the cores, which is the difference between light through
   * a metre of water and light through a centimetre.
   */
  vec3 lit01 = vec3(1.0) - exp(-lit * u_exposure);
  vec3 col = u_water + u_light * pow(lit01, vec3(u_contrast));

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_time',
  'u_period',
  'u_water',
  'u_light',
  'u_scale',
  'u_depth',
  'u_waves',
  'u_thickness',
  'u_exposure',
  'u_contrast',
  'u_dispersion',
  'u_heading',
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
  if (!shader) throw new Error('WaterCaustics: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`WaterCaustics: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class WaterCausticsSurface implements Surface<WaterCausticsOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('WaterCaustics needs a canvas')
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
    if (!gl) throw new Error('WaterCaustics needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('WaterCaustics: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`WaterCaustics: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: WaterCausticsOptions): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)
    const loc = (name: UniformName) => this.locations.get(name) ?? null

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(loc('u_time'), t)
    gl.uniform1f(loc('u_period'), opts.period)
    gl.uniform3fv(loc('u_water'), rgb(opts.water))
    gl.uniform3fv(loc('u_light'), rgb(opts.light))
    gl.uniform1f(loc('u_scale'), opts.scale)
    gl.uniform1f(loc('u_depth'), opts.depth)
    gl.uniform1f(loc('u_waves'), opts.waves)
    gl.uniform1f(loc('u_thickness'), opts.thickness)
    gl.uniform1f(loc('u_exposure'), opts.exposure)
    gl.uniform1f(loc('u_contrast'), opts.contrast)
    gl.uniform1f(loc('u_dispersion'), opts.dispersion)
    gl.uniform1f(loc('u_heading'), opts.heading)
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
 * Mount WaterCaustics into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const pool = createWaterCaustics(document.querySelector('#hero')!)
 * pool.start()
 * // …later
 * pool.destroy()
 * ```
 */
export function createWaterCaustics(
  el: HTMLElement,
  opts: Partial<WaterCausticsOptions> = {}
): EffectHandle {
  return mount<WaterCausticsOptions>(el, opts, {
    defaults: waterCausticsDefaults,
    create: () => new WaterCausticsSurface()
  })
}

export default createWaterCaustics
