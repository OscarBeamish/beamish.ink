You are adding **MetaballField** from Beamish to this project.

> Blobs that merge and part, raymarched from a distance field rather than modelled. Backdrops · effect · MIT.
> https://beamish.ink/effects/metaball-field

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- There is no geometry. The scene is a function that answers how far the nearest surface is, and the picture is made by stepping a ray forward by exactly that much. That is why the blobs can merge at all: two meshes cannot flow into one another without somebody rebuilding the mesh, while two distance fields merge by taking the smaller of the two
- The softening of that minimum is the whole item. A plain min gives two spheres that interpenetrate with a visible crease; blending over a band leaves a fillet, and the neck and pinch it produces are what read as liquid
- The ray skips straight to a bounding sphere around the swarm and a ray that misses it is abandoned on the spot. On a backdrop most of the frame is empty, and without this every one of those pixels runs the full march to find nothing
- The march breaks on a hit rather than running to the step count. Sphere tracing converges quickly once it is close, so a typical hit costs a dozen steps where the ceiling is fifty
- Normals come from the tetrahedron trick, four samples rather than the six a central difference would take. On a surface this smooth there is nothing to see in the difference
- Blob paths are circles with whole numbers of turns per period, so the loop closes exactly and nothing is integrated between frames
- Built for a dark ground and declared as one. The blobs are lit against the page, and on paper the background fill would have to become the page colour, at which point the rim light has nothing to separate it from
- The hit threshold grows with distance, because a pixel does. A ray is a cone and the patch of world one pixel covers widens along it, so a constant epsilon fails exactly the rays that graze a silhouette: the march crawls towards a surface it never formally reaches and draws a thin dark splinter along the edge of a lobe. Twice the step count only made it smaller; scaling the threshold takes it to a hairline for nothing
- The march steps three quarters of what the field reports, because a smooth minimum is not a true lower bound on the distance: it rounds the join outwards, so near a fillet the value overestimates how far there is to go
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/metaball-field/core.ts`**

```ts
/*
 * MetaballField: Beamish
 * https://beamish.ink/effects/metaball-field
 *
 * Blobs that merge and part, raymarched.
 *
 * There is no geometry here. The scene is a function: give it a point in space
 * and it returns the distance to the nearest surface, and the picture is made
 * by walking a ray forward by whatever that function says is safe. That is
 * sphere tracing, and it is why the blobs can merge at all. Two meshes cannot
 * flow into one another without somebody rebuilding the mesh; two distance
 * fields merge by taking the smaller of the two, and if you soften that
 * minimum the join becomes a fillet.
 *
 * The softening is the whole item. `min(a, b)` gives two spheres that
 * interpenetrate with a visible crease where they cross. The polynomial smooth
 * minimum below blends the two over a band, and the surface that comes out has
 * the neck and the pinch that makes this read as something liquid rather than
 * as two balls at the same address.
 *
 * Everything is a closed form in `t`. The blobs travel on circles with whole
 * numbers of turns per period, so the loop closes exactly, and nothing is
 * integrated from the previous frame. That is a requirement rather than a
 * preference: the recorder asks for frame 90 directly and expects the same
 * pixels every time it asks.
 *
 * The cost is the one thing to watch. A raymarcher pays per pixel for every
 * step it takes and every blob it asks about, so this is the most expensive
 * item in the library and the three dials that matter are `count`, `detail`
 * and the resolution you mount it at. There is a bounding sphere around the
 * whole swarm and the ray skips straight to it, which is most of why this is
 * affordable at all: without it, every pixel of empty background pays full
 * price for the privilege of finding nothing.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type MetaballFieldOptions = BaseOptions & {
  /** Behind the blobs. Nothing is drawn here, so it is a flat fill. */
  background: string
  /** The body colour, seen where a surface faces the camera. */
  body: string
  /** The light. Seen on the side the key is on, and in the rim. */
  light: string
  /** How many blobs. The main cost, along with `detail`. */
  count: number
  /** Blob radius, in scene units. The swarm is about two units across. */
  radius: number
  /**
   * Width of the fillet where two blobs meet. At 0 they interpenetrate with a
   * visible crease and it reads as two balls rather than as one liquid.
   */
  blend: number
  /** How far the blobs travel from the centre. */
  orbit: number
  /**
   * Raymarching steps. Higher resolves the thin necks between blobs; lower is
   * cheaper and loses them first, which is the part worth keeping.
   */
  detail: number
  /** How hard the highlight is. */
  shine: number
  /** Seconds for one cycle. Every blob is back where it started after this. */
  period: number
  /** Seed for the orbits and phases. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const metaballFieldDefaults: MetaballFieldOptions = {
  background: '#06060f',
  body: '#2f45d8',
  light: '#ff9a4a',
  count: 7,
  radius: 0.42,
  blend: 0.6,
  orbit: 1,
  detail: 48,
  shine: 0.55,
  period: 40,
  seed: 2,
  reducedMotionTime: 9
}

// beamish:shader-begin shaders/metaball-field.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/metaball-field.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * MetaballField: a distance function, walked.
 *
 * The scene is not geometry. It is map(), which answers "how far is the
 * nearest surface from here", and the image is made by stepping a ray forward
 * by exactly that much, over and over. The step is always safe because the
 * answer is a distance to the nearest thing in any direction, so the ray can
 * never pass through a surface it has not noticed.
 *
 * Two distance fields merge by taking the smaller of the two, which is the
 * whole reason blobs are done this way. smin() softens that minimum over a
 * band, and the fillet it leaves is what makes the pair read as liquid instead
 * of as two spheres parked in the same place.
 *
 * Two things here are about cost rather than looks, because a raymarcher pays
 * per pixel for every step and every blob.
 *
 * The ray is advanced straight to a bounding sphere around the whole swarm
 * before any marching starts, and a ray that misses the bounding sphere is
 * abandoned on the spot. Without that, every pixel of empty background runs
 * the full loop to find nothing, which on a backdrop is most of the frame.
 *
 * And the loop breaks on a hit rather than running to the step count. Sphere
 * tracing converges fast once it is close, so a typical hit is a dozen steps
 * even where the ceiling is fifty.
 */

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_period;

