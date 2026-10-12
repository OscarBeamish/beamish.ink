/*
 * React adapter for BlockDissolve. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

'use client'

import { useEffect, useRef } from 'react'
import { createBlockDissolve, type BlockDissolveOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type BlockDissolveProps = Partial<BlockDissolveOptions> & {
  className?: string
  /** Set false to mount without starting, behind your own trigger. */
  autoStart?: boolean
  /** Whatever is being uncovered. It is clipped, never touched. */
  children?: React.ReactNode
}

export function BlockDissolve({
  className,
  autoStart = true,
  children,
  ...options
}: BlockDissolveProps) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  // Mounts once. Option changes go through update() rather than a remount,
  // because a remount restarts the wipe from nothing.
  useEffect(() => {
    if (!host.current) return
    const effect = createBlockDissolve(host.current, options)
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

export default BlockDissolve
