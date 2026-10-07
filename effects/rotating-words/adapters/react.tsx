/*
 * React adapter for RotatingWords. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 *
 * The words are the children. Do not pass them as an array of strings and
 * build the spans here: the text would be invisible to anything reading the
 * page before hydration, and copy inside a prop is copy nobody translates.
 */

'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createRotatingWords, type RotatingWordsOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type RotatingWordsProps = Partial<RotatingWordsOptions> & {
  children: ReactNode
  className?: string
  /** Set false to mount without starting, behind your own trigger. */
  autoStart?: boolean
}

export function RotatingWords({
  children,
  className,
  autoStart = true,
  ...options
}: RotatingWordsProps) {
  const host = useRef<HTMLSpanElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  // Rebuilt when the words change, because a different set is a different loop.
  useEffect(() => {
    if (!host.current) return
    const effect = createRotatingWords(host.current, options)
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
    <span ref={host} className={className}>
      {children}
    </span>
  )
}

export default RotatingWords
