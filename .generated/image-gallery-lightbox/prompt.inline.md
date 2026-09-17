You are adding **ImageGalleryLightbox** from Beamish to this project.

> A contact sheet that opens into a lightbox you can arrow, swipe or play through. Surfaces · component · MIT.
> https://beamish.ink/components/image-gallery-lightbox

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `react@>=18`
- Uses <dialog>.showModal(), so the focus trap, Escape, top layer, inerting and focus restoration are the browser's
- The fade uses transition-behavior: allow-discrete and @starting-style; where those are unsupported the overlay appears instantly, which is a graceful loss
- No carousel library, no focus-trap library, no portal, no scroll-lock package
- Swipe is Pointer Events, and is ignored for mouse input, where a small drag is the start of a click rather than a gesture
- React 18+ or Vue 3. This one is a component, not an imperative effect.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/components/image-gallery-lightbox/react.tsx`**

```tsx
/*
 * Plate: Beamish
 * https://beamish.ink/components/image-gallery-lightbox
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

export type ImageGalleryLightboxItem = {
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

export type ImageGalleryLightboxProps = {
  plates: ImageGalleryLightboxItem[]
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
}: ImageGalleryLightboxProps) {
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
        className={['beamish-image-gallery-lightbox__sheet', className].filter(Boolean).join(' ')}
        aria-label={label}
        style={{ ['--plate-columns' as string]: columns }}
      >
        {plates.map((plate, i) => (
          <li
            className="beamish-image-gallery-lightbox__cell"
            key={plate.src}
          >
            <figure className="beamish-image-gallery-lightbox__figure">
              <button
                type="button"
                className="beamish-image-gallery-lightbox__trigger"
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
                  className="beamish-image-gallery-lightbox__thumb"
                  src={plate.src}
                  alt={plate.alt}
                  width={plate.width}
                  height={plate.height}
                  // The first row is usually above the fold, and lazy-loading
                  // something already in view just delays it.
                  loading={i < columns ? 'eager' : 'lazy'}
                  decoding="async"
                />
                <span className="beamish-image-gallery-lightbox__number" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </button>
              {plate.caption ? (
                <figcaption className="beamish-image-gallery-lightbox__caption">{plate.caption}</figcaption>
              ) : null}
            </figure>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        className="beamish-image-gallery-lightbox"
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
        <h2 className="beamish-image-gallery-lightbox__sr" id={titleId}>
          {label}
        </h2>

        <div className="beamish-image-gallery-lightbox__inner">
          <div
            className="beamish-image-gallery-lightbox__stage"
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
              <figure className="beamish-image-gallery-lightbox__open">
                <img
                  // Keyed by src so React swaps the element rather than
                  // reusing it, which is what lets the enter transition run on
                  // every move instead of only the first.
                  key={current.full ?? current.src}
                  className="beamish-image-gallery-lightbox__image"
                  src={current.full ?? current.src}
                  alt={current.alt}
                  width={current.width}
                  height={current.height}
                  decoding="async"
                />
                <figcaption className="beamish-image-gallery-lightbox__bar">
                  <span className="beamish-image-gallery-lightbox__count">
                    <span aria-hidden="true">
                      {String((index as number) + 1).padStart(2, '0')} /{' '}
                      {String(plates.length).padStart(2, '0')}
                    </span>
                    <span className="beamish-image-gallery-lightbox__sr">
                      Plate {(index as number) + 1} of {plates.length}
                    </span>
                  </span>
                  {current.caption ? (
                    <span className="beamish-image-gallery-lightbox__text" id={captionId}>
                      {current.caption}
                    </span>
                  ) : null}
                </figcaption>
              </figure>
            ) : null}
          </div>

          <div className="beamish-image-gallery-lightbox__controls">
            <button
              type="button"
              className="beamish-image-gallery-lightbox__nav"
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
              className="beamish-image-gallery-lightbox__close"
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
                className="beamish-image-gallery-lightbox__play"
                aria-pressed={playing}
                onClick={() => setPlaying(value => !value)}
              >
                {playing ? pauseLabel : playLabel}
              </button>
            ) : null}

            <button
              type="button"
              className="beamish-image-gallery-lightbox__nav"
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
```

**`src/beamish/components/image-gallery-lightbox/styles.css`**

```text
/*
 * Plate: Beamish
 *
 * Every custom property has a fallback, so the component looks right dropped
 * into a project that has never heard of Beamish tokens. If the tokens are
 * present it inherits them instead.
 *
 * The overlay is paper, not black. A dark lightbox is the convention, and it is
 * the wrong one here: it turns every warm image cold and it makes the caption
 * the brightest thing on screen. A plate in a book sits on the page.
 */

