You are adding **HighlighterMark** from Beamish to this project.

> Somebody going through a page with a highlighter, marking one phrase at a time, overshooting the ends. Type · effect · MIT.
> https://beamish.ink/effects/highlighter-mark

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- It marks the `<mark>` elements already in the text, and that is the whole interface. The browser has had an element for this bit matters since HTML 4 and screen readers announce it, so a page using it reads correctly with the effect off, with CSS off and in a feed reader. Nothing here parses prose, searches for strings or wraps words in spans
- Not a CSS background. An animated linear-gradient gets the sweep right and everything else wrong: the band is level, the edges are straight by construction, it stops exactly on the last letter, and the ink is the same everywhere
- A hand does none of those. The band has a slight slope, the edges are ragged at the scale of the tip, the stroke overshoots the phrase by a different amount at each end, and the ink doubles where the pen went back over it. The second pass is most of what makes it read as a pen rather than as a fill
- Blended with multiply, because that is what translucent ink on paper does: the glyphs stay on top and darken the ink rather than being covered by it. It is also why this is a paper item and has no dark version. Multiply against a dark ground is black
- A phrase that wraps gets one stroke per line, because that is what a person does, and getClientRects already returns exactly those boxes
- The geometry is built once and the animation is a clip rectangle widening over it, so a frame costs one attribute per stroke. Rebuilt only on resize or when an option that changes the shape changes, because measuring forces layout
- The host is promoted to position: relative if it is static, because the overlay is absolutely positioned inside it, and a static host silently puts every stroke at the top left of the page. Put back on teardown
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/highlighter-mark/core.ts`**

```ts
/*
 * HighlighterMark: Beamish
 * https://beamish.ink/effects/highlighter-mark
 *
 * Somebody going through a page with a highlighter, one phrase at a time.
 *
 * WHAT IT MARKS
 *
 * The `<mark>` elements already in the text. That is the whole interface, and
 * it is deliberate: the browser has had an element for "this bit matters" since
 * HTML 4, screen readers announce it, and a page that uses it reads correctly
 * with this effect switched off, with CSS off, and in a feed reader. Nothing
 * here parses prose, searches for strings, or wraps words in spans, so the text
 * selects and copies exactly as it did before.
 *
 * WHY IT IS NOT A CSS BACKGROUND
 *
 * `background: linear-gradient(...)` with an animated size is the usual way, and
 * it gets the sweep right and everything else wrong. A highlighter is a wet,
 * wide, soft-tipped pen held by a hand, and four things follow from that which a
 * background cannot do:
 *
 *   The band is not level. A hand draws a slight slope and the pen is not held
 *   square, so the top and bottom edges are not parallel.
 *
 *   The edges are ragged at the scale of the tip, not smooth at the scale of
 *   the box. A background edge is a straight line by construction.
 *
 *   It overshoots. Nobody stops exactly on the last letter: the stroke runs
 *   past the word at both ends, and by different amounts.
 *
 *   The ink is darker where the pen went twice and where it stopped. That
 *   second pass down the middle is most of what makes it read as a pen rather
 *   than as a fill.
 *
 * So each mark becomes a polygon in one SVG laid over the text, blended with
 * `multiply` because that is what translucent ink on paper does: the glyphs
 * stay on top and darken the ink rather than being covered by it.
 *
 * A phrase that wraps gets one stroke per line, because that is what a person
 * does, and `getClientRects` already returns exactly those boxes.
 *
 * ONE SHOT
 *
 * It marks and it is done, which is what a person does. The order is the order
 * the marks appear in the document, each one starting a little after the last,
 * and `t` is seconds from the start, so the whole thing is a function of t and
 * the recorder can ask for any frame of it.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type HighlighterMarkOptions = BaseOptions & {
  /** What to mark. Defaults to the element HTML already has for the job. */
  selector: string
  /** The ink. */
  ink: string
  /** How opaque one pass of the pen is, 0 to 1. */
  strength: number
  /** Band height, as a share of the line's height. */
  height: number
  /** How far the stroke runs past the phrase at each end, in pixels. */
  overshoot: number
  /** Slope of the hand, in degrees. */
  tilt: number
  /** How ragged the edges are, in pixels. */
  rag: number
  /** Milliseconds for one stroke to be drawn. */
  duration: number
  /** Milliseconds between the start of one stroke and the next. */
  stagger: number
  /** Milliseconds of stillness before the first stroke. */
  hold: number
  /** Seed for the hand. The same seed draws the same strokes. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const highlighterMarkDefaults: HighlighterMarkOptions = {
  selector: 'mark',
  ink: '#ffe14d',
  strength: 0.55,
  height: 0.72,
  overshoot: 7,
  tilt: 1.1,
  rag: 1.6,
  duration: 420,
  stagger: 260,
  hold: 260,
  seed: 3
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** One hash, one point on an edge. Stable for a given index and seed. */
function hash(n: number, seed: number): number {
  const x = Math.sin(n * 91.73 + seed * 47.11 + 13.7) * 43758.5453123
  return x - Math.floor(x)
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/* Fast at the start and settling at the end: a pen is thrown, not driven. */
const easeOutCubic = (n: number) => 1 - Math.pow(1 - n, 3)

type Stroke = {
  /** The band, as an SVG polygon points list. */
  points: string
  /** The second pass down the middle, which is where the ink doubles. */
  core: string
  left: number
  width: number
  group: SVGGElement
  clip: SVGRectElement
}

class HighlighterMarkSurface implements Surface<HighlighterMarkOptions> {
  private host: HTMLElement | null = null
  private svg: SVGSVGElement | null = null
  private defs: SVGDefsElement | null = null
  private strokes: Stroke[] = []
  private builtFor = ''
  private restorePosition = ''

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host

    /*
     * The overlay is absolutely positioned inside the host, so the host has to
     * be a containing block. A static host is the common case and silently puts
     * every stroke at the top left of the page, so it is promoted here and put
     * back in teardown.
     */
    const position = getComputedStyle(ctx.host).position
    if (position === 'static') {
      this.restorePosition = ctx.host.style.position
      ctx.host.style.position = 'relative'
    }

    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('aria-hidden', 'true')
    svg.style.position = 'absolute'
    svg.style.inset = '0'
    svg.style.width = '100%'
    svg.style.height = '100%'
    svg.style.pointerEvents = 'none'
    svg.style.overflow = 'visible'
    /*
     * Multiply, so the glyphs darken the ink instead of being covered by it.
     * This is the one line that makes it ink rather than a sticker, and it is
     * also why the item is for paper: multiply against a dark ground is black.
     */
    svg.style.mixBlendMode = 'multiply'

    this.defs = document.createElementNS(SVG_NS, 'defs')
    svg.appendChild(this.defs)
    ctx.host.appendChild(svg)
    this.svg = svg
  }

  /*
   * Measure the marks and build a stroke for each line of each one.
   *
   * Rebuilt only when something that changes the geometry changes, because
   * getClientRects forces layout and this would otherwise run every frame.
   */
  private build(opts: HighlighterMarkOptions): void {
    const host = this.host
    const svg = this.svg
    const defs = this.defs
    if (!host || !svg || !defs) return

    const box = host.getBoundingClientRect()
    const key = [
      opts.selector,
      opts.height,
      opts.overshoot,
      opts.tilt,
      opts.rag,
      opts.seed,
      Math.round(box.width),
      Math.round(box.height)
    ].join('|')
    if (key === this.builtFor) return
    this.builtFor = key

    for (const stroke of this.strokes) stroke.group.remove()
    defs.replaceChildren()
    this.strokes = []

    const marks = host.querySelectorAll<HTMLElement>(opts.selector)
    let n = 0

    marks.forEach(mark => {
      // One stroke per line. A phrase that wraps is two passes of the pen, and
      // getClientRects already returns exactly those boxes.
      for (const rect of Array.from(mark.getClientRects())) {
        const seedN = n++
        const h = rect.height * opts.height
        const left = rect.left - box.left - opts.overshoot * (0.6 + hash(seedN, opts.seed) * 0.8)
        const right =
          rect.right - box.left + opts.overshoot * (0.6 + hash(seedN + 50, opts.seed) * 0.8)
        const width = Math.max(right - left, 1)
        // Sat on the baseline rather than centred: a highlighter covers the
        // body of the line and lets the ascenders out of the top.
        const mid = rect.top - box.top + rect.height * 0.62

        const slope = Math.tan((opts.tilt * (hash(seedN + 7, opts.seed) - 0.3)) * (Math.PI / 180))

        /*
         * The band, as a polygon walked out along the top and back along the
         * bottom. The two edges are ragged independently, because a soft tip
         * wears differently on each side of the stroke.
         */
        const steps = Math.max(4, Math.round(width / 14))
        const top: string[] = []
        const bottom: string[] = []
        for (let i = 0; i <= steps; i++) {
          const s = i / steps
          const x = left + s * width
          const drop = (s - 0.5) * width * slope
          const ragTop = (hash(seedN * 31 + i, opts.seed) - 0.5) * 2 * opts.rag
          const ragBottom = (hash(seedN * 31 + i + 500, opts.seed) - 0.5) * 2 * opts.rag
          // The ends are rounded off, so the stroke has a tip rather than a
          // corner. A square end is the clearest sign of a rectangle.
          const taper = Math.min(1, Math.min(s, 1 - s) * 8)
          const half = (h / 2) * (0.55 + 0.45 * taper)
          top.push(`${x.toFixed(2)},${(mid + drop - half + ragTop).toFixed(2)}`)
          bottom.push(`${x.toFixed(2)},${(mid + drop + half + ragBottom).toFixed(2)}`)
        }
        bottom.reverse()

        /*
         * The second pass. Shorter, thinner and set low, because a hand going
         * back over a line does not retrace it exactly, and the doubled ink is
         * most of what makes this read as a pen.
         */
        const coreTop: string[] = []
        const coreBottom: string[] = []
        const from = 0.06 + hash(seedN + 11, opts.seed) * 0.1
        const to = 0.82 + hash(seedN + 13, opts.seed) * 0.12
        for (let i = 0; i <= steps; i++) {
          const s = from + (i / steps) * (to - from)
          const x = left + s * width
          const drop = (s - 0.5) * width * slope
          const half = h * 0.26
          const wobble = (hash(seedN * 17 + i, opts.seed) - 0.5) * opts.rag
          coreTop.push(`${x.toFixed(2)},${(mid + drop - half + h * 0.1 + wobble).toFixed(2)}`)
          coreBottom.push(`${x.toFixed(2)},${(mid + drop + half + h * 0.1 + wobble).toFixed(2)}`)
        }
        coreBottom.reverse()

        const group = document.createElementNS(SVG_NS, 'g')
        const clipId = `beamish-hm-${seedN}-${Math.random().toString(36).slice(2, 8)}`
        const clipPath = document.createElementNS(SVG_NS, 'clipPath')
        clipPath.setAttribute('id', clipId)
        const clip = document.createElementNS(SVG_NS, 'rect')
        clip.setAttribute('x', String(left))
        clip.setAttribute('y', String(mid - h * 2))
        clip.setAttribute('height', String(h * 4))
        clip.setAttribute('width', '0')
        clipPath.appendChild(clip)
        defs.appendChild(clipPath)
        group.setAttribute('clip-path', `url(#${clipId})`)

        const band = document.createElementNS(SVG_NS, 'polygon')
        band.setAttribute('points', [...top, ...bottom].join(' '))
        const core = document.createElementNS(SVG_NS, 'polygon')
        core.setAttribute('points', [...coreTop, ...coreBottom].join(' '))

        group.appendChild(band)
        group.appendChild(core)
        svg.appendChild(group)

        this.strokes.push({
          points: [...top, ...bottom].join(' '),
          core: [...coreTop, ...coreBottom].join(' '),
          left,
          width,
          group,
          clip
        })
      }
    })
  }

  resize(): void {
    // Force a rebuild: every stroke is measured against a layout that has moved.
    this.builtFor = ''
  }

  render(t: number, opts: HighlighterMarkOptions): void {
    this.build(opts)

    const hold = Math.max(opts.hold, 0) / 1000
    const duration = Math.max(opts.duration, 1) / 1000
    const stagger = Math.max(opts.stagger, 0) / 1000

    for (let i = 0; i < this.strokes.length; i++) {
      const stroke = this.strokes[i]!
      const started = hold + i * stagger
      const progress = easeOutCubic(clamp01((t - started) / duration))

      // The clip is what draws the stroke: the geometry never changes, only how
      // much of it the pen has reached.
      stroke.clip.setAttribute('width', (stroke.width * progress).toFixed(2))

      const band = stroke.group.firstChild as SVGPolygonElement | null
      const core = stroke.group.lastChild as SVGPolygonElement | null
      if (band) {
        band.setAttribute('fill', opts.ink)
        band.setAttribute('fill-opacity', String(opts.strength))
      }
      if (core && core !== band) {
        core.setAttribute('fill', opts.ink)
        /*
         * Not twice the strength. Two passes of a translucent ink multiply
         * rather than add, so the second pass takes what is left rather than
         * doubling what is there.
         */
        core.setAttribute('fill-opacity', String(opts.strength * 0.55))
      }
    }
  }

  teardown(): void {
    for (const stroke of this.strokes) stroke.group.remove()
    this.strokes = []
    this.svg?.remove()
    this.svg = null
    this.defs = null
    this.builtFor = ''
    if (this.host && this.restorePosition !== undefined) {
      this.host.style.position = this.restorePosition
    }
    this.host = null
  }
}

