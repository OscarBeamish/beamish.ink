## What it is

Sort sets type one piece at a time. A sort is a single piece of metal type, and
that is what each animated fragment here is: a character, a word or a whole line,
arriving on a stagger.

It takes an element that already contains text, splits it, and animates the
pieces. There is no canvas, no WebGL and no npm dependency.

Two things it does that most text-splitters do not. Characters are grouped inside
their word, so the text still wraps at the right places. And the original string
stays in the accessibility tree as one label, so a screen reader reads a sentence
rather than sixty separate characters.

`destroy()` puts the original text back. The element is left as it was found.

## Wiring

**Plain HTML.** The text must already be in the element. Sort splits what it
finds.

```html
<h1 id="headline">Come to my arms, my beamish boy</h1>

<script type="module">
  import { createScrambleText } from './beamish/effects/scramble-text/core.js'

  const sort = createScrambleText(document.querySelector('#headline'))
  sort.start()
</script>
```

**React.** Render the text as children, then split it in an effect. Do not build
the spans in JSX: React will fight the DOM changes on the next render.

```tsx
import { useEffect, useRef } from 'react'
import { createScrambleText } from '@/beamish/effects/scramble-text/core'

export function Headline({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sort = createScrambleText(host.current, { split: 'char', stagger: 26 })
    sort.start()
    return () => sort.destroy()
  }, [children])

  return <h1 ref={host}>{children}</h1>
}
```

The dependency on `children` is deliberate here, unlike the WebGL effects. If the
text changes, the split has to be rebuilt.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createScrambleText } from '@/beamish/effects/scramble-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sort: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sort = createScrambleText(host.value)
  sort.start()
})

onBeforeUnmount(() => sort?.destroy())
</script>

<template>
  <h1 ref="host">Come to my arms, my beamish boy</h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Replaying it.** Sort runs once from `t = 0`. To play it again, reset the clock
and start:

```ts
sort.stop()
sort.renderAtTime(0)
sort.start()
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a scroll-triggered reveal with no extra code.

## Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text, and stays readable if the
JavaScript never arrives. Splitting only happens on the first frame. Call
`createScrambleText` from `useEffect`, `onMounted`, or a `client:*` island.

## Accessibility

The split version is marked `aria-hidden`, and a visually hidden copy of the
original string sits alongside it. A screen reader reads the sentence. This is
the part most text-splitting libraries get wrong, and the symptom is a screen
reader spelling a headline out letter by letter.

Do not put an `aria-label` on the element as well. Two labels is worse than none.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For a one-shot reveal that default is 999, which is any time after the animation
has finished. The text simply appears, fully set, which is the correct outcome.
Do not set it to 0: that leaves the headline invisible.

## Common mistakes

1. **Building the spans in JSX or a template.** React and Vue will overwrite the
   DOM on the next render and the animation stops mid-way. Pass plain text as
   children and let `createScrambleText` do the splitting inside an effect.

2. **Leaving `stagger` at 26ms on a long heading.** It multiplies. Sixty
   characters at 40ms is a two and a half second wait before the last one lands,
   which reads as a broken page rather than a reveal. Above about 40 characters,
   switch `split` to `word`.

3. **Setting `reducedMotionTime` to 0.** That is the frame before anything has
   arrived, so the text stays invisible for anyone who has asked for less motion.
   It wants to be a time after the animation ends.
