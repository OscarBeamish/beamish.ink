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
 * Down a fixed number of screens rather than down the whole page. The whole
 * page was never a decision, and on a long template it is a blur: see
 * REACH_CAP.
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
  /**
   * How far down the page a take goes, in screens. Capped rather than
   * unlimited: see REACH_CAP.
   */
  screens?: number
  /** Called after the scroll is set, for a page that also drives its own items. */
  onFrame?: (t: number) => void
  /** Called on teardown, for whatever `onFrame` was driving. */
  onDestroy?: () => void
}

/* The library's one easing for arrivals, matching --ease-out-expo elsewhere. */
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

/*
 * How far down the page a take goes, in screens.
 *
 * This used to be the whole page, and that was never a decision: the scroll
 * covered whatever the page happened to be tall inside whatever the take
 * happened to last, so the velocity was an accident of the content. Measured
 * across the nineteen adapted templates it ran from 833 to 2963 px/s, with
 * thirteen of them over 1500. A reader scrolling to read moves at 300 to 600.
 * Past about 900 the type stops being type.
 *
 * Capping it in screens rather than pixels keeps the speed the same in every
 * ratio a take is recorded at: a 9:16 frame is a taller window, so it should
 * cover more page in the same time, and it does.
 *
 * 1.5 screens over a 12 second down-and-back peaks near 590 px/s, measured.
 * Predicted it was 410: the cubic in-out peaks at about 2.9 times its mean
 * rather than the 2 the arithmetic assumed, which is most of why this is
 * measured in the page now rather than worked out on paper. Change either
 * number and run `pnpm scrollspeed` before believing it still reads.
 */
const REACH_CAP = 1.5

export function mountScrollDriver(options: ScrollDriverOptions = {}): ScrollDriver {
  const params = new URLSearchParams(location.search)
  /*
   * 12, down from 14. The research band for an autoplay preview on a gallery
   * card is 8 to 15 seconds, and 14 sat at the top of it for no reason.
   */
  let span = Number(params.get('span')) || options.span || 12
  const screens = options.screens ?? REACH_CAP

  const driver: ScrollDriver = {
    renderAtTime(t) {
      /*
       * Re-read the height every frame rather than caching it. A page with
       * scroll-triggered reveals grows as it is scrolled, and a cached height
       * from the first frame stops the take short of the foot of the page.
       */
      const page = Math.max(document.body.scrollHeight - innerHeight, 0)
      /*
       * The shorter of the page and the cap. A page under the cap is covered
       * end to end and moves slower still, which is correct: a short page has
       * less to show and should not be hurried to fill the take.
       */
      const reach = Math.min(page, innerHeight * screens)
      const k = Math.min(Math.max(t / span, 0), 1)
      const there = k < 0.5 ? ease(k * 2) : ease((1 - k) * 2)
      /*
       * behavior: 'instant', which overrides the page's own CSS for this call
       * and leaves its anchor links alone.
       *
       * Most of these templates set `scroll-behavior: smooth` on the root, and
       * under that a plain scrollTo starts an animation instead of moving. The
       * position a frame is captured at then depends on how long the capture
       * took and on where the scroll was before it, which is exactly the thing
       * renderAtTime promises not to do: measured by driving the page and
       * reading scrollY back, fifteen of the nineteen templates moved 13px
       * over a take that should have covered 1458.
       */
      scrollTo({ top: reach * there, behavior: 'instant' })
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
