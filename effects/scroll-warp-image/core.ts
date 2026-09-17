/*
 * ScrollWarpImage: Beamish
 * https://beamish.ink/effects/scroll-warp-image
 *
 * One picture, printed on something that is not flat, deforming as it travels
 * up the viewport.
 *
 * The distortion is driven by scroll position rather than by scroll speed,
 * which is the opposite choice to ScrollSlideshow and gives a completely
 * different feel. Speed-driven means nothing happens until the reader moves.
 * Position-driven means the picture is somewhere in a continuous deformation
 * the whole time it is on screen, and scrolling walks it through: pinched as it
 * comes up from the bottom, flat as it passes the middle, barrelled as it
 * leaves the top.
 *
 * The edges deform with everything else. This is not a rectangle with a warped
 * picture inside it. The warp is applied first and whatever falls outside the
 * source is paper, so the boundary of the sheet bends too. That is the part
 * that sells it, and it is why there is no geometry beyond one triangle: the
 * shape of the sheet is a by-product of the sampling rather than a mesh.
 *
 * The image comes from the host element's own <img> child rather than from an
 * option, so the alt text is whatever was written and a page with no
 * JavaScript still shows the picture.
 */

import { mount, type BaseOptions, type EffectHandle, type Scroll, type Surface } from '../../shared/runtime'

