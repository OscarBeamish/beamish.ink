## What it is

CrtScreen puts a picture on a tube instead of on a panel.

Almost every version of this is scanlines: a dark stripe every other row, drawn
over the image, done. It never works, and the reason is easy to state. A flat
rectangle with horizontal stripes on it is a flat rectangle with horizontal
stripes on it. Nothing about stripes says cathode ray tube.

What says cathode ray tube is a short list of things that have to be there
together, and most of them are not the scanlines.

**The glass is curved.** The picture bows outward, straight lines near the edges
bend, and the corners pull in. This is the one that does the work. Set `curve`
to 0 and every other setting here stops helping; set it to 0.12 and the item is
most of the way there before the grille has drawn a single stripe.

**The phosphors are in columns.** A tube has an aperture grille: red, green and
blue stripes side by side, which is why a white area in a photograph of a CRT is
never white when you get close to it. The scanlines are the rows. The grille is
the columns. It is the columns that stop the rows reading as a venetian blind,
and you can check that by setting `grille: 0` and watching the thing collapse
back into an image with stripes on it.

**The beam overshoots.** A bright area bleeds into what is next to it, because
the electron beam does not stop where the signal does.

**The channels do not land on each other.** Convergence is never perfect, so red
and blue sit a fraction either side of green, and the error grows towards the
corners because that is where the deflection coils are working hardest.

**The tube is dim at the edges, and a bar rolls down it**, from the signal and
the mains being very slightly out of step.

The bezel is drawn in the shader rather than in CSS, because the bezel is
defined as whatever falls outside the bent picture. A CSS frame cannot know
where that is.

## What moves

The bar, once per `period`, and nothing else.

The scanlines and the grille are fixed to the glass and do not move, because
they are the screen rather than the picture. Animate them and the whole thing
reads as a pattern sliding over a photograph, which is the second most common
way to get this wrong.

`renderAtTime(t)` is pure in `t` and the loop closes exactly on the period, so
the last frame is the first frame.

## Wiring

**Plain HTML.** The element must contain an `<img>`. It stays in the document,
hidden once the texture is uploaded, so a browser that never runs the script
shows the photograph and a screen reader still reads the alt text.

```html
<div id="tube" style="position: relative; height: 70vh">
  <img src="/plate.jpg" alt="A street at night, lit signs against a black sky" />
</div>

<script type="module">
  import { createCrtScreen } from './beamish/effects/crt-screen/core.js'

  const tube = createCrtScreen(document.querySelector('#tube'))
  tube.start()
</script>
```

Take the image out of the flow (`position: absolute; inset: 0`). Left in it, the
canvas the effect appends is pushed a full element height down the page, where
it draws perfectly and is never seen. That is worth saying because it looks like
the effect has failed rather than like a layout problem.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createCrtScreen } from '@/beamish/effects/crt-screen/core'

export function Tube({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const tube = createCrtScreen(host.current, { curve: 0.12 })
    tube.start()
    return () => tube.destroy()
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
import { createCrtScreen } from '@/beamish/effects/crt-screen/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let tube: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  tube = createCrtScreen(host.value)
  tube.start()
})

onBeforeUnmount(() => tube?.destroy())
</script>

<template>
  <div ref="host" class="tube">
    <img src="/plate.jpg" alt="A street at night, lit signs against a black sky" />
  </div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Tuning it, in order

Set them in this order, because each one changes what the next one looks like.

1. **`curve`.** Everything rests on it. 0.12 is about a late consumer set:
   obvious at the corners, unremarkable in the middle. By 0.35 it is a fish-eye.
2. **`grille` and `mask`.** `grille` is the pitch, 3 device pixels per cell so
   three subpixels fit across it. `mask` is how hard the stripes are drawn, and
   it is the one that decides whether this reads as a tube or as a mesh over a
   photograph. See below.
3. **`brightness` and `contrast`.** The rows and columns together take roughly a
   quarter of the light, which is why brightness sits above 1 rather than at it.
4. **`scanline`.** The number everybody reaches for first and the one that
   matters least. Past 0.6 the picture is half black.
5. **`converge`, `bloom`, `vignette`, `roll`.** Small numbers. Each of these is
   something you notice once and then stop seeing, which is the correct amount.

## The grille is in device pixels

Not CSS pixels. A grille is a physical thing on the front of a tube, so on a
denser display it should get finer rather than staying the same size in points.
That also means `maxDpr` changes how the item looks and not only what it costs.

## The mask, and why it is not at full strength

The stripes are lifted towards white before they are multiplied in, and by a
long way: `mask` at the default of 0.55 draws them as a tint over the picture
rather than as stripes.

That is not a softening for taste. Multiply a pure red-green-blue mask straight
over an image and two thirds of every cell goes to black. Worse, at three device
pixels a cell is below the size at which a stripe can be drawn cleanly, so once
the browser is scaling the canvas at all, what reaches the eye is not a grille
but coloured noise, and the picture goes muddy underneath it.

A real tube does look like the full-strength version. From an inch away. `mask:
1` is that view and it is worth setting once, nose against the screen, because
after that the default stops looking like a compromise and starts looking like
the right distance.

## Choosing a picture

Something with bright saturated areas and real black in it. Signage at night,
a title card, a lit face against a dark room.

A flat daylight photograph hides the entire effect. The vignette has nothing to
darken, the bloom has nothing to spill, the convergence error has no hard white
edge to show on, and the grille's lift in the shadows has no shadows to lift.
You will have built all of it and be able to see none of it.

Crop to 4:3 if you can. It is the shape of the thing.

## Behind text

Turn `roll` to 0 and drop `scanline` to about 0.15. The bar passing under a
paragraph is a moving luminance change behind reading text, which is the one
thing in this item worth being careful about, and with `roll: 0` the whole
effect becomes a still: no loop runs and nothing moves at all.

## Cleanup and SSR

`destroy()` releases the WebGL context and the texture, cancels the RAF,
disconnects the observers, removes every listener, and puts the image's
visibility back. One live context at a time is the budget, so call it.

The photograph renders on the server as an ordinary `<img>`, which is the whole
fallback: if the script never runs, the page shows the picture.

## Accessibility

The alt text on the `<img>` is the accessible version of the picture and it is
left exactly as written. Write it as you would for the photograph, because that
is what the reader is being told about. There is nothing in the canvas for
assistive technology, by design.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. Which frame hardly matters: the bar is the only thing that
moves, and the tube is the point.

## Common mistakes

1. **Scanlines and nothing else.** The most common version of this effect and
   the one that never convinces. Without the curve it is an image with stripes
   on it.

2. **Animating the scanlines.** They are part of the screen, not part of the
   picture. Sliding them turns the item into a pattern moving over a photograph.

3. **Drawing the grille at full strength.** Two thirds of every cell goes black,
   and at a three-pixel pitch on a canvas the browser is scaling, the stripes
   alias into coloured noise. `mask` is the lift that fixes both.

4. **A scanline count that matches the display.** Broadcast was 576 visible
   lines in Europe and 480 in America, and at either of those on a dense screen
   the rows fall below a pixel and alias into a moire. 200 is low on purpose.

5. **A flat daylight photograph.** Every part of the effect needs bright things
   next to dark things, and there are none.

6. **Leaving the image in the flow.** The canvas lands an element height below
   it, draws correctly, and is never seen.
