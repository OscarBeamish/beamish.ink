/*
 * ImageMelt: Beamish
 * https://beamish.ink/effects/image-melt
 *
 * One picture bleeding through another, with a torn edge.
 *
 * The agency version of this is a hover: you point at a card and the first
 * image displaces into the second over about half a second. That cannot be
 * done here. Easing a hover toward a target is a running total, and
 * `renderAtTime(t)` has to answer for any moment on its own so the recorder
 * can seek.
 *
 * So the transition is driven by WHERE the cursor is rather than by how long
 * it has been there. The second picture bleeds out from under it. That is a
 * function of the pointer and the time, both of which the runtime replays
 * exactly, and it keeps the part that mattered: a torn, displaced edge between
 * two photographs rather than a crossfade.
 *
 * The idle state still moves. The noise that tears the edge drifts a whole
 * number of turns over the period, so a take with no cursor in it is a loop
 * rather than a still.
 *
 * Both pictures stay in the document, hidden, so the alt text and the
 * loading behaviour are whatever was written and a page whose script never
 * runs shows the first one.
 */

import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type Pointer,
  type Surface
} from '../../shared/runtime'

export type ImageMeltOptions = BaseOptions & {
  /** How far the second picture reaches from the cursor, 0 to 1 of the height. */
  radius: number
  /** How soft the boundary is. */
  feather: number
  /** How far the noise pushes the boundary about, and how hard the shear is. */
  displace: number
  /** How far the channels come apart at the seam. */
  fringe: number
  /** How big the torn shapes are. Higher is finer. */
  grain: number
  /** How far the tear wanders while nothing is happening. */
  drift: number
  /** Seconds for one turn of that wander. The idle loop closes on it. */
  period: number
}

export const imageMeltDefaults: ImageMeltOptions = {
  radius: 0.34,
  feather: 0.05,
  displace: 0.1,
  fringe: 0.35,
  grain: 5.5,
  drift: 0.5,
  period: 12,
  maxDpr: 2,
  reducedMotionTime: 0
}

