/*
 * PixelResolve: Beamish
 * https://beamish.ink/effects/pixel-resolve
 *
 * A picture arriving out of big blocks, the way one used to arrive over a slow
 * connection.
 *
 * The obvious version is to quantise the coordinate, sample once per block,
 * and step the block size down over time. It has two faults you can see at
 * once.
 *
 *   IT JUMPS. A block has to be a whole number of pixels or the blocks come
 *   out uneven, so stepping the size gives four or five visible lurches with
 *   nothing in between. Crossfading between two rungs of the ladder is what
 *   turns the steps into an arrival.
 *
 *   IT POINT SAMPLES. One pixel out of each block is not the block. Anything
 *   thinner than a block vanishes entirely at large sizes and pops back at
 *   small ones, which reads as the picture flickering rather than resolving.
 *   Averaging across the block is what a mipmap does, and it is what keeps a
 *   subject legible when it is eight pixels across.
 *
 * And the blocks do not all arrive together. Each has its own moment, hashed
 * from the block rather than taken from its position, so the picture lands in
 * patches. One that sharpens evenly reads as a lens being focused; one that
 * arrives in patches reads as data.
 *
 * ONE SHOT
 *
 * It resolves and then it stays resolved. `t` past the end is the end, and
 * nothing is stored between frames, so the recorder can seek.
 *
 * The picture comes from the first <img> in the host, which is left in the
 * document and only hidden, so the alt text and the loading behaviour stay
 * whatever was written and a page whose script never runs still shows it.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type PixelResolveOptions = BaseOptions & {
  /** The biggest a block gets, in CSS pixels. */
  coarse: number
  /** How many halvings between that and full resolution. */
  steps: number
  /** Seconds for the picture to arrive. */
  duration: number
  /** Seconds of blocks before it starts. */
  hold: number
  /** How much the blocks disagree about when their turn is. */
  scatter: number
  /** Samples across a block, squared. 1 is a point sample, 4 is a good average. */
  taps: number
  /** How few colours the early blocks are allowed. */
  levels: number
  /** What a block that has not arrived yet is. */
  ink: string
}

export const pixelResolveDefaults: PixelResolveOptions = {
  coarse: 64,
  steps: 5,
  duration: 2.6,
  hold: 0.25,
  scatter: 0.55,
  taps: 3,
  levels: 6,
  ink: '#0d0d12',
  maxDpr: 2,
  reducedMotionTime: 9
}

