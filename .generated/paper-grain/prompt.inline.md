You are adding **PaperGrain** from Beamish to this project.

> The surface of a sheet of paper with nothing on it, lit by its own roughness. Backdrops · effect · MIT.
> https://beamish.ink/effects/paper-grain

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The image is a lighting calculation rather than a pattern. One noise field becomes a height, the height is differenced into a normal, and the normal meets one low light. Drawn as tone instead, the same field is a grey cloud that could be anything
- Which field goes into the height and which goes into the tone is the whole shape of this rather than a detail. Only the fibre is surface. Formation is a density, so it changes how much light comes back and not which way the sheet faces, and it belongs in the tone: put both in the height, which is the obvious way to write it, and the broad field contributes almost nothing while the fine fibre dominates the derivative. The first version of this was rough-cast plaster
- The fibre is stretched along the machine direction, because stock runs in a direction on a paper machine and the fibres lie along it. Isotropic noise is the single thing that stops a paper texture reading as paper: the sheets that really are isotropic are the handmade ones, and they look like felt
- The tooth is smaller than a pixel, so it is in neither the height nor the tone. It is a flicker added to the light and weighted by how much the light rakes, because roughness you cannot resolve only shows as sparkle in grazing light. Raise `light` towards overhead and it goes flat, which is what happens to real paper under a ceiling light
- Nothing in the paper moves. The light swings through a few degrees and back. Grain that crawls is film grain, which is a different effect and a far noisier one: measured at 0.013 mean absolute change per frame on a 0 to 255 scale, this is the quietest thing in the library by a factor of several
- The normal is differenced over exactly one CSS pixel and divided by that step, so it is a slope rather than a difference and `relief` means the same thing at every canvas size. A shorter step samples detail the screen cannot resolve, which comes back as sparkle that changes when the canvas is resized
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/paper-grain/core.ts`**

```ts
/*
 * PaperGrain: Beamish
 * https://beamish.ink/effects/paper-grain
 *
 * The surface of a sheet of paper, with nothing on it. No pattern laid over a
 * background: the paper is the subject, and what you are looking at is light
 * falling across its own roughness.
 *
 * Three things make a surface read as paper rather than as noise, and all three
 * are in here because leaving any one out gives you grey static:
 *
 *   Fibre. A sheet is a mat of fibres, and on a machine-made sheet they lie
 *   more along one axis than the other, because the stock runs in a direction.
 *   So the noise is stretched along that axis rather than isotropic. This is
 *   the machine direction, and it is why a sheet tears cleanly one way.
 *
 *   Formation. Hold a sheet up to a window and you see cloud: the fibre is not
 *   spread evenly, and the patches are far larger than the fibres. Papermakers
 *   call it formation, or look-through, and it is what separates good stock
 *   from newsprint.
 *
 *   PaperGrain. The micro-roughness that takes the ink. Too small to see as shape,
 *   so it is not in the surface at all: it is a flicker in the light, and it
 *   only shows where the light is raking.
 *
 * Which of those three goes into the height and which goes into the tone is the
 * whole shape of this thing, rather than a detail of it. Only the fibre is
 * surface: it is differenced into a normal and lit. Formation is a density, so
 * it changes how much light comes back and not which way the sheet faces, and
 * it belongs in the tone. Put both in the height, which is the obvious way to
 * write this, and the broad field contributes almost nothing because a broad
 * field has almost no slope, while the fine fibre dominates the derivative: the
 * first version of this was rough-cast plaster, and no amount of retuning the
 * numbers was going to make it paper.
 *
 * Nothing in the paper moves. The light swings, slowly, through a few degrees.
 * Grain that crawls is film grain, which is a different effect and a far
 * noisier one, and the measured change per frame here is about a hundredth of
 * what a drifting field costs.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type PaperGrainOptions = BaseOptions & {
  /** The stock. A warm white by default; set it dark for card. */
  paper: string
  /** What the fibre is tinted towards where it lies thickest. */
  fibre: string
  /** Fibres across the short side. Higher is a finer, harder sheet. */
  scale: number
  /** Machine direction, in degrees. The axis the fibre lies along. */
  direction: number
  /** How far the fibre is drawn out along that axis. 1 is no direction at all. */
  stretch: number
  /** Strength of the cloud: the uneven spread of fibre you see in look-through. */
  formation: number
  /** The micro-roughness that takes ink. Shows only where the light rakes. */
  tooth: number
  /** Height of the light, 0 raking along the surface, 1 straight down on it. */
  light: number
  /** How strongly the surface is lit by its own slope. */
  relief: number
  /** Degrees the light swings over one period. */
  sweep: number
  /** Specks of unbeaten fibre in the stock. Papermakers call it shive. */
  shive: number
  /** Seconds for one swing of the light. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const paperGrainDefaults: PaperGrainOptions = {
  paper: '#f7f5ed',
  fibre: '#fffdf6',
  scale: 340,
  direction: 12,
  stretch: 3.4,
  formation: 0.55,
  tooth: 0.5,
  light: 0.18,
  relief: 0.6,
  sweep: 26,
  shive: 0.35,
  period: 36,
  reducedMotionTime: 9
}

// beamish:shader-begin shaders/paper-grain.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/paper-grain.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * PaperGrain: the surface of a sheet of paper, with nothing on it.
 *
 * The image is a lighting calculation, not a pattern. One noise field becomes a
 * height, the height is differenced into a normal, and the normal meets one low
 * light. Draw that same field as tone instead and the result is a grey cloud
 * that could be anything; light it and it is a sheet of paper.
 *
 * The fibre is stretched along the machine direction, because the stock runs in
 * a direction on a paper machine and the fibres lie along it. Formation, the
 * cloud you see holding a sheet to a window, is a density rather than a shape,
 * so it goes into the tone. The tooth is smaller than a pixel, so it goes into
 * neither: it is a flicker added to the light, weighted by how much the light
 * rakes, because roughness you cannot resolve only shows as sparkle in grazing
 * light.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_fibre;
uniform float u_scale;
uniform float u_direction;
uniform float u_stretch;
uniform float u_formation;
uniform float u_tooth;
uniform float u_light;
uniform float u_relief;
uniform float u_sweep;
uniform float u_shive;

out vec4 fragColor;

const float TAU = 6.28318530718;
const float PI = 3.14159265359;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/* Value noise, smoothstepped so the fields have no cell edges in them. */
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
    p = p * 2.03 + 17.3;
    amp *= 0.5;
  }
  return sum;
}

