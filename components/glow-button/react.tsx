/*
 * Ember: Beamish
 * https://beamish.ink/components/glow-button
 *
 * The action pill: mono, uppercase, 100px radius, with a slow band of light
 * crossing it on hover. Renders a <button> by default and an <a> when given an
 * href, because a thing that navigates should be a link and a thing that acts
 * should be a button. The difference matters to anyone using a keyboard or
 * a screen reader.
 */

'use client'

import { forwardRef } from 'react'
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ForwardedRef,
  ReactNode
} from 'react'
import './styles.css'

export type EmberTone = 'solid' | 'quiet'

type Common = {
  children: ReactNode
  /** `solid` is the accent pill. `quiet` is the outlined secondary. */
  tone?: EmberTone
  className?: string
}

type ButtonProps = Common &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & { href?: undefined }

type AnchorProps = Common &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className'> & { href: string }

export type GlowButtonProps = ButtonProps | AnchorProps

const classes = (tone: EmberTone, className?: string) =>
  ['beamish-glow-button', `beamish-glow-button--${tone}`, className].filter(Boolean).join(' ')

export const Ember = forwardRef<HTMLButtonElement | HTMLAnchorElement, GlowButtonProps>(
  function Ember({ children, tone = 'solid', className, ...rest }, ref) {
    if ('href' in rest && rest.href !== undefined) {
      const anchor = rest as AnchorHTMLAttributes<HTMLAnchorElement>
      return (
        <a
          {...anchor}
          ref={ref as ForwardedRef<HTMLAnchorElement>}
          className={classes(tone, className)}
        >
          {children}
        </a>
      )
    }

    const button = rest as ButtonHTMLAttributes<HTMLButtonElement>
    return (
      <button
        // An explicit type, because a <button> inside a form defaults to submit
        // and that is never what anyone wanted from a component like this.
        type={button.type ?? 'button'}
        {...button}
        ref={ref as ForwardedRef<HTMLButtonElement>}
        className={classes(tone, className)}
      >
        {children}
      </button>
    )
  }
)

export default Ember
