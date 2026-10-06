/*
 * ScrollWarpImage: Beamish
 * https://beamish.ink/effects/scroll-warp-image
 *
 * A sheet dragged by the scroll.
 *
 * One arc across the width. The sheet is held at its sides, the span between
 * them trails behind the direction the page is travelling, and it settles flat
 * the moment the scroll stops. Scroll down and it is pulled down; scroll back
 * up and it hangs the other way. At rest there is no effect at all.
 *
 * The shape is the whole thing. A sheet pinned at its edges and heavy in the
 * middle is what hanging paper does and what the eye already knows, and half a
 * period of a sine is exactly that curve with nothing else in it. The version
 * before this one squared the distance from the centre instead, which pins the
 * middle and throws the sides about, and bent both axes at once: the inverted
 * sheet, reading as the frame wobbling rather than as the picture being pulled.
 *
 * The edges deform with the picture. The sheet is a rectangle inset from the
 * frame, the drag is applied to it and to its contents together, and whatever
 * falls outside is paper, so the boundary curves rather than staying square.
 * There is no geometry beyond one triangle: the shape of the sheet is a
 * by-product of the sampling.
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
  /** How far the sheet sits in from the frame, so the bent edge is not cut. */
  inset: number
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
  bend: 0.06,
  slip: 0.015,
  fringe: 0.005,
  grain: 0.4,
  inset: 0.1,
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
 * ScrollWarpImage: a sheet dragged by the scroll.
 *
 * One arc across the width. The sheet is held at its sides, the span between
 * them trails behind the direction the page is moving, and it settles flat the
 * moment the scroll stops. Scroll down and it is pulled down; scroll back up
 * and it hangs the other way.
 *
 * The shape is the whole effect, and it is the one thing worth getting right.
 * A sheet pinned at its edges and heavy in the middle is what a hanging sheet
 * does and what the eye already knows. Pinning the middle and throwing the
 * sides about is the same arithmetic inverted and reads as the frame wobbling
 * rather than as the picture being pulled, which is what this used to do.
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
uniform float u_inset;

out vec4 fragColor;

const float PI = 3.14159265359;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * Frame to sheet: 0 to 1 across a rectangle inset from every edge of the frame,
 * and outside that range where the paper is.
 *
 * The margin is what the bend happens in. Without it the bent edge runs off the
 * canvas and is chopped square, which reads as clipping rather than as paper.
 *
 * It is measured in the frame rather than in the picture, which is the fix for
 * the version before this one. That one widened the sampling window instead, so
 * the margin only appeared on the axis the cover fit was not already cropping:
 * a 3:2 photograph in a 16:9 frame came out with paper down the sides and the
 * sheet running edge to edge top and bottom, which is the one axis this effect
 * needs room on. Now the sheet is the same distance in on all four sides
 * whatever shape the picture is.
 */
vec2 sheet(vec2 uv) {
  return (uv - u_inset) / max(1.0 - 2.0 * u_inset, 0.001);
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
vec2 drag(vec2 uv, float amount) {
  /*
   * One arc across the width: zero at both sides, one in the middle. A whole
   * half period of a sine and no more, so there is a single smooth curve with
   * nothing in it to catch the eye, which is what separates this from a wave.
   *
   * Nothing is done to uv.x. Bending both axes at once was an attempt at a
   * sheet deforming in space and it only muddles the shape: the horizontal
   * bend has no edge to run along, so it reads as the picture breathing.
   */
  float arc = sin(uv.x * PI);

  /*
   * Down, when the scroll is going down. Velocity is positive as the page
   * travels up past you, and a sheet with any weight in it hangs back: it is
   * pulled down, and it comes back level the moment you stop.
   *
   * The bend is the arc and the slip is flat across the sheet, which is the
   * difference between paper giving in the middle and the whole sheet being
   * late. Both are wanted, and they are kept apart so either can be turned off.
   */
  uv.y -= amount * (u_bend * arc + u_slip);

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

  vec2 r = sheet(drag(uv, u_velocity * (1.0 + spread)));
  vec2 g = sheet(drag(uv, u_velocity));
  vec2 b = sheet(drag(uv, u_velocity * (1.0 - spread)));

  vec3 col = vec3(
    texture(u_image, cover(r, u_resolution, u_imageSize)).r,
    texture(u_image, cover(g, u_resolution, u_imageSize)).g,
    texture(u_image, cover(b, u_resolution, u_imageSize)).b
  );

  /*
   * Anything the drag pushed off the sheet is paper. This is what makes the
   * edges of the sheet bend rather than only its contents: the boundary is
   * carried through the same deformation as the picture inside it.
   */
  vec2 inBounds = step(vec2(0.0), g) * step(g, vec2(1.0));
  float inside = inBounds.x * inBounds.y;

  // A pixel of softness on that boundary, so the bent edge is a cut rather than
  // a staircase.
  float aa = fwidth(g.x) + fwidth(g.y);
  float edge = smoothstep(0.0, aa * 1.5, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)));
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
  'u_grain',
  'u_inset'
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
    gl.uniform1f(loc('u_inset'), opts.inset)

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
