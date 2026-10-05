/*
 * RelightImage: Beamish
 * https://beamish.ink/effects/relight-image
 *
 * A lamp moved across a printed photograph.
 *
 * This does not relight the scene. There is no depth in a photograph and no
 * honest way to get one out of a single frame, so anything that claims to move
 * the sun around inside a picture is guessing. What this lights is the print:
 * the sheet the picture is on, which has relief wherever the impression is
 * heavy, and a raking light finds that relief the way a raking light finds any
 * other surface.
 *
 * Height is the picture's own luminance, so a shadow in the photograph is a
 * hollow in the sheet and a highlight stands proud. The normal is the gradient
 * of that height, taken across `smooth` pixels rather than one, because a
 * one-pixel difference is mostly sensor noise and compression blocks.
 *
 * The known failure of deriving relief from luminance is that lighting already
 * in the photograph becomes relief: a cast shadow across a wall turns into a
 * step in the paper. That is a limit worth knowing rather than a bug worth
 * fixing, and it is why the modelling is applied around the picture rather than
 * instead of it. The photograph stays the photograph. It catches the light.
 *
 * The picture comes from the host element's own <img> child rather than from an
 * option, so the alt text is whatever was written and a page whose script never
 * runs still shows the photograph.
 *
 * Nothing is integrated against the previous frame. The lamp is exactly where
 * the pointer is, so `renderAtTime` stays pure and a scripted path replays
 * identically.
 */

import { mount, type BaseOptions, type EffectHandle, type Pointer, type Surface } from '../../shared/runtime'

