/*
 * ExpandingTiles: Beamish
 * https://beamish.ink/effects/expanding-tiles
 *
 * A grid of tiles. Press one and it opens out to fill the window, and the four
 * rules that bounded its cell travel out to the edges of the page with it, so
 * the grid you were looking at becomes the frame around what you opened.
 *
 * Three things carry it, and the first two are what every other version of this
 * gets wrong.
 *
 * Nothing is scaled. The obvious way to grow a box is a transform, and a
 * transform takes the type with it: the title stretches as the tile grows and
 * settles back as it lands, which reads as cheap however well it is eased. Here
 * the tile is put at its final size immediately and revealed with
 * `clip-path: inset()`, opening from the cell outwards. Type laid out once at
 * its final size cannot distort, because nothing ever scales it.
 *
 * The content is carried, not left behind. A tile jumped straight to full size
 * has its title wherever the full-size layout puts it, which at the moment of
 * the press is outside the clip: the title would blink out and reappear halfway
 * through. So each child is counter-translated by the distance between where it
 * sits at rest and where it sits open, eased to zero. That distance is measured
 * rather than assumed, because a centred tile moves its title to the middle of
 * the window and a top-left one does not, and guessing gets one of them wrong.
 *
 * And it is pure in `t`. The open tile and how far through the gesture it is
 * are both folded out of the list of presses, scripted and real in the same
 * list, so the recorder can seek anywhere and a live page and a take agree.
 */

import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type PressKey,
  type Pointer,
  type Surface
} from '../../shared/runtime'

