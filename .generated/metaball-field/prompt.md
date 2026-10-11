You are adding **MetaballField** from Beamish to this project.

> Blobs that merge and part, raymarched from a distance field rather than modelled. Backdrops · effect · MIT.
> https://beamish.ink/effects/metaball-field

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- There is no geometry. The scene is a function that answers how far the nearest surface is, and the picture is made by stepping a ray forward by exactly that much. That is why the blobs can merge at all: two meshes cannot flow into one another without somebody rebuilding the mesh, while two distance fields merge by taking the smaller of the two
- The softening of that minimum is the whole item. A plain min gives two spheres that interpenetrate with a visible crease; blending over a band leaves a fillet, and the neck and pinch it produces are what read as liquid
- The ray skips straight to a bounding sphere around the swarm and a ray that misses it is abandoned on the spot. On a backdrop most of the frame is empty, and without this every one of those pixels runs the full march to find nothing
- The march breaks on a hit rather than running to the step count. Sphere tracing converges quickly once it is close, so a typical hit costs a dozen steps where the ceiling is fifty
- Normals come from the tetrahedron trick, four samples rather than the six a central difference would take. On a surface this smooth there is nothing to see in the difference
- Blob paths are circles with whole numbers of turns per period, so the loop closes exactly and nothing is integrated between frames
- Built for a dark ground and declared as one. The blobs are lit against the page, and on paper the background fill would have to become the page colour, at which point the rim light has nothing to separate it from
- The hit threshold grows with distance, because a pixel does. A ray is a cone and the patch of world one pixel covers widens along it, so a constant epsilon fails exactly the rays that graze a silhouette: the march crawls towards a surface it never formally reaches and draws a thin dark splinter along the edge of a lobe. Twice the step count only made it smaller; scaling the threshold takes it to a hairline for nothing
- The march steps three quarters of what the field reports, because a smooth minimum is not a true lower bound on the distance: it rounds the join outwards, so near a fillet the value overestimates how far there is to go
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/metaball-field/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/metaball-field/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

MetaballField is a handful of blobs that merge and part, raymarched.

There is no geometry in it. The scene is a function: hand it a point in space
and it returns the distance to the nearest surface. The picture is made by
walking a ray forward by whatever that function says is safe, over and over,
until it arrives at something. That is sphere tracing.

It is done this way because of what it buys. Two meshes cannot flow into one
another without somebody rebuilding the mesh; two distance fields merge by
taking the smaller of the two, which is one line. Soften that minimum and the
join becomes a fillet, and the neck and pinch you get out of it are the whole
reason this reads as something liquid rather than as spheres parked in the same
place.

`blend` is that softening. At 0 the blobs interpenetrate with a visible crease
where they cross and the illusion is gone.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="hero" style="height: 70vh"></div>

<script type="module">
  import { createMetaballField } from './beamish/effects/metaball-field/core.js'

  const blobs = createMetaballField(document.querySelector('#hero'))
  blobs.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createMetaballField } from '@/beamish/effects/metaball-field/core'

export function Blobs() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const blobs = createMetaballField(host.current, { count: 7 })
    blobs.start()
    return () => blobs.destroy()
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
import { createMetaballField } from '@/beamish/effects/metaball-field/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let blobs: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  blobs = createMetaballField(host.value)
  blobs.start()
})

onBeforeUnmount(() => blobs?.destroy())
</script>

<template>
  <div ref="host" class="blobs" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `background` | color | `#0d0f14` | any CSS hex | Behind the blobs. Nothing is drawn there, so it is a flat fill, and it is also what the body colour is mixed towards in shadow. |
| `body` | color | `#1d4f63` | any CSS hex | The body, seen where a surface faces the camera. Keep it close to the background in value: the shape is carried by the rim and the highlight, and a body that is much lighter flattens both. |
| `light` | color | `#f0b67f` | any CSS hex | The light, seen in the rim and the highlight. Warm against a cool body is what gives the surface somewhere to turn through. |
| `count` | number | `7` | 1 to 9 (looks right between 4 and 7) | How many blobs. Along with detail, this is the cost: the distance function asks about every one of them at every step of every ray. |
| `radius` | number | `0.42` | 0.1 to 1.2 (looks right between 0.35 and 0.6) | Blob radius in scene units, where the swarm is about two units across. Large enough and they never part, which loses the thing worth watching. |
| `blend` | number | `0.6` | 0 to 1.5 (looks right between 0.3 and 0.8) | Width of the fillet where two blobs meet. At 0 they interpenetrate with a visible crease and read as two balls at the same address. Past about 1 they are one lump that never separates. |
| `orbit` | number | `1` | 0 to 1.6 (looks right between 0.5 and 1) | How far the blobs travel from the centre. This and radius together decide whether they ever actually part. |
| `detail` | number | `48` | 8 to 96 (looks right between 32 and 64) | Ceiling on raymarching steps. The thin necks between separating blobs are the first thing to go when this is low, and they are the part worth keeping. Most rays finish well short of the ceiling. |
| `shine` | number | `0.55` | 0 to 2 (looks right between 0.3 and 0.9) | How hard the highlight is. At 0 the surface is matte and reads as clay rather than as liquid. |
| `period` | number | `40` | 8 to 120 s (looks right between 24 and 60) | Seconds for one cycle. Every blob travels a whole number of turns in it, so they are all exactly where they started and the loop has no join. |
| `seed` | number | `2` | 0 to 9999 | Seed for the orbits and phases. Two of these side by side want two seeds. |

