You are adding **TumblingBlocks** from Beamish to this project.

> A rhombille tiling lit as stacked cubes, with the light going round rather than the geometry moving. Backdrops · effect · MIT.
> https://beamish.ink/effects/tumbling-blocks

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The three internal edges of a hexagon are rays from its centre, not lines through it. A line at one of those angles also passes through the opposite vertex, so measuring distance to lines draws six spokes and splits each rhombus into two triangles. Behind the ray the nearest point on it is the centre, so the distance there is the length.
- A hexagonal lattice is two rectangular lattices offset by half a cell, so the nearest centre is found by measuring against both and keeping the closer. No trigonometry and no loop.
- fwidth measures one pixel in lattice units, which keeps the line the same weight at every cell count and every rotation.
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/tumbling-blocks/core.ts`**

```ts
/*
 * TumblingBlocks: Beamish
 * https://beamish.ink/effects/tumbling-blocks
 *
 * A rhombille tiling, read as stacked cubes.
 *
 * Three rhombi fill a hexagon exactly. Shade each as a different face of a
 * cube and the hexagon stops being a hexagon: it becomes a cube seen
 * corner-on, and a plane of them becomes a wall of stacked blocks. Quilters
 * have called it tumbling blocks for two centuries, and the reversal comes
 * free with it: once the stack flips, you cannot see it the first way again.
 *
 * WHAT ACTUALLY MAKES THE ILLUSION
 *
 * Not the outline, and not the three-tone fill either. It is that the three
 * faces agree about where the light is, and that they go on agreeing across
 * the whole field: every top face the same, every left the same, every right
 * the same. That agreement is the only thing telling the eye these are
 * solids, so the per-cube variation here is in hue and never in shading. A
 * cube may be a different colour from its neighbour. It may not be lit
 * differently, and when an earlier version let it be, the wall collapsed into
 * a flat pattern of diamonds.
 *
 * WHAT MOVES
 *
 * The light goes round, once per period. Nothing in the geometry is a
 * function of time at all: the vertices never move, the faces simply brighten
 * and darken in sequence because their normals are a third of a turn apart,
 * and the stack appears to turn. It also means the loop closes exactly, since
 * a whole turn of the light is the same light.
 *
 * The tiling is a rhombille and the illusion is older than photography. The
 * parameter set follows the one in the Shader Effects library, credited in
 * meta.json. The code is this repo's own.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type TumblingBlocksOptions = BaseOptions & {
  /** The lighter cube colour, and where a cube starts from. */
  near: string
  /** The other cube colour, mixed in per cube so the wall is not one tone. */
  far: string
  /** The lattice lines between and across the cubes. */
  line: string
  /** Cubes across the short edge of the frame. */
  cells: number
  /** Rotation of the lattice in degrees. */
  rotation: number
  /** Line width, in lattice units. 0 draws no lines at all. */
  thickness: number
  /** Softness of the line edge. 0 is as crisp as the pixels allow. */
  softness: number
  /** How much the cube colour varies from cube to cube. */
  variation: number
  /** How far the three faces separate in tone. This is the whole illusion. */
  relief: number
  /** Which cubes take which colour. Changes nothing else. */
  seed: number
  /** Seconds for one turn of the light. The loop closes exactly on it. */
  period: number
}

export const tumblingBlocksDefaults: TumblingBlocksOptions = {
  /*
   * Violet into rose, which is the ramp the whole library leans on, with the
   * lattice lines in a near-black that has some of the violet still in it: a
   * true black line across a coloured face reads as a gap rather than as an
   * edge.
   */
  near: '#7c5cff',
  far: '#ff5c9d',
  line: '#0b0a18',
  cells: 7,
  rotation: 0,
  thickness: 0.04,
  softness: 0.05,
  variation: 0.28,
  relief: 0.85,
  seed: 5,
  period: 16,
  maxDpr: 2
}

