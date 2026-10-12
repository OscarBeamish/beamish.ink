You are adding **WaterCaustics** from Beamish to this project.

> The net of focused light on the floor of a pool, worked out from a wavy surface rather than drawn. Backdrops · effect · MIT.
> https://beamish.ink/effects/water-caustics

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Nothing here draws a caustic. There is a height field and one step of optics: a ray through a surface of height h lands at p + d * grad(h) on a floor at depth d, and the brightness is one over the determinant of that mapping's Jacobian, which is the factor the area changed by. The filaments are where that determinant passes through zero and the mapping folds
- Built that way so the caustics behave rather than merely look right. Deepen the water and they spread and brighten, because a longer throw focuses harder. Flatten the waves and they fade rather than thin. They close into cells because the zero set of a determinant is a closed curve, which is the part a hand-drawn version never gets
- Eighteen waves, not six, and that is the whole difference between this and a plaid. A sum of a few plane waves is quasi-periodic however the directions and weights are chosen, so the caustics lay themselves out on a lattice: six gave columns, and reweighting them only changed which way the columns ran. Twenty-odd modes across a decade of wavelength is the smallest thing that stops reading as a pattern
- The curvature is summed in quadrature, not plainly. Waves at independent phases add as the root of their number, so dividing by the plain sum flattens the surface as modes are added. Going from six waves to eighteen that way took the curvature down by about half and the caustics disappeared into an almost black frame, which reads as a broken shader rather than as the normalisation it was
- Wave speeds follow deep-water dispersion, as the root of the wavelength, rounded to whole turns per period. Without it every mode drifts at one speed and the result reads as a moving photograph of water rather than as water. The rounding bends the dispersion by an amount nobody can see and removes a join everybody would
- The Hessian is analytic. A wave contributes -k^2 (u (x) u) sin(phase), so the second derivative is one sine per wave with no finite differencing, which at this scale would be dominated by the sampling rather than by the surface
- Filament width is measured against how fast the determinant is changing, with fwidth, so a line is the same number of pixels wide anywhere in the frame and at any resolution. A constant threshold gives hairlines where the field is slow and slabs where it is fast
- The brightness is not normalised to a peak. Light is conserved, so a patch squeezed to a tenth of its area is ten times as bright, and tone-mapping that with 1 - exp(-x) is what makes the tight folds blow out. An early version divided by the softening width instead, which capped every filament at the same brightness and produced a contour map: even outlines with nothing bright inside them
- The three channels focus at three depths, because water disperses and the short wavelengths bend further. That is the colour at the edge of a filament. At 0.22 it was three separate rings of red, green and blue and the thing read as a topographic map; the useful range is a few hundredths
- Built for a dark ground and declared as one. Light added to deep water is the whole idea, and added light on paper is invisible
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/water-caustics/core.ts`**

```ts
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

import { resolveAutoGrounds } from './ground'

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

/**
 * One scripted press. `t` is seconds from the start of the loop; x/y are 0 to 1
 * across the element.
 *
 * A path can say where the cursor is at any moment, but a press is an instant
 * rather than a position, so it needs its own list. An effect that answers to
 * clicks reads this alongside whatever real presses it has seen, which is what
 * lets the recorder produce a take with clicks in it without anything having
 * been clicked.
 */
