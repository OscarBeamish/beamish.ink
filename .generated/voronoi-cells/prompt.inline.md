You are adding **VoronoiCells** from Beamish to this project.

> The plane divided by which scattered point is nearest, with the sites drifting so every border moves with them. Backdrops · effect · MIT.
> https://beamish.ink/effects/voronoi-cells

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Nine cells is the whole search. Each site is jittered inside its own lattice cell and capped so it can never leave, so the nearest site to a pixel is in that pixel cell or one of the eight around it: nine hashes and nine distances, no list, no sorting and no texture.
- The borders come from the second nearest site. Halfway between two sites the two distances are equal, so their difference goes to zero at the boundary, which is a usable distance to the edge for nothing. It is slightly wrong where three cells meet, by an amount nobody has noticed.
- The wobble radius is capped just under a half. A site that crosses into its neighbour cell breaks the assumption the three by three search rests on, and the field tears along the lattice.
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/voronoi-cells/core.ts`**

```ts
/*
 * VoronoiCells: Beamish
 * https://beamish.ink/effects/voronoi-cells
 *
 * The plane divided up by which scattered point is nearest.
 *
 * The boundaries are never drawn and never decided. They fall exactly halfway
 * between neighbouring sites, because halfway is where "closest" changes its
 * mind, so moving one site moves every edge it owns. That is the whole reason
 * this reads as a membrane under tension rather than as a pattern laid down.
 *
 * NINE CELLS IS ENOUGH
 *
 * Each site sits at a jittered position inside its own lattice cell and can
 * never leave it, so the nearest site to any pixel is in that pixel's cell or
 * one of the eight around it. The search is a fixed three by three: nine
 * hashes and nine distances, no list, no sorting and no texture.
 *
 * THE SECOND NEAREST IS WHERE THE EDGES COME FROM
 *
 * The distance to the nearest site says how far you are from a site, which is
 * no use: what is wanted is how far you are from a border. Halfway between two
 * sites the nearest and second nearest distances are equal, so the difference
 * between them goes to zero at the boundary, and that difference is a usable
 * distance to the edge for nothing. It is slightly wrong where three cells
 * meet, by an amount nobody has noticed.
 *
 * TWO THINGS THAT LOOK LIKE DETAILS AND ARE NOT
 *
 *   The wobble radius is capped under a half. A site that crosses into its
 *   neighbour's cell breaks the assumption the three by three rests on, and
 *   the field tears along the lattice.
 *
 *   The colour is keyed to the site's cell, not to where the site currently
 *   is. Key it to position and a cell shifts hue as it drifts, which reads as
 *   a fault in the rendering rather than as movement.
 *
 * The parameter set follows the one in the Shader Effects library, credited in
 * meta.json. The code is this repo's own.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type VoronoiCellsOptions = BaseOptions & {
  /** Cell colour at the near end of the ramp. */
  near: string
  /** Cell colour through the middle. The stop that stops it being a fade. */
  mid: string
  /** Cell colour at the far end. */
  far: string
  /** The borders between cells. */
  edge: string
  /** Cells across the short edge of the frame. */
  cells: number
  /** How far each site drifts from the middle of its own cell. */
  wobble: number
  /** Border width, in lattice units. 0 draws no borders at all. */
  thickness: number
  /** Softness of the border. 0 is as crisp as the pixels allow. */
  softness: number
  /** How much a cell darkens away from its own site. */
  depth: number
  /** Which cell takes which colour, and where every site sits. */
  seed: number
  /** Seconds for one circuit of the sites. The loop closes exactly on it. */
  period: number
}

export const voronoiCellsDefaults: VoronoiCellsOptions = {
  /*
   * Electric blue into magenta into a pale rose, on black borders. The first
   * two are the pair the library this came from picks, and they are the right
   * pair: blue and magenta are far enough apart in hue to separate every cell
   * from its neighbours without either of them reading as a highlight.
   */
  near: '#2440d8',
  mid: '#fc02dd',
  far: '#ffc2f0',
  edge: '#06040c',
  cells: 7,
  wobble: 0.34,
  thickness: 0.055,
  softness: 0.18,
  depth: 0.22,
  seed: 4,
  period: 24,
  maxDpr: 2
}

