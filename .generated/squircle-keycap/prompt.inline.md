You are adding **SquircleKeycap** from Beamish to this project.

> A key drawn as a superellipse and extruded, which travels when you press it. Surfaces · effect · MIT.
> https://beamish.ink/effects/squircle-keycap

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The shape is the point. A border-radius is a rectangle with circular arcs stuck on the corners, and the join between the straight edge and the arc is continuous in position and direction but not in curvature: it jumps from zero to one over the radius, instantly. A superellipse has no join at all, because it is one equation the whole way round
- Walked as a path rather than approximated, so the exponent is a real control: 2 is an ellipse, 4 is the shape everybody means, and by 12 it is a rectangle with a suggestion of a corner. No value of border-radius lands on any of them
- The exponent is applied to the absolute value of the cosine and the sign put back, because a fractional power of a negative number is not a number and the left half of the shape would simply not be drawn
- The travel is a closed form of the time since the press, so renderAtTime is pure in t. A key is state between frames by nature, which is the one thing this library will not have: the resolution is to keep the list of presses rather than the position and work the displacement out from the clock. Seeking backwards unpresses the key, which a spring integrated frame by frame can never do
- An attack and a decay, not a spring. A keycap does not oscillate: it goes down against a stop, fast and ending abruptly, and comes back on a rubber dome, slower and settling without overshoot
- The side is drawn as its own extrusion rather than as a drop shadow, which is the difference between a key and a sticker. It is also what makes the travel legible: the side gets shorter as the key goes down, and that is the part anyone actually reads
- The top is dished rather than domed. A keycap is concave so a fingertip sits in it, and what reports that is a soft dark edge at the top of the face, not a highlight in the middle
- A press anywhere on the element counts rather than only inside the drawn shape. A click two pixels outside the edge is a click the reader believes they made
- 2D rather than WebGL. A key is something you want several of on a page, and the budget is one WebGL context
- It is a drawing of a control, not a control. There is no role, no focus and no keyboard handling, because a canvas cannot carry them. Put it behind a real button if it is going to do something
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/squircle-keycap/core.ts`**

```ts
/*
 * SquircleKeycap: Beamish
 * https://beamish.ink/effects/squircle-keycap
 *
 * A key you can press, drawn as a superellipse rather than a rounded
 * rectangle, and extruded so that pressing it has somewhere to go.
 *
 * The shape is the point. `border-radius` gives a rectangle with circular arcs
 * stuck on the corners, and the join between the straight edge and the arc is
 * continuous in position and direction but not in curvature: the curvature
 * jumps from zero to one over the radius, instantly. Nobody can name that when
 * they see it and everybody can see it. A superellipse has no join at all,
 * because it is one equation the whole way round, and the curvature rises and
 * falls smoothly through the corner. That is what the shape on a keycap, a
 * phone icon or a Braun dial has been doing since long before anyone called it
 * a squircle.
 *
 * It is walked as a path here rather than approximated, so the exponent is a
 * real control: 2 is an ellipse, 4 is the familiar one, and by 12 it is a
 * rectangle with a hint of a corner. No value of `border-radius` lands on any
 * of them.
 *
 * The travel is a closed form of the time since each press, so renderAtTime
 * stays pure in `t`. A key is state between frames by nature, which is exactly
 * the thing this library will not have: the resolution is to keep the list of
 * presses rather than the position, rebuild the scripted ones from the options
 * on every frame, and work the displacement out from the clock. Seeking
 * backwards unpresses the key, which is what the recorder needs and what a
 * spring integrated frame by frame can never give.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type SquircleKeycapOptions = BaseOptions & {
  /** The surface the key sits on. */
  plate: string
  /** The top of the key. */
  cap: string
  /** The sides, which are what makes it a solid rather than a sticker. */
  side: string
  /** The legend, and the ring when the key has focus. */
  ink: string
  /** What is printed on the key. */
  legend: string
  /**
   * The superellipse exponent. 2 is an ellipse, 4 is the shape everybody means
   * by a squircle, 12 is a rectangle with a suggestion of a corner.
   */
  corner: number
  /** How much of the shorter side the key takes up. */
  size: number
  /** How tall the key stands, as a share of its width. */
  depth: number
  /** How far it goes down when pressed, as a share of its height. */
  travel: number
  /** Seconds the key takes to come back up. */
  snap: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const squircleKeycapDefaults: SquircleKeycapOptions = {
  plate: '#efece3',
  cap: '#fbfaf6',
  side: '#d6d1c4',
  ink: '#2b2a26',
  legend: 'K',
  corner: 4.2,
  size: 0.56,
  depth: 0.16,
  travel: 0.62,
  snap: 0.13
}

