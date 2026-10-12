You are adding **GlassShatter** from Beamish to this project.

> A plate of glass broken over a picture, cracked along the stress rather than into a honeycomb. Surfaces · effect · MIT.
> https://beamish.ink/effects/glass-shatter

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Every shattered-glass effect scatters random sites across the plane and gives each pixel to the nearest one. It produces a honeycomb, and a honeycomb is a dry mud flat rather than a broken window
- A plate struck at a point breaks along the stress, and the stress is radial and circumferential: cracks run out from the impact and other cracks run round it, crossing the first set. The pieces come out roughly four-sided, small near the impact and growing with distance, because the radial cracks fan apart as they travel
- So the lattice is polar rather than square. Sites live in cells of angle by radius, the borders fall along radii and around arcs, and the whole character of real glass comes out of the coordinate system rather than out of any extra work
- The radius goes under a square root. A plain radius gives rings of even spacing, and concentric cracks get further apart as they travel; the root also crowds the inner rings together, which is the zone of fine fragments around the impact that any photograph of a broken window has
- The sector index is taken modulo the sector count when it is hashed, so the cell on one side of angle zero is the same cell as the one on the other side. Without that there is a seam running out from the impact that no amount of jitter hides. The position uses the unwrapped index, so the distance stays continuous across the join
- A site is jittered inside its own cell and capped there, which is the assumption the three by three search rests on. Let a site cross into its neighbour and the nearest site can be two cells away, and the plate tears along the lattice instead of along the cracks
- The second nearest site is where the cracks come from. Halfway between two sites the two distances are equal, so their difference falls to zero, and that difference is a distance to the edge for free
- Not every crack is the same crack. In a struck plate the radial cracks go first and go deepest, because the plate is in tension around the impact; the circumferential ones are secondary, forming between radials that have already gone, and they are shorter and shallower. Drawn at equal weight you get a spider web, which is a thing built outward from a centre rather than a thing broken from one. Which kind a border is can be read straight off its own normal: a radial crack runs along the radius, so its normal points round, and a circumferential one is the other way about
- The picture is sampled a little inside its own edge, because the bend and the drift push the lookup outward and a clamped texture asked past its edge hands back the edge column over and over. At the left and right of the frame that came out as horizontal smears of colour, which reads as a fault in the effect rather than as glass
- And not every circumferential crack forms at all. Weighting them down was not enough: a Voronoi diagram partitions the plane, so every cell is ringed by borders and the arcs close into polygons, which is exactly a spider web's architecture and still read as one at a quarter of the weight. Each border is therefore hashed and the circumferential ones only exist if their number comes up. The key is the pair of cells either side of it, taken with a componentwise min and max so both sides agree and a crack does not appear from one shard and not from its neighbour
- What turns a dark line into a crack is the bright line beside it. A broken edge is a fresh face of glass and it catches the light, so a crack in a photograph is a dark line with a glint along it. That one term is the biggest single difference between this and a drawn grid
- The crack width is in screen pixels, got by dividing the border distance by its own gradient. One lattice unit is a few pixels at the impact and a hundred at the edge of the frame, so a width in lattice units comes out as cracks of wildly uneven thickness. Scaling by fwidth was the first attempt and it is the same mistake in a different hat, because fwidth measures how fast the quantity changes rather than how far away the border is: it gave lines eight pixels thick with a white halo, and the thing came out as a spider web
- The picture bends across the crack and the channels come apart as it bends, which is what a wedge of glass does to light passing through it. The bend follows the gradient of the border distance, which points across the crack rather than along it
- The shard drift slides the picture inside the shard rather than moving the shard, so it is kept small. Past a fraction of a cell it stops reading as a piece that has shifted and starts reading as the wrong piece of the photograph
- The <img> stays in the document, hidden. Its alt text is the accessible version of the picture and a page whose script never runs still shows the photograph
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/glass-shatter/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/glass-shatter/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

GlassShatter breaks a plate of glass over a picture and leaves the pieces in
the frame.

