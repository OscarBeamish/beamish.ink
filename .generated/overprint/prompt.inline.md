You are adding **Overprint** from Beamish to this project.

> Two ink plates drift out of registration behind a halftone screen. Backdrops · effect · MIT.
> https://beamish.ink/effects/overprint

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- WebGL2 for gl_VertexID; there is no WebGL1 fallback and none is planned
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
  /** 0 to 1 across the element, origin top-left. Centre until first move. */
  x: number
  y: number
  /** False until the pointer has entered, so effects can idle sensibly. */
  active: boolean
}

/** One sample of a scripted cursor path. `t` is seconds; x/y are 0 to 1. */
export type PointerKey = { t: number; x: number; y: number }

export type SurfaceContext = {
  canvas: HTMLCanvasElement
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
}

export type MountConfig<O> = {
  /** Merged over on every `update()`. */
  defaults: O
  create(): Surface<O>
  /** Extra classes for the generated canvas. */
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

  const canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  if (config.canvasClass) canvas.className = config.canvasClass
  el.appendChild(canvas)

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
    if (canvas.width !== size.pixelWidth) canvas.width = size.pixelWidth
    if (canvas.height !== size.pixelHeight) canvas.height = size.pixelHeight
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
    surface.setup({ canvas, size })
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

  canvas.addEventListener('webglcontextlost', onLost as EventListener, false)
  canvas.addEventListener('webglcontextrestored', onRestored, false)

  // --- pointer -----------------------------------------------------------

  const onPointerMove = (event: PointerEvent) => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    pointer.x = clamp01((event.clientX - rect.left) / rect.width)
    pointer.y = clamp01((event.clientY - rect.top) / rect.height)
    pointer.active = true
  }

  const onPointerLeave = () => {
    pointer.active = false
  }

  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerleave', onPointerLeave)

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
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('webglcontextlost', onLost as EventListener)
      canvas.removeEventListener('webglcontextrestored', onRestored)

      const gl = surface?.context?.() ?? null
      surface?.teardown()
      surface = null

      // Hand the context back now rather than waiting for GC. The browser budget
      // is 16 contexts or 16M pixels, whichever comes first, and a page that
      // navigates between demos will hit it otherwise.
      gl?.getExtension('WEBGL_lose_context')?.loseContext()

      canvas.remove()
    }
  }

  return handle
}
```

**`src/beamish/effects/overprint/core.ts`**

```ts
/*
 * Overprint: Beamish
 * https://beamish.ink/effects/overprint
 *
 * Two ink plates drifting out of registration behind a halftone screen, on warm
 * paper. WebGL2, no three.js, no dependencies.
 *
 * The GL boilerplate is inline rather than imported. This file is published and
 * read on its own, and a reader should not have to fetch a second module to find
 * out how a program gets compiled.
 *
 * The shader source is generated from shaders/overprint.frag and
 * shaders/overprint.vert. Edit those, then run `pnpm generate`. The markers are
 * load-bearing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type OverprintOptions = BaseOptions & {
  /** Paper colour. The whole effect is designed against a warm off-white. */
  paper: string
  /** First plate. A desaturated near-black reads as ink; pure black does not. */
  inkA: string
  /** Second plate. This is where the colour lives. */
  inkB: string
  /** Size of the ink shapes. Lower is broader. */
  scale: number
  /** Halftone dots per 100 CSS pixels. Above ~40 the screen stops reading as one. */
  screen: number
  /** Screen angle of plate A, degrees. */
  angleA: number
  /** Screen angle of plate B, degrees. Keep ~30 from angleA or the plates moiré. */
  angleB: number
  /** Registration error in CSS pixels: how far the plates slide apart. */
  drift: number
  /** Ink density, 0 to 1. */
  coverage: number
  /** Paper tooth, 0 to 1. Static, not film grain. */
  grain: number
  /** Seconds for one full loop. The animation is exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const overprintDefaults: OverprintOptions = {
  paper: '#fbfaf4',
  inkA: '#363630',
  inkB: '#c44400',
  scale: 1.9,
  screen: 8,
  angleA: 15,
  angleB: 75,
  drift: 5,
  coverage: 0.32,
  grain: 0.35,
  period: 5,
  reducedMotionTime: 1.4
}

// beamish:shader-begin shaders/overprint.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/overprint.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * Overprint: two ink plates drifting out of registration behind a halftone
 * screen, composited the way ink actually behaves on paper: multiplied, not
 * added. Additive light on a dark canvas is the easy version of this and it is
 * the one everybody else ships.
 *
 * Everything animates on a circle in noise space, so the loop is exactly
 * periodic over u_period and the recorded video is seamless with no crossfade.
 */

