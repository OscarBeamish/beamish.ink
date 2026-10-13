You are adding **InfiniteTube** from Beamish to this project.

> Flying through the inside of a tube that has no end, because the tube is a closed loop. Backdrops · effect · MIT.
> https://beamish.ink/effects/infinite-tube

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- Build a tube along a curve, turn the material inside out so you see its far wall, put the camera inside. The idea is from a Codrops article by Louis Hoebregts, credited below
- The usual way to make the flight endless is to scroll the texture a little further along the tube every frame. That is a running total, and a running total is the one thing an effect here may not keep: renderAtTime has to answer for any moment on its own, so the recorder can seek
- So the tube is a closed curve instead. It comes back to where it started, the camera goes round it, and after one lap everything is exactly as it was. The flight has no end because the road has no end, rather than because a counter keeps going up, and the loop is perfect for free because the last frame IS the first frame
- The tube has to bend. A straight one gives a stationary circle with a pattern sliding down it, which reads as a screensaver; corners coming at you are what sells the movement and what makes the far end disappear and reappear
- The camera looks ahead along the curve rather than at a fixed point, so going into a bend swings the view the way a car does
- It has to go dark in the distance, squared rather than linear. Without the fade you can see the whole tube and there is nothing to arrive out of; with a linear fade there is a visible grey disc at the far end that reads as the tube being capped
- getPointAt, not getPoint. The first is spaced by distance along the curve and the second by the parameter, and on a curve whose segments differ in length the parameter version speeds up and slows down on its own, which reads as the tube breathing
- The control points sit on a circle and are then pushed about by the seed, so the loop is always a loop. Scattering them freely was the first attempt and about one seed in three produced a curve that passed through itself, which from the inside is a wall
- The lines are widened by one pixel of their own gradient, measured with fwidth. Without it the far end of the tube is a field of moire rather than a pattern
- The wall is drawn by a shader rather than a texture, so there is no image to fetch and the rings stay sharp at any resolution
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/infinite-tube/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/infinite-tube/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

InfiniteTube flies you through the inside of a tube that never ends.