export type PressKey = { t: number; x: number; y: number }

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
   * Scripted presses, for effects that answer to a click. Each is a time and a
   * point, and an effect treats them exactly as it treats a real press that
   * happened at that moment, so a recorded take and a live page agree.
   *
   * Unlike `pointerPath`, this does not replace the live input: a scripted press
   * and a real one are the same kind of event, and an effect that ignored the
   * cursor while a script was running would be dead on the page.
   */
  pressPath?: PressKey[]
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
  /*
   * `auto` in a colour option means take it from the page. Resolved here, at
   * the one point that has both the host element and the merged options, so no
   * item has to reach into the DOM from inside its own render loop.
   */
  let opts: O = resolveAutoGrounds(el, { ...config.defaults, ...(userOpts ?? {}) })

  const kind = config.kind ?? 'canvas'

  let canvas: HTMLCanvasElement | null = null
  if (kind === 'canvas') {
    canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    /*
     * Its own compositor layer, so the page cannot resample it.
     *
     * A canvas whose box lands on a half pixel has to be resampled to the
     * device grid, and which way it snaps is the compositor's business rather
     * than ours. Snapping one way on one frame and the other way on the next
     * moves the whole picture by a pixel, which is a flicker between two
     * positions that leaves no trace anywhere: the drawing buffer is perfect,
     * the clock is smooth, the box never changes and every number comes back
     * clean. It was reported on a canvas sitting at x = 683.5, and the same
     * effect at x = 123.5 on another machine was steady.
     *
     * translateZ(0) rather than will-change, because will-change is a hint
     * the browser is free to drop and this needs to be a promise. The cost is
     * one layer per live effect, and there is only ever one.
     */
    canvas.style.transform = 'translateZ(0)'
    canvas.style.backfaceVisibility = 'hidden'
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
    /*
     * Clamped at both ends.
     *
     * The top end is the tab-switch spike this always guarded against. The
     * bottom end is that a rAF timestamp is the moment the frame began, which
     * can be EARLIER than the performance.now() start() took a moment before:
     * the subtraction is then negative, Math.min keeps it, and the effect's
     * clock runs backwards. Measured on WindField, elapsed began at -0.1088
     * and four frames were rendered at a negative t before it climbed past
     * zero. A shader handed a smaller t than last frame draws an earlier
     * picture, which is a visible jump backwards on every start, and start
     * runs again every time the panel scrolls into view or the tab is
     * returned to.
     */
    const dt = Math.min(Math.max(stamp - lastStamp, 0), 100) / 1000
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
  /*
   * The gate watches the element's parent, not the element.
   *
   * Watching the element deadlocks any effect that clips or moves its own host.
   * A reveal starts with its host clipped to nothing, the observer reports that
   * as not intersecting, the runtime stops the loop, and the clip therefore
   * never advances off the host: blank for ever, with the replay button unable
   * to escape it because `visible` can never become true again. The gate's
   * input must not be geometry the effect controls.
   *
   * The parent is laid out by the page rather than by the effect, so it breaks
   * the cycle. It is usually a little larger, which means an effect can start a
   * frame or two before it is strictly on screen. That is the cheaper mistake.
   */
  intersectionObserver?.observe(el.parentElement ?? el)

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
      opts = resolveAutoGrounds(el, { ...opts, ...(next as Partial<O>) })
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

WaterCaustics is the bright net of light on the floor of a swimming pool,
worked out rather than drawn.

Nothing in the shader draws a caustic line, and nothing knows where one is.
There is a wavy water surface and a floor some distance below it. Where the
surface happens to be concave it acts as a lens, squeezes a patch of light into
a smaller patch of floor, and the brightness there is however much the patch
shrank by. The net is what is left when you plot that.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="hero" style="height: 70vh"></div>

<script type="module">
  import { createWaterCaustics } from './beamish/effects/water-caustics/core.js'

  const pool = createWaterCaustics(document.querySelector('#hero'))
  pool.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createWaterCaustics } from '@/beamish/effects/water-caustics/core'

export function Pool() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pool = createWaterCaustics(host.current, { depth: 1.5 })
    pool.start()
    return () => pool.destroy()
  }, [])

  return <div ref={host} className="absolute inset-0 -z-10" />
}
```

Mount once. Option changes go through `update()` rather than a remount, because
a remount is a new WebGL context and the budget for those is small.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createWaterCaustics } from '@/beamish/effects/water-caustics/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pool: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pool = createWaterCaustics(host.value)
  pool.start()
})

onBeforeUnmount(() => pool?.destroy())
</script>

<template>
  <div ref="host" class="pool" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `water` | color | `#0b1a22` | any CSS hex | The water, which is what the floor looks like where no light is focused on it. Deep and desaturated: it is what the filaments are bright against, and a pale one leaves them nowhere to go. |
