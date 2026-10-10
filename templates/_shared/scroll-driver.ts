/*
 * The handle the recorder drives a whole page with.
 *
 * A template is a page rather than an item, so there is no effect to call
 * `renderAtTime` on. What the recorder wants instead is a scroll position that
 * is a pure function of `t`, which is this: down the page and back, eased, over
 * the span the recording asked for.
 *
 * Down AND back, because that is what closes the loop. The frame at t=0 and the
 * frame at t=span are both the top of the page, so the video joins to itself
 * with nothing to hide.
 *
 * Pure in `t`, like every other `renderAtTime` in this repo. It computes the
 * position from `t` alone and never from the position it is already at, so the
 * recorder can ask for frames in any order and seek backwards, and two runs of
 * the same take produce identical files.
 *
 * Every adapted template uses this unchanged. A template that does mount
 * library items wants the same scroll plus a pass over its own handles, which
 * is what `onFrame` is for.
 */

export type ScrollDriver = {
  renderAtTime(t: number): void
  start(): void
  stop(): void
  update(next?: { span?: number }): void
  destroy(): void
}

export type ScrollDriverOptions = {
  /** Seconds for the whole down-and-back. The recorder overrides it with ?span. */
  span?: number
  /** Called after the scroll is set, for a page that also drives its own items. */
  onFrame?: (t: number) => void
  /** Called on teardown, for whatever `onFrame` was driving. */
  onDestroy?: () => void
}

/* The library's one easing for arrivals, matching --ease-out-expo elsewhere. */
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

export function mountScrollDriver(options: ScrollDriverOptions = {}): ScrollDriver {
  const params = new URLSearchParams(location.search)
  let span = Number(params.get('span')) || options.span || 14

  const driver: ScrollDriver = {
    renderAtTime(t) {
      /*
       * Re-read the height every frame rather than caching it. A page with
       * scroll-triggered reveals grows as it is scrolled, and a cached height
       * from the first frame stops the take short of the foot of the page.
       */
      const reach = Math.max(document.body.scrollHeight - innerHeight, 0)
      const k = Math.min(Math.max(t / span, 0), 1)
      const there = k < 0.5 ? ease(k * 2) : ease((1 - k) * 2)
      scrollTo(0, reach * there)
      options.onFrame?.(t)
    },
    start() {},
    stop() {},
    update(next) {
      if (next && typeof next.span === 'number') span = next.span
    },
    destroy() {
      options.onDestroy?.()
    }
  }

  ;(window as never as { __beamish: ScrollDriver }).__beamish = driver

  /*
   * Only the recorder wants the page to start anywhere but the top. Without
   * this, opening a template after a reload lands wherever the browser
   * restored, and the first thing you see is the middle of the page.
   */
  if (!params.has('record')) scrollTo(0, 0)

  return driver
}
