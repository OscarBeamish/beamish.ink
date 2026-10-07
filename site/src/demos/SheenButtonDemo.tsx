/*
 * The SheenButton demo, as an Astro island. See ContentsDemo for why this is an
 * island rather than a hand mount.
 *
 * Both tones side by side, because the whole point of the component is the
 * pairing: one solid, one quiet.
 */

import { SheenButton } from '@items/components/sheen-button/react'

export default function SheenButtonDemo() {
  return (
    <div
      style={{
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%'
      }}
    >
      <SheenButton>Get prompt</SheenButton>
      <SheenButton tone="quiet">View source</SheenButton>
    </div>
  )
}
