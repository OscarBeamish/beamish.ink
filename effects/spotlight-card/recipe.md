## What it is

A card under a desk lamp, with the cursor as the lamp.

The usual version of this puts a bright radial glow on a dark card and calls it a
spotlight. That is a light source sitting on the surface, which is not what a
lamp does to paper. Paper is matte: it scatters. Move a lamp across a card and
what you see is a broad, low-contrast lift across the face, a hard bright line on
whichever edge is turned toward the light, and the far side falling away into
shade.

All three are here, and the third one is the one that makes it work. The first
version of this lifted the face and nothing else, which is what the physics says
and what nothing in a light room can actually see: a near-white card lifted a few
percent is indistinguishable from a near-white card. What you read when something
is lit is the **gradient** across it, and half of that gradient is the dark half.

The edge matters too. A glow with no lit edge reads as something emitting light,
and a card does not emit anything.

No canvas and no WebGL. One added span whose background and box-shadow are
repainted from the pointer position.

## Wiring

The card is your markup. It is lit, not replaced.

```html
<article id="card">
  <h2>Beamysshe as the sonne is</h2>
  <p>John Palsgrave, 1530.</p>
</article>
```

```ts
import { createSpotlightCard } from './beamish/effects/spotlight-card/core'

const spotlight = createSpotlightCard(document.querySelector('#card'))
spotlight.start()
```

The effect adds one `aria-hidden` span inside the card and removes it again on
`destroy()`. If the card is `position: static` it is promoted to `relative`,
because the layer has to have something to be absolute against, and that is
restored too. Nothing else about your layout is touched.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createSpotlightCard } from '@/beamish/effects/spotlight-card/core'

export function Card({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!host.current) return
    const spotlight = createSpotlightCard(host.current)
    spotlight.start()
    return () => spotlight.destroy()
  }, [])

  return <article ref={host} className="card">{children}</article>
}
```

Do not put option values in the dependency array. Call `update()` instead.

**Vue.** The adapter renders a `div` by default; pass `tag` for anything else.

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSpotlightCard } from '@/beamish/effects/spotlight-card/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let spotlight: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  spotlight = createSpotlightCard(host.value)
  spotlight.start()
})

onBeforeUnmount(() => spotlight?.destroy())
</script>

<template>
  <article ref="host" class="card"><slot /></article>
</template>
```

## The pointer reaches outside the card

This mounts with `pointerScope: 'window'`, so the lamp has started to move before
the cursor reaches the card. A lamp carried across a desk lights the card on the
way, and a card that only notices once the cursor is inside it snaps.

Pass `pointerScope: 'element'` if you would rather it only responded while the
cursor is over it.

## Tuning it

`sheen` and `shade` are a pair and they want to stay close. Light without shade
disappears on a pale card, which is the failure this was built around; shade
without light reads as a drop shadow that has come loose.

`spread` decides what kind of lamp it is. Large and weak is a desk lamp; small
and strong is a torch, and a torch on a business card is a strange thing to
imply.

`ease` is how fast the lamp catches up, as a fraction of the remaining distance
per frame. At 1 it is welded to the pointer and reads as a rectangle following
the mouse rather than as light.

On a dark card, drop `shade` most of the way and raise `sheen`. The gradient
still has to go both ways, but on a dark surface there is much more room above
the base tone than below it.

## Pausing

Nothing moves unless the cursor does, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

## Reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn.

With no pointer the card is unlit, which is the correct resting state: an
untouched card under no particular light. Nothing looks broken or half-finished.

## Cleanup and SSR

`destroy()` removes the added layer, restores the card's original `position`,
cancels the RAF, disconnects both observers and removes every listener including
the window-scoped pointer one. There is no WebGL context to release.

None of this runs on the server. `createSpotlightCard` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'`.

## Common mistakes

1. **Turning `sheen` up and leaving `shade` at zero.** On a pale card you will
   see almost nothing however far you push it, and then conclude the effect is
   broken. The dark half is doing most of the work.

2. **Using it on a card with no border radius or background.** There is nothing
   to light. It needs a surface that reads as an object sitting on the page.

3. **Putting it on a dozen cards in a grid.** Every one of them runs a frame loop
   and tracks the window pointer. It is cheap, but twelve cheap things are not
   cheap. Light the one under the cursor.

4. **A saturated `light`.** It is painted over the card rather than screened, so
   a strong colour tints the whole face rather than reading as illumination. Keep
   it close to white, warm or cool.