.beamish-image-gallery-lightbox,
.beamish-image-gallery-lightbox__sheet {
  --plate-paper: var(--background-deep, 251, 250, 244);
  --plate-ink: var(--label-1, #000);
  --plate-ink-2: var(--label-2, rgba(54, 54, 48, 0.78));
  --plate-ink-3: var(--label-3, rgba(54, 54, 48, 0.7));
  --plate-rule: var(--label-4, rgba(54, 54, 48, 0.16));
  --plate-line: var(--control-line, rgba(54, 54, 48, 0.7));
  --plate-accent: var(--accent, #c44400);
  --plate-ease: var(--ease-66, cubic-bezier(0.66, 0, 0.01, 1));
  --plate-expo: var(--ease-out-expo, cubic-bezier(0.22, 1, 0.36, 1));
  --plate-mono: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.beamish-image-gallery-lightbox__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* --- the sheet ----------------------------------------------------------- */

.beamish-image-gallery-lightbox__sheet {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  /*
   * auto-fit with a floor, rather than a fixed count with breakpoints. The
   * sheet then fits its container instead of fitting the viewport, which
   * matters because it is as likely to sit in a column as across a page.
   */
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(14rem, 100%), calc(100% / var(--plate-columns, 3) - 1rem))
  );
  gap: 1.5rem 1rem;
}

.beamish-image-gallery-lightbox__figure {
  margin: 0;
  display: grid;
  gap: 0.6rem;
}

.beamish-image-gallery-lightbox__trigger {
  appearance: none;
  padding: 0;
  border: 1px solid var(--plate-rule);
  background: none;
  cursor: zoom-in;
  display: block;
  position: relative;
  overflow: hidden;
  /*
   * Square, for every cell, whatever the file's proportions. Letting portrait
   * plates take a taller box is the obvious move and it is wrong: the rows go
   * ragged, and a landscape plate ends up floating above a hole. A contact
   * sheet has uniform frames for exactly this reason, and square is the crop
   * that treats both orientations equally badly.
   */
  aspect-ratio: 1;
}

.beamish-image-gallery-lightbox__thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.7s var(--plate-expo), filter 0.5s var(--plate-ease);
}

.beamish-image-gallery-lightbox__trigger:hover .beamish-image-gallery-lightbox__thumb {
  transform: scale(1.03);
}

.beamish-image-gallery-lightbox__trigger:focus-visible {
  outline: 2px solid var(--plate-ink);
  outline-offset: 3px;
}

/*
 * The plate number, the way it is struck into the margin of a contact sheet.
 * Sits on the image, so it carries its own scrim rather than trusting the
 * picture to be light in that corner.
 */
