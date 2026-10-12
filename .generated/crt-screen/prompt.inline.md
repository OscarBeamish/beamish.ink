You are adding **CrtScreen** from Beamish to this project.

> A picture shown on a tube rather than on a panel: the glass bows, the phosphors sit in columns and the beam overshoots. Surfaces · effect · MIT.
> https://beamish.ink/effects/crt-screen

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Scanlines drawn over a flat image read as an image with stripes on it. The thing that makes a picture read as a cathode ray tube is a short list that has to be there together, and most of it is not the scanlines
- The glass is curved. The picture bows outward, straight lines near the edge bend and the corners pull in. Without this nothing else helps: a rectangle with stripes is a rectangle. The bezel is whatever falls outside the bent picture, which is why it is in the shader rather than in CSS
- The phosphors are in columns. A tube has an aperture grille, red green and blue side by side, which is why a white area in a photograph of a CRT is never white up close. The scanlines are the rows and the grille is the columns, and it is the columns that stop the rows reading as a venetian blind
- The grille is measured in device pixels rather than CSS ones. It is a physical thing on the glass, so it should get finer on a denser display rather than staying the same size in points
- The grille is lifted towards white rather than multiplied straight, and by a long way. Multiplied in at full strength it sends two thirds of every cell to black, and at three device pixels a cell is below the size at which a stripe can be drawn cleanly, so on a page scaling the canvas what reaches the eye is coloured noise rather than a grille. `mask` is that lift, and at 1 you get the macro view
- The beam overshoots, so a bright area bleeds into its neighbours. Three taps across the grille, not a blur: the grille is about to throw away most of the horizontal detail anyway, so a wider and more expensive kernel buys nothing visible
- The channels do not land on each other. Red and blue are pulled either side of green along the radius, by an amount that grows towards the corners, because that is where the deflection coils are working hardest
- The scanlines are counted down the glass rather than measured in the picture, so they stay put when the image changes. Fixed to the screen, which is what they are
- Only the rolling bar moves. Animating the scanlines or the grille turns the whole thing into a pattern sliding over a photograph, which is the usual mistake
- The <img> stays in the document, hidden. Its alt text is the accessible version of the picture and a page whose script never runs still shows the photograph
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/crt-screen/core.ts`**

```ts
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
     * Its own compositor layer, so the page cannot resample it.
     *
     * A canvas whose box lands on a half pixel has to be resampled to the
     * device grid, and which way it snaps is the compositor's business rather
     * than ours. Snapping one way on one frame and the other way on the next
     * moves the whole picture by a pixel, which is a flicker between two
     * positions that leaves no trace anywhere: the drawing buffer is perfect,
     * the clock is smooth, the box never changes and every number comes back
     * clean. It was reported on a canvas sitting at x = 683.5, and the same
     * effect at x = 123.5 on another machine was steady.
     *
     * translateZ(0) rather than will-change, because will-change is a hint
     * the browser is free to drop and this needs to be a promise. The cost is
     * one layer per live effect, and there is only ever one.
     */
    canvas.style.transform = 'translateZ(0)'
    canvas.style.backfaceVisibility = 'hidden'
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
    /*
     * Clamped at both ends.
     *
     * The top end is the tab-switch spike this always guarded against. The
     * bottom end is that a rAF timestamp is the moment the frame began, which
     * can be EARLIER than the performance.now() start() took a moment before:
     * the subtraction is then negative, Math.min keeps it, and the effect's
     * clock runs backwards. Measured on WindField, elapsed began at -0.1088
     * and four frames were rendered at a negative t before it climbed past
     * zero. A shader handed a smaller t than last frame draws an earlier
     * picture, which is a visible jump backwards on every start, and start
     * runs again every time the panel scrolls into view or the tab is
     * returned to.
     */
    const dt = Math.min(Math.max(stamp - lastStamp, 0), 100) / 1000
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

CrtScreen puts a picture on a tube instead of on a panel.

