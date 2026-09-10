/*
 * React adapter for Foil. Thin on purpose — it wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

'use client'

import { useEffect, useRef } from 'react'
import { createFoil, type FoilOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type FoilProps = Partial<FoilOptions> & {
  className?: string
  /** Set false to mount without starting — useful behind your own pause control. */
  autoStart?: boolean
}

export function Foil({ className, autoStart = true, ...options }: FoilProps) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  // Mount once. Options are pushed through update() below rather than listed as
  // dependencies here, so changing one does not tear the GL context down.
  useEffect(() => {
    if (!host.current) return
    const effect = createFoil(host.current, options)
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

  return <div ref={host} className={className} />
}

export default Foil
