/*
 * ClickSpark: Beamish
 * https://beamish.ink/effects/click-spark
 *
 * A burst of sparks where you click. It is the cheapest piece of feedback there
 * is and it is genuinely useful, which is why everybody ships one and why most
 * of them look like confetti.
 *
 * Three things make a spark read as a spark rather than as a dot moving:
 *
 *   It is drawn as a streak, not a point, and the streak is as long as the
 *   spark is fast. That is what a short exposure of something hot and moving
 *   actually looks like, and it is the single difference between this and a
 *   particle demo. The streaks shorten on their own as the sparks slow down,
 *   with nothing extra to animate.
 *
 *   It slows down. A spark meets air, so its speed decays rather than running
 *   on at whatever it started with. Linear motion outwards is the giveaway of
 *   every version of this: the burst expands like a diagram of an explosion
 *   instead of like one.
 *
 *   It falls, a little. Not enough to read as gravity, just enough that the
 *   burst is not symmetrical, because a symmetrical burst is a snowflake.
 *
 * A pool of elements is built once and reused. Bursts do not create or destroy
 * anything: there is a fixed number of streaks, and a click takes the oldest
 * slot. That caps the cost of somebody holding a mouse button down and clicking
 * forty times, which is a thing people do the moment they notice this exists.
 *
 * It is pure in `t` given the clicks. Every streak's position is a function of
 * its burst's age, so the recorder can seek, and `pressPath` lets a take be
 * recorded with clicks in it without anything having been clicked.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type ClickSparkOptions = BaseOptions & {
  /** Streaks in one burst. */
  count: number
  /** How many bursts can be in the air at once. */
  bursts: number
  /** The spark. */
  colour: string
  /** How fast a spark leaves, as a share of the shorter side per second. */
  speed: number
  /** Seconds for a spark to lose most of its speed to the air. */
  drag: number
  /** How far the burst droops, as a share of the shorter side per second. */
  gravity: number
  /** Seconds a spark lasts. */
  life: number
  /** How long a streak is for a given speed, in seconds of travel. */
  streak: number
  /** Thickness of a streak, in pixels. */
  thickness: number
  /** How uneven the burst is, 0 to 1. 0 is a perfect star. */
  scatter: number
  /** Seed for the scatter. The same seed gives the same burst. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const clickSparkDefaults: ClickSparkOptions = {
  count: 11,
  bursts: 4,
  colour: '#c44400',
  speed: 1.15,
  drag: 0.22,
  gravity: 0.55,
  life: 0.62,
  streak: 0.055,
  thickness: 2,
  scatter: 0.45,
  seed: 7,
  reducedMotionTime: 0
}

const TAU = Math.PI * 2

function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 1 | h)
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

type Burst = { t: number; x: number; y: number; id: number }

class ClickSparkSurface implements Surface<ClickSparkOptions> {
  private host: HTMLElement | null = null
  private layer: HTMLElement | null = null
  private streaks: HTMLElement[] = []
  private live: Burst[] = []
  private nextId = 1
  private pooledFor = -1
  private colouredFor = ''
  private lastTime = 0
  private onPress: ((event: PointerEvent) => void) | null = null
  private box = { width: 1, height: 1, short: 1 }

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host

    /*
     * The streaks go in a layer of their own, over whatever the element holds
     * and deaf to the pointer. The element keeps its own content: this is an
     * overlay on a button or a panel, not a replacement for one.
     */
    const layer = document.createElement('div')
    layer.setAttribute('aria-hidden', 'true')
    layer.style.cssText =
      'position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:1'
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.append(layer)
    this.layer = layer

    /*
     * Listened for on the element rather than on the layer, because the layer
     * cannot be hit and the content under it must still be clickable. A click
     * on a button inside bubbles up to here and lights it, which is the whole
     * point: the feedback belongs to the thing that was pressed.
     */
    this.onPress = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      this.live.push({
        t: this.lastTime,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        id: this.nextId++
      })
    }
    host.addEventListener('pointerdown', this.onPress)
  }

  /*
   * The pool, and the one thing every streak shares. The colour is set here
   * rather than per streak per frame: it is the same for all of them, and
   * writing it in the loop also left it behind on hidden streaks, which is
   * enough to stop the DOM being a function of t.
   */
  private pool(total: number, colour: string): void {
    const layer = this.layer
    if (!layer || (this.pooledFor === total && this.colouredFor === colour)) return
    if (this.pooledFor === total) {
      for (const streak of this.streaks) streak.style.background = colour
      this.colouredFor = colour
      return
    }
    this.colouredFor = colour
    layer.textContent = ''
    this.streaks = []
    for (let i = 0; i < total; i++) {
      const streak = document.createElement('i')
      streak.style.cssText =
        'position:absolute;top:0;left:0;display:block;border-radius:999px;' +
        'transform-origin:0 50%;will-change:transform,opacity;opacity:0;background:' +
        colour
      layer.append(streak)
      this.streaks.push(streak)
    }
    this.pooledFor = total
  }

  resize(size: { width: number; height: number }): void {
    this.box = {
      width: size.width,
      height: size.height,
      short: Math.max(Math.min(size.width, size.height), 1)
    }
  }

  render(t: number, opts: ClickSparkOptions): void {
    this.lastTime = t

    const count = Math.max(1, Math.round(opts.count))
    const slots = Math.max(1, Math.round(opts.bursts))
    this.pool(count * slots, opts.colour)

    /*
     * Scripted presses and real ones are the same kind of thing, so they go in
     * the same list. The scripted ones are rebuilt from the options each frame
     * rather than remembered, which is what keeps a scripted take pure in t:
     * seeking backwards un-fires them.
     */
    const scripted = opts.pressPath ?? []
    const all: Burst[] = []
    for (let i = 0; i < scripted.length; i++) {
      const key = scripted[i]!
      if (key.t <= t) {
        all.push({ t: key.t, x: key.x * this.box.width, y: key.y * this.box.height, id: -i - 1 })
      }
    }
    // Real presses, oldest first, and anything long dead is dropped so the list
    // does not grow for the life of the page.
    this.live = this.live.filter(burst => t - burst.t <= opts.life * 1.2 && burst.t <= t)
    for (const burst of this.live) all.push(burst)

    // The newest bursts win the slots. Somebody who clicks forty times gets the
    // last four, which is the only sane answer and also a fixed cost.
    const shown = all.slice(-slots)

    const short = this.box.short
    const speed = opts.speed * short
    const gravity = opts.gravity * short
    const drag = Math.max(opts.drag, 0.001)
    const life = Math.max(opts.life, 0.001)

    for (let slot = 0; slot < slots; slot++) {
      const burst = shown[shown.length - slots + slot]
      for (let j = 0; j < count; j++) {
        const streak = this.streaks[slot * count + j]
        if (!streak) continue
        const age = burst ? t - burst.t : -1
        if (!burst || age < 0 || age > life) {
          /*
           * Cleared rather than just hidden. An invisible streak holding the
           * geometry of the burst it was last part of is not wrong on screen,
           * but it means the DOM is no longer a function of t alone: seek
           * backwards past a burst and the elements still carry it. Guarded, so
           * an idle effect writes nothing.
           */
          if (streak.style.opacity !== '0') {
            streak.style.opacity = '0'
            streak.style.transform = ''
            streak.style.width = ''
            streak.style.height = ''
          }
          continue
        }

        /*
         * The spark. Angle is an even fan pushed about by a hash, so a burst
         * has a shape to it rather than being a star: `scatter` at 0 is a
         * perfect star, which is a snowflake.
         */
        const seedA = hash2(j + 1, burst.id * 31 + opts.seed)
        const seedB = hash2(j + 97, burst.id * 31 + opts.seed)
        const angle = (j / count) * TAU + (seedA - 0.5) * TAU * opts.scatter * (1 / count) * 2.4
        const launch = speed * (0.55 + seedB * 0.9)

        /*
         * Distance under drag, and the speed that goes with it. A spark meets
         * air: it does not run on at the speed it left. Linear motion outwards
         * is the giveaway of every version of this effect.
         */
        const travelled = launch * drag * (1 - Math.exp(-age / drag))
        const current = launch * Math.exp(-age / drag)

        const x = burst.x + Math.cos(angle) * travelled
        // Plus a little fall, so the burst is not symmetrical. A symmetrical
        // burst reads as a snowflake rather than as something thrown.
        const y = burst.y + Math.sin(angle) * travelled + 0.5 * gravity * age * age

        // The streak is as long as the spark is fast, which is what a short
        // exposure of something hot and moving looks like. It shortens on its
        // own as the spark slows, with nothing extra to animate.
        const length = Math.max(current * opts.streak, 1)
        const fade = 1 - age / life

        streak.style.width = `${length.toFixed(2)}px`
        streak.style.height = `${Math.max(opts.thickness, 0.5).toFixed(2)}px`
        // Drawn from its own tail, so it trails behind where the spark is.
        streak.style.transform =
          `translate(${(x - Math.cos(angle) * length).toFixed(2)}px, ${(y - Math.sin(angle) * length).toFixed(2)}px) ` +
          `rotate(${((angle * 180) / Math.PI).toFixed(2)}deg)`
        streak.style.opacity = (fade * fade).toFixed(3)
      }
    }
  }

  teardown(): void {
    const host = this.host
    if (host && this.onPress) host.removeEventListener('pointerdown', this.onPress)
    this.layer?.remove()
    if (host) host.style.position = ''
    this.host = null
    this.layer = null
    this.streaks = []
    this.live = []
    this.pooledFor = -1
    this.colouredFor = ''
    this.onPress = null
  }
}

/**
 * Mount ClickSpark onto `el`. Put it on the thing being clicked, or on a
 * wrapper around it: the element keeps its own content and the sparks go in a
 * layer over the top that the pointer cannot touch.
 *
 * ```ts
 * const sparks = createClickSpark(document.querySelector('#buy')!)
 * sparks.start()
 * // …later
 * sparks.destroy()
 * ```
 */
export function createClickSpark(
  el: HTMLElement,
  opts: Partial<ClickSparkOptions> = {}
): EffectHandle {
  return mount<ClickSparkOptions>(el, opts, {
    defaults: clickSparkDefaults,
    kind: 'dom',
    create: () => new ClickSparkSurface()
  })
}

export default createClickSpark
