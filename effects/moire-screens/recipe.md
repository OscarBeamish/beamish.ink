## What it is

MoireScreens lays two halftone screens over each other at a small angle and
lets them beat.

The fringes are not drawn. Nothing in the shader draws a fringe or knows where
one is: there are two regular screens, and the interference is what comes out.
That is the point of building it this way rather than drawing the pattern, and
it is why the fringes behave correctly when the angle changes. The spacing of
the beat is the pitch over twice the sine of half the angle, so it runs away
towards infinity as the screens line up: ten degrees gives a tight rosette, two
gives fringes the size of the frame, and zero gives nothing at all.

This is a printing fault, induced on purpose. It is the reason process colour is
screened at fifteen, forty-five, seventy-five and a hundred and five degrees:
those angles are chosen so four screens do not do this. Set `separation` to 30
and you have the industry's answer. Set it to 4 and you have the thing every
printer has had to explain to a client.

## The anti-aliasing is the effect

This is the part that would be easy to treat as a polish pass and is actually
load-bearing.

A regular screen at this frequency aliases against the pixel grid, and **that
aliasing is itself a moire**. Draw the screens with hard edges and the fringes
you see are partly the screens beating with the display rather than with each
other: the effect becomes a rendering artefact wearing the costume of an optical
one, and it changes when you change monitor.

So each screen's coverage is computed analytically, and its edge is softened by
exactly the width of one pixel's footprint in screen space, which is what
`fwidth` gives. What is left on the canvas is the real interference.

## Wiring

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="hero" style="height: 70vh"></div>

<script type="module">
  import { createMoireScreens } from './beamish/effects/moire-screens/core.js'

  const beat = createMoireScreens(document.querySelector('#hero'))
  beat.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createMoireScreens } from '@/beamish/effects/moire-screens/core'

export function Beat() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const beat = createMoireScreens(host.current, { separation: 3.2 })
    beat.start()
    return () => beat.destroy()
  }, [])

  return <div ref={host} className="absolute inset-0 -z-10" />
}
```

Mount once. Option changes go through `update()` rather than a remount, because
a remount is a new WebGL context and the budget for those is small.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createMoireScreens } from '@/beamish/effects/moire-screens/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let beat: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  beat = createMoireScreens(host.value)
  beat.start()
})

onBeforeUnmount(() => beat?.destroy())
</script>

<template>
  <div ref="host" class="beat" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Do not put text on it

This is the loudest thing in the library and it is loud on purpose: a screen at
thirty per cent coverage is a field of hard-edged dots, and a moire is by
definition a pattern that draws the eye. Nothing is readable over it.

Use it as a full-bleed panel, a section divider, a plate between blocks of
copy. If you need it behind something, drop `coverage` to around 0.12 and raise
`pitch`, which leaves the fringes and takes away most of the ink.

## Two ways to make a beat

`separation` turns the second screen, which gives fringes that run at an angle
to both.

`detune` changes its pitch instead, which gives straight fringes parallel to the
screens. Two screens at the same angle and slightly different pitch is the other
half of the phenomenon and it looks quite different.

A little of both is more interesting than either alone, which is why the
defaults have some of each.

## Cost and how busy it is

Measured at 0.103 mean absolute change per frame on a 0 to 255 scale, which is
in line with MeshGradient at 0.091, and 1.1ms at 640 by 360.

The change per frame is **exactly linear in `drift`**: 0.0514, 0.1028 and 0.2055
for 0.4, 0.8 and 1.6 degrees. If it is too busy, that is the dial, and halving
it halves the motion precisely.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createMoireScreens` from `useEffect`, `onMounted`, or a `client:*`
island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For this item that matters more than most. A drifting moire is exactly the kind
of high-contrast, large-scale movement that triggers discomfort, and the still
frame loses nothing: the fringes are the subject and they are all there in one
frame.

## Common mistakes

1. **Hard-edged screens.** They alias, the aliasing is its own moire against the
   display, and the effect ends up reporting on the monitor. The edge has to be
   softened by one pixel's footprint, no more and no less.

2. **Adding the inks instead of multiplying them.** The overlaps saturate and
   the fringes flatten at the dark end. Two transparent layers pass the product
   of what each passes.

3. **A large `separation`.** Past about fifteen degrees the beat is a fine
   rosette and the effect looks like a texture. The interesting range is one to
   nine.

4. **Putting copy on it.** It is the loudest item here. That is not a defect; it
   is what a moire is.

5. **A fine `pitch` on a high-density display.** Below about three CSS pixels
   the screen is at the limit of what the device can resolve and the result
   starts to depend on the device, which is the one thing this item is built to
   avoid.
