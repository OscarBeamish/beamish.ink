## What it is

WindField is the wind on a weather map: a few pressure systems, a prevailing
drift, and the air between them combed into streaks that travel along the flow
with their speed read as colour.

It is **line integral convolution**, not a particle system, and that is the most
important thing about it.

## Why not particles

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

## Three things that make it weather and not a pattern

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

## Wiring

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

## It needs a dark ground

The streaks are **added** onto `ground`, which is what lets them cross each
other without going muddy. On paper that makes them brighter than the paper
rather than darker, so the whole thing turns into a pale haze. It declares
`ground: "dark"` for that reason.

Set `ground` to whatever your dark section actually is rather than leaving the
default, or the mismatch shows as a rectangle.

## It is expensive

Eighteen samples per pixel, and each one evaluates the field, which walks every
system. Measured at 1280 by 720 that is 1.4ms for a draw and a forced flush,
against DustMotes at 0.7 and MarbledPaper at 2.2 on the same machine: near the
top of this library but not at it.

Cost is taps times systems. Two knobs before anything else:

- **`systems`** is an option. Three instead of five is a quarter off.
- **TAPS** is a constant at the top of the shader. Below about five the streaks
  stop being streaks and the field reads as noise.

`maxDpr` defaults to 1.5 rather than the usual 2, because what this draws is
noise at a cell size of a few pixels and the fourth sub-pixel buys nothing you
can see.

## Reading the controls

`length` is how far the walk goes, so it is also how far the shader can see
along the flow. Long streaks follow a curve further and make the field legible;
past about 120 they straighten the tight air near a system centre into chords.

`scale` is the cell size of the noise the streaks are made of, and the only
thing that sets how coarse the combing looks. `contrast` stretches the result
away from its mean, which it needs: raw convolution of a uniform field sits in a
narrow band around the middle, so at 0 this is a flat wash.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createWindField` from `useEffect`, `onMounted`, or a `client:*`
island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`. A
still field of streaks is a chart, which is a complete image: `turns: 0` is not
available, but `wander: 0` with the loop stopped gives the same thing
permanently.

## Common mistakes

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
