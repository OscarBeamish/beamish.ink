/*
 * The Pane demo, as an Astro island. See ContentsDemo for why this is an
 * island rather than a hand mount.
 *
 * The component is controlled, so the demo owns the open state and supplies
 * the trigger. Glass needs something behind it, so the panel puts a picture
 * under both.
 */

import { useState } from 'react'
import { Pane } from '@items/components/glass-modal/react'

export default function PaneDemo() {
  const [open, setOpen] = useState(false)

  return (
    <div className="demo-glass-modal">
      <img
        className="demo-plate-fill"
        src="/plates/glass-modal/plate.jpg"
        alt="A glacial lake under an open sky, mountains all round it"
      />

      <button type="button" className="demo-glass-modal__open" onClick={() => setOpen(true)}>
        Open
      </button>

      <Pane open={open} onClose={() => setOpen(false)} title="A dialog title">
        <p style={{ margin: 0 }}>
          A line of supporting copy inside the sheet, long enough to show how it holds
          body text against whatever is behind it.
        </p>
      </Pane>
    </div>
  )
}
