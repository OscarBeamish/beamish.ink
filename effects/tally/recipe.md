## What it is

Tally counts a number up to the one already written in the element. No canvas, no
WebGL, no npm dependency.

It reads the target from the text content, and there is no option to override
that. The real figure is therefore in the HTML before any JavaScript runs, stays
there if none ever does, and is what a search engine indexes. A counter that
renders `0` until hydration is a counter that is wrong most of the time.

Formatting goes through `Intl.NumberFormat`. That is the part most counters get
wrong: 1,284 in Britain is 1.284 in Germany, and a hand-rolled thousands
separator is wrong in about half the world. Tally also parses both conventions on
the way in, so `1.284,50` and `1,284.50` both mean the same thing to it.

`destroy()` puts the original text back.

## Wiring

**Plain HTML.** Put the real number in the element.

```html
<span id="stars">45,400</span>

<script type="module">
  import { createTally } from './beamish/effects/tally/core.js'

  const tally = createTally(document.querySelector('#stars'))
  tally.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createTally } from '@/beamish/effects/tally/core'

export function Stat({ value }: { value: string }) {
  const host = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!host.current) return
    const tally = createTally(host.current, { duration: 1800 })
    tally.start()
    return () => tally.destroy()
  }, [value])

  return <span ref={host}>{value}</span>
}
```

The dependency on `value` is deliberate. If the figure changes, the count has to
be rebuilt.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createTally } from '@/beamish/effects/tally/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let tally: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  tally = createTally(host.value)
  tally.start()
})

onBeforeUnmount(() => tally?.destroy())
</script>

<template>
  <span ref="host">45,400</span>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Counting on scroll.** Do not add an `IntersectionObserver`. The runtime has
one: it holds the loop until the element is on screen, so `start()` on mount
counts when the stat scrolls into view.

**Counting again.**

```ts
tally.stop()
tally.renderAtTime(0)
tally.start()
```

## Cleanup and SSR

`destroy()` restores the original text, cancels the RAF and disconnects both
observers. There is no GPU resource to release.

It renders on the server as the finished number, which is the correct thing for
it to be. Call `createTally` from `useEffect`, `onMounted`, or a `client:*`
island.

## Accessibility

The counting digits are marked `aria-hidden`, and a visually hidden copy of the
final figure sits alongside them. A screen reader announces `45,400` once.

Without that, a live number either gets announced at every value it passes or,
with `aria-live` set wrongly, interrupts whatever the user was listening to. The
figure is the information. The counting is decoration.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

That default is 999, which is any time after the count has finished, so the
number simply appears. Do not set it to 0: that shows `0` permanently, which is
not a stylistic choice but a wrong figure.

## Common mistakes

1. **Not using tabular figures.** Most typefaces give `1` a narrower glyph than
   `8`, so the number changes width every frame and everything beside it jitters.
   Add `font-variant-numeric: tabular-nums`, or give the element a fixed width.

2. **Leaving `locale` empty and expecting your `lang` attribute to matter.** It
   does not. `Intl.NumberFormat` follows the browser's own language setting, so a
   visitor whose browser is German reads `45.400` on your `lang="en-GB"` page.
   That is correct behaviour and almost never what you wanted. Name the locale.

   While you are there, keep currency symbols in `prefix` rather than in the
   element's text: `$` and `€` before a figure confuse the decimal detection.

3. **Setting `reducedMotionTime` to 0.** The element then permanently reads `0`
   for anyone who has asked for less motion. It wants to be a time after the
   count ends.
