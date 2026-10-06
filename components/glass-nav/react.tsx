/*
 * Crossbar: Beamish
 * https://beamish.ink/components/glass-nav
 *
 * A bar of glass across the top of a page. Nearly clear over a hero, settling
 * into frosted once the page has scrolled under it, because a bar that is
 * legible over a photograph and a bar that is legible over body copy are not
 * the same bar.
 *
 * Real markup underneath: a nav, a list, and links. The current page is marked
 * with aria-current, which is also what the styling keys off, so what is
 * announced and what is underlined cannot drift apart.
 */

'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { watchSettle, attachRefraction } from './glass'
import './styles.css'

export type GlassNavItem = {
  label: string
  href: string
  /** Marks this one as the page you are on. */
  current?: boolean
}

export type GlassNavProps = {
  items: GlassNavItem[]
  /** Shown at the start of the bar. A string becomes a link to `brandHref`. */
  brand?: ReactNode
  brandHref?: string
  /** Pixels of scroll over which the glass settles from clear to frosted. */
  settleOver?: number
  /** Blur at full settle, in pixels. */
  blur?: number
  /** How milky it goes, 0 to 1. */
  tint?: number
  /**
   * Bend the backdrop as well as blurring it. Chromium only: see the recipe.
   * Everywhere else you get the blur and the edge, which is most of it.
   */
  refract?: boolean
  /** How far the rim bends what is behind it, in pixels. */
  refraction?: number
  /** Accessible name for the landmark, if the page has more than one nav. */
  label?: string
  className?: string
  children?: ReactNode
}

export function Crossbar({
  items,
  brand,
  brandHref = '/',
  settleOver = 120,
  blur = 14,
  tint = 0.55,
  refract = true,
  refraction = 18,
  label = 'Main',
  className,
  children
}: GlassNavProps) {
  const host = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!host.current) return
    return watchSettle(host.current, settleOver)
  }, [settleOver])

  useEffect(() => {
    if (!host.current || !refract) return
    /*
     * Not under reduced transparency. The whole point of that setting is to
     * stop the backdrop coming through, and bending a backdrop you are about
     * to make opaque is work nobody asked for.
     */
    if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return
    return attachRefraction(host.current, refraction, 100)
  }, [refract, refraction])

  return (
    <nav
      ref={host}
      aria-label={label}
      className={['beamish-glass-nav', className].filter(Boolean).join(' ')}
      style={
        {
          '--crossbar-blur': `${blur}px`,
          '--crossbar-tint': String(tint)
        } as React.CSSProperties
      }
    >
      {brand ? (
        <a className="beamish-glass-nav__brand" href={brandHref}>
          {brand}
        </a>
      ) : null}

      <ul className="beamish-glass-nav__list">
        {items.map(item => (
          <li key={item.href}>
            <a
              className="beamish-glass-nav__link"
              href={item.href}
              aria-current={item.current ? 'page' : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>

      {children}
    </nav>
  )
}

export default Crossbar
