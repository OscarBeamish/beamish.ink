/*
 * ScrollWarpImage: Beamish
 * https://beamish.ink/effects/scroll-warp-image
 *
 * One picture on a paper web that bows as it accelerates.
 *
 * The same press as ScrollSlideshow, and deliberately the same deformation:
 * the sides lag behind the middle, the whole sheet slips against the direction
 * of travel, and the inks land a fraction apart while it moves. At rest it lies
 * flat and there is no effect at all.
 *
 * What is different is that there is one picture and it never changes, so there
 * is no crossfade drawing the eye away from the edges, and the bow runs on both
 * axes rather than one. The slideshow curves the top and bottom, which is all
 * you see of a sheet that is being replaced. Here every edge bends, because the
 * sheet is the subject.
 *
 * The edges deform with the picture. The bow is applied first and whatever
 * falls outside the source is paper, so the boundary bends rather than staying
 * a rectangle. There is no geometry beyond one triangle: the shape of the sheet
 * is a by-product of the sampling.
 *
 * The image comes from the host element's own <img> child rather than from an
 * option, so the alt text is whatever was written and a page with no
 * JavaScript still shows the picture.
 */

import { mount, type BaseOptions, type EffectHandle, type Scroll, type Surface } from '../../shared/runtime'

export type ScrollWarpImageOptions = BaseOptions & {
  /** Shown wherever the warp has pulled the sheet away from the frame. */
  paper: string
  /** How hard the edges lag behind the middle. This is the bow. */
  bend: number
  /** How far the whole sheet slides against the direction of travel. */
  slip: number
  /** Separation between the colour channels while the sheet is moving. */
  fringe: number
  /** Paper tooth over the image. */
  grain: number
  /**
   * Scroll velocity that counts as full speed. Above it the effect stops
   * growing, so a trackpad flick does not tear the picture in half.
   */
  reference: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const scrollWarpImageDefaults: ScrollWarpImageOptions = {
  paper: '#fbfaf4',
  bend: 0.07,
  slip: 0.02,
  fringe: 0.005,
  grain: 0.4,
  reference: 1.6,
  reducedMotionTime: 0
}

// beamish:shader-begin shaders/scroll-warp-image.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/scroll-warp-image.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * ScrollWarpImage: one sheet on the web, bowing as it runs.
 *
 * The same press as ScrollSlideshow, and deliberately the same deformation: the
 * sides lag behind the middle, the whole sheet slips against the direction of
 * travel, and the inks land a fraction apart while it moves. At rest it lies
 * flat and there is no effect at all.
 *
 * What is different is that there is one picture and it never changes, so there
 * is no crossfade drawing the eye away from the edges, and the bow runs on both
 * axes rather than one. The slideshow curves the top and bottom because that is
 * all you can see of a sheet that is being replaced. Here every edge of the
 * sheet bends, because the sheet is the subject.
 */

uniform sampler2D u_image;

uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform vec3  u_paper;
uniform float u_velocity;
uniform float u_bend;
uniform float u_slip;
uniform float u_fringe;
uniform float u_grain;

out vec4 fragColor;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
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

/*
 * The deformation, in one place, because the colour fringe below evaluates it
 * three times at slightly different strengths and two copies that drifted apart
 * would be a miserable bug to find.
 */
vec2 bow(vec2 uv, float amount) {
  /*
   * How far across and down the frame this pixel is, 0 in the middle and 1 at
   * the edges. Squared, so the centre of the sheet stays nearly flat and the
   * bend is concentrated where the paper is unsupported.
   */
  vec2 fromCentre = abs(uv * 2.0 - 1.0);
  vec2 edge = fromCentre * fromCentre;

  /*
   * Each axis is displaced by how far the *other* axis is from the middle. That
   * cross-coupling is the whole trick: displacing y by a function of x is what
   * curves the top and bottom edges, and doing the same the other way round
   * curves the sides. Displacing each axis by its own distance would only
   * stretch the sheet, which reads as a zoom.
   */
  uv.y += amount * u_bend * edge.x;
  uv.x += amount * u_bend * edge.y * 0.65;

  // And the whole sheet slides a little against the direction of travel, the
  // way anything with mass does when it is pulled.
  uv.y += amount * u_slip;

  return uv;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  // Textures arrive with their origin at the top left and GL samples from the
  // bottom, so this is flipped once here rather than on upload.
  uv.y = 1.0 - uv.y;

  /*
   * A press running colour work strikes one plate per ink, and a web that is
   * moving when they hit lands them a fraction apart. Three evaluations of the
   * same bow at slightly different strengths is the same error, and it is what
   * makes a fast scroll read as printing rather than as a blur.
   */
  float spread = u_fringe * abs(u_velocity);

  vec2 rUv = cover(bow(uv, u_velocity * (1.0 + spread)), u_resolution, u_imageSize);
  vec2 gUv = cover(bow(uv, u_velocity), u_resolution, u_imageSize);
  vec2 bUv = cover(bow(uv, u_velocity * (1.0 - spread)), u_resolution, u_imageSize);

  vec3 col = vec3(
    texture(u_image, rUv).r,
    texture(u_image, gUv).g,
    texture(u_image, bUv).b
  );

  /*
   * Anything the bow pushed outside the source is paper. This is what makes the
   * edges of the sheet bend rather than only its contents: the boundary is
   * wherever the sampling ran out of picture.
   */
  vec2 inBounds = step(vec2(0.0), gUv) * step(gUv, vec2(1.0));
  float inside = inBounds.x * inBounds.y;

  // A pixel of softness on that boundary, so the bent edge is a cut rather than
  // a staircase.
  float aa = fwidth(gUv.x) + fwidth(gUv.y);
  float edge = smoothstep(0.0, aa * 1.5, min(min(gUv.x, 1.0 - gUv.x), min(gUv.y, 1.0 - gUv.y)));
  col = mix(u_paper, col, inside * edge);

  float tooth = hash12(floor(gl_FragCoord.xy * 0.5)) - 0.5;
  col += tooth * 0.045 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_image',
  'u_resolution',
  'u_imageSize',
  'u_paper',
  'u_velocity',
  'u_bend',
  'u_slip',
  'u_fringe',
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
  if (!shader) throw new Error('ScrollWarpImage: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`ScrollWarpImage: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class ScrollWarpImageSurface implements Surface<ScrollWarpImageOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private texture: WebGLTexture | null = null
  private imageSize = { width: 1, height: 1 }
  private image: HTMLImageElement | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('ScrollWarpImage needs a canvas')
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
    if (!gl) throw new Error('ScrollWarpImage needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('ScrollWarpImage: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`ScrollWarpImage: program failed to link\n${log ?? ''}`)
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

  render(_t: number, opts: ScrollWarpImageOptions, _pointer: unknown, scroll: Scroll): void {
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
    gl.uniform3fv(loc('u_paper'), rgb(opts.paper))

    /*
     * Normalised and clipped. A trackpad can report a velocity an order of
     * magnitude past anything a wheel produces, and without a ceiling the sheet
     * tears in half the first time somebody flicks it.
     */
    const reference = Math.max(opts.reference, 0.001)
    gl.uniform1f(loc('u_velocity'), Math.max(-1, Math.min(1, scroll.velocity / reference)))

    gl.uniform1f(loc('u_bend'), opts.bend)
    gl.uniform1f(loc('u_slip'), opts.slip)
    gl.uniform1f(loc('u_fringe'), opts.fringe)
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
 * Mount ScrollWarpImage into `el`. The element needs a size and one `<img>`
 * child.
 *
 * ```html
 * <figure id="plate" style="position: relative; height: 80vh">
 *   <img src="/facade.jpg" alt="What the picture shows" />
 * </figure>
 * ```
 *
 * ```ts
 * const warp = createScrollWarpImage(document.querySelector('#plate')!)
 * warp.start()
 * // …later
 * warp.destroy()
 * ```
 */
export function createScrollWarpImage(
  el: HTMLElement,
  opts: Partial<ScrollWarpImageOptions> = {}
): EffectHandle {
  return mount<ScrollWarpImageOptions>(el, opts, {
    defaults: scrollWarpImageDefaults,
    create: () => new ScrollWarpImageSurface()
  })
}

export default createScrollWarpImage