type Press = { t: number }

/*
 * The superellipse, walked.
 *
 * |x/a|^n + |y/b|^n = 1, parameterised so the points come out evenly enough
 * round the curve to draw as a polyline. The exponent is applied to the
 * absolute value and the sign put back, because a fractional power of a
 * negative number is not a number and the left half of the shape would vanish.
 *
 * Sampled at a fixed count rather than adaptively: the corners want the
 * density and the straights do not, but a keycap is small on the page and a
 * hundred and twenty points is already finer than the pixels under it.
 */
function squirclePath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  exponent: number
): void {
  const n = Math.max(2, exponent)
  const steps = 120
  ctx.beginPath()
  for (let i = 0; i <= steps; i += 1) {
    const theta = (i / steps) * Math.PI * 2
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    const x = cx + rx * Math.sign(c) * Math.abs(c) ** (2 / n)
    const y = cy + ry * Math.sign(s) * Math.abs(s) ** (2 / n)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/*
 * How far down the key is, given when it was last pressed.
 *
 * An attack and a decay rather than a spring. A keycap does not oscillate: it
 * goes down against a stop, which is fast and ends abruptly, and comes back on
 * a rubber dome, which is slower and settles without overshoot. Two
 * exponentials say that in one line and, more to the point, say it as a
 * function of the time since the press rather than of the frame before.
 */
function depression(sincePress: number, snap: number): number {
  if (sincePress < 0) return 0
  const attack = 0.018
  const release = Math.max(snap, 0.02)
  const down = 1 - Math.exp(-sincePress / attack)
  const up = Math.exp(-sincePress / release)
  return Math.max(0, Math.min(1, down * up * 1.05))
}

class SquircleKeycapSurface implements Surface<SquircleKeycapOptions> {
  private ctx: CanvasRenderingContext2D | null = null
  private host: HTMLElement | null = null
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private live: Press[] = []
  private onPress: ((event: PointerEvent) => void) | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('SquircleKeycap needs a canvas')
    const context = ctx.canvas.getContext('2d', { alpha: true })
    if (!context) {
      throw new Error('SquircleKeycap needs a 2D context, which this browser did not give')
    }
    this.ctx = context
    this.host = ctx.host

    /*
     * The whole element is the key, so a press anywhere on it counts. A hit
     * test against the squircle would be more correct and worse: the thing is
     * mounted in a box the author chose, and a click that lands two pixels
     * outside the drawn edge is a click the reader believes they made.
     */
    this.onPress = () => {
      this.live.push({ t: performance.now() / 1000 })
      if (this.live.length > 8) this.live.splice(0, this.live.length - 8)
    }
    ctx.host.addEventListener('pointerdown', this.onPress)
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
  }

  render(t: number, opts: SquircleKeycapOptions): void {
    const ctx = this.ctx
    if (!ctx) return

    const { pixelWidth: w, pixelHeight: h, dpr } = this.size
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = opts.plate
    ctx.fillRect(0, 0, w, h)
    ctx.scale(dpr, dpr)

    const width = w / dpr
    const height = h / dpr
    const short = Math.min(width, height)

    /*
     * Scripted presses and real ones are the same kind of thing, so they go in
     * the same reckoning. The scripted ones are read from the options every
     * frame rather than remembered, which is what keeps a scripted take pure
     * in t: seeking backwards un-presses them.
     */
    let sincePress = Infinity
    for (const key of opts.pressPath ?? []) {
      if (key.t <= t) sincePress = Math.min(sincePress, t - key.t)
    }
    const now = performance.now() / 1000
    for (const press of this.live) {
      const age = now - press.t
      if (age >= 0) sincePress = Math.min(sincePress, age)
    }

    const pressed = depression(sincePress, opts.snap)

    const capWidth = short * opts.size
    const capHeight = capWidth
    const rx = capWidth / 2
    const ry = capHeight / 2
    const stand = capWidth * opts.depth
    const sink = stand * opts.travel * pressed

    const cx = width / 2
    /* The resting cap sits above its own shadow, so the whole assembly is
       centred rather than the top face being centred and the body hanging
       below it off the bottom of the box. */
    const cy = height / 2 - stand / 2 + sink

    /*
     * The body first: the same shape, offset down by what is left of the
     * stand. Drawing the side as its own extrusion rather than as a drop
     * shadow is the difference between a key and a sticker with a shadow, and
     * it is also what makes the travel legible: when the key goes down the
     * side gets shorter, which is the only part of this anyone actually reads.
     */
    const remaining = stand - sink
    if (remaining > 0.5) {
      ctx.fillStyle = opts.side
      squirclePath(ctx, cx, cy + remaining, rx, ry, opts.corner)
      ctx.fill()
      /* The web between the two faces. A single offset copy leaves a notch at
         the widest point of the curve, so the gap is filled with a rectangle
         across the straight part where the two outlines are parallel. */
      ctx.fillRect(cx - rx, cy, rx * 2, remaining)
    }

    /* A contact shadow, which is small and tight and disappears as the key
       lands. Keys do not float. */
    const contact = (1 - pressed) * stand * 0.5
    if (contact > 0.5) {
      ctx.save()
      ctx.globalAlpha = 0.16 * (1 - pressed)
      ctx.fillStyle = opts.ink
      squirclePath(ctx, cx, cy + remaining + contact * 0.4, rx * 0.98, ry * 0.98, opts.corner)
      ctx.filter = 'blur(0px)'
      ctx.fill()
      ctx.restore()
    }

    /* The top face. */
    ctx.fillStyle = opts.cap
    squirclePath(ctx, cx, cy, rx, ry, opts.corner)
    ctx.fill()

    /*
     * A dish, not a dome. A keycap is concave: the top is scooped so a
     * fingertip sits in it, and the light that reports that is a soft dark
     * edge at the top of the face rather than a highlight in the middle. Drawn
     * as a gradient clipped to the face.
     */
    ctx.save()
    squirclePath(ctx, cx, cy, rx, ry, opts.corner)
    ctx.clip()
    const dish = ctx.createLinearGradient(0, cy - ry, 0, cy + ry)
    dish.addColorStop(0, 'rgba(0,0,0,0.085)')
    dish.addColorStop(0.55, 'rgba(0,0,0,0)')
    dish.addColorStop(1, 'rgba(255,255,255,0.3)')
    ctx.fillStyle = dish
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2)
    ctx.restore()

    /* The legend. */
    if (opts.legend) {
      ctx.fillStyle = opts.ink
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const face = getComputedStyle(this.host ?? document.body).fontFamily || 'monospace'
      ctx.font = `${Math.round(capWidth * 0.3)}px ${face}`
      ctx.fillText(opts.legend, cx, cy + capHeight * 0.02)
    }
  }

  teardown(): void {
    if (this.host && this.onPress) this.host.removeEventListener('pointerdown', this.onPress)
    this.onPress = null
    this.host = null
    this.ctx = null
    this.live = []
  }
}

