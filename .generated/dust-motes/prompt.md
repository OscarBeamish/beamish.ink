You are adding **DustMotes** from Beamish to this project.

> Dust hanging in a lit room, built as a field rather than a particle system, with most of it out of focus. Backdrops · effect · MIT.
> https://beamish.ink/effects/dust-motes

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- A field, not a particle system. The frame is a lattice, each cell holds one mote whose position is a function of the cell, a seed and the clock, and a pixel looks only at the nine cells around it. Nothing is stored and nothing is advanced
- That is not an optimisation, it is what makes the item possible here. An array of particles advanced each frame cannot be seeked, so it cannot be recorded; it drifts on a dropped frame, because each position depends on the last; and its cost grows with the count. This way the count is a division rather than a loop, so ten thousand motes cost exactly what a hundred do
- Most motes are out of focus, and that is the clearest difference between dust and snow. A real mote is a few micrometres across, so at any focal distance nearly all of them are blurred smudges and only a handful are sharp
- A blurred mote is drawn both wider and fainter, because a lens spreads the same light over more area. Those two together are what make a wide smudge and a tight point read as the same object at different distances rather than as two different things
- The motes catch the light rather than emitting it, so where one sits in the frame decides how bright it is. Without that the field has no direction and reads as static
- They rise as often as they fall. Dust in a lit room is moved by convection rather than by gravity: it hangs. Falling dust is snow
- Each mote is a gaussian rather than a disc, because a mote has no edge whether it is in focus or not
- Built for a dark ground and declared as one. This is light caught on something, and on a pale ground there is nothing for it to be brighter than
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- Measured at 0.018 mean absolute change per frame on a 0 to 255 scale and 0.37ms at 640 by 360, with a loop seam of exactly zero. The first version drifted 0.7 turns on the vertical and the seam measured 2.59: a time coefficient has to be a whole number of turns over the period or the loop never comes home
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/dust-motes/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/dust-motes/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

DustMotes is dust hanging in a lit room. It is a **field**, not a particle
system, and that is the most important thing about it.

Every version of this keeps an array of particles, advances each one every
frame, and respawns the ones that drift out. That costs three things and buys
nothing. It cannot be seeked, so it cannot be recorded. It drifts on a dropped
frame, because each position depends on the last. And its cost grows with the
count, so a thousand motes is a thousand objects to walk.

This is a shader over a lattice. The frame is divided into cells, each cell
holds one mote at a position that is a function of the cell, a seed and the
clock, and a pixel only ever looks at the nine cells around it. Nothing is
stored and nothing is advanced, so **the count is a division rather than a
loop**: ten thousand motes cost exactly what a hundred do.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="room" style="height: 70vh"></div>

<script type="module">
  import { createDustMotes } from './beamish/effects/dust-motes/core.js'

  const air = createDustMotes(document.querySelector('#room'))
  air.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createDustMotes } from '@/beamish/effects/dust-motes/core'

export function Air() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const air = createDustMotes(host.current, { pitch: 34 })
    air.start()
    return () => air.destroy()
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
import { createDustMotes } from '@/beamish/effects/dust-motes/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let air: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  air = createDustMotes(host.value)
  air.start()
})

onBeforeUnmount(() => air?.destroy())
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
| `ground` | color | `#17171c` | any CSS hex | The air, and what shows where there is no dust. Dark, because everything drawn here is light caught on something: on a pale ground the motes have nothing to be brighter than and the whole thing disappears. |
| `mote` | color | `#fdf6e4` | any CSS hex | The motes. Warm rather than white, because the light catching them came from somewhere and nothing in a room is lit by a pure white source. |
| `pitch` | number | `34` | 8 to 160 px (looks right between 22 and 60) | Cell size, and so the density: one mote per cell. A fine pitch costs nothing extra per pixel, because a pixel always looks at the same nine cells, so this is the one density control in the library that is free to turn up. Below about 15 the motes start to overlap into a fog. |
| `size` | number | `1.5` | 0.3 to 8 px | Radius of a mote in perfect focus, in pixels. Small: a sharp mote is a speck, and it is the blurred ones that take up room. Raising this makes the sharp ones into dots, which is the look of snow. |
| `haze` | number | `0.72` | 0 to 1 (looks right between 0.5 and 0.9) | How much of the field is out of focus. High, because at the scale of a mote the depth of field is almost nothing and nearly everything you see is a smudge. At 0 every mote is sharp, which is the single clearest way to make dust look like a screensaver. |
| `light` | number | `125` | 0 to 360 deg | Where the light comes from. It decides which side of the frame the dust is visible on, which is what gives the air a direction. Pair it with LightShafts set to the same angle and the motes are in the beam. |
| `falloff` | number | `0.65` | 0 to 1 | How hard the light falls off across the frame. At 0 the dust is evenly lit everywhere, which reads as a texture rather than as a room with a window in it. |
| `drift` | number | `0.75` | 0 to 2 | How far a mote wanders, as a share of the cell. It travels a closed path, so it comes back: dust hangs rather than going anywhere. At 0 it is a still field, which is a legitimate way to use this and very quiet. |
| `sparkle` | number | `0.12` | 0 to 1 | Share of motes bright enough to read as sharp specks. A few, and they are most of what makes the air look occupied: it is the thing you notice in a sunbeam. Past about a third it stops being dust and becomes glitter. |
| `seed` | number | `7` | 0 to 9999 | Seed for the field. The same seed gives the same air, so a recording and a live page match mote for mote. |
| `period` | number | `44` | 10 to 180 s | Seconds for one cycle of the drift. Long, because dust moves slowly and a backdrop has to survive being ignored. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createDustMotes` from `useEffect`, `onMounted`, or a `client:*`
island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. A still field of dust is a photograph of a room, which is a
complete image: `drift: 0` gives the same thing permanently.

## 7. The three mistakes most likely to be made here

1. **An array of particles.** It cannot be seeked, so it cannot be recorded; it
   drifts on a dropped frame; and it costs more as you add motes. A lattice has
   none of those properties and is less code.

2. **Every mote sharp.** It is snow. At the scale of a mote the depth of field
   is almost nothing, and most of what you can see is a smudge.

3. **Blurring without dimming.** A lens spreads the same light over more area,
   so a blurred mote must also be fainter. Without that the smudges read as
   bigger motes rather than as nearer ones.

4. **Dust that falls.** Convection moves dust, not gravity. It should go up as
   often as down and mostly just hang.

5. **A time coefficient that is not a whole number of turns.** The first version
   here drifted 0.7 turns on the vertical and the loop seam measured 2.59 where
   it has to be 0. One turn across and two turns up both come home.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/dust-motes/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/dust-motes/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