export type ScrollWarpImageOptions = BaseOptions & {
  /** Shown wherever the warp has pulled the sheet away from the frame. */
  paper: string
  /** Barrel one way through the travel, pinch the other. The main shape. */
  bulge: number
  /** Rotation that grows with radius, so the corners lead and the middle holds. */
  twist: number
  /** How much the sheet narrows across its width, as paper between rollers does. */
  squeeze: number
  /** Separation between the colour channels where the warp is strongest. */
  fringe: number
  /** How much heavier the ink lies where the sheet curves away. */
  vignette: number
  /** Paper tooth over the image. */
  grain: number
  /**
   * How much of the element's travel through the viewport the warp uses. 1 runs
   * the full range; lower holds the picture flat for longer in the middle.
   */
  range: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const scrollWarpImageDefaults: ScrollWarpImageOptions = {
  paper: '#fbfaf4',
  bulge: 0.34,
  twist: 0.13,
  squeeze: 0.06,
  fringe: 0.035,
  vignette: 0.16,
  grain: 0.4,
  range: 1,
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
 * ScrollWarpImage: one picture, printed on something that is not flat.
 *
 * The distortion here is driven by scroll position rather than by scroll speed,
 * which is the opposite choice to ScrollSlideshow and gives a completely
 * different feel. Speed-driven means nothing happens until you move. Position
 * driven means the picture is somewhere in a continuous deformation the whole
 * time it is on screen, and scrolling walks it through: pinched as it comes up
 * from the bottom, flat as it passes the middle of the viewport, barrelled as
 * it leaves the top.
 *
 * The edges deform with everything else. The image is not a rectangle with a
 * warped picture inside it; the warp is applied first and whatever falls
 * outside the source is paper, so the boundary itself bends. That is the part
 * that sells it, and it is why there is no geometry here beyond one triangle:
 * the shape of the sheet is a by-product of the sampling, not a mesh.
 */

uniform sampler2D u_image;

uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform vec3  u_paper;
uniform float u_travel;
uniform float u_velocity;
uniform float u_bulge;
uniform float u_twist;
uniform float u_squeeze;
uniform float u_fringe;
uniform float u_grain;
uniform float u_vignette;

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
 * The deformation, as a single function of a point and how far through its
 * travel the sheet is. Kept in one place because the colour fringe below has to
 * evaluate it three times at slightly different strengths, and two copies of
 * this that drifted apart would be a very annoying bug to find.
 */
vec2 deform(vec2 p, float amount) {
  float r2 = dot(p, p);

  /*
   * abs(), so the sheet barrels at both ends of its travel and is flat only as
   * it passes the middle. Signing this instead was the obvious reading of
   * "one way, then the other", and it wastes half the effect: a pinch samples
   * inside the picture, so it reads as a plain zoom and the edges stay a
   * rectangle. Expanding at both ends means the boundary bends coming and
   * going, and the direction of travel is carried by the twist below instead.
   */
  p *= 1.0 + abs(amount) * u_bulge * r2;

  /*
   * A twist that grows with radius, so the middle of the picture stays put and
   * the corners lead. Without it the barrel reads as a zoom, because a purely
   * radial scale is what a zoom is.
   */
  float angle = amount * u_twist * r2;
  float s = sin(angle);
  float c = cos(angle);
  p = mat2(c, -s, s, c) * p;

  // Paper pulled between two rollers narrows across its width.
  p.x *= 1.0 + amount * u_squeeze;

  return p;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  // Textures arrive with their origin at the top left and GL samples from the
  // bottom, so this is flipped once here rather than on upload.
  uv.y = 1.0 - uv.y;

  /*
   * -1 as the sheet comes up from the bottom of the viewport, 0 as it passes
   * the middle, +1 as it leaves the top. Everything below is signed by this, so
   * the deformation runs through flat rather than easing back out the way it
   * came.
   */
  float travel = u_travel * 2.0 - 1.0;

  // Speed adds a little on top of position, so a flick has some weight to it
  // without being the thing that drives the effect.
  float amount = travel + u_velocity * 0.35;

  vec2 p = uv - 0.5;

  /*
   * One plate per ink, and a sheet that is moving when they strike lands them a
   * fraction apart. Here the offset is in the deformation itself rather than in
   * the sampling position, so the channels separate most where the warp is
   * strongest, which is at the corners.
   */
  float spread = u_fringe * abs(amount);

  vec2 rp = deform(p, amount * (1.0 + spread)) + 0.5;
  vec2 gp = deform(p, amount) + 0.5;
  vec2 bp = deform(p, amount * (1.0 - spread)) + 0.5;

  vec2 rUv = cover(rp, u_resolution, u_imageSize);
  vec2 gUv = cover(gp, u_resolution, u_imageSize);
  vec2 bUv = cover(bp, u_resolution, u_imageSize);

  vec3 col = vec3(
    texture(u_image, rUv).r,
    texture(u_image, gUv).g,
    texture(u_image, bUv).b
  );

  /*
   * Anything the deformation pushed outside the source is paper. This is what
   * makes the edges of the sheet bend rather than just its contents: the
   * boundary is wherever the sampling ran out of picture.
   */
  vec2 inBounds = step(vec2(0.0), gUv) * step(gUv, vec2(1.0));
  float inside = inBounds.x * inBounds.y;

  // One pixel of softness on that boundary, so the bent edge is a cut rather
  // than a staircase.
  float aa = fwidth(gUv.x) + fwidth(gUv.y);
  float edge = smoothstep(0.0, aa * 1.5, min(min(gUv.x, 1.0 - gUv.x), min(gUv.y, 1.0 - gUv.y)));
  col = mix(u_paper, col, inside * edge);

  // Ink lies heavier where the sheet curves away. Radial, and signed with the
  // warp, so it arrives and leaves with it.
  float r = length(p) * 1.4;
  col *= 1.0 - u_vignette * r * r * abs(amount);

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
  'u_travel',
  'u_velocity',
  'u_bulge',
  'u_twist',
  'u_squeeze',
  'u_fringe',
  'u_grain',
  'u_vignette'
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
     * `range` compresses the travel around the midpoint, so a lower value holds
     * the picture flat for longer before it starts to go. Clamped afterwards,
     * because past the ends the sheet should sit at its extreme rather than
     * carry on deforming off the top of the page.
     */
    const range = Math.max(opts.range, 0.05)
    const centred = (scroll.progress - 0.5) / range + 0.5
    gl.uniform1f(loc('u_travel'), Math.min(Math.max(centred, 0), 1))

    // Capped hard. A trackpad reports velocities an order of magnitude past a
    // wheel, and without a ceiling a flick turns the picture inside out.
    gl.uniform1f(loc('u_velocity'), Math.max(-1, Math.min(1, scroll.velocity)))

    gl.uniform1f(loc('u_bulge'), opts.bulge)
    gl.uniform1f(loc('u_twist'), opts.twist)
    gl.uniform1f(loc('u_squeeze'), opts.squeeze)
    gl.uniform1f(loc('u_fringe'), opts.fringe)
    gl.uniform1f(loc('u_grain'), opts.grain)
    gl.uniform1f(loc('u_vignette'), opts.vignette)

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