/**
 * Mount HighlighterMark onto a block of text. Every `<mark>` inside it is
 * marked, in document order.
 *
 * ```html
 * <p id="brief">The rule is <mark>scope to the surface</mark>, every time.</p>
 * ```
 *
 * ```ts
 * const pen = createHighlighterMark(document.querySelector('#brief')!)
 * pen.start()
 * // …later
 * pen.destroy()
 * ```
 *
 * The text is never taken apart, so it selects, wraps and reads exactly as it
 * did before, and `<mark>` means the right thing with the effect switched off.
 */
export function createHighlighterMark(
  el: HTMLElement,
  opts: Partial<HighlighterMarkOptions> = {}
): EffectHandle {
  return mount<HighlighterMarkOptions>(el, opts, {
    defaults: highlighterMarkDefaults,
    kind: 'dom',
    create: () => new HighlighterMarkSurface()
  })
}

export default createHighlighterMark
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

HighlighterMark is somebody going through a page with a highlighter, marking
one phrase at a time and overshooting the ends.

## 3. Wire it in

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createHighlighterMark } from '@/beamish/effects/highlighter-mark/core'

export function Brief() {
  const host = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pen = createHighlighterMark(host.current, { ink: '#ffe14d' })
    pen.start()
    return () => pen.destroy()
  }, [])

  return (
    <p ref={host}>
      The rule is <mark>scope to the surface</mark>, every time.
    </p>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createHighlighterMark } from '@/beamish/effects/highlighter-mark/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pen: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pen = createHighlighterMark(host.value)
  pen.start()
})