/*
 * The fibre, in a frame rotated to the machine direction and squashed across
 * it, which is what makes the grain run one way. Isotropic noise here is the
 * single thing that stops a paper texture reading as paper: the sheets that
 * really are isotropic are the handmade ones, and they look like felt.
 */
float fibreAt(vec2 p) {
  float a = radians(u_direction);
  mat2 toGrain = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 g = toGrain * p;
  g.x /= max(u_stretch, 0.05);
  return fbm(g * u_scale);
}

/*
 * Formation: the uneven spread of fibre, in patches far larger than the fibres.
 *
 * It belongs in the tone and not in the height, and that is the whole shape of
 * this shader rather than a detail. Formation is a density variation, so what
 * it changes is how much light comes back, not which way the surface faces.
 * Put it in the height with the fibre and two things go wrong: it contributes
 * almost nothing, because a broad field has almost no slope, and the fine fibre
 * that is left dominates the derivative and the sheet comes out as rough-cast
 * plaster.
 */
float formationAt(vec2 p) {
  return fbm(p * u_scale * 0.03 + 53.1);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);
  vec2 p = (cssPx - cssRes * 0.5) / shortSide;

  /*
   * Forward differences at one CSS pixel. The step has to be the pixel rather
   * than some small constant: a normal measured over a shorter distance than
   * the screen can resolve is sampling detail that is not in the image, and it
   * comes back as sparkle that moves when the canvas is resized.
   */
  float e = 1.0 / shortSide;
  float here = fibreAt(p);
  float hx = fibreAt(p + vec2(e, 0.0)) - here;
  float hy = fibreAt(p + vec2(0.0, e)) - here;

  // Divided by the step, so the slope is a slope rather than a difference, and
  // relief means the same thing at every canvas size.
  vec2 slope = vec2(hx, hy) / e;
  vec3 normal = normalize(vec3(-slope * u_relief * 0.02, 1.0));

  /*
   * One light, low. The swing is a sine of the phase, so it returns to where it
   * started and the loop closes exactly: a light that travels a full circle
   * passes through the back of the sheet on the way, which on a flat surface
   * reads as the image inverting.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  float azimuth = radians(135.0 + u_sweep * sin(phase));
  float elevation = mix(0.04, 1.0, clamp(u_light, 0.0, 1.0)) * PI * 0.5;
  vec3 sun = vec3(cos(azimuth) * cos(elevation), sin(azimuth) * cos(elevation), sin(elevation));

  /*
   * Paper is not a mirror and it is not a void. Nearly all of what comes off a
   * sheet is bounced light, so the ambient term is much the larger of the two
   * and the lit term is a small correction on top of it. Weight these the way a
   * solid object is weighted and the sheet turns to stone.
   */
  float lambert = max(dot(normal, sun), 0.0);
  float shade = 0.94 + 0.16 * (lambert - 0.5);

  /*
   * PaperGrain. Smaller than a pixel, so it cannot be in the surface: it is a
   * flicker in the light, weighted by how level the light is. Overhead light
   * fills the pits and the sheet goes flat, which is exactly what happens to a
   * sheet of paper under a ceiling light and the reason nobody photographs
   * paper that way.
   */
  float rake = 1.0 - clamp(u_light, 0.0, 1.0);
  float speck = hash12(floor(gl_FragCoord.xy)) - 0.5;
  shade += speck * 0.028 * u_tooth * (0.25 + 0.75 * rake);

  // The cloud, as tone. Centred on zero so it lightens and darkens the stock
  // rather than dragging the whole sheet one way.
  float cloud = (formationAt(p) - 0.5) * u_formation * 0.085;
  vec3 col = mix(u_paper, u_fibre, clamp(0.5 + cloud * 6.0, 0.0, 1.0)) * (shade + cloud);

  /*
   * Shive: specks of fibre the beater did not break down, which end up darker
   * than the sheet and are the one thing in here that is a mark rather than a
   * surface. Sparse on purpose. A sheet with visible shive all over it is a
   * sheet nobody bought.
   */
  vec2 cell = floor(cssPx * 0.5);
  float pick = hash12(cell + 91.7);
  float speckle = step(1.0 - u_shive * 0.0045, pick);
  col *= 1.0 - speckle * (0.10 + 0.14 * hash12(cell + 13.9));

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
  'u_fibre',
  'u_scale',
  'u_direction',
  'u_stretch',
  'u_formation',
  'u_tooth',
  'u_light',
  'u_relief',
  'u_sweep',
  'u_shive'
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
  if (!shader) throw new Error('PaperGrain: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`PaperGrain: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class PaperGrainSurface implements Surface<PaperGrainOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('PaperGrain needs a canvas')
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
    if (!gl) throw new Error('PaperGrain needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('PaperGrain: could not create program')
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
      throw new Error(`PaperGrain: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: PaperGrainOptions): void {
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
    gl.uniform3fv(loc('u_fibre'), rgb(opts.fibre))
    gl.uniform1f(loc('u_scale'), opts.scale)
    gl.uniform1f(loc('u_direction'), opts.direction)
    gl.uniform1f(loc('u_stretch'), opts.stretch)
    gl.uniform1f(loc('u_formation'), opts.formation)
    gl.uniform1f(loc('u_tooth'), opts.tooth)
    gl.uniform1f(loc('u_light'), opts.light)
    gl.uniform1f(loc('u_relief'), opts.relief)
    gl.uniform1f(loc('u_sweep'), opts.sweep)
    gl.uniform1f(loc('u_shive'), opts.shive)

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
 * Mount PaperGrain into `el`. The element needs a size, in CSS, not just content.
 *
 * ```ts
 * const sheet = createPaperGrain(document.querySelector('#hero')!)
 * sheet.start()
 * // …later
 * sheet.destroy()
 * ```
 */
export function createPaperGrain(el: HTMLElement, opts: Partial<PaperGrainOptions> = {}): EffectHandle {
  return mount<PaperGrainOptions>(el, opts, {
    defaults: paperGrainDefaults,
    create: () => new PaperGrainSurface()
  })
}

export default createPaperGrain
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

PaperGrain is the surface of a sheet of paper, with nothing on it. Not a pattern laid
over a background: the paper is the subject, and what you are looking at is
light falling across its own roughness.

Three things make a surface read as paper rather than as noise, and leaving any
one of them out gives you grey static.

**Fibre.** A sheet is a mat of fibres, and on a machine-made sheet they lie more
along one axis than the other, because the stock runs in a direction. So the
noise is stretched along that axis rather than isotropic. This is the machine
direction, and it is why a sheet tears cleanly one way and raggedly the other.

**Formation.** Hold a sheet up to a window and you see cloud: the fibre is not
spread evenly, and the patches are far larger than the fibres themselves.
Papermakers call it formation, or look-through, and it is what separates good
stock from newsprint.

**PaperGrain.** The micro-roughness that takes the ink, and the thing the effect is
named after. Too small to see as shape, so it shows only as a flicker in the
light, and only where the light is raking.

Which of those goes into the surface and which goes into the tone is the whole
shape of this effect rather than a detail of it. Only the fibre is surface: it
is differenced into a normal and lit. Formation is a density, so it changes how
much light comes back rather than which way the sheet faces, and it belongs in
the tone. The tooth is smaller than a pixel, so it is in neither, and it is
added to the light.

Get that wrong and no amount of tuning will save it. The first version of this
put both fields in the height, which is the obvious way to write it, and the
result was rough-cast plaster: the broad field contributed nothing, because a
broad field has almost no slope, and the fine fibre dominated the derivative.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="sheet" style="height: 100vh"></div>

<script type="module">
  import { createPaperGrain } from './beamish/effects/paper-grain/core.js'

  const sheet = createPaperGrain(document.querySelector('#sheet'))
  sheet.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createPaperGrain } from '@/beamish/effects/paper-grain/core'

export function Sheet() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sheet = createPaperGrain(host.current, { light: 0.14 })
    sheet.start()
    return () => sheet.destroy()
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
import { createPaperGrain } from '@/beamish/effects/paper-grain/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sheet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sheet = createPaperGrain(host.value)
  sheet.start()
})

onBeforeUnmount(() => sheet?.destroy())
</script>

<template>
  <div ref="host" class="sheet" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#f7f5ed` | any CSS hex | The stock. A warm white, because a true white sheet is a thing almost nobody prints on: it is bleached, it is colder than the ink wants, and on a screen it leaves the lighting nowhere to go above it. |
| `fibre` | color | `#fffdf6` | any CSS hex | What the sheet is tinted towards where the fibre lies thickest. Close to the stock on purpose. The difference between the two is doing the same job as the difference between two whites in a real sheet, which is to say it should be almost nothing. |
| `scale` | number | `340` | 40 to 600 (looks right between 240 and 460) | Fibres across the short side. Higher is a finer, harder sheet; lower is closer to a heavy rag paper, where the fibre is visible as fibre rather than as texture. |
| `direction` | number | `12` | -90 to 90 deg | The machine direction: the axis the fibre lies along, and the axis a sheet tears cleanly down. Slightly off square is better than square, for the same reason a halftone screen is set at an angle. |
| `stretch` | number | `3.4` | 1 to 8 (looks right between 2.5 and 5) | How far the fibre is drawn out along that axis. At 1 there is no direction at all, which is a handmade sheet, and handmade sheets read as felt rather than as paper. |
| `formation` | number | `0.55` | 0 to 1.5 | Strength of the cloud: the uneven spread of fibre you see when a sheet is held up to a window. Papermakers judge stock by it. It works on the tone rather than on the surface, because it is a density and not a shape. At 0 the sheet is perfectly even, which no sheet is. |
| `tooth` | number | `0.5` | 0 to 1.5 | The micro-roughness that takes the ink, which is what a printer means by the tooth of a paper. It is in the light rather than in the surface, so it fades as the light rises: that is not a shortcut, it is what grazing light does to a rough surface. |
| `light` | number | `0.18` | 0 to 1 (looks right between 0.08 and 0.35) | Height of the light. 0 rakes along the surface and 1 is straight down on it. Low, always: this is a flat sheet, and the only thing that can make a flat sheet interesting is light arriving across it rather than onto it. |
| `relief` | number | `0.6` | 0.05 to 2 | How strongly the surface is lit by its own slope. Past about 1.5 the sheet stops being paper and becomes hammered metal, which is a real effect and not this one. |
| `sweep` | number | `26` | 0 to 120 deg (looks right between 12 and 45) | Degrees the light swings over one period, and the only moving thing here. At 0 it is a still image, which is a perfectly good way to use this and the quietest thing in the library. |
| `shive` | number | `0.35` | 0 to 2 | Specks of fibre the beater did not break down. Papermakers call it shive, and it is the one thing here that is a mark rather than a surface. Sparse on purpose: a sheet with visible shive all over it is a sheet nobody bought. |
| `period` | number | `36` | 12 to 180 s | Seconds for one swing of the light and back. Long, because this sits behind something else and a backdrop has to survive being ignored. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createPaperGrain` from `useEffect`, `onMounted`, or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For this item that frame is a complete image: the paper does not move, only the
light does, so the still frame is the effect with its one moving part stopped.
That is the rare case where reduced motion costs the viewer nothing.

## 7. The three mistakes most likely to be made here

1. **Putting the cloud in the height.** It contributes almost nothing, because a
   broad field has almost no slope, and it leaves the fine fibre dominating the
   derivative. The sheet comes out as plaster. Formation is a density; it
   belongs in the tone.

2. **Isotropic noise.** Paper has a grain direction. Noise without one reads as
   felt, which is what handmade sheets actually look like and not what anybody
   means by paper.

3. **Raising `relief` to make it more visible.** The way to make paper more
   visible is to lower the light, not to deepen the surface. A sheet with deep
   relief is not a sheet.

4. **Animating the grain.** Grain that crawls is film grain. It is a different
   effect, it is far noisier, and it will make a page unreadable. Only the light
   moves here, and `sweep: 0` stops even that.

5. **Differencing the normal over a step smaller than a pixel.** It samples
   detail the screen cannot resolve and comes back as sparkle that changes when
   the canvas is resized. The step is one CSS pixel, and it is divided out so
   `relief` means the same thing at every size.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
