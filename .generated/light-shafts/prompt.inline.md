You are adding **LightShafts** from Beamish to this project.

> Light coming through something and falling across the frame in bands, with the shadow edges going soft as they travel. Backdrops · effect · MIT.
> https://beamish.ink/effects/light-shafts

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The whole image comes from one quantity, the angle from the source to the pixel, read against a repeating profile of bars and gaps. That is why the beams fan out from the source rather than running down the frame in parallel, and why pushing the source away straightens them on its own: distance is what turns a fan into parallel lines, and the sun is the limiting case
- The shadow edges soften with distance travelled. A shadow is sharp only near the thing that cast it, because the source has width and the half-shadow it throws grows as the shadow runs. One multiplication, and it is the whole difference between a beam of light and a pale triangle
- The motes are drawn only inside the beams. Light in clean air is invisible from the side, so the dust is not decoration over the shafts, it is the reason there is anything to see. They drift across the beams rather than along them, because dust in a room is moved by the air and not by the light
- The bar pitch is scaled by the distance of the source, so moving the light out to straighten the beams does not also squeeze them into a sliver
- There is an ambient term as well as the beams. Without it the unlit bands are flat and the frame reads as two colours rather than as one room
- Declared as working on either ground. The default is sun across a pale wall; the same effect with a dark ground is a projector beam, and the dust matters more there
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- Measured at 0.086 mean absolute change per frame on a 0 to 255 scale, which is in line with MeshGradient at 0.091 and PrismSpectrum at 0.080. Nearly all of it is the band edges sweeping rather than the motes: the motes were the obvious suspect and changing them moved the number by 0.0004
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/light-shafts/core.ts`**

```ts
/*
 * LightShafts: Beamish
 * https://beamish.ink/effects/light-shafts
 *
 * Light coming into a room through something, and falling across the frame in
 * bands. Sun through a blind, or through glazing bars, or through slats.
 *
 * Every version of this effect anybody ships is a few pale triangles fanned out
 * from a corner, and they all have the same tell: the beams are solid, they
 * have hard edges all the way along, and nothing accounts for why they are
 * there at all. A shaft of light is not a shape. It is the gap in whatever is
 * between you and the sun.
 *
 * So this is built the way the thing itself works:
 *
 *   There is a source, off frame, at a distance. Everything is drawn from the
 *   angle to it, which is what makes the beams fan rather than run parallel.
 *   Move the source far enough away and they do run parallel, because that is
 *   what distance does to a fan, and the sun is the limiting case.
 *
 *   There is an occluder: a repeating profile of bars and gaps, crossed by the
 *   rays. The bright bands are the gaps.
 *
 *   The edges go soft with distance. A shadow edge is only sharp where it is
 *   near the thing that cast it, because the source has width, and the
 *   half-shadow it throws grows as the shadow travels. This is the single
 *   detail that separates a beam of light from a triangle, and it costs one
 *   multiplication.
 *
 *   The beam is only visible because of what is in the air. Light in a vacuum
 *   is invisible from the side, so the motes are not decoration: they are the
 *   reason you can see the shaft, and they are drawn only inside it.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type LightShaftsOptions = BaseOptions & {
  /** The ground the light falls on. */
  ground: string
  /** The light itself. */
  light: string
  /** Where the source sits, in degrees around the frame. 0 is to the right. */
  angle: number
  /** How far off frame the source is, in frame widths. Far is parallel beams. */
  distance: number
  /** Bars the light comes through. */
  bars: number
  /** Share of each repeat that is open. 0.5 is a blind at half tilt. */
  gap: number
  /** Softness of a shadow edge where it leaves the bar. */
  softness: number
  /** How much softer the edge gets with distance travelled. */
  spread: number
  /** How far the light reaches across the frame, in frame widths. */
  reach: number
  /** Brightness of the light. */
  strength: number
  /** Motes in the air. The reason the shaft is visible at all. */
  dust: number
  /** Degrees the source swings over one period. */
  drift: number
  /** Seconds for one swing. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const lightShaftsDefaults: LightShaftsOptions = {
  ground: '#e7e2d6',
  light: '#fff6e2',
  angle: 128,
  distance: 1.6,
  bars: 7,
  gap: 0.44,
  softness: 0.06,
  spread: 1.5,
  reach: 2.1,
  strength: 0.26,
  dust: 0.7,
  drift: 4,
  period: 42,
  reducedMotionTime: 10
}

// beamish:shader-begin shaders/light-shafts.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/light-shafts.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * LightShafts: light through an occluder, falling across the frame in bands.
 *
 * The whole image comes from one quantity: the angle from the source to the
 * pixel. The occluder is a repeating profile of bars and gaps read against that
 * angle, which is why the beams fan out from the source rather than running
 * parallel down the frame. Push the source far enough away and the fan becomes
 * parallel on its own, because that is what distance does to a fan.
 *
 * Two details carry it, and both are cheap.
 *
 * The shadow edges soften with distance travelled. A shadow is sharp only near
 * the thing that cast it: the source has width, so the half-shadow grows as the
 * shadow runs. Leave this out and the beams are triangles with hard sides, which
 * is what every version of this effect looks like.
 *
 * The motes are drawn only inside the beams. Light in clean air is invisible
 * from the side, so the dust is not decoration laid over the shafts, it is the
 * reason there is anything to see.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_light;
uniform float u_angle;
uniform float u_distance;
uniform float u_bars;
uniform float u_gap;
uniform float u_softness;
uniform float u_spread;
uniform float u_reach;
uniform float u_strength;
uniform float u_dust;
uniform float u_drift;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

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

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);
  vec2 p = (cssPx - cssRes * 0.5) / shortSide;

  /*
   * The source, off frame. The swing is a sine of the phase so it returns to
   * where it started: a source that travels a full circle crosses the frame on
   * the way round, and a light passing through the room it is lighting is a
   * different effect entirely.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  float a = radians(u_angle + u_drift * sin(phase));
  vec2 source = vec2(cos(a), sin(a)) * max(u_distance, 0.02);

  vec2 toPixel = p - source;
  float travelled = length(toPixel);
  float bearing = atan(toPixel.y, toPixel.x);

  /*
   * The occluder, read against the bearing. Scaled by the distance of the
   * source so the bars keep the same apparent width on the frame as the source
   * is moved out: without this, pushing the light away to straighten the beams
   * also squeezes them all into a sliver.
   */
  float across = bearing * max(u_distance, 0.02) * u_bars;
  float within = abs(fract(across) - 0.5) * 2.0;

  /*
   * The penumbra. The edge of a shadow is sharp only near the thing that cast
   * it, because the source has width and the half-shadow it throws grows with
   * the distance the shadow has run. One multiplication, and it is the whole
   * difference between a beam and a triangle.
   */
  float blur = u_softness * (1.0 + u_spread * travelled);
  float edge = 1.0 - clamp(u_gap, 0.01, 0.99);
  float open = smoothstep(edge + blur, max(edge - blur, 0.0), within);

  // How far the light gets. Beyond its reach the room is just the room.
  float falloff = exp(-travelled / max(u_reach, 0.01));

  float beam = open * falloff * u_strength;

  /*
   * Motes, and only inside the beam. They drift across it rather than along it,
   * because dust in a room is moved by the air and not by the light, and the
   * drift is a whole number of turns over the period so the loop closes.
   *
   * The drift is very small on purpose. Dust hangs: it does not stream. The
   * first pass moved the mote field fifteen of its own widths over a period,
   * which measured three times the change per frame of everything else here put
   * together, for something that read as the air being blown out of the room.
   */
  vec2 air = p * 26.0 + vec2(sin(phase) * 0.14, cos(phase) * 0.09);
  float motes = noise(air) * noise(air * 2.7 + 11.0);
  motes = smoothstep(0.34, 0.72, motes);
  beam *= 1.0 + motes * u_dust * 1.1;

  // Plus the light that has bounced around the room and arrives from nowhere in
  // particular. Without it the unlit bands are flat and the frame reads as two
  // colours rather than as one room.
  float ambient = falloff * 0.22 * u_strength;

  vec3 col = u_ground + u_light * (beam + ambient);

  float tooth = hash12(floor(gl_FragCoord.xy)) - 0.5;
  col += tooth * 0.012;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_ground',
  'u_light',
  'u_angle',
  'u_distance',
  'u_bars',
  'u_gap',
  'u_softness',
  'u_spread',
  'u_reach',
  'u_strength',
  'u_dust',
  'u_drift'
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
  if (!shader) throw new Error('LightShafts: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`LightShafts: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class LightShaftsSurface implements Surface<LightShaftsOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('LightShafts needs a canvas')
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
    if (!gl) throw new Error('LightShafts needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('LightShafts: could not create program')
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
      throw new Error(`LightShafts: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: LightShaftsOptions): void {
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
    gl.uniform3fv(loc('u_ground'), rgb(opts.ground))
    gl.uniform3fv(loc('u_light'), rgb(opts.light))
    gl.uniform1f(loc('u_angle'), opts.angle)
    gl.uniform1f(loc('u_distance'), opts.distance)
    gl.uniform1f(loc('u_bars'), opts.bars)
    gl.uniform1f(loc('u_gap'), opts.gap)
    gl.uniform1f(loc('u_softness'), opts.softness)
    gl.uniform1f(loc('u_spread'), opts.spread)
    gl.uniform1f(loc('u_reach'), opts.reach)
    gl.uniform1f(loc('u_strength'), opts.strength)
    gl.uniform1f(loc('u_dust'), opts.dust)
    gl.uniform1f(loc('u_drift'), opts.drift)

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
 * Mount LightShafts into `el`. The element needs a size, in CSS, not just content.
 *
 * ```ts
 * const light = createLightShafts(document.querySelector('#hero')!)
 * light.start()
 * // …later
 * light.destroy()
 * ```
 */
export function createLightShafts(el: HTMLElement, opts: Partial<LightShaftsOptions> = {}): EffectHandle {
  return mount<LightShaftsOptions>(el, opts, {
    defaults: lightShaftsDefaults,
    create: () => new LightShaftsSurface()
  })
}

export default createLightShafts
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

LightShafts is light coming into a room through something, and falling across
the frame in bands. Sun through a blind, through glazing bars, through a door
left ajar.

Every version of this effect anybody ships is a few pale triangles fanned out
from a corner, and they all have the same tell: the beams are solid, their edges
are equally sharp all the way along, and nothing accounts for why they are there
at all. A shaft of light is not a shape. It is the gap in whatever is between
you and the sun.

So this is built the way the thing works.

**There is a source, off frame, at a distance.** Everything is drawn from the
angle to it, which is what makes the beams fan rather than run parallel. Move
the source far enough away and they do run parallel, because that is what
distance does to a fan, and the sun is the limiting case. There is no separate
setting for parallel beams, because this is what parallel beams are.

**There is an occluder.** A repeating profile of bars and gaps, crossed by the
rays. The bright bands are the gaps, not the bars.

**The edges go soft with distance.** A shadow edge is sharp only near the thing
that cast it, because the source has width and the half-shadow it throws grows
as the shadow travels. This one multiplication is the whole difference between a
beam of light and a triangle.

**The beam is visible because of what is in the air.** Light in clean air cannot
be seen from the side, so the motes are not decoration over the top of the
shafts: they are the reason there is anything to see, and they are drawn only
inside the beams.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="room" style="height: 100vh"></div>

<script type="module">
  import { createLightShafts } from './beamish/effects/light-shafts/core.js'

  const light = createLightShafts(document.querySelector('#room'))
  light.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createLightShafts } from '@/beamish/effects/light-shafts/core'

export function Room() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const light = createLightShafts(host.current, { bars: 9, gap: 0.5 })
    light.start()
    return () => light.destroy()
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
import { createLightShafts } from '@/beamish/effects/light-shafts/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let light: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  light = createLightShafts(host.value)
  light.start()
})

onBeforeUnmount(() => light?.destroy())
</script>

<template>
  <div ref="host" class="room" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `ground` | color | `#e7e2d6` | any CSS hex | The surface the light falls on, which is that surface in shadow: the lit bands are added on top of it, so it has to sit below them with room to spare. A ground as pale as the light clips to white across the whole frame, which is the first thing that went wrong here. Set it near black and the same effect is a projector beam in a dark room. |
| `light` | color | `#fff6e2` | any CSS hex | The light itself, added to the ground rather than mixed with it, because light is additive and a shaft that darkens what it crosses is a shaft of paint. Warm, because daylight through a window is warm and a neutral white beam reads as a lightbox. |
| `angle` | number | `128` | 0 to 360 deg | Where the source sits, in degrees around the frame, with 0 to the right. Above and to one side is the one that reads as a window; straight on reads as a torch pointed at the viewer. |
| `distance` | number | `1.6` | 0.2 to 8 (looks right between 1 and 3) | How far off frame the source is, in frame widths. Near is a lamp and the beams fan hard; far is the sun and they run very nearly parallel. There is no separate setting for parallel beams, because this is what parallel beams are. |
| `bars` | number | `7` | 1 to 40 (looks right between 4 and 12) | How many bars the light comes through. A few wide ones read as glazing bars or a door ajar; a great many read as a blind, and past about twenty the frame is a texture rather than a room. |
| `gap` | number | `0.44` | 0.02 to 0.98 | The share of each repeat that is open. Think of it as the tilt of a blind: at 0.9 the slats are nearly edge on and the room is bright, at 0.1 they are nearly shut. |
| `softness` | number | `0.06` | 0 to 0.5 | How soft a shadow edge is where it leaves the bar. This is the near edge only. At 0 the beam starts with a razor edge, which is what a point source does and no real source is. |
| `spread` | number | `1.5` | 0 to 6 (looks right between 0.8 and 3) | How much softer that edge gets with the distance the shadow has travelled. The detail that makes the light read as light. At 0 the beams are triangles with parallel sides, which is every other version of this effect. |
| `reach` | number | `2.1` | 0.2 to 10 | How far the light gets across the frame, in frame widths, falling off as it goes. Short is a small window in a large room; long floods the frame and leaves nothing for the beams to be brighter than. |
| `strength` | number | `0.26` | 0 to 2 | Brightness of the light, added to the ground rather than mixed into it. On a pale ground this clips long before it reaches 2, and a quarter is already a bright day: the numbers here are small because the ground is most of the way up the scale before any light arrives. |
| `dust` | number | `0.7` | 0 to 2 | Motes in the air. At 0 the beams are clean bands, which is what light in a vacuum would look like if you could see it, which you could not. |
| `drift` | number | `4` | 0 to 60 deg (looks right between 3 and 15) | Degrees the source swings over one period. Small. The sun moves through about fifteen degrees in an hour, and anything much faster reads as somebody carrying a lamp past the window. It is also the one setting that drives the cost of the animation: a band edge is the highest-contrast thing in the frame, so swinging the light moves a great many pixels. Measured, dropping this from 7 to 4 took the change per frame from 0.151 to 0.086. |
| `period` | number | `42` | 12 to 180 s | Seconds for one swing and back. Long, because this sits behind something else and a backdrop has to survive being ignored. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createLightShafts` from `useEffect`, `onMounted`, or a `client:*`
island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. The still frame is the whole composition with the sun held
in place, which costs the viewer nothing here.

## 7. The three mistakes most likely to be made here

1. **A ground as pale as the light.** The light is added, so there is nothing
   above white for it to be. The frame clips and the beams vanish into it.
   `ground` is the surface in shadow.

2. **Leaving `spread` at 0.** The beams become triangles with parallel sides,
   which is every other version of this effect. A shadow edge softens as it
   travels because the source has width.

3. **Turning `drift` up to make it feel alive.** A band edge is the
   highest-contrast thing in the frame, so swinging the light moves a great many
   pixels: going from 4 degrees to 7 nearly doubled the measured change per
   frame. The sun covers fifteen degrees in an hour. Anything faster is somebody
   walking past with a lamp.

4. **Using it as a foreground.** This is a ground. It has large smooth areas and
   hard-edged bands, and text laid across a band edge is unreadable at exactly
   the moment the edge passes under it. Put it behind, and keep the bands away
   from the copy.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
