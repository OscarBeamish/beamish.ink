/*
 * Plate: Beamish
 * https://beamish.ink/components/plate
 *
 * A contact sheet that opens into a lightbox.
 *
 * The overlay is a real <dialog> opened with showModal(), so the focus trap,
 * Escape, the top layer, inerting the page behind and returning focus to the
 * plate you came from are all the browser's. None of it is our code, and none
 * of it is a dependency.
 *
 * The rest is the part worth building: arrow keys, a swipe, neighbour preload
 * so the next plate is already decoded, and an optional autoplay that ships
 * with a pause control because WCAG 2.2.2 is Level A the moment a thing
 * advances on its own.
 */

'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import './styles.css'

export type PlateItem = {
  src: string
  /**
   * What the picture shows. An empty string is a legitimate answer for images
   * that are purely decorative, but it has to be a deliberate one.
   */
  alt: string
  /**
   * Intrinsic pixel size. Used to reserve the cell before the file arrives,
   * which is what stops the sheet reflowing as it loads, and to size the plate
   * correctly in the overlay, where it is fitted rather than cropped.
   */
  width: number
  height: number
  /** Printed under the plate on the sheet, and beside the counter when open. */
  caption?: string
  /** Full-size file, if the sheet is showing a smaller one. */
  full?: string
}

export type PlateProps = {
  plates: PlateItem[]
  /** Accessible name for the sheet and for the overlay. */
  label?: string
  closeLabel?: string
  /** Columns at the widest breakpoint. The sheet steps down on its own below that. */
  columns?: number
  /**
   * Seconds between plates when open. Zero is off, which is the default: a
   * gallery that starts moving on its own is rarely what the reader wanted.
   */
  autoplay?: number
  playLabel?: string
  pauseLabel?: string
  /** Controlled mode. The index of the open plate, or null for closed. */
  open?: number | null
  onOpenChange?: (index: number | null) => void
  className?: string
}

/*
 * Live, not read once. Someone can change the setting with the page open, and a
 * value captured at mount would then be wrong for the rest of the session.
 */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}

