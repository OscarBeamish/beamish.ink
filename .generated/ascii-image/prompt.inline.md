You are adding **AsciiImage** from Beamish to this project.

> A picture set in characters, where each cell takes the glyph whose shape fits the edge running through it rather than the one whose brightness matches. Surfaces · effect · MIT.
> https://beamish.ink/effects/ascii-image

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Every ASCII renderer ever written does the brightness version: order characters by how much ink they carry, measure the average tone of a cell, look up the glyph at that position. The fault is always the same. A cell sitting on a hard edge averages to a midtone, a midtone glyph is a texture rather than a line, and every contour in the picture turns to mush
- So each cell is measured twice. A Sobel pass gives the direction and strength of the edge through it, and where that edge is strong the cell takes a glyph lying along it, quantised to four angles. Only the cells with nothing much going on fall back to the ramp
- The glyph lies along the edge, which is the gradient turned a quarter: a gradient points across an edge, not along it. Getting that backwards gives a picture whose every contour is drawn at right angles to itself, and it looks like a weave
- The Sobel is taken over neighbouring cells rather than neighbouring pixels, because the question is about the picture at the scale of a cell. Measured at pixel scale a strand of hair fills the kernel and every cell comes back as an edge
- `glyphs` is the tone ramp only. The four directional characters are not an option because they are not a palette: each is there because it lies along one of four angles, and a different character in the same slot is a character pointing the wrong way
- The glyphs are drawn once into a texture atlas in the element's own monospace face, so the picture is set in the type the page is set in. They are rendered at 64px and minified, because a glyph rasterised straight into a 9px cell is four pixels of aliasing
- The 2D canvas that sets the type is used once and never drawn to again. It is not a second live rendering context
- Rec. 709 luma rather than a mean of the channels. A straight mean makes red and blue too light, which on a face is the difference between skin and a mask
- The picture arrives cell by cell in reading order with a little jitter, so the front is a ragged edge rather than a diagonal line. A teleprinter delivers a character at a time
- Recast for paper. The original is green on black, which is a terminal; this is ink on a sheet, which is what a teleprinter actually produced
- The <img> stays in the document, hidden. Its alt text is the accessible version of the picture and a page whose script never runs still shows the photograph
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/ascii-image/core.ts`**

```ts
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

## 2. What it is

AsciiImage sets a photograph in characters, where each cell takes the glyph
whose **shape** fits what is in it rather than the one whose brightness matches.

Every ASCII renderer ever written does the brightness version: order a set of
characters by how much ink they carry, measure the average tone of a cell, look
up the glyph at that position. It works, and it always has the same fault. Edges
come out as mush, because the average tone of a cell sitting on a hard edge is a
midtone, and a midtone glyph is a texture rather than a line. Set a face that
way and the jaw disappears.

So each cell here is measured twice. A Sobel pass gives the direction and
strength of whatever edge runs through it, and where that edge is strong enough
the cell takes a glyph that lies along it: a bar for a vertical edge, a slash
for a diagonal, an underscore for a horizontal. Only the cells with nothing much
going on fall back to the tone ramp.

The picture keeps its contours, which is the whole point.

Two details that are easy to get backwards:

**The glyph lies along the edge, not across it.** A gradient points across an
edge. Using the gradient angle directly gives a picture in which every contour
is drawn at right angles to itself, and it reads as a woven texture rather than
as a drawing.

**The Sobel is taken over neighbouring cells, not neighbouring pixels.** The
question is which way the edge in this cell runs, which is a question about the
picture at the scale of a cell. Measured at pixel scale, a strand of grass fills
the kernel and every cell in the frame comes back as an edge.

## 3. Wire it in

**Plain HTML.** The element must contain an `<img>`. It stays in the document,
hidden once the texture is uploaded, so a browser that never runs the script
shows the photograph and a screen reader still reads the alt text.

```html
<div id="plate" style="position: relative; height: 70vh">
  <img src="/plate.jpg" alt="A grass headland falling away to the sea" />
</div>

<script type="module">
  import { createAsciiImage } from './beamish/effects/ascii-image/core.js'

  const typed = createAsciiImage(document.querySelector('#plate'))
  typed.start()
</script>
```

Take the image out of the flow (`position: absolute; inset: 0`). Left in it, the
canvas the effect appends is pushed a full element height down the page, where it
draws perfectly and is never seen. That is worth saying because it looks like the
effect has failed rather than like a layout problem.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createAsciiImage } from '@/beamish/effects/ascii-image/core'

export function Plate({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const typed = createAsciiImage(host.current, { cell: 9 })
    typed.start()
    return () => typed.destroy()
  }, [src])

  return (
    <div ref={host} style={{ position: 'relative' }}>
      <img src={src} alt={alt} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createAsciiImage } from '@/beamish/effects/ascii-image/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let typed: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  typed = createAsciiImage(host.value)
  typed.start()
})

onBeforeUnmount(() => typed?.destroy())
</script>

<template>
  <div ref="host" class="plate">
    <img src="/plate.jpg" alt="A grass headland falling away to the sea" />
  </div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `cell` | number | `9` | 3 to 40 px (looks right between 6 and 14) | Size of one character cell. This is the resolution of the whole thing: at 6 it is a halftone made of letters and the subject is readable, at 20 it is a pattern and the subject is a rumour. Below about 5 the glyphs stop being distinguishable and the shape-aware half stops earning its keep. |
