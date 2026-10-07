You are adding **CardStack** from Beamish to this project.

> A pile of prints being leafed through, where the card changes its stacking order only while it is clear of the pile. Surfaces · effect · MIT.
> https://beamish.ink/effects/card-stack

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The card changes its stacking order only while it is clear of the pile, and that is the difference between this and every version that fades the card out. A card going from front to back has to pass the others, and there is no interpolating between being in front of something and behind it: at some instant the order flips. Done while the card is still over the pile it is visible, as a flicker that reads as a dropped frame; done at the far point of the travel, where nothing overlaps, it cannot be seen at all
- The card goes out to the side and back rather than straight through, which is what makes the far point exist. A card that crosses the pile face on has nowhere clear to change order
- Nobody squares a pile. The scatter is fixed to the card rather than to the position, so the third card is always the one sitting a degree crooked wherever it happens to be, and the pile keeps its own character as the cards move through it. A pile with an even offset per position is a diagram of a pile
- The cards are the author's own markup and are never replaced. They are positioned absolutely over one another, because a pile is a pile and the element keeps the height of one card
- destroy() puts every property it set back, including the element's own position
- Pure in t: which card is moving and how far through its travel it is are both arithmetic on the clock, and the scatter is a hash of the card's index
- A pile seen straight on is one card and a few edges, however much the cards are offset, because they are the same object at the same angle. That is honest and it is also why the scatter and the tilt are worth having: the corners are what tell you there is more than one
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/card-stack/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/card-stack/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `interval` | number | `1800` | 400 to 12000 ms (looks right between 1400 and 3200) | Milliseconds each card spends at the front before it is moved. This sets the length of the whole loop, which is the interval times the number of cards, so four cards at 1800ms is a 7.2 second cycle and that is what the recording has to span. |
| `travel` | number | `900` | 100 to 4000 ms | Milliseconds the move itself takes, clamped to the interval so a card cannot still be moving when the next one starts. Half the interval is a good rule: it leaves the pile still for as long as it is moving, which is what makes the movement read as a deliberate act rather than as a carousel. |
| `aside` | number | `0.62` | 0.1 to 1.5 | How far aside the card goes, as a share of the pile's width. It has to clear the pile, because the far point of the travel is where the stacking order changes: below about 0.4 the card is still overlapping when it flips, and you can see it happen. |
| `spread` | number | `18` | 0 to 60 px | How far each card sits from the one beneath. This is what makes it a pile rather than a single card: at 0 the cards are exactly aligned and the whole thing reads as one object until something moves. |
| `shrink` | number | `0.045` | 0 to 0.2 | How much smaller each card down the pile is drawn. A little perspective, and it should be very little: a pile seen from above has almost none, and anything more reads as a fan of cards rather than a stack. |
| `tilt` | number | `3` | 0 to 12 deg | Degrees of scatter. Nobody squares a pile, and at 0 this looks like a specimen diagram. Fixed per card rather than per position, so a card keeps its own angle as it moves through the pile. |
| `lift` | number | `26` | 0 to 120 px | How far the moving card lifts as it goes. A hand picks a card up before moving it sideways, and the lift is most of what makes the move read as a hand rather than as a slide. |
| `seed` | number | `7` | 0 to 9999 | Seed for the scatter. The same seed gives the same pile, so a recording and a live page match card for card. |

## 5. Accessibility. Do not skip this

Every card stays in the accessibility tree and in the tab order, which is
correct: a pile of four cards is four pieces of content, not one.

That also means a card at the back is reachable by keyboard while invisible
behind the others. If the cards contain links or buttons, this is the wrong
component: use it for content that is read rather than operated, or give the
cards behind the front one `inert`.

## 6. Cleanup and SSR

`destroy()` restores every property it set on the cards and on the element.
There is no GPU resource to release and no DOM to rebuild.

All the cards render on the server, laid out normally, which means they appear
as a column before the first frame stacks them. If that matters, give the
element `overflow: hidden` and the height of one card in CSS, so the column is
clipped until the effect takes over.

## 7. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is 0: the pile at rest with the first card on top. Nothing is lost except
the dealing.

## 8. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/card-stack/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/card-stack/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
