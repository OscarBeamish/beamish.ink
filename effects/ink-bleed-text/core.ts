/*
 * InkBleedText: Beamish
 * https://beamish.ink/effects/ink-bleed-text
 *
 * Type printed on paper that is too absorbent for it.
 *
 * The usual version of this is a CRT wobble: the glyph edges shimmer sideways
 * like a signal losing lock. Paper has its own way of blurring a letter and it
 * is nothing like that. Ink wicks along the fibres, so the edge does not move,
 * it grows teeth. Serifs fill in, counters close up, and the whole letter gains
 * a fuzz that is irregular at the scale of the fibre rather than smooth.
 *
 * An SVG displacement filter is the honest way to draw that. Turbulence supplies
 * the fibre, and feDisplacementMap pushes each pixel of the glyph sideways by the
 * amount of fibre under it, which is exactly the mechanism: ink goes where the
 * paper lets it. A Gaussian blur would soften the edge evenly, which is a lens
 * being out of focus rather than ink spreading, and it is the thing that makes
 * most attempts at this look like a photograph rather than a page.
 *
 * Only the displacement scale is animated. Turbulence is expensive to recompute
 * and the fibre of a sheet does not change; what changes is how far the ink has
 * crept into it.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type InkBleedTextOptions = BaseOptions & {
  /** How far the ink creeps, in pixels, at its furthest. */
  bleed: number
  /** How far it has crept at its least. Never quite dry. */
  floor: number
  /** Coarseness of the fibre. Lower is a rougher, more absorbent sheet. */
  fibre: number
  /** Layers of fibre. More is a finer, more tangled structure. */
  detail: number
  /** Seconds for one breath of the ink. Exactly periodic over this. */
  period: number
  /** Which sheet of paper. Any two seeds give different fibre. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const inkBleedTextDefaults: InkBleedTextOptions = {
  bleed: 3.4,
  floor: 1.1,
  fibre: 0.035,
  detail: 3,
  period: 9,
  seed: 4,
  reducedMotionTime: 0
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const TAU = Math.PI * 2

/* One per instance, so two bled headings on a page do not share a filter. */
let instances = 0

class InkBleedTextSurface implements Surface<InkBleedTextOptions> {
  private host: HTMLElement | null = null
  private svg: SVGSVGElement | null = null
  private turbulence: SVGFETurbulenceElement | null = null
  private displacement: SVGFEDisplacementMapElement | null = null
  private previousFilter = ''
  private id = ''
  private builtFor = ''

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host
    this.id = `beamish-bleed-${(instances += 1)}`

    /*
     * The filter lives in an SVG of its own rather than in the document, so
     * tearing the effect down is one removal and nothing is left behind in a
     * shared defs block that another instance might still be using.
     */
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'

    const filter = document.createElementNS(SVG_NS, 'filter')
    filter.setAttribute('id', this.id)
    /*
     * Room for the ink to spread into. The default filter region is the element
     * plus ten percent, and displaced pixels outside it are simply cut off, so
     * a heavily bled letter would come back with its edges sliced square.
     */
    filter.setAttribute('x', '-25%')
    filter.setAttribute('y', '-25%')
    filter.setAttribute('width', '150%')
    filter.setAttribute('height', '150%')
    filter.setAttribute('color-interpolation-filters', 'sRGB')

    const turbulence = document.createElementNS(SVG_NS, 'feTurbulence')
    // Fractal noise rather than turbulence proper: turbulence takes the modulus
    // of each octave, which leaves hard creases that read as cracks in the
    // letter rather than as fibre.
    turbulence.setAttribute('type', 'fractalNoise')
    turbulence.setAttribute('result', 'fibre')

    const displacement = document.createElementNS(SVG_NS, 'feDisplacementMap')
    displacement.setAttribute('in', 'SourceGraphic')
    displacement.setAttribute('in2', 'fibre')
    displacement.setAttribute('xChannelSelector', 'R')
    displacement.setAttribute('yChannelSelector', 'G')

    filter.append(turbulence, displacement)
    svg.append(filter)
    document.body.append(svg)

    this.previousFilter = host.style.filter
    host.style.filter = `url(#${this.id})`

    this.svg = svg
    this.turbulence = turbulence
    this.displacement = displacement
  }

  resize(): void {}

  render(t: number, opts: InkBleedTextOptions): void {
    const turbulence = this.turbulence
    const displacement = this.displacement
    if (!turbulence || !displacement) return

    /*
     * The fibre is set only when it changes. Recomputing turbulence is by far
     * the expensive half of this filter, and the fibre of a sheet does not
     * change from one frame to the next; only how far the ink has got into it.
     */
    const key = `${opts.fibre}|${opts.detail}|${opts.seed}`
    if (key !== this.builtFor) {
      turbulence.setAttribute('baseFrequency', String(Math.max(opts.fibre, 0.001)))
      turbulence.setAttribute('numOctaves', String(Math.max(1, Math.round(opts.detail))))
      turbulence.setAttribute('seed', String(opts.seed))
      this.builtFor = key
    }

    // A cosine between floor and bleed, so it is exactly periodic and never
    // fully dries: a sheet that has taken ink does not give it back.
    const phase = TAU * (t / Math.max(opts.period, 0.001))
    const swing = (1 - Math.cos(phase)) * 0.5
    const scale = opts.floor + (opts.bleed - opts.floor) * swing

    displacement.setAttribute('scale', scale.toFixed(3))
  }

  teardown(): void {
    // Put the markup back. The effect borrowed the element; it does not own it.
    if (this.host) this.host.style.filter = this.previousFilter
    this.svg?.remove()
    this.svg = null
    this.turbulence = null
    this.displacement = null
    this.host = null
    this.builtFor = ''
  }
}

/**
 * Mount InkBleedText onto an element that already contains the text.
 *
 * ```html
 * <h1 id="title">Blotting</h1>
 * ```
 *
 * ```ts
 * const bleed = createInkBleedText(document.querySelector('#title')!)
 * bleed.start()
 * ```
 */
export function createInkBleedText(
  el: HTMLElement,
  opts: Partial<InkBleedTextOptions> = {}
): EffectHandle {
  return mount<InkBleedTextOptions>(el, opts, {
    defaults: inkBleedTextDefaults,
    create: () => new InkBleedTextSurface(),
    // A text treatment filters content that is already on the page, so it gets
    // the host element rather than a canvas it would never draw into.
    kind: 'dom'
  })
}

export default createInkBleedText