uniform vec2  u_resolution;  // drawing buffer, device px
uniform float u_dpr;
uniform float u_time;        // seconds
uniform float u_period;      // loop length, seconds
uniform vec3  u_paper;
uniform vec3  u_inkA;
uniform vec3  u_inkB;
uniform float u_scale;
uniform float u_screen;      // halftone dots per 100 CSS px
uniform float u_angleA;      // screen angle, degrees
uniform float u_angleB;
uniform float u_drift;       // registration error, CSS px
uniform float u_coverage;    // 0..1 ink density
uniform float u_grain;       // 0..1 paper tooth

out vec4 fragColor;

const float TAU = 6.28318530718;

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * gnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

mat2 rot(float degrees) {
  float a = radians(degrees);
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

/*
 * Area-proportional halftone dot. Radius goes as sqrt(value) so apparent tone is
 * linear in \`value\`, which is what a real screen does. Anti-aliased against the
 * screen-space derivative, so it stays clean at any DPR instead of buzzing.
 */
float halftone(vec2 cssPx, float angle, float value, float freq) {
  vec2 g = rot(angle) * cssPx * freq;
  vec2 cell = fract(g) - 0.5;
  float d = length(cell) * 2.0;
  // 1.45, not 1.0: the cell corners are sqrt(2) from the centre, so a dot that
  // stops at 1.0 can never close up and the darkest tone tops out around 78%.
  float r = sqrt(clamp(value, 0.0, 1.0)) * 1.45;
  float aa = fwidth(d) * 1.2 + 1e-4;
  return 1.0 - smoothstep(r - aa, r + aa, d);
}

/*
 * fbm lands in roughly -0.5..0.5 and clusters hard around the middle. Left alone
 * that maps to one flat mid-tone across the whole canvas. A rug, not a print.
 * Amplify first, then window: the amplification buys real highlights where the
 * paper shows through, and real solids.
 */
float tone(float raw, float coverage) {
  float v = clamp(raw * 1.7 + 0.5, 0.0, 1.0);
  float edge = 1.0 - coverage;
  float t = smoothstep(edge - 0.30, edge + 0.30, v);
  // Clean the toe. Without this the highlights keep a haze of sub-pixel dots
  // that reads as dirt on the paper rather than as a light tone. Being fine
  // unpredictable detail, it costs more in the encoded video than the entire
  // rest of the frame.
  return t * smoothstep(0.03, 0.11, t);
}

void main() {
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = min(u_resolution.x, u_resolution.y) / max(u_dpr, 0.001);
  vec2 uv = cssPx / max(shortSide, 1.0);

  float phase = TAU * u_time / max(u_period, 0.001);

  // A closed orbit through noise space. Any path that returns to its start works;
  // a circle is the one with no easing artefact at the seam.
  // Amplitudes are small on purpose. The loop is short so that a five-second
  // recording is a whole cycle; the calm comes from how far the field travels,
  // not from how long it takes.
  vec2 orbitA = vec2(cos(phase), sin(phase)) * 0.30;
  vec2 orbitB = vec2(cos(phase + 2.1), sin(phase + 2.1)) * 0.24 + vec2(11.3, -6.7);

  float rawA = fbm(uv * u_scale + orbitA);
  float rawB = fbm(uv * u_scale * 1.18 + orbitB);

  // Plate B carries a little less ink than plate A, which is what stops the two
  // reading as one muddy colour where they overlap.
  float valueA = tone(rawA, u_coverage);
  float valueB = tone(rawB, u_coverage * 0.88);

  float freq = u_screen / 100.0;

  // The registration error: plate B's screen slides against plate A's. Both
  // components are periodic in \`phase\`, so the seam is exact.
  vec2 misfit = vec2(cos(phase + 1.7), sin(phase * 2.0 + 0.4)) * u_drift;

  float dotA = halftone(cssPx, u_angleA, valueA, freq);
  float dotB = halftone(cssPx + misfit, u_angleB, valueB, freq);

  // Multiply, because that is what a second pass of ink does to the first.
  vec3 col = u_paper;
  col *= mix(vec3(1.0), u_inkA, dotA);
  col *= mix(vec3(1.0), u_inkB, dotB);

  // Static tooth, not animated film grain. Animated grain flickers, and a
  // flicker this fine is exactly what WCAG 2.3.1 is about.
  //
  // Two-pixel blocks rather than one. At 2x DPR a one-pixel grain is below what
  // the eye resolves anyway, and it is the single most expensive thing in the
  // frame for a video codec: pure noise, no structure to predict.
  float tooth = hash12(floor(cssPx * 0.5)) - 0.5;
  col += tooth * 0.055 * u_grain;

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
  'u_inkA',
  'u_inkB',
  'u_scale',
  'u_screen',
  'u_angleA',
  'u_angleB',
  'u_drift',
  'u_coverage',
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
  if (!shader) throw new Error('Overprint: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Overprint: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class OverprintSurface implements Surface<OverprintOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement }): void {
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
    if (!gl) throw new Error('Overprint needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('Overprint: could not create program')
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
      throw new Error(`Overprint: program failed to link\n${log ?? ''}`)
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

  render(t: number, opts: OverprintOptions): void {
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
    gl.uniform3fv(at('u_inkA'), parseColor(opts.inkA))
    gl.uniform3fv(at('u_inkB'), parseColor(opts.inkB))
    gl.uniform1f(at('u_scale'), opts.scale)
    gl.uniform1f(at('u_screen'), opts.screen)
    gl.uniform1f(at('u_angleA'), opts.angleA)
    gl.uniform1f(at('u_angleB'), opts.angleB)
    gl.uniform1f(at('u_drift'), opts.drift)
    gl.uniform1f(at('u_coverage'), opts.coverage)
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
 * Mount Overprint into `el`. The element needs a size. Give it width and height
 * in CSS, not just content.
 *
 * ```ts
 * const overprint = createOverprint(document.querySelector('#bg')!)
 * overprint.start()
 * // …later
 * overprint.destroy()
 * ```
 */
export function createOverprint(
  el: HTMLElement,
  opts: Partial<OverprintOptions> = {}
): EffectHandle {
  return mount<OverprintOptions>(el, opts, {
    defaults: overprintDefaults,
    create: () => new OverprintSurface()
  })
}

export default createOverprint
```

## 2. What it is

Overprint is a full-bleed background that behaves like a two-colour print. Two
ink plates, a desaturated near-black and a burnt orange, are screened into
halftone dots at different angles and multiplied over the paper colour. That is
what a second pass of ink does to the first. Over the loop the plates slide
fractionally out of registration, which is the misprint that makes a risograph
look alive.

It is one WebGL2 fragment shader on one full-screen triangle. No three.js, no
textures, no render targets, no npm dependencies.

It needs a light background. Multiplying ink into black gets you black.

The defaults are tuned to be looked at: dense, plenty of solid ink. If you are
putting text on top, that is too much. Drop `coverage` to about 0.2 and raise
`period` to 15. Do not reach for opacity instead. Opacity greys the paper and
loses the thing that makes it look printed.

## 3. Wire it in

**Plain HTML.** Give the host element a size. The canvas fills it, so an element
with no height renders nothing.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createOverprint } from './beamish/effects/overprint/core.js'

  const overprint = createOverprint(document.querySelector('#backdrop'), {
    inkB: '#c44400'
  })
  overprint.start()
</script>
```

**React.** Start in an effect. Destroy in its cleanup. StrictMode runs the effect
twice in development. That is fine, because `destroy()` fully releases the
context, which is the case StrictMode exists to catch.

```tsx
import { useEffect, useRef } from 'react'
import { createOverprint } from '@/beamish/effects/overprint/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const overprint = createOverprint(host.current, { inkB: '#c44400' })
    overprint.start()
    return () => overprint.destroy()
  }, [])

  return <div ref={host} className="fixed inset-0 -z-10" />
}
```

Do not put option values in the dependency array. That tears the context down and
rebuilds it on every keystroke. Call `update()` instead:

```tsx
useEffect(() => {
  effectRef.current?.update({ coverage })
}, [coverage])
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createOverprint } from '@/beamish/effects/overprint/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let overprint: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  overprint = createOverprint(host.value, { inkB: '#c44400' })
  overprint.start()
})

onBeforeUnmount(() => overprint?.destroy())
</script>

<template>
  <div ref="host" class="backdrop" />
</template>
```

**Astro.** Nothing extra is required. Use the React or Vue file as an island with
`client:visible`, or call `createOverprint` from a plain `<script>` in the page.
The core is a standard ES module with no framework in it.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | Paper colour. Set this to your own background or the panel will not sit in the page. |
| `inkA` | color | `#363630` | any CSS hex | First plate. A desaturated near-black reads as ink; pure black reads as a hole. |
| `inkB` | color | `#c44400` | any CSS hex | Second plate. This is where the colour lives, so change this one first. |
| `scale` | number | `1.9` | 0.3 to 6 (looks right between 1.2 and 3) | Size of the ink shapes. Lower is broader and calmer. |
| `screen` | number | `8` | 2 to 40 dots / 100px (looks right between 5 and 14) | Halftone frequency. Above about 20 the screen stops reading as a screen and starts reading as noise. |
| `angleA` | number | `15` | 0 to 180 deg | Screen angle of the first plate. |
| `angleB` | number | `75` | 0 to 180 deg (looks right between 45 and 105) | Screen angle of the second plate. Keep it at least 30 degrees from angleA. Closer than that and the two screens beat against each other. |
| `drift` | number | `5` | 0 to 30 px (looks right between 4 and 12) | Registration error: how far the plates slide apart over a loop. Zero is a clean print and much duller. |
| `coverage` | number | `0.32` | 0.1 to 0.9 (looks right between 0.35 and 0.6) | Ink density. Past 0.7 the plates flood and the paper stops showing through. |
| `grain` | number | `0.35` | 0 to 1 | Paper tooth. Static by design. Animated grain flickers, and a flicker this fine is what WCAG 2.3.1 exists to prevent. |
| `period` | number | `5` | 2 to 120 s (looks right between 5 and 25) | Seconds for one full loop. The animation is exactly periodic over this. The default is 5 so that the preview video is a whole cycle. Raise it to 15 or 25 for a page background you want to forget is moving. |
| `reducedMotionTime` | number | `1.4` | 0 to 120 s | The single frame shown when the user prefers reduced motion. Pick one that composes rather than the frame at zero. |

## 5. Cleanup and SSR

Call `destroy()`. It releases the WebGL context, cancels the RAF, disconnects
both observers and removes every listener.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createOverprint` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

The runtime already pauses the loop when the element scrolls offscreen and when
the tab is hidden.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A and it applies here. Content that moves for more than five
seconds must be pausable. `stop()` and `start()` are on the handle for that.
Surface them as a real control in your own build. A small button in the corner of
the panel is enough.

Reduced motion does not cover this. Plenty of people who need a pause button have
not set that preference.

Handled in the runtime with a live `matchMedia` listener, so changing the OS
setting mid-session takes effect without a reload. Under reduced motion the loop
never starts and one frame is drawn instead, the one at `reducedMotionTime`.

Set that value deliberately. The frame at zero has the plates in perfect
registration and looks like a mistake. Pick a time where the plates are visibly
offset.

## 7. The three mistakes most likely to be made here

1. **Mounting into an element with no height.** The canvas is `width: 100%;
   height: 100%`. A `<div>` with no content and no CSS height is zero pixels tall
   and renders nothing. Give the host `position: fixed; inset: 0`, or an explicit
   height.

2. **Leaving `paper` at the default when the page is not off-white.** Every other
   colour is multiplied over it, so a mismatch shows as a hard rectangle where
   the panel ends. Set `paper` to the actual background colour first, then tune
   the inks.

3. **Raising `screen` to make it look finer.** Past about 20 dots per 100px the
   halftone stops resolving, aliases against the pixel grid, and turns into noise
   that shimmers as the plates drift. Lower `coverage` instead.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
