/*
 * React adapter for Spool. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createHalftoneReveal, type HalftoneRevealOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type HalftoneRevealProps = Partial<HalftoneRevealOptions> & {
  className?: string
  /*
   * The pictures. This effect reads them out of the host element rather than
   * taking them as an option, so an adapter that rendered an empty div gave
   * you a blank panel and no error. Your own <img> markup, your own alt text,
   * your own loading attribute.
   */
  children?: ReactNode
  /** Set false to mount without starting. Useful behind your own pause control. */
  autoStart?: boolean
}

export function Spool({ className, children, autoStart = true, ...options }: HalftoneRevealProps) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  // Mount once. Options are pushed through update() below rather than listed as
  // dependencies here, so changing one does not rebuild the whole scene.
  useEffect(() => {
    if (!host.current) return
    const effect = createHalftoneReveal(host.current, options)
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

export default Spool
