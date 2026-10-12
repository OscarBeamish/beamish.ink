## What it is

DitherImage reduces a photograph to two tones by **error diffusion**, which is
the kind of dither a shader cannot do.

Every dithering effect on the web is an *ordered* dither: a fixed matrix of
thresholds, usually Bayer's, compared against the picture one pixel at a time.
That is not a stylistic choice, it is the only kind a fragment shader can do. A
fragment shader has to answer for one pixel without knowing anything about its
neighbours, and ordered dithering is the only dither with that property.

Error diffusion is the other kind, and it is the one that looks like something.
Quantise a pixel, work out how much tone you threw away, and hand that error to
the pixels you have not reached yet. The grain then **follows the subject**
rather than lying across it as a crosshatch. It is also strictly sequential:
every pixel depends on the ones before it, so there is no way to write it
per-pixel and no way to put it on a GPU.

Switch `mode` to `ordered` once. The difference is not subtle and it is the
whole argument for this item existing.

## So it runs on the CPU, and not at the frame rate

The look is coarse anyway. A Macintosh screen was 512 by 342 for the entire
desktop. But coarse does not mean *big*: the first version of this item shipped
with a six-pixel dot and it was mush, big soft squares with the subject lost in
them. A three-pixel dot is a legible one-bit photograph, which is the point.

The reason it shipped wrong is worth stating, because it is the kind of mistake
that is easy to make and hard to notice. The pass costs four times as much each
time the dot halves, and at sixty frames a second a three-pixel dot was
unaffordable. So the dot got coarser to fit the budget, which is solving the
wrong problem.

**The fix is that the dither does not run at the frame rate.** Time is
quantised to `rate` steps a second and the pass only runs when the step
changes. Every other frame redraws the plate it already has, which is one
scaled `drawImage` and costs 0.003ms. Three things come out of that:

- **The dots can be as fine as they should be.** Eight passes a second instead
  of sixty is near enough an eighth of the work, so a three-pixel dot now costs
  less than a six-pixel one used to.
- **It is what a one-bit display did.** A Macintosh did not re-dither its screen
  sixty times a second. The bitmap sat there until something changed it.
- **The boil stops being static.** See below.

It is still pure in `t`, because the step is a function of `t` alone, so the
recorder seeks to the same frame every time.

Measured in the page at 1280 by 720: the pass is 12.6ms at `dot: 2`, 4.8 at 3,
2.7 at 4, 1.2 at 6. At `dot: 2` that is a dropped frame every time it runs,
which is why 3 is the default and 2 is the edge rather than the aim.

## The three things everybody gets wrong

**Do not dither in linear light.** This is a trap, and the first version of
this item fell straight into it.

The argument for linear is good as far as it goes. A half-and-half field of
black and white dots averages, in the eye, to half the light, and light adds
linearly. So convert the picture out of its gamma encoding, dither there, and
the dots reproduce the scene's actual luminance.

They do, and it comes out far too dark. A mid grey is 128, which is 0.50
encoded and 0.22 linear, so dithering in linear lays down 22 per cent white
dots where the photograph says 50 per cent grey. Most of the frame goes solid,
and the first render here had two thirds of the picture as flat ink.

The flaw in the argument is that **a photograph is not a scene**. It has
already been tone-mapped for a display, and the display's own gamma is what
turns it back into light. Undoing that encoding and dithering underneath it
undoes the tone mapping with it. The quantity to preserve is the one the
picture is stored in, which is why every implementation since 1976 works on the
bytes as they come, and why this one does too.

**Atkinson throws a quarter of the error away.** Floyd and Steinberg pass all of
it, over four neighbours. Atkinson passes six eighths over six, and the missing
two eighths is not an oversight. Losing error pulls flat areas towards whichever
tone they were nearest, so highlights go clean white and shadows go clean black.
That is the whole reason the Macintosh look reads as contrasty rather than as a
field of grey speckle. Switch to `floyd` and the picture holds more midtone and
goes noticeably greyer and flatter.

**Scan alternate rows backwards.** Always going left to right drags the error
one way, and in a smooth gradient that comes out as diagonal streaks running
down and to the right. A serpentine scan cancels the drag. The kernel has to be
mirrored with it, so a backwards row pushes its error the way it is travelling
rather than back over ground it has already covered.

Turn `serpentine` off once, on a sky. The streaks are not subtle, and that is
why it is an option rather than hard-coded.

## What moves, and why slowly

The exposure swells, a whole number of cycles over the period, so the loop
closes.