.beamish-image-gallery-lightbox__number {
  position: absolute;
  left: 0;
  bottom: 0;
  padding: 0.35rem 0.6rem;
  font-family: var(--plate-mono);
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  color: rgb(var(--plate-paper));
  background: color-mix(in srgb, #201f1a 72%, transparent);
  backdrop-filter: blur(4px);
}

.beamish-image-gallery-lightbox__caption {
  font-family: var(--plate-mono);
  font-size: 0.72rem;
  line-height: 1.5;
  letter-spacing: 0.02em;
  color: var(--plate-ink-3);
}

/* --- the overlay --------------------------------------------------------- */

/*
 * A <dialog> arrives with a pile of user-agent styles built for a small centred
 * box. All of them have to go before it can be a full-viewport surface.
 */
.beamish-image-gallery-lightbox {
  width: 100vw;
  max-width: 100vw;
  height: 100dvh;
  max-height: 100dvh;
  margin: 0;
  padding: 0;
  border: 0;
  background: rgb(var(--plate-paper));
  color: var(--plate-ink);
  overflow: hidden;
}

.beamish-image-gallery-lightbox::backdrop {
  /* Warm, not neutral. A grey scrim over paper reads as a dirty screen. */
  background: color-mix(in srgb, #201f1a 58%, transparent);
}

/*
 * allow-discrete is what lets a property that cannot tween, like `display`,
 * still take part in a transition. Where it is unsupported the overlay appears
 * instantly, which is a graceful loss rather than a broken one.
 */
.beamish-image-gallery-lightbox,
.beamish-image-gallery-lightbox::backdrop {
  opacity: 0;
  transition: opacity 0.4s var(--plate-ease), display 0.4s allow-discrete,
    overlay 0.4s allow-discrete;
}

.beamish-image-gallery-lightbox[open],
.beamish-image-gallery-lightbox[open]::backdrop {
  opacity: 1;
}

@starting-style {
  .beamish-image-gallery-lightbox[open],
  .beamish-image-gallery-lightbox[open]::backdrop {
    opacity: 0;
  }
}

.beamish-image-gallery-lightbox__inner {
  height: 100%;
  display: grid;
  /* The stage takes what is left; the controls keep their own height. */
  grid-template-rows: 1fr auto;
  /*
   * The margin is the point. A plate in a book has paper around it, and giving
   * the image the whole viewport is what makes a lightbox feel like a viewer
   * rather than a page.
   */
  padding: clamp(1rem, 4vw, 3rem);
  box-sizing: border-box;
  gap: 1rem;
}

.beamish-image-gallery-lightbox__stage {
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 1rem;
  /*
   * min-height: 0 is the whole trick. A grid item defaults to min-height: auto,
   * so a 1fr track will happily grow past its container to fit its content, and
   * a tall plate then pushes the controls off the bottom of the screen.
   */
  min-height: 0;
  overflow: hidden;
  touch-action: pan-y;
}

/*
 * display: contents, so the image and its caption become rows of the stage.
 * The figure has to be here for the semantics, and as a real box it breaks the
 * percentage-height chain that max-height on the image depends on.
 */
.beamish-image-gallery-lightbox__open {
  display: contents;
  margin: 0;
}

.beamish-image-gallery-lightbox__image {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  min-height: 0;
  place-self: center;
  object-fit: contain;
  display: block;
  border: 1px solid var(--plate-rule);
  animation: beamish-image-gallery-lightbox-in 0.5s var(--plate-expo) both;
}

/* Enters from the side you asked for. data-direction is set by the component. */
@keyframes beamish-image-gallery-lightbox-in {
  from {
    opacity: 0;
    transform: translateX(calc(var(--plate-from, 1) * 2.5rem));
  }
}

.beamish-image-gallery-lightbox[data-direction='-1'] {
  --plate-from: -1;
}

.beamish-image-gallery-lightbox__bar {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  font-family: var(--plate-mono);
  font-size: 0.75rem;
  line-height: 1.5;
  text-align: center;
}

.beamish-image-gallery-lightbox__count {
  letter-spacing: 0.14em;
  color: var(--plate-accent);
}

.beamish-image-gallery-lightbox__text {
  color: var(--plate-ink-2);
  max-width: 60ch;
}

/* --- controls ------------------------------------------------------------ */

.beamish-image-gallery-lightbox__controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  border-top: 1px solid var(--plate-rule);
  padding-top: 1rem;
}

.beamish-image-gallery-lightbox__nav,
.beamish-image-gallery-lightbox__close,
.beamish-image-gallery-lightbox__play {
  appearance: none;
  background: none;
  border: 1px solid var(--plate-line);
  border-radius: 100px;
  font-family: var(--plate-mono);
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: inherit;
  cursor: pointer;
  transition: background-color 0.35s var(--plate-ease);
}

.beamish-image-gallery-lightbox__close,
.beamish-image-gallery-lightbox__play {
  padding: 0.6rem 1.15rem;
}

.beamish-image-gallery-lightbox__nav {
  /*
   * 44px square. Pointer target sizing is a 2.2 addition and these are the
   * controls most likely to be used repeatedly, on a phone, one-handed.
   */
  width: 2.75rem;
  height: 2.75rem;
  display: grid;
  place-items: center;
  font-size: 0.95rem;
}

.beamish-image-gallery-lightbox__nav:hover,
.beamish-image-gallery-lightbox__close:hover,
.beamish-image-gallery-lightbox__play:hover {
  background-color: color-mix(in srgb, currentColor 8%, transparent);
}

.beamish-image-gallery-lightbox__nav:focus-visible,
.beamish-image-gallery-lightbox__close:focus-visible,
.beamish-image-gallery-lightbox__play:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}

