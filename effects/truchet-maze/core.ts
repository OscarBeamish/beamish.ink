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
