/*
 * React adapter for Lamp. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createRelightImage, type RelightImageOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type RelightImageProps = Partial<RelightImageOptions> & {
  className?: string
  /*
   * The picture. The effect reads it out of the host element rather than taking
   * it as an option, so this is your own <img> markup: your alt text, your
   * loading attribute, and a page whose script never runs still shows it.
   */
  children?: ReactNode
  /** Set false to mount without starting. Useful behind your own pause control. */
  autoStart?: boolean
}

export function Lamp({ className, children, autoStart = true, ...options }: RelightImageProps) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  // Mount once. Options are pushed through update() below rather than listed as
  // dependencies here, so changing one does not rebuild the whole scene.
  useEffect(() => {
    if (!host.current) return
    const effect = createRelightImage(host.current, options)
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

export default Lamp