uniform vec3  u_background;
uniform vec3  u_body;
uniform vec3  u_light;
uniform float u_count;
uniform float u_radius;
uniform float u_blend;
uniform float u_orbit;
uniform float u_detail;
uniform float u_shine;
uniform float u_seed;

out vec4 fragColor;

const float TAU = 6.28318530718;
const int MAX_BLOBS = 9;
const int MAX_STEPS = 96;

/*
 * Polynomial smooth minimum. Blends two fields over a band of width k and
 * costs one mix and one clamp, which is why it is this one rather than the
 * exponential version: inside a loop that runs per step per pixel, an exp() is
 * not free and nothing here can tell the difference.
 */
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

/*
 * Where blob i is at time t.
 *
 * Two circles at right angles with whole numbers of turns in a period, so the
 * path is closed and the blob is exactly where it started when the loop comes
 * round. Whole turns are not a nicety: a fractional multiplier here is a jump
 * once a cycle in the recorded video, and it has shipped twice in this
 * library.
 */
vec3 blobAt(int i, float t) {
  float fi = float(i);
  float phase = TAU * t / u_period;

  /* Golden angle, so the blobs do not set off in a rosette. */
  float a = fi * 2.39996323 + u_seed * 0.9;

  /* Small whole turn counts, different per axis, so the paths are not circles
     traced in lockstep but something closer to a slow tumble. */
  float na = 1.0 + mod(fi, 3.0);
  float nb = 2.0 + mod(fi * 2.0 + 1.0, 3.0);

  return u_orbit * vec3(
    cos(na * phase + a),
    sin(nb * phase + a * 1.7),
    0.6 * sin(na * phase + a * 2.3)
  );
}

float map(vec3 p) {
  int count = int(clamp(u_count, 1.0, float(MAX_BLOBS)));
  float d = length(p - blobAt(0, u_time)) - u_radius;

  for (int i = 1; i < MAX_BLOBS; i++) {
    if (i >= count) break;
    float di = length(p - blobAt(i, u_time)) - u_radius;
    d = smin(d, di, u_blend);
  }
  return d;
}

/*
 * The normal, by the tetrahedron trick: four samples rather than the six a
 * central difference on three axes would take. On a surface this smooth the
 * difference is invisible and it is a third off the most expensive thing in
 * the shader after the march itself.
 */
vec3 normalAt(vec3 p) {
  vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(
    e.xyy * map(p + e.xyy) +
    e.yyx * map(p + e.yyx) +
    e.yxy * map(p + e.yxy) +
    e.xxx * map(p + e.xxx)
  );
}