// beamish:shader-begin shaders/voronoi-cells.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/voronoi-cells.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * VoronoiCells: the plane divided up by which point is nearest.
 *
 * Scatter sites across the plane and give every pixel to whichever site is
 * closest. The boundaries are not drawn and are not decided: they fall exactly
 * halfway between neighbouring sites, because that is where "closest" changes
 * its mind. Move a site and every edge it owns moves with it, which is why
 * this reads as a membrane rather than as a pattern.
 *
 * HOW NINE CELLS IS ENOUGH
 *
 * A site lives at a jittered position inside its own lattice cell, so it can
 * never leave that cell. The nearest site to a pixel is therefore in the
 * pixel's own cell or one of the eight around it, and the search is a fixed
 * three by three. No list, no sorting, no texture: nine hashes and nine
 * distances, which is why this costs about as little as anything here.
 *
 * WHERE THE EDGES COME FROM
 *
 * The distance to the nearest site is no use on its own: it says how far you
 * are from a site, not how far you are from a border. The second nearest is
 * what gives the border away. Halfway between two sites the two distances are
 * equal, so their difference goes to zero, and that difference is a usable
 * distance to the edge for free. It is slightly wrong at the corners where
 * three cells meet, by an amount nobody has ever noticed.
 *
 * WHAT MOVES
 *
 * The sites, each on its own small circle, a whole number of turns over the
 * period so the field returns exactly. The colour is keyed to the site's
 * lattice cell rather than to where it currently is, which matters: key it to
 * position and a cell changes colour as it drifts, which reads as a fault.
 *
 * Pure in \`t\`. The frame comes from \`t\` alone and never from the frame before
 * it, so the recorder can seek.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_near;
uniform vec3  u_mid;
uniform vec3  u_far;
uniform vec3  u_edge;

uniform float u_cells;
uniform float u_wobble;
uniform float u_thickness;
uniform float u_softness;
uniform float u_depth;
uniform float u_seed;

out vec4 fragColor;

const float TAU = 6.283185307179586;

vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

/* Three stops rather than two. Between two colours a ramp gives one hue and a
   tint of it; passing through a third is what makes a field of flat cells read
   as lit from somewhere. */
vec3 ramp(float k) {
  k = clamp(k, 0.0, 1.0);
  return k < 0.5 ? mix(u_near, u_mid, k * 2.0) : mix(u_mid, u_far, (k - 0.5) * 2.0);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortEdge = max(min(cssRes.x, cssRes.y), 1.0);

  /* Measured against the short edge, so the cells stay the same size and
     square in any aspect. */
  vec2 lattice = (cssPx - cssRes * 0.5) / shortEdge * max(u_cells, 1.0);
  vec2 home = floor(lattice);
  vec2 local = fract(lattice);

  float turn = TAU * u_time / max(u_period, 0.001);

  float first = 8.0;
  float second = 8.0;
  vec2 winner = vec2(0.0);

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 step = vec2(float(i), float(j));
      vec2 cell = home + step;
      vec2 rnd = hash22(cell + u_seed);

      /*
       * The site, on a circle about the middle of its cell. The radius is
       * capped at just under a half so a site can never cross into its
       * neighbour's cell, which is the assumption the three by three search
       * rests on: break it and the nearest site can be two cells away and the
       * field tears along the lattice.
       */
      float a = turn + rnd.x * TAU;
      vec2 site = step + 0.5 + vec2(cos(a), sin(a)) * min(u_wobble, 0.49) * (0.4 + 0.6 * rnd.y);

      float d = length(site - local);
      if (d < first) {
        second = first;
        first = d;
        winner = cell;
      } else if (d < second) {
        second = d;
      }
    }
  }

  /*
   * The colour belongs to the cell, not to the distance. A cell is flat, which
   * is what makes the edges the subject; shading inside it would be a second
   * pattern competing with the first.
   */
  vec3 body = ramp(hash12(winner + u_seed + 11.0));

  /*
   * A little depth, from how far the pixel is from its own site. Just enough
   * that a large cell does not read as a flat sticker, and far too little to
   * be a gradient.
   */
  body *= 1.0 - u_depth * clamp(first, 0.0, 1.0);

  /*
   * The border, from the gap between the nearest two. One pixel of the lattice
   * measured with fwidth, so the line holds its weight at every cell count.
   */
  float px = fwidth(lattice.x);
  float gap = second - first;
  float halfWidth = max(u_thickness, 0.0);
  float soft = px + u_softness * max(halfWidth, px);
  float ink = 1.0 - smoothstep(max(halfWidth - soft, 0.0), halfWidth + soft, gap);

  fragColor = vec4(mix(body, u_edge, ink), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_near',
  'u_mid',
  'u_far',
  'u_edge',
  'u_cells',
  'u_wobble',
  'u_thickness',
  'u_softness',
  'u_depth',
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
  if (!shader) throw new Error('VoronoiCells: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`VoronoiCells: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class VoronoiCellsSurface implements Surface<VoronoiCellsOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('VoronoiCells needs a canvas')
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
    if (!gl) throw new Error('VoronoiCells needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('VoronoiCells: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`VoronoiCells: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: VoronoiCellsOptions): void {
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
    gl.uniform3fv(loc('u_near'), rgb(opts.near))
    gl.uniform3fv(loc('u_mid'), rgb(opts.mid))
    gl.uniform3fv(loc('u_far'), rgb(opts.far))
    gl.uniform3fv(loc('u_edge'), rgb(opts.edge))
    gl.uniform1f(loc('u_cells'), Math.max(2, opts.cells))
    gl.uniform1f(loc('u_wobble'), opts.wobble)
    gl.uniform1f(loc('u_thickness'), opts.thickness)
    gl.uniform1f(loc('u_softness'), opts.softness)
    gl.uniform1f(loc('u_depth'), opts.depth)
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
 * Mount VoronoiCells into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const maze = createVoronoiCells(document.querySelector('#hero')!)
 * maze.start()
 * // …later
 * maze.destroy()
 * ```
 */
export function createVoronoiCells(
  el: HTMLElement,
  opts: Partial<VoronoiCellsOptions> = {}
): EffectHandle {
  return mount<VoronoiCellsOptions>(el, opts, {
    defaults: voronoiCellsDefaults,
    create: () => new VoronoiCellsSurface()
  })
}

export default createVoronoiCells
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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `near` | color | `#2440d8` | any CSS hex | Cell colour at the near end of the ramp. |
| `mid` | color | `#fc02dd` | any CSS hex | Cell colour through the middle. Between two colours a ramp gives one hue and a tint of it; passing through a third is what makes a field of flat cells read as lit from somewhere. |
| `far` | color | `#ffc2f0` | any CSS hex | Cell colour at the far end. |
| `edge` | color | `#06040c` | any CSS hex | The borders between cells. Near-black with a little of the cell hue still in it, because a true black line across a saturated cell reads as a gap rather than as an edge. |
| `cells` | number | `7` | 2 to 30 (looks right between 5 and 12) | Cells across the short edge. Few and large reads as stained glass; past about twenty the borders are closer together than the cells are wide and it becomes a texture. |
| `wobble` | number | `0.34` | 0 to 0.49 (looks right between 0.2 and 0.42) | How far each site drifts from the middle of its own cell, in cell widths. Capped just under a half on purpose: a site that crosses into its neighbour cell breaks the nine-cell search and the field tears along the lattice. At 0 nothing moves, which costs nothing to draw and is a legitimate way to use it. |
| `thickness` | number | `0.055` | 0 to 0.3 (looks right between 0.02 and 0.1) | Border width, in lattice units. At 0 there are no borders and the cells are held apart by colour alone, which is quieter and entirely usable. |
| `softness` | number | `0.18` | 0 to 1 | Softness of the border, on top of the one pixel of antialiasing that is always there. A little helps more here than on a straight line, because a Voronoi border meets its neighbours at angles that are never the same twice. |
| `depth` | number | `0.22` | 0 to 0.6 (looks right between 0.1 and 0.35) | How much a cell darkens away from its own site. Just enough that a large cell does not read as a flat sticker; past about 0.4 it is a gradient competing with the borders for attention. |
| `seed` | number | `4` | 0 to 999 | Where every site sits and which cell takes which colour. Every value is a different field and none is better than another. |
| `period` | number | `24` | 6 to 90 s (looks right between 16 and 40) | Seconds for one circuit of the sites. The loop closes exactly on it, because each site completes a whole turn of its own small circle in that time. |

## 5. Nine cells is the whole search

Put each site at a jittered position **inside its own lattice cell**, and cap
the jitter so it can never leave. Then the nearest site to any pixel is in
that pixel's cell or one of the eight around it, and the search is a fixed
3x3: nine hashes and nine distances. No list, no sorting, no texture.

**The cap is load-bearing.** A site that crosses into its neighbour's cell
breaks the assumption the 3x3 rests on, the nearest site can be two cells
away, and the field tears along the lattice.

## 6. The second nearest is where the edges come from

Distance to the nearest site tells you how far you are from a *site*, which is
no use. What you want is how far you are from a *border*.

Halfway between two sites the nearest and second nearest distances are equal,
so `second - first` falls to zero at the boundary. That difference is a usable
distance to the edge for free. Stroke it with a `smoothstep` widened by one
pixel of the lattice, measured with `fwidth`.

It is slightly wrong where three cells meet, by an amount nobody has noticed.

## 7. Two things that look like details

**Key the colour to the cell, not to the position.** Key it to where the site
currently is and a cell shifts hue as it drifts, which reads as a fault in the
rendering rather than as movement.

**Keep each cell flat.** The edges are the subject, and shading inside a cell
is a second pattern competing with the first. A little darkening away from the
site stops a large cell reading as a sticker, and that is all it is for.

## 8. Animating it

Send each site round its own small circle, a whole number of turns over the
period, so the field returns exactly and `renderAtTime(t)` stays pure in `t`.

---

Concept credit: The parameter set and the pair of colours. Their Voronoi names two cell colours, a border, a scale, a seed and an edge intensity and softness, which is the right set, and the blue and magenta are theirs: far enough apart in hue to separate every cell from its neighbours without either reading as a highlight. The tessellation is Georgy Voronoy from 1908. The code here is this repo own., by Shader Effects Inc., https://github.com/shader-effects-inc/shaders.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
