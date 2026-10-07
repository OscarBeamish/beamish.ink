You are adding **LightShafts** from Beamish to this project.

> Light coming through something and falling across the frame in bands, with the shadow edges going soft as they travel. Backdrops · effect · MIT.
> https://beamish.ink/effects/light-shafts

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The whole image comes from one quantity, the angle from the source to the pixel, read against a repeating profile of bars and gaps. That is why the beams fan out from the source rather than running down the frame in parallel, and why pushing the source away straightens them on its own: distance is what turns a fan into parallel lines, and the sun is the limiting case
- The shadow edges soften with distance travelled. A shadow is sharp only near the thing that cast it, because the source has width and the half-shadow it throws grows as the shadow runs. One multiplication, and it is the whole difference between a beam of light and a pale triangle
- The motes are drawn only inside the beams. Light in clean air is invisible from the side, so the dust is not decoration over the shafts, it is the reason there is anything to see. They drift across the beams rather than along them, because dust in a room is moved by the air and not by the light
- The bar pitch is scaled by the distance of the source, so moving the light out to straighten the beams does not also squeeze them into a sliver
- There is an ambient term as well as the beams. Without it the unlit bands are flat and the frame reads as two colours rather than as one room
- Declared as working on either ground. The default is sun across a pale wall; the same effect with a dark ground is a projector beam, and the dust matters more there
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- Measured at 0.086 mean absolute change per frame on a 0 to 255 scale, which is in line with MeshGradient at 0.091 and PrismSpectrum at 0.080. Nearly all of it is the band edges sweeping rather than the motes: the motes were the obvious suspect and changing them moved the number by 0.0004
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/light-shafts/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/light-shafts/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `ground` | color | `#e7e2d6` | any CSS hex | The surface the light falls on, which is that surface in shadow: the lit bands are added on top of it, so it has to sit below them with room to spare. A ground as pale as the light clips to white across the whole frame, which is the first thing that went wrong here. Set it near black and the same effect is a projector beam in a dark room. |
| `light` | color | `#fff6e2` | any CSS hex | The light itself, added to the ground rather than mixed with it, because light is additive and a shaft that darkens what it crosses is a shaft of paint. Warm, because daylight through a window is warm and a neutral white beam reads as a lightbox. |
| `angle` | number | `128` | 0 to 360 deg | Where the source sits, in degrees around the frame, with 0 to the right. Above and to one side is the one that reads as a window; straight on reads as a torch pointed at the viewer. |
| `distance` | number | `1.6` | 0.2 to 8 (looks right between 1 and 3) | How far off frame the source is, in frame widths. Near is a lamp and the beams fan hard; far is the sun and they run very nearly parallel. There is no separate setting for parallel beams, because this is what parallel beams are. |
| `bars` | number | `7` | 1 to 40 (looks right between 4 and 12) | How many bars the light comes through. A few wide ones read as glazing bars or a door ajar; a great many read as a blind, and past about twenty the frame is a texture rather than a room. |
| `gap` | number | `0.44` | 0.02 to 0.98 | The share of each repeat that is open. Think of it as the tilt of a blind: at 0.9 the slats are nearly edge on and the room is bright, at 0.1 they are nearly shut. |
| `softness` | number | `0.06` | 0 to 0.5 | How soft a shadow edge is where it leaves the bar. This is the near edge only. At 0 the beam starts with a razor edge, which is what a point source does and no real source is. |
| `spread` | number | `1.5` | 0 to 6 (looks right between 0.8 and 3) | How much softer that edge gets with the distance the shadow has travelled. The detail that makes the light read as light. At 0 the beams are triangles with parallel sides, which is every other version of this effect. |
| `reach` | number | `2.1` | 0.2 to 10 | How far the light gets across the frame, in frame widths, falling off as it goes. Short is a small window in a large room; long floods the frame and leaves nothing for the beams to be brighter than. |
| `strength` | number | `0.26` | 0 to 2 | Brightness of the light, added to the ground rather than mixed into it. On a pale ground this clips long before it reaches 2, and a quarter is already a bright day: the numbers here are small because the ground is most of the way up the scale before any light arrives. |
| `dust` | number | `0.7` | 0 to 2 | Motes in the air. At 0 the beams are clean bands, which is what light in a vacuum would look like if you could see it, which you could not. |
| `drift` | number | `4` | 0 to 60 deg (looks right between 3 and 15) | Degrees the source swings over one period. Small. The sun moves through about fifteen degrees in an hour, and anything much faster reads as somebody carrying a lamp past the window. It is also the one setting that drives the cost of the animation: a band edge is the highest-contrast thing in the frame, so swinging the light moves a great many pixels. Measured, dropping this from 7 to 4 took the change per frame from 0.151 to 0.086. |
| `period` | number | `42` | 12 to 180 s | Seconds for one swing and back. Long, because this sits behind something else and a backdrop has to survive being ignored. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createLightShafts` from `useEffect`, `onMounted`, or a `client:*`
island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. The still frame is the whole composition with the sun held
in place, which costs the viewer nothing here.

## 7. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/light-shafts/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/light-shafts/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