/**
 * Mount SquircleKeycap into `el`. The element needs a size, in CSS, not just
 * content, and a press anywhere on it presses the key.
 *
 * ```ts
 * const key = createSquircleKeycap(document.querySelector('#key')!, { legend: 'K' })
 * key.start()
 * // …later
 * key.destroy()
 * ```
 */
export function createSquircleKeycap(
  el: HTMLElement,
  opts: Partial<SquircleKeycapOptions> = {}
): EffectHandle {
  return mount<SquircleKeycapOptions>(el, opts, {
    defaults: squircleKeycapDefaults,
    create: () => new SquircleKeycapSurface()
  })
}

export default createSquircleKeycap
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
    const dt = Math.min(stamp - lastStamp, 100) / 1000 // clamp tab-switch spikes
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

SquircleKeycap is a key you can press: a superellipse, extruded, that travels
when you push it and comes back on a rubber dome.

## 3. Wire it in

**Plain HTML.** The element needs a size. A press anywhere on it presses the
key.

```html
<div id="key" style="width: 160px; height: 160px"></div>

<script type="module">
  import { createSquircleKeycap } from './beamish/effects/squircle-keycap/core.js'

  const key = createSquircleKeycap(document.querySelector('#key'), { legend: 'K' })
  key.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createSquircleKeycap } from '@/beamish/effects/squircle-keycap/core'

export function Key({ legend }: { legend: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const key = createSquircleKeycap(host.current, { legend })
    key.start()
    return () => key.destroy()
  }, [legend])

  return <div ref={host} className="size-40" />
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSquircleKeycap } from '@/beamish/effects/squircle-keycap/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let key: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  key = createSquircleKeycap(host.value, { legend: 'K' })
  key.start()
})

onBeforeUnmount(() => key?.destroy())
</script>

<template>
  <div ref="host" class="key" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `plate` | color | `#efece3` | any CSS hex | The surface the key sits on. Slightly darker than the cap, because a key is lighter than the thing it is set into and that difference is most of what says it stands up. |