// beamish:shader-begin shaders/tumbling-blocks.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/tumbling-blocks.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * TumblingBlocks: a rhombille tiling, read as stacked cubes.
 *
 * Three rhombi fill a hexagon exactly, and if each one is shaded as though it
 * were a different face of a cube the hexagon stops being a hexagon and
 * becomes a cube seen corner-on. Tile the plane with those and the eye reads a
 * wall of stacked blocks. It is the oldest optical illusion in quilting, where
 * it is called tumbling blocks, and the reversal, the moment the stack flips
 * and you cannot see it the first way again, is free.
 *
 * WHAT ACTUALLY MAKES THE ILLUSION
 *
 * Not the outline. The three faces have to be shaded as though one light were
 * falling across all of them, and the shading has to be CONSISTENT across the
 * whole field: every top face the same, every left face the same, every right
 * face the same. Vary it per cube and the illusion collapses into a flat
 * pattern of diamonds, because the only thing telling the eye these are solids
 * is that the lighting agrees everywhere.
 *
 * So the per-cube variation here is in hue and never in the shading. A cube
 * can be a different colour from its neighbour; it cannot be lit differently.
 *
 * WHAT MOVES
 *
 * The light goes round. One whole turn over the period, so the last frame is
 * the first frame, and because the three face normals are fixed the faces
 * brighten and darken in sequence rather than together: the stack appears to
 * turn without a single vertex moving. Nothing in the geometry is a function
 * of time at all.
 *
 * Pure in \`t\`. The frame comes from \`t\` alone, never from the frame before it,
 * so the recorder can seek.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_near;
uniform vec3  u_far;
uniform vec3  u_line;

uniform float u_cells;
uniform float u_rotation;
uniform float u_thickness;
uniform float u_softness;
uniform float u_variation;
uniform float u_relief;
uniform float u_seed;

out vec4 fragColor;

const float TAU = 6.283185307179586;
const float SQRT3 = 1.7320508075688772;

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

/*
 * Which hexagon a point is in, and where inside it.
 *
 * A hexagonal lattice is two rectangular lattices offset by half a cell, so
 * the cheap way to find the nearest centre is to measure against both and keep
 * whichever is closer. Returns the local offset in .xy and the hexagon's own
 * index in .zw, which is what the per-cube hash needs.
 */
vec4 hexCell(vec2 p) {
  vec2 s = vec2(1.0, SQRT3);
  vec4 centres = floor(vec4(p / s, (p - s * 0.5) / s)) + 0.5;
  vec4 offsets = vec4(p - centres.xy * s, p - (centres.zw + 0.5) * s);
  return dot(offsets.xy, offsets.xy) < dot(offsets.zw, offsets.zw)
    ? vec4(offsets.xy, centres.xy)
    : vec4(offsets.zw, centres.zw + 0.5);
}

/*
 * Distance to a ray from the origin, rather than to the line through it.
 *
 * This is the whole difference between three spokes and six. A hexagon's three
 * internal edges run from its centre to every other vertex, and a line through
 * the centre at one of those angles also passes through the opposite vertex,
 * so using lines draws the spokes twice and the rhombi come out as six
 * triangles. Behind the ray the nearest point on it is the origin, so the
 * distance there is just the length.
 */
float rayDistance(vec2 p, vec2 dir) {
  float along = dot(p, dir);
  return along > 0.0 ? abs(dot(p, vec2(-dir.y, dir.x))) : length(p);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortEdge = max(min(cssRes.x, cssRes.y), 1.0);

  /* Measured against the short edge so the blocks stay the same size and
     shape in any aspect, and rotated about the centre of the frame. */
  vec2 centred = (cssPx - cssRes * 0.5) / shortEdge;
  float a = radians(u_rotation);
  float cs = cos(a);
  float sn = sin(a);
  vec2 turned = vec2(centred.x * cs - centred.y * sn, centred.x * sn + centred.y * cs);
  vec2 lattice = turned * max(u_cells, 1.0);

  vec4 cell = hexCell(lattice);
  vec2 local = cell.xy;
  vec2 id = cell.zw;

  /*
   * Which of the three faces. The hexagon divides into three 120 degree
   * sectors, and the sector a point falls in is the face it belongs to. The
   * quarter turn offset puts the boundaries on the vertices rather than
   * through the middles of the rhombi.
   */
  float angle = atan(local.y, local.x);
  float sector = floor(mod((angle + TAU * 0.25) / TAU * 3.0, 3.0));

  /*
   * One light, falling the same way on every cube in the field. This is the
   * illusion: three faces agreeing about where the light is. The normals are
   * the sector centres, a third of a turn apart, and the light goes round once
   * per period.
   */
  /*
   * The face normal is the sector's OWN centre, which is not where the sector
   * numbering starts. The quarter turn above moves the boundaries onto the
   * vertices, which puts the three rhombi at minus thirty, ninety and two
   * hundred and ten degrees. Reusing the quarter turn here instead gave
   * ninety, two hundred and ten and three hundred and thirty: every face lit
   * as though it were the one next to it. Consistent, and consistently wrong,
   * which is the worst kind because the field still looks deliberate. It just
   * never resolves into cubes.
   */
  float faceAngle = -TAU / 12.0 + sector * TAU / 3.0;
  float lightAngle = TAU * u_time / max(u_period, 0.001);
  float lit = 0.5 + 0.5 * cos(faceAngle - lightAngle);
  /* Pulled towards the middle so no face goes fully black: a cube with an
     unlit face reads as a hole in the wall rather than as a solid. */
  /*
   * 0.8 rather than 0.5. At 0.5 the brightest face is only 1.74 times the
   * darkest at full relief, and a cube whose faces are that close together
   * does not read as a solid: real faces at right angles to each other
   * differ by nearer three to one. This takes the range to 3.1:1 and leaves
   * the darkest face well clear of black, because a face at black reads as a
   * hole in the wall rather than as a side turned away from the light.
   */
  float shade = mix(1.0 - u_relief * 0.8, 1.0, lit);

  /*
   * Hue varies per cube, shading never does. Vary the shading per cube and
   * the solids collapse into flat diamonds, because agreement about the light
   * is the only thing telling the eye they are solids at all.
   */
  float tone = hash21(id + u_seed) * clamp(u_variation, 0.0, 1.0);
  vec3 body = mix(u_near, u_far, tone) * shade;

  /*
   * The edges: the hexagon's own outline, plus the three internal spokes that
   * divide it into rhombi. The outline is shared with the neighbour, so
   * drawing it from both sides is what makes one continuous lattice.
   */
  float spokes = 1e9;
  for (int i = 0; i < 3; i++) {
    float t = TAU * 0.25 + (float(i) + 0.5) * TAU / 3.0;
    spokes = min(spokes, rayDistance(local, vec2(cos(t), sin(t))));
  }
  /* Hexagon edge: the half width is sqrt(3)/4 across the flats. */
  vec2 q = abs(local);
  float outline = abs(SQRT3 * 0.25 - max(q.x * 0.5 + q.y * SQRT3 * 0.25, q.x * 0.5));
  float edge = min(spokes, outline);

  float px = fwidth(lattice.x) * 0.5;
  float halfWidth = max(u_thickness, 0.0) * 0.5;
  float soft = px + u_softness * max(halfWidth, px);
  float ink = 1.0 - smoothstep(max(halfWidth - soft, 0.0), halfWidth + soft, edge);

  fragColor = vec4(mix(body, u_line, ink), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_near',
  'u_far',
  'u_line',
  'u_cells',
  'u_rotation',
  'u_thickness',
  'u_softness',
  'u_variation',
  'u_relief',
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
  if (!shader) throw new Error('TumblingBlocks: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`TumblingBlocks: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class TumblingBlocksSurface implements Surface<TumblingBlocksOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('TumblingBlocks needs a canvas')
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
    if (!gl) throw new Error('TumblingBlocks needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('TumblingBlocks: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`TumblingBlocks: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: TumblingBlocksOptions): void {
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
    gl.uniform3fv(loc('u_far'), rgb(opts.far))
    gl.uniform3fv(loc('u_line'), rgb(opts.line))
    gl.uniform1f(loc('u_cells'), Math.max(2, opts.cells))
    gl.uniform1f(loc('u_rotation'), opts.rotation)
    gl.uniform1f(loc('u_thickness'), opts.thickness)
    gl.uniform1f(loc('u_softness'), opts.softness)
    gl.uniform1f(loc('u_variation'), opts.variation)
    gl.uniform1f(loc('u_relief'), opts.relief)
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
 * Mount TumblingBlocks into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const maze = createTumblingBlocks(document.querySelector('#hero')!)
 * maze.start()
 * // …later
 * maze.destroy()
 * ```
 */
export function createTumblingBlocks(
  el: HTMLElement,
  opts: Partial<TumblingBlocksOptions> = {}
): EffectHandle {
  return mount<TumblingBlocksOptions>(el, opts, {
    defaults: tumblingBlocksDefaults,
    create: () => new TumblingBlocksSurface()
  })
}

export default createTumblingBlocks
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
| `near` | color | `#7c5cff` | any CSS hex | The lighter cube colour, and the one a cube starts from. |
| `far` | color | `#ff5c9d` | any CSS hex | The other cube colour, mixed in per cube so the wall is not one tone. The variation is in hue only: see `relief`. |
| `line` | color | `#0b0a18` | any CSS hex | The lattice lines, between cubes and across each one. A near-black with some of the cube hue still in it, because a true black line over a coloured face reads as a gap rather than as an edge. |
| `cells` | number | `7` | 2 to 24 (looks right between 5 and 12) | Cubes across the short edge. Few and large reads as architecture; past about fifteen the faces are too small to carry their own shading and the illusion goes with them. |
| `rotation` | number | `0` | 0 to 60 | Rotation of the lattice in degrees. Only sixty are worth having: a rhombille is unchanged by a third of a turn, and the three faces simply exchange roles. |
| `thickness` | number | `0.04` | 0 to 0.2 (looks right between 0.02 and 0.08) | Line width in lattice units. At 0 there are no lines and the cubes are held apart by their shading alone, which works and is quieter. |
| `softness` | number | `0.05` | 0 to 1 | Softness of the line edge, on top of the one pixel of antialiasing that is always there. |
| `variation` | number | `0.28` | 0 to 1 (looks right between 0.3 and 0.7) | How far the cube colour wanders from cube to cube. Kept low on purpose. The variation is in hue and the shading is identical on every cube, because agreement about where the light is coming from is the only thing telling the eye these are solids; push this up and a dark-hued cube's lit face ends up darker than a light-hued one's shadowed face, which is enough to flatten the whole wall into a pattern of diamonds. |
| `relief` | number | `0.85` | 0 to 1 (looks right between 0.6 and 1) | How far the three faces separate in tone. This is the illusion and almost nothing else is: at 0 the faces match, the solids flatten, and what is left is a pattern of diamonds. The shading is identical on every cube in the field on purpose, because agreement about where the light is coming from is the only thing telling the eye these are solids. |
| `seed` | number | `5` | 0 to 999 | Which cubes take which colour. Changes nothing else. |
| `period` | number | `16` | 6 to 60 s (looks right between 12 and 30) | Seconds for one turn of the light. The loop closes exactly on it, because a whole turn of the light is the same light. |

## 5. The one thing the illusion depends on

Not the outline, and not the three-tone fill. It is that the three faces
**agree about where the light is**, and go on agreeing across the whole
field: every top face the same, every left the same, every right the same.

That agreement is the only thing telling the eye these are solids. So vary
the **hue** per cube as much as you like and never vary the **shading**. An
earlier version of this varied both and the wall collapsed into a flat
pattern of diamonds — which is also the quickest way to see that the solidity
was never in the geometry.

## 6. Building it

1. **Find the hexagon.** A hexagonal lattice is two rectangular lattices
   offset by half a cell, so measure the point against both and keep whichever
   centre is nearer. No trigonometry, no loop. Keep the hexagon's index as
   well as the local offset — the per-cube hash needs it.
2. **Find the face.** The hexagon divides into three 120° sectors and the
   sector is the face. Offset by a quarter turn so the boundaries land on
   vertices rather than through the middle of a rhombus.
3. **Light it.** Give each face a normal at its sector centre, a third of a
   turn apart, and take `0.5 + 0.5·cos(face − light)`. Pull the result towards
   the middle so no face reaches black: an unlit face reads as a hole in the
   wall rather than as a solid.
4. **Draw the edges.** The hexagon outline, plus three internal spokes.

## 7. The trap in the spokes

The three internal edges are **rays from the centre, not lines through it**. A
line at one of those angles also passes through the opposite vertex, so
measuring distance to lines gives you six spokes and splits every rhombus into
two triangles. Measure to a ray: ahead of it, the perpendicular distance;
behind it, simply the distance to the centre.

## 8. Animating it

Turn the light, not the geometry. Nothing about the vertices is a function of
time; the faces brighten and darken in sequence because their normals are a
third of a turn apart, and the stack appears to rotate. One whole turn per
period closes the loop exactly, because a whole turn of the light is the same
light — and `renderAtTime(t)` stays pure in `t`.

---

Concept credit: The parameter set, and the choice of a rhombille tiling read as cubes. Their IsometricCubes names cells, thickness, rotation, softness and a per-cube colour variation, which is the right set. The tiling is a rhombille and the illusion is older than photography. The code here is this repo's own., by Shader Effects Inc., https://github.com/shader-effects-inc/shaders.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
