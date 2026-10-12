/*
 * HalftoneReveal: Beamish
 * https://beamish.ink/effects/halftone-reveal
 *
 * A picture arriving the way a printed one does.
 *
 * Not a fade and not a wipe. The image is screened into halftone cells and each
 * cell's dot grows from nothing to full, which is how a halftone carries tone in
 * the first place. Growing the dots is therefore the honest way to bring one in,
 * and it reads as a press coming up to pressure rather than as opacity being
 * turned up.
 *
 * The cells do not all start together. Each gets an order blended between where
 * it sits along the sweep direction and a hash of its coordinates, so `scatter`
 * runs from a clean directional sweep to a random dissolve.
 *
 * The picture comes from the host element's own <img> child rather than from an
 * option, so the alt text is whatever was written and a page with no JavaScript
 * still shows it.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

/** The queue the cells arrive in. */
export type HalftoneRevealOrder = 'sweep' | 'centre' | 'edges' | 'shadows' | 'highlights'

/** Dot shapes a press has actually used. */
export type HalftoneRevealShape = 'round' | 'square' | 'diamond'

const ORDERS: HalftoneRevealOrder[] = ['sweep', 'centre', 'edges', 'shadows', 'highlights']
const SHAPES: HalftoneRevealShape[] = ['round', 'square', 'diamond']