onBeforeUnmount(() => pen?.destroy())
</script>

<template>
  <p ref="host">The rule is <mark>scope to the surface</mark>, every time.</p>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `selector` | string | `mark` | any value | What to mark, inside the element this is mounted on. The default is the element HTML already has for the job, and using anything else means the page stops saying what it means when the effect is off. |
| `ink` | color | `#ffe14d` | any CSS hex | The ink. Highlighter yellow is yellow because it is the hue that darkens text least at a given opacity: a blue of the same strength takes a paragraph down to grey. Any colour works, but check the text through it before shipping a dark one. |
| `strength` | number | `0.55` | 0.05 to 1 (looks right between 0.35 and 0.7) | How opaque one pass of the pen is. The second pass goes over the first and multiplies rather than adds, so the middle of a stroke is always darker than this. Past about 0.8 the text underneath starts to struggle, which is a contrast failure rather than a look. |
| `height` | number | `0.72` | 0.3 to 1.4 | Band height as a share of the line's height. Under 1 by default, and sat low on the line, because a highlighter covers the body of the text and lets the ascenders out of the top. At 1.2 it is a wide chisel tip and starts to touch the line above. |
| `overshoot` | number | `7` | 0 to 40 px (looks right between 4 and 14) | How far the stroke runs past the phrase, with a different amount drawn at each end from the seed. Nobody stops exactly on the last letter, and at 0 this reads as a rectangle that happens to be ragged. |
| `tilt` | number | `1.1` | 0 to 6 deg | Slope of the hand. A degree is enough: it is the difference between a stroke and a highlight, and it is the first thing to turn down if the marks start to look untidy rather than human. |
| `rag` | number | `1.6` | 0 to 8 px | How ragged the edges are, at the scale of the pen tip. The two edges are ragged independently, because a soft tip wears differently on each side. At 0 the stroke is a clean polygon, which is a sticker. |
| `duration` | number | `420` | 80 to 3000 ms (looks right between 250 and 700) | Milliseconds for one stroke to be drawn, eased out, because a pen is thrown rather than driven. A long duration reads as a machine filling a box; this is somebody moving their wrist once. |
| `stagger` | number | `260` | 0 to 3000 ms | Milliseconds between the start of one stroke and the next. Less than the duration, so a reader is still finishing one mark as the next begins, which is what reading with a pen in your hand looks like. At 0 every mark appears at once and the sequence is lost. |
| `hold` | number | `260` | 0 to 5000 ms | Milliseconds of stillness before the first stroke. The page should be readable for a moment before anything is marked on it, or the marks arrive before anybody has seen what is being marked. |
| `seed` | number | `3` | 0 to 9999 | Seed for the hand: the rag on both edges, the slope of each stroke, how far each one overshoots and where the second pass starts and stops. The same seed draws the same strokes every time. |