Almost every version of this is scanlines: a dark stripe every other row, drawn
over the image, done. It never works, and the reason is easy to state. A flat
rectangle with horizontal stripes on it is a flat rectangle with horizontal
stripes on it. Nothing about stripes says cathode ray tube.

What says cathode ray tube is a short list of things that have to be there
together, and most of them are not the scanlines.

**The glass is curved.** The picture bows outward, straight lines near the edges
bend, and the corners pull in. This is the one that does the work. Set `curve`
to 0 and every other setting here stops helping; set it to 0.12 and the item is
most of the way there before the grille has drawn a single stripe.

**The phosphors are in columns.** A tube has an aperture grille: red, green and
blue stripes side by side, which is why a white area in a photograph of a CRT is
never white when you get close to it. The scanlines are the rows. The grille is
the columns. It is the columns that stop the rows reading as a venetian blind,
and you can check that by setting `grille: 0` and watching the thing collapse
back into an image with stripes on it.

**The beam overshoots.** A bright area bleeds into what is next to it, because
the electron beam does not stop where the signal does.

**The channels do not land on each other.** Convergence is never perfect, so red
and blue sit a fraction either side of green, and the error grows towards the
corners because that is where the deflection coils are working hardest.

**The tube is dim at the edges, and a bar rolls down it**, from the signal and
the mains being very slightly out of step.

The bezel is drawn in the shader rather than in CSS, because the bezel is
defined as whatever falls outside the bent picture. A CSS frame cannot know
where that is.

## 3. Wire it in

**Plain HTML.** The element must contain an `<img>`. It stays in the document,
hidden once the texture is uploaded, so a browser that never runs the script
shows the photograph and a screen reader still reads the alt text.

```html
<div id="tube" style="position: relative; height: 70vh">
  <img src="/plate.jpg" alt="A street at night, lit signs against a black sky" />
</div>

<script type="module">
  import { createCrtScreen } from './beamish/effects/crt-screen/core.js'

  const tube = createCrtScreen(document.querySelector('#tube'))
  tube.start()
</script>
```

Take the image out of the flow (`position: absolute; inset: 0`). Left in it, the
canvas the effect appends is pushed a full element height down the page, where
it draws perfectly and is never seen. That is worth saying because it looks like
the effect has failed rather than like a layout problem.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createCrtScreen } from '@/beamish/effects/crt-screen/core'

export function Tube({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const tube = createCrtScreen(host.current, { curve: 0.12 })
    tube.start()
    return () => tube.destroy()
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
import { createCrtScreen } from '@/beamish/effects/crt-screen/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let tube: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  tube = createCrtScreen(host.value)
  tube.start()
})

onBeforeUnmount(() => tube?.destroy())
</script>

