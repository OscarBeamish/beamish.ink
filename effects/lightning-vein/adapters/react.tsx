/*
 * React adapter for LightningVein. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 *
 * The element needs a height. A backdrop mounted into a zero-height div builds
 * its canvas, draws nothing, and gives no indication why.
 */

'use client'

import { useEffect, useRef } from 'react'
import { createLightningVein, type LightningVeinOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type LightningVeinProps = Partial<LightningVeinOptions> & {
  className?: string
  /** Set false to mount without starting, behind your own trigger. */
  autoStart?: boolean
}

export function LightningVein({ className, autoStart = true, ...options }: LightningVeinProps) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  useEffect(() => {
    if (!host.current) return
    const sky = createLightningVein(host.current, options)
    handle.current = sky
    if (autoStart) sky.start()
    return () => {
      handle.current = null
      sky.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  useEffect(() => {
    handle.current?.update(options)
  })

  return <div ref={host} className={className} />
}

export default LightningVein
