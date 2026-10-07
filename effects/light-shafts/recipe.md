## What it is

LightShafts is light coming into a room through something, and falling across
the frame in bands. Sun through a blind, through glazing bars, through a door
left ajar.

Every version of this effect anybody ships is a few pale triangles fanned out
from a corner, and they all have the same tell: the beams are solid, their edges
are equally sharp all the way along, and nothing accounts for why they are there
at all. A shaft of light is not a shape. It is the gap in whatever is between
you and the sun.

So this is built the way the thing works.

**There is a source, off frame, at a distance.** Everything is drawn from the
angle to it, which is what makes the beams fan rather than run parallel. Move
the source far enough away and they do run parallel, because that is what
distance does to a fan, and the sun is the limiting case. There is no separate
setting for parallel beams, because this is what parallel beams are.

**There is an occluder.** A repeating profile of bars and gaps, crossed by the
rays. The bright bands are the gaps, not the bars.

**The edges go soft with distance.** A shadow edge is sharp only near the thing
that cast it, because the source has width and the half-shadow it throws grows
as the shadow travels. This one multiplication is the whole difference between a
beam of light and a triangle.

**The beam is visible because of what is in the air.** Light in clean air cannot
be seen from the side, so the motes are not decoration over the top of the
shafts: they are the reason there is anything to see, and they are drawn only
inside the beams.

## Wiring

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="room" style="height: 100vh"></div>

<script type="module">
  import { createLightShafts } from './beamish/effects/light-shafts/core.js'

  const light = createLightShafts(document.querySelector('#room'))
  light.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createLightShafts } from '@/beamish/effects/light-shafts/core'

export function Room() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const light = createLightShafts(host.current, { bars: 9, gap: 0.5 })
    light.start()
    return () => light.destroy()
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
import { createLightShafts } from '@/beamish/effects/light-shafts/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let light: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  light = createLightShafts(host.value)
  light.start()
})

onBeforeUnmount(() => light?.destroy())
</script>

<template>
  <div ref="host" class="room" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Setting the exposure

This is the part to get right, and it is the first thing that went wrong here.

The light is **added** to the ground, because light is additive and a shaft that
darkens what it crosses is a shaft of paint. That means `ground` is the surface
*in shadow*, and it has to sit low enough that the lit bands have somewhere to
go. The first version used the site's paper white as the ground with
`strength: 0.72`, and every pixel in the frame clipped to white.

So: pick the shadow colour first, then raise `strength` until the gaps look
right. On a pale ground a quarter is already a bright day.

## On a dark ground

Set `ground` near black and the same effect is a projector beam, or a shaft
through a doorway into an unlit room. Two things change with it. `dust` matters
far more, because on a dark ground the motes are most of what you can see. And
`reach` wants to be shorter, so the light falls off into the dark rather than
flooding it.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createLightShafts` from `useEffect`, `onMounted`, or a `client:*`
island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. The still frame is the whole composition with the sun held
in place, which costs the viewer nothing here.

## Common mistakes

1. **A ground as pale as the light.** The light is added, so there is nothing
   above white for it to be. The frame clips and the beams vanish into it.
   `ground` is the surface in shadow.

2. **Leaving `spread` at 0.** The beams become triangles with parallel sides,
   which is every other version of this effect. A shadow edge softens as it
   travels because the source has width.

3. **Turning `drift` up to make it feel alive.** A band edge is the
   highest-contrast thing in the frame, so swinging the light moves a great many
   pixels: going from 4 degrees to 7 nearly doubled the measured change per
   frame. The sun covers fifteen degrees in an hour. Anything faster is somebody
   walking past with a lamp.

4. **Using it as a foreground.** This is a ground. It has large smooth areas and
   hard-edged bands, and text laid across a band edge is unreadable at exactly
   the moment the edge passes under it. Put it behind, and keep the bands away
   from the copy.
