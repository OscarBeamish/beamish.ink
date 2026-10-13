## What it is

LightTrails is a motorway at night shot on a long exposure: two rivers of
light, one running away from you and one coming toward you, fading into fog.

One stretched box, drawn many times with an instanced mesh, each copy running
down its own lane. The idea is from a [Codrops article by Daniel
Velasquez](https://tympanus.net/codrops/2019/11/13/high-speed-light-trails-in-three-js/),
which took it from an Akira poster.

## Three things make it a road

**Two directions, two colours.** Tail lights going away are red; headlights
coming toward you are white. One colour in one direction is a tunnel of
stripes. It is the pair of opposing streams that says motorway, and it costs
nothing: half the instances point the other way.

The oncoming ones also cross the frame much faster, because their speed and
yours add up. That difference does most of the work and you get it for free.

**The trails are different lengths.** A real exposure is as long as the shutter
was open and as fast as the car was going, so no two streaks match. Equal
lengths read as a conveyor belt.

**It has to go into fog.** Without the distance fade the road ends in a hard
line of lights sitting on nothing, and the frame has no depth at all.

## How it loops

Each trail covers a **whole number of road lengths** in one period. Its
position is then a `mod` of a function of `t`, with no running total anywhere,
so it can be asked for at any moment and it returns to exactly where it started
when `t` does.

Choosing the speeds freely was the first attempt. It looks identical and it
never repeats, so the recording jumps on its last frame. The speeds are picked
from the few that divide the period, and the spread between those is what reads
as traffic rather than as a machine.

## Two small decisions

**A box, not a plane.** Seen from a low camera a flat streak disappears
whenever it is edge on, which makes the whole road flicker.

**three's own fog**, not a hand-written fade. It is per-vertex on a basic
material, which is enough here precisely because a trail is long: its two ends
are far enough apart for the fog to differ along it, so a streak fades out
along its own length rather than as a block.

Set the fog colour and the background to the same value. A fog that fades to
something else leaves a visible band where the road ends.

## Wiring

**Plain HTML.**

```html
<div id="hero" style="position: relative; height: 100vh"></div>

<script type="module">
  import { createLightTrails } from './beamish/effects/light-trails/core.js'

  const road = createLightTrails(document.querySelector('#hero'))
  road.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createLightTrails } from '@/beamish/effects/light-trails/core'

export function Hero() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const road = createLightTrails(host.current, { height: 5.5 })
    road.start()
    return () => road.destroy()
  }, [])

  return <div ref={host} style={{ height: '100vh' }} />
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createLightTrails } from '@/beamish/effects/light-trails/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let road: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  road = createLightTrails(host.value)
  road.start()
})

onBeforeUnmount(() => road?.destroy())
</script>

<template><div ref="host" class="hero" /></template>
```

**Astro.** Nothing extra is required, but `three` has to be installed.

## Tuning it

1. **`height`.** The biggest single change to how it looks. Low is down among
   the traffic and the lanes overlap into a tangle; high is a bridge, and the
   lanes separate into readable lines.
2. **`lens`.** Narrow compresses the road and piles the distant traffic up,
   which is what a long lens does and is most of the look of the photographs
   this comes from.
3. **`reach`.** Whether there is any depth. Too far and the road ends in a hard
   line of lights.
4. **`length`.** A longer shutter. Push it up and the streaks overlap into
   continuous ribbons; pull it down and they become separate dashes.
5. **`trails`.** Under about 40 it is a quiet road at three in the morning,
   which is a different and quite good picture.

## Behind content

It is dark with two bright colours in it, and the brightness is all in bands,
so text over the middle of the frame can land on a streak. Raise `height` and
drop `trails` to open it up, or put the copy in the upper third where the fog
has already taken most of the light.

## Cleanup and SSR

`destroy()` releases the WebGL context, disposes the geometry and material,
cancels the RAF, disconnects the observers and removes every listener. One live
context at a time is the budget, so call it.

There is nothing to render on the server. The element is empty until the script
runs, so give it a height and a dark background.

## Accessibility

Decorative, and there is nothing in the canvas for assistive technology. Under
reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. Any moment works: a still of this is a long-exposure
photograph, which is the thing it was imitating.

## Common mistakes

1. **One colour, or one direction.** It stops being a road and becomes a field
   of stripes. The two opposing streams are the whole effect.

2. **Equal-length trails.** A conveyor belt. Real streaks vary because real
   shutters and real speeds do.

3. **Freely chosen speeds.** Looks right, never repeats, and the loop jumps on
   its last frame. They have to divide the period.

4. **No fog, or a fog colour that is not the background.** Either the road ends
   in a hard line of lights, or it ends in a visible band of the wrong colour.

5. **Flat planes instead of boxes.** From a low camera they vanish edge on and
   the traffic flickers.
