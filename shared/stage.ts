/*
 * One context, handed along a page.
 *
 * A page built out of this library runs into the rule the library is built on:
 * one live WebGL context at a time. Twenty-eight of the items hold one, and
 * every backdrop does, so a page that wants a backdrop behind the hero, a
 * different one mid page and a third at the outro is asking for three.
 *
 * This keeps one. Sections are registered with a factory rather than a handle,
 * and the one nearest to owning the viewport is mounted while the others are
 * not merely paused but destroyed, their context given back. Scrolling hands
 * it along.
 *
 * Three things carry it, and the first two are the ones that look like
 * pessimisations until you have watched them go wrong.
 *
 * The outgoing section is destroyed before the incoming one is created. The
 * obvious order is the other way round, so there is no frame where neither is
 * drawn, and it is wrong: for that instant two contexts are live, which is the
 * thing being avoided, and on a device already at its limit the browser drops
 * the oldest to make room. The oldest is usually the one you just made.
 *
 * A challenger has to beat the incumbent by a margin. Switching on "whichever
 * is most visible" thrashes: at the boundary where two sections are equally in
 * view, a slow scroll mounts and destroys repeatedly, several times a second,
 * each one building a shader programme and throwing it away. The margin costs
 * nothing when the answer is obvious and is the whole difference when it is
 * not.
 *
 * And the decision is made once per frame, not once per observer callback. An
 * IntersectionObserver can report a dozen entries in one go while a page is
 * flung, and acting on each is a dozen decisions where one would do.
 */

import type { EffectHandle } from './runtime'

export type StageSection = {
  /** The element whose visibility decides whether this one is mounted. */
  el: HTMLElement
  /**
   * Makes the handle. A factory rather than a handle, because the point is
   * that nothing exists until the section is close enough to deserve it.
   */
  create: () => EffectHandle
}

export type StageOptions = {
  /**
   * How much more visible a challenger must be before it takes the context,
   * as a share of the viewport. Zero thrashes at every boundary.
   */
  margin?: number
  /** Below this share of the viewport, a section is not a candidate at all. */
  floor?: number
}

export type Stage = {
  /** Which section holds the context, or -1 while none does. */
  readonly live: number
  destroy(): void
}

const DEFAULTS = { margin: 0.12, floor: 0.08 }

/**
 * Keep one live effect across a page of sections.
 *
 * ```ts
 * const stage = createStage([
 *   { el: hero, create: () => createAuroraCurtain(heroCanvasHost) },
 *   { el: middle, create: () => createDustMotes(middleHost) }
 * ])
 * // …later
 * stage.destroy()
 * ```
 *
 * Only one of them is ever alive. The others do not exist: they are not
 * paused, they have been destroyed and their context handed on.
 */
export function createStage(sections: StageSection[], opts: StageOptions = {}): Stage {
  const margin = opts.margin ?? DEFAULTS.margin
  const floor = opts.floor ?? DEFAULTS.floor

  const seen = sections.map(() => 0)
  let live = -1
  let handle: EffectHandle | null = null
  let queued = 0
  let destroyed = false

  /*
   * Thresholds at every twentieth, so a long section that never leaves the
   * viewport still reports a changing ratio as it moves through. With only 0
   * and 1 a full-height section is 1 the whole way and the observer goes
   * quiet, which is exactly when the decision matters.
   */
  const steps = Array.from({ length: 21 }, (_, i) => i / 20)

  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        const i = sections.findIndex(s => s.el === entry.target)
        if (i >= 0) seen[i] = entry.intersectionRatio
      }
      schedule()
    },
    { threshold: steps }
  )

  function schedule() {
    if (destroyed || queued) return
    // One decision per frame, however many entries arrived.
    queued = requestAnimationFrame(() => {
      queued = 0
      settle()
    })
  }

  function settle() {
    if (destroyed) return

    let best = -1
    let bestRatio = floor
    for (let i = 0; i < sections.length; i++) {
      if (seen[i]! > bestRatio) {
        best = i
        bestRatio = seen[i]!
      }
    }

    if (best === live) return

    /*
     * The incumbent keeps it unless the challenger is clearly better. Without
     * this a scroll that parks the boundary between two sections swaps the
     * context back and forth for as long as the reader sits there.
     */
    if (live >= 0 && best >= 0 && bestRatio - seen[live]! < margin) return

    // Give it back first. See the note at the top: never two at once.
    handle?.destroy()
    handle = null
    live = -1

    if (best >= 0) {
      handle = sections[best]!.create()
      handle.start()
      live = best
    }
  }

  for (const section of sections) observer.observe(section.el)

  return {
    get live() {
      return live
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      if (queued) cancelAnimationFrame(queued)
      observer.disconnect()
      handle?.destroy()
      handle = null
      live = -1
    }
  }
}
