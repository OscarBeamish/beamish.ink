## What it is

MaskedHeading uncovers a heading by sliding a sheet off it, and the edge of that
sheet is torn rather than cut.

A straight-edged mask crossing a heading is a wipe, and a wipe reads as a
machine, because nothing in the physical world has an edge that straight. The
whole of this item is in the edge.

A **deckle edge** is the untrimmed side of a handmade sheet, where the pulp ran
thin against the frame. It has structure at two scales: a slow wander over a
third of the sheet, and a fine fray of fibres on top of it. One scale alone
gives either a gentle curve or a saw blade, and neither reads as paper. Both are
here.

The tear is built once and **keeps its shape as it travels**, because a torn
edge does not re-tear itself while you pull the sheet away. Regenerating it per
frame is the quickest way to turn paper into a flame.

## It never touches the text

It is a `clip-path` polygon and nothing else, which buys two things.

The text is never taken apart: it selects, wraps, translates, searches and reads
exactly as before. This and SplitFountainText are the only two effects in the
library that leave the DOM alone.

And the clip is composited, so a heading being uncovered costs a transform
rather than a repaint.

## Wiring

**Plain HTML.** Everything inside the element is uncovered together, so put it
on the block rather than on each line.

```html
<div id="masthead">
  <h1>Uncovered, not wiped</h1>
  <p>A straight-edged mask is a wipe.</p>
</div>

<script type="module">
  import { createMaskedHeading } from './beamish/effects/masked-heading/core.js'

  const sheet = createMaskedHeading(document.querySelector('#masthead'))
  sheet.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createMaskedHeading } from '@/beamish/effects/masked-heading/core'

export function Uncover({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sheet = createMaskedHeading(host.current, { direction: 'up' })
    sheet.start()
    return () => sheet.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

Nothing is split, so there is no dependency on the children: the content can
change underneath it freely.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createMaskedHeading } from '@/beamish/effects/masked-heading/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sheet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sheet = createMaskedHeading(host.value)
  sheet.start()
})

onBeforeUnmount(() => sheet?.destroy())
</script>

<template>
  <div ref="host"><slot /></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Uncovering it again.**

```ts
sheet.stop()
sheet.renderAtTime(0)
sheet.start()
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a block that is uncovered when it comes into view.

## Shaping the tear

`tear` is the slow wander and `fray` is the fibres. Keep the first around a
tenth of the element and the second at a fiftieth: the ratio between them is
what makes it paper rather than a wave or a blade.

`points` is the resolution of the edge. Below about twenty the fray has nowhere
to happen and the edge reads as a gentle curve. Past a hundred you are paying
for detail smaller than a pixel.

Give two blocks on one page **different seeds**, or they are uncovered by the
same torn sheet twice, which the eye catches immediately.

## Direction

`up` is a sheet lifted off, and it is the one that reads as paper. The sideways
directions read as a sheet being slid, which is also a real thing and a busier
one across a wide heading: the tear travels along the reading direction, so it
cuts through words rather than lines.

## Cleanup and SSR

`destroy()` removes the clip, leaving the element exactly as it was found. There
is no GPU resource to release and no DOM to rebuild.

The content renders on the server unclipped, which means it is fully visible for
a moment before the first frame covers it. If that matters, hide the block with
CSS and let the effect's first frame take over, or accept the flash: it is one
frame, and the alternative is content that is invisible without JavaScript.

## Accessibility

The text is untouched, so there is nothing to announce and nothing hidden from a
screen reader. A clipped heading is still in the accessibility tree and still
read, which is the correct behaviour for a decorative reveal.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is after the sheet has gone. The heading is simply there, unclipped.

## Common mistakes

1. **A straight edge.** `tear: 0` is a wipe, and a wipe is a television
   transition. The edge is the entire item.

2. **Regenerating the tear each frame.** The edge crawls and flickers, and what
   looked like paper becomes a flame. A torn edge keeps its shape.

3. **Starting the travel at exactly 0.** The parts of the tear that poke
   forwards are already inside the box, so a sheet supposedly at rest leaks
   slivers of the heading through its own edge. The travel has to begin a tear's
   depth off the element, and end a tear's depth past the far side.

4. **Closing the polygon the wrong way round.** It clips the half you meant to
   keep, which looks like the animation running backwards.

5. **One tear for several blocks.** The same seed gives the same sheet, and
   seeing it twice on one page gives the whole thing away.
