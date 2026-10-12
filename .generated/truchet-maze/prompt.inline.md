You are adding **TruchetMaze** from Beamish to this project.

> Quarter-circle tiles flipped at random in a square lattice, joining into one continuous maze that breathes along a diagonal. Backdrops · effect · MIT.
> https://beamish.ink/effects/truchet-maze

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The arcs are distance fields rather than drawn strokes. Distance to a circle is one length() and a subtraction, so a tile is two of those and a minimum, and the stroke is a band around the zero set. Line width is therefore a number rather than a resolution, and nothing aliases as the cells get small
- fwidth measures one pixel in lattice units, which is what keeps the edge the same softness at every cell count and every rotation. A constant would be a different number of pixels each time the lattice is scaled
- The tile hash is the multiply-and-stir kind rather than fract(sin(x) * 43758.0). The argument is a cell index that grows without bound as the lattice is rotated or the cell count raised, and the sine of a large number is a different value on a different driver
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/truchet-maze/core.ts`**

```ts
/*
 * TruchetMaze: Beamish
 * https://beamish.ink/effects/truchet-maze
 *
 * Quarter-circle tiles in a square lattice, flipped at random, joining into a
 * maze of continuous curves. The lattice is regular and nothing in the result
 * looks it, which is the whole trick and it is three hundred years old.
 *
 * WHY THE TILES NEVER RE-ROLL
 *
 * The obvious way to animate a Truchet tiling is to re-hash the tiles over
 * time so the maze rearranges. It looks wrong immediately: a tile that flips
 * cuts the curve it was part of into two ends, and the eye goes to the cut
 * rather than to the pattern. So the maze is fixed and the line weight
 * travels instead, as a wave running diagonally across the lattice. The
 * structure holds still and breathes.
 *
 * WHAT MAKES IT READ AS DRAWN RATHER THAN AS A PATTERN FILL
 *
 *   The arcs are distance fields. Line width is a number rather than a
 *   resolution, the edges are softened by exactly one pixel measured against
 *   the lattice with fwidth, and nothing aliases as the cells get small.
 *
 *   The colour runs across the frame, not per tile. Colouring each tile
 *   separately puts a hard edge on every cell boundary, which undoes the one
 *   thing the tiling exists to do: the joins have to be invisible. A ramp
 *   along a diagonal crosses the maze instead, so one curve changes colour as
 *   it travels.
 *
 *   The ramp has three stops. Between two colours you get one hue and a tint
 *   of it; passing through a third is what makes a ramp read as light.
 *
 * The technique is Truchet's, from 1704, and the quarter-circle variant is
 * everywhere. The parameter set here follows the one in the Shader Effects
 * library, which is credited in meta.json: cells, thickness, rotation,
 * softness and seed turned out to be the right five knobs and there was no
 * reason to invent different ones. The code is this repo's own.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type TruchetMazeOptions = BaseOptions & {
  /** The ground the maze is drawn on. */
  ground: string
  /** Line colour at the near end of the ramp. */
  near: string
  /** Line colour through the middle. The stop that stops it being a fade. */
  mid: string
  /** Line colour at the far end. */
  far: string
  /** Tiles across the short edge of the frame. */
  cells: number
  /** Line width, as a fraction of a cell. */
  thickness: number
  /** Rotation of the lattice in degrees. */
  rotation: number
  /** Softness of the line edge. 0 is as crisp as the pixels allow. */
  softness: number
  /** Which tiles are flipped. Changes the maze and nothing else. */
  seed: number
  /** How much the line weight swells and thins as the wave passes. */
  breathe: number
  /** Cells between one crest of the breathing wave and the next. */
  wave: number
  /** Direction of the colour ramp. 0 runs it up the frame, 1 across it. */
  tilt: number
  /** Seconds for one cycle. The loop closes exactly on it. */
  period: number
}

export const truchetMazeDefaults: TruchetMazeOptions = {
  /*
   * A near-black ground with a ramp that travels through hue rather than
   * between a colour and a tint of it. Violet into rose into amber is the
   * same move a sunset makes and it is why the thing reads as lit from
   * somewhere rather than filled in.
   */
  ground: '#0b0a18',
  near: '#6d2fd1',
  mid: '#e04b9e',
  far: '#ff9a4a',
  cells: 9,
  thickness: 0.17,
  rotation: 0,
  softness: 0.04,
  seed: 3,
  breathe: 0.42,
  wave: 7,
  tilt: 0.35,
  period: 12,
  maxDpr: 2
}

