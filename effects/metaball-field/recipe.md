## What it is

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

## Three things that are about cost

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

## The splinter, and what it actually was

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

## Wiring

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

## Getting them to merge and part

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

## It is for a dark ground

Declared `dark`. The shape is carried by a rim light and a highlight against a
near-black fill, and `background` is both the empty part of the frame and what
the body is mixed towards in shadow. On paper you would be setting `background`
to the page colour and lighting a pale blob against it, at which point the rim
has nothing to separate it from.

## Cost and how busy it is

1.1ms at 1280 by 720, against WaterCaustics at 1.00 and DustMotes at 1.20 on
the same run, and 0.360 mean absolute change per frame on a 0 to 255 scale
against WaterCaustics at 0.222.

It reads calmer than that figure, because what is moving is a few large smooth
shapes rather than fine detail, but it is not a quiet item. `period` is the
dial and the change is close to linear in it.

If you need it cheaper, `count` is the first thing to drop and it is linear.
`detail` is second and buys less than it looks, because most rays finish well
short of the ceiling.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createMetaballField` from `useEffect`, `onMounted`, or a `client:*`
island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. A still frame of this is a perfectly good object, which is
not true of every item here.

## Common mistakes

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
