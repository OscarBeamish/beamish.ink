## What it is

EmbossedText presses type into paper. A platen comes down, the sheet takes the
impression, and the paper springs back a little.

The effect this is a recast of is called depth text, and it extrudes the letters
towards the viewer in fake 3D with a stack of shadows going down and to the
right. That is a sign, or a plastic badge. Letterpress goes the other way: the
type ends up below the surface, the paper is deformed, and what you read is
light catching the walls of the impression.

So the whole thing is two shadows and a colour, and getting those right is the
entire job.

**A dark edge on the side the light comes from**, because that wall of the
impression is turned away from it, and a light edge opposite. Reverse the two
and the letter stands up off the page instead. Everybody writing a debossed text
shadow does this at least once.

**The impression bites unevenly across the line.** Getting a forme to print
evenly is a job with a name, makeready, and before it is done some letters bite
harder than others. That unevenness is the difference between a press and a CSS
filter, and at `makeready: 0` the two are indistinguishable.

**Ink is optional.** A blind emboss has none at all: the letter face is the same
paper as the page, and the impression is the only thing to read. It is the best
thing this effect does and it is one setting.

The whole line presses at once, because a platen is one surface coming down. The
variation is in how hard each letter bites, not in when.

## Wiring

**Plain HTML.** The text must already be in the element.

```html
<h1 id="masthead">Pressed into the sheet</h1>

<script type="module">
  import { createEmbossedText } from './beamish/effects/embossed-text/core.js'

  const pressed = createEmbossedText(document.querySelector('#masthead'), {
    paper: '#fbfaf4'
  })
  pressed.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createEmbossedText } from '@/beamish/effects/embossed-text/core'

export function Masthead({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pressed = createEmbossedText(host.current, { paper: '#fbfaf4' })
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
import { createEmbossedText } from '@/beamish/effects/embossed-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pressed: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pressed = createEmbossedText(host.value, { paper: '#fbfaf4' })
  pressed.start()
})

onBeforeUnmount(() => pressed?.destroy())
</script>

<template>
  <h1 ref="host">Pressed into the sheet</h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Pulling it again.**

```ts
pressed.stop()
pressed.renderAtTime(0)
pressed.start()
```

## `paper` has to be the real page colour

This is the one thing that will catch you out. With `transfer: 0` the letter
face is painted the `paper` colour, because that is what a blind emboss is: the
same sheet, pushed down. If `paper` does not match the page the text is actually
on, the heading appears as a block of slightly wrong white, and it looks like a
bug rather than like a setting.

If the page behind the text is a gradient or an image, a blind emboss cannot
work. Put some ink on the type instead, with `transfer` somewhere above about
0.6, and the letter stops depending on the background.

## Size

Depth and softness are in ems, so one impression looks the same at every size.
What does change with size is whether the impression is visible at all: at body
size a 0.045em wall is under a pixel, and the effect vanishes. This is for a
heading, and the larger the better.

It is also why the inked setting needs more depth than the blind one. Ink is
high contrast and it hides the impression, which is true of the real thing too:
look at a letterpress business card and the bite is easiest to see where there
is no ink.

## Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives, though it will be the `paper` colour on the first
frame only once the effect has mounted. For a blind emboss above the fold, set
the heading's own `color` to the paper colour in CSS as well, so there is no
flash of dark text.

Call `createEmbossedText` from `useEffect`, `onMounted`, or a `client:*` island.

## Accessibility

The characters are marked `aria-hidden` and a visually hidden copy of the
original string sits alongside them, so a screen reader reads the sentence.

A blind emboss has almost no contrast by design, which means it fails WCAG 1.4.3
as body copy and should only ever be decorative or a heading that is repeated in
accessible text nearby. That is not a flaw in the implementation, it is what the
print technique is: a blind emboss is for texture, and a reader who needs
contrast needs ink.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. For this item the still frame is the finished impression,
which costs the viewer nothing.

## Common mistakes

1. **The shadows the wrong way round.** The dark edge goes on the side the light
   comes from. The other way is embossing, which stands proud of the sheet, and
   the two look nothing alike once you have seen both.

2. **`paper` left at the default on a white page.** The letters become a block
   of cream on white. It has to be the page colour.

3. **`makeready: 0`.** Every letter bites identically and the result is
   indistinguishable from a static CSS filter. The unevenness is the tell.

4. **Using it at body size.** The impression is sub-pixel and disappears. It is
   a heading effect.

5. **A deep impression because it looks impressive.** Past about 0.1em it is no
   longer a press, it is a stamp, and a printer would tell you it is punching
   through the sheet.