| `cap` | color | `#fbfaf6` | any CSS hex | The top of the key. |
| `side` | color | `#d6d1c4` | any CSS hex | The sides, which are what makes it a solid rather than a sticker. It wants to be a clear step darker than the cap: this is a facet turned away from the light, not a shadow. |
| `ink` | color | `#2b2a26` | any CSS hex | The legend, and the contact shadow under the key. |
| `legend` | string | `K` | any value | What is printed on the key. One or two characters: it is set at under a third of the key's width, and a word at that size is a label on a key rather than a key. |
| `corner` | number | `4.2` | 2 to 16 (looks right between 3 and 6) | The superellipse exponent. 2 is an ellipse, 4 is the shape everybody means by a squircle, and by 12 it is a rectangle with a hint of a corner. The useful range is narrow and the difference inside it is the whole item. |
| `size` | number | `0.56` | 0.15 to 0.9 | How much of the shorter side of the element the key takes up. |
| `depth` | number | `0.16` | 0.02 to 0.4 (looks right between 0.1 and 0.24) | How tall the key stands, as a share of its width. This is the thing the press has to eat into, so a flat key has nowhere to travel and reads as a flicker. |
| `travel` | number | `0.62` | 0.1 to 1 (looks right between 0.5 and 0.8) | How far down it goes when pressed, as a share of its height. At 1 it bottoms out flush with the plate, which reads as broken rather than as pressed. |
| `snap` | number | `0.13` | 0.03 to 0.6 (looks right between 0.08 and 0.2) | Seconds the key takes to come back up. The way down is fixed and fast, because that is a key hitting a stop; this is the rubber dome, and it is the only half with any character in it. |

## 5. The shape is the point

`border-radius` gives you a rectangle with circular arcs stuck on the corners.
The join between the straight edge and the arc is continuous in position and in
direction, but not in curvature: curvature goes from zero to one over the
radius, instantly, at that one point. Nobody can name that when they see it and
everybody can see it.

A superellipse has no join at all. It is one equation the whole way round,
`|x/a|^n + |y/b|^n = 1`, and the curvature rises and falls smoothly through the
corner. It is the shape a keycap, a phone icon and a Braun dial have been for
far longer than anyone has said "squircle".

