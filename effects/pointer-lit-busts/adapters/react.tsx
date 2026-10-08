/*
 * React adapter for PointerLitBusts. Thin on purpose. It wires a ref to the
 * core and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 *
 * The element needs a height. A scene mounted into a zero-height div builds
 * its context, renders nothing, and gives no indication why.
 */

'use client'

import { useEffect, useRef } from 'react'
import { createPointerLitBusts, type PointerLitBustsOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type PointerLitBustsProps = Partial<PointerLitBustsOptions> & {
  className?: string
  /** Set false to mount without starting, behind your own trigger. */
  autoStart?: boolean
}

export function PointerLitBusts({
  className,
  autoStart = true,
  ...options
}: PointerLitBustsProps) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  /*
   * Mounted once. The scene is expensive to build and nothing about it depends
   * on React's children, so rebuilding it on every render would throw away a
   * context and a set of compiled programmes for nothing.
   */
  useEffect(() => {
    if (!host.current) return
    const effect = createPointerLitBusts(host.current, options)
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

export default PointerLitBusts
