/*
 * React adapter for Tilt. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createTilt, type TiltOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type TiltProps = Partial<TiltOptions> & {
  children: ReactNode
  className?: string
  /** The element to render. It is the element that leans. */
  as?: 'div' | 'article' | 'section' | 'li' | 'a'
  href?: string
  /** Set false to mount without starting, behind your own trigger. */
  autoStart?: boolean
}

export function Tilt({
  children,
  className,
  as: Tag = 'div',
  href,
  autoStart = true,
  ...options
}: TiltProps) {
  const host = useRef<HTMLElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  useEffect(() => {
    if (!host.current) return
    const effect = createTilt(host.current, options)
    handle.current = effect
    if (autoStart) effect.start()
    return () => {
      handle.current = null
      effect.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  useEffect(() => {
    handle.current?.update(options)
  })

  return (
    <Tag ref={host as never} className={className} href={href}>
      {children}
    </Tag>
  )
}

export default Tilt
