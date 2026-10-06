/*
 * Pane: Beamish
 * https://beamish.ink/components/glass-modal
 *
 * A sheet of glass over the page, on a native <dialog>.
 *
 * showModal() is doing the hard part. The browser promotes the dialog into the
 * top layer, makes the rest of the document inert, traps focus, closes on
 * Escape and hands focus back to whatever opened it. There is no focus-trap
 * library here and there should not be one: every line of that is behaviour the
 * platform now gets right, including for the screen readers a hand-rolled trap
 * tends to miss.
 *
 * What is left is the glass, the light dismiss, and keeping the page behind it
 * from scrolling, which showModal() does not do.
 */

'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { attachRefraction } from './glass'
import './styles.css'

export type GlassModalProps = {
  open: boolean
  /** Called when the dialog asks to close: Escape, the button, or the backdrop. */
  onClose: () => void
  /** Names the dialog. Rendered as the heading and used as its accessible name. */
  title: string
  children?: ReactNode
  /** Blur of the page showing through, in pixels. */
  blur?: number
  /** How milky the sheet is, 0 to 1. This is the contrast control. */
  tint?: number
  /** Bend the backdrop as well as blurring it. Chromium only: see the recipe. */
  refract?: boolean
  /** How far the rim bends what is behind it, in pixels. */
  refraction?: number
  /** Close when the page behind is clicked. */
  lightDismiss?: boolean
  closeLabel?: string
  className?: string
}

export function Pane({
  open,
  onClose,
  title,
  children,
  blur = 18,
  tint = 0.72,
  refract = true,
  refraction = 22,
  lightDismiss = true,
  closeLabel = 'Close',
  className
}: GlassModalProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  /*
   * Let the leaving animation run before the element goes display:none, which
   * is what close() does immediately. Nothing waits on this if the user has
   * asked for reduced motion, because the animation is then a hundredth of a
   * millisecond.
   */
  const dismiss = useCallback(() => {
    const el = dialog.current
    if (!el || !el.open) return
    el.classList.add('beamish-glass-modal--leaving')
    const done = () => {
      el.classList.remove('beamish-glass-modal--leaving')
      el.close()
    }
    el.addEventListener('animationend', done, { once: true })
    // A belt and braces timer: an interrupted animation never fires its end
    // event, and a dialog that will not shut is worse than one that shuts
    // abruptly.
    setTimeout(() => {
      if (el.classList.contains('beamish-glass-modal--leaving')) done()
    }, 400)
  }, [])

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) dismiss()
  }, [open, dismiss])

  /*
   * The page behind. showModal() makes the document inert but does not stop it
   * scrolling, so a wheel over the backdrop still moves whatever the dialog is
   * sitting on top of.
   */
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    const el = dialog.current
    if (!el || !open || !refract) return
    if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return
    return attachRefraction(el, refraction, 20)
  }, [open, refract, refraction])

  return (
    <dialog
      ref={dialog}
      className={['beamish-glass-modal', className].filter(Boolean).join(' ')}
      aria-labelledby="beamish-glass-modal-title"
      style={{ '--pane-blur': `${blur}px`, '--pane-tint': String(tint) } as React.CSSProperties}
      /* Escape fires cancel rather than close, and the default would skip the
         leaving animation and never tell the parent. */
      onCancel={event => {
        event.preventDefault()
        onClose()
      }}
      onClick={event => {
        if (!lightDismiss) return
        // The dialog's own box is the sheet; anything outside it inside the
        // element is the backdrop, which is where the click lands.
        const box = event.currentTarget.getBoundingClientRect()
        const outside =
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        if (outside) onClose()
      }}
    >
      <div className="beamish-glass-modal__head">
        <h2 className="beamish-glass-modal__title" id="beamish-glass-modal-title">
          {title}
        </h2>
        <button
          type="button"
          className="beamish-glass-modal__close"
          onClick={onClose}
          aria-label={closeLabel}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div className="beamish-glass-modal__body">{children}</div>
    </dialog>
  )
}

export default Pane
