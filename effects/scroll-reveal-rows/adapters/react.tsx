/*
 * React adapter for Riser. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createScrollRevealRows, type ScrollRevealRowsOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type ScrollRevealRowsProps = Partial<ScrollRevealRowsOptions> & {
  children: ReactNode
  className?: string
  /**
   * Change this when the children change. The selection is taken on the first
   * frame, so a list that arrives later needs a remount.
   */
  resetKey?: string | number
  /** Set false to mount without starting, behind your own trigger. */
  autoStart?: boolean
}

export function Riser({ children, className, resetKey, autoStart = true, ...options }: ScrollRevealRowsProps) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  useEffect(() => {
    if (!host.current) return
    const effect = createScrollRevealRows(host.current, options)
    handle.current = effect
    if (autoStart) effect.start()
    return () => {
      handle.current = null
      effect.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, autoStart])

  useEffect(() => {
    handle.current?.update(options)
  })

  return (
    <div ref={host} className={className}>
      {children}
    </div>
  )
}

export default Riser
