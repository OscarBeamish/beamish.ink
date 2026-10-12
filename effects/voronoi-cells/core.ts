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
