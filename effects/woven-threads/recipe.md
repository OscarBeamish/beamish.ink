## What it is

WovenThreads is cloth. Warp threads one way, weft the other, and at every
crossing one of them is on top.

That last clause is the whole thing. Every version of this effect draws two sets
of lines crossing, which is a grid: the threads pass through each other and the
surface has no structure at all. What makes cloth cloth is the interlacing, and
the interlacing is **one comparison per crossing**.

Change that comparison from alternating to shifting and the weave changes with
it. `float: 1` is plain weave, the checkerboard. `float: 2` is a twill, and a
diagonal appears in the surface, which is the single most recognisable thing
about denim. Past four the floats are long enough that it reads as satin:
shiny, and structureless.

Two things besides.

**The threads are round.** Each is shaded by its own cylindrical profile: the
height across a cylinder is the root of one minus the square of the
across-coordinate, and the slope of that is the normal. Flat threads are
stripes.

**The thread underneath is darkened where it passes beneath**, which is the
shadow of the one above it. Without it the interlacing reads as a hard edge
rather than as one thread going under another.

## Wiring

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="cloth" style="height: 60vh"></div>

<script type="module">
  import { createWovenThreads } from './beamish/effects/woven-threads/core.js'

  const cloth = createWovenThreads(document.querySelector('#cloth'))
  cloth.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createWovenThreads } from '@/beamish/effects/woven-threads/core'

export function Cloth() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const cloth = createWovenThreads(host.current, { pitch: 13 })
    cloth.start()
    return () => cloth.destroy()
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
import { createWovenThreads } from '@/beamish/effects/woven-threads/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let cloth: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  cloth = createWovenThreads(host.value)
  cloth.start()
})

onBeforeUnmount(() => cloth?.destroy())
</script>

<template>
  <div ref="host" class="cloth" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Choosing a cloth

`pitch` is the count. Fine pitches read as a shirt, coarse ones as canvas or
sacking. Below about five CSS pixels the shading of a round thread has nowhere
to happen and the weave flattens into a check, which is the point at which this
stops being worth its cost.

`width` is how tight the cloth is. Real cloth sits near the top of the range,
because a loom beats the weft up tight; below about 0.6 you have a gauze and
you are mostly looking at the gaps, which makes `ground` the dominant colour.

`float` is the weave. Try 1 and 2 side by side once: the diagonal arriving in
the surface from a single changed comparison is the most convincing thing here.

## Light and the two directions

`light` falls differently on the two thread directions, because each thread is
only lit across itself. Turning the light shifts which set of threads is the
brighter one, and at some angles the weave nearly disappears.

That is a real property of cloth and the reason fabric changes as you turn it in
your hands. It is worth sweeping the setting once to find the angle that makes
your weave legible.

## Cost and quiet

Measured at 0.035 mean absolute change per frame on a 0 to 255 scale, and
1.23ms at 640 by 360. It is one of the quietest things here, because the threads
wander rather than travel.

`wander: 0` makes it a perfect machine weave and perfectly still, which is a
legitimate way to use it: a static cloth is a texture, and textures do not need
to move.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createWovenThreads` from `useEffect`, `onMounted`, or a `client:*`
island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. The cloth is the subject and the wander is only the air in
the room, so the still frame loses nothing.

## Common mistakes

1. **No interlacing.** Two sets of lines crossing is a grid. The threads pass
   through each other, the surface has no structure, and no amount of shading
   will rescue it. One comparison per crossing is the entire fix.

2. **Flat threads.** A thread without a round profile is a stripe, and a weave
   of stripes is a tartan.

3. **No crimp.** Then the interlacing is visible as a hard edge rather than as
   depth, and the cloth looks printed rather than woven.

4. **Translating the weave to animate it.** It reads as a backdrop sliding past.
   Cloth moves by its threads wandering along their length, which is what the
   air in a room does to fabric.

5. **A very fine pitch.** Under about five pixels there is no room for the
   profile, the weave flattens, and you are paying for a shader to draw a check.
