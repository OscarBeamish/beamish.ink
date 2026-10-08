You are adding **WovenThreads** from Beamish to this project.

> Cloth: warp one way, weft the other, and one of them on top at every crossing. Backdrops · effect · MIT.
> https://beamish.ink/effects/woven-threads

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The interlacing is the item, and it is one comparison per crossing. Two sets of lines crossing is a grid: the threads pass through each other and the surface has no structure at all. The comparison is what turns it into cloth
- Changing that comparison from alternating to shifting is the difference between plain weave and twill, and the diagonal appears in the surface the moment it does. That is why denim has a diagonal in it
- The threads are round, shaded by their own cylindrical profile: the height across a cylinder is the root of one minus the square of the across-coordinate, and the slope of that is the normal. Flat threads are stripes
- The thread that goes under is darkened where it passes beneath, which is the shadow of the one above it. Without it the interlacing reads as a hard edge rather than as depth
- The cloth moves by having its threads wander along their length rather than by being translated, so the weave breathes the way fabric does when there is air in the room. A translated weave reads as a backdrop sliding past
- Because the wander moves a thread's centre, the nearest thread is found from the undisplaced grid and then corrected by that thread's own offset. Exact for any wander under half a pitch, which is far more than cloth does
- Two GLSL traps in one file: half is a reserved word and step is a builtin, and a variable named either fails at compile time rather than at run time
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- Measured at 0.035 mean absolute change per frame on a 0 to 255 scale and 1.23ms at 640 by 360, which makes it one of the quietest items here: the threads wander rather than travel
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/woven-threads/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/woven-threads/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `ground` | color | `#efece1` | any CSS hex | What shows between the threads. On an open cloth this is most of what you see, so it is doing as much work as either thread colour. Set it dark and a loose weave reads as mesh over a void. |
| `warp` | color | `#f7f5ed` | any CSS hex | The threads running one way. Warp is the set held under tension on the loom, which is why it is the one that runs the length of a bolt. |
| `weft` | color | `#d9d4c4` | any CSS hex | The threads running the other way, passed through the warp by the shuttle. Two slightly different colours is what makes the weave legible: identical ones give a surface whose structure you can only read from the shading. |
| `pitch` | number | `13` | 3 to 60 (looks right between 8 and 22) | Distance from one thread to the next, in CSS pixels. This is the count of the cloth: fine pitches read as a shirt, coarse ones as sacking or canvas. Below about 5 the shading of a round thread has nowhere to happen and the weave flattens into a check. |
| `width` | number | `0.86` | 0.1 to 1 (looks right between 0.7 and 0.95) | Thread width, as a share of the pitch. At 1 the cloth is closed and no ground shows; below about 0.6 it is a gauze and you are mostly looking at the gaps. Real cloth sits near the top of the range because a loom beats the weft up tight. |
| `float` | number | `1` | 1 to 5 | How many crossings a thread floats over before going under, which is the weave itself. 1 is plain weave, the alternating one. 2 and 3 are twills and bring a diagonal with them, which is the single most recognisable thing about denim. Past 4 the floats are long enough that the cloth reads as satin, shiny and structureless. |
| `relief` | number | `0.55` | 0 to 2 | How strongly the round threads are lit by their own profile. At 0 the cloth is flat colour and the weave is only readable as a pattern; this is what makes it read as made of something. |
| `light` | number | `135` | 0 to 360 deg | Where the light comes from. It falls differently on the two thread directions, since each is only lit across itself, so turning it shifts which set of threads is the brighter one. That is a real property of cloth and the reason fabric changes as you turn it. |
| `crimp` | number | `0.45` | 0 to 1 | How dark the thread underneath goes where it passes beneath. This is the shadow of the thread on top. At 0 the interlacing is a hard edge instead of depth, which is the difference between cloth and a woven-looking pattern. |
| `wander` | number | `0.1` | 0 to 0.45 | How far the threads wander from their lines, as a share of the pitch. Small: real cloth is regular, and this is the slack in it rather than a wave. At 0 it is a perfect machine weave, which is a legitimate and very still way to use this. |
| `period` | number | `36` | 8 to 180 s | Seconds for one cycle of the wander. Long, because this is a surface and not an animation. |

## 5. Choosing a cloth

`pitch` is the count. Fine pitches read as a shirt, coarse ones as canvas or
sacking. Below about five CSS pixels the shading of a round thread has nowhere
to happen and the weave flattens into a check, which is the point at which this
stops being worth its cost.

`width` is how tight the cloth is. Real cloth sits near the top of the range,
because a loom beats the weft up tight; below about 0.6 you have a gauze and
you are mostly looking at the gaps, which makes `ground` the dominant colour.

`float` is the weave. Try 1 and 2 side by side once: the diagonal arriving in
the surface from a single changed comparison is the most convincing thing here.

## 6. Light and the two directions

`light` falls differently on the two thread directions, because each thread is
only lit across itself. Turning the light shifts which set of threads is the
brighter one, and at some angles the weave nearly disappears.

That is a real property of cloth and the reason fabric changes as you turn it in
your hands. It is worth sweeping the setting once to find the angle that makes
your weave legible.

## 7. Cost and quiet

Measured at 0.035 mean absolute change per frame on a 0 to 255 scale, and
1.23ms at 640 by 360. It is one of the quietest things here, because the threads
wander rather than travel.

`wander: 0` makes it a perfect machine weave and perfectly still, which is a
legitimate way to use it: a static cloth is a texture, and textures do not need
to move.

## 8. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createWovenThreads` from `useEffect`, `onMounted`, or a `client:*`
island.

## 9. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. The cloth is the subject and the wander is only the air in
the room, so the still frame loses nothing.

## 10. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/woven-threads/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/woven-threads/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