export type ExpandingTilesOptions = BaseOptions & {
  /** Milliseconds the opening takes. */
  duration: number
  /** Milliseconds the closing takes. */
  closeDuration: number
  /** How far the rules overshoot the window, as a share of its size. */
  bleed: number
  /** Width of the travelling rules, in pixels. Zero draws none. */
  rule: number
  /** Colour of the travelling rules. */
  ruleColour: string
  /** How far ahead of the clip the rules run, as a share of the duration. */
  lead: number
  /**
   * Follow the opened tile's href once it has finished opening. A tile with no
   * href stays open until it is dismissed, whatever this says.
   */
  follow: boolean
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const expandingTilesDefaults: ExpandingTilesOptions = {
  duration: 620,
  closeDuration: 420,
  bleed: 0.04,
  rule: 1,
  ruleColour: 'rgba(54, 54, 48, 0.28)',
  lead: 0.18,
  follow: true,
  reducedMotionTime: 0
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/*
 * Out, not in-out, and this is a press rather than an ambient loop.
 *
 * An in-out curve spends the first third of its duration barely moving, which
 * on a loop is elegant and after a click is lag: the reader has already pressed,
 * and anything that does not answer at once reads as the page being slow rather
 * than as the animation being gentle. Starting at full speed and arriving slowly
 * answers immediately and still lands softly, and the landing is the part the
 * eye reads as quality.
 */
const easeOutQuint = (k: number) => 1 - Math.pow(1 - k, 5)

type Phase = { index: number; at: number; opening: boolean }
type Box = { left: number; top: number; right: number; bottom: number }
type Shift = { x: number; y: number }

class ExpandingTilesSurface implements Surface<ExpandingTilesOptions> {
  private host: HTMLElement | null = null
  private tiles: HTMLElement[] = []
  private cells: Box[] = []
  /* Where each tile's children sit while the grid is at rest. */
  private atRest: Shift[][] = []
  /*
   * Where they sit once the tile fills the window, measured the first time a
   * tile is opened at a given window size and kept. Keyed by index and size, so
   * it is a function of the layout rather than of what happened before: the
   * recorder can seek straight into the middle of a gesture and get the same
   * numbers as a page that played it from the start.
   */
  private whenOpen = new Map<string, Shift[]>()

  private rules: HTMLElement[] = []
  private layer: HTMLElement | null = null
  /*
   * Stands in for the opened tile while it is out of flow.
   *
   * An opened tile is fixed to the window, which takes it out of the grid, and a
   * grid with one fewer item re-places every item after it: the tiles behind the
   * one you pressed shuffle up a cell and the grid's own background shows
   * through the hole. Sized in pixels from the cell we already measured, so it
   * holds the slot whatever the tracks are written in.
   */
  private placeholder: HTMLElement | null = null
  private lifted = -1

  /* Real presses, in the same list as the scripted ones. See phase(). */
  private live: PressKey[] = []
  /* The last time render was handed, so a real press can be stamped with it. */
  private now = 0
  /* What was applied last, so a still grid writes nothing at all. */
  private applied = ''
  /* Whether anything is open, for the Escape handler. */
  private openNow = false
  /* The tile already followed, so a completed open navigates exactly once. */
  private followed = -1
  private restoreFocus: HTMLElement | null = null

  private onPress = (event: PointerEvent) => {
    const host = this.host
    if (!host) return
    const box = host.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) return
    /*
     * Normalised to the element, which is the space `pressPath` is written in. A
     * scripted press and a real one are then literally the same value and the
     * fold below cannot tell them apart, which is the point.
     */
    const x = (event.clientX - box.left) / box.width
    const y = (event.clientY - box.top) / box.height
    this.live.push({ t: this.now, x, y })

    /*
     * The tile is usually a link, and the whole gesture exists so it can be seen
     * to open before the page changes. The effect follows the href itself, once
     * the opening has finished, so the browser must not do it now.
     */
    if (this.hit(x, y) >= 0) event.preventDefault()
  }

  private onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.openNow) return
    // Dismissing is a press that hits nothing, which the fold reads as a close.
    this.live.push({ t: this.now, x: -1, y: -1 })
  }

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.addEventListener('pointerdown', this.onPress)
    document.addEventListener('keydown', this.onKey)
  }

  private build(): void {
    const host = this.host
    if (!host || this.tiles.length > 0) return
    this.tiles = [...host.children].filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node !== this.placeholder
    )
    for (const tile of this.tiles) {
      tile.style.willChange = 'clip-path'
      if (!tile.hasAttribute('aria-expanded')) tile.setAttribute('aria-expanded', 'false')
    }

    /*
     * One layer for the four travelling rules, built once and reused. It is
     * additive rather than a replacement: the author's own cell borders are
     * untouched and show through whenever nothing is open.
     */
    const layer = document.createElement('div')
    layer.setAttribute('aria-hidden', 'true')
    layer.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:2147483646;display:none'
    for (let i = 0; i < 4; i++) {
      const rule = document.createElement('div')
      layer.append(rule)
      this.rules.push(rule)
    }
    document.body.append(layer)
    this.layer = layer
  }

  /** Which tile covers a point given in the element's own 0 to 1 space. */
  private hit(x: number, y: number): number {
    const host = this.host
    if (!host || x < 0 || x > 1 || y < 0 || y > 1) return -1
    const box = host.getBoundingClientRect()
    const px = box.left + x * box.width
    const py = box.top + y * box.height
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i]!
      if (px >= c.left && px <= c.right && py >= c.top && py <= c.bottom) return i
    }
    return -1
  }

  resize(): void {
    const host = this.host
    if (!host) return
    this.build()
    /*
     * Not mid-gesture. An open tile is fixed to the window and would report the
     * window as its cell, which would be remembered as the grid once it closed.
     * The sizes are re-read on the next rest, and the open-position cache is
     * keyed by window size, so dropping it here is enough.
     */
    if (this.lifted >= 0) {
      this.whenOpen.clear()
      return
    }
    /*
     * Measured while nothing is open, because an open tile is fixed to the
     * window and no longer reports where its cell was. This is also the only
     * place layout is read: the gesture itself never does.
     */
    this.cells = this.tiles.map(tile => {
      const r = tile.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    })
    this.atRest = this.tiles.map(tile =>
      [...tile.children]
        .filter((n): n is HTMLElement => n instanceof HTMLElement)
        .map(child => {
          const r = child.getBoundingClientRect()
          return { x: r.left, y: r.top }
        })
    )
    this.whenOpen.clear()
  }

  /**
   * The gesture at time `t`, folded out of every press at or before it.
   *
   * Folding from scratch each frame rather than remembering is what keeps this
   * seekable: the recorder can ask for any `t` in any order and get the same
   * answer, which a remembered `isOpen` flag could never do.
   */
  private phase(t: number, opts: ExpandingTilesOptions): Phase | null {
    const scripted = opts.pressPath ?? []
    const presses = [...scripted, ...this.live]
      .filter(p => p.t <= t)
      .sort((a, b) => a.t - b.t)

    let phase: Phase | null = null
    for (const press of presses) {
      const hit = this.hit(press.x, press.y)
      if (phase && phase.opening) {
        // Anything at all closes what is open, including a press on another tile.
        phase = { index: phase.index, at: press.t, opening: false }
      } else if (hit >= 0) {
        phase = { index: hit, at: press.t, opening: true }
      }
    }
    return phase
  }

  /*
   * Take the tile out of the grid and leave something holding its cell. Both
   * happen together or the grid behind reflows for a frame, which is visible as
   * every other tile jumping at the moment of the press.
   */
  private lift(index: number, tile: HTMLElement, cell: Box): void {
    if (this.lifted === index) return
    this.drop()
    const stand = document.createElement('div')
    stand.setAttribute('aria-hidden', 'true')
    stand.style.cssText =
      `width:${(cell.right - cell.left).toFixed(2)}px;height:${(cell.bottom - cell.top).toFixed(2)}px;pointer-events:none`
    tile.before(stand)
    this.placeholder = stand
    this.lifted = index

    tile.style.position = 'fixed'
    tile.style.inset = '0'
    tile.style.margin = '0'
    tile.style.zIndex = '2147483645'
  }

  /** Put the grid back the way the page wrote it. */
  private drop(): void {
    this.placeholder?.remove()
    this.placeholder = null
    this.lifted = -1
  }

  /*
   * Where this tile's children sit once it fills the window. Measured once per
   * tile per window size, with the counter-translation off so the reading is of
   * the layout rather than of the last frame.
   */
  private openShifts(index: number, tile: HTMLElement, vw: number, vh: number): Shift[] {
    const key = `${index}|${vw}x${vh}`
    const had = this.whenOpen.get(key)
    if (had) return had
    const kids = [...tile.children].filter((n): n is HTMLElement => n instanceof HTMLElement)
    for (const child of kids) child.style.transform = ''
    const shifts = kids.map(child => {
      const r = child.getBoundingClientRect()
      return { x: r.left, y: r.top }
    })
    this.whenOpen.set(key, shifts)
    return shifts
  }

  render(t: number, opts: ExpandingTilesOptions, _pointer: Pointer): void {
    this.now = t
    const host = this.host
    if (!host) return
    this.build()
    if (this.cells.length !== this.tiles.length) this.resize()

    const phase = this.phase(t, opts)
    if (!phase) {
      this.rest()
      return
    }

    const span = Math.max(phase.opening ? opts.duration : opts.closeDuration, 1) / 1000
    const raw = clamp01((t - phase.at) / span)
    if (!phase.opening && raw >= 1) {
      // Fully closed. Nothing of the gesture is left to draw.
      this.rest()
      return
    }

    const cell = this.cells[phase.index]
    const tile = this.tiles[phase.index]
    if (!cell || !tile) {
      this.rest()
      return
    }

    const vw = window.innerWidth
    const vh = window.innerHeight
    /*
     * One curve, read forwards to open and subtracted to close, so the dismiss
     * answers its press as immediately as the open answered its own. Easing the
     * reversed progress instead would make closing start slowly, which is the
     * one moment the reader has already decided they are done.
     */
    const eased = easeOutQuint(raw)
    const p = phase.opening ? eased : 1 - eased

    /*
     * The rules run on the same gesture, read slightly further along it. Leading
     * has to mean "further along the way it is going", not "further out": a
     * closing tile that trailed its rules would leave four lines boxing in grid
     * it had already given back, which is what makes the dismiss look broken.
     * Taking the lead on the gesture's own progress and then turning it round
     * for the close gets both directions from one number.
     */
    const ledEase = easeOutQuint(clamp01(raw * (1 + opts.lead)))
    const pRule = phase.opening ? ledEase : 1 - ledEase

    const state = `${phase.index}|${p.toFixed(4)}|${vw}x${vh}`
    if (state === this.applied) return
    this.applied = state
    this.openNow = true

    if (!this.restoreFocus && document.activeElement instanceof HTMLElement) {
      this.restoreFocus = document.activeElement
    }

    for (let i = 0; i < this.tiles.length; i++) {
      if (i === phase.index) continue
      // The rest of the grid is out of the way while one of them owns the window.
      const other = this.tiles[i]!
      other.style.pointerEvents = 'none'
      other.setAttribute('aria-expanded', 'false')
    }

    /*
     * The tile is already the size of the window; `p` only says how much of it
     * is uncovered. Nothing here scales, so the type cannot distort.
     */
    this.lift(phase.index, tile, cell)
    tile.setAttribute('aria-expanded', 'true')

    const inset: Box = {
      left: cell.left * (1 - p),
      top: cell.top * (1 - p),
      right: (vw - cell.right) * (1 - p),
      bottom: (vh - cell.bottom) * (1 - p)
    }
    tile.style.clipPath =
      `inset(${inset.top.toFixed(2)}px ${inset.right.toFixed(2)}px ` +
      `${inset.bottom.toFixed(2)}px ${inset.left.toFixed(2)}px)`

    // Carry the content, by the measured distance rather than a guessed one.
    const open = this.openShifts(phase.index, tile, vw, vh)
    const rest = this.atRest[phase.index] ?? []
    const kids = [...tile.children].filter((n): n is HTMLElement => n instanceof HTMLElement)
    for (let i = 0; i < kids.length; i++) {
      const from = rest[i]
      const to = open[i]
      if (!from || !to) continue
      const dx = (from.x - to.x) * (1 - p)
      const dy = (from.y - to.y) * (1 - p)
      kids[i]!.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`
    }

    this.drawRules(opts, cell, pRule, vw, vh)

    if (phase.opening && raw >= 1 && opts.follow && this.followed !== phase.index) {
      const href = tile.getAttribute('href')
      if (href) {
        this.followed = phase.index
        window.location.assign(href)
      }
    }
  }

  /*
   * The four rules that bounded the cell, travelling out to the edges. They lead
   * the clip slightly, because an edge that arrives with the thing it bounds
   * reads as a border rather than as a movement.
   */
  private drawRules(
    opts: ExpandingTilesOptions,
    cell: Box,
    pRule: number,
    vw: number,
    vh: number
  ): void {
    const layer = this.layer
    if (!layer) return
    if (opts.rule <= 0) {
      layer.style.display = 'none'
      return
    }
    layer.style.display = 'block'

    const overX = vw * opts.bleed * pRule
    const overY = vh * opts.bleed * pRule
    const w = opts.rule
    // Each rule travels from its cell edge to the window edge.
    const top = cell.top * (1 - pRule)
    const bottom = (vh - cell.bottom) * (1 - pRule)
    const left = cell.left * (1 - pRule)
    const right = (vw - cell.right) * (1 - pRule)
    const geometry = [
      `left:${-overX}px;right:${-overX}px;top:${top.toFixed(2)}px;height:${w}px`,
      `left:${-overX}px;right:${-overX}px;bottom:${bottom.toFixed(2)}px;height:${w}px`,
      `top:${-overY}px;bottom:${-overY}px;left:${left.toFixed(2)}px;width:${w}px`,
      `top:${-overY}px;bottom:${-overY}px;right:${right.toFixed(2)}px;width:${w}px`
    ]
    for (let i = 0; i < 4; i++) {
      this.rules[i]!.style.cssText =
        `position:absolute;background:${opts.ruleColour};${geometry[i]}`
    }
  }

  /** Everything back where the page put it. */
  private rest(): void {
    this.openNow = false
    if (this.applied === '') return
    this.applied = ''
    this.followed = -1
    this.drop()
    for (const tile of this.tiles) {
      tile.style.position = ''
      tile.style.inset = ''
      tile.style.margin = ''
      tile.style.zIndex = ''
      tile.style.clipPath = ''
      tile.style.pointerEvents = ''
      tile.setAttribute('aria-expanded', 'false')
      for (const child of tile.children) {
        if (child instanceof HTMLElement) child.style.transform = ''
      }
    }
    if (this.layer) this.layer.style.display = 'none'
    const back = this.restoreFocus
    this.restoreFocus = null
    // Only take focus back if it is still inside the grid we just closed.
    if (back && this.host?.contains(document.activeElement)) back.focus()
  }

  teardown(): void {
    this.rest()
    for (const tile of this.tiles) {
      tile.style.willChange = ''
      tile.removeAttribute('aria-expanded')
    }
    this.host?.removeEventListener('pointerdown', this.onPress)
    document.removeEventListener('keydown', this.onKey)
    this.layer?.remove()
    this.layer = null
    this.rules = []
    this.tiles = []
    this.cells = []
    this.atRest = []
    this.whenOpen.clear()
    this.live = []
    this.host = null
  }
}

/**
 * Mount ExpandingTiles onto `el`. Its element children are the tiles, laid out
 * by your own CSS: the effect never positions the grid, it only opens out of it.
 *
 * ```ts
 * const grid = createExpandingTiles(document.querySelector('#tiles')!)
 * grid.start()
 * // …later
 * grid.destroy()
 * ```
 *
 * Tiles that are links open and then follow their href, which is the whole
 * gesture: the page changes behind a tile that already fills the window. A tile
 * with no href stays open until it is dismissed with Escape or another press.
 */
export function createExpandingTiles(
  el: HTMLElement,
  opts: Partial<ExpandingTilesOptions> = {}
): EffectHandle {
  return mount<ExpandingTilesOptions>(el, opts, {
    defaults: expandingTilesDefaults,
    kind: 'dom',
    create: () => new ExpandingTilesSurface()
  })
}

export default createExpandingTiles