<template>
  <div ref="host" class="tube">
    <img src="/plate.jpg" alt="A street at night, lit signs against a black sky" />
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
| `curve` | number | `0.12` | 0 to 0.5 (looks right between 0.06 and 0.2) | How much the glass bows the picture. The one that does the most work: at 0 you have a flat image with stripes on it and nothing below will rescue it, and by 0.35 it is a fish-eye rather than a tube. 0.12 is about a late consumer set, where the curve is obvious at the corners and unremarkable in the middle. |
| `grille` | number | `3` | 0 to 12 px (looks right between 2 and 5) | Width of one phosphor cell in device pixels, so three subpixels fit across it. 0 turns the grille off, which is worth doing once to see how much of the effect is the columns rather than the rows. This is the pitch; `mask` is how strongly it shows. Above about 6 the stripes stop being a texture and become the subject. |
| `mask` | number | `0.55` | 0 to 1 (looks right between 0.4 and 0.7) | How strongly the grille shows, from a tint over the picture to the macro view. At 1 the stripes are drawn at full strength, which sends two thirds of every cell to black; at three device pixels a cell is below the size at which a stripe can be drawn cleanly, so on a page that is scaling the canvas what reaches the eye is not a grille but coloured noise. 0.55 is what a tube looks like from the sofa. Set it to 1 once and look at it an inch from the screen. |
| `scanline` | number | `0.38` | 0 to 1 (looks right between 0.2 and 0.5) | How dark the gaps between rows go. The number everybody reaches for first and the one that matters least: past about 0.6 the picture is half black and you are looking at a blind. |
| `scanCount` | number | `200` | 60 to 1200 (looks right between 140 and 320) | How many lines down the glass. This is a count of lines on a screen, not a frequency in the picture, so it stays put when the image changes. Broadcast was 576 visible lines in Europe and 480 in America; 200 is well under either on purpose, because at a real line count on a dense display the rows fall below a pixel and alias into a moire. |
| `bloom` | number | `0.32` | 0 to 2 (looks right between 0.2 and 0.6) | How far a bright area bleeds into its neighbours. Only the parts of the picture above a threshold spill, which is why this reads as a beam overshooting rather than as the whole image going soft. |
| `converge` | number | `1.1` | 0 to 5 (looks right between 0.6 and 1.8) | How far red and blue miss each other at the corners, in roughly thousandths of the frame. Small numbers only. Convergence error is something you notice on white type at the edge of the screen and nowhere else, and a set this badly out would have gone back to the shop. |
| `vignette` | number | `0.5` | 0 to 1 (looks right between 0.3 and 0.7) | How dim the edges of the tube go. It is doing two jobs: a tube really is dimmer at the edges, and it also hides the corners where the curvature is working hardest and the picture is most stretched. |
| `roll` | number | `0.1` | 0 to 1 (looks right between 0.05 and 0.25) | How strongly the bar rolling down the glass shows. 0 removes it and makes the whole item a still, which is the right setting behind text. Keep it low: this is a set very slightly out of step with the mains, not a set that is broken. |
| `brightness` | number | `1.05` | 0.2 to 3 (looks right between 0.9 and 1.4) | Applied before the grille and the scanlines take their share, which is why it sits above 1. The rows and the columns together remove roughly a quarter of the light at the default mask, so a picture passed through at 1.0 comes out a little darker than it went in. Raise it with `mask`, not on its own. |
| `contrast` | number | `0.12` | -0.5 to 1.5 (looks right between 0 and 0.4) | Pushed away from the midtone before the grille, for the same reason as brightness. A tube crushes its shadows, and a little of this is what separates the lit parts of the picture from the glow the grille leaves in the black. |
| `tint` | color | `#ffeedd` | any CSS hex | The cast of the tube, multiplied over the picture. Warm on purpose: a phosphor is not neutral, and a tube that renders white as white reads as a flat panel doing an impression. Cool it towards #ddeeff for a monitor rather than a television. |
| `bezel` | color | `#07070a` | any CSS hex | Whatever falls outside the curved glass. Near-black rather than black, so it sits against the page instead of punching a hole in it. If it reads as a visible frame, the curve is too high rather than this being too light. |
| `period` | number | `6` | 1 to 30 s (looks right between 4 and 12) | Seconds for one pass of the bar down the glass. The loop closes exactly on it, so the last frame is the first frame. Longer is calmer and almost always better: at 2 it is a strobe. |
| `maxDpr` | number | `2` | 1 to 3 | Device pixel ratio ceiling. The grille is measured in device pixels, so this changes how fine the stripes are as well as what it costs to draw them. |
| `reducedMotionTime` | number | `1.5` | 0 to 30 s | The single frame shown when the user prefers reduced motion. Anything works: the bar is the only thing that moves, and the tube is the point. |

## 5. What moves

The bar, once per `period`, and nothing else.

The scanlines and the grille are fixed to the glass and do not move, because
they are the screen rather than the picture. Animate them and the whole thing
reads as a pattern sliding over a photograph, which is the second most common
way to get this wrong.

`renderAtTime(t)` is pure in `t` and the loop closes exactly on the period, so
the last frame is the first frame.

## 6. Tuning it, in order

Set them in this order, because each one changes what the next one looks like.

1. **`curve`.** Everything rests on it. 0.12 is about a late consumer set:
   obvious at the corners, unremarkable in the middle. By 0.35 it is a fish-eye.
