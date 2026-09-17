/*
 * Spool: Beamish
 * https://beamish.ink/effects/scroll-slideshow
 *
 * A slideshow the page scroll runs, on a web that bows as it accelerates.
 *
 * A web press does not feed sheets, it feeds one continuous ribbon of paper off
 * a reel, and at speed that ribbon bows between the rollers. The faster it runs
 * the more it bows. When the press stops, the paper lies flat.
 *
 * At rest this draws an undistorted image and nothing else. That is the whole
 * design. The distortion is a function of scroll velocity, so a reader who has
 * stopped scrolling sees a photograph, not an effect. Most WebGL sliders warp
 * continuously and end up reading as a filter laid over the content; this one
 * only exists while it is being pulled.
 *
 * The images come from the host element's own <img> children rather than from
 * an option. Without JavaScript you get a plain list of pictures with real alt
 * text, and with it the canvas draws them instead. The originals stay in the
 * document, so what a screen reader gets is the markup you wrote.
 */

import { mount, type BaseOptions, type EffectHandle, type Scroll, type Surface } from '../../shared/runtime'

export type ScrollSlideshowOptions = BaseOptions & {
  /** Shown wherever the bow has pulled the image away from the frame edge. */
  paper: string
  /** How hard the sides lag behind the middle. This is the bow. */
  bend: number
  /** How far the whole web slides against the direction of travel. */
  slip: number
  /** Separation between the colour channels at the edges while moving. */
  fringe: number
  /** Paper tooth over the image. */
  grain: number
  /**
   * Scroll velocity that counts as full speed. Above it the effect stops
   * growing, so a trackpad flick does not tear the picture in half.
   */
  reference: number
  /** Fraction of each slide's travel spent crossing to the next. */
  crossfade: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const scrollSlideshowDefaults: ScrollSlideshowOptions = {
  paper: '#fbfaf4',
  bend: 0.09,
  slip: 0.018,
  fringe: 0.004,
  grain: 0.4,
  reference: 1.6,
  crossfade: 0.55,
  reducedMotionTime: 0
}

// beamish:shader-begin shaders/scroll-slideshow.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/scroll-slideshow.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * Spool: the paper web running through a press.
 *
 * A web press does not feed sheets, it feeds one continuous ribbon off a reel,
 * and at speed that ribbon bows between the rollers. The faster it runs the more
 * it bows, and when the press stops the paper lies flat again.
 *
 * That is the entire behaviour here. At rest this draws an undistorted image and
 * nothing else, which is the point: the distortion is a function of how fast you
 * are scrolling, so a reader who is not moving never sees an effect at all. Most
 * WebGL sliders warp all the time and read as a filter. This one only shows up
 * while it is being pulled.
 */

uniform sampler2D u_a;
uniform sampler2D u_b;

uniform vec2  u_resolution;
uniform vec2  u_sizeA;
uniform vec2  u_sizeB;
uniform vec3  u_paper;
uniform float u_blend;
uniform float u_velocity;
uniform float u_bend;
uniform float u_slip;
uniform float u_fringe;
uniform float u_grain;
uniform float u_seed;

out vec4 fragColor;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * Cover fit, the CSS object-fit rule, done in UV space. Without it every image
 * whose aspect ratio is not the canvas's is stretched, which is the single most
 * common thing wrong with a hand-rolled WebGL slider.
 */
vec2 cover(vec2 uv, vec2 frame, vec2 image) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  return (uv - 0.5) * scale + 0.5;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  // Textures arrive with their origin at the top left and GL samples from the
  // bottom, so this is flipped once here rather than on upload.
  uv.y = 1.0 - uv.y;

  /*
   * How far across the frame this pixel is, 0 in the middle and 1 at the left
   * and right edges. Squared, so the middle of the web stays nearly flat and
   * the bow is concentrated where the paper is unsupported.
   */
  float fromCentre = abs(uv.x * 2.0 - 1.0);
  float edge = fromCentre * fromCentre;

  // The sides lag behind the middle, which is what curves the top and bottom
  // edges. Displacing y by a function of x is the whole trick.
  float bow = u_velocity * u_bend * edge;

  // And the whole web slides a little against the direction of travel, the way
  // anything with mass does when it is pulled.
  float slip = u_velocity * u_slip;

  vec2 warped = vec2(uv.x, uv.y + bow + slip);

  /*
   * A press running colour work has one plate per ink, and if the web is moving
   * when they strike, the inks land a fraction apart. Sampling the channels at
   * slightly different offsets is the same error, and it is what makes fast
   * scrolling read as printing rather than as a blur filter.
   */
  float fringe = u_velocity * u_fringe * edge;

  vec2 aR = cover(warped + vec2(0.0, fringe), u_resolution, u_sizeA);
  vec2 aG = cover(warped, u_resolution, u_sizeA);
  vec2 aB = cover(warped - vec2(0.0, fringe), u_resolution, u_sizeA);

  vec2 bR = cover(warped + vec2(0.0, fringe), u_resolution, u_sizeB);
  vec2 bG = cover(warped, u_resolution, u_sizeB);
  vec2 bB = cover(warped - vec2(0.0, fringe), u_resolution, u_sizeB);

  vec3 a = vec3(texture(u_a, aR).r, texture(u_a, aG).g, texture(u_a, aB).b);
  vec3 b = vec3(texture(u_b, bR).r, texture(u_b, bG).g, texture(u_b, bB).b);

  vec3 col = mix(a, b, u_blend);

  /*
   * Outside the cover rectangle there is no image, only clamped edge pixels
   * smeared into a streak. The bow pushes pixels past the top and bottom of the
   * frame, so this has to be paper rather than whatever the last row happened
   * to be.
   */
  vec2 bounds = step(vec2(0.0), aG) * step(aG, vec2(1.0));
  float inside = bounds.x * bounds.y;
  col = mix(u_paper, col, inside);

  float tooth = hash12(floor(gl_FragCoord.xy * 0.5) + u_seed) - 0.5;
  col += tooth * 0.045 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_a',
  'u_b',
  'u_resolution',
  'u_sizeA',
  'u_sizeB',
  'u_paper',
  'u_blend',
  'u_velocity',
  'u_bend',
  'u_slip',
  'u_fringe',
  'u_grain',
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
  if (!shader) throw new Error('Spool: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Spool: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

type Slide = { texture: WebGLTexture; width: number; height: number }

class ScrollSlideshowSurface implements Surface<ScrollSlideshowOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private slides: Slide[] = []
  private images: HTMLImageElement[] = []
  private blank: WebGLTexture | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('Spool needs a canvas')
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
    if (!gl) throw new Error('Spool needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('Spool: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`Spool: program failed to link\n${log ?? ''}`)
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
     * One opaque pixel, bound wherever a real image has not arrived yet. A
     * sampler left unbound in WebGL2 reads as black, which would flash the
     * whole frame dark on the first paint of a slow connection.
     */
    const blank = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, blank)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([251, 250, 244, 255]))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    this.blank = blank

    this.collect(ctx.host)
  }

  /*
   * The images are the host's own children. They are hidden from sight but left
   * in the document, so the alt text and the source order are still whatever was
   * written, and a page with no JavaScript still shows the pictures.
   */
  private collect(host: HTMLElement): void {
    const found = [...host.querySelectorAll('img')]
    this.images = found
    for (const image of found) {
      image.style.visibility = 'hidden'
      if (image.complete && image.naturalWidth > 0) this.upload(image)
      else image.addEventListener('load', () => this.upload(image), { once: true })
    }
  }

  private upload(image: HTMLImageElement): void {
    const gl = this.gl
    if (!gl || image.naturalWidth === 0) return
    const index = this.images.indexOf(image)
    if (index < 0 || this.slides[index]) return

    const texture = gl.createTexture()
    if (!texture) return
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    /*
     * CLAMP_TO_EDGE, not REPEAT. The bow pushes samples past the edge of the
     * image, and a repeating wrap would tile the opposite side of the picture
     * into the gap. The shader paints paper over that region instead, but the
     * clamp is what stops it being a mirrored seam in the meantime.
     */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    this.slides[index] = { texture, width: image.naturalWidth, height: image.naturalHeight }
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
    this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight)
  }

  render(_t: number, opts: ScrollSlideshowOptions, _pointer: unknown, scroll: Scroll): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)

    const count = Math.max(this.images.length, 1)
    const loc = (name: UniformName) => this.locations.get(name) ?? null

    /*
     * Scroll position picks the slide, and the fraction between two of them is
     * the crossfade. `crossfade` decides how much of each slide's travel is
     * spent moving rather than sitting still, so a low value holds each picture
     * and cuts quickly, and 1 never stops dissolving.
     */
    const travel = scroll.progress * (count - 1)
    const index = Math.min(Math.floor(travel), Math.max(count - 2, 0))
    const within = count > 1 ? travel - index : 0
    const window = Math.min(Math.max(opts.crossfade, 0.01), 1)
    const raw = Math.min(Math.max((within - (1 - window)) / window, 0), 1)
    // Smoothstep, so a slide settles rather than arriving at a constant rate.
    const blend = raw * raw * (3 - 2 * raw)

    const a = this.slides[index] ?? null
    const b = this.slides[Math.min(index + 1, count - 1)] ?? null

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, a?.texture ?? this.blank)
    gl.uniform1i(loc('u_a'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, b?.texture ?? a?.texture ?? this.blank)
    gl.uniform1i(loc('u_b'), 1)

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform2f(loc('u_sizeA'), a?.width ?? 1, a?.height ?? 1)
    gl.uniform2f(loc('u_sizeB'), b?.width ?? a?.width ?? 1, b?.height ?? a?.height ?? 1)
    gl.uniform3fv(loc('u_paper'), rgb(opts.paper))
    gl.uniform1f(loc('u_blend'), blend)

    /*
     * Normalised and clipped. A trackpad can report a velocity an order of
     * magnitude past anything a mouse wheel produces, and without a ceiling the
     * picture tears in half the first time somebody flicks it.
     */
    const reference = Math.max(opts.reference, 0.001)
    const velocity = Math.max(-1, Math.min(1, scroll.velocity / reference))

    gl.uniform1f(loc('u_velocity'), velocity)
    gl.uniform1f(loc('u_bend'), opts.bend)
    gl.uniform1f(loc('u_slip'), opts.slip)
    gl.uniform1f(loc('u_fringe'), opts.fringe)
    gl.uniform1f(loc('u_grain'), opts.grain)
    // Fixed per slide rather than per frame: grain that crawls is a screen
    // artefact, grain that sits still is paper.
    gl.uniform1f(loc('u_seed'), index * 17.13)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.gl
  }

  teardown(): void {
    const gl = this.gl
    if (gl) {
      for (const slide of this.slides) if (slide) gl.deleteTexture(slide.texture)
      if (this.blank) gl.deleteTexture(this.blank)
      if (this.program) gl.deleteProgram(this.program)
      if (this.vao) gl.deleteVertexArray(this.vao)
    }
    // Put the markup back the way it was found. The effect borrowed these; it
    // does not own them.
    for (const image of this.images) image.style.visibility = ''
    this.slides = []
    this.images = []
    this.blank = null
    this.gl = null
    this.program = null
    this.vao = null
    this.locations.clear()
  }
}

/**
 * Mount Spool into `el`. The element needs a size, and it needs `<img>` children
 * to draw.
 *
 * ```html
 * <div id="reel" style="height: 100vh">
 *   <img src="/one.jpg" alt="…" />
 *   <img src="/two.jpg" alt="…" />
 * </div>
 * ```
 *
 * ```ts
 * const spool = createScrollSlideshow(document.querySelector('#reel')!)
 * spool.start()
 * // …later
 * spool.destroy()
 * ```
 */
export function createScrollSlideshow(el: HTMLElement, opts: Partial<ScrollSlideshowOptions> = {}): EffectHandle {
  return mount<ScrollSlideshowOptions>(el, opts, {
    defaults: scrollSlideshowDefaults,
    create: () => new ScrollSlideshowSurface()
  })
}

export default createScrollSlideshow