// beamish:shader-begin shaders/image-melt.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/image-melt.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * ImageMelt: one picture bleeding through another, with a torn edge.
 *
 * The agency version of this is a hover: you point at a card and the first
 * image displaces into the second over about half a second. That cannot be
 * done here, because easing a hover toward a target is a running total and
 * \`renderAtTime(t)\` has to answer for any moment on its own.
 *
 * So the transition is driven by WHERE the cursor is rather than by how long
 * it has been there. The second picture bleeds out from under it. That is a
 * function of the pointer and the time, both of which the runtime can replay
 * exactly, and it keeps the thing that mattered about the original: a torn,
 * displaced edge between two photographs rather than a crossfade.
 *
 * WHAT MAKES THE EDGE READ AS A TEAR
 *
 *   The boundary is pushed about by noise before it is drawn, not blurred
 *   after. A soft edge is a crossfade with extra steps. An edge that wanders
 *   by a few per cent of the frame is something coming apart.
 *
 *   The two pictures move in opposite directions across it. One is pulled
 *   toward the tear and the other away, so the seam has shear across it and
 *   the eye reads two separate sheets rather than one dissolve.
 *
 *   The channels come apart at the boundary and nowhere else. A fringe over
 *   the whole frame is a broken monitor; a fringe that appears only where the
 *   picture is being torn is the tear doing it.
 */

uniform vec2      u_resolution;
uniform float     u_dpr;
uniform float     u_time;
uniform float     u_period;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform vec2      u_fromSize;
uniform vec2      u_toSize;
uniform vec2      u_pointer;
uniform float     u_active;

uniform float u_radius;
uniform float u_feather;
uniform float u_displace;
uniform float u_fringe;
uniform float u_grain;
uniform float u_drift;

out vec4 fragColor;

const float TAU = 6.283185307179586;

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
vec3 pick(sampler2D tex, vec2 uv) {
  return texture(tex, clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0)).rgb;
}

vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

/*
 * Smooth noise, from a hashed lattice with a cubic blend between the corners.
 * The blend matters: interpolate linearly and the tear has visible straight
 * creases running through it along the lattice.
 */
float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash22(cell).x;
  float b = hash22(cell + vec2(1.0, 0.0)).x;
  float c = hash22(cell + vec2(0.0, 1.0)).x;
  float d = hash22(cell + vec2(1.0, 1.0)).x;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/* Two octaves. One is too smooth to read as torn; three costs more than the
   difference is worth at this scale. */
float field(vec2 p) {
  return noise(p) * 0.65 + noise(p * 2.17 + 19.3) * 0.35;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 screen = cssPx / cssRes;

  float aspect = cssRes.x / max(cssRes.y, 1.0);

  /*
   * The noise drifts a whole number of turns over the period, so the idle
   * state loops and the recorder gets a clean take even with no cursor in it.
   */
  float turn = TAU * u_time / max(u_period, 0.001);
  vec2 wander = vec2(cos(turn), sin(turn)) * u_drift;

  float n = field(screen * u_grain * vec2(aspect, 1.0) + wander);

  /*
   * Distance from the cursor, measured with the aspect put back so the front
   * is a circle on screen rather than an ellipse. Squashed fronts are the
   * commonest giveaway that an effect is working in UV space without thinking
   * about it.
   */
  vec2 fromPointer = (screen - u_pointer) * vec2(aspect, 1.0);
  float dist = length(fromPointer);

  /*
   * The tear. The noise displaces the boundary itself rather than softening
   * it afterwards, which is the difference between something coming apart and
   * a crossfade with a blurry edge.
   */
  float edge = dist - u_radius + (n - 0.5) * u_displace;
  float mixTo = 1.0 - smoothstep(-u_feather, u_feather, edge);

  /* Nothing has been pointed at yet, so show the first picture whole. */
  mixTo *= u_active;

  /*
   * How close this pixel is to the seam, which is what the shear and the
   * colour fringing are scaled by. Both belong only at the boundary.
   *
   * Gated on \`active\` as well, which the first version forgot. The mix was
   * gated and the seam was not, so before the pointer had ever entered there
   * was no transition but there WAS shear and colour fringing: the untouched
   * frame came out as one picture with a rainbow smear torn across it and
   * nothing to explain it.
   */
  float seam = (1.0 - smoothstep(0.0, u_feather * 2.6, abs(edge))) * u_active;

  vec2 fromUv = cover(screen, cssRes, u_fromSize);
  vec2 toUv = cover(screen, cssRes, u_toSize);

  /*
   * The two pictures pulled in opposite directions across the seam. The shear
   * is what makes it read as two sheets rather than one picture fading.
   */
  vec2 shove = normalize(fromPointer + 1e-6) * seam * u_displace * 0.22;
  fromUv += shove;
  toUv -= shove * 0.6;

  /*
   * The channel split is a small fraction of the shear, not a multiple of it.
   *
   * Scaling it straight off the shove was the first version and it put twenty
   * pixels between the red and blue channels: the seam came out as a rainbow
   * smear across a third of the frame, and both pictures disappeared into it.
   * Chromatic aberration is a thing you notice without being able to point
   * at it. A few pixels is the whole budget.
   */
  vec2 split = shove * u_fringe * 0.1;

  vec3 from = vec3(
    pick(u_from, fromUv + split).r,
    pick(u_from, fromUv).g,
    pick(u_from, fromUv - split).b
  );
  vec3 to = vec3(
    pick(u_to, toUv + split).r,
    pick(u_to, toUv).g,
    pick(u_to, toUv - split).b
  );

  fragColor = vec4(mix(from, to, mixTo), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_from',
  'u_to',
  'u_fromSize',
  'u_toSize',
  'u_pointer',
  'u_active',
  'u_radius',
  'u_feather',
  'u_displace',
  'u_fringe',
  'u_grain',
  'u_drift'
] as const

type UniformName = (typeof UNIFORMS)[number]


function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('ImageMelt: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`ImageMelt: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class ImageMeltSurface implements Surface<ImageMeltOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  /*
   * Two of everything. The first <img> in the host is the one you start on
   * and the second is the one that bleeds through; if there is only one, it
   * is used for both and the effect tears a picture into itself, which is a
   * perfectly good thing to do and is what a single-image host gets.
   */
  private textures: (WebGLTexture | null)[] = [null, null]
  private sizes = [
    { width: 1, height: 1 },
    { width: 1, height: 1 }
  ]
  private images: (HTMLImageElement | null)[] = [null, null]

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('ImageMelt needs a canvas')
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
    if (!gl) throw new Error('ImageMelt needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('ImageMelt: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`ImageMelt: program failed to link\n${log ?? ''}`)
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
    const found = [...ctx.host.querySelectorAll('img')]
    for (let i = 0; i < 2; i++) {
      const image = found[i] ?? found[0] ?? null
      if (!image) continue
      this.images[i] = image
      image.style.visibility = 'hidden'
      const slot = i
      if (image.complete && image.naturalWidth > 0) this.upload(slot, image)
      else image.addEventListener('load', () => this.upload(slot, image), { once: true })
    }
  }

  private upload(slot: number, image: HTMLImageElement): void {
    const gl = this.gl
    if (!gl || this.textures[slot] || image.naturalWidth === 0) return
    const texture = gl.createTexture()
    if (!texture) return
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    this.textures[slot] = texture
    this.sizes[slot] = { width: image.naturalWidth, height: image.naturalHeight }
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
    this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight)
  }

  render(t: number, opts: ImageMeltOptions, pointer: Pointer): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    for (let i = 0; i < 2; i++) {
      const image = this.images[i]
      if (image && !this.textures[i]) this.upload(i, image)
    }

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)
    const loc = (name: UniformName) => this.locations.get(name) ?? null

    for (let i = 0; i < 2; i++) {
      const texture = this.textures[i]
      if (!texture) continue
      gl.activeTexture(i === 0 ? gl.TEXTURE0 : gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, texture)
    }
    gl.uniform1i(loc('u_from'), 0)
    gl.uniform1i(loc('u_to'), 1)

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform1f(loc('u_time'), t)
    gl.uniform1f(loc('u_period'), Math.max(opts.period, 0.001))
    gl.uniform2f(loc('u_fromSize'), this.sizes[0]!.width, this.sizes[0]!.height)
    gl.uniform2f(loc('u_toSize'), this.sizes[1]!.width, this.sizes[1]!.height)

    /* Y is flipped: the pointer is measured down the element the way a page
       is, and the shader works in gl_FragCoord's frame, which counts up. */
    gl.uniform2f(loc('u_pointer'), pointer.x, 1 - pointer.y)
    gl.uniform1f(loc('u_active'), pointer.active ? 1 : 0)

    gl.uniform1f(loc('u_radius'), Math.max(opts.radius, 0))
    gl.uniform1f(loc('u_feather'), Math.max(opts.feather, 0.001))
    gl.uniform1f(loc('u_displace'), opts.displace)
    gl.uniform1f(loc('u_fringe'), opts.fringe)
    gl.uniform1f(loc('u_grain'), Math.max(opts.grain, 0.1))
    gl.uniform1f(loc('u_drift'), opts.drift)

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
      for (const texture of this.textures) if (texture) gl.deleteTexture(texture)
    }
    for (const image of this.images) if (image) image.style.visibility = ''
    this.gl = null
    this.program = null
    this.vao = null
    this.textures = [null, null]
    this.images = [null, null]
    this.locations.clear()
  }
}

/**
 * Mount ImageMelt into `el`. The element must contain an `<img>`, which stays
 * in the document: its alt text is the accessible version of the picture.
 *
 * ```ts
 * const typed = createImageMelt(document.querySelector('#plate')!)
 * typed.start()
 * // …later
 * typed.destroy()
 * ```
 */
export function createImageMelt(
  el: HTMLElement,
  opts: Partial<ImageMeltOptions> = {}
): EffectHandle {
  return mount<ImageMeltOptions>(el, opts, {
    defaults: imageMeltDefaults,
    create: () => new ImageMeltSurface()
  })
}

export default createImageMelt