2. **`grille` and `mask`.** `grille` is the pitch, 3 device pixels per cell so
   three subpixels fit across it. `mask` is how hard the stripes are drawn, and
   it is the one that decides whether this reads as a tube or as a mesh over a
   photograph. See below.
3. **`brightness` and `contrast`.** The rows and columns together take roughly a
   quarter of the light, which is why brightness sits above 1 rather than at it.
4. **`scanline`.** The number everybody reaches for first and the one that
   matters least. Past 0.6 the picture is half black.
5. **`converge`, `bloom`, `vignette`, `roll`.** Small numbers. Each of these is
   something you notice once and then stop seeing, which is the correct amount.

## 7. The grille is in device pixels

Not CSS pixels. A grille is a physical thing on the front of a tube, so on a
denser display it should get finer rather than staying the same size in points.
That also means `maxDpr` changes how the item looks and not only what it costs.

## 8. The mask, and why it is not at full strength

The stripes are lifted towards white before they are multiplied in, and by a
long way: `mask` at the default of 0.55 draws them as a tint over the picture
rather than as stripes.

That is not a softening for taste. Multiply a pure red-green-blue mask straight
over an image and two thirds of every cell goes to black. Worse, at three device
pixels a cell is below the size at which a stripe can be drawn cleanly, so once
the browser is scaling the canvas at all, what reaches the eye is not a grille
but coloured noise, and the picture goes muddy underneath it.

A real tube does look like the full-strength version. From an inch away. `mask:
1` is that view and it is worth setting once, nose against the screen, because
after that the default stops looking like a compromise and starts looking like
the right distance.

## 9. Choosing a picture

Something with bright saturated areas and real black in it. Signage at night,
a title card, a lit face against a dark room.

A flat daylight photograph hides the entire effect. The vignette has nothing to
darken, the bloom has nothing to spill, the convergence error has no hard white
edge to show on, and the grille's lift in the shadows has no shadows to lift.
You will have built all of it and be able to see none of it.

Crop to 4:3 if you can. It is the shape of the thing.

## 10. Behind text

Turn `roll` to 0 and drop `scanline` to about 0.15. The bar passing under a
paragraph is a moving luminance change behind reading text, which is the one
thing in this item worth being careful about, and with `roll: 0` the whole
effect becomes a still: no loop runs and nothing moves at all.

## 11. Accessibility. Do not skip this

The alt text on the `<img>` is the accessible version of the picture and it is
left exactly as written. Write it as you would for the photograph, because that
is what the reader is being told about. There is nothing in the canvas for
assistive technology, by design.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. Which frame hardly matters: the bar is the only thing that
moves, and the tube is the point.

## 12. Cleanup and SSR

`destroy()` releases the WebGL context and the texture, cancels the RAF,
disconnects the observers, removes every listener, and puts the image's
visibility back. One live context at a time is the budget, so call it.

The photograph renders on the server as an ordinary `<img>`, which is the whole
fallback: if the script never runs, the page shows the picture.

## 13. The three mistakes most likely to be made here

1. **Scanlines and nothing else.** The most common version of this effect and
   the one that never convinces. Without the curve it is an image with stripes
   on it.

2. **Animating the scanlines.** They are part of the screen, not part of the
   picture. Sliding them turns the item into a pattern moving over a photograph.

3. **Drawing the grille at full strength.** Two thirds of every cell goes black,
   and at a three-pixel pitch on a canvas the browser is scaling, the stripes
   alias into coloured noise. `mask` is the lift that fixes both.

4. **A scanline count that matches the display.** Broadcast was 576 visible
   lines in Europe and 480 in America, and at either of those on a dense screen
   the rows fall below a pixel and alias into a moire. 200 is low on purpose.

5. **A flat daylight photograph.** Every part of the effect needs bright things
   next to dark things, and there are none.

6. **Leaving the image in the flow.** The canvas lands an element height below
   it, draws correctly, and is never seen.

---

Concept credit: The parameter set for a CRT filter, from the Shader Effects library. Curvature is not in theirs and is added here because it is the one that matters most, by Shader Effects Inc., https://github.com/shader-effects-inc/shaders.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
