## What it is

GlassShatter breaks a plate of glass over a picture and leaves the pieces in
the frame.

Every version of this effect scatters random sites across the plane and gives
each pixel to the nearest one. The result is a honeycomb, and a honeycomb is
what a dry mud flat looks like. It is not what a broken window looks like, and
once you have noticed that you cannot unsee it.

## Glass breaks along the stress

A plate struck at a point does not break into equal cells. The stress is
**radial and circumferential**, so you get cracks running out from the impact
and other cracks running round it, crossing the first set. The pieces come out
roughly four-sided. They are small near the impact and they grow with
distance, because the radial cracks fan apart as they travel.

All of which is a **polar lattice** rather than a square one. Sites live in
cells of angle by radius, so the borders between them fall along radii and
around arcs, and the entire character of real glass comes out of the coordinate
system. There is no extra work in it: it is the same nine hashes and nine
distances a square Voronoi costs.

Two details in that are load-bearing.

**The radius goes under a square root.** A plain radius gives rings of even
spacing, and concentric cracks in glass get further apart as they travel. The
root also crowds the inner rings together, which is the zone of fine fragments
around the impact that any photograph of a broken window has.

**The angular cell wraps.** The sector index is taken modulo the sector count
when it is hashed, so the cell on one side of angle zero is the same cell as
the one on the other side. Without that there is a seam running out from the
impact that no amount of jitter will hide. The *position* uses the unwrapped
index, so the distance stays continuous across the join.

## Where the cracks come from

The distance to the nearest site says how far you are from a site, which is no
use. The second nearest gives the border away: halfway between two sites the
two distances are equal, so their difference falls to zero, and that difference
is a distance to the edge for free.

**The width is in screen pixels, got by dividing the border distance by its own
gradient.** One lattice unit is a few pixels at the impact and a hundred at the
edge of the frame, so a width in lattice units comes out as cracks of wildly
uneven thickness. Scaling by `fwidth` was the first attempt here and it is the
same mistake in a different hat, because `fwidth` measures how fast the
quantity changes rather than how far away the border is: it gave eight-pixel
lines with a white halo round them and the whole thing came out as a spider web.
Dividing a distance by the steepness of its field is the standard way to
normalise one, and it gives a number in pixels that means the same thing
everywhere in the frame.

## The bright line is the whole thing

A dark line is a drawing of a crack. What turns it into a crack is the bright
line beside it: a broken edge is a fresh face of glass, it catches the light,
and a crack in a photograph is always a dark line with a glint along it.

**Set `glint: 0` once.** The cracks stop being cracks and become a grid drawn
over the photograph, and no amount of width or refraction brings them back. It
is the term nobody includes and it does more than the rest put together.

Two more carry the remainder:

**The picture bends at the crack and its channels come apart as it bends**,
which is what a wedge of glass does to light passing through it. The bend
follows the gradient of the border distance, which points *across* the crack
rather than along it, and it dies away into the middle of the shard, where a
wedge is thickest and where it is flat.

**Whole shards sit a shade off their neighbours**, from being tilted a degree
out of the plane of the plate. That is `facet`, and it is what gives the thing
thickness. Without it the cracks are lines on a flat picture.

## Wiring

**Plain HTML.** The element must contain an `<img>`. It stays in the document,
hidden once the texture is uploaded, so a browser that never runs the script
shows the photograph and a screen reader still reads the alt text.

```html
<div id="pane" style="position: relative; height: 70vh">
  <img src="/plate.jpg" alt="A ridge against a bright sky" />
</div>

<script type="module">
  import { createGlassShatter } from './beamish/effects/glass-shatter/core.js'

  const pane = createGlassShatter(document.querySelector('#pane'))
  pane.start()
</script>
```

Take the image out of the flow (`position: absolute; inset: 0`). Left in it,
the canvas the effect appends is pushed a full element height down the page,
where it draws perfectly and is never seen. That is worth saying because it
looks like the effect has failed rather than like a layout problem.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createGlassShatter } from '@/beamish/effects/glass-shatter/core'

export function Pane({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pane = createGlassShatter(host.current, { impactX: 0.42 })
    pane.start()
    return () => pane.destroy()
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
import { createGlassShatter } from '@/beamish/effects/glass-shatter/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pane: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pane = createGlassShatter(host.value)
  pane.start()
})

onBeforeUnmount(() => pane?.destroy())
</script>

<template>
  <div ref="host" class="pane">
    <img src="/plate.jpg" alt="A ridge against a bright sky" />
  </div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and
works from a plain `<script>` in the page.

## Tuning it, in order

1. **`impactX` and `impactY`.** Put the impact somewhere, off centre. A break
   centred in the frame reads as a graphic, and the whole argument for a polar
   lattice is that the break came from a place.
2. **`sectors` and `rings`.** How many cracks out and how many round. Keep
   `sectors` odd: with an even count the cracks opposite each other line up
   through the impact and read as a drawn asterisk.
3. **`crack`.** Thin. A crack in glass is a hairline, and a fat dark line is a
   drawing of one.
4. **`glint`.** See above. This is the one.
5. **`refract`, `fringe`, `facet`, `gap`.** Small. Each is something you notice
   once and then stop seeing, which is the right amount.

## Choosing a picture

Bright, with saturated colour and at least one long straight line in it.

A crack is only visible where it crosses something. The glint needs bright
ground to sit against, the channel split needs saturated colour to come apart
into, and the bend needs a straight line running through it to be seen bending.
A horizon does all three at once.

A dark or low-contrast photograph hides the lot. The cracks are still there and
you cannot see them, which looks like a broken effect rather than a broken
plate.

## The shards do not fly

`gap` slides the picture *inside* each shard rather than moving the shard, so
it has to stay small. Past about 2.5 the pieces stop reading as shifted and
start reading as the wrong part of the photograph.

Pieces that actually fly apart are a different item and a different technique:
it needs real geometry, because for any pixel you would have to know which
shard landed there, and that is an inverse problem a single fragment pass
cannot answer. This is the plate still in its frame, which is also the version
you can put behind content.

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
`reducedMotionTime`, which is after the break has opened. The plate is simply
broken. The broken plate is the point; the breaking is how it gets there.

## Common mistakes

1. **A square lattice.** Random sites on a grid give a honeycomb. Glass breaks
   radially and circumferentially, and the lattice is the whole item.

2. **No glint.** The commonest failure, and the one that makes every other
   version of this effect look like a grid over a photograph.

3. **A fat crack.** A hairline with light on it is a crack. Four pixels of
   black is a drawing.

4. **An even sector count.** The opposite cracks line up through the impact and
   the thing reads as an asterisk.

5. **Jitter past the cap.** A site that crosses into its neighbour's cell
   breaks the nine-cell search, the nearest site can be two cells away, and the
   plate tears along the lattice rather than along the cracks.

6. **A width in lattice units.** One lattice unit is a different number of
   pixels in each direction and at each radius, so the cracks come out thick in
   the middle and invisible at the edges.

7. **A dark photograph.** Everything works and nothing is visible.