void main() {
  /*
   * Normalised on the short side, so the swarm is the same size in portrait
   * and landscape rather than being cropped by whichever way the panel runs.
   */
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  /*
   * Far enough back that the whole swarm fits the short side with room around
   * it. The first version sat at 3.1 with a long lens and the blobs were
   * cropped by every edge, which reads as a close-up of something rather than
   * as a field of things.
   */
  vec3 ro = vec3(0.0, 0.0, 4.4);
  vec3 rd = normalize(vec3(uv, -1.0));

  /*
   * Skip to the bounding sphere. The swarm reaches orbit + radius from the
   * origin, plus the blend band, and everything outside that is empty. A ray
   * that misses it is finished here, which on a backdrop is most of the frame.
   */
  float bound = u_orbit + u_radius + u_blend;
  float b = dot(ro, rd);
  float c = dot(ro, ro) - bound * bound;
  float disc = b * b - c;

  vec3 col = u_background;

  if (disc > 0.0) {
    float entry = max(-b - sqrt(disc), 0.0);
    float exitAt = -b + sqrt(disc);

    float travelled = entry;
    bool hit = false;
    int steps = int(clamp(u_detail, 8.0, float(MAX_STEPS)));

    for (int i = 0; i < MAX_STEPS; i++) {
      if (i >= steps) break;
      vec3 p = ro + rd * travelled;
      float d = map(p);

      /*
       * The hit threshold grows with distance, because a pixel does.
       *
       * A ray is a cone, not a line: the patch of the world one pixel covers
       * gets wider the further along it you look, and a surface closer than
       * that patch is a surface the pixel has already hit. A constant epsilon
       * ignores this, and the rays it fails are the ones that graze a
       * silhouette, where the field flattens out and the march crawls towards
       * a surface it never formally reaches before running out of steps. What
       * that draws is a thin dark splinter along the edge of a lobe, which
       * looked like a crack in the blob and was actually the march giving up.
       *
       * More steps shrinks it and never removes it: at twice the step count
       * it was still there, smaller. Scaling the threshold takes it down to a
       * hairline at a quarter of the cost, which is the trade taken here.
       */
      if (d < 0.0016 * travelled) {
        hit = true;
        break;
      }
      /*
       * Stepped short of what the field says is safe, because the field lies.
       *
       * Sphere tracing is only sound when the function returns a true lower
       * bound on the distance to the surface, and a smooth minimum does not:
       * it rounds the join outwards, so near a fillet the value overestimates
       * how far there is to go. A ray that takes it at face value steps
       * straight through the surface and out the other side, and what that
       * looks like is a thin dark crack across an otherwise solid blob, which
       * is exactly what the first version drew along every neck.
       *
       * Eight tenths is enough here. It is the cheapest fix available: the
       * alternative is dividing by the Lipschitz bound of the blend, which for
       * this smin is not a constant.
       */
      travelled += d * 0.75;
      if (travelled > exitAt) break;
    }

    if (hit) {
      vec3 p = ro + rd * travelled;
      vec3 n = normalAt(p);
      vec3 view = -rd;

      /*
       * One key light, a rim and a fresnel, which is as much as a blob needs.
       * The rim is what separates two blobs that are touching: without it the
       * neck between them is the same tone on both sides and the pair reads as
       * one lump rather than as two things merging.
       */
      vec3 key = normalize(vec3(0.55, 0.85, 0.6));
      float diffuse = clamp(dot(n, key) * 0.5 + 0.5, 0.0, 1.0);
      float fresnel = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 3.0);
      float spec = pow(clamp(dot(reflect(-key, n), view), 0.0, 1.0), 42.0);

      col = mix(u_background, u_body, 0.25 + 0.75 * diffuse);
      col += u_light * (fresnel * 0.5 + spec * u_shine);
    }
  }

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_time',
  'u_period',
  'u_background',
  'u_body',
  'u_light',
  'u_count',
  'u_radius',
  'u_blend',
  'u_orbit',
  'u_detail',
  'u_shine',
  'u_seed'
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
  if (!shader) throw new Error('MetaballField: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`MetaballField: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class MetaballFieldSurface implements Surface<MetaballFieldOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('MetaballField needs a canvas')
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
    if (!gl) throw new Error('MetaballField needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('MetaballField: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`MetaballField: program failed to link\n${log ?? ''}`)
    }

    this.gl = gl
    this.program = program
    this.vao = gl.createVertexArray()
    this.locations.clear()
    for (const name of UNIFORMS) {
      this.locations.set(name, gl.getUniformLocation(program, name))
    }
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
    this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight)
  }

  render(t: number, opts: MetaballFieldOptions): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)
    const loc = (name: UniformName) => this.locations.get(name) ?? null

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(loc('u_time'), t)
    gl.uniform1f(loc('u_period'), opts.period)
    gl.uniform3fv(loc('u_background'), rgb(opts.background))
    gl.uniform3fv(loc('u_body'), rgb(opts.body))
    gl.uniform3fv(loc('u_light'), rgb(opts.light))
    gl.uniform1f(loc('u_count'), opts.count)
    gl.uniform1f(loc('u_radius'), opts.radius)
    gl.uniform1f(loc('u_blend'), opts.blend)
    gl.uniform1f(loc('u_orbit'), opts.orbit)
    gl.uniform1f(loc('u_detail'), opts.detail)
    gl.uniform1f(loc('u_shine'), opts.shine)
    gl.uniform1f(loc('u_seed'), opts.seed)

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
    }
    this.gl = null
    this.program = null
    this.vao = null
    this.locations.clear()
  }
}

