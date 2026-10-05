You are adding **SpotlightCard** from Beamish to this project.

> A card under a desk lamp, lit across the face and bright on the near edge. Surfaces · effect · MIT.
> https://beamish.ink/effects/spotlight-card

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. One added span whose background and box-shadow are painted by CSS from the pointer position
- Two layers rather than one: a wide weak sheen across the face, and a hard highlight on whichever edge is turned toward the light. Paper is matte, so it scatters rather than reflecting a bright spot
- Light and shade together. Lifting the face alone is what the physics says and what nothing in a light room can see, so the far side darkens as the near side brightens. Painted normally rather than screened, because screening cannot darken anything
- Window pointer scope, so the sheen moves before the cursor reaches the card
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/spotlight-card/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/spotlight-card/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `light` | color | `#fff6e4` | any CSS hex | Colour of the lamp. Warm, unless the room is not. It is screened over the card rather than painted on it, so a saturated colour tints the whole face. |
| `sheen` | number | `0.5` | 0 to 1 | How much the face lifts under the lamp. Paper scatters, so this wants to stay low and wide: a tight bright spot is a light source sitting on the card rather than a card being lit. |
| `spread` | number | `0.85` | 0.1 to 2 | How wide the lift is, as a share of the card. Large and weak reads as a lamp; small and strong reads as a torch. |
| `edge` | number | `0.7` | 0 to 1 | How brightly the edge facing the lamp catches. This is the part that sells it: a glow with no lit edge reads as something emitting light, and a card does not emit anything. |
| `shade` | number | `0.5` | 0 to 1 | How far the side away from the lamp falls into shade. This is what makes it read at all. A near white card lifted a few percent looks like a near white card; what you see when something is lit is the gradient across it, and half of that gradient is the dark half. |
| `ease` | number | `0.12` | 0.01 to 1 | How fast the lamp catches up with the cursor, as a fraction of the remaining distance per frame. At 1 it is welded to the pointer and reads as a rectangle following the mouse. |

## 5. Cleanup and SSR

`destroy()` removes the added layer, restores the card's original `position`,
cancels the RAF, disconnects both observers and removes every listener including
the window-scoped pointer one. There is no WebGL context to release.

None of this runs on the server. `createSpotlightCard` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

Nothing moves unless the cursor does, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn.

With no pointer the card is unlit, which is the correct resting state: an
untouched card under no particular light. Nothing looks broken or half-finished.

## 7. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/spotlight-card/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/spotlight-card/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
