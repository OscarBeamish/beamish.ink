## What it is

SplitFlapText is a departure board. Each character is a split-flap cell: a stack
of hinged leaves, each carrying half a glyph, dropping one at a time until the
right one is showing.

The mechanism is the effect, so it is built rather than suggested. Four layers
per cell:

- the top half of the glyph arriving, sitting still behind everything
- the bottom half of the glyph leaving, likewise
- a leaf over the top half, carrying the upper half of the leaving glyph,
  falling from upright to edge on
- a leaf over the bottom half, carrying the lower half of the arriving glyph,
  rising from edge on to upright

Two things follow from that and neither had to be designed.

**The leaves go through the strip in order.** A cell cannot jump from A to R. It
has to pass through everything between, one leaf at a time, which is why a real
board lands its letters in the order the alphabet puts them rather than left to
right, and why a time takes longer to arrive than a word. That is the single
most recognisable thing about the object, and it falls straight out of modelling
the strip.

**A character that is not on the strip stops at the blank.** A board cannot show
what it does not carry. Inventing a leaf for it would be the one dishonest thing
in here.

It is pure in `t`: which leaf a cell is on, and how far through its fall, are
both arithmetic on the clock.

## Wiring

**Plain HTML.** The text must already be in the element.

```html
<div id="board">Departures</div>

<script type="module">
  import { createSplitFlapText } from './beamish/effects/split-flap-text/core.js'

  const board = createSplitFlapText(document.querySelector('#board'))
  board.start()
</script>
```

**React.** Pass the text as children. Do not build the cells in JSX: React will
overwrite the DOM on the next render and the board will stop half way.

```tsx
import { useEffect, useRef } from 'react'
import { createSplitFlapText } from '@/beamish/effects/split-flap-text/core'

export function Board({ children }: { children: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const board = createSplitFlapText(host.current, { flap: 52 })
    board.start()
    return () => board.destroy()
  }, [children])

  return <div ref={host} />
}
```

The dependency on `children` is deliberate. If the text changes, the cells have
to be rebuilt.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSplitFlapText } from '@/beamish/effects/split-flap-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let board: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  board = createSplitFlapText(host.value)
  board.start()
})

onBeforeUnmount(() => board?.destroy())
</script>

<template>
  <div ref="host">Departures</div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Running it again.** It runs once from `t = 0`. To play it again, reset the
clock and start:

```ts
board.stop()
board.renderAtTime(0)
board.start()
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a scroll-triggered board with no extra code.

## The strip is the timing

`flap` is the time for one leaf, and it multiplies by how far along the strip a
character sits. On the default strip a cell showing Z drops twenty six leaves to
get there, which at 52ms is well over a second, while a B arrives almost at
once.

That is not a thing to fix. It is what a board does, and it is why they are
worth watching. But it does mean the order of the strip is a timing decision:
putting the digits after the letters, as the default does, is what makes a time
take longer to land than a word.

If you want everything to arrive at roughly the same moment, shorten the strip
to the characters you actually need. A board for times only wants
`' 0123456789:'`.

## Size

Four layers of DOM per character, two of them transformed every frame. This is
for a board, not a paragraph: keep it under about forty characters. For a
headline reveal use ScrambleText, and for a decode use DecodeText.

## Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The cells are only built on the first frame. Call
`createSplitFlapText` from `useEffect`, `onMounted`, or a `client:*` island.

## Accessibility

The cells are marked `aria-hidden` and a visually hidden copy of the original
string sits alongside them. A screen reader reads the sentence rather than a
stream of leaves.

Do not put an `aria-label` on the element as well. Two labels is worse than
none.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For a one-shot reveal that default is 999, which is any time after the board has
finished, so the text appears set in its cells and still. Do not set it to 0:
that is a board of blanks.

## Common mistakes

1. **Transparent leaves.** A leaf is a tile and it hides what is behind it. The
   first version of this left the four layers transparent, and every cell at
   rest showed the top half of the letter that was arriving straight through the
   blank leaf covering it. It looks like a stacking bug and it is really a
   missing object.

2. **Leaving a leaf at exactly 90 degrees.** Under a perspective projection a
   plane standing edge on does not vanish, it projects as a sliver with half a
   letter smeared along it. Hide it instead.

3. **Letting the cells size themselves.** The flaps on a board are all the same
   size because they are the same part. Every cell here is the width of the
   widest glyph on the strip, measured once in the real face, and a board whose
   cells breathe is not a board.

4. **Using it for a paragraph.** Four elements per character, and a strip that
   can take a second to deliver one letter. It is a board.