/**
 * Mount MetaballField into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const blobs = createMetaballField(document.querySelector('#hero')!)
 * blobs.start()
 * // …later
 * blobs.destroy()
 * ```
 */
export function createMetaballField(
  el: HTMLElement,
  opts: Partial<MetaballFieldOptions> = {}
): EffectHandle {
  return mount<MetaballFieldOptions>(el, opts, {
    defaults: metaballFieldDefaults,
    create: () => new MetaballFieldSurface()
  })
}

export default createMetaballField
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

MetaballField is a handful of blobs that merge and part, raymarched.

There is no geometry in it. The scene is a function: hand it a point in space
and it returns the distance to the nearest surface. The picture is made by
walking a ray forward by whatever that function says is safe, over and over,
until it arrives at something. That is sphere tracing.

It is done this way because of what it buys. Two meshes cannot flow into one
another without somebody rebuilding the mesh; two distance fields merge by
taking the smaller of the two, which is one line. Soften that minimum and the
join becomes a fillet, and the neck and pinch you get out of it are the whole
reason this reads as something liquid rather than as spheres parked in the same
place.

`blend` is that softening. At 0 the blobs interpenetrate with a visible crease
where they cross and the illusion is gone.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="hero" style="height: 70vh"></div>

<script type="module">
  import { createMetaballField } from './beamish/effects/metaball-field/core.js'

  const blobs = createMetaballField(document.querySelector('#hero'))
  blobs.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createMetaballField } from '@/beamish/effects/metaball-field/core'

export function Blobs() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const blobs = createMetaballField(host.current, { count: 7 })
    blobs.start()
    return () => blobs.destroy()
  }, [])

  return <div ref={host} className="absolute inset-0 -z-10" />
}
```

Mount once. Option changes go through `update()` rather than a remount, because
a remount is a new WebGL context and the budget for those is small.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createMetaballField } from '@/beamish/effects/metaball-field/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let blobs: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  blobs = createMetaballField(host.value)
  blobs.start()
})

onBeforeUnmount(() => blobs?.destroy())
</script>

<template>
  <div ref="host" class="blobs" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `background` | color | `#06060f` | any CSS hex | Behind the blobs. Nothing is drawn there, so it is a flat fill, and it is also what the body colour is mixed towards in shadow. |
| `body` | color | `#2f45d8` | any CSS hex | The body, seen where a surface faces the camera. Keep it close to the background in value: the shape is carried by the rim and the highlight, and a body that is much lighter flattens both. |
| `light` | color | `#ff9a4a` | any CSS hex | The light, seen in the rim and the highlight. Warm against a cool body is what gives the surface somewhere to turn through. |
| `count` | number | `7` | 1 to 9 (looks right between 4 and 7) | How many blobs. Along with detail, this is the cost: the distance function asks about every one of them at every step of every ray. |
| `radius` | number | `0.42` | 0.1 to 1.2 (looks right between 0.35 and 0.6) | Blob radius in scene units, where the swarm is about two units across. Large enough and they never part, which loses the thing worth watching. |
| `blend` | number | `0.6` | 0 to 1.5 (looks right between 0.3 and 0.8) | Width of the fillet where two blobs meet. At 0 they interpenetrate with a visible crease and read as two balls at the same address. Past about 1 they are one lump that never separates. |
| `orbit` | number | `1` | 0 to 1.6 (looks right between 0.5 and 1) | How far the blobs travel from the centre. This and radius together decide whether they ever actually part. |
| `detail` | number | `48` | 8 to 96 (looks right between 32 and 64) | Ceiling on raymarching steps. The thin necks between separating blobs are the first thing to go when this is low, and they are the part worth keeping. Most rays finish well short of the ceiling. |
| `shine` | number | `0.55` | 0 to 2 (looks right between 0.3 and 0.9) | How hard the highlight is. At 0 the surface is matte and reads as clay rather than as liquid. |
| `period` | number | `40` | 8 to 120 s (looks right between 24 and 60) | Seconds for one cycle. Every blob travels a whole number of turns in it, so they are all exactly where they started and the loop has no join. |
| `seed` | number | `2` | 0 to 9999 | Seed for the orbits and phases. Two of these side by side want two seeds. |

