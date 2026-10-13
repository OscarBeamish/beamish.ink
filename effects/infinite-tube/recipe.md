## What it is

InfiniteTube flies you through the inside of a tube that never ends.

Build a tube along a curve, turn the material inside out so you see its far
wall rather than its outside, and put the camera in it. That part is from a
[Codrops article by Louis
Hoebregts](https://tympanus.net/codrops/2017/05/09/infinite-tubes-with-three-js/).

## Why it is a closed loop

The usual way to make the flight endless is to scroll the texture a little
further along the tube every frame. That is a running total, and a running
total is the one thing an effect here may not keep: `renderAtTime(t)` has to
answer for any moment on its own, so the recorder can seek.

So the tube is a **closed curve** instead. `CatmullRomCurve3` with `closed`
joins the last point back to the first with the same smoothness as every other
join, so there is no seam to fly through. The camera goes round it, and after
one lap everything is exactly as it was.

The flight has no end because the road has no end, rather than because a
counter keeps going up. That also gives a perfect loop for nothing: there is
nothing to line up, because the last frame **is** the first frame.

## Three things make it read as speed, and none of them is the speed

**The tube has to bend.** A straight one gives you a stationary circle with a
pattern sliding down it, which reads as a screensaver. Corners coming at you
are what sell the movement, and they are what makes the far end of the tube
disappear and reappear.

**The camera looks ahead along the curve**, not at a fixed point. Going into a
bend then swings the view the way a car does, instead of the tunnel sliding
past a camera that is staring straight through it.

**It has to go dark in the distance.** Without the fade you can see the whole
tube at once, there is nothing to arrive out of, and the corners stop
mattering. Fade it *squared* rather than linearly: a linear fade leaves a
visible grey disc at the far end that reads as the tube being capped.

## Two things that were wrong first

**`getPointAt`, not `getPoint`.** The first is spaced by distance along the
curve; the second by the curve's parameter. On a curve whose segments are not
the same length, the parameter version speeds up and slows down on its own,
which reads as the tube breathing.

**The control points sit on a circle** and are then pushed about by the seed.
Scattering them freely was the first attempt, and roughly one seed in three
produced a curve that passed through itself. From the inside, that is a wall.

## The wall is a shader, not a texture

No image to fetch, and the rings stay sharp at any resolution. Each line is
widened by one pixel of its own gradient, measured with `fwidth`. Without that,
the far end of the tube is a field of moire rather than a pattern, because the
rings get squeezed below one pixel apart long before they fade out.

## Wiring

**Plain HTML.**

```html
<div id="hero" style="position: relative; height: 100vh"></div>

<script type="module">
  import { createInfiniteTube } from './beamish/effects/infinite-tube/core.js'

  const tube = createInfiniteTube(document.querySelector('#hero'))
  tube.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createInfiniteTube } from '@/beamish/effects/infinite-tube/core'

export function Hero() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const tube = createInfiniteTube(host.current, { period: 24 })
    tube.start()
    return () => tube.destroy()
  }, [])

  return <div ref={host} style={{ height: '100vh' }} />
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createInfiniteTube } from '@/beamish/effects/infinite-tube/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let tube: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  tube = createInfiniteTube(host.value)
  tube.start()
})

onBeforeUnmount(() => tube?.destroy())
</script>

<template><div ref="host" class="hero" /></template>
```

**Astro.** Nothing extra is required, but `three` has to be installed.

## Tuning it

1. **`seed`.** Click through a few before anything else. The character changes
   completely between a loop with one long straight in it and one that never
   stops turning.
2. **`period`.** The distance is fixed, so this is the speed. Under about 10
   seconds the bends arrive faster than the eye follows and it stops reading as
   travel.
3. **`reach`.** Short is a tunnel. Long is a pipe with the lights on, and it
   takes the mystery out of the corners because you can see what is coming.
4. **`rings`.** These are what actually shows the speed, because they are what
   streams past. The spokes do not move relative to the camera, so they read as
   structure rather than as motion. `spokes: 0` is cleaner and more like a scan.
5. **`lens`.** Wide exaggerates the speed, because things at the edge of the
   frame move much faster than things in the middle.

## Behind content

It is a dark item with one bright colour in it, so light text sits on it
easily. Raise `period` and drop `reach` if it is behind something that has to
be read: a slow flight into a short distance is nearly a still.

## Cleanup and SSR

`destroy()` releases the WebGL context, disposes the geometry and material,
cancels the RAF, disconnects the observers and removes every listener. One live
context at a time is the budget, so call it.

There is nothing to render on the server. The element is empty until the script
runs, so give it a height and a dark background.

## Accessibility

Decorative, and there is nothing in the canvas for assistive technology. Under
reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. Any moment works, since every point on the loop looks like
a tunnel.

This is a moving perspective into depth, which is the kind of motion most
likely to bother someone prone to motion sickness, so the reduced-motion path
matters more here than on a flat item.

## Common mistakes

1. **Scrolling a texture to fake the travel.** It works and it cannot be
   seeked, so it cannot be recorded cleanly and it never loops exactly.

2. **A straight tube.** A circle with a pattern sliding down it. The bends are
   the effect.

3. **Forgetting `BackSide`.** You are inside the mesh, so the faces pointing at
   you are the ones that get culled by default, and the tube renders as nothing
   at all.

4. **No fade into the distance.** You can see the whole tube, so there is
   nowhere to arrive from.

5. **Control points scattered freely.** The curve ties itself in a knot and you
   fly into a wall.

6. **`getPoint` instead of `getPointAt`.** The flight surges and slows on its
   own, on a loop that should be at a constant speed.
