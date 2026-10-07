/*
 * React adapter for TypewriterText. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 *
 * The text is passed as children and split by the core inside an effect. Do not
 * build the spans in JSX: React overwrites the DOM on the next render and the
 * run stops half decoded.
 */

'use client'

import { useEffect, useRef } from 'react'
import { createTypewriterText, type TypewriterTextOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export type TypewriterTextProps = Partial<TypewriterTextOptions> & {
  children: string
  className?: string
  /** The element to render. A heading or a link is usually right. */
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div' | 'a'
  /** Set false to mount without starting, behind your own trigger. */
  autoStart?: boolean
}

export function TypewriterText({
  children,
  className,
  as: Tag = 'span',
  autoStart = true,
  ...options
}: TypewriterTextProps) {
  const host = useRef<HTMLElement>(null)
  const handle = useRef<EffectHandle | null>(null)

  // Remounts when the text changes, because the split has to be rebuilt.
  useEffect(() => {
    if (!host.current) return
    const effect = createTypewriterText(host.current, options)
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

export default TypewriterText
