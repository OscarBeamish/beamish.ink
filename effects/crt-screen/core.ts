/*
 * CrtScreen: Beamish
 * https://beamish.ink/effects/crt-screen
 *
 * A picture shown on a tube rather than on a panel.
 *
 * Scanlines over a flat image read as an image with stripes on it. A cathode
 * ray tube is a short list of things that have to be there together, and most
 * of them are not the scanlines.
 *
 *   The glass is curved, so the picture bows and the corners pull in. Without
 *   this nothing else helps: a rectangle with stripes is a rectangle. The
 *   bezel is whatever falls outside the bent picture, which is why it is in
 *   the shader rather than in CSS.
 *
 *   The phosphors are in columns. A tube has an aperture grille, red green and
 *   blue side by side, which is why a white area on a photograph of a CRT is
 *   never white up close. The scanlines are the rows; the grille is the
 *   columns, and it is the columns that stop the rows reading as a blind.
 *
 *   The beam overshoots, so a bright area bleeds into its neighbours.
 *
 *   The channels do not land on each other, and the error grows towards the
 *   corners, because that is where the deflection is working hardest.
 *
 *   The tube is dim at the edges and a bar rolls down it.
 *
 * The roll is the only thing that moves, once per period, so the loop closes.
 * The scanlines and the grille are fixed to the glass: they are the screen
 * rather than the picture, and animating them turns the whole thing into a
 * pattern sliding over a photograph.
 *
 * The picture comes from the first <img> in the host, which is left in the
 * document and only hidden, so the alt text and the loading behaviour stay
 * whatever was written and a page whose script never runs still shows it.
 *
 * The parameter set follows the one in the Shader Effects library, credited in
 * meta.json. Theirs has no curvature, and curvature is the one that matters
 * most, so it is added here. The code is this repo's own.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type CrtScreenOptions = BaseOptions & {
  /** Whatever falls outside the curved glass. */
  bezel: string
  /** The cast of the tube. Phosphors are never neutral. */
  tint: string
  /** How much the glass bows the picture. */
  curve: number
  /** Width of one phosphor cell in device pixels. 0 turns the grille off. */
  grille: number
  /** How strongly the grille shows, from a tint to the macro view. */
  mask: number
  /** How dark the gaps between scanlines go. */
  scanline: number
  /** How many scanlines down the glass. */
  scanCount: number
  /** How far a bright area bleeds into its neighbours. */
  bloom: number
  /** How far the red and blue channels miss each other at the corners. */
  converge: number
  /** How dim the edges of the tube go. */
  vignette: number
  /** How strongly the rolling bar shows. 0 removes it. */
  roll: number
  /** Overall brightness, applied before the grille takes its share. */
  brightness: number
  /** Contrast, applied before the grille. */
  contrast: number
  /** Seconds for one pass of the bar. The loop closes exactly on it. */
  period: number
}

export const crtScreenDefaults: CrtScreenOptions = {
  bezel: '#07070a',
  /* Warm, because a phosphor is not neutral and a tube that renders white as
     white reads as a panel pretending. */
  tint: '#ffeedd',
  curve: 0.12,
  grille: 3,
  mask: 0.55,
  scanline: 0.38,
  scanCount: 200,
  bloom: 0.32,
  converge: 1.1,
  vignette: 0.5,
  roll: 0.1,
  brightness: 1.05,
  contrast: 0.12,
  period: 6,
  maxDpr: 2,
  reducedMotionTime: 1.5
}

