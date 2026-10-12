You are adding **BlockDissolve** from Beamish to this project.

> Content uncovered a block at a time, where the order is chosen so the blocks spread rather than clump. Reveals · effect · MIT.
> https://beamish.ink/effects/block-dissolve

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- Every wipe is the same effect. Cut the element into cells, give each cell a number saying when its turn comes, uncover the cells whose number has come up. A left-to-right wipe, a clock sweep, rings growing outward and a film dissolve are one mechanism fed four different orders
- A shuffle is not an order. At half way through a shuffled wipe there is a patch of cells that arrived together in one corner and a hole the same size in the other, and the eye reads both as a fault in the rendering rather than as a dissolve. It is the same objection as white noise being the wrong noise for a halftone
- So each cell is the best of `spread` random candidates, best meaning furthest from every cell already taken. At `spread: 1` that is exactly a shuffle, which is there to be set once
- Going further does not help. An exhaustive version, taking the true furthest cell every time, was written first and produces a chequerboard: every tie in a regular grid breaks the same way, the sequence locks onto the lattice, and half coverage is a perfect chequer. That reads as a deliberate pattern, which is the same failure as the clump seen from the other side
- Distance is measured on a torus. Without the wrap the cells along the edges have fewer neighbours, so they measure as further from the taken set than they are and the wipe opens with a frame round the outside
- Candidates are drawn without replacement. Drawing with replacement means a high `spread` still misses a third of the pool, which quietly caps how spread it can get
- `clip-path: path()` on the element itself, one subpath per uncovered block. Nothing is added to the DOM and the content is untouched: it selects, scrolls, translates and reads the whole time, it is simply not all visible yet
- `path()` takes user units and rejects percentages. Unlike `polygon()` the geometry cannot follow a resize for free, so it is rebuilt in CSS pixels when the box changes. The first version of the probe for this used percentages, which made the property invalid, silently ignored, and the element came back unclipped looking like a pass
- Rows follow from columns and the aspect so the cells come out square. A fixed row count gives tall thin cells on a hero and wide flat ones on a sidebar, and a dissolve made of letterbox slots does not read as a dissolve
- Blocks grow from their centres rather than switching on, so the front is blocks blooming rather than blocks appearing. `grow: 0` is the version that looks like a slide transition
- No colour in it at all, which is why it declares `either` without hedging. There is nothing to tune against a background because it clips whatever you put it on
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/block-dissolve/core.ts`**

```ts
/*
 * BlockDissolve: Beamish
 * https://beamish.ink/effects/block-dissolve
 *
 * Content uncovered a block at a time, in an order chosen rather than random.
 *
 * WHAT THE ITEM IS
 *
 * Every wipe is the same effect. Cut the element into cells, give each cell a
 * number saying when its turn comes, and uncover the cells whose number has
 * come up. A left-to-right wipe, a clock sweep, rings growing outward and a
 * film dissolve are one mechanism fed four different orders, and the order is
 * the entire difference between them. That is the idea, and it came from the
 * Shader Effects library, credited in meta.json.
 *
 * THE ORDER IS THE WHOLE THING, AND SHUFFLING IS NOT AN ORDER
 *
 * The dissolve is the one worth the trouble, and the obvious way to do it is
 * to shuffle the cells. It does not work, and the reason is the reason white
 * noise is the wrong noise for a halftone. A shuffle clumps. At half way
 * through a shuffled wipe there is a patch of eight cells that arrived
 * together in one corner and a hole the same size in the other, and the eye
 * reads both as a fault in the rendering rather than as a dissolve.
 *
 * So each cell is the best of `spread` candidates drawn at random, best
 * meaning furthest from every cell already taken, measured on a torus so no
 * cell is made special by sitting at an edge. At `spread: 1` that is exactly a
 * shuffle, which is there to be set once so the difference is a thing you have
 * seen rather than a claim in a file.
 *
 * It does not pay to go further. An exhaustive version of this, taking the
 * actual furthest cell every time rather than the furthest of a few, was
 * written first and it produces a chequerboard: the ties in a regular grid all
 * break the same way, the sequence locks onto the lattice, and half coverage
 * is a perfect chequer. That reads as a deliberate pattern, which is the same
 * failure as the clump from the other side. The answer is a dozen candidates,
 * where the holes are gone and the lattice has not appeared.
 *
 * HOW IT DRAWS
 *
 * `clip-path: path()`, on the element itself, with one subpath per uncovered
 * block. Nothing is added to the DOM, nothing is drawn, and the content inside
 * is untouched: it selects, scrolls, translates and reads the whole time, it
 * is simply not all visible yet. Like IrisReveal and MaskedHeading, and for
 * the same reason, this means the item has no colour in it at all and nothing
 * to tune against a background.
 *
 * `path()` takes user units and rejects percentages, which is the one awkward
 * consequence: unlike `polygon()`, the geometry cannot follow a resize for
 * free and has to be rebuilt in CSS pixels when the box changes. Measured at
 * 0.058ms to rebuild a hundred and forty-four subpaths and set the property,
 * including a forced layout, so paying it per frame is affordable.
 *
 * Blocks do not switch on. Each one grows from its own centre over its own
 * short window, so the front is blocks blooming rather than blocks appearing,
 * and the arrival reads as something physical. At `grow: 0` they pop, which is
 * the version that looks like a slide transition.
 *
 * ONE SHOT
 *
 * It uncovers and it is done. The order is settled once at mount from the
 * seed; everything after that is a function of `t` and nothing is stored
 * between frames.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type BlockDissolveOrder = 'scatter' | 'rows' | 'columns' | 'diagonal' | 'rings' | 'clock'

export type BlockDissolveOptions = BaseOptions & {
  /** Which order the blocks arrive in. */
  order: BlockDissolveOrder
  /** Blocks across. Rows follow from it so the cells come out square. */
  columns: number
  /**
   * Candidates considered per pick, for `scatter`. 1 is a plain shuffle.
   */
  spread: number
  /** How much of its size each block grows through, 0 to 1. 0 is a switch. */
  grow: number
  /** Milliseconds from the first block to the last. */
  duration: number
  /** Milliseconds of stillness before it starts. */
  hold: number
  /** How long each block takes, as a share of the whole wipe. */
  overlap: number
  /** Seed for the order. The same seed gives the same dissolve. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const blockDissolveDefaults: BlockDissolveOptions = {
  order: 'scatter',
  columns: 16,
  spread: 12,
  grow: 0.6,
  duration: 1400,
  hold: 200,
  overlap: 0.22,
  seed: 7,
  reducedMotionTime: 4
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/* Quick out, so the last blocks are not still crawling in. */
const easeOutCubic = (n: number) => 1 - Math.pow(1 - n, 3)

