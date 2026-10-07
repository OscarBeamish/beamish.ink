## What it is

CardStack is a pile of prints being leafed through. The top one is lifted, taken
aside, and put at the back, and the pile shuffles up a place.

Two things carry it, and the second is the one every version gets wrong.

**Nobody squares a pile.** Each card sits at a slight angle and a slight offset,
and the scatter is fixed **to the card** rather than to the position. So the
third card is always the one sitting a degree crooked, wherever in the pile it
happens to be, and the pile keeps its own character as the cards move through
it. An even offset per position is a diagram of a pile.

**The card changes its stacking order only while it is clear of the pile.** A
card going from front to back has to pass the others, and there is no
interpolating between being in front of something and behind it: at some instant
the order flips. Do it while the card is still over the pile and you see it, as
a flicker that reads as a dropped frame. Do it at the far point of the travel,
where nothing overlaps, and it cannot be seen at all.

That is why the card goes out to the side and back rather than straight through:
the arc is what makes the far point exist. It is also why every other version of
this fades the card out — fading hides a switch you could simply have made
somewhere invisible.

## Wiring

**Plain HTML.** The element's children are the pile, stacked over one another,
so give the element the height of one card.

```html
<div id="pile" style="width: 24rem; aspect-ratio: 5 / 6">
  <article class="plate">…</article>
  <article class="plate">…</article>
  <article class="plate">…</article>
  <article class="plate">…</article>
</div>

<script type="module">
  import { createCardStack } from './beamish/effects/card-stack/core.js'

  const pile = createCardStack(document.querySelector('#pile'))
  pile.start()
</script>
```

The cards are your own markup and are never replaced. `destroy()` puts every
property back, including the element's own `position`.

**React.** The cards are the children.

```tsx
import { useEffect, useRef } from 'react'
import { createCardStack } from '@/beamish/effects/card-stack/core'

export function Pile({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pile = createCardStack(host.current, { interval: 1800 })
    pile.start()
    return () => pile.destroy()
  }, [children])

  return <div ref={host} style={{ aspectRatio: '5 / 6' }}>{children}</div>
}
```

The dependency on `children` is deliberate: a different set of cards is a
different pile and has to be rebuilt.

**Vue.** The cards come in through the default slot.

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createCardStack } from '@/beamish/effects/card-stack/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pile: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pile = createCardStack(host.value)
  pile.start()
})

onBeforeUnmount(() => pile?.destroy())
</script>

<template>
  <div ref="host" class="pile"><slot /></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## The loop is the interval times the cards

Four cards at an interval of 1800ms is a 7.2 second cycle, and that is what a
recording of it has to span for the loop to close. If you change either, change
the record duration with them.

`travel` is clamped to the interval, so a card can never still be moving when
the next one starts. Half the interval is a good rule: it leaves the pile still
for as long as it is moving, which makes the movement read as a deliberate act
rather than as a carousel.

## `aside` has to clear the pile

Below about 0.4 the card is still overlapping the others when the stacking order
flips, and you can see it happen. The default of 0.62 takes the card well clear.

This is the one setting you can break the effect with, and the failure looks
like a rendering glitch rather than like a number being too small.

## A pile seen straight on

It is one card and a few edges, however much you offset them, because they are
the same object at the same angle. That is honest, and it is why the scatter and
the tilt are worth having: the corners poking out are what tell you there is
more than one card there.

If you need the pile to read as a pile while it is still, give the cards
different content near their edges, or accept that the movement is what
communicates it. Do not reach for a bigger `shrink`: past about 0.08 it stops
being a stack and becomes a fan.

## Cleanup and SSR

`destroy()` restores every property it set on the cards and on the element.
There is no GPU resource to release and no DOM to rebuild.

All the cards render on the server, laid out normally, which means they appear
as a column before the first frame stacks them. If that matters, give the
element `overflow: hidden` and the height of one card in CSS, so the column is
clipped until the effect takes over.

## Accessibility

Every card stays in the accessibility tree and in the tab order, which is
correct: a pile of four cards is four pieces of content, not one.

That also means a card at the back is reachable by keyboard while invisible
behind the others. If the cards contain links or buttons, this is the wrong
component: use it for content that is read rather than operated, or give the
cards behind the front one `inert`.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is 0: the pile at rest with the first card on top. Nothing is lost except
the dealing.

## Common mistakes

1. **Changing the stacking order over the pile.** It flickers, and it reads as a
   dropped frame rather than as a mistake you made. Change it at the far point
   of the travel, where nothing overlaps.

2. **Fading the card out to hide the switch.** That is the workaround for the
   mistake above, and it costs you the whole gesture: a card going behind a pile
   does not become transparent.

3. **An even offset per position.** The pile stops having any character and
   becomes a diagram. Fix the scatter to the card.

4. **A card that crosses the pile face on.** There is then nowhere clear to
   change the order, so the arc is not decoration.

5. **Putting buttons on the cards.** The ones at the back are reachable by
   keyboard while invisible. It is for content that is read.
