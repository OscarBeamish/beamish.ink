You are adding **ImageMelt** from Beamish to this project.

> One picture bleeding through another around the cursor, with a torn edge rather than a crossfade. Pointer · effect · MIT.
> https://beamish.ink/effects/image-melt

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The version of this on every agency site is a hover: you point at a card and the first image displaces into the second over about half a second. That cannot be done here, because easing a hover toward a target is a running total and renderAtTime has to answer for any moment on its own
- So the transition is driven by where the cursor is rather than by how long it has been there. The second picture bleeds out from under it, which is a function of the pointer and the time, both of which the runtime replays exactly
- The boundary is displaced by noise before it is drawn, not blurred afterwards. A soft edge is a crossfade with extra steps; an edge that wanders by a few per cent of the frame is something coming apart
- The two pictures are pulled in opposite directions across the seam, so there is shear across it and the eye reads two separate sheets rather than one dissolve
- The channels come apart at the boundary and nowhere else. A fringe over the whole frame is a broken monitor; a fringe only where the picture is being torn is the tear doing it
- Distance from the cursor is measured with the aspect put back, so the front is a circle on screen rather than an ellipse. Squashed fronts are the commonest sign of an effect working in UV space without thinking about it
- Two octaves of noise. One is too smooth to read as torn, and the interpolation between lattice corners is cubic rather than linear: linear leaves visible straight creases running through the tear along the lattice
- The idle state still moves. The noise drifts a whole number of turns over the period, so a take with no cursor in it is a loop rather than a still
- Both <img> elements stay in the document, hidden. If the host has only one, it is used for both and the picture tears into itself, which is a reasonable thing for a single-image host to do
- Pointer effects need a scripted cursor path for recording, or the take is a still with nothing happening in it
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/image-melt/core.ts`**

```ts
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

ImageMelt tears one picture open to show another underneath, around the cursor.

The version of this on every agency site is a **hover**: you point at a card
and the first image displaces into the second over about half a second.

That cannot be done here, and the reason is worth stating because it shaped the
whole item. Easing a hover toward a target is a running total: frame two is
built from frame one. `renderAtTime(t)` has to answer for any moment on its own
so the recorder can seek, so nothing here may keep one.

So the transition is driven by **where the cursor is**, not by how long it has
been there. The second picture bleeds out from under it. That is a function of
the pointer and the time, both of which the runtime replays exactly, and it
keeps the part that mattered: a torn, displaced edge between two photographs
rather than a crossfade.

## 3. Wire it in

**Plain HTML.** The element needs two `<img>` children: the first is what you
start on, the second is what bleeds through. Both stay in the document, hidden,
so the alt text survives and a page whose script never runs shows the first.

```html
<div id="plate" style="position: relative; height: 70vh">
  <img src="/one.jpg" alt="A headland falling away to the sea" />
  <img src="/two.jpg" alt="A ring of stones on a green hillside" />
</div>

<script type="module">
  import { createImageMelt } from './beamish/effects/image-melt/core.js'

  const melt = createImageMelt(document.querySelector('#plate'))
  melt.start()
</script>
```

Take the images out of the flow (`position: absolute; inset: 0`). Left in it,
the canvas is pushed a full element height down the page, where it draws
perfectly and is never seen.

Give it only one `<img>` and that picture is used for both sides, so it tears
into itself. That is a perfectly good thing to do and is what a single-image
host gets rather than an error.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createImageMelt } from '@/beamish/effects/image-melt/core'

