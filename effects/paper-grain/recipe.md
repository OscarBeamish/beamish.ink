## What it is

PaperGrain is the surface of a sheet of paper, with nothing on it. Not a pattern laid
over a background: the paper is the subject, and what you are looking at is
light falling across its own roughness.

Three things make a surface read as paper rather than as noise, and leaving any
one of them out gives you grey static.

**Fibre.** A sheet is a mat of fibres, and on a machine-made sheet they lie more
along one axis than the other, because the stock runs in a direction. So the
noise is stretched along that axis rather than isotropic. This is the machine
direction, and it is why a sheet tears cleanly one way and raggedly the other.

**Formation.** Hold a sheet up to a window and you see cloud: the fibre is not
spread evenly, and the patches are far larger than the fibres themselves.
Papermakers call it formation, or look-through, and it is what separates good
stock from newsprint.

**PaperGrain.** The micro-roughness that takes the ink, and the thing the effect is
named after. Too small to see as shape, so it shows only as a flicker in the
light, and only where the light is raking.

Which of those goes into the surface and which goes into the tone is the whole
shape of this effect rather than a detail of it. Only the fibre is surface: it
is differenced into a normal and lit. Formation is a density, so it changes how
much light comes back rather than which way the sheet faces, and it belongs in
the tone. The tooth is smaller than a pixel, so it is in neither, and it is
added to the light.

Get that wrong and no amount of tuning will save it. The first version of this
put both fields in the height, which is the obvious way to write it, and the
result was rough-cast plaster: the broad field contributed nothing, because a
broad field has almost no slope, and the fine fibre dominated the derivative.

## Wiring

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="sheet" style="height: 100vh"></div>

<script type="module">
  import { createPaperGrain } from './beamish/effects/paper-grain/core.js'

  const sheet = createPaperGrain(document.querySelector('#sheet'))
  sheet.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createPaperGrain } from '@/beamish/effects/paper-grain/core'

export function Sheet() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sheet = createPaperGrain(host.current, { light: 0.14 })
    sheet.start()
    return () => sheet.destroy()
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
import { createPaperGrain } from '@/beamish/effects/paper-grain/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sheet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sheet = createPaperGrain(host.value)
  sheet.start()
})

onBeforeUnmount(() => sheet?.destroy())
</script>

<template>
  <div ref="host" class="sheet" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Putting things on it

This is a ground for other things to sit on, and it is a quiet one: the measured
change per frame is 0.013 on a 0 to 255 scale, which is the lowest in the
library. Text sits on it directly. There is no need for a scrim, and a scrim
would defeat it, because the thing you would be covering is the only thing in
the frame.

Two settings matter when something is on top. Keep `light` low, so the sheet
reads as a surface seen at an angle rather than a flat tone. And keep `relief`
under about 1, past which the sheet stops being paper and starts being hammered
metal.

## Card and other stock

Set `paper` dark and you have card. The lighting does the same job: the tooth
catches the light the same way, and a black sheet with a raking light across it
is the most convincing dark ground in this library, because it is a real surface
rather than a gradient.

The item declares `ground: "paper"` because that is what it is for, but nothing
in the shader assumes a light stock.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createPaperGrain` from `useEffect`, `onMounted`, or a `client:*` island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For this item that frame is a complete image: the paper does not move, only the
light does, so the still frame is the effect with its one moving part stopped.
That is the rare case where reduced motion costs the viewer nothing.

## Common mistakes

1. **Putting the cloud in the height.** It contributes almost nothing, because a
   broad field has almost no slope, and it leaves the fine fibre dominating the
   derivative. The sheet comes out as plaster. Formation is a density; it
   belongs in the tone.

2. **Isotropic noise.** Paper has a grain direction. Noise without one reads as
   felt, which is what handmade sheets actually look like and not what anybody
   means by paper.

3. **Raising `relief` to make it more visible.** The way to make paper more
   visible is to lower the light, not to deepen the surface. A sheet with deep
   relief is not a sheet.

4. **Animating the grain.** Grain that crawls is film grain. It is a different
   effect, it is far noisier, and it will make a page unreadable. Only the light
   moves here, and `sweep: 0` stops even that.

5. **Differencing the normal over a step smaller than a pixel.** It samples
   detail the screen cannot resolve and comes back as sparkle that changes when
   the canvas is resized. The step is one CSS pixel, and it is divided out so
   `relief` means the same thing at every size.