export type HalftoneRevealOptions = BaseOptions & {
  /** Shown wherever a dot has not grown yet. */
  paper: string
  /** Cell size in CSS pixels. Bigger cells are a coarser screen. */
  screen: number
  /** Screen angle in degrees. 45 is the one a printer would reach for. */
  angle: number
  /** Direction the reveal sweeps, in degrees. 0 runs left to right. */
  sweep: number
  /** 0 is a clean sweep, 1 is a random dissolve. The useful part is between. */
  scatter: number
  /** The queue the cells arrive in. */
  order: HalftoneRevealOrder
  /** The shape of the dot. All three are screens a press has actually used. */
  shape: HalftoneRevealShape
  /** How much of the reveal has cells part way through at any moment. */
  feather: number
  /** Paper tooth over the whole thing. */
  grain: number
  /** Milliseconds from blank paper to the finished picture. */
  duration: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const halftoneRevealDefaults: HalftoneRevealOptions = {
  paper: '#fbfaf4',
  screen: 14,
  angle: 45,
  sweep: 24,
  scatter: 0.55,
  order: 'sweep',
  shape: 'round',
  feather: 0.55,
  grain: 0.4,
  duration: 1800,
  reducedMotionTime: 999
}

// beamish:shader-begin shaders/halftone-reveal.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/halftone-reveal.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * HalftoneReveal: a picture arriving the way a printed one does.
 *
 * Not a fade and not a wipe. The image is screened into halftone cells, and each
 * cell's dot grows from nothing to full. That is how a halftone actually carries
 * tone, so growing the dots is the honest way to bring one in, and it looks like
 * a press coming up to pressure rather than like opacity being turned up.
 *
 * The cells do not all start together. Each one gets an order, and the order is
 * a blend between where the cell sits along the sweep direction and a hash of
 * its coordinates. At \`scatter\` 0 that is a clean directional sweep; at 1 it is
 * a random dissolve. Everything in between is the useful part.
 */

uniform sampler2D u_image;

uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform float u_dpr;
uniform vec3  u_paper;
uniform float u_progress;
uniform float u_screen;
uniform float u_angle;
uniform float u_sweep;
uniform float u_scatter;
uniform float u_order;
uniform float u_shape;
uniform float u_feather;
uniform float u_grain;

out vec4 fragColor;

const float DEG = 0.01745329252;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 rot(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
}

/* Cover fit, the CSS object-fit rule, in UV space. */
vec2 cover(vec2 uv, vec2 frame, vec2 image) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  return (uv - 0.5) * scale + 0.5;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 uv = cssPx / cssRes;

  vec2 sampled = cover(vec2(uv.x, 1.0 - uv.y), u_resolution, u_imageSize);
  vec3 ink = texture(u_image, sampled).rgb;

  /*
   * The screen is laid out in CSS pixels rather than in UV, so the dots stay
   * round and stay the same size when the element changes shape. A screen
   * defined in UV turns into ellipses the moment the box is not square.
   */
  vec2 screen = rot(cssPx, u_angle * DEG) / max(u_screen, 1.0);
  vec2 cell = floor(screen);

  /*
   * One pixel, measured in screen cells, for the edge of every dot. Taken out
   * here rather than inside the loop below: a derivative of a value that varies
   * between iterations is not something to rely on, and the figure is the same
   * for all nine cells anyway.
   */
  float aa = max(fwidth(screen.x), fwidth(screen.y)) * 0.75 + 0.001;

  float feather = max(u_feather, 0.001);
  vec2 dir = rot(vec2(1.0, 0.0), u_sweep * DEG);
  float coverage = 0.0;

  /*
   * Tone, for the two orders that arrive by density rather than by position.
   * Rec. 601 weights: a flat average makes a saturated blue as dark as a
   * saturated yellow and the eye says otherwise by a factor of six.
   *
   * Read at this pixel rather than at each cell's centre, which would be nine
   * more texture samples. The difference is sub-cell on a photograph and the
   * ordering is a soft field, so it costs nothing visible and saves the reads.
   */
  float tone = dot(ink, vec3(0.299, 0.587, 0.114));

  /*
   * The nine cells around this pixel, not just the one it sits in.
   *
   * A dot only stays a dot while it fits inside its own cell. Past a radius of
   * 0.5 a single-cell test clips the circle against the cell edges, so the dots
   * grow into rounded squares and then into plain squares, and the reveal ends
   * up looking like blocks rather than like a screen. Taking the union over the
   * neighbourhood instead lets them spill across the boundaries and merge into
   * each other, which is what ink does.
   */
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 c = cell + vec2(float(ox), float(oy));
      vec2 centre = c + 0.5;

      // Back out of the rotated screen to find where this cell sits in the
      // frame, which is what the sweep is measured along.
      vec2 cellPx = rot(centre * max(u_screen, 1.0), -u_angle * DEG);
      float along = dot(cellPx / cssRes - 0.5, dir) + 0.5;

      /*
       * Where this cell sits in the queue, 0 first and 1 last.
       *
       * 0 sweep: across the frame along \`sweep\`.
       * 1 centre: the middle first, working out.
       * 2 edges: the border first, closing in.
       * 3 shadows: the darks first, which is the order a press lays ink down
       *   in: the heavy areas are the ones that take it.
       * 4 highlights: the lights first, which reads as a picture emerging out
       *   of the paper rather than being printed onto it.
       */
      vec2 fromMiddle = cellPx / cssRes - 0.5;
      float radial = clamp(length(fromMiddle * vec2(1.0, cssRes.y / max(cssRes.x, 1.0))) * 2.0, 0.0, 1.0);

      float place = clamp(along, 0.0, 1.0);
      if (u_order > 0.5 && u_order < 1.5) place = radial;
      else if (u_order > 1.5 && u_order < 2.5) place = 1.0 - radial;
      else if (u_order > 2.5 && u_order < 3.5) place = tone;
      else if (u_order > 3.5) place = 1.0 - tone;

      float order = mix(place, hash12(c), u_scatter);

      /*
       * Scaled by 1 + feather so that at progress 1 every cell has finished,
       * however late its order. Without it the last cells are still growing
       * when the reveal is nominally over and the picture never quite arrives.
       */
      float local = clamp((u_progress * (1.0 + feather) - order) / feather, 0.0, 1.0);

      /*
       * The dot's shape, and the radius that fills a cell with it.
       *
       * These are real screens rather than decoration. A round dot is the
       * default everywhere. A square dot holds its shape into the shadows
       * instead of merging, which is why newspapers used it. A diamond is the
       * one that breaks up the jump at fifty percent, where round dots all
       * touch their neighbours at once and the midtone goes abruptly dark.
       *
       * Each needs a different radius to leave no paper behind: a circle has to
       * reach the corner at 0.707, a square fills at 0.5, and a diamond needs
       * 1.0 because its distance is measured along the axes.
       */
      vec2 q = screen - centre;
      float d;
      float fill;
      if (u_shape > 1.5) {
        d = abs(q.x) + abs(q.y);
        fill = 1.02;
      } else if (u_shape > 0.5) {
        d = max(abs(q.x), abs(q.y));
        fill = 0.52;
      } else {
        d = length(q);
        fill = 0.72;
      }

      float radius = local * fill;
      coverage = max(coverage, smoothstep(radius + aa, radius - aa, d));
    }
  }

  vec3 col = mix(u_paper, ink, coverage);

  float tooth = hash12(floor(cssPx * 0.5) + 11.0) - 0.5;
  col += tooth * 0.045 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_image',
  'u_resolution',
  'u_imageSize',
  'u_dpr',
  'u_paper',
  'u_progress',
  'u_screen',
  'u_angle',
  'u_sweep',
  'u_scatter',
  'u_order',
  'u_shape',
  'u_feather',
  'u_grain'
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
  if (!shader) throw new Error('HalftoneReveal: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`HalftoneReveal: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class HalftoneRevealSurface implements Surface<HalftoneRevealOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private texture: WebGLTexture | null = null
  private imageSize = { width: 1, height: 1 }
  private image: HTMLImageElement | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('HalftoneReveal needs a canvas')
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
    if (!gl) throw new Error('HalftoneReveal needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('HalftoneReveal: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`HalftoneReveal: program failed to link\n${log ?? ''}`)
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
    /*
     * CLAMP_TO_EDGE, not REPEAT. The warp samples well past the edge of the
     * image, and a repeating wrap would tile the opposite side of the picture
     * into the gap. The shader paints paper there instead, but the clamp is
     * what stops a mirrored seam appearing at the boundary itself.
     */
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

  render(t: number, opts: HalftoneRevealOptions): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)

    const loc = (name: UniformName) => this.locations.get(name) ?? null

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.uniform1i(loc('u_image'), 0)

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform2f(loc('u_imageSize'), this.imageSize.width, this.imageSize.height)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform3fv(loc('u_paper'), rgb(opts.paper))

    /*
     * Pure in `t`, which is what lets the recorder ask for any frame in any
     * order and what makes the replay button a matter of resetting the clock
     * rather than of restarting anything.
     *
     * Smoothstep, not ease-out. An ease-out spends most of its travel in the
     * first fifth of the time, which on a reveal means the picture is nearly
     * there before you have registered that anything started. This begins
     * gently, builds, and settles.
     */
    const seconds = Math.max(opts.duration, 1) / 1000
    const k = Math.min(Math.max(t / seconds, 0), 1)
    gl.uniform1f(loc('u_progress'), k * k * (3 - 2 * k))

    gl.uniform1f(loc('u_screen'), opts.screen)
    gl.uniform1f(loc('u_angle'), opts.angle)
    gl.uniform1f(loc('u_sweep'), opts.sweep)
    gl.uniform1f(loc('u_scatter'), opts.scatter)
    // Sent as an index. A shader has no strings, and a lookup here keeps the
    // option readable in the markup rather than making people remember a number.
    gl.uniform1f(loc('u_order'), Math.max(ORDERS.indexOf(opts.order), 0))
    gl.uniform1f(loc('u_shape'), Math.max(SHAPES.indexOf(opts.shape), 0))
    gl.uniform1f(loc('u_feather'), opts.feather)
    gl.uniform1f(loc('u_grain'), opts.grain)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.gl
  }

  teardown(): void {
    const gl = this.gl
    if (gl) {
      if (this.texture) gl.deleteTexture(this.texture)
      if (this.program) gl.deleteProgram(this.program)
      if (this.vao) gl.deleteVertexArray(this.vao)
    }
    // Put the markup back the way it was found. The effect borrowed it; it does
    // not own it.
    if (this.image) this.image.style.visibility = ''
    this.image = null
    this.texture = null
    this.gl = null
    this.program = null
    this.vao = null
    this.locations.clear()
  }
}

/**
 * Mount HalftoneReveal into `el`. The element needs a size and one `<img>`
 * child.
 *
 * ```html
 * <figure id="plate" style="position: relative; height: 60vh; margin: 0">
 *   <img src="/press.jpg" alt="What the picture shows" />
 * </figure>
 * ```
 *
 * ```ts
 * const reveal = createHalftoneReveal(document.querySelector('#plate')!)
 * reveal.start()
 * ```
 */
export function createHalftoneReveal(
  el: HTMLElement,
  opts: Partial<HalftoneRevealOptions> = {}
): EffectHandle {
  return mount<HalftoneRevealOptions>(el, opts, {
    defaults: halftoneRevealDefaults,
    create: () => new HalftoneRevealSurface()
  })
}

export default createHalftoneReveal
