You are adding **AuroraCurtain** from Beamish to this project.

> The northern lights on a night sky, folded into curtains and lit from the bottom up. Backdrops · effect · MIT.
> https://beamish.ink/effects/aurora-curtain

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Built for a dark ground and declared as one. On warm paper it is a worse aurora for no reason, and the house style is a house style rather than a rule about what may exist
- The shape follows the physics rather than a reference photograph. Emission runs along near-vertical magnetic field lines, which is the striation; the electrons stop at an abrupt floor around 100km and thin out upwards over hundreds of kilometres, which is why the bottom edge is sharp and the top has no edge at all
- The colour is altitude. Oxygen's green line at 557.7nm low down, its red line at 630nm higher up where collisions are rare enough to let the slower transition happen. Green at the foot running to red at the top, never a hue cycle
- Every moving term is a sum of sines whose time coefficients are whole numbers of turns over the period, so the loop closes exactly. A noise field advanced by time never returns to its first frame and the recorder needs it to
- Three curtains at different depths, each lower, dimmer and folded on a different scale. Sharing a scale makes them read as one curtain drawn three times
- The stars do not twinkle. Scintillation is strongest near the horizon and nearly absent overhead, and faking it evenly costs a per-frame change in every pixel for something nobody looks at
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/aurora-curtain/core.ts`**

```ts
/*
 * AuroraCurtain: Beamish
 * https://beamish.ink/effects/aurora-curtain
 *
 * The northern lights, on a night sky. WebGL2, no three.js, no dependencies.
 *
 * This one is built for a dark ground and says so in its meta. It is the first
 * item in the library that is: paper is the house style here rather than a rule
 * about what can exist, and an aurora on warm paper would be a worse aurora for
 * no reason.
 *
 * The GL boilerplate is inline rather than imported. This file is published and
 * read on its own, and a reader should not have to fetch a second module to find
 * out how a program gets compiled.
 *
 * The shader source is generated from shaders/aurora-curtain.frag and
 * shaders/aurora-curtain.vert. Edit those, then run `pnpm generate`. The markers
 * are load-bearing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type AuroraCurtainOptions = BaseOptions & {
  /** The night sky behind it. Dark, and not black: a sky has a colour. */
  sky: string
  /** The colour at the foot. Oxygen's green line, which is where it is brightest. */
  low: string
  /** The colour at the top. The slower red transition, high up where the air is thin. */
  high: string
  /** How many curtains, 1 to 3. Each is further away, lower and dimmer. */
  curtains: number
  /** How far up the frame a curtain reaches, as a share of its height. */
  height: number
  /** How hard the curtains fold along their length. 0 is a flat band. */
  fold: number
  /** Contrast of the vertical rays. The single most recognisable thing about an aurora. */
  rays: number
  /** How fine the rays are. Higher is more of them. */
  pitch: number
  /** Overall strength of the light. */
  brightness: number
  /** Stars, 0 to 1. They do not twinkle: see the shader. */
  stars: number
  /** Light on the horizon, 0 to 1. There is always a town somewhere behind you. */
  horizon: number
  /** Sensor noise of a long exposure, 0 to 1. Static, not crawling film grain. */
  grain: number
  /** Seconds for one full cycle. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const auroraCurtainDefaults: AuroraCurtainOptions = {
  sky: '#070b18',
  low: '#45efa0',
  high: '#d8468f',
  curtains: 3,
  height: 0.3,
  fold: 0.62,
  rays: 0.8,
  pitch: 40,
  brightness: 0.8,
  stars: 0.5,
  horizon: 0.45,
  grain: 0.3,
  period: 36,
  reducedMotionTime: 7
}

// beamish:shader-begin shaders/aurora-curtain.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/aurora-curtain.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * AuroraCurtain: the northern lights, built the way they are made.
 *
 * It is not a rainbow gradient with some noise on it, and the difference is
 * most of why those read as wallpaper. An aurora is emission: electrons follow
 * the magnetic field down into the atmosphere and excite gas along the way, so
 * everything about its shape follows from that.
 *
 *   It hangs in vertical rays, because the field lines are near vertical at
 *   those latitudes and the light is emitted along them. That is the striation,
 *   and it is the single most recognisable thing about an aurora.
 *
 *   The bottom edge is sharp and the top is not. The electrons stop at the
 *   altitude where the air finally gets thick enough, which is an abrupt floor
 *   at around 100km, and thin out upwards over hundreds of kilometres.
 *
 *   The colour is altitude. Atomic oxygen gives the green line at 557.7nm low
 *   down, and the red line at 630nm higher up where collisions are rare enough
 *   to let the slower transition happen. So green at the foot running to red at
 *   the top, never the other way round and never a hue cycle.
 *
 *   The curtain folds along its length rather than waving as a whole. What you
 *   are looking at is a sheet seen edge on, so a fold reads as a bright rib.
 *
 * Everything moves on sums of sines whose time coefficients are whole numbers
 * of turns over the period, so the loop closes exactly. A noise field advanced
 * by time would never return to its first frame, and the recorder needs it to.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_sky;
uniform vec3  u_low;
uniform vec3  u_high;

uniform float u_curtains;
uniform float u_height;
uniform float u_fold;
uniform float u_rays;
uniform float u_pitch;
uniform float u_brightness;
uniform float u_stars;
uniform float u_horizon;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * The fold of one curtain along its length.
 *
 * Three sines, and the time coefficients are 1, 2 and 3 turns over the period.
 * Whole numbers are not a detail: a fractional one never comes back to where it
 * started, and the video jumps once a cycle.
 */
