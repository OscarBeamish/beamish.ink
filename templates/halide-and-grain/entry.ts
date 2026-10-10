/*
 * Halide & Grain, wired up.
 *
 * The only code here is the wiring: which item goes on which element, and the
 * stage deciding which of the two backdrops is allowed the context.
 *
 * Every item on this page is in service of the contact sheet rather than the
 * reason for it. HalftoneReveal is the hero frame being printed, ExpandingTiles
 * is a frame pulled for the enlarger, PaperGrain is the sheet underneath, and
 * the crosshair is the loupe. That ordering is the difference between a
 * template and a demonstration, and it is the thing the first two templates in
 * this collection got the wrong way round.
 */

import { createStage } from '../../shared/stage'
import halftoneReveal from '../../effects/halftone-reveal/core'
import paperGrain from '../../effects/paper-grain/core'
import expandingTiles from '../../effects/expanding-tiles/core'
import scrambleText from '../../effects/scramble-text/core'
import crosshairCursor from '../../effects/crosshair-cursor/core'
import countUpNumber from '../../effects/count-up-number/core'
import type { EffectHandle } from '../../shared/runtime'
/*
 * The manifest comes from meta.json rather than being typed here, so the
 * colophon at the foot of the page and the prompt that builds the page are
 * composed from the same array.
 */
import meta from './meta.json'

const used = meta.uses

const at = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)

const handles: EffectHandle[] = []
const keep = (handle: EffectHandle | null) => {
  if (handle) {
    handle.start()
    handles.push(handle)
  }
  return handle
}

/*
 * The two backdrops, brokered. Both want a WebGL context and the budget is
 * one, so neither is built until its band owns the viewport.
 */
const sections = [...document.querySelectorAll<HTMLElement>('[data-stage-section]')]
const stage = createStage(
  sections.map(section => {
    const host = section.querySelector<HTMLElement>('[data-backdrop]')!
    const which = host.dataset['backdrop']
    return {
      el: section,
      create: () => (which === 'halftone-reveal' ? halftoneReveal(host) : paperGrain(host))
    }
  })
)

/* The eyebrow, resolving the way a frame comes up in the developer. */
const eyebrow = at('#eyebrow')
if (eyebrow) keep(scrambleText(eyebrow))

/*
 * The sheet. `follow` is off because these frames have nowhere to go: on a
 * real site each tile would carry an href to the project behind it, and the
 * item would navigate once the opening finished.
 */
const tiles = at('#tiles')
if (tiles) keep(expandingTiles(tiles, { follow: false, ruleColour: 'rgba(228, 87, 46, 0.5)' }))

/* The loupe. Page wide, because the whole page is the sheet. */
keep(crosshairCursor(document.body, { colour: '#e4572e', target: '.tile, a, button' }))

/* The exposure data. */
for (const counter of document.querySelectorAll<HTMLElement>('.counter')) {
  keep(countUpNumber(counter, { duration: 1600 }))
}

/* The colophon, written from what the page says it is made of. */
const manifest = at('#manifest')
if (manifest) {
  const group = (kind: string) =>
    kind === 'grid' ? 'grids' : kind === 'component' ? 'components' : 'effects'
  for (const item of used) {
    const li = document.createElement('li')
    const label = item.slug
      ? `<a href="https://beamish.ink/${group(item.kind)}/${item.slug}">${item.name}</a>`
      : item.name
    li.innerHTML = `${label}<span class="kind">${item.kind}</span>`
    manifest.append(li)
  }
}

/*
 * The recorder drives the page itself. A scroll down and back is the only
 * honest take of a layout, and it closes the loop because the frame at 0 and
 * the frame at the end are the same frame.
 */
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
let span = Number(new URLSearchParams(location.search).get('span')) || 14

type Driver = {
  renderAtTime(t: number): void
  start(): void
  stop(): void
  update(next?: { span?: number }): void
  destroy(): void
}

const driver: Driver = {
  renderAtTime(t) {
    const reach = Math.max(document.body.scrollHeight - innerHeight, 0)
    const k = Math.min(Math.max(t / span, 0), 1)
    const there = k < 0.5 ? ease(k * 2) : ease((1 - k) * 2)
    scrollTo(0, reach * there)
    for (const handle of handles) handle.renderAtTime?.(t)
  },
  start() {},
  stop() {},
  update(next) {
    if (next && typeof next.span === 'number') span = next.span
  },
  destroy() {
    stage.destroy()
    for (const handle of handles) handle.destroy()
  }
}

;(window as never as { __beamish: Driver }).__beamish = driver

if (!new URLSearchParams(location.search).has('record')) scrollTo(0, 0)
