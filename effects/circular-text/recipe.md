## What it is

CircularText sets type round a ring and turns it slowly. A roundel, a seal, the
stamp on a bottle of something.

Nearly every version of this on the web places each character by hand, with a
rotation and a translation per letter, and it is wrong in two ways that are hard
to unsee once you know about them.

The letters are positioned but never **fitted**, so the spacing comes from a
guess at the arc each one subtends and the ring never quite closes. There is
always a gap, or an overlap, at the join.

And each letter is rotated as a rigid block, so nothing **kerns**. The browser
has been handed ten separate one-character strings, and kerning happens between
characters in a string.

This uses an SVG `textPath`, which is the thing in the platform built for
exactly this, and gets both back for free. The text is laid out as text, so it
kerns and it ligates. And it is given a `textLength` equal to the circumference
with `lengthAdjust="spacing"`, so the browser fits the string to the ring by
opening or closing the spaces and never by distorting the letterforms.

The ring closes exactly, at any radius, in any face, with any string. There is
no number to tune.

## Wiring

**Plain HTML.** The text must already be in the element, and the element needs a
size: the ring fills the box it is given.

```html
<div id="seal" style="width: 320px; aspect-ratio: 1">
  Printed and bound in England
</div>

<script type="module">
  import { createCircularText } from './beamish/effects/circular-text/core.js'

  const ring = createCircularText(document.querySelector('#seal'))
  ring.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createCircularText } from '@/beamish/effects/circular-text/core'

export function Seal({ children }: { children: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const ring = createCircularText(host.current, { repeat: 2 })
    ring.start()
    return () => ring.destroy()
  }, [children])

  return (
    <div ref={host} style={{ width: 320, aspectRatio: '1' }}>
      {children}
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createCircularText } from '@/beamish/effects/circular-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let ring: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  ring = createCircularText(host.value)
  ring.start()
})

onBeforeUnmount(() => ring?.destroy())
</script>

<template>
  <div ref="host" class="seal">Printed and bound in England</div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Setting it

The face, weight and tracking are **inherited** from the element, so set them in
CSS as you would for any other text. A text effect that picks its own typeface
is a graphic.

`size` is the letter height as a share of the radius, and it does not affect the
fit: the string fills the circumference whatever size the letters are. It only
decides how heavy the ring looks.

`repeat` is really a density control. Because the string is fitted to the
circumference, one copy of a short phrase is set very wide and four copies of it
are set tight. Pick the one that gives the tracking you want, rather than
reaching for `letter-spacing`.

## A seal with two arcs

A real seal reads left to right over the top and left to right under the bottom,
which is two rings rather than one: a top half standing on the path and a bottom
half hanging inside it. Make it with two elements and `inside` on the second.

`inside` reverses the path rather than flipping the text, so the letters keep
their own shapes. The baseline side follows the direction of travel, which is
all that turning the letters over requires.

## Two rings on one page

Each instance gives its path an id of its own. If you build something like this
by hand, that is the detail to copy: two `textPath` elements pointing at the
same path id is a failure nothing in the markup hints at, because the second one
silently uses the first one's circle.

## Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The SVG is only built on the first frame. Call
`createCircularText` from `useEffect`, `onMounted`, or a `client:*` island.

## Accessibility

The SVG is marked `aria-hidden` and a visually hidden copy of the original
string sits alongside it. A screen reader reads the sentence, once, in order.

A ring of text is decorative by nature: the lower half of a continuous ring is
upside down, which no reader should be asked to work through. Keep anything that
has to be read out of it.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`, which here is 0: the ring at its starting angle. The ring
is the thing, and the turn is only how it passes the time.

## Common mistakes

1. **Placing the letters yourself.** It loses kerning and it never closes the
   ring. `textPath` and `textLength` do both properly, and they are in every
   browser.

2. **`lengthAdjust="spacingAndGlyphs"`.** It fits by stretching the letterforms,
   which means it has changed the typeface. The option is here as `distort` so
   the choice is visible rather than hidden, and it should stay off.

3. **A single 360 degree arc.** Its start and end points coincide, the renderer
   has no way to know which way round to go, and it draws nothing. The circle
   here is two arcs.

4. **Animating `startOffset`.** It re-lays out the text every frame to produce a
   picture that is a rotation of the one before it. Rotate the group.

5. **Spinning it fast.** A seal turning fast enough to notice is a loading
   spinner. The default is one revolution in forty-eight seconds.
