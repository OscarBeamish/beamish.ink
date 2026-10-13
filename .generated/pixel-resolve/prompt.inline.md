You are adding **PixelResolve** from Beamish to this project.

> A picture arriving out of big blocks, averaged rather than point sampled, landing in patches. Reveals · effect · MIT.
> https://beamish.ink/effects/pixel-resolve

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The obvious version quantises the coordinate, samples once per block and steps the block size down over time. It has two faults you can see immediately
- It jumps. A block has to be a whole number of pixels or the blocks come out uneven, so stepping the size gives four or five visible lurches with nothing in between. Crossfading between two rungs of the ladder is what turns the steps into an arrival
- It point samples. One pixel out of a block is not the block: anything thinner than a block vanishes at large sizes and pops back at small ones, which reads as the picture flickering rather than resolving. Averaging across the block is what a mipmap does and it is what keeps a subject legible at eight pixels across
- The blocks do not arrive together. Each has its own moment, hashed from the block rather than taken from its position, so the picture lands in patches. One that sharpens evenly reads as a lens being focused; one that arrives in patches reads as data
- Fewer colours while the blocks are big. A picture arriving over a slow line lost its palette as well as its resolution, and without that the big blocks are a smooth gradient, which no slow format ever produced
- The block ladder is in CSS pixels rather than device pixels, so the picture is the same picture on any display. A block measured in device pixels is half the size on a retina screen, which is the opposite of what a block is for
- One shot: it resolves and stays resolved. t past the end is the end and nothing is stored between frames
- The <img> stays in the document, hidden. Its alt text is the accessible version of the picture and a page whose script never runs still shows the photograph
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/pixel-resolve/core.ts`**

```ts
/*
 * PixelResolve: Beamish
 * https://beamish.ink/effects/pixel-resolve
 *
 * A picture arriving out of big blocks, the way one used to arrive over a slow
 * connection.
 *
 * The obvious version is to quantise the coordinate, sample once per block,
 * and step the block size down over time. It has two faults you can see at
 * once.
 *
 *   IT JUMPS. A block has to be a whole number of pixels or the blocks come
 *   out uneven, so stepping the size gives four or five visible lurches with
 *   nothing in between. Crossfading between two rungs of the ladder is what
 *   turns the steps into an arrival.
 *
 *   IT POINT SAMPLES. One pixel out of each block is not the block. Anything
 *   thinner than a block vanishes entirely at large sizes and pops back at
 *   small ones, which reads as the picture flickering rather than resolving.
 *   Averaging across the block is what a mipmap does, and it is what keeps a
 *   subject legible when it is eight pixels across.
 *
 * And the blocks do not all arrive together. Each has its own moment, hashed
 * from the block rather than taken from its position, so the picture lands in
 * patches. One that sharpens evenly reads as a lens being focused; one that
 * arrives in patches reads as data.
 *
 * ONE SHOT
 *
 * It resolves and then it stays resolved. `t` past the end is the end, and
 * nothing is stored between frames, so the recorder can seek.
 *
 * The picture comes from the first <img> in the host, which is left in the
 * document and only hidden, so the alt text and the loading behaviour stay
 * whatever was written and a page whose script never runs still shows it.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type PixelResolveOptions = BaseOptions & {
  /** The biggest a block gets, in CSS pixels. */
  coarse: number
  /** How many halvings between that and full resolution. */
  steps: number
  /** Seconds for the picture to arrive. */
  duration: number
  /** Seconds of blocks before it starts. */
  hold: number
  /** How much the blocks disagree about when their turn is. */
  scatter: number
  /** Samples across a block, squared. 1 is a point sample, 4 is a good average. */
  taps: number
  /** How few colours the early blocks are allowed. */
  levels: number
  /** What a block that has not arrived yet is. */
  ink: string
}

export const pixelResolveDefaults: PixelResolveOptions = {
  coarse: 64,
  steps: 5,
  duration: 2.6,
  hold: 0.25,
  scatter: 0.55,
  taps: 3,
  levels: 6,
  ink: '#0d0d12',
  maxDpr: 2,
  reducedMotionTime: 9
}

