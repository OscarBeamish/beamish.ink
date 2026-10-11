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
