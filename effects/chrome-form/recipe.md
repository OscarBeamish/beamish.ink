## What it is

ChromeForm is a turned metal form, rotating, with a studio built for it to
reflect.

Most of this item is not the object. It is the room.

A mirror has no colour and no shading of its own: everything you see on a
chrome object is somewhere else in the room. That is why chrome rendered in an
empty scene looks like grey plastic, and it is the one thing that goes wrong
with this kind of effect. So the environment is painted into a canvas at
runtime and used as an equirectangular map. Nothing is shipped: no HDR file, no
cube faces, no images at all.

## What makes it read as metal

**Edges, not gradients.** A smooth tonal wash still reads as plastic however
shiny the material claims to be. What says polished is a hard edge between
light and dark sliding across a curve, which is why the room has soft strip
lights in it and a visible step at the horizon. The horizon is the line that
runs round the waist of anything reflective standing in a room, and its
absence is noticeable in a way nobody can name.

**Unevenly spaced lamps.** Evenly spaced lamps put evenly spaced highlights
round the object, and evenly spaced highlights read as a pattern printed on it
rather than as a room it is standing in. They sit on an irrational step.

**A prefiltered environment.** The map goes through three's PMREM generator
rather than being used raw, because otherwise `roughness` does nothing but
darken: a raw map is sampled at one level however rough the surface is. The
blurred levels are what a rough surface needs, and building them is what makes
the roughness dial mean something.

**ACES tone mapping**, which is unusual in this library and is the one case
that genuinely needs it. A mirror really does produce values above one. Clip a
strip light and you get a flat white shape with a hard edge where the roll-off
should be, which is the look of a render rather than of metal.

## Why a lathe and not a torus knot

A knot is what every WebGL demo reaches for, and reaching for it says nothing
about the thing you are making. A profile revolved about an axis is how a metal
object of this sort is actually made; it gives long uninterrupted curves, which
are what show a reflection off best; and the profile is three numbers you could
say out loud rather than a model file to fetch.

`height`, `girth` and `waist`. The waist is the one that matters: it is where
the reflection has to bend sharply, and a bend is the most metal-looking thing
on the object. At `waist: 0` you have a capped barrel and the reflections run
straight down it.

## Wiring

**Plain HTML.** The element needs a size. The canvas fills it. `three` is a
peer dependency: this one is not dependency-free.

```html
<div id="hero" style="height: 70vh"></div>

<script type="module">
  import { createChromeForm } from './beamish/effects/chrome-form/core.js'

  const form = createChromeForm(document.querySelector('#hero'))
  form.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createChromeForm } from '@/beamish/effects/chrome-form/core'

export function Form() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const form = createChromeForm(host.current, { roughness: 0.13 })
    form.start()
    return () => form.destroy()
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
import { createChromeForm } from '@/beamish/effects/chrome-form/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let form: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  form = createChromeForm(host.value)
  form.start()
})

onBeforeUnmount(() => form?.destroy())
</script>

<template>
  <div ref="host" class="form" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Do not animate the room

`studio` and `lamps` rebuild the environment, and rebuilding means repainting a
canvas and running PMREM over it. Both are cached against their inputs here, so
changing them occasionally is free and changing them every frame is the one way
to make this item expensive. Change `period`, `roughness` or the profile
instead; none of those rebuild anything but geometry, and that only when it
actually differs.

## Making it brass, or steel

`tint` multiplies the reflection on a fully metallic surface rather than adding
a colour of its own, which is the thing people get wrong. Near white is chrome.
Around `#e8c89a` is brass. A saturated tint does not give you coloured metal,
it gives you coloured glass, because the reflection is all there is and you
have put a filter over it.

`studio` is the other half of the colour. A neutral white room makes the metal
read as grey, which is why the default is slightly warm.

## It is for a dark ground

Declared `dark`. The room is dark so that the strips read as light, and
`background` is a flat fill that nothing reflects. On paper you would have to
make that fill pale, and a pale fill behind an object that is mirroring a dark
room looks like a hole cut in the page.

## Cost and how busy it is

1.2ms at 1280 by 720, against TerrainRelief at 1.80 on the same run, and 0.035
mean absolute change per frame on a 0 to 255 scale against TerrainRelief at
0.450.

That makes it one of the quietest items here, which is what a backdrop wants: a
single object turning slowly against a flat fill changes very few pixels. It is
also the only thing in this library you could reasonably put a headline on top
of without touching a setting.

## Cleanup and SSR

`destroy()` disposes the geometry, the material, the environment and the
renderer, releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createChromeForm` from `useEffect`, `onMounted`, or a `client:*`
island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. A still of a polished object is a perfectly good still.

## Common mistakes

1. **Expecting chrome to look like chrome in an empty scene.** It cannot. With
   nothing to reflect it is grey plastic, and no amount of metalness fixes
   that. If you replace the environment, replace it with something that has
   edges in it.

2. **A saturated `tint`.** On a metal the tint multiplies the reflection, so a
   strong colour reads as tinted glass rather than as coloured metal.

3. **Too many lamps.** Past about four the object has highlights everywhere and
   flattens out. The dark between the strips is what gives the form its shape.

4. **Animating `studio` or `lamps`.** Every change rebuilds and prefilters the
   environment. They are cached, so this costs nothing until you put them in a
   loop, at which point it costs everything.

5. **`roughness` above about 0.6.** There is nothing left to reflect and you
   have an expensive grey object.
