/*
 * React adapter for ExpandingTiles. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 *
 * The tiles are the children. Lay the grid out with your own CSS on the element
 * this renders: the effect reads where the cells are and opens out of them, and
 * it never positions them.
 */

'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createExpandingTiles, type ExpandingTilesOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type ExpandingTilesProps = Partial<ExpandingTilesOptions> & {
  children: ReactNode
  className?: string
  /** Set false to mount without starting, behind your own trigger. */
  autoStart?: boolean
}

export function ExpandingTiles({
  children,
  className,
  autoStart = true,
  ...options
}: ExpandingTilesProps) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  /*
   * Rebuilt when the children change, because a different set of tiles is a
   * different grid and the cells have to be measured again.
   */
  useEffect(() => {
    if (!host.current) return
    const effect = createExpandingTiles(host.current, options)
    handle.current = effect
    if (autoStart) effect.start()
    return () => {
      handle.current = null
      effect.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, autoStart])

  useEffect(() => {
    handle.current?.update(options)
  })

  return (
    <div ref={host} className={className}>
      {children}
    </div>
  )
}

export default ExpandingTiles