That is enough and more than enough, because **animated error diffusion boils**.
The error propagates, so lifting the exposure by a hair flips one pixel, which
changes what every pixel after it inherits, and whole runs of grain reorganise
at once. Fast, it looks like television static. Slow, it looks like film grain
on a plate that is breathing, which is the one kind of motion this technique is
any good at.

`rate` is the other half of it. At sixty passes a second the boil is television
static; at eight it reads as grain. Lower the rate and raise the swell for
something that looks like a plate being developed, but keep both modest: this
technique has one good kind of motion and it is subtle.

`swell: 0` holds it still, and then the item draws one frame and stops.

## No WebGL context

This is a 2D canvas. It is the one image item here that costs nothing against
the sixteen-million-pixel budget, so it can sit on a page beside a shader
without competing with it for the one live context.

## Wiring

**Plain HTML.** The element must contain an `<img>`. It stays in the document,
hidden once the picture has been sampled, so a browser that never runs the
script shows the photograph and a screen reader still reads the alt text.

```html
<div id="plate" style="position: relative; height: 70vh">
  <img src="/plate.jpg" alt="A grass headland falling away to the sea" />
</div>

<script type="module">
  import { createDitherImage } from './beamish/effects/dither-image/core.js'

  const plate = createDitherImage(document.querySelector('#plate'))
  plate.start()
</script>
```

Take the image out of the flow (`position: absolute; inset: 0`). Left in it,
the canvas the effect appends is pushed a full element height down the page,
where it draws perfectly and is never seen. That is worth saying because it
looks like the effect has failed rather than like a layout problem.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createDitherImage } from '@/beamish/effects/dither-image/core'

export function Plate({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const plate = createDitherImage(host.current, { dot: 4 })
    plate.start()
    return () => plate.destroy()
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
import { createDitherImage } from '@/beamish/effects/dither-image/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let plate: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  plate = createDitherImage(host.value)
  plate.start()
})

onBeforeUnmount(() => plate?.destroy())
</script>

<template>
  <div ref="host" class="plate">
    <img src="/plate.jpg" alt="A grass headland falling away to the sea" />
  </div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Two details in the sampling

**The source goes through a canvas the size of the grid**, so the browser's own
downscaler does the averaging. Taking one source pixel per dot instead aliases
badly: a picture of foliage comes back as noise rather than as tone, and no
amount of tuning the dither recovers it.

**Image smoothing is off for the scale-up.** With it on, the browser
interpolates the two tones back into the greys the dither existed to avoid, and
you get a slightly noisy photograph instead of a one-bit picture.

## Choosing a picture

One with real tone in it: a long soft gradient somewhere, a sky, a wall in
raking light, skin.

Error diffusion is about tone, and a gradient is both where the grain organises
itself into something that follows the subject and where every mistake shows.
The diagonal streaking is invisible on foliage and unmissable on a sky, and so
is the shadow crush you get from dithering in gamma-encoded light.

## Cleanup and SSR

`destroy()` cancels the RAF, disconnects the observers, removes every listener
and puts the image's visibility back. There is no WebGL context to release,
because this item never takes one.

The photograph renders on the server as an ordinary `<img>`, which is the whole
fallback: if the script never runs, the page shows the picture.

## Accessibility

The alt text on the `<img>` is the accessible version of the picture and it is
left exactly as written. Write it as you would for the photograph, because that
is what the reader is being told about. There is nothing in the canvas for
assistive technology, by design.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. Which frame hardly matters: the swell is the only thing
that moves, so it is a choice of exposure and nothing else.

## Common mistakes

1. **Converting to linear light first.** It is the physically principled thing
   to do and it is wrong, because the picture has already been tone-mapped. It
   comes out far too dark and it looks like an exposure problem, which sends
   you to the exposure control instead of to the cause.

2. **Shipping an ordered dither and calling it a dither.** It is the only kind a
   shader can do, and it lies across the picture rather than in it.

3. **Scanning every row the same way.** The error drags, and a smooth sky comes
   out with diagonal streaks in it.

4. **Forgetting to mirror the kernel on a backwards row.** The scan reverses and
   the error keeps being pushed right, so the serpentine makes the streaking
   worse rather than better.

5. **Leaving image smoothing on.** The two tones are interpolated back into
   greys and the whole thing is for nothing.

6. **Animating it quickly.** Error diffusion boils, and at speed it is
   television static.

7. **Running it at device resolution.** One dot per pixel is thirty times the
   work, and it does not look like a dither any more because the dots are below
   the size at which you can see them.