| `glyphs` | string | ` .,:;ox%#@` | any value | The tone ramp, lightest first, used only where no edge was found. Order it by how much ink each character carries rather than by anything else: this is the one place in the effect where brightness is the right question. The four directional characters are not here on purpose. |
| `paper` | color | `#fbfaf4` | any CSS hex | The sheet. Set this and the ink the other way round and you have the terminal version, which is what everybody else ships and what this was recast away from. |
| `ink` | color | `#26261f` | any CSS hex | The ink. A soft black rather than a true one: a teleprinter ribbon is never quite black and a page of hard black characters on warm paper reads as a screenshot. |
| `contrast` | number | `1.25` | 0.2 to 4 (looks right between 1 and 2) | How hard the tone is pushed away from the midtone before the ramp is read. A photograph with a narrow range gives a picture made of three characters, and this is what opens it out. It does not affect the edge detection at all. |
| `threshold` | number | `0.7` | 0.05 to 3 (looks right between 0.45 and 1) | Edge strength above which a cell takes a directional glyph instead of a tone one, on the scale a Sobel over luminance produces, which tops out near 5.6 for a black-to-white step. The single most important number here, and it was set by looking: at 0.17 almost every cell claims an edge and the picture is a weave of dashes with no tone in it, and by 1.2 only the hardest boundary in the frame still gets one, so the contours go back to mush and you have an ordinary ASCII renderer. 0.7 keeps the horizon, the cliff line and the edge of the fog while leaving the grass and the sea as tone. |
| `shapes` | boolean | `true` | `true` · `false` | Turn the shape-aware half off, leaving an ordinary brightness ramp. It is here to be turned off once, so the difference is a thing you have seen rather than a claim in a file. |
| `reveal` | number | `2600` | 100 to 20000 ms | Milliseconds for the picture to come in, cell by cell in reading order. A teleprinter is not fast, and the arrival is most of the pleasure: at 300 it is a fade, at 2600 it is something being printed. |
| `hold` | number | `200` | 0 to 5000 ms | Milliseconds of blank paper before it starts. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot arrival this should be a time after it has finished, so the whole picture is simply there. The picture is the point; the typing is how it gets in. |

## 5. Setting the threshold

`threshold` is the number that decides whether this is the effect or an ordinary
ASCII renderer, and it was set by looking at the result.

At **0.17**, almost every cell claims an edge. The picture becomes a weave of
dashes with no tone in it at all.

At **1.2**, only the hardest boundary in the frame still gets one. The contours
go back to mush and you have the brightness version with extra steps.

At **0.7**, the horizon, the cliff line and the edge of the fog all keep their
character while the grass and the sea stay as tone. That is the default.

The scale is whatever a Sobel over luminance produces, which tops out near 5.6
for a black-to-white step, so these are small numbers by design. If you change
`cell`, check it again: a larger cell averages more of the picture and the
strengths come down with it.

## 6. Choosing a picture

Pick one with long readable edges in it. A coastline, a building, a face in
profile. This effect is about contours, and a photograph of texture alone, a
field of gravel or a close-up of fur, has no contours to find: every cell falls
back to the ramp and you have proved nothing.

`shapes: false` turns the shape-aware half off and leaves a plain brightness
ramp. It is there so you can see the difference once, on your own photograph,
rather than take the claim on trust.

## 7. The type

The glyphs are drawn into a texture atlas in the element's own monospace face,
so the picture is set in the type the page is set in. They are rasterised at
64px and minified on the way down, because a glyph rendered straight into a 9px
cell is four pixels of aliasing.

`glyphs` is the **tone ramp only**, lightest first. The four directional
characters are not an option, because they are not a palette: each one is there
because it lies along one of four angles, and a different character in the same
slot is a character pointing the wrong way.

## 8. Accessibility. Do not skip this

The alt text on the `<img>` is the accessible version of the picture and it is
left exactly as written. Write it as you would for the photograph, because that
is what the reader is being told about.

A picture made of characters is not text, and no screen reader should be asked
to read it as text. There is nothing in the canvas for assistive technology, by
design.

## 9. Cleanup and SSR

`destroy()` releases the WebGL context and both textures, cancels the RAF,
disconnects both observers, removes every listener, and puts the image's
visibility back. One live context at a time is the budget, so call it.

The photograph renders on the server as an ordinary `<img>`, which is the whole
fallback: if the script never runs, the page shows the picture.

## 10. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is after the arrival has finished. The picture is simply there. The
picture is the point; the typing is only how it gets in.

## 11. The three mistakes most likely to be made here

1. **Using the gradient angle directly.** It points across the edge. The glyph
   has to lie along it, which is a quarter turn away, and the version without
   the turn looks like a woven cloth.

2. **Sobel at pixel scale.** Every cell comes back as an edge, because at pixel
   scale almost everything is one. The kernel has to step by a cell.

3. **A threshold set by taste rather than by looking.** It is the one number
   here with a narrow right answer, and both failures look plausible on their
   own: a weave of slashes, or an ordinary ASCII picture.

4. **Leaving the image in the flow.** The canvas lands an element height below
   it, draws correctly, and is never seen.

5. **A photograph with no contours.** Gravel, fur, foliage. Every cell falls
   back to the ramp, and the whole reason for the effect goes unused.

---

Concept credit: Choosing the glyph by the shape of the edge in a cell rather than by its average brightness, from a Codrops article on a shape-aware ASCII renderer, by Codrops, https://tympanus.net/codrops/.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