export type RelightImageOptions = BaseOptions & {
  /** Colour of the lamp. Warm, unless the room is not. */
  light: string
  /** How far above the sheet the lamp is held. Low is a raking light. */
  height: number
  /** How much relief the impression has. */
  relief: number
  /** Pixels either side the gradient is taken across. Low-passes the surface. */
  smooth: number
  /** How much modelling the lamp lays over the picture. */
  strength: number
  /** How much the ink catches the light that the paper does not. */
  gloss: number
  /** How tight that catch is. Higher is a harder, smaller glint. */
  shine: number
  /** How far the lamp throws. */
  reach: number
  /** Paper tooth over the whole thing. */
  grain: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const relightImageDefaults: RelightImageOptions = {
  light: '#fff3df',
  height: 0.32,
  relief: 7,
  smooth: 2,
  strength: 0.55,
  gloss: 0.3,
  shine: 26,
  reach: 0.75,
  grain: 0.25,
  reducedMotionTime: 0
}

// beamish:shader-begin shaders/relight-image.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/relight-image.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * RelightImage: a lamp moved across a printed photograph.
 *
 * This does not relight the scene. There is no depth here and there is no
 * honest way to get one out of a single photograph, so anything claiming to
 * move the sun around inside a picture is guessing. What it lights is the
 * print: the sheet the picture is on, which has relief wherever the impression
 * is heavy, and a raking light finds that relief exactly the way a raking light
 * finds any other surface.
 *
 * Height is the picture's own luminance, so a shadow in the photograph is a
 * hollow in the sheet and a highlight stands proud. The normal comes from the
 * gradient of that height, taken across \`smooth\` pixels rather than across one,
 * because a one-pixel difference is mostly sensor noise and JPEG blocks and
 * what you want is the shape of the impression rather than the texture of the
 * file.
 *
 * The known failure of deriving relief from luminance is that lighting already
 * in the photograph becomes relief: a cast shadow across a wall turns into a
 * step in the paper. That is a limit worth knowing rather than a bug worth
 * fixing, and it is the reason the modelling is applied *around* the picture
 * rather than replacing it. The photograph stays the photograph. It catches the
 * light.
 */

uniform sampler2D u_image;
uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform float u_dpr;
uniform vec2  u_pointer;
uniform float u_active;

uniform vec3  u_light;
uniform float u_height;
uniform float u_relief;
uniform float u_smooth;
uniform float u_strength;
uniform float u_gloss;
uniform float u_shine;
uniform float u_reach;
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

vec3 pick(vec2 cssPx, vec2 cssRes) {
  vec2 uv = cssPx / cssRes;
  return texture(u_image, cover(vec2(uv.x, 1.0 - uv.y), u_resolution, u_imageSize)).rgb;
}

/*
 * Height, which is the picture's own luminance. Rec. 601 weights rather than a
 * flat average: a flat average makes a saturated blue as tall as a saturated
 * yellow, and the eye says otherwise by a factor of six.
 */
float height(vec2 cssPx, vec2 cssRes) {
  return dot(pick(cssPx, cssRes), vec3(0.299, 0.587, 0.114));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 uv = cssPx / cssRes;

  vec3 base = pick(cssPx, cssRes);

  /*
   * The surface normal, from a central difference across \`smooth\` pixels either
   * side. Taking it across one pixel gives you the noise of the file; taking it
   * across several low-passes the height field on the way, which is the first
   * of the two blurs a normal-map generator would do and the one that matters.
   */
  float e = max(u_smooth, 0.5);
  float dx = height(cssPx + vec2(e, 0.0), cssRes) - height(cssPx - vec2(e, 0.0), cssRes);
  float dy = height(cssPx + vec2(0.0, e), cssRes) - height(cssPx - vec2(0.0, e), cssRes);
  vec3 normal = normalize(vec3(-dx * u_relief, -dy * u_relief, 1.0));

  /*
   * The lamp, in a space where the sheet is flat at z = 0 and x is stretched by
   * the aspect so the falloff stays circular on a frame that is not square.
   * \`height\` is how far above the paper it is held: low is a raking light that
   * finds every ridge, high is a lamp overhead that finds almost none.
   */
  float aspect = cssRes.x / max(cssRes.y, 1.0);
  vec3 lamp = vec3(u_pointer.x * aspect, 1.0 - u_pointer.y, max(u_height, 0.01));
  vec3 here = vec3(uv.x * aspect, uv.y, 0.0);

  vec3 toLamp = lamp - here;
  float dist = length(toLamp);
  vec3 L = toLamp / max(dist, 0.0001);

  float diffuse = max(dot(normal, L), 0.0);
  // Inverse square, softened by the +1 so the lamp does not blow out where it
  // is nearly touching the paper.
  float fall = 1.0 / (1.0 + pow(dist / max(u_reach, 0.01), 2.0));
  float lit = diffuse * fall;

  /*
   * Specular, with the viewer straight on, which is where a reader is. Ink has
   * a sheen that paper does not, so this is the part that says the dark areas
   * are ink rather than dark paper. Blinn's half vector: cheaper than a
   * reflection and better behaved at grazing angles, which is the whole case
   * being drawn here.
   */
  vec3 halfway = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(normal, halfway), 0.0), max(u_shine, 1.0)) * u_gloss * fall;

  /*
   * Modelling around the picture rather than instead of it. At \`lit\` of a half
   * the photograph is exactly itself, above that it lifts and below it falls,
   * so what the lamp adds is a gradient across the sheet and never a new
   * exposure. Multiplied, because light on a surface scales what is there.
   */
  float on = clamp(u_active, 0.0, 1.0);
  float model = 1.0 + on * u_strength * (lit - 0.5);
  vec3 col = base * model + u_light * spec * on;

  float tooth = hash12(floor(cssPx * 0.5) + 11.0) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_image',
  'u_resolution',
  'u_imageSize',
  'u_dpr',
  'u_pointer',
  'u_active',
  'u_light',
  'u_height',
  'u_relief',
  'u_smooth',
  'u_strength',
  'u_gloss',
  'u_shine',
  'u_reach',
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
  if (!shader) throw new Error('RelightImage: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`RelightImage: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class RelightImageSurface implements Surface<RelightImageOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private texture: WebGLTexture | null = null
  private imageSize = { width: 1, height: 1 }
  private image: HTMLImageElement | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('RelightImage needs a canvas')
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
    if (!gl) throw new Error('RelightImage needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('RelightImage: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`RelightImage: program failed to link\n${log ?? ''}`)
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
    /*
     * No mipmaps and a linear magnification filter. The glass samples the image
     * at well under one texel per pixel, which is the case mipmaps are no help
     * for, and a nearest filter would show the source image's own pixel grid
     * under magnification rather than the screen the effect is drawing.
     */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    this.texture = texture
    this.imageSize = { width: image.naturalWidth, height: image.naturalHeight }
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
    this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight)
  }

  render(_t: number, opts: RelightImageOptions, pointer: Pointer): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    // A late-decoding image still has to get in. Cheap: it returns at once once
    // the texture exists.
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
    gl.uniform2f(loc('u_imageSize'), this.imageSize.width, this.imageSize.height)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform2f(loc('u_pointer'), pointer.x, pointer.y)
    gl.uniform1f(loc('u_active'), pointer.active ? 1 : 0)
    gl.uniform3fv(loc('u_light'), rgb(opts.light))
    gl.uniform1f(loc('u_height'), opts.height)
    gl.uniform1f(loc('u_relief'), opts.relief)
    gl.uniform1f(loc('u_smooth'), opts.smooth)
    gl.uniform1f(loc('u_strength'), opts.strength)
    gl.uniform1f(loc('u_gloss'), opts.gloss)
    gl.uniform1f(loc('u_shine'), opts.shine)
    gl.uniform1f(loc('u_reach'), opts.reach)
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
    // The markup was borrowed, not owned.
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
 * Mount RelightImage into `el`. The element needs a size and one `<img>` child.
 *
 * ```html
 * <figure id="plate" style="position: relative; aspect-ratio: 3 / 2">
 *   <img src="/press.jpg" alt="What the picture shows" />
 * </figure>
 * ```
 *
 * ```ts
 * const lamp = createRelightImage(document.querySelector('#plate')!)
 * lamp.start()
 * ```
 */
export function createRelightImage(el: HTMLElement, opts: Partial<RelightImageOptions> = {}): EffectHandle {
  return mount<RelightImageOptions>(el, opts, {
    defaults: relightImageDefaults,
    create: () => new RelightImageSurface()
  })
}

export default createRelightImage