.beamish-image-gallery-lightbox__play[aria-pressed='true'] {
  border-color: var(--plate-accent);
  color: var(--plate-accent);
}

/* --- reduced motion ------------------------------------------------------ */

/*
 * The plate still changes, because that is the whole function of the control.
 * What goes is the travel: it appears rather than sliding in.
 */
@media (prefers-reduced-motion: reduce) {
  .beamish-image-gallery-lightbox__thumb,
  .beamish-image-gallery-lightbox,
  .beamish-image-gallery-lightbox::backdrop {
    transition-duration: 0.01ms;
  }

  .beamish-image-gallery-lightbox__trigger:hover .beamish-image-gallery-lightbox__thumb {
    transform: none;
  }

  .beamish-image-gallery-lightbox__image {
    animation-duration: 0.01ms;
  }
}
```

## 2. What it is

Plate is a contact sheet that opens into a lightbox. A grid of numbered plates,
and an overlay you move through with the arrow keys, a swipe, the controls, or an
autoplay you have to start yourself.

The overlay is a real `<dialog>` opened with `showModal()`. That is the decision
the rest of it hangs off. The browser then gives you the focus trap, Escape, the
top layer, inerting the page behind, and returning focus to where you came from.
Every one of those is something hand-rolled galleries get subtly wrong, and none
of it is code in this repo or a package in yours. There is no carousel library
here, no focus-trap library, no portal and no scroll-lock.

What is left is the part worth building. Arrow keys and Home and End. A swipe
that is ignored for mouse input, where a small drag is the start of a click
rather than a gesture. Neighbour preload, so the next plate is already decoded
before you ask for it. And a counter, because a gallery with no sense of how far
through you are is a gallery you leave.

The overlay is paper rather than black. A dark lightbox is the convention and it
is the wrong one here: it turns every warm image cold, and it makes the caption
the brightest thing on the screen. A plate in a book sits on the page, with a
margin, which is what this does.

## 3. Wire it in

**React.** The plates are data. Nothing else is required.

```tsx
import { Plate } from '@/beamish/components/image-gallery-lightbox/react'

export function Gallery() {
  return (
    <Plate
      label="Selected work"
      columns={3}
      plates={[
        {
          src: '/work/thumb-01.webp',
          full: '/work/full-01.webp',
          alt: 'The homepage at desktop width, dark type on cream',
          width: 1600,
          height: 900,
          caption: 'Homepage'
        }
      ]}
    />
  )
}
```

`width` and `height` are the intrinsic pixel size of the file and they are not
optional. They are how the sheet reserves its cells before anything
downloads, and how the overlay sizes the plate it is fitting. Get them wrong and
the grid moves under the reader as it loads.

`full` is for when the sheet shows a smaller file than the overlay should. Leave
it out and both use `src`.

**Vue.** Same props, and `open` works with `v-model`.

```vue
<script setup lang="ts">
import { Plate } from '@/beamish/components/image-gallery-lightbox/vue'
import type { ImageGalleryLightboxItem } from '@/beamish/components/image-gallery-lightbox/vue'

