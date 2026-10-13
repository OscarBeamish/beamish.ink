You are adding **LightTrails** from Beamish to this project.

> A motorway at night on a long exposure, two rivers of light running away and toward you. Backdrops · effect · MIT.
> https://beamish.ink/effects/light-trails

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- One stretched box drawn many times with an InstancedMesh, each copy running down its own lane. The idea is from a Codrops article by Daniel Velasquez, which took it from an Akira poster
- Two directions, two colours. Tail lights going away are red and headlights coming toward you are white. One colour in one direction is a tunnel of stripes; the pair of opposing streams is what says motorway
- The oncoming ones cross the frame much faster, because their speed and yours add up. That difference does most of the work and it comes free from pointing them the other way
- The trails are different lengths. A real exposure is as long as the shutter was open and as fast as the car was going, so no two streaks match; equal lengths read as a conveyor belt
- Each trail covers a whole number of road lengths in one period, so its position is a mod of a function of t with no running total in it, and after one period everything is exactly where it started. Choosing speeds freely looks identical and never repeats, so the recording jumps on its last frame
- A box rather than a plane. Seen from a low camera a flat streak disappears whenever it is edge on, which makes the traffic flicker
- three's own fog rather than a hand-written fade. It is per-vertex, which is enough here because a trail is long: its two ends are far enough apart for the fog to differ along it, so a streak fades out along its own length
- Without the fog the road ends in a hard line of lights sitting on nothing and the frame has no depth at all
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/light-trails/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/light-trails/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

LightTrails is a motorway at night shot on a long exposure: two rivers of
light, one running away from you and one coming toward you, fading into fog.

One stretched box, drawn many times with an instanced mesh, each copy running
down its own lane. The idea is from a [Codrops article by Daniel
Velasquez](https://tympanus.net/codrops/2019/11/13/high-speed-light-trails-in-three-js/),
which took it from an Akira poster.

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `period` | number | `8` | 2 to 60 s (looks right between 6 and 16) | Seconds before everything is back where it started. Every trail covers a whole number of road lengths in this time, which is what makes it loop, so this is also the traffic speed: shorter is faster. |
| `trails` | number | `260` | 4 to 600 (looks right between 80 and 260) | How many streaks, across both carriageways, split evenly between the two directions. It has to be high, because the road is seen end on: the trails are spread through depth, and only the nearest third are more than a couple of pixels wide. Below about 60 it is a quiet road at three in the morning, which is a different and quite good picture. |
| `lanes` | number | `3` | 1 to 6 (looks right between 2 and 4) | Lanes each way. More lanes spread the traffic sideways and fill the frame; one lane each way is a country road and leaves a lot of night. |
| `length` | number | `18` | 2 to 120 (looks right between 14 and 48) | The longest a streak gets, in road units. Each trail takes a random share of this, so it sets the spread as well as the maximum. Long is a slow shutter: the streaks start to overlap and the road turns into continuous ribbons. |
| `weight` | number | `0.34` | 0.04 to 2 (looks right between 0.2 and 0.6) | How thick a streak is. Thin reads as a distant motorway seen from a bridge; thick reads as being down among the traffic. |
| `reach` | number | `190` | 30 to 200 (looks right between 120 and 195) | How far down the road you can see before the fog takes it. The one that decides whether there is any depth: too far and the road ends in a hard line of lights sitting on nothing. |
| `away` | color | `#ff2d2d` | any CSS hex | Tail lights, going away from you. Red because that is what the back of a car is, and the moment you make both streams the same colour the whole thing stops being a road. |
| `toward` | color | `#fff2d0` | any CSS hex | Headlights, coming toward you. Warm white rather than pure: a headlight is a filament or a slightly blue LED, and pure white next to pure red reads as a test card. |
| `night` | color | `#07070c` | any CSS hex | The night behind it, and also what the fog fades into, so the two are the same value on purpose. A fog colour that differs from the background leaves a visible band where the road ends. |
| `height` | number | `5.5` | 0.5 to 40 (looks right between 3 and 12) | How high the camera sits above the road. Low is in the traffic and the lanes overlap into a tangle; high is a bridge, and the lanes separate into readable lines. This is the biggest single change to how it looks. |
| `lens` | number | `62` | 20 to 110 deg (looks right between 40 and 80) | How wide an angle the camera takes in. Narrow compresses the road and piles the distant traffic up, which is what a long lens does and is most of the look of the photographs this comes from. |
| `seed` | number | `3` | 1 to 9999 | Seed for the traffic: which lane each trail is in, how long it is, and how fast it goes. The same seed gives the same road. |
| `maxDpr` | number | `2` | 1 to 3 | Device pixel ratio ceiling. Thin bright streaks on a dark ground alias badly, so this is worth leaving at 2. |
| `reducedMotionTime` | number | `2` | 0 to 60 s | The single frame shown when the user prefers reduced motion. Any moment works: a still of this is a long-exposure photograph, which is what it was imitating in the first place. |

## 5. Three things make it a road

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

## 6. How it loops

Each trail covers a **whole number of road lengths** in one period. Its
position is then a `mod` of a function of `t`, with no running total anywhere,
so it can be asked for at any moment and it returns to exactly where it started
when `t` does.

Choosing the speeds freely was the first attempt. It looks identical and it
never repeats, so the recording jumps on its last frame. The speeds are picked
from the few that divide the period, and the spread between those is what reads
as traffic rather than as a machine.

## 7. Two small decisions

**A box, not a plane.** Seen from a low camera a flat streak disappears
whenever it is edge on, which makes the whole road flicker.

**three's own fog**, not a hand-written fade. It is per-vertex on a basic
material, which is enough here precisely because a trail is long: its two ends
are far enough apart for the fog to differ along it, so a streak fades out
along its own length rather than as a block.

Set the fog colour and the background to the same value. A fog that fades to
something else leaves a visible band where the road ends.

## 8. Tuning it

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

## 9. Behind content

It is dark with two bright colours in it, and the brightness is all in bands,
so text over the middle of the frame can land on a streak. Raise `height` and
drop `trails` to open it up, or put the copy in the upper third where the fog
has already taken most of the light.

## 10. Accessibility. Do not skip this

Decorative, and there is nothing in the canvas for assistive technology. Under
reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. Any moment works: a still of this is a long-exposure
photograph, which is the thing it was imitating.

## 11. Cleanup and SSR

`destroy()` releases the WebGL context, disposes the geometry and material,
cancels the RAF, disconnects the observers and removes every listener. One live
context at a time is the budget, so call it.

There is nothing to render on the server. The element is empty until the script
runs, so give it a height and a dark background.

## 12. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/light-trails/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/light-trails/adapters/vue.ts

---

Concept credit: A road of instanced light trails running in two directions into fog, from the Codrops article High-speed Light Trails in Three.js, which took it from an Akira poster, by Daniel Velasquez, Codrops, https://tympanus.net/codrops/2019/11/13/high-speed-light-trails-in-three-js/.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