Build a tube along a curve, turn the material inside out so you see its far
wall rather than its outside, and put the camera in it. That part is from a
[Codrops article by Louis
Hoebregts](https://tympanus.net/codrops/2017/05/09/infinite-tubes-with-three-js/).

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `period` | number | `12` | 4 to 120 s (looks right between 10 and 30) | Seconds for one lap of the loop, which is also the speed: the distance is fixed, so a shorter period is a faster flight. Under about 10 the bends arrive faster than the eye can follow and it stops reading as travel. |
| `radius` | number | `2.6` | 0.6 to 8 (looks right between 1.6 and 4) | How wide the tube is. Narrow is claustrophobic and fast because the wall is close; wide is calm and the bends matter less. It interacts with `lens`: a wide tube through a wide lens is just a room. |
| `bends` | number | `7` | 3 to 20 (looks right between 5 and 11) | How many control points the loop has, which is roughly how many corners you go round per lap. Three is a triangle with rounded corners. Past about fifteen the bends are shorter than the visible distance and they stop registering as separate corners. |
| `sway` | number | `11` | 0 to 24 (looks right between 6 and 15) | How far the control points are pushed off their circle, so how wild the loop is. At 0 it is a perfectly round doughnut and the flight is a constant gentle curve. High values eventually fold the tube through itself, and from the inside that is a wall. |
| `rings` | number | `300` | 10 to 900 (looks right between 120 and 400) | Rings down the length of the tube. These are the thing that actually shows the speed, because they are what streams past. Too few and there is nothing to measure the movement against. |
| `spokes` | number | `16` | 0 to 64 (looks right between 8 and 24) | Lines running around the tube. They do not move relative to the camera, so they read as the structure of the tunnel rather than as speed. At 0 you get rings only, which is cleaner and reads more like a scan. |
| `weight` | number | `0.045` | 0.005 to 0.45 (looks right between 0.04 and 0.16) | How thick a line is, as a share of the gap between lines. Thin. Past about 0.3 the lines meet and you have a solid tube with gaps in it instead of a tube with lines on it. |
| `reach` | number | `20` | 6 to 160 (looks right between 12 and 36) | How far down the tube you can see before it goes dark. This is the one that decides whether there is a tunnel at all: too long and the far end stays lit, there is no hole to fly into and nothing arrives out of anything. Short is a tunnel; long is a pipe with the lights on. |
| `wall` | color | `#0a0a12` | any CSS hex | The wall between the lines. Near-black rather than black, so the tube still has a surface where no line is falling. |
| `line` | color | `#5de4ff` | any CSS hex | The lines. One bright colour against a dark wall is the whole palette, which is why this reads as something lit rather than something painted. |
| `lens` | number | `78` | 30 to 120 deg (looks right between 60 and 95) | How wide an angle the camera takes in. Wide exaggerates the speed, because things at the edge of the frame move much faster than things in the middle. Past about 100 the walls bow and it stops being a tube. |
| `seed` | number | `4` | 1 to 9999 | Seed for the shape of the loop. Worth clicking through a few: the character of the flight changes completely between a loop with one long straight and one that never stops turning. |
| `maxDpr` | number | `2` | 1 to 3 | Device pixel ratio ceiling. The lines are antialiased in the shader, so this costs fill rate rather than changing how they look. |
| `reducedMotionTime` | number | `3` | 0 to 60 s | The single frame shown when the user prefers reduced motion. Any moment works, since every point on the loop looks like a tunnel; this one happens to be on a bend, which is more interesting than a straight. |

## 5. Why it is a closed loop

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

## 6. Three things make it read as speed, and none of them is the speed

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

## 7. Two things that were wrong first

**`getPointAt`, not `getPoint`.** The first is spaced by distance along the
curve; the second by the curve's parameter. On a curve whose segments are not
the same length, the parameter version speeds up and slows down on its own,
which reads as the tube breathing.

**The control points sit on a circle** and are then pushed about by the seed.
Scattering them freely was the first attempt, and roughly one seed in three
produced a curve that passed through itself. From the inside, that is a wall.

## 8. The wall is a shader, not a texture

No image to fetch, and the rings stay sharp at any resolution. Each line is
widened by one pixel of its own gradient, measured with `fwidth`. Without that,
the far end of the tube is a field of moire rather than a pattern, because the
rings get squeezed below one pixel apart long before they fade out.

## 9. Tuning it

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

## 10. Behind content

It is a dark item with one bright colour in it, so light text sits on it
easily. Raise `period` and drop `reach` if it is behind something that has to
be read: a slow flight into a short distance is nearly a still.

## 11. Accessibility. Do not skip this

Decorative, and there is nothing in the canvas for assistive technology. Under
reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. Any moment works, since every point on the loop looks like
a tunnel.

This is a moving perspective into depth, which is the kind of motion most
likely to bother someone prone to motion sickness, so the reduced-motion path
matters more here than on a flat item.

## 12. Cleanup and SSR

`destroy()` releases the WebGL context, disposes the geometry and material,
cancels the RAF, disconnects the observers and removes every listener. One live
context at a time is the budget, so call it.

There is nothing to render on the server. The element is empty until the script
runs, so give it a height and a dark background.

## 13. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/infinite-tube/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/infinite-tube/adapters/vue.ts

---

Concept credit: Building a tube along a curve, flipping the material to its back side and putting the camera inside, from the Codrops article Infinite Tubes with Three.js. Theirs scrolls a texture to fake the travel; this one flies round a closed curve so it can be seeked and so it loops exactly, by Louis Hoebregts, Codrops, https://tympanus.net/codrops/2017/05/09/infinite-tubes-with-three-js/.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
