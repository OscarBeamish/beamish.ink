/*
 * AsciiImage: Beamish
 * https://beamish.ink/effects/ascii-image
 *
 * A picture set in characters, where each cell picks the glyph whose shape fits
 * what is in it rather than the one whose brightness matches.
 *
 * Every ASCII renderer ever written does the brightness version: order a set of
 * characters by how much ink they carry, measure the average tone of a cell,
 * and look up the glyph at that position. It works, and the result always has
 * the same fault. Edges come out as mush, because the average tone of a cell
 * sitting on a hard edge is a midtone, and a midtone glyph is a texture rather
 * than a line. Type a face that way and the jaw disappears.
 *
 * So each cell here is measured twice. A Sobel pass gives the direction and
 * strength of whatever edge runs through it, and where that edge is strong
 * enough the cell takes a glyph that lies along it: a vertical bar for a
 * vertical edge, a slash for a diagonal, an underscore for a horizontal. Only
 * the cells with nothing much going on fall back to the tone ramp.
 *
 * Two consequences worth knowing about. The picture keeps its contours, which
 * is the whole point. And the glyph set stops being a list ordered by darkness
 * and becomes two sets with different jobs, which is why `glyphs` here is only
 * the ramp and the directional characters are not an option: they are chosen to
 * lie along four angles and substituting them is substituting the mechanism.
 *
 * The glyphs are drawn into a texture atlas once, in the page's own monospace
 * face, so the output is set in the type the page is set in rather than in
 * whatever the shader happens to be able to draw.
 *
 * Recast for paper. The original is green on black, which is a terminal; this
 * is ink on a sheet, which is what a teleprinter actually produced.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type AsciiImageOptions = BaseOptions & {
  /** Size of one character cell, in CSS pixels. */
  cell: number
  /** The tone ramp, lightest first. Only used where no edge was found. */
  glyphs: string
  /** The sheet. */
  paper: string
  /** The ink. */
  ink: string
  /** How hard the tone is pushed away from the midtone before it is read. */
  contrast: number
  /** Edge strength above which a cell takes a directional glyph instead. */
  threshold: number
  /** Turn the shape-aware half off, leaving an ordinary tone ramp. */
  shapes: boolean
  /** Milliseconds for the picture to come in, cell by cell. */
  reveal: number
  /** Milliseconds before it starts. */
  hold: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const asciiImageDefaults: AsciiImageOptions = {
  cell: 9,
  glyphs: ' .,:;ox%#@',
  paper: '#fbfaf4',
  ink: '#26261f',
  contrast: 1.25,
  threshold: 0.7,
  shapes: true,
  reveal: 2600,
  hold: 200,
  reducedMotionTime: 999
}

/*
 * The directional glyphs, in the order the shader indexes them: the edge angle
 * is quantised to four and used as an offset into these. They are not an option
 * because they are not a palette. Each one is here because it lies along one of
 * four angles, and a different character in the same slot is a character
 * pointing the wrong way.
 */
const DIRECTIONS = '_/|\\'

// beamish:shader-begin shaders/ascii-image.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/ascii-image.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * AsciiImage: a picture set in characters, each cell taking the glyph whose
 * shape fits what is in it.
 *
 * The usual renderer measures the average tone of a cell and looks up a glyph
 * ordered by how much ink it carries. The fault is always the same: a cell
 * sitting on a hard edge averages to a midtone, a midtone glyph is a texture
 * rather than a line, and every contour in the picture turns to mush.
 *
 * So each cell is measured twice. A Sobel pass over the cell's neighbourhood
 * gives the direction and strength of the edge running through it. Where that
 * edge is strong the cell takes a glyph lying along it, quantised to four
 * angles; where there is no edge it falls back to the ramp. The two measurements
 * answer different questions and only one of them is about brightness.
 */

uniform vec2  u_resolution;
uniform float u_dpr;

uniform sampler2D u_image;
uniform vec2  u_imageSize;
uniform sampler2D u_atlas;
/* How many glyphs the atlas holds, and how many of those are the tone ramp. */
uniform float u_atlasCount;
uniform float u_rampCount;

uniform vec3  u_paper;
uniform vec3  u_ink;
uniform float u_cell;
uniform float u_contrast;
uniform float u_threshold;
uniform float u_shapes;
uniform float u_progress;