// beamish:shader-begin shaders/pixel-resolve.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/pixel-resolve.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * PixelResolve: a picture arriving out of big blocks, the way one used to
 * arrive over a slow connection.
 *
 * WHY IT IS NOT JUST A SHRINKING BLOCK SIZE
 *
 * Quantise the coordinate, sample once per block, step the block size down
 * over time: that is the obvious version and it has two faults you can see
 * immediately.
 *
 *   It jumps. The block size has to be a whole number of pixels or the blocks
 *   come out uneven, so stepping it gives four or five visible lurches and
 *   nothing in between. Crossfading between two block sizes is what turns the
 *   steps into an arrival.
 *
 *   It picks one pixel out of each block and calls it the block. That is a
 *   point sample, not an average, so thin bright things vanish entirely at
 *   large block sizes and then pop back. Averaging over the block is what
 *   keeps a picture legible when it is eight pixels across, and it is the
 *   whole reason a mipmap exists.
 *
 * THE BLOCKS DO NOT ALL ARRIVE AT ONCE
 *
 * A picture that sharpens uniformly reads as a lens being focused. One that
 * resolves in patches reads as data landing. Each block has its own moment,
 * from a hash of the block rather than from its position, so the order is
 * scattered rather than sweeping.
 *
 * Pure in \`t\`. The block a pixel belongs to, the moment it resolves and the
 * average inside it are all functions of the frame being asked for.
 */

uniform vec2      u_resolution;
uniform float     u_dpr;
uniform float     u_time;
uniform sampler2D u_image;
uniform vec2      u_imageSize;

uniform float u_coarse;
uniform float u_steps;
uniform float u_duration;
uniform float u_hold;
uniform float u_scatter;
uniform float u_taps;
uniform float u_levels;
uniform vec3  u_ink;

out vec4 fragColor;

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
vec3 pick(vec2 uv) {
  return texture(u_image, clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0)).rgb;
}

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

/*
 * The average colour of one block, taken as a grid of samples across it.
 *
 * Not the centre pixel. A point sample loses anything thinner than a block, so
 * a sign or a cable disappears at sixteen pixels and reappears at eight, which
 * reads as the picture flickering rather than resolving. The average is what a
 * mipmap would give and it is what keeps the subject readable when the blocks
 * are enormous.
 */
vec3 blockAverage(vec2 block, float size, vec2 cssRes, float taps) {
  vec3 total = vec3(0.0);
  float n = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      if (float(x) >= taps || float(y) >= taps) continue;
      vec2 at = (block + (vec2(float(x), float(y)) + 0.5) / taps) * size;
      vec2 uv = cover(at / cssRes, cssRes, u_imageSize);
      total += pick(uv);
      n += 1.0;
    }
  }
  return total / max(n, 1.0);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  /*
   * How far through the arrival, before any per-block scatter. One shot: it
   * resolves and then it stays resolved.
   */
  float run = clamp((u_time - u_hold) / max(u_duration, 0.001), 0.0, 1.0);

  /*
   * The ladder of block sizes, each a whole number of pixels and each half the
   * one before. \`where\` is a position on that ladder rather than a size, so
   * the crossfade below is between two rungs.
   */
  float rungs = max(u_steps, 1.0);
  float where = (1.0 - run) * rungs;

  float lower = floor(where);
  float blend = where - lower;

  /* Two block sizes to cross between, both whole pixels. */
  float sizeA = max(floor(u_coarse / pow(2.0, rungs - lower)), 1.0);
  float sizeB = max(floor(u_coarse / pow(2.0, rungs - lower - 1.0)), 1.0);

  float taps = clamp(floor(u_taps), 1.0, 4.0);

  vec2 blockA = floor(cssPx / sizeA);
  vec2 blockB = floor(cssPx / sizeB);

  /*
   * Each block gets its own moment, hashed from the block rather than taken
   * from its position, so the picture lands in patches instead of sweeping.
   * A picture that sharpens evenly reads as a lens being focused; one that
   * arrives in patches reads as data.
   */
  float jitterA = (hash12(blockA + 11.7) - 0.5) * u_scatter;
  float jitterB = (hash12(blockB + 11.7) - 0.5) * u_scatter;
  float mixAB = clamp(blend + jitterA * 0.5 + jitterB * 0.5, 0.0, 1.0);

  vec3 colour = mix(
    blockAverage(blockA, sizeA, cssRes, taps),
    blockAverage(blockB, sizeB, cssRes, taps),
    mixAB
  );

  /*
   * Fewer colours while the blocks are big, all of them by the end. A picture
   * arriving over a slow line lost its palette as well as its resolution, and
   * without this the big blocks are a smooth gradient, which no slow format
   * ever produced.
   */
  float levels = mix(u_levels, 255.0, run);
  if (levels < 254.0) {
    colour = floor(colour * levels + 0.5) / levels;
  }

  /*
   * What is not here yet. Blocks whose moment has not come are flat, so the
   * frame starts as a field of them and fills in.
   */
  float arrived = step(hash12(blockA + 3.1), run * (1.0 + u_scatter));
  colour = mix(u_ink, colour, clamp(arrived + run * run, 0.0, 1.0));

  fragColor = vec4(colour, 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_image',
  'u_imageSize',
  'u_coarse',
  'u_steps',
  'u_duration',
  'u_hold',
  'u_scatter',
  'u_taps',
  'u_levels',
  'u_ink'
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
  if (!shader) throw new Error('PixelResolve: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`PixelResolve: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class PixelResolveSurface implements Surface<PixelResolveOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private texture: WebGLTexture | null = null
  private imageSize = { width: 1, height: 1 }
  private image: HTMLImageElement | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('PixelResolve needs a canvas')
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
    if (!gl) throw new Error('PixelResolve needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('PixelResolve: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`PixelResolve: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: PixelResolveOptions): void {
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
    gl.uniform2f(loc('u_imageSize'), this.imageSize.width, this.imageSize.height)
    gl.uniform1f(loc('u_coarse'), Math.max(opts.coarse, 1))
    gl.uniform1f(loc('u_steps'), Math.max(opts.steps, 1))
    gl.uniform1f(loc('u_duration'), Math.max(opts.duration, 0.01))
    gl.uniform1f(loc('u_hold'), Math.max(opts.hold, 0))
    gl.uniform1f(loc('u_scatter'), Math.max(opts.scatter, 0))
    gl.uniform1f(loc('u_taps'), Math.min(Math.max(opts.taps, 1), 4))
    gl.uniform1f(loc('u_levels'), Math.max(opts.levels, 2))
    gl.uniform3fv(loc('u_ink'), rgb(opts.ink))

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
 * Mount PixelResolve into `el`. The element must contain an `<img>`, which stays
 * in the document: its alt text is the accessible version of the picture.
 *
 * ```ts
 * const typed = createPixelResolve(document.querySelector('#plate')!)
 * typed.start()
 * // …later
 * typed.destroy()
 * ```
 */
export function createPixelResolve(
  el: HTMLElement,
  opts: Partial<PixelResolveOptions> = {}
): EffectHandle {
  return mount<PixelResolveOptions>(el, opts, {
    defaults: pixelResolveDefaults,
    create: () => new PixelResolveSurface()
  })
}

export default createPixelResolve
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

PixelResolve brings a picture in out of big blocks, the way one used to arrive
over a slow connection.

## 3. Wire it in

**Plain HTML.** The element must contain an `<img>`. It stays in the document,
hidden once the texture is uploaded, so a browser that never runs the script
shows the photograph and a screen reader still reads the alt text.

```html
<div id="plate" style="position: relative; height: 70vh">
  <img src="/plate.jpg" alt="A street at night under lit signs" />
</div>

<script type="module">
  import { createPixelResolve } from './beamish/effects/pixel-resolve/core.js'

  const plate = createPixelResolve(document.querySelector('#plate'))
  plate.start()
</script>
```

Take the image out of the flow (`position: absolute; inset: 0`). Left in it,
the canvas is pushed a full element height down the page, where it draws
perfectly and is never seen.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createPixelResolve } from '@/beamish/effects/pixel-resolve/core'

export function Plate({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const plate = createPixelResolve(host.current, { coarse: 64 })
    plate.start()
    return () => plate.destroy()
  }, [src])

  return (
    <div ref={host} style={{ position: 'relative' }}>
      <img src={src} alt={alt} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
```

**Vue.** Slot the picture in; the component hides it and uses it as a texture.

**Astro.** Nothing extra is required. The core is a standard ES module.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `coarse` | number | `64` | 4 to 256 px (looks right between 32 and 128) | The biggest a block gets, in CSS pixels. This is where the picture starts, and it decides whether the opening frame is a recognisable subject or an abstract. At 64 a face is still a face; at 160 it is four rectangles. |
| `steps` | number | `5` | 1 to 8 (looks right between 4 and 6) | How many halvings between the coarsest block and full resolution. Each one is a rung of the ladder the arrival crossfades along, so more rungs is a smoother arrival over the same time, not a longer one. |
| `duration` | number | `2.6` | 0.2 to 20 s (looks right between 1.5 and 4) | Seconds for the picture to arrive. Slow enough that each rung of the ladder is visible is the whole point; under about a second it reads as a glitch rather than as something loading. |
| `hold` | number | `0.25` | 0 to 5 s | Seconds of blocks before it starts. A short one matters more than it sounds: it lets the first frame register as a deliberate state rather than as the start of a transition that was already running. |
| `scatter` | number | `0.55` | 0 to 2 (looks right between 0.3 and 0.9) | How much the blocks disagree about when their turn is. At 0 the whole picture sharpens at once, which reads as a lens being focused rather than as data landing. The patchiness is the effect. |
| `taps` | number | `3` | 1 to 4 (looks right between 2 and 4) | Samples across a block, squared, so 3 is nine samples. At 1 it is a point sample: thin bright things vanish at large block sizes and pop back at small ones, and the picture flickers instead of resolving. This is also the performance control. |
| `levels` | number | `6` | 2 to 64 (looks right between 4 and 12) | How few colours the early blocks are allowed, climbing back to all of them by the end. A picture arriving over a slow line lost its palette as well as its resolution; without this the big blocks are a smooth gradient, which no slow format ever produced. |
| `ink` | color | `#0d0d12` | any CSS hex | What a block that has not arrived yet is. Near-black rather than black, so the empty blocks read as a surface waiting rather than as holes in the page. |
| `maxDpr` | number | `2` | 1 to 3 | Device pixel ratio ceiling. The blocks are measured in CSS pixels, so this changes how crisply a block's edges land rather than how big the blocks are. |
| `reducedMotionTime` | number | `9` | 0 to 60 s | The single frame shown when the user prefers reduced motion. For a one-shot arrival this has to be a time after it has finished, so the picture is simply there. The picture is the point; the arriving is how it gets in. |

## 5. Why it is not just a shrinking block size

The obvious version is three lines: quantise the coordinate, sample once per
block, step the block size down over time. It has two faults and you can see
both of them immediately.

**It jumps.** A block has to be a whole number of pixels, or the blocks come
out uneven and the grid shimmers. So stepping the size gives you four or five
visible lurches with nothing in between. The fix is to treat the sizes as a
*ladder* and crossfade between two rungs: at any moment two block sizes are in
flight and the picture is mixing from one to the other. That is what turns a
set of steps into an arrival.

**It point samples.** One pixel out of each block is not the block. Anything
thinner than a block — a cable, a sign, a highlight — vanishes completely at
large sizes and pops back at small ones, so the picture flickers instead of
resolving.

**Average across the block instead.** That is what a mipmap is for, and it is
what keeps a subject legible when it is eight pixels across. It costs `taps`
squared samples per block, and dropping `taps` to 1 brings the flicker
straight back, which is a quick way to see what the average is doing.

## 6. The blocks do not arrive together

A picture that sharpens evenly reads as **a lens being focused**. One that
arrives in patches reads as **data landing**. They are completely different
things and only the second one is interesting.

So each block gets its own moment, hashed from the block rather than taken from
its position, so the order is scattered rather than sweeping. `scatter: 0`
turns it back into a focus pull if you want to see the difference.

## 7. Fewer colours early

A picture arriving over a slow line lost its palette as well as its resolution.
Without that, the big blocks are a smooth gradient, which no slow format ever
actually produced. `levels` starts low and climbs back to the full range by the
end.

## 8. The ladder is in CSS pixels

Not device pixels. A block measured in device pixels is half the size on a
retina screen, which is the opposite of what a block is for: the whole point is
that it is a visible chunk, and it should be the same visible chunk everywhere.

## 9. Tuning it

1. **`coarse`.** Where the picture starts, and whether the opening frame is a
   recognisable subject or an abstract. At 64 a face is still a face; at 160 it
   is four rectangles.
2. **`duration`.** Slow enough that each rung of the ladder is visible is the
   whole point. Under about a second it reads as a glitch rather than as
   something loading.
3. **`scatter`.** Patches or a focus pull. See above.
4. **`taps`.** Quality and cost. Set it to 1 once to see the flicker the
   average exists to prevent.
5. **`levels`.** How much of the slow-connection character you want. Low is
   closer to a GIF; high is closer to a photograph that happens to be blocky.

## 10. Choosing a picture

One with big shapes and strong contrast. Pixelation keeps whatever survives
being averaged into a block, so a frame with bold shapes still reads at eight
pixels across while a frame of fine texture turns to mud.

Signage, a face, a silhouette, anything graphic. A field of foliage is the
worst case: every block averages to the same green and the arrival has nothing
to arrive at.

## 11. Accessibility. Do not skip this

The alt text on the `<img>` is the accessible version of the picture and it is
left exactly as written. There is nothing in the canvas for assistive
technology, by design.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`, which is after the arrival has finished. The picture is
simply there.

## 12. Cleanup and SSR

`destroy()` releases the WebGL context and the texture, cancels the RAF,
disconnects the observers, removes every listener and puts the image's
visibility back. One live context at a time is the budget, so call it.

The photograph renders on the server as an ordinary `<img>`, which is the whole
fallback: if the script never runs, the page shows the picture.

## 13. The three mistakes most likely to be made here

1. **Stepping the block size.** Four or five visible lurches. Two sizes have to
   be in flight at once and crossfading.

2. **Point sampling the block.** Thin bright things vanish and reappear, and
   the picture flickers rather than resolving.

3. **A block size that is not a whole number of pixels.** The grid shimmers,
   because some blocks round up and their neighbours round down.

4. **Measuring blocks in device pixels.** They come out half the size on a
   retina screen, which is backwards: a block is meant to be a visible chunk.

5. **No scatter.** It becomes a focus pull, which is a different effect and a
   duller one.

6. **A picture of texture.** Every block averages to the same colour and there
   is nothing to resolve into.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