| `light` | color | `#9fe4f5` | any CSS hex | The light added where the surface focuses it. Added rather than mixed, so the brightest cores overexpose towards white the way more light does, instead of desaturating towards this colour. |
| `scale` | number | `1.9` | 0.4 to 8 (looks right between 1.4 and 3) | Waves across the short side of the frame, for the longest wave. Low is a lazy pool at dusk and high is a chop. The rest of the spectrum is built up from this, so it sets the size of the whole web. |
| `depth` | number | `1.5` | 0 to 4 (looks right between 1 and 2.2) | How hard the surface focuses, which is the throw from the surface to the floor. At 0 nothing is focused and the floor is flat water. Below about 0.8 the determinant never reaches zero, so there are no filaments at all, only a mottle. Past about 3 it folds everywhere and the web breaks into noise, which is also what a real pool does in a chop. |
| `waves` | number | `18` | 3 to 24 (looks right between 12 and 24) | Modes in the surface, spread geometrically over about a decade of wavelength. This is the one that decides whether it reads as water. Below about ten the sum is quasi-periodic and the caustics arrange themselves on a visible lattice however the rest is tuned. It is also the whole cost of the shader. |
| `thickness` | number | `1.6` | 0.3 to 8 (looks right between 1 and 3) | Filament width in pixels, measured against the rate the determinant is changing, so it means the same thing anywhere in the frame and at any resolution. |
| `exposure` | number | `0.04` | 0.005 to 0.3 (looks right between 0.02 and 0.08) | How much light there is. The optics hand back an unbounded brightness and this is where it meets a screen that stops at white, so it sets how much of the web blows out rather than how bright the dim parts are. |
| `contrast` | number | `1.35` | 0.5 to 4 (looks right between 1 and 2) | Pulls the dim half down without touching the blown-out cores. The difference between light through a metre of water and light through a centimetre. Raise it to put text over this. |
| `dispersion` | number | `0.03` | 0 to 0.25 (looks right between 0.01 and 0.06) | Difference in focal depth between red and blue, as a share of depth. At 0 the net is monochrome. Keep it small: by about 0.2 the three channels have separated into their own rings and the thing reads as a topographic map rather than as light. |
| `period` | number | `36` | 8 to 120 s (looks right between 28 and 60) | Seconds for one cycle. Every mode completes a whole number of turns in it, so the surface is exactly where it started and the loop has no join. This is also the dial for how busy the item is, and the change per frame is very close to linear in it. |
| `heading` | number | `18` | 0 to 360 deg | Which way the waves run. The directions fan out from here by the golden angle, so turning this turns the whole surface rather than rearranging it. |
| `seed` | number | `4` | 0 to 9999 | Seed for the wave directions and phases. Two of these side by side want two seeds, or they are the same pool twice. |

## 5. The arithmetic is one step of optics

A ray through a surface of height `h` is deflected by roughly the slope, so a
point `p` on the surface lands at `p + d * grad(h)` on a floor at depth `d`.
That is a mapping. Light is conserved, so the brightness it produces is one
over the determinant of its Jacobian: the factor by which it changed area. And
the Jacobian of that mapping is `I + d * H`, where `H` is the Hessian of the
height field.

So the whole effect is: build a height field whose second derivatives you
know, and divide by a two-by-two determinant.

Doing it this way is worth the trouble because the caustics then **behave**.
Deepen the water and the filaments spread and brighten, because a longer throw
focuses harder. Flatten the waves and they fade rather than thin. Where the
determinant passes through zero the mapping has folded over, and a fold is
exactly what a caustic is, which is why these lines close into cells rather
than lying about as stripes. The zero set of a determinant is a closed curve.