out vec4 fragColor;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/* The image, covering the frame rather than stretching to it. */
vec2 cover(vec2 uv, vec2 frame, vec2 image) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  return (uv - 0.5) * scale + 0.5;
}

float tone(vec2 uv) {
  vec3 c = texture(u_image, clamp(uv, 0.0, 1.0)).rgb;
  // Rec. 709 luma. A straight mean of the channels makes red and blue too
  // light, and on a face that is the difference between skin and a mask.
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  float cell = max(u_cell, 2.0);
  vec2 cells = floor(cssRes / cell);
  vec2 id = floor(cssPx / cell);
  // Where in the cell this pixel is. The glyph is drawn into this square.
  vec2 within = fract(cssPx / cell);

  vec2 centre = (id + 0.5) * cell;
  vec2 uv = cover(centre / cssRes, cssRes, u_imageSize);
  uv.y = 1.0 - uv.y;

  /*
   * Sobel over the neighbouring cells rather than the neighbouring pixels. The
   * question is which way the edge in this cell runs, and that is a question
   * about the picture at the scale of a cell: measured at pixel scale, a strand
   * of hair fills the kernel and every cell comes back as an edge.
   */
  // Named for what it is, and not step, which is a builtin that name shadowed.
  vec2 reach = cell / cssRes;
  float tl = tone(uv + vec2(-reach.x,  reach.y));
  float tc = tone(uv + vec2(0.0,      reach.y));
  float tr = tone(uv + vec2( reach.x,  reach.y));
  float ml = tone(uv + vec2(-reach.x, 0.0));
  float mc = tone(uv);
  float mr = tone(uv + vec2( reach.x, 0.0));
  float bl = tone(uv + vec2(-reach.x, -reach.y));
  float bc = tone(uv + vec2(0.0,     -reach.y));
  float br = tone(uv + vec2( reach.x, -reach.y));

  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  float strength = length(vec2(gx, gy));

  float lit = clamp((mc - 0.5) * u_contrast + 0.5, 0.0, 1.0);

  /*
   * Which glyph. An edge gets a character lying along it, which is the gradient
   * turned a quarter: the gradient points across an edge, not along it, and
   * getting that backwards gives a picture whose every contour is drawn at
   * right angles to itself.
   */
  float index;
  if (u_shapes > 0.5 && strength > u_threshold) {
    float along = atan(gx, -gy);
    float quarter = floor(mod(along / 3.14159265 * 4.0 + 4.5, 4.0));
    index = u_rampCount + quarter;
  } else {
    // Darker is further along the ramp, and the ramp is written lightest first.
    float level = floor((1.0 - lit) * (u_rampCount - 0.001));
    index = clamp(level, 0.0, u_rampCount - 1.0);
  }

  /*
   * The picture comes in cell by cell, in reading order, with a little jitter so
   * the front is a ragged edge rather than a diagonal line. A teleprinter
   * arrives a character at a time and so does this.
   */
  /*
   * Rows counted from the top, because gl_FragCoord has its origin at the
   * bottom left and reading order does not. Without the flip the picture prints
   * upwards from the floor, which is not what any machine has ever done and is
   * invisible until you look at a frame from the middle of the run.
   */
  float row = cells.y - 1.0 - id.y;
  float order = (row * cells.x + id.x) / max(cells.x * cells.y, 1.0);
  float jitter = (hash12(id + 3.7) - 0.5) * 0.06;
  float arrived = step(order + jitter, u_progress);

  vec2 atlasUv = vec2((index + within.x) / max(u_atlasCount, 1.0), 1.0 - within.y);
  float glyph = texture(u_atlas, atlasUv).a * arrived;

  fragColor = vec4(mix(u_paper, u_ink, glyph), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_image',
  'u_imageSize',
  'u_atlas',
  'u_atlasCount',
  'u_rampCount',
  'u_paper',
  'u_ink',
  'u_cell',
  'u_contrast',
  'u_threshold',
  'u_shapes',
  'u_progress'
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
  if (!shader) throw new Error('AsciiImage: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`AsciiImage: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class AsciiImageSurface implements Surface<AsciiImageOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private texture: WebGLTexture | null = null
  private imageSize = { width: 1, height: 1 }
  private image: HTMLImageElement | null = null
  private atlas: WebGLTexture | null = null
  private atlasCount = 1
  private rampCount = 1
  private atlasFor = ''
  private face = 'monospace'

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('AsciiImage needs a canvas')
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
    if (!gl) throw new Error('AsciiImage needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('AsciiImage: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`AsciiImage: program failed to link\n${log ?? ''}`)
    }

    this.gl = gl
    this.program = program
    this.vao = gl.createVertexArray()
    this.locations.clear()
    for (const name of UNIFORMS) {
      this.locations.set(name, gl.getUniformLocation(program, name))
    }

    /*
     * The page's own monospace face, so the picture is set in the type the page
     * is set in. Falling back to the generic family rather than naming one, for
     * the same reason the text items inherit theirs.
     */
    const family = getComputedStyle(ctx.host).fontFamily
    this.face = family && family.length > 0 ? family : 'monospace'

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

  /*
   * The glyphs, drawn once into a strip and uploaded. A 2D canvas is the only
   * thing that can set type, and this is the one job it does here: it is never
   * drawn to again, and it is not a second live rendering context.
   */
  private buildAtlas(glyphs: string): void {
    const gl = this.gl
    if (!gl) return
    const ramp = Array.from(glyphs.length > 0 ? glyphs : asciiImageDefaults.glyphs)
    const all = [...ramp, ...Array.from(DIRECTIONS)]
    const key = all.join('') + '|' + this.face
    if (this.atlasFor === key) return
    this.atlasFor = key

    // Drawn far larger than a cell and minified on the way down, so the glyph
    // is still a glyph at 9 pixels rather than four pixels of aliasing.
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size * all.length
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${Math.round(size * 0.82)}px ${this.face}`
    all.forEach((glyph, i) => {
      ctx.fillText(glyph, i * size + size / 2, size * 0.54)
    })

    if (this.atlas) gl.deleteTexture(this.atlas)
    const texture = gl.createTexture()
    if (!texture) return
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    this.atlas = texture
    this.atlasCount = all.length
    this.rampCount = ramp.length
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
    this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight)
  }

  render(t: number, opts: AsciiImageOptions): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    if (this.image && !this.texture) this.upload(this.image)
    this.buildAtlas(opts.glyphs)

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)
    const loc = (name: UniformName) => this.locations.get(name) ?? null

    if (this.texture) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.texture)
      gl.uniform1i(loc('u_image'), 0)
    }
    if (this.atlas) {
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.atlas)
      gl.uniform1i(loc('u_atlas'), 1)
    }

    const reveal = Math.max(opts.reveal, 1) / 1000
    const hold = Math.max(opts.hold, 0) / 1000
    const progress = Math.max(0, Math.min((t - hold) / reveal, 1.2))

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform2f(loc('u_imageSize'), this.imageSize.width, this.imageSize.height)
    gl.uniform1f(loc('u_atlasCount'), this.atlasCount)
    gl.uniform1f(loc('u_rampCount'), this.rampCount)
    gl.uniform3fv(loc('u_paper'), rgb(opts.paper))
    gl.uniform3fv(loc('u_ink'), rgb(opts.ink))
    gl.uniform1f(loc('u_cell'), opts.cell)
    gl.uniform1f(loc('u_contrast'), opts.contrast)
    gl.uniform1f(loc('u_threshold'), opts.threshold)
    gl.uniform1f(loc('u_shapes'), opts.shapes ? 1 : 0)
    gl.uniform1f(loc('u_progress'), progress)

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
      if (this.atlas) gl.deleteTexture(this.atlas)
    }
    if (this.image) this.image.style.visibility = ''
    this.gl = null
    this.program = null
    this.vao = null
    this.texture = null
    this.atlas = null
    this.image = null
    this.atlasFor = ''
    this.locations.clear()
  }
}

/**
 * Mount AsciiImage into `el`. The element must contain an `<img>`, which stays
 * in the document: its alt text is the accessible version of the picture.
 *
 * ```ts
 * const typed = createAsciiImage(document.querySelector('#plate')!)
 * typed.start()
 * // …later
 * typed.destroy()
 * ```
 */
export function createAsciiImage(
  el: HTMLElement,
  opts: Partial<AsciiImageOptions> = {}
): EffectHandle {
  return mount<AsciiImageOptions>(el, opts, {
    defaults: asciiImageDefaults,
    create: () => new AsciiImageSurface()
  })
}

export default createAsciiImage