/** A small integer generator, so the same seed gives the same dissolve. */
function rng(seed: number): () => number {
  let s = (seed | 0) >>> 0
  if (s === 0) s = 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

class BlockDissolveSurface implements Surface<BlockDissolveOptions> {
  private host: HTMLElement | null = null
  private restoreClip = ''
  private previous = ''

  /** CSS pixels. `path()` will not take percentages, so this is needed. */
  private box = { width: 1, height: 1 }

  /*
   * The order, as cell index per position in the queue, plus the grid it was
   * built for and the settings it was built from. Building it is the only
   * expensive thing here and none of its inputs change per frame, so it is
   * rebuilt when one of them does and not otherwise.
   */
  private queue: Int32Array = new Int32Array(0)
  private grid = { cols: 0, rows: 0 }
  private builtFor = ''

  setup(ctx: { host: HTMLElement }): void {
    this.host = ctx.host
    this.restoreClip = ctx.host.style.clipPath
  }

  resize(size: { width: number; height: number }): void {
    this.box = { width: Math.max(size.width, 1), height: Math.max(size.height, 1) }
    // The rows follow the aspect and the subpaths are in pixels, so both the
    // order and the cached string are now answers to the wrong question.
    this.builtFor = ''
    this.previous = ''
  }

  /*
   * Rows from columns and the aspect, so a cell is square. A fixed row count
   * gives tall thin cells on a hero and wide flat ones on a sidebar, and a
   * dissolve made of letterbox slots does not read as a dissolve.
   */
  private build(opts: BlockDissolveOptions): void {
    const cols = Math.max(1, Math.round(opts.columns))
    const rows = Math.max(1, Math.round((cols * this.box.height) / this.box.width))
    const key = [cols, rows, opts.order, opts.spread, opts.seed].join('/')
    if (key === this.builtFor) return

    const count = cols * rows
    const queue = new Int32Array(count)

    if (opts.order === 'scatter') {
      scatter(queue, cols, rows, Math.max(1, Math.round(opts.spread)), opts.seed)
    } else {
      /*
       * The geometric orders are a sort on a number per cell, which is the same
       * shape as the dissolve: a coverage value, lowest first. Written this way
       * the five of them differ by one line each, which is the point the item
       * is making.
       */
      const rank = new Float64Array(count)
      for (let i = 0; i < count; i++) {
        const x = i % cols
        const y = (i / cols) | 0
        // 0 to 1 across and down the cell centres, so no order starts off-grid.
        const u = (x + 0.5) / cols
        const v = (y + 0.5) / rows
        rank[i] =
          opts.order === 'rows'
            ? v
            : opts.order === 'columns'
              ? u
              : opts.order === 'diagonal'
                ? (u + v) / 2
                : opts.order === 'rings'
                  ? Math.hypot(u - 0.5, v - 0.5)
                  : // clock, from twelve, going round.
                    (Math.atan2(u - 0.5, 0.5 - v) + Math.PI) / (Math.PI * 2)
      }
      const index = Array.from({ length: count }, (_, i) => i)
      index.sort((a, b) => rank[a]! - rank[b]!)
      for (let i = 0; i < count; i++) queue[i] = index[i]!
    }

    this.queue = queue
    this.grid = { cols, rows }
    this.builtFor = key
  }

  render(t: number, opts: BlockDissolveOptions): void {
    const host = this.host
    if (!host) return
    this.build(opts)

    const { cols, rows } = this.grid
    const count = cols * rows
    const hold = Math.max(opts.hold, 0) / 1000
    const duration = Math.max(opts.duration, 1) / 1000
    const front = clamp01((t - hold) / duration)

    /*
     * Each block's own window. `overlap` is how long one block takes as a
     * share of the whole wipe, so the fronts of neighbouring blocks overlap
     * and the wipe has a soft edge made of blocks in mid-arrival rather than a
     * hard boundary. The starts are spread over what is left.
     */
    const window = Math.max(0.0001, Math.min(opts.overlap, 1))
    const spacing = count > 1 ? (1 - window) / (count - 1) : 0
    const grow = clamp01(opts.grow)

    const cellWidth = this.box.width / cols
    const cellHeight = this.box.height / rows

    let d = ''
    for (let k = 0; k < count; k++) {
      const local = clamp01((front - k * spacing) / window)
      if (local <= 0) continue
      const cell = this.queue[k]!
      const x = (cell % cols) * cellWidth
      const y = ((cell / cols) | 0) * cellHeight

      /*
       * Fully open blocks are the common case by the end of the wipe, and
       * writing them without the arithmetic keeps the string short and exact:
       * a block inset by a rounded zero leaves hairlines between neighbours.
       */
      if (local >= 1 || grow <= 0) {
        d += rect(x, y, cellWidth, cellHeight)
        continue
      }

      /*
       * Growing from the centre over its window. `grow` is how much of the
       * block's size is grown through rather than how long it takes: at 0 the
       * block arrives at full size, which is the switch, and at 1 it comes up
       * from nothing.
       */
      const open = 1 - grow + grow * easeOutCubic(local)
      const w = cellWidth * open
      const h = cellHeight * open
      d += rect(x + (cellWidth - w) / 2, y + (cellHeight - h) / 2, w, h)
    }

    /*
     * An empty path clips everything away, which is what is wanted before the
     * first block arrives: `path("")` is not valid, so the shape is a point.
     */
    const path = d.length > 0 ? `path("${d}")` : 'path("M0 0z")'
    if (path !== this.previous) {
      host.style.clipPath = path
      host.style.setProperty('-webkit-clip-path', path)
      this.previous = path
    }
  }

  teardown(): void {
    const host = this.host
    if (host) {
      host.style.clipPath = this.restoreClip
      host.style.removeProperty('-webkit-clip-path')
    }
    this.queue = new Int32Array(0)
    this.builtFor = ''
    this.previous = ''
    this.host = null
  }
}

/* One subpath. Three decimals, because a path string is rebuilt every frame. */
function rect(x: number, y: number, w: number, h: number): string {
  const r = (n: number) => n.toFixed(2)
  return `M${r(x)} ${r(y)}h${r(w)}v${r(h)}h${r(-w)}z`
}

/**
 * The dissolve order: each cell the best of `tries` random candidates, best
 * meaning furthest from everything already taken.
 *
 * Distance is measured on a torus. Without the wrap the cells along the edges
 * have fewer neighbours, so they measure as further from the taken set than
 * they are, and the sequence works the border first: the wipe opens with a
 * frame round the outside, which nobody asked for.
 *
 * `tries` is a dial between two failures and not a quality setting. At 1 it is
 * a shuffle and it clumps. Taking the true furthest cell every time makes a
 * chequerboard, because every tie in a regular grid breaks the same way and
 * the sequence settles onto the lattice.
 */
function scatter(out: Int32Array, cols: number, rows: number, tries: number, seed: number): void {
  const count = cols * rows
  const rand = rng(seed)
  const pool = new Int32Array(count)
  for (let i = 0; i < count; i++) pool[i] = i
  let left = count

  const halfCols = cols / 2
  const halfRows = rows / 2

  for (let taken = 0; taken < count; taken++) {
    let bestAt = 0
    let bestFar = -1
    const look = Math.min(tries, left)
    for (let i = 0; i < look; i++) {
      /*
       * Candidates are drawn from the unseen part of the pool and swapped to
       * the front as they are looked at, so the same cell is never considered
       * twice in one pick. Drawing with replacement means a high `tries` still
       * misses a third of the pool, which quietly caps how spread it can get.
       */
      const at = i + ((rand() * (left - i)) | 0)
      const cell = pool[at]!
      pool[at] = pool[i]!
      pool[i] = cell

      const cx = cell % cols
      const cy = (cell / cols) | 0
      let nearest = Infinity
      for (let j = 0; j < taken; j++) {
        const other = out[j]!
        let dx = Math.abs(cx - (other % cols))
        let dy = Math.abs(cy - ((other / cols) | 0))
        if (dx > halfCols) dx = cols - dx
        if (dy > halfRows) dy = rows - dy
        const d = dx * dx + dy * dy
        if (d < nearest) nearest = d
      }
      if (nearest > bestFar) {
        bestFar = nearest
        bestAt = i
      }
    }

    const chosen = pool[bestAt]!
    out[taken] = chosen
    // The chosen one leaves the pool; the last unseen cell takes its slot.
    pool[bestAt] = pool[left - 1]!
    pool[left - 1] = chosen
    left--
  }
}

/**
 * Mount BlockDissolve onto the element you want uncovered. Everything inside
 * arrives together, so put it on the block rather than on each child.
 *
 * ```ts
 * const dissolve = createBlockDissolve(document.querySelector('#plate')!)
 * dissolve.start()
 * // …later
 * dissolve.destroy()
 * ```
 *
 * The content is never touched: it selects, scrolls and reads the whole time,
 * it is simply not all visible yet.
 */
export function createBlockDissolve(
  el: HTMLElement,
  opts: Partial<BlockDissolveOptions> = {}
): EffectHandle {
  return mount<BlockDissolveOptions>(el, opts, {
    defaults: blockDissolveDefaults,
    kind: 'dom',
    create: () => new BlockDissolveSurface()
  })
}

export default createBlockDissolve
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

BlockDissolve uncovers whatever you mount it on, a block at a time.

The idea underneath it is that **every wipe is the same effect**. Cut the
element into cells, give each cell a number saying when its turn comes, and
uncover the cells whose number has come up. A left-to-right wipe, a clock
sweep, rings growing outward and a film dissolve are one mechanism fed four
different orders. Nothing else about them differs.

That is why `order` is the first option here and the only one that changes what
the thing is. Five of the six orders are a sort on one number per cell and are
a single line each. The sixth, `scatter`, is the dissolve, and it is the one
the item exists for.

## 3. Wire it in

**Plain HTML.** Mount it on the block you want uncovered, not on each child.

```html
<section id="plate">
  <h1>Everything in here arrives together</h1>
  <p>Clipped as one thing, rather than revealed one element at a time.</p>
</section>

<script type="module">
  import { createBlockDissolve } from './beamish/effects/block-dissolve/core.js'

  const dissolve = createBlockDissolve(document.querySelector('#plate'))
  dissolve.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createBlockDissolve } from '@/beamish/effects/block-dissolve/core'

export function Plate({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const dissolve = createBlockDissolve(host.current, { columns: 18 })
    dissolve.start()
    return () => dissolve.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createBlockDissolve } from '@/beamish/effects/block-dissolve/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let dissolve: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  dissolve = createBlockDissolve(host.value)
  dissolve.start()
})

onBeforeUnmount(() => dissolve?.destroy())
</script>

<template>
  <div ref="host">
    <slot />
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
| `order` | enum | `scatter` | `scatter` · `rows` · `columns` · `diagonal` · `rings` · `clock` | Which order the blocks arrive in, and the only difference between a dissolve, a wipe, a clock sweep and rings growing outward. `scatter` is the dissolve and the one the item is about; the other five are a sort on one number per cell and are each a single line. |
| `columns` | number | `16` | 2 to 60 (looks right between 10 and 28) | Blocks across. Rows follow from it and the aspect so the cells come out square. This is the resolution of the whole thing: at 6 it is a slide transition made of panels, at 40 it is close enough to a film dissolve that the blocks stop being the subject. Note that the order costs roughly this squared, so 40 on a wide element is a few million comparisons at mount. |
| `spread` | number | `12` | 1 to 64 (looks right between 8 and 20) | Candidates considered per pick, for `scatter`. A dial between two failures rather than a quality setting. At 1 every pick is random, which is a plain shuffle, and it clumps: patches arrive together and holes the same size linger. Taking the true furthest cell every time goes the other way and settles onto the lattice, so half coverage is a chequerboard. Set it to 1 once so the difference is a thing you have seen. |
| `grow` | number | `0.6` | 0 to 1 (looks right between 0.4 and 0.8) | How much of its size each block grows through, from its centre. At 0 the blocks arrive at full size, which is the switch and the thing that makes this look like a slide transition. At 1 they come up from nothing, which is softer but loses the blocks. This is how much, not how long: the timing is `overlap`. |
| `overlap` | number | `0.22` | 0.02 to 1 (looks right between 0.12 and 0.4) | How long one block takes, as a share of the whole wipe. It is what gives the front a width: at the default about forty blocks are mid-arrival at any moment, so the edge is made of blocks in flight rather than being a hard boundary. At 0.02 the blocks arrive one at a time and it reads as a counter. |
| `duration` | number | `1400` | 150 to 10000 ms (looks right between 900 and 2200) | Milliseconds from the first block to the last. |
| `hold` | number | `200` | 0 to 5000 ms | Milliseconds of stillness before it starts. |
| `seed` | number | `7` | 1 to 9999 | Seed for the order. The same seed gives the same dissolve, which is what makes the take reproducible. It does nothing to the five geometric orders. |
| `reducedMotionTime` | number | `4` | 0 to 30 s | The single frame shown when the user prefers reduced motion. For a one-shot uncovering this has to be a time after it has finished, so the content is simply there. The content is the point; the dissolve is how it arrives. |

## 5. A shuffle is not an order

The obvious way to write a dissolve is to shuffle the cells and uncover them in
that order. It does not work, and the reason is the same one that makes white
noise the wrong noise for a halftone.

**A shuffle clumps.** Halfway through a shuffled wipe there is a patch of eight
cells that happened to arrive together in one corner, and a hole the same size
in the other. The eye reads both as a fault in the rendering rather than as a
dissolve. Set `spread: 1` and watch it for ten seconds: the clumps are not
subtle, and once you have seen them you cannot stop seeing them in everybody
else's.

So each cell here is the **best of `spread` random candidates**, best meaning
furthest from every cell already taken.

## 6. Why not go all the way

The first version of this took the true furthest cell every time rather than
the furthest of a few. It is worse, and it fails in an interesting direction.

Every tie in a regular grid breaks the same way, so the sequence settles onto
the lattice, and half coverage comes out a **perfect chequerboard**. That reads
as a deliberate pattern, which is the same failure as the clump seen from the
other side: in both cases the eye finds a structure that nobody put there on
purpose.

`spread` is therefore a dial between two failures rather than a quality
setting. At 1 it clumps; at the limit it chequers; a dozen is where the holes
have gone and the lattice has not appeared.

Two details in that search are load-bearing, and both were wrong first:

**Distance is measured on a torus.** Without the wrap, cells along the edges
have fewer neighbours, so they measure as further from the taken set than they
really are. The wipe then works the border first and opens with a frame round
the outside, which nobody asked for.

**Candidates are drawn without replacement.** Drawing with replacement means a
high `spread` still only ever sees about two thirds of the pool, which quietly
caps how spread it can get and makes the top of the range do nothing.

## 7. What it draws with

`clip-path: path()`, on the element itself, with one subpath per uncovered
block. Nothing is added to the DOM, nothing is drawn on a canvas, and the
content inside is untouched: it selects, scrolls, translates and reads the
whole time. It is simply not all visible yet.

That also makes this an item with no colour in it at all, which is why it
declares `ground: "either"` without hedging. There is nothing to tune against a
background because there is no background: it clips whatever you put it on.

**`path()` rejects percentages.** Unlike `polygon()`, which IrisReveal uses and
which follows a resize for free, `path()` takes user units only. The geometry
is rebuilt in CSS pixels whenever the box changes. This is worth knowing
because the failure is silent: a path written in percentages makes the whole
property invalid, the browser drops it, and the element comes back unclipped
looking exactly like an effect that has already finished.

Rebuilding a hundred and forty-four subpaths and setting the property measures
at 0.058ms including a forced layout, so paying it per frame is affordable. A
clip is composited, so the content under it is not repainted.

## 8. Mount it on something with area

This is the mistake that wastes the most time. A clip over a flat background
cannot be seen, because uncovered and not uncovered look identical everywhere.
Every argument the item is making is about *where* the blocks are, so give it a
plate: a photograph, a gradient, a card, a coloured panel. Text on the page's
own background shows it too, but only where the letters are.

## 9. The timing is two numbers, not one

`duration` is the whole wipe, first block to last. `overlap` is how long **one**
block takes, as a share of that.

`overlap` is what gives the front a width. At the default about forty blocks
are mid-arrival at any moment, so the edge of the wipe is made of blocks in
flight rather than being a hard boundary between arrived and not. At 0.02 they
come in one at a time and it reads as a counter.

`grow` is how much of its size a block grows through, from its centre, and not
how long it takes. At 0 the blocks arrive at full size, which is the switch,
and that one setting is most of the difference between this and a slide
transition.

## 10. Rows follow from columns

You set `columns`; the rows come from it and the element's aspect so the cells
come out square. A fixed row count gives tall thin cells on a hero and wide
flat ones on a sidebar, and a dissolve made of letterbox slots does not read as
a dissolve.

It also means the cell count, and therefore the cost of building the order,
goes up with the square of `columns`. 16 is about 120 thousand comparisons and
invisible; 40 on a wide element is nearer five million, which is a frame you
will notice at mount and on resize.

## 11. Accessibility. Do not skip this

Nothing is added to the DOM and nothing is removed from it, so a screen reader
reads the content in full from the first frame, whether or not it is visible
yet. That is the right behaviour: the dissolve is decoration over content that
is already there.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`, which is after the wipe has finished. The content is
simply there.

## 12. Cleanup and SSR

`destroy()` puts the element's `clip-path` back to whatever it was, cancels the
RAF, disconnects the observers and removes every listener. There is no WebGL
context to release: this item never takes one.

The content renders on the server exactly as written, which is the whole
fallback. If the script never runs, the page is simply not clipped.

## 13. The three mistakes most likely to be made here

1. **Shuffling.** The clumps are the whole reason this item has a `spread`
   option. A shuffled dissolve looks like a rendering fault.

2. **Going to the other extreme.** Taking the furthest cell every time is not
   "more spread", it is a chequerboard, because every tie in a grid breaks the
   same way.

3. **Measuring distance without the wrap.** The edge cells look further from
   everything than they are, and the wipe opens with a frame round the outside.

4. **Percentages in `path()`.** They are rejected, the property goes invalid,
   and the element comes back unclipped looking like a wipe that has already
   finished.

5. **Mounting it on a flat background.** Nothing is visible, because uncovered
   and not uncovered are the same colour.

6. **Mounting it on each child instead of the block.** Six elements each
   dissolving on their own schedule is not a wipe, it is six wipes.

---

Concept credit: That every wipe is one effect fed a different coverage, a number per cell saying when it goes, from the Shader Effects library's reveals. Their shuffle is a plain shuffle; the spread order here is the answer to what that does, by Shader Effects Inc., https://github.com/shader-effects-inc/shaders.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
