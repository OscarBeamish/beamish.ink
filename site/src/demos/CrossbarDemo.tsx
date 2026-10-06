/*
 * The Crossbar demo, as an Astro island. See ContentsDemo for why this is an
 * island rather than a hand mount.
 *
 * Glass needs something behind it, so the panel supplies a picture and a line
 * of copy for the bar to settle over. A flat background gives it nothing to
 * blur and nothing to bend, which is the most common way this effect is made
 * to look cheap.
 */

import { Crossbar } from '@items/components/glass-nav/react'

export default function CrossbarDemo() {
  return (
    <div className="demo-glass-nav">
      <img
        className="demo-plate-fill"
        src="/plates/relight-image/plate.jpg"
        alt="A facade of small square windows punched in a dark grid, seen from above"
      />
      <div className="demo-glass-nav__bar">
        <Crossbar
          brand="Beamish.ink"
          items={[
            { label: 'Work', href: '#work', current: true },
            { label: 'Studio', href: '#studio' },
            { label: 'Contact', href: '#contact' }
          ]}
        />
      </div>
    </div>
  )
}