// beamish:shader-begin shaders/truchet-maze.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/truchet-maze.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * TruchetMaze: quarter-circle tiles that join into one continuous maze.
 *
 * A Truchet tiling is the oldest trick here by two centuries: fill a square
 * lattice with tiles carrying the same marking in one of a few orientations,
 * pick the orientation at random per tile, and the markings join across the
 * edges into something far less regular than the lattice underneath. This is
 * the quarter-circle variant. Each tile holds two arcs of radius half a cell,
 * centred on opposite corners, so every arc meets the cell edge at its
 * midpoint at a right angle. That is the whole reason it works: whichever way
 * the neighbour is flipped, its arc arrives at the same point on the shared
 * edge travelling the same way, so the curve carries on and the joins cannot
 * be seen.
 *
 * WHY THE LINES ARE NOT A TEXTURE
 *
 * The arcs are distance fields, not drawn strokes. Distance to a circle is one
 * length() and a subtraction, so the whole tile is two of those and a minimum,
 * and the stroke is a band around the zero set. That means the line width is a
 * number rather than a resolution, the edges are antialiased by measuring the
 * lattice against the pixel grid with fwidth, and nothing aliases when the
 * cells get small. Drawing this into a texture and scaling it would cost more
 * and look worse.
 *
 * WHAT MOVES
 *
 * Nothing about the maze. The tiles never re-roll, because a tile that flips
 * is a cut: the curve it was part of breaks in two and the eye goes straight
 * to it. What travels is the line weight, as a wave running diagonally across
 * the lattice, so the maze stays put and breathes. One whole cycle per period
 * and the phase advances with the cell index, which makes the last frame the
 * first frame and the loop joins with nothing to hide.
 *
 * Pure in \`t\`, like every other effect here: the frame is computed from \`t\`
 * alone, never from the frame before it, so the recorder can seek.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_near;
uniform vec3  u_mid;
uniform vec3  u_far;

uniform float u_cells;
uniform float u_thickness;
uniform float u_rotation;
uniform float u_softness;
uniform float u_seed;
uniform float u_breathe;
uniform float u_wave;
uniform float u_tilt;

out vec4 fragColor;

const float TAU = 6.283185307179586;

/*
 * Tile coordinate to a number in [0, 1). The multiply-and-stir kind rather
 * than fract(sin(x) * 43758.0): the argument here is a cell index that grows
 * without bound as the lattice is rotated or the cell count raised, and a sine
 * of a large number is a different value on a different driver.
 */
float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

/* Three stops rather than two. A line between one colour and another gives you
   one hue and a tint of it; travelling through a third is what makes a ramp
   read as light rather than as a fade. */
vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0);
  return t < 0.5
    ? mix(u_near, u_mid, t * 2.0)
    : mix(u_mid, u_far, (t - 0.5) * 2.0);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortEdge = max(min(cssRes.x, cssRes.y), 1.0);

  /*
   * Lattice space. Measured against the short edge rather than the height, so
   * the cells stay square and the same size in a 16:9 take and a 9:16 one, and
   * rotated about the centre of the frame so turning the lattice does not also
   * slide it.
   */
  vec2 centred = (cssPx - cssRes * 0.5) / shortEdge;
  float a = radians(u_rotation);
  float cs = cos(a);
  float sn = sin(a);
  vec2 turned = vec2(centred.x * cs - centred.y * sn, centred.x * sn + centred.y * cs);
  vec2 lattice = turned * max(u_cells, 1.0);

  vec2 cell = floor(lattice);
  vec2 local = fract(lattice);

  /*
   * Which diagonal this tile's pair of arcs runs along. One bit per tile is
   * the entire random content of a Truchet tiling, and it is enough.
   */
  float flip = step(0.5, hash21(cell + u_seed));
  float firstX = flip;
  float secondX = 1.0 - flip;

  /* Two quarter circles of radius half a cell, centred on opposite corners. */
  float d1 = abs(length(local - vec2(firstX, 0.0)) - 0.5);
  float d2 = abs(length(local - vec2(secondX, 1.0)) - 0.5);
  float dist = min(d1, d2);

  /*
   * The breathing wave. Its phase advances with time and retreats with the
   * cell's position along the diagonal, which is what makes it travel rather
   * than pulse in place. A whole number of cycles over the period, so t = 0
   * and t = period are the same frame.
   */
  float phase = TAU * u_time / max(u_period, 0.001)
              - (cell.x + cell.y) * TAU / max(u_wave, 1.0);
  /* halfWidth rather than half: \`half\` is a reserved word in GLSL ES even
     though nothing implements it, and the error it gives names the line
     after the one it is on. */
  float halfWidth = max(u_thickness, 0.001) * 0.5 * (1.0 + u_breathe * cos(phase));

  /*
   * One pixel, measured in lattice units. fwidth here rather than a constant,
   * because the lattice is scaled and rotated and a fixed number would be a
   * different number of pixels at every cell count.
   */
  float px = fwidth(lattice.x) * 0.5;
  float edge = px + u_softness * halfWidth;
  float ink = 1.0 - smoothstep(max(halfWidth - edge, 0.0), halfWidth + edge, dist);

  /*
   * Colour across the frame rather than per tile. Per tile would put a hard
   * edge at every cell boundary, which fights the one thing the tiling is for:
   * the joins should be invisible. A ramp along a diagonal crosses the maze
   * instead, so a single curve changes colour as it travels.
   */
  float along = clamp(turned.x * u_tilt + turned.y * (1.0 - u_tilt) + 0.5, 0.0, 1.0);
  vec3 line = ramp(along);

  fragColor = vec4(mix(u_ground, line, ink), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_ground',
  'u_near',
  'u_mid',
  'u_far',
  'u_cells',
  'u_thickness',
  'u_rotation',
  'u_softness',
  'u_seed',
  'u_breathe',
  'u_wave',
  'u_tilt'
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
  if (!shader) throw new Error('TruchetMaze: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`TruchetMaze: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class TruchetMazeSurface implements Surface<TruchetMazeOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('TruchetMaze needs a canvas')
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
    if (!gl) throw new Error('TruchetMaze needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('TruchetMaze: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`TruchetMaze: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: TruchetMazeOptions): void {
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
    gl.uniform3fv(loc('u_near'), rgb(opts.near))
    gl.uniform3fv(loc('u_mid'), rgb(opts.mid))
    gl.uniform3fv(loc('u_far'), rgb(opts.far))
    gl.uniform1f(loc('u_cells'), Math.max(2, opts.cells))
    gl.uniform1f(loc('u_thickness'), opts.thickness)
    gl.uniform1f(loc('u_rotation'), opts.rotation)
    gl.uniform1f(loc('u_softness'), opts.softness)
    gl.uniform1f(loc('u_seed'), opts.seed)
    gl.uniform1f(loc('u_breathe'), opts.breathe)
    /*
     * Rounded, and never below one. The wave's phase advances by a whole
     * fraction of a turn per cell, and a wavelength under a cell is a wave
     * nobody can see: it just makes neighbouring tiles disagree.
     */
    gl.uniform1f(loc('u_wave'), Math.max(1, Math.round(opts.wave)))
    gl.uniform1f(loc('u_tilt'), opts.tilt)

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
 * Mount TruchetMaze into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const maze = createTruchetMaze(document.querySelector('#hero')!)
 * maze.start()
 * // …later
 * maze.destroy()
 * ```
 */
export function createTruchetMaze(
  el: HTMLElement,
  opts: Partial<TruchetMazeOptions> = {}
): EffectHandle {
  return mount<TruchetMazeOptions>(el, opts, {
    defaults: truchetMazeDefaults,
    create: () => new TruchetMazeSurface()
  })
}

export default createTruchetMaze
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
| `ground` | color | `#0b0a18` | any CSS hex | The ground the maze is drawn on. Near-black with a trace of violet in it rather than a true black, so the darkest part of the ramp still has somewhere to go. |
| `near` | color | `#6d2fd1` | any CSS hex | Line colour at the near end of the ramp. |
| `mid` | color | `#e04b9e` | any CSS hex | Line colour through the middle. This is the stop that matters: between two colours you get one hue and a tint of it, and passing through a third is what makes a ramp read as light falling across something rather than as a fade. |
| `far` | color | `#ff9a4a` | any CSS hex | Line colour at the far end. |
| `cells` | number | `9` | 3 to 30 (looks right between 6 and 14) | Tiles across the short edge of the frame. Few and large reads as architecture; many and small reads as a textile, and past about twenty the curves are too short to follow and it becomes a texture rather than a maze. |
| `thickness` | number | `0.17` | 0.02 to 0.5 (looks right between 0.1 and 0.25) | Line width as a fraction of a cell, so it holds when the cell count changes. At 0.5 neighbouring arcs meet and the maze fills in solid, which is a different and also usable look. |
| `rotation` | number | `0` | 0 to 90 (looks right between 0 and 45) | Rotation of the lattice in degrees. Only ninety are worth having: a square lattice of symmetric tiles is unchanged by a quarter turn. |
| `softness` | number | `0.04` | 0 to 1 (looks right between 0 and 0.2) | Softness of the line edge, on top of the one pixel of antialiasing that is always there. At 0 the line is as crisp as the display allows; high values turn the maze into a glow of itself. |
| `seed` | number | `3` | 0 to 999 | Which tiles are flipped. Changes the maze and nothing else, and every value is as good as every other, which is the pleasant thing about a Truchet tiling. |
| `breathe` | number | `0.42` | 0 to 0.9 (looks right between 0.2 and 0.6) | How much the line weight swells and thins as the wave passes. At 0 the maze is a still image, which is a legitimate way to use this and costs nothing to draw. |
| `wave` | number | `7` | 2 to 24 (looks right between 5 and 12) | Cells between one crest of the breathing wave and the next. Short wavelengths make neighbouring tiles disagree and read as noise; long ones move the whole frame together and read as a tide. |
| `tilt` | number | `0.35` | 0 to 1 | Direction of the colour ramp. 0 runs it up the frame, 1 runs it across, and between the two it runs on a diagonal, which is where it crosses the most curves. |
| `period` | number | `12` | 6 to 60 s (looks right between 10 and 24) | Seconds for one cycle of the breathing wave. The loop closes exactly on it, because the phase advances a whole turn in that time. |

## 5. The one thing that makes it work

Each tile holds two arcs of radius half a cell, centred on opposite corners.
That radius is not a choice. It is the only one for which every arc meets the
cell edge **at its midpoint and at a right angle**, so whichever way the
neighbour is flipped, its arc arrives at the same point travelling the same
way. The curve carries on and the joins cannot be seen. Change the radius and
you get a lattice of disconnected scratches.

## 6. Building it

1. Map the pixel into lattice space: centre it, divide by the **short edge**
   so cells stay square in any aspect, rotate about the centre, multiply by
   `cells`. Split into `floor` (which tile) and `fract` (where in it).
2. Hash the tile index to one bit. That single bit is the entire random
   content of a Truchet tiling and it is enough.
3. Two arc distances, `abs(length(local - corner) - 0.5)`, and take the
   minimum. This is a distance field, so the line width is a number rather
   than a resolution.
4. Stroke it: `smoothstep` a band around zero, widened by one pixel measured
   with `fwidth` **in lattice units**. A constant here would be a different
   number of pixels at every cell count.

## 7. Animating it without breaking it

Do not re-roll the tiles. A tile that flips cuts the curve it was part of into
two ends and the eye goes straight to the cut.

Travel the **line weight** instead: a wave whose phase advances with time and
retreats with `cell.x + cell.y`, so it runs diagonally across a maze that
never moves. One whole cycle per period makes the last frame the first frame,
so the loop joins with nothing to hide, and keeps `renderAtTime(t)` pure in
`t`.

## 8. Colour

Run the ramp **across the frame**, not per tile. Per tile puts a hard edge on
every cell boundary, which undoes the one thing the tiling is for. Across the
frame, a single curve changes colour as it travels.

Use three stops. Between two colours you get one hue and a tint of it; passing
through a third is what makes a ramp read as light falling across something.

---

Concept credit: The parameter set: cells, thickness, rotation, softness and seed turned out to be the right five knobs for a quarter-circle Truchet tiling, and there was no reason to invent different ones. The tiling itself is Sebastien Truchet's, from 1704. The code here is this repo's own., by Shader Effects Inc., https://github.com/shader-effects-inc/shaders.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
