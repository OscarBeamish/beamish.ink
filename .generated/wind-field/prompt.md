You are adding **WindField** from Beamish to this project.

> The wind on a weather map, combed into streaks that travel along the flow, with the speed read as colour. Backdrops · effect · MIT.
> https://beamish.ink/effects/wind-field

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Line integral convolution, not a particle system. Each pixel walks a short way up the flow and a short way down it, samples a fixed noise field at each step, and sums those samples under a travelling kernel: along a streamline they agree and the pixel is bright, across the flow they disagree and cancel
- That is not a stylistic choice. A particle's position depends on the one before it, so an advected field cannot be seeked, cannot be recorded, drifts on a dropped frame, and is wrong on the first frame after a resize, because the trail is feedback on the canvas. The page this was taken from runs fourteen thousand particles with a 0.07 erase per frame and there is no value of t you can ask it for
- The streaks move because the kernel's phase moves, not because anything in the field is advected. `turns` is a whole number of turns over the period and is rounded in core.ts rather than trusted, because it is the one value that can stop the loop closing and it arrives from a prompt
- Each system orbits its own home once per period, so the weather changes without the loop failing to come home
- Field space is y from 0 to 1 and x across the aspect ratio, rather than uv. A system placed in uv is an ellipse on a wide canvas
- Colour is a legend rather than a palette. Speed picks the hue through two interpolations, because a straight line between two colours gives one hue and a tint of it, and a chart like this is read by hue
- Built for a dark ground and declared as one. The streaks are drawn by addition onto the ground, which is what lets them overlap without going muddy, and on paper that makes them brighter than the paper rather than darker
- Four systems by default rather than eight. Eight small vortices read as a decorative swirl; four large overlapping ones read as a chart, because a real synoptic map is mostly one system's skirt running into another's
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/wind-field/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/wind-field/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

WindField is the wind on a weather map: a few pressure systems, a prevailing
drift, and the air between them combed into streaks that travel along the flow
with their speed read as colour.

It is **line integral convolution**, not a particle system, and that is the most
important thing about it.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="chart" style="height: 70vh"></div>

<script type="module">
  import { createWindField } from './beamish/effects/wind-field/core.js'

  const wind = createWindField(document.querySelector('#chart'))
  wind.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createWindField } from '@/beamish/effects/wind-field/core'

export function Weather() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const wind = createWindField(host.current, { systems: 4, length: 58 })
    wind.start()
    return () => wind.destroy()
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
import { createWindField } from '@/beamish/effects/wind-field/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let wind: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  wind = createWindField(host.value)
  wind.start()
})

onBeforeUnmount(() => wind?.destroy())
</script>

<template>
  <div ref="host" class="chart" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `ground` | color | `#0d141a` | any CSS hex | The ground, and what shows where there is no wind. Dark, because the streaks are added onto it: that is what lets them cross each other without going muddy, and it is also why this item does not work on paper without inverting the idea. |
| `calm` | color | `#3f6f93` | any CSS hex | The slowest air, at the bottom of the ramp. Cool and close to the ground, so the still parts of the field recede and the fast parts are what you look at. |
| `mid` | color | `#58a58c` | any CSS hex | The middle of the ramp. It exists so the ramp is read by hue rather than by lightness: a straight line from calm to strong gives one hue and a tint of it, which is the look of a gradient rather than of a chart. |
| `strong` | color | `#d8a04a` | any CSS hex | The fastest air, which in practice means the air close in around a system. Warm, because that is the convention every wind map uses and conventions are worth keeping where they cost nothing. |
| `systems` | number | `4` | 1 to 8 (looks right between 3 and 5) | How many pressure systems are in the field. Few and large reads as weather; many and small reads as decoration, because a real chart is mostly one system's skirt running into another's. This is also the main cost: the field is evaluated eighteen times per pixel and each evaluation walks this many systems. |
| `drift` | number | `0.42` | 0 to 1.5 (looks right between 0.2 and 0.6) | The prevailing wind across the frame, before any system touches it. At 0 the systems sit in dead air and the field has no direction, which is the single clearest way to make this look like a screensaver. |
| `wander` | number | `0.06` | 0 to 0.3 | How far each system travels from its home over a period, as a share of the height. Small: weather moves, but a backdrop that moves its structure around is a backdrop you keep looking at. At 0 the field is fixed and only the streaks travel, which is a legitimate and very quiet way to use this. |
| `scale` | number | `2.2` | 0.8 to 12 px (looks right between 1.2 and 3) | Cell size of the noise the streaks are made of. It sets how coarse the combing is, and nothing else in here does. Large values give a few wide ribbons; small ones give fine hair, and below about 3 it starts to alias into sparkle. |
| `length` | number | `60` | 10 to 180 px (looks right between 40 and 90) | How long a streak is. This is the distance the walk covers, so it is also how far the shader can see along the flow: long streaks follow a curve further and make the field legible, and past about 120 they start to straighten the tight air near a system centre into chords. |
| `turns` | number | `3` | 1 to 12 (looks right between 2 and 5) | Whole turns the streaks travel along the flow in one period. Whole, because a fraction means the loop never comes home, and core.ts rounds it rather than trusting it. With the default period of 36 seconds, 3 is a streak pattern that takes twelve seconds to repeat. |
| `contrast` | number | `0.46` | 0 to 1 (looks right between 0.35 and 0.7) | How hard the result is stretched away from its mean. Line integral convolution of a uniform field sits in a narrow band around the middle, so at 0 this is a flat wash with a hint of structure. Past about 0.8 the streaks go to hard black and white and the field stops reading as air. |
| `seed` | number | `11` | 0 to 9999 | Seed for the systems: where they sit, which way they turn, how big and how strong. The same seed gives the same weather, so a recording and a live page agree streak for streak. |
| `period` | number | `24` | 10 to 180 s (looks right between 24 and 90) | Seconds for one cycle. Long, because a backdrop has to survive being ignored: this is both how long a system takes to go round its home and the time in which the streaks make `turns` complete passes. |

