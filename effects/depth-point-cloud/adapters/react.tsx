/*
 * React adapter for DepthPointCloud. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

'use client'

import { useEffect, useRef } from 'react'
import { createDepthPointCloud, type DepthPointCloudOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type DepthPointCloudProps = Partial<DepthPointCloudOptions> & {
  className?: string
  /** Set false to mount without starting, behind your own trigger. */
  autoStart?: boolean
}

export function DepthPointCloud({ className, autoStart = true, ...options }: DepthPointCloudProps) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  // Mounts once. Option changes go through update() rather than a remount,
  // because a remount is a new WebGL context and the budget is small.
  useEffect(() => {
    if (!host.current) return
    const effect = createDepthPointCloud(host.current, options)
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

export default DepthPointCloud