const plates: ImageGalleryLightboxItem[] = [
  {
    src: '/work/thumb-01.webp',
    alt: 'The homepage at desktop width, dark type on cream',
    width: 1600,
    height: 900,
    caption: 'Homepage'
  }
]
</script>

<template>
  <Plate label="Selected work" :plates="plates" :columns="3" />
</template>
```

**Astro.** It is a React or Vue island like any other. The sheet needs no
JavaScript to look right, so hydrate it late.

```astro
---
import { Plate } from '@/beamish/components/image-gallery-lightbox/react'
import plates from '../data/plates.json'
---

<Plate client:visible label="Selected work" plates={plates} />
```

**Deep-linking a plate.** Pass `open` and handle `onOpenChange` yourself. The
index is the position in the array, and `null` is closed.

```tsx
const [open, setOpen] = useState<number | null>(null)

<Plate plates={plates} open={open} onOpenChange={setOpen} />
```

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `label` | string | `Plates` | any value | Accessible name for the sheet and for the overlay. Keep it a noun. It is read out as the name of the whole gallery. |
| `closeLabel` | string | `Close` | any value | Text on the close control. There is a visible one as well as Escape, because Escape is not discoverable and on a touch device it does not exist. |
| `columns` | number | `3` | 1 to 6 | Columns at the widest the container gets. The sheet steps down on its own below that, because it fits its container rather than the viewport. |
| `autoplay` | number | `0` | 0 to 12 | Seconds between plates once the overlay is open. Zero is off, and off is the default: a gallery that starts moving on its own is rarely what the reader wanted. Any value above zero renders a pause control, and reduced motion turns it off entirely. |
| `playLabel` | string | `Play` | any value | Text on the autoplay control when it is stopped. |
| `pauseLabel` | string | `Pause` | any value | Text on the autoplay control when it is running. |

## 5. Cleanup and SSR

There is nothing to destroy. The interval is cleared on unmount and when the
overlay closes, the `matchMedia` listener is removed on unmount, and the scroll
lock is released even if the component unmounts while open.

`window.matchMedia` is touched in an effect rather than during render, so the
component server-renders. Next.js App Router still needs `'use client'` at the
top of the file that uses it, which the React build already carries.

## 6. Pausing and reduced motion

Handled with a live `matchMedia` listener rather than a value read once at mount,
so changing the setting with the page open does the right thing.

What goes is the travel. The plate still changes, because that is the entire
function of the control and removing it would break the component rather than
calm it. It appears instead of sliding in, and the thumbnail stops growing under
the cursor.

## 7. The three mistakes most likely to be made here

1. **Leaving `width` and `height` off the plates.** The sheet then has no shape
   to reserve, so every cell is zero-height until its file arrives and the grid
   jumps as they land. They are the intrinsic size of the image file, not the
   size you want it displayed at.

2. **Writing the caption into `alt`.** They do different jobs. `alt` is what the
   picture shows, for someone who cannot see it. The caption is what you want to
   say about it, and it is read by everyone. Putting the caption in both means
   a screen reader hears it twice.

3. **Turning `autoplay` on for a portfolio.** Someone looking at your work is
   reading it, not watching it, and moving the plate on while they are still on
   it is the fastest way to lose them. It is there for a display screen or a
   hero, which is a different job.

4. **Pointing `src` at the full-size file.** Six 4000px photographs in a grid of
   300px cells is tens of megabytes to render thumbnails. Use `src` for the
   thumbnail and `full` for the one the overlay shows.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
