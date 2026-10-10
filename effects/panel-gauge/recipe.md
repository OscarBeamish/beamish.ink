## What it is

PanelGauge is a moving-coil gauge: a painted dial face, a scale that lights up
to the reading, and a needle that is never quite still.

## What makes it an instrument rather than a circle

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

## The overshoot is not here

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

## Wiring

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

## Reporting something real

`value` is 0 to 1 of the scale and the hunt is applied on top of whatever you
set, so a gauge wired to live data still breathes between updates rather than
stepping. Map your own range onto 0 to 1 before you pass it; the dial has no
idea what it is measuring and should not.

## It paints its own face

`face` is filled, so the item supplies its ground and only the corners outside
the dial show the page through. That is why it declares `ground: "dark"`: the
default face is near-black and the unlit ticks are tuned against it. On paper,
set `face` to the paper and `ink` to something that survives on it.

## Two of them

Give them different `seed` values. The hunt is a function of the seed, so two
gauges with the same one wander in step and read as one instrument drawn twice.

## Cleanup and SSR

`destroy()` cancels the RAF, disconnects both observers and removes every
listener. There is no GL context to release.

There is nothing to render on the server. The element is empty until the first
frame. Call `createPanelGauge` from `useEffect`, `onMounted`, or a `client:*`
island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`. A
still gauge at its reading is a complete image: the needle is where it should
be and the scale is lit to it. That is the correct outcome rather than a
compromise, because the reading is the information and the hunt is not.

## Common mistakes

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
