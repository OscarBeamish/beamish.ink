/*
 * React adapter for FallingLetters. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 *
 * The text is passed as a string and split by the core inside an effect. Do not
 * build the spans in JSX: React overwrites the DOM on its next render and the
 * line snaps back together halfway down.
 */

'use client'

import { useEffect, useRef } from 'react'
import { createFallingLetters, type FallingLettersOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type FallingLettersProps = Partial<FallingLettersOptions> & {
  children: string
  className?: string
  /** The element to render. A heading is usually right. */
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div'
  /** Set false to mount without starting, behind your own trigger. */
  autoStart?: boolean
}

export function FallingLetters({
  children,
  className,
  as: Tag = 'h1',
  autoStart = true,
  ...options
}: FallingLettersProps) {
  const host = useRef<HTMLElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  // Remounts when the text changes, because the split has to be rebuilt.
  useEffect(() => {
    if (!host.current) return
    const effect = createFallingLetters(host.current, options)
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

export default FallingLetters