## 5. It marks the `<mark>` elements already in your text

That is the whole interface.

```html
<p id="brief">
  The rule is <mark>scope to the surface</mark>, and the reason is that
  <mark>a token used in three places is three decisions</mark>.
</p>
```

```ts
const pen = createHighlighterMark(document.querySelector('#brief')!)
pen.start()
```

The browser has had an element for "this bit matters" since HTML 4 and screen
readers announce it, so the page reads correctly with the effect switched off,
with CSS off, and in a feed reader. Nothing here parses prose, searches for
strings or wraps words in spans, so the text selects and copies exactly as it
did before.

Set `selector` if you must, but anything else means the page stops saying what
it means when the effect is not running.

## 6. Why it is not a CSS background

An animated `linear-gradient` is the usual way and it gets the sweep right and
everything else wrong. A highlighter is a wet, wide, soft-tipped pen held in a
hand, and four things follow from that which a background cannot do:

- **The band is not level.** A hand draws a slight slope and the pen is not held
  square, so the top and bottom edges are not parallel.
- **The edges are ragged at the scale of the tip**, not smooth at the scale of
  the box. A background edge is a straight line by construction.
- **It overshoots.** Nobody stops exactly on the last letter, and not by the
  same amount at each end.
- **The ink doubles where the pen went twice.** That second pass down the middle
  is most of what makes it read as a pen rather than as a fill.