export function Plate({ a, b }: { a: string; b: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const melt = createImageMelt(host.current, { displace: 0.1 })
    melt.start()
    return () => melt.destroy()
  }, [a, b])

  return (
    <div ref={host} style={{ position: 'relative' }}>
      <img src={a} alt="" style={{ position: 'absolute', inset: 0 }} />
      <img src={b} alt="" style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
```

**Vue.** Slot both pictures into the component; it hides them and uses them as
textures.

**Astro.** Nothing extra is required. The core is a standard ES module.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `radius` | number | `0.34` | 0.02 to 1.4 (looks right between 0.2 and 0.6) | How far the second picture reaches from the cursor, as a share of the element's height. Small is a hole you drag about; past about 1 the second picture fills the frame whenever the cursor is anywhere on it, which turns the item into a plain hover swap. |
| `feather` | number | `0.05` | 0.002 to 0.3 (looks right between 0.02 and 0.1) | How soft the boundary is. Keep it well under `displace` or the softening swallows the tear and you are back to a crossfade, which is the whole thing this is trying not to be. |
| `displace` | number | `0.1` | 0 to 0.4 (looks right between 0.05 and 0.18) | How far the noise pushes the boundary about, and how hard the two pictures shear past each other at it. The single most important number here: at 0 it is a circle with a soft edge, and it is this that makes it a tear. |
| `fringe` | number | `0.35` | 0 to 2 (looks right between 0.2 and 0.6) | How far red and blue come apart at the seam. Only at the seam, which is the point: it reads as the tear splitting the light rather than as a fault in the screen. |
| `grain` | number | `5.5` | 0.5 to 30 (looks right between 3 and 10) | How big the torn shapes are. Low gives a few long tongues of the second picture; high gives a ragged lace. Around 5 the shapes are about the size of a hand, which is what reads as something being pulled apart. |
| `drift` | number | `0.5` | 0 to 4 (looks right between 0.2 and 1) | How far the tear wanders while nothing is happening. Small: this is the breathing that stops an untouched frame being a still, not an animation in its own right. |
| `period` | number | `12` | 2 to 60 s (looks right between 8 and 24) | Seconds for one turn of that wander. The idle loop closes exactly on it, which is what lets the item be recorded without a cursor in the frame. |
| `maxDpr` | number | `2` | 1 to 3 | Device pixel ratio ceiling. Six texture samples per pixel, so this is the performance control. |
| `reducedMotionTime` | number | `0` | 0 to 60 s | The single frame shown when the user prefers reduced motion. The pointer still works under reduced motion, because responding to a deliberate action is not the kind of movement the setting is about; this only freezes the idle wander. |

## 5. Three things make the edge read as a tear

**The boundary is displaced before it is drawn, not blurred after.** A soft
edge is a crossfade with extra steps. An edge that wanders by a few per cent of
the frame is something coming apart. That is `displace`, and at 0 you have a
circle with a soft edge and none of this works.

**The two pictures shear past each other.** One is pulled toward the seam and
the other away, so there is movement *across* the boundary and the eye reads
two separate sheets rather than one picture fading into another.

**The channels come apart at the seam and nowhere else.** A fringe over the
whole frame is a broken monitor. A fringe only where the picture is being torn
is the tear splitting the light.

## 6. Two details that were wrong first

**Measure distance with the aspect put back.** Working in plain UV space makes
the front an ellipse on any element that is not square, and a squashed front is
the commonest sign of an effect that has not thought about its own coordinates.

**Interpolate the noise lattice with a cubic, not a straight line.** Linear
interpolation leaves visible straight creases running through the tear along
the lattice, which reads as a grid rather than as paper.

## 7. The idle state still moves

The noise drifts a whole number of turns over `period`, so an untouched frame
breathes instead of sitting still, and a take recorded with no cursor in it is
a clean loop rather than a frozen picture.

Keep `drift` small. It is the breathing, not an animation in its own right.

## 8. Choosing the two pictures

**They have to disagree.** A tear only reads as a tear if the two sides are
clearly different: same subject, same palette, and the seam is invisible
however hard you displace it.

Different horizon heights help most, because that is what makes the shear
across the seam visible. Different colour temperature helps nearly as much.

## 9. Tuning it

1. **`displace`.** The one that matters. Everything else is decoration on it.
2. **`feather`.** Keep it well under `displace`, or the softening swallows the
   tear and you are back to a crossfade.
3. **`grain`.** Low gives a few long tongues of the second picture; high gives
   a ragged lace. Around 5 the shapes are hand-sized, which is what reads as
   something being pulled apart.
4. **`radius`.** Past about 1 the second picture fills the frame whenever the
   cursor is anywhere on it, which turns this back into a plain hover swap.

## 10. Accessibility. Do not skip this

The alt text on each `<img>` is the accessible version of that picture and is
left exactly as written. There is nothing in the canvas for assistive
technology, by design.

The pointer still works under reduced motion, because responding to a
deliberate action is not the kind of movement that setting is about.
`reducedMotionTime` only freezes the idle wander.

## 11. Cleanup and SSR

`destroy()` releases the WebGL context and both textures, cancels the RAF,
disconnects the observers, removes every listener and puts both images'
visibility back. One live context at a time is the budget, so call it.

Both photographs render on the server as ordinary `<img>` elements, which is
the fallback: if the script never runs, the page shows them.

## 12. The three mistakes most likely to be made here

1. **Easing a hover toward a target.** It is the obvious way to write this and
   it makes the effect unrecordable, because no frame can be produced without
   producing every frame before it.

2. **Blurring the edge instead of displacing it.** A crossfade with a soft
   boundary. The displacement is the effect.

3. **Fringing the whole frame.** It reads as a broken screen rather than as a
   tear. The split belongs at the seam only.

4. **Measuring distance in raw UV.** The front comes out as an ellipse on
   anything that is not square.

5. **Two pictures that look alike.** The seam disappears and all the work goes
   to waste.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
