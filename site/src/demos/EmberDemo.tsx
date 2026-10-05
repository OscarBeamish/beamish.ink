/*
 * The Ember demo, as an Astro island. See ContentsDemo for why this is an
 * island rather than a hand mount.
 *
 * Both tones side by side, because the whole point of the component is the
 * pairing: one solid, one quiet.
 */

import { Ember } from '@items/components/glow-button/react'

export default function EmberDemo() {
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
      <Ember>Get prompt</Ember>
      <Ember tone="quiet">View source</Ember>
    </div>
  )
}
