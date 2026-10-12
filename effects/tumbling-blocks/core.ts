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
