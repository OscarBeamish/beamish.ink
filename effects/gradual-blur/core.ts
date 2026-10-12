/*
 * GradualBlur: Beamish
 * https://beamish.ink/effects/gradual-blur
 *
 * A band at the edge of a scrolling area where the content goes progressively
 * out of focus before it runs off. Haze, rather than a fade to the background
 * colour.
 *
 * The obvious way to build this does not work, and it is worth saying why
 * because the failure looks like a bug in the browser rather than a mistake.
 * One element, a backdrop-filter, and a gradient mask: what you get is a band
 * of fully blurred content whose *opacity* ramps away. Masking a blur fades how
 * much of the blurred layer you can see; it does nothing to how blurred it is.
 * The result has a hard edge where the blur starts, and no amount of softening
 * the mask moves it, because the edge is not in the mask.
 *
 * A blur that actually ramps has to be built out of several blurs. Each layer
 * here blurs twice as hard as the one below it and is masked to its own band,
 * and because a backdrop-filter sees everything painted beneath it, including
 * the previous layers, the blurs compound. Six layers at the default, and the
 * doubling is what makes six enough: a linear ramp over the same range needs
 * dozens before the steps stop showing.
 *
 * The bands overlap by one step on each side. Butted up against each other they
 * produce faint but perfectly visible seams, which on a white page look like
 * printing bands.
 */

import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type Scroll,
  type Surface
} from '../../shared/runtime'

export type GradualBlurEdge = 'top' | 'bottom' | 'left' | 'right'