// beamish:shader-begin shaders/crt-screen.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/crt-screen.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * CrtScreen: a picture shown on a tube rather than on a panel.
 *
 * A flat image with scanlines drawn over it reads as an image with stripes on
 * it. What makes something read as a cathode ray tube is a short list of
 * things that all have to be there together, and most of them are not the
 * scanlines:
 *
 *   THE GLASS IS CURVED. The picture is bent outward, so straight lines near
 *   the edges bow and the corners pull in. Without this nothing else helps: a
 *   rectangle with stripes is a rectangle. The bezel is whatever falls outside
 *   the bent picture, which is why it is drawn here rather than in CSS.
 *
 *   THE PHOSPHORS ARE IN COLUMNS. A tube has an aperture grille: red, green
 *   and blue stripes side by side, which is why a white area on a CRT
 *   photograph is never white up close. The scanlines are the rows and the
 *   grille is the columns, and the second is what stops the first reading as
 *   a venetian blind.
 *
 *   THE BEAM OVERSHOOTS. A bright area bleeds into its neighbours, because
 *   the electron beam does not stop where the signal does. Three taps of the
 *   picture, added, is enough: a proper blur would cost a second pass and look
 *   no better behind a grille this coarse.
 *
 *   THE CHANNELS DO NOT LAND TOGETHER. Convergence is never perfect, so red
 *   and blue sit a fraction apart, and the error grows towards the corners
 *   because that is where the deflection is working hardest.
 *
 *   THE TUBE IS DIM AT THE EDGES, and there is a bar rolling down it, from
 *   the signal and the mains being very slightly out of step.
 *
 * WHAT MOVES
 *
 * The roll, once per period, so the last frame is the first frame. The
 * scanlines and the grille are fixed to the glass and do not move, because
 * they are the screen rather than the picture: animate them and the whole
 * thing reads as a pattern sliding over a photograph.
 *
 * Pure in \`t\`. Nothing here depends on the frame before it, so the recorder
 * can seek.
 */

uniform vec2      u_resolution;
uniform float     u_dpr;
uniform float     u_time;
uniform float     u_period;
uniform sampler2D u_image;
uniform vec2      u_imageSize;

uniform vec3  u_bezel;
uniform vec3  u_tint;
uniform float u_curve;
uniform float u_grille;
uniform float u_mask;
uniform float u_scanline;
uniform float u_scanCount;
uniform float u_bloom;
uniform float u_converge;
uniform float u_vignette;
uniform float u_roll;
uniform float u_brightness;
uniform float u_contrast;

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

/*
 * The bend. Pushing a point outward from the centre by an amount that grows
 * with the square of its distance is what a sphere of glass does to the
 * picture behind it, near enough, and it is one multiply.
 */
vec2 bend(vec2 uv, float amount) {
  vec2 p = uv * 2.0 - 1.0;
  float r2 = dot(p, p);
  p *= 1.0 + amount * r2;
  return p * 0.5 + 0.5;
}

/*
 * One tap of the picture. The flip is here rather than on the upload: a texture
 * from an <img> arrives with its first row at the top, and everything in this
 * shader is in gl_FragCoord's frame, where y counts up from the bottom.
 */
vec3 pick(vec2 uv) {
  return texture(u_image, clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0)).rgb;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 screen = cssPx / cssRes;

  vec2 glass = bend(screen, u_curve);

  /*
   * Outside the bent picture is the bezel. One pixel of softness on the edge,
   * because a hard one aliases along the curve where it is steepest and that
   * reads as a jagged corner rather than as a tube.
   */
  vec2 edge = max(-glass, glass - 1.0);
  float outside = max(edge.x, edge.y);
  float onGlass = 1.0 - smoothstep(0.0, 1.5 / max(cssRes.y, 1.0), outside);

  vec2 uv = cover(glass, cssRes, u_imageSize);

  /*
   * Convergence error, growing towards the corners. The green channel is the
   * reference and red and blue are pulled either side of it along the radius,
   * which is the direction the deflection coils are working in.
   */
  vec2 fromCentre = glass - 0.5;
  float reach = length(fromCentre) * 2.0;
  vec2 drift = fromCentre * u_converge * reach * 0.01;
  vec3 picture = vec3(pick(uv + drift).r, pick(uv).g, pick(uv - drift).b);

  /*
   * The overshoot. Three taps across the grille rather than a blur: the
   * grille is about to throw away most of the horizontal detail anyway, so a
   * wider and more expensive kernel buys nothing visible.
   */
  if (u_bloom > 0.0) {
    float step = 2.0 / max(cssRes.x, 1.0);
    vec3 spill = pick(uv + vec2(step, 0.0)) + pick(uv - vec2(step, 0.0));
    picture += max(spill * 0.5 - 0.35, vec3(0.0)) * u_bloom;
  }

  picture = (picture - 0.5) * (1.0 + u_contrast) + 0.5;
  picture *= u_brightness;
  picture *= u_tint;

  /*
   * The aperture grille. Three columns of phosphor per cell, so a cell cycles
   * red, green, blue across its width. Measured in device pixels, not CSS
   * ones: a grille is a physical thing on the glass and ought to get finer on
   * a denser display rather than staying the same size in points.
   */
  float column = gl_FragCoord.x / max(u_grille, 1.0);
  vec3 phosphor = vec3(
    0.5 + 0.5 * cos(TAU * column),
    0.5 + 0.5 * cos(TAU * (column - 1.0 / 3.0)),
    0.5 + 0.5 * cos(TAU * (column - 2.0 / 3.0))
  );
  /*
   * Lifted towards white, by a lot. A grille multiplied in at full strength
   * sends two thirds of every cell to black, and at three device pixels a
   * cell is below the size at which a stripe can be drawn cleanly, so what
   * reaches the eye on a page that is scaling the canvas is not a grille but
   * coloured noise. Lifting it keeps the stripes as a tint over the picture,
   * which is what a tube looks like from the sofa rather than from an inch
   * away. \`mask\` at 1 is the macro view, and it is worth seeing once.
   */
  float strength = u_grille > 0.0 ? clamp(u_mask, 0.0, 1.0) : 0.0;
  picture *= mix(vec3(1.0), phosphor * 1.6, strength);

  /*
   * The rows. A sine down the glass at the line count, which is a count of
   * lines on the screen and not a frequency in the picture: it stays put when
   * the picture changes.
   */
  float rows = 0.5 + 0.5 * cos(TAU * glass.y * max(u_scanCount, 1.0));
  picture *= 1.0 - u_scanline * rows;

  /*
   * The bar. One pass down the glass per period, so the loop closes, with a
   * soft edge and a faint lift behind it: the signal arriving slightly out of
   * step with the mains, which is what the bar on an untuned set is.
   */
  if (u_roll > 0.0) {
    float at = fract(u_time / max(u_period, 0.001));
    /* Counted down the glass, because the bar rolls down. In gl_FragCoord's
       frame y counts up, so taken straight it rises, which no set has ever
       done. */
    float down = 1.0 - glass.y;
    float band = fract(down - at);
    float lift = smoothstep(0.08, 0.0, band) + smoothstep(0.0, 0.3, band) * 0.0;
    picture *= 1.0 + u_roll * (lift - 0.25 * smoothstep(0.0, 0.25, band));
  }

  /* The tube is dim at the edges. */
  float fade = 1.0 - u_vignette * smoothstep(0.35, 1.15, reach);
  picture *= fade;

  fragColor = vec4(mix(u_bezel, max(picture, vec3(0.0)), onGlass), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_image',
  'u_imageSize',
  'u_bezel',
  'u_tint',
  'u_curve',
  'u_grille',
  'u_mask',
  'u_scanline',
  'u_scanCount',
  'u_bloom',
  'u_converge',
  'u_vignette',
  'u_roll',
  'u_brightness',
  'u_contrast'
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
  if (!shader) throw new Error('CrtScreen: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`CrtScreen: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class CrtScreenSurface implements Surface<CrtScreenOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private texture: WebGLTexture | null = null
  private imageSize = { width: 1, height: 1 }
  private image: HTMLImageElement | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('CrtScreen needs a canvas')
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
    if (!gl) throw new Error('CrtScreen needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('CrtScreen: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`CrtScreen: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: CrtScreenOptions): void {
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
    gl.uniform1f(loc('u_period'), opts.period)
    gl.uniform2f(loc('u_imageSize'), this.imageSize.width, this.imageSize.height)
    gl.uniform3fv(loc('u_bezel'), rgb(opts.bezel))
    gl.uniform3fv(loc('u_tint'), rgb(opts.tint))
    gl.uniform1f(loc('u_curve'), opts.curve)
    gl.uniform1f(loc('u_grille'), Math.max(0, opts.grille))
    gl.uniform1f(loc('u_mask'), opts.mask)
    gl.uniform1f(loc('u_scanline'), opts.scanline)
    gl.uniform1f(loc('u_scanCount'), Math.max(1, opts.scanCount))
    gl.uniform1f(loc('u_bloom'), opts.bloom)
    gl.uniform1f(loc('u_converge'), opts.converge)
    gl.uniform1f(loc('u_vignette'), opts.vignette)
    gl.uniform1f(loc('u_roll'), opts.roll)
    gl.uniform1f(loc('u_brightness'), opts.brightness)
    gl.uniform1f(loc('u_contrast'), opts.contrast)

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
 * Mount CrtScreen into `el`. The element must contain an `<img>`, which stays
 * in the document: its alt text is the accessible version of the picture.
 *
 * ```ts
 * const typed = createCrtScreen(document.querySelector('#plate')!)
 * typed.start()
 * // …later
 * typed.destroy()
 * ```
 */
export function createCrtScreen(
  el: HTMLElement,
  opts: Partial<CrtScreenOptions> = {}
): EffectHandle {
  return mount<CrtScreenOptions>(el, opts, {
    defaults: crtScreenDefaults,
    create: () => new CrtScreenSurface()
  })
}

export default createCrtScreen
