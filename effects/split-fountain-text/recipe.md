## What it is

SplitFountainText is a split fountain. Two or three inks go into the same duct
on the press, the rollers blend them where they meet, and every sheet comes off
with a gradient running across it.

What makes it a split fountain rather than gradient text is that **the gradient
belongs to the sheet, not to the letters**. One pass of ink across the whole
forme: a word near the left is in one ink, a word near the right is in another,
and the heading between them is caught in the blend. A heading that wraps starts
its second line back in the first ink, because the ink depends on where you are
on the sheet and not where you are in the string.

Put the gradient on each element instead, which is what every version of this
does, and every element gets its own little rainbow, every heading has the same
colours in the same places, and the whole point is gone.

That falls out of **mounting it on the sheet rather than on the text**.
`background-clip: text` on a container clips its background to every piece of
text inside it, however deeply nested, so one gradient inks a whole page in
register.

## It never touches the text

This is the only text effect in the library that does not take the text apart.
No spans, no splitting, no hidden label. The text in the element is the text the
browser already had, so it selects, it wraps, it translates, it searches, and a
screen reader never knows anything happened.

Nothing else here can say that. When either this or a per-character effect would
do, this is the one to reach for.

## Wiring

**Plain HTML.** Mount it on the sheet, not the heading.

```html
<section id="sheet">
  <p class="rule">One pass of ink</p>
  <h1>Two inks in the same duct</h1>
  <p>The rollers blend them where they meet.</p>
</section>

<script type="module">
  import { createSplitFountainText } from './beamish/effects/split-fountain-text/core.js'

  const sheet = createSplitFountainText(document.querySelector('#sheet'))
  sheet.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createSplitFountainText } from '@/beamish/effects/split-fountain-text/core'

export function Sheet({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sheet = createSplitFountainText(host.current)
    sheet.start()
    return () => sheet.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

There is no dependency on the children here, unlike the other text items,
because nothing is split: the text can change underneath it freely.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSplitFountainText } from '@/beamish/effects/split-fountain-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sheet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sheet = createSplitFountainText(host.value)
  sheet.start()
})

onBeforeUnmount(() => sheet?.destroy())
</script>

<template>
  <section ref="host"><slot /></section>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Choosing the inks

Split fountains are at their best with inks that make something worth looking at
where they meet. Two that mix to mud give a sheet with a dead band across the
middle, which is a real risk and a real thing that happens on a press.

Set `second` to the same value as one of its neighbours and you have a two-ink
fountain, which is what most presses actually run.

`blend` is how far the inks have walked into each other. Narrow is a press just
started, with the colours still separate. Wide is one that has been running a
while. Both are real points in a run.

`wobble` is the unevenness. At 0 it is a perfectly even ramp, which is to say a
CSS gradient: the unevenness is the tell that ink was involved.

## Contrast

The text is now inked from a gradient, so its contrast against the paper varies
along the sheet. That is a real accessibility problem and it is yours to manage:
check the lightest point of the gradient against the background, not the darkest.

For body copy, keep both inks dark. The effect still reads, because what carries
it is the change in hue rather than the change in value.

## Cleanup and SSR

`destroy()` removes the background, the clip and the two colour properties,
leaving the element exactly as it was found. There is no GPU resource to
release and no DOM to rebuild.

The text renders on the server as ordinary text, in its own colour, and is inked
on the first frame. If the JavaScript never arrives it stays in its own colour,
which is the best fallback any effect here has. Call `createSplitFountainText`
from `useEffect`, `onMounted`, or a `client:*` island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`, so the sheet is inked and still. The inking is the effect;
the walk is only what a press does over a run.

## Common mistakes

1. **Mounting it on the heading.** Then the gradient belongs to the heading, and
   you have gradient text: the same colours in the same places on every element.
   Mount it on the sheet.

2. **Forgetting `-webkit-text-fill-color`.** WebKit paints the text in its own
   colour over the clipped background, and the effect does nothing at all. Both
   properties are needed.

3. **Unsorted gradient stops.** A CSS gradient quietly clamps any stop that
   falls before the one in front of it, which turns the wobble into a hard edge.
   Sort them before writing.

4. **`wobble: 0`.** A perfectly even ramp is a CSS gradient, and there is no
   reason to run an effect to get one.

5. **Two inks that mix to mud.** The middle of the sheet goes dead. Pick inks
   whose blend is worth looking at, because the blend is most of the sheet.