export type GradualBlurOptions = BaseOptions & {
  /** Which edge the haze sits on. */
  edge: GradualBlurEdge
  /** How far it reaches in from that edge, as a share of the element. */
  depth: number
  /** Blur at the very edge, in pixels. */
  strength: number
  /** How many layers the ramp is built from. */
  layers: number
  /** A wash of colour over the haze. Leave the alpha at 0 for none. */
  tint: string
  /** How strong that wash is at the edge, 0 to 1. */
  wash: number
  /** Fade the haze in as the element is scrolled, rather than always on. */
  follow: boolean
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const gradualBlurDefaults: GradualBlurOptions = {
  edge: 'bottom',
  depth: 0.22,
  strength: 14,
  layers: 6,
  tint: '#fbfaf4',
  wash: 0.35,
  follow: false,
  reducedMotionTime: 0
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/* The direction a mask runs so that stop 0 is the far side and 1 is the edge. */
const TOWARDS: Record<GradualBlurEdge, string> = {
  top: 'to top',
  bottom: 'to bottom',
  left: 'to left',
  right: 'to right'
}

class GradualBlurSurface implements Surface<GradualBlurOptions> {
  private host: HTMLElement | null = null
  private band: HTMLElement | null = null
  private layers: HTMLElement[] = []
  private builtFor = ''

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host

    const band = document.createElement('div')
    band.setAttribute('aria-hidden', 'true')
    band.style.cssText = 'position:absolute;pointer-events:none;z-index:3'
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.append(band)
    this.band = band
  }

  /*
   * The stack. Rebuilt only when something about its shape changes, because
   * every layer is a backdrop-filter and churning them is the one way to make
   * this expensive.
   */
  private assemble(opts: GradualBlurOptions): void {
    const band = this.band
    if (!band) return
    const key = `${opts.edge}|${opts.depth}|${opts.strength}|${opts.layers}|${opts.tint}|${opts.wash}`
    if (this.builtFor === key) return
    this.builtFor = key

    const count = Math.max(1, Math.min(Math.round(opts.layers), 12))
    const depth = `${(clamp01(opts.depth) * 100).toFixed(3)}%`
    const vertical = opts.edge === 'top' || opts.edge === 'bottom'

    band.style.inset = vertical
      ? opts.edge === 'top'
        ? `0 0 auto 0`
        : `auto 0 0 0`
      : opts.edge === 'left'
        ? `0 auto 0 0`
        : `0 0 0 auto`
    band.style.width = vertical ? '100%' : depth
    band.style.height = vertical ? depth : '100%'

    band.textContent = ''
    this.layers = []

    const towards = TOWARDS[opts.edge]
    for (let i = 0; i < count; i++) {
      const layer = document.createElement('div')

      /*
       * Doubling, not stepping evenly. Each layer blurs twice the one below it,
       * and since a backdrop-filter sees everything painted beneath it the
       * blurs compound: the ramp is exponential where it looks linear, which is
       * how six layers cover a range that a linear ramp needs dozens for.
       */
      const blur = opts.strength / Math.pow(2, count - 1 - i)

      /*
       * The band this layer covers, overlapping its neighbours by one step on
       * each side. Butted up against each other instead, the layers leave faint
       * seams, which on a pale page read as printing bands.
       */
      const a = ((i - 1) / count) * 100
      const b = (i / count) * 100
      const c = ((i + 1) / count) * 100
      const d = ((i + 2) / count) * 100
      const mask =
        `linear-gradient(${towards}, ` +
        `rgba(0,0,0,0) ${a.toFixed(2)}%, rgba(0,0,0,1) ${b.toFixed(2)}%, ` +
        `rgba(0,0,0,1) ${c.toFixed(2)}%, rgba(0,0,0,0) ${d.toFixed(2)}%)`

      layer.style.cssText =
        'position:absolute;inset:0;pointer-events:none;' +
        `backdrop-filter:blur(${blur.toFixed(3)}px);` +
        `-webkit-backdrop-filter:blur(${blur.toFixed(3)}px);` +
        `mask-image:${mask};-webkit-mask-image:${mask};`
      band.append(layer)
      this.layers.push(layer)
    }

    /*
     * The wash, as one more layer on top. It is optional and it is not the same
     * thing as the blur: haze over a dark photograph wants a little light in it
     * or the blurred content stays as dark as it was and nothing reads as
     * distance.
     */
    if (opts.wash > 0) {
      const wash = document.createElement('div')
      const ramp =
        `linear-gradient(${towards}, rgba(0,0,0,0) 0%, rgba(0,0,0,${clamp01(opts.wash).toFixed(3)}) 100%)`
      wash.style.cssText =
        'position:absolute;inset:0;pointer-events:none;' +
        `background:${opts.tint};mask-image:${ramp};-webkit-mask-image:${ramp};`
      band.append(wash)
      this.layers.push(wash)
    }
  }

  resize(): void {}

  render(_t: number, opts: GradualBlurOptions, _pointer: unknown, scroll: Scroll): void {
    this.assemble(opts)
    const band = this.band
    if (!band) return

    /*
     * Either always on, or brought in by the scroll. The second is what a real
     * scrolling panel wants: there is nothing above the top of a list until it
     * has been scrolled, and a haze over nothing is a smudge on the glass.
     */
    const shown = opts.follow ? clamp01(scroll.progress * 3) : 1
    const value = shown.toFixed(3)
    if (band.style.opacity !== value) band.style.opacity = value
  }

  teardown(): void {
    this.band?.remove()
    if (this.host) this.host.style.position = ''
    this.host = null
    this.band = null
    this.layers = []
    this.builtFor = ''
  }
}

/**
 * Mount GradualBlur onto `el`. Put it on the scrolling area, not on the thing
 * inside it: the haze is a band at the element's own edge and the content moves
 * under it.
 *
 * ```ts
 * const haze = createGradualBlur(document.querySelector('#list')!)
 * haze.start()
 * // …later
 * haze.destroy()
 * ```
 */
export function createGradualBlur(
  el: HTMLElement,
  opts: Partial<GradualBlurOptions> = {}
): EffectHandle {
  return mount<GradualBlurOptions>(el, opts, {
    defaults: gradualBlurDefaults,
    kind: 'dom',
    create: () => new GradualBlurSurface()
  })
}

export default createGradualBlur
