You are adding **MeshGradient** from Beamish to this project.

> The soft flowing colour field behind half the software marketing on the web, lit by its own slope. Backdrops · effect · MIT.
> https://beamish.ink/effects/mesh-gradient

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Three ingredients and nothing else: layered waves for scale, a domain warp so the bands bend around each other rather than staying parallel stripes, and shading taken from the slope of the same field
- The shading is the part most versions of this leave out. On the original the plane is a mesh whose vertices are displaced, so the light follows the displacement; here the same derivative that would have moved a vertex lights the result instead. Without it the whole thing flattens into wallpaper
- The diagonal edge people associate with this effect is not in the shader and should not be. On the original it is the container, skewed with CSS and clipped, which is two lines and is in the recipe
- Every moving term is a sum of waves whose time coefficients are whole numbers of turns over the period, so the loop closes exactly. Noise advanced by time never returns to its first frame and the recorder needs it to
- The warp is frozen while the layers drift through it. Warping the warp as well doubles the measured change per frame for something that reads as the whole image sliding
- Declared as working on either ground. The default palette is warm paper with pastel layers; the same effect with dark colours over a dark base is the version everybody else ships
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/mesh-gradient/core.ts`**

```ts
/*
 * MeshGradient: Beamish
 * https://beamish.ink/effects/mesh-gradient
 *
 * The soft flowing colour field behind half the software marketing on the web.
 * WebGL2, no three.js, no dependencies.
 *
 * Layered waves, a domain warp, and shading taken from the slope of the same
 * field. The shader says why the third one is what separates this from
 * wallpaper.
 *
 * The GL boilerplate is inline rather than imported. This file is published and
 * read on its own, and a reader should not have to fetch a second module to find
 * out how a program gets compiled.
 *
 * The shader source is generated from shaders/mesh-gradient.frag and
 * shaders/mesh-gradient.vert. Edit those, then run `pnpm generate`. The markers
 * are load-bearing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type MeshGradientOptions = BaseOptions & {
  /** What the colours are laid over. Usually the palest of the four. */
  base: string
  /** The first colour layer. */
  one: string
  /** The second. */
  two: string
  /** The third. */
  three: string
  /** Size of the shapes. Lower is fewer and larger. */
  scale: number
  /** How far the field is bent before it is read. 0 leaves parallel stripes. */
  warp: number
  /** Width of the transition between layers, 0 to 1. */
  softness: number
  /** How much the field is lit by its own slope. */
  relief: number
  /** Grain, 0 to 1. Static, not crawling film grain. */
  grain: number
  /** Seconds for one full cycle. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const meshGradientDefaults: MeshGradientOptions = {
  base: '#fbfaf4',
  one: '#ffc9e3',
  two: '#a9d8ff',
  three: '#cdbcff',
  scale: 0.75,
  warp: 0.42,
  softness: 0.6,
  relief: 0.16,
  grain: 0.3,
  period: 36,
  reducedMotionTime: 9
}

// beamish:shader-begin shaders/mesh-gradient.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/mesh-gradient.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * MeshGradient: the soft flowing colour field that sits behind half the
 * software marketing on the web, and behind Stripe's home page in particular.
 *
 * It is worth being precise about what that effect actually is, because the
 * name people give it is wrong in a way that matters. It is not a CSS gradient
 * with more stops and it is not a blurred photograph of some blobs. The
 * original is a plane cut into a grid of a few hundred vertices, each one
 * pushed around by layered noise, with three or four colour layers blended over
 * each other by more noise. The faint sense of a surface being folded rather
 * than a picture being blurred comes from the geometry: the shading follows the
 * displacement.
 *
 * This reproduces that in a fragment shader, with the three ingredients the
 * original has and nothing else:
 *
 *   Layered waves. Several octaves, each finer and weaker than the last. That
 *   is what gives the field its scale: broad shapes with detail inside them,
 *   rather than one smooth blob or one busy texture.
 *
 *   A domain warp. The field is read at a position pushed sideways by another
 *   field, which is what bends the bands around each other instead of leaving
 *   them as parallel stripes.
 *
 *   Shading from the slope. The same derivative that would have moved a vertex
 *   is used to light the result, so the colour has a direction to it. Take this
 *   out and the whole thing flattens into wallpaper, which is the difference
 *   between this and most of the copies of it.
 *
 * The diagonal edge people associate with the effect is not in here and should
 * not be: on the original it is the container, skewed with CSS and clipped. The
 * recipe says how, because it is two lines and it is not the shader's business.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_base;
uniform vec3  u_one;
uniform vec3  u_two;
uniform vec3  u_three;

uniform float u_scale;
uniform float u_warp;
uniform float u_softness;
uniform float u_relief;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * A field of travelling waves, returned as value and slope together.
 *
 * The frequencies are in cycles across the unit square rather than radians,
 * because a frequency only means anything against the width it has to cross.
 * The time coefficients are whole numbers of turns over the period, so the loop
 * closes exactly: the alternative is noise advanced by time, which never
 * returns to its first frame and which the recorder cannot use.
 *
 * The slope comes from the same expression as the value. It is not an
 * optimisation, it is the shading: on the original effect the light follows the
 * displacement of the mesh, and this is the same derivative that displacement
 * would have used.
 */
