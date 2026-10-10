You are adding **PanelGauge** from Beamish to this project.

> A moving-coil gauge with a scale that lights to the reading and a needle that is never quite still. Surfaces · effect · MIT.
> https://beamish.ink/effects/panel-gauge

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The scale is not symmetrical about the top. A panel meter sweeps about 250 degrees from the lower left, because that is where the stops are, and the dead sector at the bottom is where the movement lives. A scale that starts at twelve o'clock and runs clockwise is a progress ring
- Majors and minors are not the same tick. The minors between two majors are what make the eye read a position as a value rather than as an angle, and the ticks below the reading are lit while the ones above are not, which is how a scale carries the value as well as the needle does
- The reading hunts. A real one moves by a fraction of a division because what is being measured is not still either, and a needle frozen at exactly 0.62 reads as a picture of a gauge. Two sines of different periods, so it does not tick like a metronome, and both complete whole turns in a period so the needle comes home
- There is no overshoot, and that is a loss taken deliberately. A moving coil arrives at a reading by passing it, which is the most characterful thing a needle does, but it is a response to a change and therefore state between frames. The first version drove a closed-form damped oscillator from t: the needle swept up from zero and settled, which reads beautifully and does not loop, because frame zero was at the bottom of the scale and the last frame was at the reading
- 2D rather than WebGL. An instrument is something you want four of on a page, and the budget is one WebGL context
- Built for a dark ground and declared as one. The face is painted, so the item supplies its own ground and only the area outside the dial shows the page
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/panel-gauge/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/panel-gauge/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

PanelGauge is a moving-coil gauge: a painted dial face, a scale that lights up
to the reading, and a needle that is never quite still.

## 3. Wire it in

**Plain HTML.** The dial fills the shorter side, so a square host gives a full
one.

```html
<div id="load" style="width: 220px; height: 220px"></div>

<script type="module">
  import { createPanelGauge } from './beamish/effects/panel-gauge/core.js'

  const gauge = createPanelGauge(document.querySelector('#load'), { value: 0.62 })
  gauge.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createPanelGauge } from '@/beamish/effects/panel-gauge/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

export function Load({ value }: { value: number }) {
  const host = useRef<HTMLDivElement>(null)
  const gauge = useRef<EffectHandle | null>(null)

  useEffect(() => {
    if (!host.current) return
    const made = createPanelGauge(host.current, { value })
    gauge.current = made
    made.start()
    return () => made.destroy()
  }, [])

  // The reading changes without remounting.
  useEffect(() => gauge.current?.update({ value }), [value])

  return <div ref={host} className="size-56" />
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { createPanelGauge } from '@/beamish/effects/panel-gauge/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const props = defineProps<{ value: number }>()
const host = ref<HTMLElement | null>(null)
let gauge: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  gauge = createPanelGauge(host.value, { value: props.value })
  gauge.start()
})

watch(() => props.value, value => gauge?.update({ value }))
onBeforeUnmount(() => gauge?.destroy())
</script>

<template>
  <div ref="host" class="gauge" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `face` | color | `#15171b` | any CSS hex | The dial face. Painted rather than left transparent, because a gauge is a thing with a face on it and the alternative is ticks floating on your page. |
| `ink` | color | `#8b9199` | any CSS hex | Unlit ticks and the boss at the centre. Grey rather than white: the unlit half of the scale is there to be read past, not read. |
| `needle` | color | `#ff9426` | any CSS hex | The pointer. The one thing on the dial that should be found without looking, so it wants to be the only saturated colour in the frame apart from the lit arc it belongs to. |
| `lit` | color | `#ff9426` | any CSS hex | The arc and the ticks below the reading. Usually the needle's colour, because they are telling you the same thing; set them apart only if the arc is reporting something the needle is not. |
| `value` | number | `0.62` | 0 to 1 | Where the needle sits on the scale. Drive this through update() to make the gauge report something real; the hunt is applied on top of whatever you set. |
| `hunt` | number | `0.035` | 0 to 0.3 (looks right between 0.02 and 0.08) | How far the reading wanders either side, as a share of the scale. Small. At 0 the needle is frozen and the gauge stops reading as something connected to anything; past about 0.12 it is a fault rather than a reading. |
| `sweep` | number | `250` | 90 to 320 deg (looks right between 200 and 270) | Degrees of arc the scale covers, centred on twelve o'clock with the dead sector at the bottom. 250 is what a panel meter does, because that is where its stops are. At 320 there is nowhere for the movement to go and it reads as a ring. |
| `majors` | number | `6` | 2 to 16 | Major divisions, the ones a real dial numbers. Few: a scale you can count at a glance is the point of a dial, and past about ten you are reading a ruler. |
| `minors` | number | `4` | 0 to 10 | Minor divisions between each pair of majors. These are what let the eye read a needle between two numbers as a value. At 0 the dial can only say which division it is in. |
| `period` | number | `18` | 4 to 120 s (looks right between 12 and 40) | Seconds for one cycle of the hunt. Both sines complete whole turns in it, so the needle is in the same place at the start and the end. |
| `seed` | number | `3` | 0 to 9999 | Seed for the hunt's phase. Two gauges side by side want two seeds, or they wander in step and read as one instrument drawn twice. |