It is walked as a path here rather than approximated with Bézier curves, so
`corner` is a real control rather than a lookalike. 2 is an ellipse, 4 is the
shape everybody means, and by 12 it is a rectangle with a suggestion of a
corner. No value of `border-radius` lands on any of them.

One implementation note, because it is the thing that goes wrong: the exponent
has to be applied to the absolute value and the sign put back afterwards. A
fractional power of a negative number is not a number, and the left half of the
shape is simply never drawn.

## 6. How a key can travel without keeping state

`renderAtTime` has to be pure in `t`, and a key is state between frames by
nature: whether it is down depends on something that happened earlier.

The resolution is to keep the list of **presses** rather than the position, and
work the displacement out from the clock each frame. Scripted presses are read
from the options every frame rather than remembered, so seeking backwards
unpresses the key. A spring integrated frame by frame can never do that, and
the recorder would get a different take every time it ran.

The displacement itself is an attack and a decay rather than a spring, because
a keycap does not oscillate: it goes down against a stop, which is fast and
ends abruptly, and comes back on a rubber dome, which is slower and settles
without overshoot. Two exponentials say that in one line.

## 7. It is a drawing of a control, not a control

This matters more here than for anything else in the library, because it looks
exactly like a thing you would click to do something.

A canvas has no role, no focus, no label and no keyboard handling, and none of
that can be added to it. If the key is going to **do** something, put a real
`<button>` on the page and mount this inside it:

```html
<button class="key" aria-label="Run the task">
  <span data-keycap style="display: block; width: 100%; height: 100%"></span>
</button>
```

Mount on the inner span, give the button the usual reset and a focus ring of
its own, and you have a real control with this as its face. Everything that
makes a button a button stays in the DOM where screen readers and keyboards can
find it.

## 8. The legend is set in the host's font

Deliberately: a thing pasted into somebody else's page should look like it
belongs to that page. It reads the computed `font-family` of the element it is
mounted on, so set that where you want it rather than passing a face in.

One or two characters. It is drawn at under a third of the key's width, and a
word at that size is a label on a key rather than a key.

## 9. Getting the press to read

The travel is legible because the **side** gets shorter, not because the face
moves: the face moving a few pixels is almost invisible, and the band of colour
below it collapsing is not.

So the two settings that matter are `depth` and `travel`. A key with too little
`depth` has nowhere to go and the press reads as a flicker. A `travel` of 1
bottoms the cap out flush with the plate, which reads as broken rather than as
pressed. The defaults keep a visible lip at the bottom of the stroke.

`side` wants to be a clear step darker than `cap`. It is a facet turned away
from the light, not a shadow, and treating it as a shadow is what makes these
look like stickers.

## 10. Cost

0.5ms: two filled paths of a hundred and twenty points, a clipped gradient and
one glyph. It holds no WebGL context, which is the reason it is 2D: a key is
something you want several of on a page, and the context budget is one.

## 11. Cleanup and SSR

`destroy()` removes the press listener, cancels the RAF, disconnects both
observers and clears the canvas.

There is nothing to render on the server. The element is empty until the first
frame. Call `createSquircleKeycap` from `useEffect`, `onMounted`, or a
`client:*` island.

## 12. Pausing and reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one
frame is drawn, which is the key at rest. The press is a response to an action
rather than ambient movement, so there is nothing here that needs pausing.

## 13. The three mistakes most likely to be made here

1. **Using it as a button.** It is a picture. Put a real `<button>` round it.

2. **Too little `depth`.** The press has nowhere to go and reads as a flicker
   rather than as travel.

3. **A `side` that is nearly the same colour as the cap.** The extrusion
   disappears and you have a flat shape with a shadow, which is the thing a
   superellipse was supposed to save you from.

4. **A long word as the legend.** It is set at a third of the key's width.

5. **Raising `corner` past about 8 to make it look crisper.** It stops being a
   squircle and becomes a rounded rectangle, which you could have had from CSS
   for nothing.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
