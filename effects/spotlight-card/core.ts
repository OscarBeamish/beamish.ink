/*
 * SpotlightCard: Beamish
 * https://beamish.ink/effects/spotlight-card
 *
 * A card under a desk lamp, with the cursor as the lamp.
 *
 * The usual version of this puts a bright radial glow on a dark card and calls
 * it a spotlight. That is a light source sitting on the surface, which is not
 * what a lamp does to paper. Paper is matte: it scatters. Move a lamp across a
 * card and what you see is a broad, low-contrast lift across the whole face,
 * and a hard bright line on whichever edge is turned toward the light.
 *
 * So there are two things here rather than one. A wide, weak sheen that follows
 * the lamp, and an edge highlight that moves round the border to the side the
 * light is coming from. The edge is the part that sells it: a glow with no lit
 * edge reads as something emitting light, and a card does not emit anything.
 *
 * Nothing is measured per frame. Both layers are painted by CSS from two custom
 * properties, so moving the lamp costs two property writes and a composite.
 */

import { mount, type BaseOptions, type EffectHandle, type Pointer, type Surface } from '../../shared/runtime'

export type SpotlightCardOptions = BaseOptions & {
  /** Colour of the lamp. Warm, unless the room is not. */
  light: string
  /** How much the face lifts under the lamp. */
  sheen: number
  /** How wide the lift is, as a share of the card. */
  spread: number
  /** How brightly the edge facing the lamp catches. */
  edge: number
  /** How far the edge away from the lamp falls into shade. */
  shade: number
  /** Seconds for the lamp to catch up with the cursor. */
  ease: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const spotlightCardDefaults: SpotlightCardOptions = {
  light: '#fff6e4',
  sheen: 0.5,
  spread: 0.85,
  edge: 0.7,
  shade: 0.5,
  ease: 0.12,
  reducedMotionTime: 0,
  /*
   * Window scope, so the sheen has started to move before the cursor reaches
   * the card. A lamp carried across a desk lights the card on the way.
   */
  pointerScope: 'window'
}

class SpotlightCardSurface implements Surface<SpotlightCardOptions> {
  private host: HTMLElement | null = null
  private layer: HTMLElement | null = null
  private previousPosition = ''
  private x = 0.5
  private y = 0.5
  private lit = 0

  setup(ctx: { host: HTMLElement }): void {
    const host = ctx.host
    this.host = host

    // The card has to be a containing block for the layer below, and it is not
    // this effect's business to decide anything else about its layout.
    this.previousPosition = host.style.position
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'

    /*
     * One element for both layers: the sheen is its background and the edge is
     * its border, so a single composited node carries the whole effect. Added
     * rather than required of the markup, so the card you pass in is whatever
     * markup you already had.
     */
    const layer = document.createElement('span')
    layer.setAttribute('aria-hidden', 'true')
    layer.style.cssText = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      'border-radius:inherit',
      'will-change:background,box-shadow'
    ].join(';')
    host.append(layer)
    this.layer = layer
  }

  resize(): void {}

  render(_t: number, opts: SpotlightCardOptions, pointer: Pointer): void {
    const layer = this.layer
    if (!layer) return

    /*
     * Eased toward the pointer rather than snapped to it. A lamp has mass and a
     * hand is not precise; following exactly reads as a cursor-attached
     * rectangle rather than as something being lit.
     *
     * This integrates against the previous frame, so it is deliberately not
     * pure in `t`. Every pointer effect here has the same shape, and the
     * recorder drives it from a scripted path instead.
     */
    const k = Math.min(Math.max(opts.ease, 0.01), 1)
    this.x += (pointer.x - this.x) * k
    this.y += (pointer.y - this.y) * k
    this.lit += ((pointer.active ? 1 : 0) - this.lit) * k

    const px = (this.x * 100).toFixed(2)
    const py = (this.y * 100).toFixed(2)
    const radius = (Math.max(opts.spread, 0.05) * 140).toFixed(1)

    /*
     * Light and shade together, not light alone.
     *
     * The first version screened a warm glow over the card, which is what the
     * physics says and what nothing in a light room can actually see: a near
     * white card lifted a few percent is indistinguishable from a near white
     * card. What makes a lit object read is the gradient across it, so the far
     * side falls into shade as the near side lifts. Painted normally rather
     * than screened, because screening cannot darken anything.
     */
    const lightAmount = (opts.sheen * this.lit * 100).toFixed(1)
    const shadeAmount = (opts.shade * this.lit * 22).toFixed(1)

    // Along the lamp, in degrees, so the shade falls directly opposite it.
    const angle = (Math.atan2(this.y - 0.5, this.x - 0.5) * 180) / Math.PI + 90

    layer.style.background =
      `radial-gradient(${radius}% ${radius}% at ${px}% ${py}%, ` +
      `color-mix(in srgb, ${opts.light} ${lightAmount}%, transparent), ` +
      'transparent 70%), ' +
      `linear-gradient(${angle.toFixed(1)}deg, ` +
      'transparent 35%, ' +
      `color-mix(in srgb, #201f1a ${shadeAmount}%, transparent))`

    /*
     * The lit edge, and the one opposite it. An inset shadow cast from the far
     * side puts the bright line on the near edge, which is where it belongs:
     * the edge turned toward a light is the one that catches it. The second
     * shadow does the same in reverse and is what gives the card a thickness.
     */
    const reach = 2 + opts.edge * 10
    const dx = (0.5 - this.x) * reach
    const dy = (0.5 - this.y) * reach
    const lit = (opts.edge * this.lit * 100).toFixed(1)
    const dark = (opts.shade * this.lit * 40).toFixed(1)
    layer.style.boxShadow =
      `inset ${dx.toFixed(2)}px ${dy.toFixed(2)}px 0 -1px ` +
      `color-mix(in srgb, ${opts.light} ${lit}%, transparent), ` +
      `inset ${(-dx).toFixed(2)}px ${(-dy).toFixed(2)}px 0 -1px ` +
      `color-mix(in srgb, #201f1a ${dark}%, transparent)`
  }

  teardown(): void {
    this.layer?.remove()
    if (this.host) this.host.style.position = this.previousPosition
    this.layer = null
    this.host = null
    this.lit = 0
  }
}

/**
 * Mount SpotlightCard onto a card that already exists.
 *
 * ```html
 * <article id="card">…</article>
 * ```
 *
 * ```ts
 * const spotlight = createSpotlightCard(document.querySelector('#card')!)
 * spotlight.start()
 * ```
 */
export function createSpotlightCard(
  el: HTMLElement,
  opts: Partial<SpotlightCardOptions> = {}
): EffectHandle {
  return mount<SpotlightCardOptions>(el, opts, {
    defaults: spotlightCardDefaults,
    create: () => new SpotlightCardSurface(),
    // A surface treatment lights markup that is already on the page, so it gets
    // the host element rather than a canvas it would never draw into.
    kind: 'dom'
  })
}

export default createSpotlightCard
