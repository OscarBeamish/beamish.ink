/*
 * React adapter for Sort. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 *
 * The text is passed as children and split by the core inside an effect. Do not
 * build the spans in JSX: React overwrites the DOM on the next render and the
 * animation stops mid-way.
 */

'use client'

import { useEffect, useRef } from 'react'
import { createSort, type SortOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type SortProps = Partial<SortOptions> & {
  children: string
  className?: string
  /** The element to render. A heading is usually right. */
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div'
  /** Set false to mount without starting, behind your own trigger. */
  autoStart?: boolean
}

export function Sort({ children, className, as: Tag = 'span', autoStart = true, ...options }: SortProps) {
  const host = useRef<HTMLElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  // Remounts when the text changes, because the split has to be rebuilt.
  useEffect(() => {
    if (!host.current) return
    const effect = createSort(host.current, options)
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

export default Sort
