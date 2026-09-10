/*
 * Contents: Beamish
 * https://beamish.ink/components/contents
 *
 * A full-viewport index. The overlay is a real <dialog> opened with showModal(),
 * which is a decision worth stating plainly: the browser then gives us the focus
 * trap, Escape, the top layer, inerting the rest of the page, and returning focus
 * to the trigger on close. Every one of those is a thing hand-rolled menus get
 * subtly wrong, and none of them is our code.
 *
 * What is left is layout, type and a staggered reveal.
 */

'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './styles.css'

export type ContentsItem = {
  label: string
  href: string
  /** Small trailing note: a category, a count, a date. */
  meta?: string
}

export type ContentsSection = {
  title: string
  items: ContentsItem[]
}

export type ContentsProps = {
  sections: ContentsSection[]
  /** Trigger text and the dialog's accessible name. */
  label?: string
  /** Text on the close control. */
  closeLabel?: string
  /** Rendered under the heading, inside the overlay. */
  children?: ReactNode
  /** Controlled mode. Leave undefined and the component manages its own state. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

export function Contents({
  sections,
  label = 'Index',
  closeLabel = 'Close',
  children,
  open,
  onOpenChange,
  className
}: ContentsProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const titleId = useId()

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  // showModal() and close() are the source of truth for the element; this keeps
  // the element in step with React rather than the other way round.
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (isOpen && !element.open) element.showModal()
    if (!isOpen && element.open) element.close()
  }, [isOpen])

  /*
   * showModal() inerts the page but does not stop it scrolling behind the
   * overlay, which on a long index is disorienting. Locking the root element
   * rather than the body avoids fighting anything that positions off body.
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

  let index = 0

  return (
    <>
      <button
        type="button"
        className={['beamish-contents__trigger', className].filter(Boolean).join(' ')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      <dialog
        ref={dialog}
        className="beamish-contents"
        aria-labelledby={titleId}
        // Escape fires `cancel` before `close`; both are handled so state cannot
        // drift out of step with the element when the browser closes it for us.
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        // Clicking the backdrop lands on the dialog element itself, never on its
        // children, which is the cheapest reliable outside-click test there is.
        onClick={event => {
          if (event.target === dialog.current) setOpen(false)
        }}
      >
        <div className="beamish-contents__inner">
          <div className="beamish-contents__head">
            <h2 className="beamish-contents__title" id={titleId}>
              {label}
            </h2>
            <button
              type="button"
              className="beamish-contents__close"
              onClick={() => setOpen(false)}
            >
              {closeLabel}
            </button>
          </div>

          {children ? <div className="beamish-contents__lede">{children}</div> : null}

          <nav className="beamish-contents__nav" aria-label={label}>
            {sections.map(section => (
              <section className="beamish-contents__section" key={section.title}>
                <h3 className="beamish-contents__heading">{section.title}</h3>
                <ul className="beamish-contents__list">
                  {section.items.map(item => (
                    <li
                      className="beamish-contents__item"
                      key={item.href}
                      // Drives the reveal stagger. Counted across every section
                      // so the cascade reads as one movement down the page.
                      style={{ ['--beamish-i' as string]: index++ }}
                    >
                      <a className="beamish-contents__link" href={item.href}>
                        <span className="beamish-contents__label">{item.label}</span>
                        {item.meta ? (
                          <span className="beamish-contents__meta">{item.meta}</span>
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        </div>
      </dialog>
    </>
  )
}

export default Contents
