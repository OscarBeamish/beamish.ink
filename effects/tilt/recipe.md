## What it is

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

## Wiring

**Plain HTML.** Mount it on the card, not on a wrapper around the card. The
element itself is what leans.

```html
<article class="card">…</article>

<script type="module">
  import { createTilt } from './beamish/effects/tilt/core.js'

  const tilt = createTilt(document.querySelector('.card'), { maxTilt: 9 })
  tilt.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createTilt } from '@/beamish/effects/tilt/core'

export function Card({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!host.current) return
    const tilt = createTilt(host.current, { maxTilt: 9, sheen: 0.5 })
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
import { createTilt } from '@/beamish/effects/tilt/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let tilt: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  tilt = createTilt(host.value, { maxTilt: 9 })
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

## Cleanup and SSR

`destroy()` removes the sheen element, clears the transform, transition,
`will-change`, `position` and `transform-style` it set, cancels the RAF and
disconnects both observers.

The card renders on the server as ordinary markup and looks completely normal if
the JavaScript never arrives. Call `createTilt` from `useEffect`, `onMounted`, or
a `client:*` island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`, which is 0
by default.

At `t = 0` there is no pointer, so the panel draws flat and unmodified. That is
the correct answer here: the card is still a card, it simply does not move. Do
not try to bake in a fixed lean for those users, because a permanently skewed
card reads as a rendering fault.

## Common mistakes

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