Every version of this effect scatters random sites across the plane and gives
each pixel to the nearest one. The result is a honeycomb, and a honeycomb is
what a dry mud flat looks like. It is not what a broken window looks like, and
once you have noticed that you cannot unsee it.

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `sectors` | number | `29` | 3 to 48 (looks right between 8 and 20) | Radial cracks running out from the impact. A prime number by default and for a reason: with an even count the cracks opposite each other line up through the impact and read as a drawn asterisk rather than as a break. |
| `rings` | number | `9` | 1 to 24 (looks right between 4 and 12) | Concentric cracks running round the impact, counted along the square root of the radius, so they come out close together near the impact and further apart as they go out. At 1 you have radial cracks only, which is a smashed pane rather than a struck one. |
| `jitter` | number | `0.7` | 0 to 0.96 (looks right between 0.5 and 0.9) | How far a site may sit from the middle of its own cell. At 0 the shards are a perfect polar grid, which is a dartboard. The cap is just under 1 and it is load-bearing: a site that crosses into its neighbour's cell breaks the nine-cell search the whole thing rests on, and the plate tears along the lattice. |
| `crack` | number | `1.3` | 0.2 to 8 px (looks right between 1 and 3) | Width of the dark line, in screen pixels. Thin. A crack in glass is a hairline with light on it, and a fat dark line is a drawing of a crack: that is the single most common way this effect is got wrong. |
| `glint` | number | `0.5` | 0 to 2 (looks right between 0.35 and 0.9) | How brightly the fresh edge beside the crack catches the light. The term that does the most work here and the one nobody includes. Set it to 0 once: the cracks stop being cracks and become a grid drawn over the photograph, and no amount of width or refraction brings them back. |
| `gap` | number | `1` | 0 to 4 (looks right between 0.5 and 1.8) | How far each shard shifts, outward from the impact plus a little of its own. This slides the picture inside the shard rather than moving the shard, so it has to stay small: past about 2.5 the pieces stop reading as shifted and start reading as the wrong part of the photograph. |
| `refract` | number | `0.6` | 0 to 4 (looks right between 0.6 and 1.8) | How much the picture bends at a crack. The bend is strongest at the crack and dies away into the middle of the shard, which is where a wedge of glass is thickest and where it is flat. |
| `fringe` | number | `0.6` | 0 to 4 (looks right between 0.5 and 1.8) | How far red and blue come apart as the picture bends. It only happens at the cracks, which is the point: a plate of glass is not a prism, but the wedge at a broken edge is. |
| `facet` | number | `0.16` | 0 to 0.6 (looks right between 0.08 and 0.26) | How far a shard may sit out of the plane of the plate, as a share of its brightness. This is what gives the plate thickness: without it the cracks are lines on a flat picture, and with too much of it the shards read as tiles of different colours. |
| `reach` | number | `0.62` | 0.1 to 2 (looks right between 0.45 and 0.95) | How far the damage carries from the impact, measured in short edges of the element. A strike does not break the whole pane: there is a region of cracks around the impact and intact glass past it, and without that the frame is webbed edge to edge at an even density, which is half of why the honeycomb version of this effect never convinces. Above about 1.4 the whole element is inside the break and this stops doing anything. |
| `arcs` | number | `0.3` | 0 to 1 (looks right between 0.3 and 0.6) | What share of the circumferential cracks actually form. At 1 every one of them is there, and that is the spider web: a Voronoi diagram partitions the plane, so with a radial crack between each pair of neighbours and an arc joining them the architecture is exactly a web, and weighting the arcs down is not enough to fix it. A break is not a partition of the plane, it is a set of curves with ends. At 0 you have radials only, which is a struck pane that has not finished going. |
| `impactX` | number | `0.42` | 0 to 1 | Where the plate was struck, across the element. Off centre on purpose: a break centred in the frame reads as a graphic, and the whole argument for a polar lattice is that the break has a place it came from. |
| `impactY` | number | `0.56` | 0 to 1 | Where the plate was struck, down the element. |
| `impactAt` | number | `0.5` | 0 to 10 s | Seconds of intact glass before it is struck. Worth having at all: the picture whole for half a second is what makes the break an event rather than a texture. |
| `spread` | number | `0.75` | 0.05 to 6 s (looks right between 0.4 and 1.2) | Seconds for the break to open. Quick. Glass does not ease: the cracks arrive at something like a kilometre a second, and anything above about 1.5 here reads as the picture slowly developing a fault. |
| `tint` | color | `#dbe9ff` | any CSS hex | The colour of the light on a fresh edge. Slightly cool, because a fresh break in glass is a green-blue line: that is the iron in it, and it is why the cut edge of a float-glass pane looks green end on. |
| `seed` | number | `7` | 1 to 9999 | Seed for the shards. The same seed gives the same break, which is what makes the take reproducible. |
| `maxDpr` | number | `2` | 1 to 3 | Device pixel ratio ceiling. The crack width is in screen pixels, so this changes what the hairlines cost to draw but not how thick they look. |
| `reducedMotionTime` | number | `4` | 0 to 30 s | The single frame shown when the user prefers reduced motion. For a one-shot break this has to be a time after it has opened, so the plate is simply broken. The broken plate is the point; the breaking is how it gets there. |

## 5. Glass breaks along the stress

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

## 6. Where the cracks come from

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

## 7. The bright line is the whole thing

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

## 8. Tuning it, in order

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

## 9. Choosing a picture

Bright, with saturated colour and at least one long straight line in it.

A crack is only visible where it crosses something. The glint needs bright
ground to sit against, the channel split needs saturated colour to come apart
into, and the bend needs a straight line running through it to be seen bending.
A horizon does all three at once.

A dark or low-contrast photograph hides the lot. The cracks are still there and
you cannot see them, which looks like a broken effect rather than a broken
plate.

## 10. The shards do not fly

`gap` slides the picture *inside* each shard rather than moving the shard, so
it has to stay small. Past about 2.5 the pieces stop reading as shifted and
start reading as the wrong part of the photograph.

Pieces that actually fly apart are a different item and a different technique:
it needs real geometry, because for any pixel you would have to know which
shard landed there, and that is an inverse problem a single fragment pass
cannot answer. This is the plate still in its frame, which is also the version
you can put behind content.

## 11. Accessibility. Do not skip this

The alt text on the `<img>` is the accessible version of the picture and it is
left exactly as written. Write it as you would for the photograph, because that
is what the reader is being told about. There is nothing in the canvas for
assistive technology, by design.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`, which is after the break has opened. The plate is simply
broken. The broken plate is the point; the breaking is how it gets there.

## 12. Cleanup and SSR

`destroy()` releases the WebGL context and the texture, cancels the RAF,
disconnects the observers, removes every listener, and puts the image's
visibility back. One live context at a time is the budget, so call it.

The photograph renders on the server as an ordinary `<img>`, which is the whole
fallback: if the script never runs, the page shows the picture.

## 13. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/glass-shatter/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/glass-shatter/adapters/vue.ts

---

Concept credit: Splitting a layer into shards around a set of sites, opening a crack along each border with the next-nearest shard, and bending and colour-splitting the layer across it, from the Shader Effects library's fracture. Their sites are random; the polar lattice here is the answer to what that looks like, by Shader Effects Inc., https://github.com/shader-effects-inc/shaders.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
