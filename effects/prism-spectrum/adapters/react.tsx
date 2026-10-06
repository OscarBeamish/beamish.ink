/*
 * React adapter for PrismSpectrum. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

'use client'

import { useEffect, useRef } from 'react'
import { createPrismSpectrum, type PrismSpectrumOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type PrismSpectrumProps = Partial<PrismSpectrumOptions> & {
  className?: string
  /** Set false to mount without starting. Useful behind your own pause control. */
  autoStart?: boolean
}

export function PrismSpectrum({ className, autoStart = true, ...options }: PrismSpectrumProps) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  // Mount once. Options are pushed through update() below rather than listed as
  // dependencies here, so changing one does not tear the GL context down.
  useEffect(() => {
    if (!host.current) return
    const effect = createPrismSpectrum(host.current, options)
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

export default PrismSpectrum
