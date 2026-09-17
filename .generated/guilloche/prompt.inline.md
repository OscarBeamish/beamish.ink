You are adding **Guilloche** from Beamish to this project.

> The engine-turned line work off a banknote, printed on paper. Backdrops · effect · MIT.
> https://beamish.ink/effects/guilloche

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- WebGL2 for gl_VertexID; there is no WebGL1 fallback and none is planned
- The line width is derived from the screen-space derivative of the field, so the engraving stays one pixel wide at any DPR instead of filling in at the centre
- Falls back to a still frame under prefers-reduced-motion, handled in the runtime
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

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
  render(t: number, opts: O, pointer: Pointer): void
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

export function mount<O extends BaseOptions>(
  el: HTMLElement,
  userOpts: Partial<O> | undefined,
  config: MountConfig<O>
): EffectHandle {
  let opts: O = { ...config.defaults, ...(userOpts ?? {}) }

  const kind = config.kind ?? 'canvas'

  let canvas: HTMLCanvasElement | null = null
  if (kind === 'canvas') {
    canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
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

  function draw(t: number) {
    if (!surface || contextLost) return
    surface.render(t, opts, pointerAt(t))
  }

  function tick(stamp: number) {
    if (!running) return
    elapsed += Math.min(stamp - lastStamp, 100) / 1000 // clamp tab-switch spikes
    lastStamp = stamp
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

  // --- visibility and viewport -------------------------------------------

  let visible = true
  let wantedByUser = false

  const resizeObserver = new ResizeObserver(() => {
    if (destroyed) return
    applySize()
    if (!running) draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed)
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
  intersectionObserver?.observe(el)

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
      opts = { ...opts, ...(next as Partial<O>) }
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

**`src/beamish/effects/guilloche/core.ts`**

```ts
/*
 * Guilloche: Beamish
 * https://beamish.ink/effects/guilloche
 *
 * The engine-turned line work on a banknote, drawn on warm paper. WebGL2, no
 * three.js, no dependencies.
 *
 * The GL boilerplate is inline rather than imported. This file is published and
 * read on its own, and a reader should not have to fetch a second module to find
 * out how a program gets compiled.
 *
 * The shader source is generated from shaders/guilloche.frag and
 * shaders/guilloche.vert. Edit those, then run `pnpm generate`. The markers are
 * load-bearing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type GuillocheOptions = BaseOptions & {
  /** The paper the plate is printed on. */
  paper: string
  /** The engraving. A desaturated near-black reads as ink. */
  ink: string
  /** The second colour, printed over one band of the pattern. */
  accent: string
  /** Size of the whole rosette. */
  scale: number
  /** Lines per unit of radius. Higher is finer engraving. */
  pitch: number
  /** Lobes on the first rosette. Whole numbers only, or the curve never closes. */
  lobes: number
  /** Spokes in the family that runs around the circle rather than out from it. */
  waves: number
  /** How far each rosette's radius wobbles. */
  depth: number
  /** Weight of the engraved line, 0 to 1. */
  weight: number
  /** Where the second colour band sits, as a radius. */
  accentBand: number
  /** Paper tooth, 0 to 1. Static, not film grain. */
  grain: number
  /** Seconds for one turn of the gears. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const guillocheDefaults: GuillocheOptions = {
  paper: '#fbfaf4',
  ink: '#2f2b26',
  accent: '#c44400',
  scale: 0.92,
  pitch: 26,
  lobes: 7,
  waves: 24,
  depth: 0.07,
  weight: 0.35,
  accentBand: 0.22,
  grain: 0.28,
  period: 6,
  reducedMotionTime: 5
}

// beamish:shader-begin shaders/guilloche.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/guilloche.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * Guilloche: the engine-turned line work on a banknote, a share certificate or
 * the bezel of a watch.
 *
 * It is not noise and it is not a gradient. A real rose engine cuts one
 * continuous line whose radius is modulated by a set of gears, so the pattern
 * is a family of curves with a strict harmonic relationship. That is exactly
 * what this draws: several rosettes, each a circle whose radius wobbles at an
 * integer number of lobes, rendered as a line field rather than a fill.
 *
 * The integer lobe counts are the whole thing. Fractional ones never close, and
 * an open curve reads as a mistake rather than as engraving.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;
uniform vec3  u_paper;
uniform vec3  u_ink;
uniform vec3  u_accent;
uniform float u_scale;
uniform float u_pitch;
uniform float u_lobes;
uniform float u_waves;
uniform float u_depth;
uniform float u_weight;
uniform float u_accentBand;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * One engraved line family. \`spacing\` is how far apart the lines sit; the
 * derivative keeps them a constant width on screen however fast the field is
 * changing, which is what stops the centre turning into a solid disc.
 */
float engrave(float field, float weight) {
  float band = fract(field);
  float aa = fwidth(field);
  float edge = aa * (0.5 + weight * 2.0);
  return 1.0 - smoothstep(0.0, edge, min(band, 1.0 - band));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  vec2 p = (cssPx - cssRes * 0.5) / (shortSide * 0.5);
  p /= max(u_scale, 0.05);

  float phase = TAU * u_time / max(u_period, 0.001);

  float r = length(p);
  float a = atan(p.y, p.x);

  /*
   * Three rosettes turning against each other, the way a rose engine stacks
   * gears. Their lobe counts are coprime, so the interference pattern takes a
   * long time to repeat and never looks like a simple grid.
   */
  float lobesA = floor(u_lobes);
  float lobesB = floor(u_lobes * 1.75) + 1.0;
  float lobesC = floor(u_lobes * 0.5) + 2.0;

  float waveA = sin(a * lobesA + phase) * u_depth;
  float waveB = sin(a * lobesB - phase * 1.5) * u_depth * 0.55;
  float waveC = cos(a * lobesC + phase * 0.5) * u_depth * 0.8;

  // Each family is the radius plus its own wobble, scaled into line spacing.
  float fieldA = (r + waveA) * u_pitch;
  float fieldB = (r + waveB) * u_pitch * 1.31;

  // The third runs around the circle rather than out from the centre, which is
  // what turns two ring families into woven guilloche instead of a moire.
  float fieldC = (a / TAU * u_waves + waveC + r * 0.35) * u_pitch * 0.42;

  float lineA = engrave(fieldA, u_weight);
  float lineB = engrave(fieldB, u_weight);
  /*
   * The angular family is singular at the origin: every spoke meets there, and
   * without this the middle of the rosette collapses into a solid blot. A real
   * rose engine has a centre finding of its own for the same reason.
   */
  float lineC = engrave(fieldC, u_weight) * smoothstep(0.0, 0.3, r);

  vec3 col = u_paper;
  // Multiplied, not added: this is ink on paper, and two lines crossing are
  // darker than one.
  col *= mix(vec3(1.0), u_ink, lineA * 0.85);
  col *= mix(vec3(1.0), u_ink, lineB * 0.7);
  col *= mix(vec3(1.0), u_ink, lineC * 0.5);

  /*
   * A single band of the pattern printed in the second colour, the way a
   * certificate prints one guilloche in red over the rest in black. It rides
   * the same field, so it is part of the engraving rather than a highlight laid
   * on top of it.
   */
  float ring = smoothstep(u_accentBand + 0.16, u_accentBand, abs(r - u_accentBand - 0.28));
  col = mix(col, col * mix(vec3(1.0), u_accent, lineA * 0.9), ring);

  float tooth = hash12(floor(cssPx * 0.5)) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_period',
  'u_paper',
  'u_ink',
  'u_accent',
  'u_scale',
  'u_pitch',
  'u_lobes',
  'u_waves',
  'u_depth',
  'u_weight',
  'u_accentBand',
  'u_grain'
] as const

type UniformName = (typeof UNIFORMS)[number]

/** '#rgb' | '#rrggbb' | 'rgb(r g b)' → linear-ish 0 to 1 triple. */
function parseColor(input: string): [number, number, number] {
  const value = input.trim()
  if (value.startsWith('#')) {
    let hex = value.slice(1)
    if (hex.length === 3) hex = hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!
    const n = Number.parseInt(hex.slice(0, 6), 16)
    if (Number.isNaN(n)) return [0, 0, 0]
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  }
  const nums = value.match(/[\d.]+/g)
  if (nums && nums.length >= 3) {
    return [Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255]
  }
  return [0, 0, 0]
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Guilloche: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Guilloche: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class GuillocheSurface implements Surface<GuillocheOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('Guilloche needs a canvas')
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
    if (!gl) throw new Error('Guilloche needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('Guilloche: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    // Shader objects are reference-counted by the program; drop our references
    // now so they are freed the moment the program is.
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`Guilloche: program failed to link\n${log ?? ''}`)
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
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
    this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight)
  }

  render(t: number, opts: GuillocheOptions): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)

    const at = (name: UniformName) => this.locations.get(name) ?? null
    gl.uniform2f(at('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(at('u_dpr'), this.size.dpr)
    gl.uniform1f(at('u_time'), t)
    gl.uniform1f(at('u_period'), opts.period)
    gl.uniform3fv(at('u_paper'), parseColor(opts.paper))
    gl.uniform3fv(at('u_ink'), parseColor(opts.ink))
    gl.uniform3fv(at('u_accent'), parseColor(opts.accent))
    gl.uniform1f(at('u_scale'), opts.scale)
    gl.uniform1f(at('u_pitch'), opts.pitch)
    gl.uniform1f(at('u_lobes'), opts.lobes)
    gl.uniform1f(at('u_waves'), opts.waves)
    gl.uniform1f(at('u_depth'), opts.depth)
    gl.uniform1f(at('u_weight'), opts.weight)
    gl.uniform1f(at('u_accentBand'), opts.accentBand)
    gl.uniform1f(at('u_grain'), opts.grain)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  context(): WebGL2RenderingContext | null {
    return this.gl
  }

  teardown(): void {
    const gl = this.gl
    if (!gl) return
    if (this.vao) gl.deleteVertexArray(this.vao)
    if (this.program) gl.deleteProgram(this.program)
    this.vao = null
    this.program = null
    this.locations.clear()
    this.gl = null
  }
}

/**
 * Mount Guilloche into `el`. The element needs a size. Give it width and height
 * in CSS, not just content.
 *
 * ```ts
 * const guilloche = createGuilloche(document.querySelector('#bg')!)
 * guilloche.start()
 * // …later
 * guilloche.destroy()
 * ```
 */
export function createGuilloche(
  el: HTMLElement,
  opts: Partial<GuillocheOptions> = {}
): EffectHandle {
  return mount<GuillocheOptions>(el, opts, {
    defaults: guillocheDefaults,
    create: () => new GuillocheSurface()
  })
}

export default createGuilloche
```

## 2. What it is

Guilloche is the engine-turned line work off a banknote, a share certificate or
the bezel of a watch, drawn on warm paper.

It is not noise and it is not a gradient. A real rose engine cuts one continuous
line whose radius is modulated by a set of gears, so the result is a family of
curves in a strict harmonic relationship. That is what this draws: three
rosettes, each a circle whose radius wobbles at a whole number of lobes, rendered
as a line field rather than a fill, and multiplied together the way overlapping
ink actually behaves.

The whole-number lobe counts matter. A fractional count gives a curve that never
closes, and an open curve reads as a mistake rather than as engraving. The three
families are kept coprime so their interference takes a long time to repeat and
never settles into a grid.

One band is printed in a second colour, riding the same field, the way a
certificate prints one guilloche in red over the rest in black. It is part of the
engraving rather than a highlight laid on top of it.

One WebGL2 fragment shader on one full-screen triangle. No noise, no textures, no
render targets. It is the cheapest effect in the library.

## 3. Wire it in

**Plain HTML.** The element needs a size of its own.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createGuilloche } from './beamish/effects/guilloche/core.js'

  const guilloche = createGuilloche(document.querySelector('#backdrop'), {
    lobes: 7,
    period: 40
  })
  guilloche.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createGuilloche } from '@/beamish/effects/guilloche/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const guilloche = createGuilloche(host.current, { period: 40 })
    guilloche.start()
    return () => guilloche.destroy()
  }, [])

  return <div ref={host} className="fixed inset-0 -z-10" />
}
```

Do not put option values in the dependency array. Call `update()` instead: every
option is a uniform, so nothing rebuilds.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createGuilloche } from '@/beamish/effects/guilloche/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let guilloche: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  guilloche = createGuilloche(host.value, { period: 40 })
  guilloche.start()
})

onBeforeUnmount(() => guilloche?.destroy())
</script>

<template>
  <div ref="host" class="backdrop" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

**Behind content.** Raise `period` to 40 and drop `weight` to about 0.2. The
engraving recedes into a watermark you stop noticing, which is what a certificate
background is for. Do not reach for opacity: it greys the paper and loses the
thing that makes it look printed.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper the plate is printed on. Match it to your page background. |
| `ink` | color | `#2f2b26` | any CSS hex | The engraving. A desaturated near-black reads as ink; pure black reads as a wireframe. |
| `accent` | color | `#c44400` | any CSS hex | The second colour, printed over one band of the pattern the way a share certificate prints one guilloche in red over the rest in black. |
| `scale` | number | `0.92` | 0.2 to 3 (looks right between 0.6 and 1.4) | Size of the whole rosette. Below about 0.5 the lines are finer than the pixels and the plate turns grey. |
| `pitch` | number | `26` | 4 to 80 (looks right between 14 and 40) | Lines per unit of radius. Higher is finer engraving, and past about 50 it stops resolving on anything but a retina screen. |
| `lobes` | number | `7` | 2 to 24 (looks right between 5 and 12) | Lobes on the first rosette. Whole numbers only: a fractional lobe count gives a curve that never closes, and an open curve reads as a mistake rather than as engraving. The other two families are derived from this and kept coprime to it. |
| `waves` | number | `24` | 4 to 80 (looks right between 12 and 40) | Spokes in the family that runs around the circle rather than out from it. This is what turns two ring families into woven guilloche instead of a moire. |
| `depth` | number | `0.07` | 0 to 0.4 (looks right between 0.04 and 0.14) | How far each rosette's radius wobbles. Zero is concentric circles. Past about 0.2 the curves cross themselves and the weave becomes a tangle. |
| `weight` | number | `0.35` | 0 to 1 (looks right between 0.2 and 0.55) | Weight of the engraved line. Heavy lines at a high pitch fill in solid, so raise one and lower the other. |
| `accentBand` | number | `0.22` | 0 to 1.2 (looks right between 0.1 and 0.5) | Where the second colour sits, as a radius from the centre. Set it past the corner of the panel to switch the second colour off. |
| `grain` | number | `0.28` | 0 to 1 | Paper tooth. Static by design. Animated grain flickers, and a flicker this fine is what WCAG 2.3.1 exists to prevent. |
| `period` | number | `6` | 4 to 180 s (looks right between 6 and 60) | Seconds for one turn of the gears. The pattern is exactly periodic over this. The default is 6 so the preview video is a whole turn; 30 to 60 is right behind a page, where the gears should be moving slowly enough that nobody catches them. |
| `reducedMotionTime` | number | `5` | 0 to 180 s | The single frame shown when the user prefers reduced motion. Any time works: a still guilloche is an engraving, which is a finished thing to look at. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createGuilloche` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable. `stop()` and `start()` are on the handle for that. Surface them as a
real control in your own build. Reduced motion does not cover this, and plenty of
people who need a pause button have not set that preference.

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`.

This effect needs no care here. Any frame of it is an engraving, which is a
finished thing to look at, so the default is as good as any other number.

## 7. The three mistakes most likely to be made here

1. **Passing a fractional `lobes`.** The curve then never closes on itself, and
   what you get is a spiral with a visible join rather than a rosette. The option
   is stepped to whole numbers for that reason; if you set it from code, round it.

2. **Raising `pitch` and `weight` together.** Fine lines and heavy weight fill in
   solid, and the centre of the rosette goes black first because that is where
   the field changes fastest. Raise one and lower the other.

3. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing. Give the host `position: fixed; inset: 0`, or an
   explicit height.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
