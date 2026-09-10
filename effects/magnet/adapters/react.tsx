/*
 * React adapter for Magnet. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createMagnet, type MagnetOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type MagnetProps = Partial<MagnetOptions> & {
  children: ReactNode
  className?: string
  /** The element to render. It is the element that moves. */
  as?: 'button' | 'a' | 'div' | 'span' | 'li'
  href?: string
  /** Set false to mount without starting, behind your own trigger. */
  autoStart?: boolean
}

export function Magnet({
  children,
  className,
  as: Tag = 'button',
  href,
  autoStart = true,
  ...options
}: MagnetProps) {
  const host = useRef<HTMLElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  useEffect(() => {
    if (!host.current) return
    const effect = createMagnet(host.current, options)
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

export default Magnet