## 5. Three things that are about cost

A raymarcher pays per pixel for every step it takes and every blob it asks
about, so a naive one is the most expensive thing you can put on a page. This
one measures at 1.1ms, which is cheaper than several of the flat shader
backdrops here, and it is cheap for three reasons rather than because it is
doing less.

**The bounding sphere.** The swarm reaches a known distance from the origin and
everything outside that is empty. The ray is advanced straight to it, and a ray
that misses it is abandoned immediately. On a backdrop most of the frame is
empty, so most pixels never enter the march at all.

**The march breaks on a hit.** Sphere tracing converges fast once it is close,
so a typical hit costs about a dozen steps where `detail` allows fifty.

**Four samples for a normal, not six.** The tetrahedron trick. On a surface
this smooth there is nothing to see in the difference.

## 6. The splinter, and what it actually was

An early version drew a thin dark crack along the edge of a lobe. It looked
like the ray was stepping through the surface, which is the usual sin when a
smooth minimum is involved: `smin` rounds the join outwards, so near a fillet
it overestimates how far there is to go and is not a true lower bound. Stepping
three quarters of the reported distance is the standard guard and it is in
here.

That was not the cause. Doubling the step count only made the splinter smaller,
which is the signature of a different problem: **rays that graze a silhouette**.
There the field flattens out, the march crawls towards a surface it never
formally reaches, and it runs out of steps still just outside.

The fix is to notice that a ray is a cone rather than a line. The patch of the
world one pixel covers gets wider the further along it you look, so a surface
closer than that patch is a surface the pixel has already hit. The hit
threshold grows with distance for that reason, and the splinter drops to a
hairline for no cost at all.

## 7. Getting them to merge and part

Three settings decide this between them and they have to be set together:
`radius`, `orbit` and `blend`.

The blobs travel `orbit` from the centre and are `radius` across. If
`2 × radius` is comfortably more than the distances they get to, they never
separate and you have one lump that changes shape. If it is much less, they
never touch and you have spheres. The defaults sit where they do both in a
cycle, which is the interesting state.

`blend` then decides what the meeting looks like. Around a half to two thirds of
`radius` gives a proper neck. Much more and the pair never visibly separates
even when the centres do.

## 8. It is for a dark ground

Declared `dark`. The shape is carried by a rim light and a highlight against a
near-black fill, and `background` is both the empty part of the frame and what
the body is mixed towards in shadow. On paper you would be setting `background`
to the page colour and lighting a pale blob against it, at which point the rim
has nothing to separate it from.

## 9. Cost and how busy it is

1.1ms at 1280 by 720, against WaterCaustics at 1.00 and DustMotes at 1.20 on
the same run, and 0.360 mean absolute change per frame on a 0 to 255 scale
against WaterCaustics at 0.222.

It reads calmer than that figure, because what is moving is a few large smooth
shapes rather than fine detail, but it is not a quiet item. `period` is the
dial and the change is close to linear in it.

If you need it cheaper, `count` is the first thing to drop and it is linear.
`detail` is second and buys less than it looks, because most rays finish well
short of the ceiling.

## 10. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createMetaballField` from `useEffect`, `onMounted`, or a `client:*`
island.

## 11. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. A still frame of this is a perfectly good object, which is
not true of every item here.

## 12. The three mistakes most likely to be made here

1. **`blend` at or near 0.** The blobs interpenetrate with a visible crease and
   the whole point of doing this with distance fields is thrown away.

2. **A body colour much lighter than the background.** The form is carried by
   the rim and the highlight. Raise the body and you flatten both, and what is
   left is a silhouette.

3. **`radius` and `orbit` set without reference to each other.** Too much
   radius and they never part; too much orbit and they never meet. The item is
   the transition.

4. **Treating `detail` as the quality dial.** It is a ceiling, not a count.
   Most rays are nowhere near it, and raising it mostly buys thin necks you
   were not looking at.

5. **Putting it behind copy at the defaults.** The shapes are large, light and
   slow, which is exactly the kind of movement that pulls an eye off a line of
   text. Lengthen `period` and bring `body` closer to `background`.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