So each mark becomes a polygon in one SVG over the text.

## 7. Multiply, which is why it is a paper item

The overlay is blended with `mix-blend-mode: multiply`, because that is what
translucent ink on paper does: the glyphs stay on top and darken the ink rather
than being covered by it.

It is also why there is no dark version of this. Multiply against a dark ground
is black. If you need marked text on a dark page, that is a different effect
with a different physical model, not this one with a different colour.

## 8. A phrase that wraps gets two strokes

Which is what a person does. `getClientRects` already returns exactly those
boxes, one per line, and each gets its own slope, rag and overshoot.

## 9. Turn off the browser's own mark styling

`<mark>` ships with a yellow box and square corners, which is the thing this
effect exists to replace. The ink is drawn over the top, so the element itself
should carry none:

```css
mark {
  background: none;
  color: inherit;
}
```

Leave it in and every phrase has a rectangle under its stroke.

## 10. The host becomes a containing block

The overlay is absolutely positioned inside the element you mount on, so a
`static` host is promoted to `relative` on setup and put back on teardown. If
you are already positioning that element, nothing happens.

## 11. Timing

`hold`, then one stroke every `stagger`, each taking `duration` and eased out,
because a pen is thrown rather than driven.

`stagger` is shorter than `duration` on purpose: a reader is still finishing one
mark as the next begins, which is what reading with a pen in your hand looks
like. At 0 every mark appears at once and the sequence is lost.

## 12. It is a one shot

It marks, and it is done. The demo panel gives it a Replay control; on your own
page, mount it when the text arrives rather than on load, so the marks are drawn
while somebody is looking at them.

## 13. Cleanup and SSR

`destroy()` removes the overlay, cancels the RAF, disconnects both observers,
removes every listener and restores the host's `position`. The text is untouched
throughout, so there is nothing to put back.

There is nothing to render on the server, and nothing is needed: the text is
already in the markup and already correct. Call `createHighlighterMark` from
`useEffect`, `onMounted`, or a `client:*` island.

## 14. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which for a one shot means the finished state: every phrase marked, nothing
moving. That is the correct outcome rather than a compromise, because the marks
are information and withholding them would be withholding the point.

## 15. The three mistakes most likely to be made here

1. **Leaving the default `<mark>` background on.** A rectangle under every
   stroke.

2. **A dark ground.** Multiply against black is black. This is a paper item.

3. **`strength` above about 0.8.** The text under the ink stops passing
   contrast, which is a failure rather than a look. Run `pnpm contrast` or the
   equivalent on your own page after changing the ink.

4. **A host that clips.** `overflow: hidden` cuts the overshoot off at the edge
   of the block, which is the one part of the stroke that says a hand drew it.

5. **Wrapping words in spans yourself.** `<mark>` already means this, already
   reads correctly, and already survives the effect being switched off.

6. **`stagger` longer than `duration`.** Each mark finishes and waits, which
   reads as a slideshow rather than as somebody working down a page.

---

Concept credit: marking running text with a highlighter rather than a background, from the Highlighter Markup page, by Ray Velez, https://github.com/RayVelez27/instalanding.ai.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
