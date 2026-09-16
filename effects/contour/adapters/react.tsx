/*
 * React adapter for Contour. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

'use client'

import { useEffect, useRef } from 'react'
import { createContour, type ContourOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type ContourProps = Partial<ContourOptions> & {
  className?: string
  /** Set false to mount without starting. Useful behind your own pause control. */
  autoStart?: boolean
}

export function Contour({ className, autoStart = true, ...options }: ContourProps) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  // Mount once. Options are pushed through update() below rather than listed as
  // dependencies here, so changing one does not rebuild the whole scene.
  useEffect(() => {
    if (!host.current) return
    const effect = createContour(host.current, options)
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

export default Contour
