/*
 * Quoin & Rule, wired up.
 *
 * Everything this page does comes from the library. The only code here is the
 * wiring: which item goes on which element, and the stage deciding which of
 * the two backdrops is allowed a context.
 *
 * The manifest at the foot of the page is written from this list rather than
 * typed into the HTML. A hand-written list of what a page uses is wrong the
 * first time an item is added, renamed or dropped, and the whole value of it
 * is being true.
 */

import { createStage } from '../../shared/stage'
import paperGrain from '../../effects/paper-grain/core'
import registrationMarks from '../../effects/registration-marks/core'
import maskedHeading from '../../effects/masked-heading/core'
import rotatingWords from '../../effects/rotating-words/core'
import countUpNumber from '../../effects/count-up-number/core'
import splitFountainText from '../../effects/split-fountain-text/core'
import type { EffectHandle } from '../../shared/runtime'
/*
 * The manifest comes from meta.json rather than being typed here.
 *
 * It used to be a list in this file, on the grounds that the page is the only
 * place that knows what it mounted. That was true while nobody pasted these.
 * A template ships a prompt, the prompt has to say what to fetch, and it
 * reads meta.json, so the list moved there and this file reads it back. Still
 * one list: the colophon at the foot of the page and the prompt that builds
 * the page are composed from the same array.
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
 * The two backdrops, brokered.
 *
 * Both want a WebGL context and the rule is one at a time, so neither is
 * mounted until its band owns the viewport and the other is destroyed when it
 * stops. Scrolling hands the context from the hero to the press and back.
 */
const sections = [...document.querySelectorAll<HTMLElement>('[data-stage-section]')]
const stage = createStage(
  sections.map(section => {
    const host = section.querySelector<HTMLElement>('[data-backdrop]')!
    const which = host.dataset['backdrop']
    return {
      el: section,
      create: () =>
        which === 'paper-grain'
          ? paperGrain(host)
          : registrationMarks(host)
    }
  })
)

/* The hero line, uncovered rather than wiped. */
const hero = at('#hero-line')
if (hero) keep(maskedHeading(hero, { direction: 'up', duration: 1700, hold: 350 }))

/* The word that changes, in a box the sentence cannot feel. */
const words = at('#we-print')
if (words) keep(rotatingWords(words, { interval: 2400, rise: 0, blur: 0 }))

/* Three figures, counted up once. */
for (const counter of document.querySelectorAll<HTMLElement>('.counter')) {
  keep(countUpNumber(counter, { duration: 1400 }))
}

/* One pass of ink across the pull quote. */
const quote = at('#quote-line')
/*
 * The fountain split, in the page's own two inks.
 *
 * The item's default is three: orange, purple and blue, which is a beautiful
 * thing and belongs to a different page. This one says in its own stylesheet
 * that it has one ink, one paper and one second colour, and a six-colour
 * rainbow across the only quote on the page makes that a claim rather than a
 * rule. A press splits the fountain between two inks anyway; `second` matching
 * `third` is how the item is told to do that.
 *
 * Read off the page rather than typed here, so the two cannot drift apart when
 * the stylesheet is retuned.
 */
const inkOf = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

if (quote) {
  const ink = inkOf('--ink', '#16150f')
  const second = inkOf('--second', '#b3301c')
  keep(splitFountainText(quote, { first: ink, second, third: second, angle: 8, blend: 0.5 }))
}

/* The colophon, written from what was actually mounted. */
const manifest = at('#manifest')
if (manifest) {
  for (const item of used) {
    const li = document.createElement('li')
    const label = item.slug
      ? `<a href="https://beamish.ink/${item.kind === 'grid' ? 'grids' : 'effects'}/${item.slug}">${item.name}</a>`
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
  }
}

;(window as never as { __beamish: Driver }).__beamish = driver

if (!new URLSearchParams(location.search).has('record')) scrollTo(0, 0)
