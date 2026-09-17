You are adding **TiltCard** from Beamish to this project.

> A panel that leans towards the cursor, with a sheen raking across it. Surfaces · effect · MIT.
> https://beamish.ink/effects/tilt-card

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. One CSS transform and one radial gradient
- The easing is a CSS transition rather than a per-frame spring, so nothing integrates and renderAtTime stays pure
- The sheen uses mix-blend-mode: soft-light, which is unsupported below Safari 15.4 and simply does not paint there
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/tilt-card/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/tilt-card/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Tilt leans a panel towards the cursor and rakes a pool of light across it as it
goes. One CSS transform and one radial gradient. No canvas, no WebGL, no npm
dependency.

The easing is a CSS transition rather than a per-frame spring. That is a
deliberate choice: nothing integrates against the previous frame, so
`renderAtTime` stays pure and the recorder scrubs the smoothing along with
everything else. A spring would look almost the same and would make the effect
impossible to record.

The sheen is a warm white by default, not a cool one. Cool white on a panel reads
as glass. Warm white reads as light falling on paper, which is the library this
belongs to.

`destroy()` removes the sheen and clears every style it set.

## 3. Wire it in

**Plain HTML.** Mount it on the card, not on a wrapper around the card. The
element itself is what leans.

```html
<article class="card">…</article>

<script type="module">
  import { createTiltCard } from './beamish/effects/tilt-card/core.js'

  const tilt = createTiltCard(document.querySelector('.card'), { maxTilt: 9 })
  tilt.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createTiltCard } from '@/beamish/effects/tilt-card/core'

export function Card({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!host.current) return
    const tilt = createTiltCard(host.current, { maxTilt: 9, sheen: 0.5 })
    tilt.start()
    return () => tilt.destroy()
  }, [])

  return <article ref={host} className="card">{children}</article>
}
```

Do not put option values in the dependency array. Call `update()` instead:

```tsx
useEffect(() => {
  tiltRef.current?.update({ maxTilt })
}, [maxTilt])
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createTiltCard } from '@/beamish/effects/tilt-card/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let tilt: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  tilt = createTiltCard(host.value, { maxTilt: 9 })
  tilt.start()
})

onBeforeUnmount(() => tilt?.destroy())
</script>

<template>
  <article ref="host" class="card"><slot /></article>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Many cards.** Mount one instance per card. Each one carries its own
`ResizeObserver` and `IntersectionObserver`, which is a few hundred bytes of
bookkeeping per card and nothing on the GPU, so a grid of twenty is fine. There
is no WebGL context involved, so the context budget does not apply here.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `maxTilt` | number | `9` | 0 to 30 deg (looks right between 5 and 14) | How far it leans at the corners. Past about 16 the text on the card starts to distort and people read it as a bug rather than a bevel. |
| `perspective` | number | `900` | 200 to 3000 px (looks right between 600 and 1400) | Perspective distance. Lower is a wider, more theatrical lens; higher flattens the lean into something closer to a skew. |
| `scale` | number | `1.02` | 0.9 to 1.2 (looks right between 1 and 1.05) | Scale while the pointer is over it. 1 is no lift. Above 1.06 the card starts covering its neighbours. |
| `sheen` | number | `0.5` | 0 to 1 (looks right between 0.3 and 0.7) | Strength of the light pool following the cursor. Zero switches the overlay off entirely. |
| `sheenColor` | color | `#ffffff` | any CSS hex | Colour of the sheen. On paper a warm white reads as light falling on the card. A cool white reads as glass, which is a different product. |
| `sheenSize` | number | `0.75` | 0.1 to 2 (looks right between 0.5 and 1.1) | How wide the light pool is, as a fraction of the panel. Small and bright reads as a torch; wide and faint reads as a window. |
| `ease` | number | `320` | 0 to 1200 ms (looks right between 200 and 450) | How long the panel takes to follow the cursor and to settle back. Zero locks it to the pointer, which feels precise and slightly cheap. |
| `invert` | boolean | `false` | `true` · `false` | Tip away from the cursor rather than towards it. Reads as pushing the card rather than lifting it. |
| `reducedMotionTime` | number | `0` | 0 to 60 s | The single frame shown when the user prefers reduced motion. At rest there is no pointer, so this draws the panel flat and unmodified, which is the right answer. |

## 5. Cleanup and SSR

`destroy()` removes the sheen element, clears the transform, transition,
`will-change`, `position` and `transform-style` it set, cancels the RAF and
disconnects both observers.

The card renders on the server as ordinary markup and looks completely normal if
the JavaScript never arrives. Call `createTiltCard` from `useEffect`, `onMounted`, or
a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`, which is 0
by default.

At `t = 0` there is no pointer, so the panel draws flat and unmodified. That is
the correct answer here: the card is still a card, it simply does not move. Do
not try to bake in a fixed lean for those users, because a permanently skewed
card reads as a rendering fault.

## 7. The three mistakes most likely to be made here

1. **Mounting it on a wrapper instead of the card.** The element you pass is the
   element that leans. Put it on the thing with the border and the padding, or
   you get a tilting invisible box with a static card inside it.

2. **Raising `maxTilt` past about 16 degrees.** Text on the card starts to
   distort and the whole thing reads as a rendering bug rather than a bevel. If
   it feels too subtle, lower `perspective` instead: that widens the lens and
   makes the same angle look like more.

3. **Overflow clipping the sheen.** The overlay inherits the panel's
   `border-radius`, but if the card has `overflow: hidden` on a child wrapper
   rather than on itself, the light pool will square off at the corners. Put the
   radius and the overflow on the same element you mount onto.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/tilt-card/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/tilt-card/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
