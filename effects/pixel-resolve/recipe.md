## What it is

PixelResolve brings a picture in out of big blocks, the way one used to arrive
over a slow connection.

## Why it is not just a shrinking block size

The obvious version is three lines: quantise the coordinate, sample once per
block, step the block size down over time. It has two faults and you can see
both of them immediately.

**It jumps.** A block has to be a whole number of pixels, or the blocks come
out uneven and the grid shimmers. So stepping the size gives you four or five
visible lurches with nothing in between. The fix is to treat the sizes as a
*ladder* and crossfade between two rungs: at any moment two block sizes are in
flight and the picture is mixing from one to the other. That is what turns a
set of steps into an arrival.

**It point samples.** One pixel out of each block is not the block. Anything
thinner than a block — a cable, a sign, a highlight — vanishes completely at
large sizes and pops back at small ones, so the picture flickers instead of
resolving.

**Average across the block instead.** That is what a mipmap is for, and it is
what keeps a subject legible when it is eight pixels across. It costs `taps`
squared samples per block, and dropping `taps` to 1 brings the flicker
straight back, which is a quick way to see what the average is doing.

## The blocks do not arrive together

A picture that sharpens evenly reads as **a lens being focused**. One that
arrives in patches reads as **data landing**. They are completely different
things and only the second one is interesting.

So each block gets its own moment, hashed from the block rather than taken from
its position, so the order is scattered rather than sweeping. `scatter: 0`
turns it back into a focus pull if you want to see the difference.

## Fewer colours early

A picture arriving over a slow line lost its palette as well as its resolution.
Without that, the big blocks are a smooth gradient, which no slow format ever
actually produced. `levels` starts low and climbs back to the full range by the
end.

## The ladder is in CSS pixels

Not device pixels. A block measured in device pixels is half the size on a
retina screen, which is the opposite of what a block is for: the whole point is
that it is a visible chunk, and it should be the same visible chunk everywhere.

## Wiring

**Plain HTML.** The element must contain an `<img>`. It stays in the document,
hidden once the texture is uploaded, so a browser that never runs the script
shows the photograph and a screen reader still reads the alt text.

```html
<div id="plate" style="position: relative; height: 70vh">
  <img src="/plate.jpg" alt="A street at night under lit signs" />
</div>

<script type="module">
  import { createPixelResolve } from './beamish/effects/pixel-resolve/core.js'

  const plate = createPixelResolve(document.querySelector('#plate'))
  plate.start()
</script>
```

Take the image out of the flow (`position: absolute; inset: 0`). Left in it,
the canvas is pushed a full element height down the page, where it draws
perfectly and is never seen.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createPixelResolve } from '@/beamish/effects/pixel-resolve/core'

export function Plate({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const plate = createPixelResolve(host.current, { coarse: 64 })
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

**Vue.** Slot the picture in; the component hides it and uses it as a texture.

**Astro.** Nothing extra is required. The core is a standard ES module.

## Tuning it

1. **`coarse`.** Where the picture starts, and whether the opening frame is a
   recognisable subject or an abstract. At 64 a face is still a face; at 160 it
   is four rectangles.
2. **`duration`.** Slow enough that each rung of the ladder is visible is the
   whole point. Under about a second it reads as a glitch rather than as
   something loading.
3. **`scatter`.** Patches or a focus pull. See above.
4. **`taps`.** Quality and cost. Set it to 1 once to see the flicker the
   average exists to prevent.
5. **`levels`.** How much of the slow-connection character you want. Low is
   closer to a GIF; high is closer to a photograph that happens to be blocky.

## Choosing a picture

One with big shapes and strong contrast. Pixelation keeps whatever survives
being averaged into a block, so a frame with bold shapes still reads at eight
pixels across while a frame of fine texture turns to mud.

Signage, a face, a silhouette, anything graphic. A field of foliage is the
worst case: every block averages to the same green and the arrival has nothing
to arrive at.

## Cleanup and SSR

`destroy()` releases the WebGL context and the texture, cancels the RAF,
disconnects the observers, removes every listener and puts the image's
visibility back. One live context at a time is the budget, so call it.

The photograph renders on the server as an ordinary `<img>`, which is the whole
fallback: if the script never runs, the page shows the picture.

## Accessibility

The alt text on the `<img>` is the accessible version of the picture and it is
left exactly as written. There is nothing in the canvas for assistive
technology, by design.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`, which is after the arrival has finished. The picture is
simply there.

## Common mistakes

1. **Stepping the block size.** Four or five visible lurches. Two sizes have to
   be in flight at once and crossfading.

2. **Point sampling the block.** Thin bright things vanish and reappear, and
   the picture flickers rather than resolving.

3. **A block size that is not a whole number of pixels.** The grid shimmers,
   because some blocks round up and their neighbours round down.

4. **Measuring blocks in device pixels.** They come out half the size on a
   retina screen, which is backwards: a block is meant to be a visible chunk.

5. **No scatter.** It becomes a focus pull, which is a different effect and a
   duller one.

6. **A picture of texture.** Every block averages to the same colour and there
   is nothing to resolve into.
