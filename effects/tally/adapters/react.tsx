/*
 * React adapter for Tally. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 *
 * The finished number is the children. It renders on the server, is what a
 * search engine indexes, and is what shows if the JavaScript never arrives.
 */

'use client'

import { useEffect, useRef } from 'react'
import { createTally, type TallyOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type TallyProps = Partial<TallyOptions> & {
  children: string
  className?: string
  /** The element to render. */
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div'
  /** Set false to mount without starting, behind your own trigger. */
  autoStart?: boolean
}

export function Tally({ children, className, as: Tag = 'span', autoStart = true, ...options }: TallyProps) {
  const host = useRef<HTMLElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  // Remounts when the text changes, because the split has to be rebuilt.
  useEffect(() => {
    if (!host.current) return
    const effect = createTally(host.current, options)
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
    <Tag ref={host as never} className={className}>
      {children}
    </Tag>
  )
}

export default Tally