// beamish:shader-begin shaders/pixel-resolve.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/pixel-resolve.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * PixelResolve: a picture arriving out of big blocks, the way one used to
 * arrive over a slow connection.
 *
 * WHY IT IS NOT JUST A SHRINKING BLOCK SIZE
 *
 * Quantise the coordinate, sample once per block, step the block size down
 * over time: that is the obvious version and it has two faults you can see
 * immediately.
 *
 *   It jumps. The block size has to be a whole number of pixels or the blocks
 *   come out uneven, so stepping it gives four or five visible lurches and
 *   nothing in between. Crossfading between two block sizes is what turns the
 *   steps into an arrival.
 *
 *   It picks one pixel out of each block and calls it the block. That is a
 *   point sample, not an average, so thin bright things vanish entirely at
 *   large block sizes and then pop back. Averaging over the block is what
 *   keeps a picture legible when it is eight pixels across, and it is the
 *   whole reason a mipmap exists.
 *
 * THE BLOCKS DO NOT ALL ARRIVE AT ONCE
 *
 * A picture that sharpens uniformly reads as a lens being focused. One that
 * resolves in patches reads as data landing. Each block has its own moment,
 * from a hash of the block rather than from its position, so the order is
 * scattered rather than sweeping.
 *
 * Pure in \`t\`. The block a pixel belongs to, the moment it resolves and the
 * average inside it are all functions of the frame being asked for.
 */

uniform vec2      u_resolution;
uniform float     u_dpr;
uniform float     u_time;
uniform sampler2D u_image;
uniform vec2      u_imageSize;

uniform float u_coarse;
uniform float u_steps;
uniform float u_duration;
uniform float u_hold;
uniform float u_scatter;
uniform float u_taps;
uniform float u_levels;
uniform vec3  u_ink;

out vec4 fragColor;

/* The picture covering the frame rather than stretching to it. */
vec2 cover(vec2 uv, vec2 frame, vec2 image) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  return (uv - 0.5) * scale + 0.5;
}

/* A texture from an <img> arrives with its first row at the top; everything
   here is in gl_FragCoord's frame, where y counts up. */
vec3 pick(vec2 uv) {
  return texture(u_image, clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0)).rgb;
}

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

/*
 * The average colour of one block, taken as a grid of samples across it.
 *
 * Not the centre pixel. A point sample loses anything thinner than a block, so
 * a sign or a cable disappears at sixteen pixels and reappears at eight, which
 * reads as the picture flickering rather than resolving. The average is what a
 * mipmap would give and it is what keeps the subject readable when the blocks
 * are enormous.
 */
vec3 blockAverage(vec2 block, float size, vec2 cssRes, float taps) {
  vec3 total = vec3(0.0);
  float n = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      if (float(x) >= taps || float(y) >= taps) continue;
      vec2 at = (block + (vec2(float(x), float(y)) + 0.5) / taps) * size;
      vec2 uv = cover(at / cssRes, cssRes, u_imageSize);
      total += pick(uv);
      n += 1.0;
    }
  }
  return total / max(n, 1.0);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  /*
   * How far through the arrival, before any per-block scatter. One shot: it
   * resolves and then it stays resolved.
   */
  float run = clamp((u_time - u_hold) / max(u_duration, 0.001), 0.0, 1.0);

  /*
   * The ladder of block sizes, each a whole number of pixels and each half the
   * one before. \`where\` is a position on that ladder rather than a size, so
   * the crossfade below is between two rungs.
   */
  float rungs = max(u_steps, 1.0);
  float where = (1.0 - run) * rungs;

  float lower = floor(where);
  float blend = where - lower;

  /* Two block sizes to cross between, both whole pixels. */
  float sizeA = max(floor(u_coarse / pow(2.0, rungs - lower)), 1.0);
  float sizeB = max(floor(u_coarse / pow(2.0, rungs - lower - 1.0)), 1.0);

  float taps = clamp(floor(u_taps), 1.0, 4.0);

  vec2 blockA = floor(cssPx / sizeA);
  vec2 blockB = floor(cssPx / sizeB);

  /*
   * Each block gets its own moment, hashed from the block rather than taken
   * from its position, so the picture lands in patches instead of sweeping.
   * A picture that sharpens evenly reads as a lens being focused; one that
   * arrives in patches reads as data.
   */
  float jitterA = (hash12(blockA + 11.7) - 0.5) * u_scatter;
  float jitterB = (hash12(blockB + 11.7) - 0.5) * u_scatter;
  float mixAB = clamp(blend + jitterA * 0.5 + jitterB * 0.5, 0.0, 1.0);

  vec3 colour = mix(
    blockAverage(blockA, sizeA, cssRes, taps),
    blockAverage(blockB, sizeB, cssRes, taps),
    mixAB
  );

  /*
   * Fewer colours while the blocks are big, all of them by the end. A picture
   * arriving over a slow line lost its palette as well as its resolution, and
   * without this the big blocks are a smooth gradient, which no slow format
   * ever produced.
   */
  float levels = mix(u_levels, 255.0, run);
  if (levels < 254.0) {
    colour = floor(colour * levels + 0.5) / levels;
  }

  /*
   * What is not here yet. Blocks whose moment has not come are flat, so the
   * frame starts as a field of them and fills in.
   */
  float arrived = step(hash12(blockA + 3.1), run * (1.0 + u_scatter));
  colour = mix(u_ink, colour, clamp(arrived + run * run, 0.0, 1.0));

  fragColor = vec4(colour, 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_image',
  'u_imageSize',
  'u_coarse',
  'u_steps',
  'u_duration',
  'u_hold',
  'u_scatter',
  'u_taps',
  'u_levels',
  'u_ink'
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
  if (!shader) throw new Error('PixelResolve: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`PixelResolve: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class PixelResolveSurface implements Surface<PixelResolveOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private texture: WebGLTexture | null = null
  private imageSize = { width: 1, height: 1 }
  private image: HTMLImageElement | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('PixelResolve needs a canvas')
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
    if (!gl) throw new Error('PixelResolve needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('PixelResolve: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`PixelResolve: program failed to link\n${log ?? ''}`)
    }

    this.gl = gl
    this.program = program
    this.vao = gl.createVertexArray()
    this.locations.clear()
    for (const name of UNIFORMS) {
      this.locations.set(name, gl.getUniformLocation(program, name))
    }

    /*
     * The first <img> in the host, hidden from sight and left in the document.
     * The alt text and the loading behaviour stay whatever was written, and a
     * page whose script never runs still shows the picture.
     */
    const image = ctx.host.querySelector('img')
    if (image) {
      this.image = image
      image.style.visibility = 'hidden'
      if (image.complete && image.naturalWidth > 0) this.upload(image)
      else image.addEventListener('load', () => this.upload(image), { once: true })
    }
  }

  private upload(image: HTMLImageElement): void {
    const gl = this.gl
    if (!gl || this.texture || image.naturalWidth === 0) return
    const texture = gl.createTexture()
    if (!texture) return
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    this.texture = texture
    this.imageSize = { width: image.naturalWidth, height: image.naturalHeight }
  }


  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
    this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight)
  }

  render(t: number, opts: PixelResolveOptions): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    if (this.image && !this.texture) this.upload(this.image)

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)
    const loc = (name: UniformName) => this.locations.get(name) ?? null

    if (this.texture) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.texture)
      gl.uniform1i(loc('u_image'), 0)
    }

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform1f(loc('u_time'), t)
    gl.uniform2f(loc('u_imageSize'), this.imageSize.width, this.imageSize.height)
    gl.uniform1f(loc('u_coarse'), Math.max(opts.coarse, 1))
    gl.uniform1f(loc('u_steps'), Math.max(opts.steps, 1))
    gl.uniform1f(loc('u_duration'), Math.max(opts.duration, 0.01))
    gl.uniform1f(loc('u_hold'), Math.max(opts.hold, 0))
    gl.uniform1f(loc('u_scatter'), Math.max(opts.scatter, 0))
    gl.uniform1f(loc('u_taps'), Math.min(Math.max(opts.taps, 1), 4))
    gl.uniform1f(loc('u_levels'), Math.max(opts.levels, 2))
    gl.uniform3fv(loc('u_ink'), rgb(opts.ink))

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
      if (this.texture) gl.deleteTexture(this.texture)
    }
    if (this.image) this.image.style.visibility = ''
    this.gl = null
    this.program = null
    this.vao = null
    this.texture = null
    this.image = null
    this.locations.clear()
  }
}

/**
 * Mount PixelResolve into `el`. The element must contain an `<img>`, which stays
 * in the document: its alt text is the accessible version of the picture.
 *
 * ```ts
 * const typed = createPixelResolve(document.querySelector('#plate')!)
 * typed.start()
 * // …later
 * typed.destroy()
 * ```
 */
export function createPixelResolve(
  el: HTMLElement,
  opts: Partial<PixelResolveOptions> = {}
): EffectHandle {
  return mount<PixelResolveOptions>(el, opts, {
    defaults: pixelResolveDefaults,
    create: () => new PixelResolveSurface()
  })
}

export default createPixelResolve