The height field is a sum of directional sines, because the Hessian of a sine
is free: a wave of unit direction `u` and wavenumber `k` contributes
`-k² (u ⊗ u) sin(phase)`, so the second derivative is one sine per wave with no
finite differencing anywhere.

## 6. Why eighteen waves

This is the setting that decides whether the thing reads as water, and it is
not obvious.

A sum of a few plane waves is quasi-periodic. Always. However the directions
are spread and however the weights are tuned, the caustics lay themselves out
on a lattice: six waves gave neat columns of identical bright lozenges, and
reweighting them only changed which way the columns ran. Water does not look
like that because water is not six waves. It is a continuum, and twenty-odd
modes spread geometrically across a decade of wavelength is the smallest thing
that stops reading as a pattern.

Below about `waves: 10` you will see the lattice. There is no other dial that
hides it.

## 7. Two things that are easy to get wrong

**Sum the curvature in quadrature, not plainly.** Waves at independent phases
do not add up, they add in quadrature: the sum of N of them has a typical size
of √N, not N. Divide by the plain sum of the weights and the surface flattens
as you add detail. Going from six waves to eighteen that way halved the
curvature and the caustics vanished into a near-black frame with a faint
mottle, which reads as a broken shader rather than as the normalisation error
it is.

**Do not normalise the brightness to a peak.** Light is conserved, so a patch
squeezed to a tenth of its area is ten times as bright, and the tight folds are
supposed to blow out. An early version divided by the softening width, which
capped every filament at the same brightness however hard it was focusing, and
the result was a contour map: thin even outlines with nothing bright inside
them. `exposure` and a `1 - exp(-x)` roll-off are what turn an unbounded
physical brightness into something a screen can show.

## 8. It is for a dark ground

Declared `dark`, and it means it. The effect adds light to deep water, and
light added to paper is invisible: on a pale page you get the water colour as a
flat rectangle and nothing else. Change `water` to something pale and you have
not made a paper version, you have removed the contrast the filaments need.

## 9. Putting text on it

You can, but not at the defaults. It is the liveliest backdrop in the library
and the bright cores go to white.

Two dials, in this order. Raise `contrast` to about 2, which pulls the dim half
down and leaves the cores where they are. Then drop `exposure` to about 0.02,
which stops them blowing out. That gives a deep field with a suggestion of a
web in it, which sits under a headline without competing.

Lengthening `period` does not help legibility, only distraction.

## 10. Cost and how busy it is

Measured at 1.1ms at 1280 by 720, against MeshGradient at 1.10 on the same run,
and 0.230 mean absolute change per frame on a 0 to 255 scale against
MarbledPaper at 0.166 and WindField at 0.104.

That makes it the busiest backdrop here, deliberately: a caustic that does not
shimmer is a photograph of one. `period` is the dial, and the change per frame
is very close to linear in it, so doubling the period halves the motion.

The cost is linear in `waves` and nothing else in the shader loops. Dropping to
twelve is about a third cheaper and is the first thing to try on a slow device,
though it brings the lattice closer.

## 11. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createWaterCaustics` from `useEffect`, `onMounted`, or a `client:*`
island.

## 12. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

The still frame loses little here. The subject is the shape of the net, and a
single frame has all of it.

## 13. The three mistakes most likely to be made here

1. **Too few waves.** Under about ten the caustics sit on a visible lattice and
   the whole thing reads as a printed pattern. No other setting hides it.

2. **Too much dispersion.** By about 0.2 the three channels have separated into
   their own rings of red, green and blue and it reads as a topographic map.
   Real water does this by a few hundredths.

3. **Too little depth.** Below about 0.8 the determinant never reaches zero, so
   there are no folds and therefore no filaments: you get a soft mottle and it
   looks like the shader is broken. It is not. Nothing is being focused.

4. **Putting it on paper.** It adds light. There is nothing for added light to
   do on a pale page.

5. **Reaching for `period` to calm it down behind text.** It makes the motion
   slower, not the contrast lower, and it is the contrast that makes copy hard
   to read. Use `contrast` and `exposure`.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
