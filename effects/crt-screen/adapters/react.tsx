/*
 * React adapter for CrtScreen. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

'use client'

import { useEffect, useRef } from 'react'
import { createCrtScreen, type CrtScreenOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type CrtScreenProps = Partial<CrtScreenOptions> & {
  className?: string
  /** Set false to mount without starting, behind your own trigger. */
  autoStart?: boolean
  /** The picture. It stays in the document, hidden, so the alt text stays. */
  children?: React.ReactNode
}

export function CrtScreen({ className, autoStart = true, children, ...options }: CrtScreenProps) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  // Mounts once. Option changes go through update() rather than a remount,
  // because a remount is a new WebGL context and the budget is small.
  useEffect(() => {
    if (!host.current) return
    const effect = createCrtScreen(host.current, options)
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

export default CrtScreen