float fold(float x, float phase, float seed) {
  float s = sin(x * 2.1 + phase + seed) * 0.55;
  s += sin(x * 4.3 - phase * 2.0 + seed * 2.1) * 0.3;
  s += sin(x * 8.7 + phase * 3.0 + seed * 3.7) * 0.15;
  return s;
}

/*
 * A note on those spatial frequencies, because the first version of this had
 * them ten times too low and the mistake is invisible in the maths.
 *
 * x spans the aspect ratio, so about 1.8 on a wide frame. A term at sin(x * 0.7)
 * turns through 1.25 radians across the whole canvas, which is a fifth of a
 * cycle: not a fold, a tilt. Every curtain came out as one smooth arc and the
 * stack of them read as a hillside. A frequency here is only meaningful against
 * the width it has to cross.
 */

/*
 * The vertical rays, as a modulation along the curtain rather than across it.
 *
 * Three more sines at a much higher spatial frequency. They drift faster than
 * the fold does, which is what makes the curtain look like it is being fed
 * light from somewhere rather than simply swaying.
 */
float striation(float x, float phase, float seed) {
  float s = sin(x * u_pitch + phase * 2.0 + seed) * 0.5;
  s += sin(x * u_pitch * 2.3 - phase * 3.0 + seed * 1.7) * 0.3;
  s += sin(x * u_pitch * 4.7 + phase * 5.0 + seed * 2.9) * 0.2;
  return s;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  // y runs 0 at the horizon to 1 at the top of the frame, which is the way an
  // aurora is measured and saves flipping it in every term below.
  vec2 uv = cssPx / cssRes;
  float aspect = cssRes.x / max(cssRes.y, 1.0);
  float x = (uv.x - 0.5) * aspect;

  float phase = TAU * u_time / max(u_period, 0.001);

  vec3 col = u_sky;

  /*
   * Stars first, so the aurora washes over them rather than sitting under them.
   *
   * One candidate per cell of a fixed grid, which needs no sorting and cannot
   * drift. They do not twinkle: a twinkle is atmospheric scintillation, it is
   * strongest near the horizon and nearly absent overhead, and faking it evenly
   * across the frame costs a per-frame change in every pixel for something
   * nobody looks at.
   */
  vec2 grid = uv * vec2(aspect, 1.0) * 150.0;
  vec2 cell = floor(grid);
  float pick = hash12(cell);
  vec2 at = vec2(hash12(cell + 11.3), hash12(cell + 27.7));
  float d = length(fract(grid) - at);
  float star = step(0.985, pick) * exp(-d * d * 90.0);
  // Brighter overhead, because low stars are seen through more air.
  col += vec3(0.85, 0.89, 1.0) * star * u_stars * smoothstep(0.0, 0.5, uv.y);

  /*
   * A little light on the horizon. Nowhere on Earth is the bottom of the sky
   * as dark as the top: there is always a town somewhere behind you.
   */
  col += u_sky * u_horizon * 3.5 * exp(-uv.y * 6.0);

  int count = int(clamp(u_curtains, 1.0, 3.0));
  vec3 glow = vec3(0.0);

  for (int i = 0; i < 3; i++) {
    if (i >= count) break;
    float fi = float(i);
    float seed = fi * 2.399;

    /*
     * Each curtain is further away than the last: lower in the frame, dimmer,
     * and folded on a slightly different scale. Depth is the whole reason to
     * draw more than one, so if they share a scale they read as one curtain
     * drawn three times.
     */
    float depth = 1.0 - fi * 0.26;
    float scale = 1.0 + fi * 0.37;

    /*
     * Where the foot of this curtain sits. Low in the frame but not at the
     * bottom of it: the bright core is the part worth looking at, and a foot on
     * the horizon line puts it half off the canvas.
     */
    float base = 0.3 + fi * 0.12 + u_fold * fold(x * scale, phase, seed) * 0.14;
    float h = uv.y - base;
    float reach = max(u_height * depth, 0.01);

    /*
     * Two falloffs rather than one, because an aurora is not an even glow: it
     * has a bright core just above the floor, where the air is still dense
     * enough to light up properly, and a long faint tail above it. One
     * exponential gives you the tail or the core, never both, and a single
     * middling one is the gradient wash this effect looked like at first.
     *
     * Both are exponentials, so a curtain still has no top edge. It runs out.
     */
    float tail = exp(-max(h, 0.0) / reach) * 0.22;
    float core = exp(-max(h, 0.0) / (reach * 0.34)) * 0.95;
    float floorEdge = smoothstep(-0.01, 0.018, h);
    // And a little spill below the foot, which is scattered light in the air
    // under it rather than emission.
    float spill = exp(-max(-h, 0.0) / (reach * 0.14)) * 0.16;

    /*
     * Where along its length this curtain is lit at all.
     *
     * This is the part that decides whether the thing reads as a sheet or as a
     * band of colour across the frame. A real curtain has ends and gaps: it is
     * bright in sections and absent in between, and without that every curtain
     * spans the whole width evenly and the eye has nothing to hold onto.
     */
    float env = 0.5 + 0.5 * fold(x * scale * 0.42 + 3.1, phase + 1.7, seed * 1.3);
    env = smoothstep(0.3, 0.95, env);

    float rays = 0.5 + 0.5 * striation(x * scale + fi * 7.0, phase, seed) * u_rays;
    float amount = ((tail + core) * floorEdge + spill) * max(rays, 0.0) * env * depth;

    // Green at the foot, red at the top. Altitude is the only thing that sets
    // the colour of an aurora, so it is the only thing that sets it here.
    vec3 tint = mix(u_low, u_high, clamp(h / (reach * 2.6), 0.0, 1.0));
    glow += tint * amount;
  }

  col += glow * u_brightness;

  /*
   * A soft shoulder rather than a clamp. Three curtains crossing can easily sum
   * past 1, and clipping turns the overlap into a flat white patch with a hard
   * edge, which is the one thing that never happens in the sky.
   */
  col = vec3(1.0) - exp(-col);

  // Grain, which on a dark ground reads as the sensor noise of a long exposure.
  // Static rather than per-frame: film grain that crawls is a different effect
  // and a far noisier one.
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
  'u_sky',
  'u_low',
  'u_high',
  'u_curtains',
  'u_height',
  'u_fold',
  'u_rays',
  'u_pitch',
  'u_brightness',
  'u_stars',
  'u_horizon',
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
  if (!shader) throw new Error('AuroraCurtain: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`AuroraCurtain: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class AuroraCurtainSurface implements Surface<AuroraCurtainOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('AuroraCurtain needs a canvas')
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
    if (!gl) throw new Error('AuroraCurtain needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('AuroraCurtain: could not create program')
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
      throw new Error(`AuroraCurtain: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: AuroraCurtainOptions): void {
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
    gl.uniform3fv(at('u_sky'), parseColor(opts.sky))
    gl.uniform3fv(at('u_low'), parseColor(opts.low))
    gl.uniform3fv(at('u_high'), parseColor(opts.high))
    gl.uniform1f(at('u_curtains'), opts.curtains)
    gl.uniform1f(at('u_height'), opts.height)
    gl.uniform1f(at('u_fold'), opts.fold)
    gl.uniform1f(at('u_rays'), opts.rays)
    gl.uniform1f(at('u_pitch'), opts.pitch)
    gl.uniform1f(at('u_brightness'), opts.brightness)
    gl.uniform1f(at('u_stars'), opts.stars)
    gl.uniform1f(at('u_horizon'), opts.horizon)
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
 * Mount AuroraCurtain into `el`. The element needs a size. Give it width and
 * height in CSS, not just content.
 *
 * ```ts
 * const aurora = createAuroraCurtain(document.querySelector('#sky')!)
 * aurora.start()
 * // …later
 * aurora.destroy()
 * ```
 */
export function createAuroraCurtain(
  el: HTMLElement,
  opts: Partial<AuroraCurtainOptions> = {}
): EffectHandle {
  return mount<AuroraCurtainOptions>(el, opts, {
    defaults: auroraCurtainDefaults,
    create: () => new AuroraCurtainSurface()
  })
}

export default createAuroraCurtain
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

The northern lights, on a night sky.

This is the first item in the library built for a dark ground rather than for
warm paper, and it declares that in its meta so the site shows it on one. Paper
is the house style here, not a rule about what may exist, and an aurora on paper
would be a worse aurora for no reason.

It is not a rainbow gradient with noise on it, and that is most of why those
read as wallpaper. An aurora is emission, and every part of its shape follows
from that.

**It hangs in vertical rays.** Electrons spiral down the magnetic field lines,
which are near vertical at those latitudes, and light up the gas along the way.
The striation is the single most recognisable thing about an aurora, and an
effect without it is a coloured cloud.

**The bottom edge is sharp and the top is not.** The electrons stop where the
air finally gets thick enough, an abrupt floor at around 100km, and thin out
upwards over hundreds of kilometres. So the foot is a hard line and the top has
no edge at all: it runs out.

**The colour is altitude.** Atomic oxygen gives the green line at 557.7nm low
down, and the red line at 630nm higher up, where collisions are rare enough to
let the slower transition finish. Green at the foot running to red at the top,
never the other way round and never a hue cycle.

**It folds along its length.** You are looking at a sheet edge on, so a fold
reads as a bright rib rather than as a wave passing through.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `sky` | color | `#070b18` | any CSS hex | The night sky behind it. Dark, and not black: a real sky has a colour, and the shoulder that keeps the bright parts from clipping lifts pure black into a flat grey anyway. |
| `low` | color | `#45efa0` | any CSS hex | The colour at the foot, which is oxygen's green line at 557.7nm and the brightest thing in the display. Shifting it far from green stops reading as an aurora, because this is the one colour everybody has seen. |
| `high` | color | `#d8468f` | any CSS hex | The colour at the top, which is the slower red transition high up where the air is thin enough to let it happen. Magenta rather than pure red is what a camera records and what most people picture. |
| `curtains` | number | `3` | 1 to 3 | How many curtains. Each is further away: lower in the frame, dimmer, and folded on a different scale. One is a quiet backdrop, three is a display. |
| `height` | number | `0.3` | 0.15 to 0.9 | How far up the frame the light reaches, as a share of its height. It is a falloff rather than a limit, so a curtain has no top edge: it runs out. |
| `fold` | number | `0.62` | 0 to 1.5 | How hard the curtains fold along their length. At 0 you have flat bands, which is a real thing a quiet aurora does and is also the safest setting behind text. |
| `rays` | number | `0.8` | 0 to 1.4 | Contrast of the vertical rays. This is the most recognisable thing about an aurora and the first thing to raise if it looks like a gradient. |
| `pitch` | number | `40` | 8 to 120 | How fine the rays are, as turns across the frame rather than a count: x spans the aspect ratio, so 40 is roughly a dozen ribs on a wide canvas. Past about 90 they stop resolving on a small panel and read as noise. |
| `brightness` | number | `0.8` | 0.1 to 2 | Overall strength of the light. A soft shoulder keeps it from clipping, so a high value compresses rather than flaring into a white patch. |
| `stars` | number | `0.5` | 0 to 1.5 | Stars. They sit under the aurora rather than over it, and they are brighter overhead than near the horizon, because low stars are seen through more air. |
| `horizon` | number | `0.45` | 0 to 1.5 | Light on the horizon. Nowhere on Earth is the bottom of the sky as dark as the top, and the gradient is most of what stops a flat sky colour looking like a swatch. |
| `grain` | number | `0.3` | 0 to 1 | The sensor noise of a long exposure. Static rather than crawling: film grain that moves is a different effect and a far noisier one. |
| `period` | number | `36` | 12 to 120 s | Seconds for one full cycle, and the pace control. Long on purpose: a backdrop has to survive being ignored, and an aurora that hurries is a screensaver. |

## 5. Cleanup and SSR

`destroy()` releases the context, deletes the program and the VAO, cancels the
RAF and disconnects the observers. Call it.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`, which is
already on the React adapter.

## 6. Pausing and reduced motion

Handled in the runtime, and non-negotiable: WCAG 2.2.2 is Level A and it
describes every ambient backdrop. The handle has `stop()` and `start()`, and the
demo panel on the site wires them to a visible control.

Also handled in the runtime. Under `prefers-reduced-motion: reduce` the loop
never starts and one frame is drawn, at `reducedMotionTime`. That frame is
chosen rather than defaulted to zero: at 7 seconds the curtains are folded and
crossing, which is a composition rather than three parallel bands.

## 7. The three mistakes most likely to be made here

1. **Making it fast.** An aurora moves slowly and it is behind your content. The
   first instinct with a shader like this is to shorten the period until the
   demo looks lively, which is the recorder setting the design.

2. **Cycling the colour.** The green and the red are two emission lines, not two
   ends of a hue ramp. Rotating the hue through blue and yellow is the clearest
   possible sign that nobody looked at the sky.

3. **Putting the headline over the brightest part.** The light is at the foot of
   the frame. That is where the contrast is worst and where the rays are busiest.

4. **Expecting it on paper.** `ground` says dark. On a light page the sky is a
   dark rectangle, which is a hole rather than a backdrop.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
