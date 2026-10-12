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