## 5. What makes it an instrument rather than a circle

Every dashboard has circles. Three things separate a gauge from a progress
ring, and all of them come from a real one being a coil, a spring and a
pointer.

**The scale is not symmetrical about the top.** A panel meter sweeps about 250
degrees from the lower left, because that is where its stops are, and the dead
sector at the bottom is where the movement lives. A scale that starts at twelve
o'clock and runs clockwise is a progress ring with ticks on it.

**Majors and minors are different ticks.** The minors between two majors are
what let the eye read a needle sitting between two numbers as a value. With
`minors: 0` the dial can only tell you which division you are in.

**The reading hunts.** A real one moves by a fraction of a division, because
what it is measuring is not still either. `hunt: 0` gives you a picture of a
gauge. Two sines of different periods, so it does not tick like a metronome.

## 6. The overshoot is not here

A moving coil arrives at a reading by passing it. It is the most characterful
thing a needle does and this item does not do it, which is worth being straight
about.

The reason is the contract. An overshoot is a response to a **change**, so it
has to know when the change happened, which is state between frames, and
`renderAtTime(t)` has to be pure in `t`. The first version drove a closed-form
damped oscillator from `t`: the needle swept up from zero and settled once at
the start. It reads beautifully and it does not loop, because frame zero was at
the bottom of the scale and the last frame was at the reading, so a recorded
take jumped once a cycle.

If you want it on a live page, animate `value` yourself and push it through
`update()`. Your component can hold state; this cannot.

## 7. Reporting something real

`value` is 0 to 1 of the scale and the hunt is applied on top of whatever you
set, so a gauge wired to live data still breathes between updates rather than
stepping. Map your own range onto 0 to 1 before you pass it; the dial has no
idea what it is measuring and should not.

## 8. It paints its own face

`face` is filled, so the item supplies its ground and only the corners outside
the dial show the page through. That is why it declares `ground: "dark"`: the
default face is near-black and the unlit ticks are tuned against it. On paper,
set `face` to the paper and `ink` to something that survives on it.

## 9. Two of them

Give them different `seed` values. The hunt is a function of the seed, so two
gauges with the same one wander in step and read as one instrument drawn twice.

## 10. Cleanup and SSR

`destroy()` cancels the RAF, disconnects both observers and removes every
listener. There is no GL context to release.

There is nothing to render on the server. The element is empty until the first
frame. Call `createPanelGauge` from `useEffect`, `onMounted`, or a `client:*`
island.

## 11. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`. A
still gauge at its reading is a complete image: the needle is where it should
be and the scale is lit to it. That is the correct outcome rather than a
compromise, because the reading is the information and the hunt is not.

## 12. The three mistakes most likely to be made here

1. **A scale starting at twelve o'clock.** That is a progress ring. The dead
   sector belongs at the bottom, where the movement is.

2. **`hunt: 0`.** A frozen needle reads as a picture of a gauge rather than an
   instrument attached to something.

3. **No minors.** The dial can then only say which division the needle is in,
   which is most of what a dial is for.

4. **Integrating the needle.** It cannot be seeked, so it cannot be recorded.
   Animate `value` in your own component instead.

5. **Too many majors.** Past about ten you are reading a ruler, and the thing a
   dial is good at is being read at a glance.

6. **Two gauges on one seed.** They hunt in step, which is immediately obvious
   and makes both look fake.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/panel-gauge/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/panel-gauge/adapters/vue.ts

---

Concept credit: the lit scale and the live readings on the front panel in the Machine Front Panel Page, by Ray Velez, https://github.com/RayVelez27/instalanding.ai.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
