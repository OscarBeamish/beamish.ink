## What it is

AsciiImage sets a photograph in characters, where each cell takes the glyph
whose **shape** fits what is in it rather than the one whose brightness matches.

Every ASCII renderer ever written does the brightness version: order a set of
characters by how much ink they carry, measure the average tone of a cell, look
up the glyph at that position. It works, and it always has the same fault. Edges
come out as mush, because the average tone of a cell sitting on a hard edge is a
midtone, and a midtone glyph is a texture rather than a line. Set a face that
way and the jaw disappears.

So each cell here is measured twice. A Sobel pass gives the direction and
strength of whatever edge runs through it, and where that edge is strong enough
the cell takes a glyph that lies along it: a bar for a vertical edge, a slash
for a diagonal, an underscore for a horizontal. Only the cells with nothing much
going on fall back to the tone ramp.

The picture keeps its contours, which is the whole point.

Two details that are easy to get backwards:

**The glyph lies along the edge, not across it.** A gradient points across an
edge. Using the gradient angle directly gives a picture in which every contour
is drawn at right angles to itself, and it reads as a woven texture rather than
as a drawing.

**The Sobel is taken over neighbouring cells, not neighbouring pixels.** The
question is which way the edge in this cell runs, which is a question about the
picture at the scale of a cell. Measured at pixel scale, a strand of grass fills
the kernel and every cell in the frame comes back as an edge.

## Wiring

**Plain HTML.** The element must contain an `<img>`. It stays in the document,
hidden once the texture is uploaded, so a browser that never runs the script
shows the photograph and a screen reader still reads the alt text.

```html
<div id="plate" style="position: relative; height: 70vh">
  <img src="/plate.jpg" alt="A grass headland falling away to the sea" />
</div>

<script type="module">
  import { createAsciiImage } from './beamish/effects/ascii-image/core.js'

  const typed = createAsciiImage(document.querySelector('#plate'))
  typed.start()
</script>
```

Take the image out of the flow (`position: absolute; inset: 0`). Left in it, the
canvas the effect appends is pushed a full element height down the page, where it
draws perfectly and is never seen. That is worth saying because it looks like the
effect has failed rather than like a layout problem.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createAsciiImage } from '@/beamish/effects/ascii-image/core'

export function Plate({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const typed = createAsciiImage(host.current, { cell: 9 })
    typed.start()
    return () => typed.destroy()
  }, [src])

  return (
    <div ref={host} style={{ position: 'relative' }}>
      <img src={src} alt={alt} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createAsciiImage } from '@/beamish/effects/ascii-image/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let typed: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  typed = createAsciiImage(host.value)
  typed.start()
})

onBeforeUnmount(() => typed?.destroy())
</script>

<template>
  <div ref="host" class="plate">
    <img src="/plate.jpg" alt="A grass headland falling away to the sea" />
  </div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Setting the threshold

`threshold` is the number that decides whether this is the effect or an ordinary
ASCII renderer, and it was set by looking at the result.

At **0.17**, almost every cell claims an edge. The picture becomes a weave of
dashes with no tone in it at all.

At **1.2**, only the hardest boundary in the frame still gets one. The contours
go back to mush and you have the brightness version with extra steps.

At **0.7**, the horizon, the cliff line and the edge of the fog all keep their
character while the grass and the sea stay as tone. That is the default.

The scale is whatever a Sobel over luminance produces, which tops out near 5.6
for a black-to-white step, so these are small numbers by design. If you change
`cell`, check it again: a larger cell averages more of the picture and the
strengths come down with it.

## Choosing a picture

Pick one with long readable edges in it. A coastline, a building, a face in
profile. This effect is about contours, and a photograph of texture alone, a
field of gravel or a close-up of fur, has no contours to find: every cell falls
back to the ramp and you have proved nothing.

`shapes: false` turns the shape-aware half off and leaves a plain brightness
ramp. It is there so you can see the difference once, on your own photograph,
rather than take the claim on trust.

## The type

The glyphs are drawn into a texture atlas in the element's own monospace face,
so the picture is set in the type the page is set in. They are rasterised at
64px and minified on the way down, because a glyph rendered straight into a 9px
cell is four pixels of aliasing.

`glyphs` is the **tone ramp only**, lightest first. The four directional
characters are not an option, because they are not a palette: each one is there
because it lies along one of four angles, and a different character in the same
slot is a character pointing the wrong way.

## Cleanup and SSR

`destroy()` releases the WebGL context and both textures, cancels the RAF,
disconnects both observers, removes every listener, and puts the image's
visibility back. One live context at a time is the budget, so call it.

The photograph renders on the server as an ordinary `<img>`, which is the whole
fallback: if the script never runs, the page shows the picture.

## Accessibility

The alt text on the `<img>` is the accessible version of the picture and it is
left exactly as written. Write it as you would for the photograph, because that
is what the reader is being told about.

A picture made of characters is not text, and no screen reader should be asked
to read it as text. There is nothing in the canvas for assistive technology, by
design.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is after the arrival has finished. The picture is simply there. The
picture is the point; the typing is only how it gets in.

## Common mistakes

1. **Using the gradient angle directly.** It points across the edge. The glyph
   has to lie along it, which is a quarter turn away, and the version without
   the turn looks like a woven cloth.

2. **Sobel at pixel scale.** Every cell comes back as an edge, because at pixel
   scale almost everything is one. The kernel has to step by a cell.

3. **A threshold set by taste rather than by looking.** It is the one number
   here with a narrow right answer, and both failures look plausible on their
   own: a weave of slashes, or an ordinary ASCII picture.

4. **Leaving the image in the flow.** The canvas lands an element height below
   it, draws correctly, and is never seen.

5. **A photograph with no contours.** Gravel, fur, foliage. Every cell falls
   back to the ramp, and the whole reason for the effect goes unused.
