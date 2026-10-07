## What it is

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

## Three things that make it dust and not snow

**Most of it is out of focus.** A real mote is a few micrometres across, so at
any focal distance nearly all of them are blurred smudges and only a handful are
sharp. Drawing them all sharp is the single clearest way to turn dust into a
screensaver.

A blurred mote here is drawn both **wider and fainter**, because a lens spreads
the same light over more area. Those two together are what make a wide smudge
and a tight point read as the same object at different distances, rather than as
two different things.

**It catches the light rather than emitting it.** Where a mote sits in the frame
decides how bright it is, which is what gives the air a direction. Without it
the field is evenly lit everywhere and reads as a texture.

**It rises as often as it falls.** Dust in a lit room is moved by convection,
not gravity: it hangs. Falling dust is snow.

## Wiring

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

## It needs a dark ground

Everything drawn here is light caught on something. On a pale ground the motes
have nothing to be brighter than and the effect disappears entirely, which is
why it declares `ground: "dark"`.

Set `ground` to whatever your dark section actually is, rather than leaving the
default: the motes are added to it, so a mismatch shows as a rectangle.

## Pairing it with LightShafts

Give both the same `light` angle and the motes are in the beam. That is the
combination worth reaching for, and it is also the honest one: LightShafts draws
its own motes inside the beams for exactly this reason, and turning those down
while this one carries the air gives you dust through the whole room rather than
only where the light is.

## Density is free

`pitch` is the cell size and so the density, and a finer pitch costs nothing
extra per pixel, because a pixel always looks at the same nine cells. It is the
one density control in this library that is free to turn up.

Below about 15 pixels the motes overlap into a fog, which is a different and
quite nice effect but no longer dust.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createDustMotes` from `useEffect`, `onMounted`, or a `client:*`
island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. A still field of dust is a photograph of a room, which is a
complete image: `drift: 0` gives the same thing permanently.

## Common mistakes

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