vec3 field(vec2 p, float phase, float seed) {
  vec2 dirs[4] = vec2[4](
    vec2(0.93, 0.37),
    vec2(-0.48, 0.88),
    vec2(0.31, -0.95),
    vec2(-0.89, -0.46)
  );
  float freq[4] = float[4](0.38, 0.71, 1.29, 2.23);
  float amp[4] = float[4](1.0, 0.54, 0.28, 0.14);
  float harm[4] = float[4](1.0, 1.0, 2.0, 2.0);

  float v = 0.0;
  vec2 slope = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    float k = freq[i] * TAU;
    float arg = dot(p, dirs[i]) * k + phase * harm[i] + seed * (float(i) + 1.7);
    v += amp[i] * sin(arg);
    slope += amp[i] * cos(arg) * k * dirs[i];
  }
  return vec3(v / 1.96, slope / 1.96);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 p = (cssPx - cssRes * 0.5) / max(shortSide, 1.0) * max(u_scale, 0.05);

  float phase = TAU * u_time / max(u_period, 0.001);

  /*
   * The warp. Two more fields push the plane sideways before it is read, which
   * is what bends the bands around each other. Without it they are stripes, and
   * stripes are what gives away most attempts at this.
   *
   * It is frozen rather than moving: the layers drifting through a fixed warp
   * is a field flowing through a shape, and warping the warp as well doubles
   * the measured change per frame for something that reads as the whole image
   * sliding.
   */
  vec3 wx = field(p + vec2(4.1, 0.7), 0.0, 1.0);
  vec3 wy = field(p + vec2(-1.9, 3.3), 0.0, 2.0);
  vec2 q = p + u_warp * vec2(wx.x, wy.x);

  vec2 jx = vec2(1.0 + u_warp * wx.y, u_warp * wx.z);
  vec2 jy = vec2(u_warp * wy.y, 1.0 + u_warp * wy.z);

  vec3 col = u_base;
  vec2 shade = vec2(0.0);

  /*
   * Three colour layers, each its own field, each blended over what is already
   * there. Soft edges rather than hard ones: \`softness\` is the width of the
   * transition, and it is the single control that decides whether this reads as
   * a gradient or as a map of three countries.
   */
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 f = field(q * (1.0 + fi * 0.31), phase, 3.0 + fi * 2.3);
    float a = smoothstep(-u_softness, u_softness, f.x - 0.12 + fi * 0.06);

    vec3 tint = i == 0 ? u_one : (i == 1 ? u_two : u_three);
    col = mix(col, tint, a);

    // The slope of this layer, carried through the warp by the chain rule, and
    // weighted by how much of this layer is actually showing here.
    vec2 g = vec2(dot(f.yz, jx), dot(f.yz, jy));
    shade += g * a;
  }

  /*
   * Lit by its own slope. One light, from the upper left, which is where light
   * is in every photograph anybody has ever liked.
   */
  float lift = dot(normalize(shade + vec2(1e-4)), normalize(vec2(-0.6, 0.8)));
  col *= 1.0 + lift * u_relief * min(length(shade), 1.5);

  float tooth = hash12(floor(gl_FragCoord.xy * 0.5)) - 0.5;
  col += tooth * 0.035 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_base',
  'u_one',
  'u_two',
  'u_three',
  'u_scale',
  'u_warp',
  'u_softness',
  'u_relief',
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
  if (!shader) throw new Error('MeshGradient: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`MeshGradient: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class MeshGradientSurface implements Surface<MeshGradientOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('MeshGradient needs a canvas')
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
    if (!gl) throw new Error('MeshGradient needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('MeshGradient: could not create program')
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
      throw new Error(`MeshGradient: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: MeshGradientOptions): void {
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
    gl.uniform3fv(at('u_base'), parseColor(opts.base))
    gl.uniform3fv(at('u_one'), parseColor(opts.one))
    gl.uniform3fv(at('u_two'), parseColor(opts.two))
    gl.uniform3fv(at('u_three'), parseColor(opts.three))
    gl.uniform1f(at('u_scale'), opts.scale)
    gl.uniform1f(at('u_warp'), opts.warp)
    gl.uniform1f(at('u_softness'), opts.softness)
    gl.uniform1f(at('u_relief'), opts.relief)
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
 * Mount MeshGradient into `el`. The element needs a size. Give it width and
 * height in CSS, not just content.
 *
 * ```ts
 * const mesh = createMeshGradient(document.querySelector('#bg')!)
 * mesh.start()
 * // …later
 * mesh.destroy()
 * ```
 */
export function createMeshGradient(
  el: HTMLElement,
  opts: Partial<MeshGradientOptions> = {}
): EffectHandle {
  return mount<MeshGradientOptions>(el, opts, {
    defaults: meshGradientDefaults,
    create: () => new MeshGradientSurface()
  })
}

export default createMeshGradient
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

The soft flowing colour field that sits behind half the software marketing on
the web, and behind Stripe's home page in particular.

It is worth being precise about what that effect is, because the usual
description is wrong in a way that matters. It is not a CSS gradient with more
stops, and it is not a blurred photograph of some blobs. The original is a plane
cut into a grid of a few hundred vertices, each pushed around by layered noise,
with three or four colour layers blended over each other by more noise.

Three ingredients, and this has all three:

**Layered waves.** Several octaves, each finer and weaker than the last. That is
what gives the field its sense of scale: broad shapes with detail inside them,
rather than one smooth blob or one busy texture.

**A domain warp.** The field is read at a position pushed sideways by another
field, which is what bends the bands around each other. At `warp` 0 you get
parallel stripes, and parallel stripes are the single thing that gives away most
attempts at this effect.

**Shading from the slope.** This is the one most copies leave out. On the
original the mesh is displaced, so the light follows the displacement; here the
same derivative that would have moved a vertex lights the result instead. Set
`relief` to 0 and the whole thing flattens into wallpaper. It is the difference
between a surface being folded and a picture being blurred.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `base` | color | `#fbfaf4` | any CSS hex | What the colour layers are laid over, and what shows wherever none of them reaches. Usually the palest of the four, because it is doing the job the paper does in print. |
| `one` | color | `#ffc9e3` | any CSS hex | The first colour layer, laid over the base. Keep the three within reach of each other on the wheel and mind what they make where they overlap: the first palette here had a peach under a cornflower, and peach under blue is tan, so the frame had a patch of mud in it that neither colour explains. |
| `two` | color | `#a9d8ff` | any CSS hex | The second layer, over the first. |
| `three` | color | `#cdbcff` | any CSS hex | The third, and the one that shows least, because it is only drawn where its own field is high. |
| `scale` | number | `0.75` | 0.3 to 4 | Size of the shapes. Lower is fewer and larger, which is what a hero wants: the shapes should be bigger than the headline sitting on them, not a texture behind it. |
| `warp` | number | `0.42` | 0 to 1.2 | How far the field is bent before it is read. At 0 the layers are parallel bands, which is the single thing that gives away most attempts at this effect. |
| `softness` | number | `0.6` | 0.02 to 1 | Width of the transition between one layer and the next. This is the control that decides whether the result reads as a gradient or as a map of three countries. |
| `relief` | number | `0.16` | 0 to 0.6 | How much the field is lit by its own slope. Small, and the thing that makes it look like a surface being folded rather than a picture being blurred. At 0 it is wallpaper. |
| `grain` | number | `0.3` | 0 to 1 | Grain, which on a field this smooth is doing real work: it breaks the banding that eight bit colour leaves across a slow gradient. Static rather than crawling. |
| `period` | number | `36` | 12 to 120 s | Seconds for one full cycle, and the pace control. Long on purpose: this sits behind a headline, and a backdrop has to survive being ignored. |

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
never starts and one frame is drawn, at `reducedMotionTime`. A still frame of
this is a perfectly good hero background, which is not true of every effect in
this library.

## 7. The three mistakes most likely to be made here

1. **Four colours from all over the wheel.** It reads as one material lit
   unevenly or it reads as nothing.

2. **Turning `relief` off.** It is the only thing here that says surface rather
   than image, and at 0.16 it is almost subliminal, which is the point.

3. **Putting the skew in the shader.** The diagonal is the container's, and
   doing it in the canvas means the pixels are skewed too, so the grain goes
   lopsided and the edges stair-step.

4. **Speeding it up to make the demo livelier.** That is the recorder setting
   the design. It sits behind a headline.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
