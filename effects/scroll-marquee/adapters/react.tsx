/*
 * React adapter for ScrollMarquee. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createScrollMarquee, type ScrollMarqueeOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type ScrollMarqueeProps = Partial<ScrollMarqueeOptions> & {
  /** The strip. Whatever goes in here is what runs sideways. */
  children?: ReactNode
  className?: string
  /** Set false to mount without starting. Useful behind your own pause control. */
  autoStart?: boolean
}

export function ScrollMarquee({ children, className, autoStart = true, ...options }: ScrollMarqueeProps) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  // Mount once. Options are pushed through update() below rather than listed as
  // dependencies here, so changing one does not tear the GL context down.
  useEffect(() => {
    if (!host.current) return
    const effect = createScrollMarquee(host.current, options)
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
    <div ref={host} className={className}>
      {children}
    </div>
  )
}

export default ScrollMarquee