## 5. Three things that are about cost

A raymarcher pays per pixel for every step it takes and every blob it asks
about, so a naive one is the most expensive thing you can put on a page. This
one measures at 1.1ms, which is cheaper than several of the flat shader
backdrops here, and it is cheap for three reasons rather than because it is
doing less.

**The bounding sphere.** The swarm reaches a known distance from the origin and
everything outside that is empty. The ray is advanced straight to it, and a ray
that misses it is abandoned immediately. On a backdrop most of the frame is
empty, so most pixels never enter the march at all.

**The march breaks on a hit.** Sphere tracing converges fast once it is close,
so a typical hit costs about a dozen steps where `detail` allows fifty.

**Four samples for a normal, not six.** The tetrahedron trick. On a surface
this smooth there is nothing to see in the difference.

## 6. The splinter, and what it actually was

An early version drew a thin dark crack along the edge of a lobe. It looked
like the ray was stepping through the surface, which is the usual sin when a
smooth minimum is involved: `smin` rounds the join outwards, so near a fillet
it overestimates how far there is to go and is not a true lower bound. Stepping
three quarters of the reported distance is the standard guard and it is in
here.

That was not the cause. Doubling the step count only made the splinter smaller,
which is the signature of a different problem: **rays that graze a silhouette**.
There the field flattens out, the march crawls towards a surface it never
formally reaches, and it runs out of steps still just outside.

The fix is to notice that a ray is a cone rather than a line. The patch of the
world one pixel covers gets wider the further along it you look, so a surface
closer than that patch is a surface the pixel has already hit. The hit
threshold grows with distance for that reason, and the splinter drops to a
hairline for no cost at all.

## 7. Getting them to merge and part

Three settings decide this between them and they have to be set together:
`radius`, `orbit` and `blend`.

The blobs travel `orbit` from the centre and are `radius` across. If
`2 × radius` is comfortably more than the distances they get to, they never
separate and you have one lump that changes shape. If it is much less, they
never touch and you have spheres. The defaults sit where they do both in a
cycle, which is the interesting state.

`blend` then decides what the meeting looks like. Around a half to two thirds of
`radius` gives a proper neck. Much more and the pair never visibly separates
even when the centres do.

## 8. It is for a dark ground

Declared `dark`. The shape is carried by a rim light and a highlight against a
near-black fill, and `background` is both the empty part of the frame and what
the body is mixed towards in shadow. On paper you would be setting `background`
to the page colour and lighting a pale blob against it, at which point the rim
has nothing to separate it from.

## 9. Cost and how busy it is

1.1ms at 1280 by 720, against WaterCaustics at 1.00 and DustMotes at 1.20 on
the same run, and 0.360 mean absolute change per frame on a 0 to 255 scale
against WaterCaustics at 0.222.

It reads calmer than that figure, because what is moving is a few large smooth
shapes rather than fine detail, but it is not a quiet item. `period` is the
dial and the change is close to linear in it.

If you need it cheaper, `count` is the first thing to drop and it is linear.
`detail` is second and buys less than it looks, because most rays finish well
short of the ceiling.

## 10. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createMetaballField` from `useEffect`, `onMounted`, or a `client:*`
island.

## 11. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. A still frame of this is a perfectly good object, which is
not true of every item here.

## 12. The three mistakes most likely to be made here

1. **`blend` at or near 0.** The blobs interpenetrate with a visible crease and
   the whole point of doing this with distance fields is thrown away.

2. **A body colour much lighter than the background.** The form is carried by
   the rim and the highlight. Raise the body and you flatten both, and what is
   left is a silhouette.

3. **`radius` and `orbit` set without reference to each other.** Too much
   radius and they never part; too much orbit and they never meet. The item is
   the transition.

4. **Treating `detail` as the quality dial.** It is a ceiling, not a count.
   Most rays are nowhere near it, and raising it mostly buys thin necks you
   were not looking at.

5. **Putting it behind copy at the defaults.** The shapes are large, light and
   slow, which is exactly the kind of movement that pulls an eye off a line of
   text. Lengthen `period` and bring `body` closer to `background`.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/metaball-field/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/metaball-field/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