## 5. Why not particles

Every wind map on the web advects a few thousand particles and leaves a fading
trail behind them. That look is right and the method cannot be used here, for
three reasons that all come from the same fact: a particle's position depends on
the one before it.

- **It cannot be seeked.** Frame 900 is only reachable by drawing frames 0 to
  899, so it cannot be recorded, and `renderAtTime(t)` is a lie.
- **It drifts on a dropped frame.** Two machines running the same page for a
  minute show different weather.
- **The trail is feedback on the canvas.** The first frame after a resize is
  whatever was left in the buffer.

So each pixel here walks a short way up the flow and a short way down it,
samples a fixed noise field at each step, and sums those samples under a
travelling kernel. Along a streamline the samples agree and the pixel is bright.
Across the flow they disagree and cancel. **The streak is the agreement**, and
nothing is stored between frames.

The streaks move because the kernel's phase moves, not because anything is
advected. `turns` is how many whole turns that phase makes in a `period`, and
`core.ts` rounds it rather than trusting it, because a fraction is the one way
this effect can fail to close its loop.

## 6. Three things that make it weather and not a pattern

**Few systems, large.** Eight small vortices read as a decorative swirl. Four
large overlapping ones read as a chart, because a real synoptic map is mostly
one system's skirt running into another's. `systems: 4` is the default for that
reason rather than for cost, though it is also the main cost.

**A prevailing drift.** Without `drift` the systems sit in dead air and the
field has no direction. It is the clearest single way to make this look like a
screensaver.

**Colour as a legend.** Speed picks the hue through two interpolations, `calm`
to `mid` to `strong`, because a straight line between two colours gives you one
hue and a tint of it. A chart like this is read by hue.

## 7. It needs a dark ground

The streaks are **added** onto `ground`, which is what lets them cross each
other without going muddy. On paper that makes them brighter than the paper
rather than darker, so the whole thing turns into a pale haze. It declares
`ground: "dark"` for that reason.

Set `ground` to whatever your dark section actually is rather than leaving the
default, or the mismatch shows as a rectangle.

## 8. It is expensive

Twenty-eight samples per pixel along the streamline, but only seven field
evaluations each way: the field is what costs, and a streamline is straight
enough over a couple of pixels that the samples between evaluations are nearly
free. Measured at 1280 by 720 that is 1.0ms for a draw and a forced flush,
against DustMotes at 0.7 and MarbledPaper at 2.2 on the same machine.

Cost is segments times systems. Two knobs before anything else:

- **`systems`** is an option. Three instead of five is a quarter off.
- **SEGMENTS** is a constant at the top of the shader. SUB is nearly free and
  is what controls whether the hair combs; SEGMENTS is what controls how
  faithfully a streak follows a curve.

**The step must be about one noise cell.** `length / 28` is the step and
`scale` is the cell. Step past a cell and consecutive samples are independent,
which is static. Step well inside one and they are identical, which is smear.
The first version of this had both at 7px and produced neither.

`maxDpr` defaults to 1.5 rather than the usual 2, because what this draws is
noise at a cell size of a few pixels and the fourth sub-pixel buys nothing you
can see.

## 9. Reading the controls

`length` is how far the walk goes, so it is also how far the shader can see
along the flow. Long streaks follow a curve further and make the field legible;
past about 120 they straighten the tight air near a system centre into chords.

`scale` is the cell size of the noise the streaks are made of, and the only
thing that sets how coarse the combing looks. `contrast` stretches the result
away from its mean, which it needs: raw convolution of a uniform field sits in a
narrow band around the middle, so at 0 this is a flat wash.

## 10. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createWindField` from `useEffect`, `onMounted`, or a `client:*`
island.

## 11. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`. A
still field of streaks is a chart, which is a complete image: `turns: 0` is not
available, but `wander: 0` with the loop stopped gives the same thing
permanently.

## 12. The three mistakes most likely to be made here

1. **Advecting particles.** It cannot be seeked, so it cannot be recorded; it
   drifts on a dropped frame; and the trail is feedback, so a resize shows what
   was left in the buffer.

2. **A fractional number of turns.** The loop never comes home and the video
   jumps once a cycle, forever. `turns` is rounded in `core.ts` for that reason.

3. **Too many systems.** Eight is decoration. Weather is a few large ones
   overlapping.

4. **No drift.** Systems in dead air have no direction, and the field reads as a
   pattern rather than as moving air.

5. **A two-colour ramp.** One hue and a tint of it. The middle stop is what
   makes the speed legible.

6. **Placing systems in uv.** A system placed in 0-to-1 coordinates is an
   ellipse on a wide canvas. The field works in a space where y spans 0 to 1 and
   x spans the aspect ratio.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/wind-field/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/wind-field/adapters/vue.ts

---

Concept credit: the field of named pressure systems behind the Wind Field Routing page, and the speed-as-colour ramp that goes with it. The method here is line integral convolution rather than fourteen thousand advected particles, because an advected field cannot be seeked, by Ray Velez, https://github.com/RayVelez27/instalanding.ai.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
