## What it is

DepthPointCloud takes a photograph apart into points and pushes it into the
third dimension using its own brightness.

There is no depth map, and the item does not pretend there is. A photograph
does not carry one. This reads luminance and treats it as height, which is
wrong about the world and right about pictures: a photographer lights the
subject and lets the ground fall away, so in most photographs the bright parts
really are the near ones. Where that is false, which is a bright sky or a dark
subject, it fails interestingly rather than wrongly.

`relief` is how much you are willing to claim.

Every point keeps the colour of the pixel it came from, and that is the whole
trick. A point cloud in a single colour is an abstract; a photograph you can
still recognise while it comes apart is a much stronger thing.

## The element needs an `<img>` in it

The picture is the input, not the output. It is read once and never shown.

```html
<div id="hero" style="height: 70vh">
  <img src="/photograph.jpg" alt="" />
</div>
```

Hide it with CSS. The effect reads it from the host element, so if there is no
`img` inside, mounting throws and says so.

Two things to know about that read. It happens on the first frame where the
picture is actually decodable rather than once at mount, because an `img` in
the markup may not have arrived yet and a surface that reads it once gets an
empty cloud for ever. And a cross-origin image taints the canvas and cannot be
read back at all: if your photograph is on another domain, serve it with CORS
headers or nothing will be drawn.

## Three details that decide whether it works

**Rec. 709 luminance, not the average of the channels.** The eye is far more
sensitive to green than to blue, and averaging puts a blue sky and a green
field at the same height when nobody sees them that way.

**The picture is downscaled, not sampled.** It is drawn into a small canvas at
grid resolution and read back, so every point is the average of the cell it
came from. Picking every nth pixel of a full-size photograph aliases badly, and
a photograph is nothing but detail.

**Point size falls off with distance.** Without that the far points are as big
as the near ones and the whole thing flattens into a texture, which is the
usual way this kind of effect fails. It is also why `size` is in scene units
rather than pixels: converted against the viewport height, a point is the same
apparent size on a phone and on a monitor.

## The stripes, which were the grid talking

The first version gave every point a phase with `index × constant % n`, which
is the usual quick hash. It drew visible vertical stripes across the entire
cloud.

The index runs along each row, so stepping through phases in a regular cycle
lines that cycle up with the grid, and the grid becomes visible in the
movement. A sine hash of the two coordinates separately has no such
relationship with either axis. Any hash you use here has to be decorrelated in
both directions, not just irregular.

## Wiring

**React.** `three` is a peer dependency.

```tsx
import { useEffect, useRef } from 'react'
import { createDepthPointCloud } from '@/beamish/effects/depth-point-cloud/core'

export function Cloud() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const cloud = createDepthPointCloud(host.current, { relief: 1.15 })
    cloud.start()
    return () => cloud.destroy()
  }, [])

  return (
    <div ref={host} className="absolute inset-0 -z-10">
      <img src="/photograph.jpg" alt="" className="hidden" />
    </div>
  )
}
```

Mount once. Option changes go through `update()` rather than a remount, because
a remount is a new WebGL context and the budget for those is small. `density`
and `relief` rebuild the cloud when they change; everything else is free.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createDepthPointCloud } from '@/beamish/effects/depth-point-cloud/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let cloud: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  cloud = createDepthPointCloud(host.value)
  cloud.start()
})

onBeforeUnmount(() => cloud?.destroy())
</script>

<template>
  <div ref="host" class="cloud">
    <img src="/photograph.jpg" alt="" style="display: none" />
  </div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Choosing a photograph

It wants a picture whose tones already describe its space: something lit in
front, something pale in the middle distance, something dark behind. A flatly
lit picture comes apart into a sheet with texture on it and proves nothing.

High-key pictures, where most of the frame is bright, give a cloud that is all
at the front. Pictures with a bright sky give a sky that hovers in front of the
subject, which is wrong but sometimes better than right.

## It is for a dark ground

Declared `dark`. The points carry the photograph's own colours, which include
its pale ones, and on paper that half of the picture disappears into the page.
`wash` towards a dark ink is the nearest thing to a paper version and it is not
really one.

## Cost and how busy it is

0.8ms at 1280 by 720, which is cheap: points cost very little and the movement
is all in the vertex shader, so nothing is uploaded per frame. Cost is the
square of `density`.

0.399 mean absolute change per frame on a 0 to 255 scale, against
MetaballField at 0.360 and WaterCaustics at 0.222. A field of small bright dots
is the hardest case for that measurement, because any movement switches whole
pixels between a dot and the background rather than shading them. `drift` and
`spin` are the dials: at `drift: 0.035` it measured 1.485, which is well past
the point where a backdrop has become something happening.

## Cleanup and SSR

`destroy()` disposes the geometry, the material and the renderer, releases the
WebGL context, cancels the RAF, disconnects both observers and removes every
listener. One live context at a time is the budget, so call it.

There is nothing to render on the server. Call `createDepthPointCloud` from
`useEffect`, `onMounted`, or a `client:*` island. The `<img>` is ordinary
markup and can be server-rendered as usual.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. A still of this is a photograph standing slightly off the
page, which is most of the idea.

## Common mistakes

1. **No `<img>` in the host.** It throws and tells you. The picture is an
   input, so it has to be in the DOM to be read.

2. **A cross-origin photograph without CORS headers.** The canvas is tainted,
   the pixels cannot be read back, and nothing is drawn. No error: there is
   nothing wrong, there is just nothing there.

3. **Too much `drift`.** It is the difference between a photograph breathing
   and confetti, and it is also the main thing that makes the item busy.

4. **Raising `density` to make the picture clearer.** Past the default it costs
   the square and buys very little: the limit on legibility is point size and
   drift, not point count.

5. **A flatly lit photograph.** Brightness is the only depth information there
   is. If the picture does not vary in tone, the cloud is a flat sheet.