export function Plate({
  plates,
  label = 'Plates',
  closeLabel = 'Close',
  columns = 3,
  autoplay = 0,
  playLabel = 'Play',
  pauseLabel = 'Pause',
  open,
  onOpenChange,
  className
}: PlateProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const triggers = useRef<Array<HTMLButtonElement | null>>([])
  const [internalOpen, setInternalOpen] = useState<number | null>(null)
  const isControlled = open !== undefined
  const index = isControlled ? open : internalOpen
  const isOpen = index !== null && index !== undefined
  const titleId = useId()
  const captionId = useId()
  const reduced = useReducedMotion()

  const [playing, setPlaying] = useState(false)
  // Which way the last move went, so the incoming plate enters from the side
  // you asked for rather than always from the same one.
  const [direction, setDirection] = useState(1)

  const setOpen = useCallback(
    (next: number | null) => {
      if (!isControlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  const go = useCallback(
    (step: number) => {
      if (index === null || index === undefined) return
      setDirection(step < 0 ? -1 : 1)
      // Wraps. A gallery with a hard stop at each end makes you check whether
      // you have reached the end or whether the control is broken.
      setOpen((index + step + plates.length) % plates.length)
    },
    [index, plates.length, setOpen]
  )

  // showModal() and close() own the element; this keeps the element in step
  // with React rather than the other way round.
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (isOpen && !element.open) element.showModal()
    if (!isOpen && element.open) element.close()
  }, [isOpen])

  /*
   * showModal() inerts the page but does not stop it scrolling behind the
   * overlay. Locking the root rather than the body avoids fighting anything
   * that positions itself off body.
   */
  useEffect(() => {
    if (!isOpen) return
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = previous
    }
  }, [isOpen])

  /*
   * Decode the neighbours while the reader is looking at this one. Without it
   * every arrow press is a visible blank, because the file only starts
   * downloading at the moment it is needed.
   */
  useEffect(() => {
    if (index === null || index === undefined) return
    for (const step of [1, -1]) {
      const neighbour = plates[(index + step + plates.length) % plates.length]
      if (!neighbour) continue
      const image = new Image()
      image.src = neighbour.full ?? neighbour.src
    }
  }, [index, plates])

  // Autoplay. Off under reduced motion, and off while the tab is in the
  // background, where it would otherwise burn through the whole set unseen.
  useEffect(() => {
    if (!isOpen || !playing || autoplay <= 0 || reduced) return
    const id = window.setInterval(() => {
      if (!document.hidden) go(1)
    }, autoplay * 1000)
    return () => window.clearInterval(id)
  }, [isOpen, playing, autoplay, reduced, go])

  // Opening starts it; closing stops it, so it never resumes on its own next
  // time the overlay opens.
  useEffect(() => {
    if (!isOpen) setPlaying(false)
  }, [isOpen])

  /*
   * Return focus to the plate that was opened. The browser restores focus to
   * whatever was focused before showModal(), which is right when you opened it
   * from the sheet, but wrong once you have arrowed to a different plate: you
   * want to come back to where you are, not where you started.
   */
  const lastIndex = useRef<number | null>(null)
  useEffect(() => {
    if (isOpen) {
      lastIndex.current = index ?? null
      return
    }
    const target = lastIndex.current === null ? null : triggers.current[lastIndex.current]
    target?.focus()
  }, [isOpen, index])

  const swipeStart = useRef<{ x: number; y: number } | null>(null)

  const current = isOpen ? plates[index as number] : undefined

  return (
    <>
      <ul
        className={['beamish-plate__sheet', className].filter(Boolean).join(' ')}
        aria-label={label}
        style={{ ['--plate-columns' as string]: columns }}
      >
        {plates.map((plate, i) => (
          <li
            className="beamish-plate__cell"
            key={plate.src}
          >
            <figure className="beamish-plate__figure">
              <button
                type="button"
                className="beamish-plate__trigger"
                aria-haspopup="dialog"
                ref={element => {
                  triggers.current[i] = element
                }}
                onClick={() => {
                  setDirection(1)
                  setOpen(i)
                }}
              >
                <img
                  className="beamish-plate__thumb"
                  src={plate.src}
                  alt={plate.alt}
                  width={plate.width}
                  height={plate.height}
                  // The first row is usually above the fold, and lazy-loading
                  // something already in view just delays it.
                  loading={i < columns ? 'eager' : 'lazy'}
                  decoding="async"
                />
                <span className="beamish-plate__number" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </button>
              {plate.caption ? (
                <figcaption className="beamish-plate__caption">{plate.caption}</figcaption>
              ) : null}
            </figure>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        className="beamish-plate"
        aria-labelledby={titleId}
        aria-describedby={current?.caption ? captionId : undefined}
        data-direction={direction}
        onCancel={() => setOpen(null)}
        onClose={() => setOpen(null)}
        // A backdrop click lands on the dialog element itself and never on its
        // children, which is the cheapest reliable outside-click test there is.
        onClick={event => {
          if (event.target === dialog.current) setOpen(null)
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            go(1)
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            go(-1)
          }
          if (event.key === 'Home') {
            event.preventDefault()
            setDirection(-1)
            setOpen(0)
          }
          if (event.key === 'End') {
            event.preventDefault()
            setDirection(1)
            setOpen(plates.length - 1)
          }
        }}
      >
        <h2 className="beamish-plate__sr" id={titleId}>
          {label}
        </h2>

        <div className="beamish-plate__inner">
          <div
            className="beamish-plate__stage"
            /*
             * Touch only. A pointerdown on a mouse is the start of a click, and
             * treating a small drag as a swipe there makes the overlay feel
             * like it is jumping about under the cursor.
             */
            onPointerDown={event => {
              if (event.pointerType === 'mouse') return
              swipeStart.current = { x: event.clientX, y: event.clientY }
            }}
            onPointerUp={event => {
              const start = swipeStart.current
              swipeStart.current = null
              if (!start) return
              const dx = event.clientX - start.x
              const dy = event.clientY - start.y
              // Horizontal intent, not a scroll that happens to drift.
              if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return
              go(dx < 0 ? 1 : -1)
            }}
          >
            {current ? (
              <figure className="beamish-plate__open">
                <img
                  // Keyed by src so React swaps the element rather than
                  // reusing it, which is what lets the enter transition run on
                  // every move instead of only the first.
                  key={current.full ?? current.src}
                  className="beamish-plate__image"
                  src={current.full ?? current.src}
                  alt={current.alt}
                  width={current.width}
                  height={current.height}
                  decoding="async"
                />
                <figcaption className="beamish-plate__bar">
                  <span className="beamish-plate__count">
                    <span aria-hidden="true">
                      {String((index as number) + 1).padStart(2, '0')} /{' '}
                      {String(plates.length).padStart(2, '0')}
                    </span>
                    <span className="beamish-plate__sr">
                      Plate {(index as number) + 1} of {plates.length}
                    </span>
                  </span>
                  {current.caption ? (
                    <span className="beamish-plate__text" id={captionId}>
                      {current.caption}
                    </span>
                  ) : null}
                </figcaption>
              </figure>
            ) : null}
          </div>

          <div className="beamish-plate__controls">
            <button
              type="button"
              className="beamish-plate__nav"
              onClick={() => go(-1)}
              aria-label="Previous plate"
            >
              <span aria-hidden="true">&larr;</span>
            </button>

            {/*
             * Visible, not Escape-only. Escape is not discoverable, and on a
             * touch device it does not exist at all.
             */}
            <button
              type="button"
              className="beamish-plate__close"
              onClick={() => setOpen(null)}
            >
              {closeLabel}
            </button>

            {/*
             * WCAG 2.2.2 is Level A: anything that moves for more than five
             * seconds needs a pause. Autoplay off means there is nothing to
             * pause, so the control is not rendered at all rather than sitting
             * there doing nothing.
             */}
            {autoplay > 0 && !reduced ? (
              <button
                type="button"
                className="beamish-plate__play"
                aria-pressed={playing}
                onClick={() => setPlaying(value => !value)}
              >
                {playing ? pauseLabel : playLabel}
              </button>
            ) : null}

            <button
              type="button"
              className="beamish-plate__nav"
              onClick={() => go(1)}
              aria-label="Next plate"
            >
              <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}

export default Plate
