## What it is

VariableWeightText makes type put on weight under the cursor. The hand presses,
the letters take more ink, and the line stays exactly where it was.

That last clause is the whole item, and it is why most versions of this only
ever appear on a single centred word.

A variable font's weight axis changes the **advance width** of every glyph it
touches. Go from 400 to 700 and the letters get wider, so a line whose letters
are individually weighted reflows continuously as the cursor crosses it:
characters shuffle sideways, the line end breathes, and anything laid out after
it moves too.

So each character is measured once at the heaviest value the axis will ever
reach, which is the widest it can ever be, and held in a box that wide with the
letter centred in it. One measuring pass, and after it nothing moves again. It
is the difference between an effect you can put on a paragraph and one you can
put on a word.

Two smaller things. The falloff has a shoulder rather than being linear, because
pressure does not fall off in a straight line from a nib and a linear ramp reads
as a triangle of bold sliding along the line. And the axis is a setting rather
than a constant: weight is the obvious one, but a width or slant axis works the
same way and only the strings change.

## It needs a variable font

The face must carry the axis you are driving. A static font ignores
`font-variation-settings` without complaining, so the effect mounts, runs, and
does nothing at all. If you see no change, check the font before you check
anything else.

Stay inside the range the face actually has, too. Asking for 900 of a 400-to-700
font clamps to 700, which means the effect gets quietly weaker as the cursor
arrives rather than stronger.

## Wiring

**Plain HTML.** The text must already be in the element.

```html
<h1 id="masthead">Pressure of the press</h1>

<script type="module">
  import { createVariableWeightText } from './beamish/effects/variable-weight-text/core.js'

  const pressed = createVariableWeightText(document.querySelector('#masthead'))
  pressed.start()
</script>
```

**React.** Pass the text as children. Do not build the characters in JSX: React
overwrites the DOM on the next render and the measuring is lost with it.

```tsx
import { useEffect, useRef } from 'react'
import { createVariableWeightText } from '@/beamish/effects/variable-weight-text/core'

export function Masthead({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pressed = createVariableWeightText(host.current, { reach: 0.3 })
    pressed.start()
    return () => pressed.destroy()
  }, [children])

  return <h1 ref={host}>{children}</h1>
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createVariableWeightText } from '@/beamish/effects/variable-weight-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pressed: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pressed = createVariableWeightText(host.value)
  pressed.start()
})

onBeforeUnmount(() => pressed?.destroy())
</script>

<template>
  <h1 ref="host">Pressure of the press</h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Other axes

`axis` is spelled as the font declares it: four lower-case letters for a
registered axis (`wght`, `wdth`, `slnt`, `opsz`) and upper case for a custom
one. Name an axis the face does not have and nothing happens, with no error
anywhere.

`steady` can come off for an axis that does not change the advance width, a
slant for instance. For weight it should stay on. Turn it off once on a
paragraph and watch the line crawl: that is the thing this item exists to stop.

## Size

One rect read and at most one style write per character per frame. The rects are
read live rather than cached, which is what lets this work on a wrapped
paragraph: the characters really are where the browser put them.

That makes length the thing to watch. Three hundred characters is three hundred
rects a frame, and at that length the effect is a smudge following the cursor
anyway. A heading, or a short paragraph.

## Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The characters are only split on the first frame. Call
`createVariableWeightText` from `useEffect`, `onMounted`, or a `client:*` island.

## Accessibility

The characters are marked `aria-hidden` and a visually hidden copy of the
original string sits alongside them, so a screen reader reads the sentence
rather than the letters.

`rest` is what the text looks like to everyone who never moves a pointer over
it, which is most people and all touch users. Set it to the weight you would
have chosen anyway, and treat everything above it as a flourish nobody needs to
see.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts, so the text simply sits at `rest`. Nothing is lost: the
resting state is the design.

## Common mistakes

1. **Not pinning the boxes.** The line reflows under the cursor. It is the only
   reason you ever see this effect on one word in the middle of a page, and it
   is one measuring pass to fix.

2. **A static font.** `font-variation-settings` is ignored in silence. There is
   no error to find.

3. **A `peak` outside the face's range.** It clamps, so the effect gets weaker
   as the cursor arrives instead of stronger, which reads as a bug in the
   falloff.

4. **A linear falloff.** `shoulder: 1` is a triangle of bold sliding along the
   line. Pressure from a nib does not do that.

5. **Using it on body copy.** Three hundred rects a frame, for an effect that at
   that size is a smudge. It is for a heading.
