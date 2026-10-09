/*
 * Coil & Bias, wired up.
 *
 * Everything this page does comes from the library. The only code here is the
 * wiring: which item goes on which element, and the stage deciding which of
 * the three backdrops is allowed the context.
 *
 * Three is the point. The studio page has two, which proves the stage can hand
 * a context over once. Three proves it can hand one along, build and destroy
 * the same slot twice, and come back up the page without the count ever
 * reaching two.
 *
 * The manifest at the foot is written from this list rather than typed into
 * the HTML, for the same reason as next door: a hand-written list of what a
 * page uses is wrong the first time an item is added or dropped.
 */

import { createStage } from '../../shared/stage'
import auroraCurtain from '../../effects/aurora-curtain/core'
import lightShafts from '../../effects/light-shafts/core'
import dustMotes from '../../effects/dust-motes/core'
import spotlightCard from '../../effects/spotlight-card/core'
import decodeText from '../../effects/decode-text/core'
import countUpNumber from '../../effects/count-up-number/core'
import odometerNumber from '../../effects/odometer-number/core'
import { attachRefraction, watchSettle } from '../../components/glass-nav/glass'
import type { EffectHandle } from '../../shared/runtime'

type Used = { name: string; slug: string; kind: 'effect' | 'component' | 'grid' | 'shared' }

const used: Used[] = [
  { name: 'TwelveColumn', slug: 'twelve-column', kind: 'grid' },
  { name: 'GlassNav', slug: 'glass-nav', kind: 'component' },
  { name: 'AuroraCurtain', slug: 'aurora-curtain', kind: 'effect' },
  { name: 'LightShafts', slug: 'light-shafts', kind: 'effect' },
  { name: 'DustMotes', slug: 'dust-motes', kind: 'effect' },
  { name: 'SpotlightCard', slug: 'spotlight-card', kind: 'effect' },
  { name: 'DecodeText', slug: 'decode-text', kind: 'effect' },
  { name: 'CountUpNumber', slug: 'count-up-number', kind: 'effect' },
  { name: 'OdometerNumber', slug: 'odometer-number', kind: 'effect' },
  { name: 'Stage', slug: '', kind: 'shared' }
]

const at = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)

const handles: EffectHandle[] = []
const keep = (handle: EffectHandle | null) => {
  if (handle) {
    handle.start()
    handles.push(handle)
  }
  return handle
}

/* Cleanups that are not EffectHandles, from the component tier. */
const cleanups: Array<() => void> = []

/*
 * The three backdrops, brokered.
 *
 * Each wants a WebGL context and the budget is one, so none is mounted until
 * its band owns the viewport, and the outgoing one is destroyed before the
 * incoming one is built. Scrolling the page is what moves the context.
 *
 * The darkness of each is tuned to the band it sits in rather than left at the
 * default. A backdrop that is brighter than the type over it is the one way a
 * dark page reliably goes wrong.
 */
const sections = [...document.querySelectorAll<HTMLElement>('[data-stage-section]')]
const stage = createStage(
  sections.map(section => {
    const host = section.querySelector<HTMLElement>('[data-backdrop]')!
    const which = host.dataset['backdrop']
    return {
      el: section,
      create: () => {
        if (which === 'aurora-curtain') {
          return auroraCurtain(host, { sky: '#0b0d10', brightness: 0.62, stars: 0.5 })
        }
        if (which === 'light-shafts') {
          return lightShafts(host, { ground: '#0b0d10', strength: 0.5, dust: 0.35 })
        }
        return dustMotes(host, { ground: '#0b0d10', mote: '#9fb4c7', haze: 0.25 })
      }
    }
  })
)

/*
 * The bar. GlassNav's two primitives are the whole of it: one writes how far
 * the page has settled, the other builds the lens that bends what is behind.
 */
const crossbar = at('#crossbar')
if (crossbar) {
  cleanups.push(watchSettle(crossbar))
  cleanups.push(attachRefraction(crossbar, 18, 14))
}

/* The hero line, resolving out of noise rather than fading in. */
const hero = at('#hero-line')
if (hero) keep(decodeText(hero, { stagger: 26, hold: 420 }))

/*
 * The cards. SpotlightCard never declared a ground, so this page is the first
 * thing that asks it the question. It draws light, and light on a dark card is
 * the case it is best at.
 */
for (const card of document.querySelectorAll<HTMLElement>('.card')) {
  keep(spotlightCard(card, { light: '#9fd8d0', spread: 0.55, shade: 0.4 }))
}

/*
 * The watts, on a drum. digits defaults to six, which pads a two figure
 * number out to 000012 and reads at rest as a row of noughts rather than as a
 * specification.
 */
const odo = at('.odo')
if (odo) keep(odometerNumber(odo, { from: 0, to: 12, duration: 1600, digits: 2 }))

/*
 * The other two figures, counted. The distortion figure needs decimals: the
 * option defaults to none, so a target of 0.04 counts to a flat zero and the
 * page quietly claims perfection.
 */
const counters = [...document.querySelectorAll<HTMLElement>('.counter')]
if (counters[0]) keep(countUpNumber(counters[0], { duration: 1500, decimals: 2 }))
if (counters[1]) keep(countUpNumber(counters[1], { duration: 1500 }))

/* The colophon, written from what was actually mounted. */
const manifest = at('#manifest')
if (manifest) {
  const group = (kind: Used['kind']) =>
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
 * honest take of a layout, and it closes the loop exactly because the frame at
 * 0 and the frame at the end are the same frame.
 *
 * It also has to drive every handle, since the runtime's own loop is stopped
 * under ?record. The stage is not driven: which backdrop is live is a function
 * of the scroll, and the scroll is a function of t, so it follows.
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
    for (const off of cleanups) off()
  }
}

;(window as never as { __beamish: Driver }).__beamish = driver

if (!new URLSearchParams(location.search).has('record')) scrollTo(0, 0)
