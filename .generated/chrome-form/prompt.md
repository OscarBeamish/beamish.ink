You are adding **ChromeForm** from Beamish to this project.

> A turned metal form rotating in a studio built for it to reflect, with no image files to ship. Backdrops · effect · MIT.
> https://beamish.ink/effects/chrome-form

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- Most of this item is the room rather than the object. A mirror has no colour and no shading of its own, so chrome in an empty scene looks like grey plastic: there is nothing for it to be a reflection of
- The environment is painted into a canvas at runtime and used as an equirectangular map, so nothing is shipped: no HDR, no cube faces, no image files at all. A dark surround, a brighter floor and a few soft strip lights, which is what a photographer would put round something shiny
- The strips are what say metal. A gradient alone gives a smooth tonal wash that still reads as plastic; what reads as polished is a hard edge between light and dark sliding across a curve. The horizon step in the surround does the same job round the waist
- Lamps are spaced on an irrational step. Evenly spaced lamps put evenly spaced highlights round the object, and evenly spaced highlights read as a pattern printed on it rather than as a room it is standing in
- Prefiltered through PMREM rather than used raw, because otherwise roughness does nothing but darken: a raw map is sampled at one level however rough the surface claims to be, and the blurred levels are what a rough surface needs
- A lathe, not a torus knot. A knot is what every WebGL demo reaches for and says nothing about anything; a revolved profile is how a metal object of this kind is actually made, it gives the long uninterrupted curves that show a reflection off best, and the profile is three numbers rather than a model file
- ACES tone mapping, which is unusual here and is the one case that needs it. A mirror genuinely produces values above one, and clipping a strip light gives a flat white shape with a hard edge where the roll-off should be
- Geometry and environment are rebuilt only when their inputs change, because update() can be called on every frame by a framework re-render and PMREM has no business running at 60Hz
- Built for a dark ground and declared as one. The room is dark so that the strips read as light; on paper the background would have to be pale, and a pale fill behind a dark-roomed mirror looks like a hole cut in the page
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/chrome-form/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/chrome-form/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

ChromeForm is a turned metal form, rotating, with a studio built for it to
reflect.

Most of this item is not the object. It is the room.

A mirror has no colour and no shading of its own: everything you see on a
chrome object is somewhere else in the room. That is why chrome rendered in an
empty scene looks like grey plastic, and it is the one thing that goes wrong
with this kind of effect. So the environment is painted into a canvas at
runtime and used as an equirectangular map. Nothing is shipped: no HDR file, no
cube faces, no images at all.

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `background` | color | `#0c0d10` | any CSS hex | The page behind the object. Nothing reflects it, so it is only a fill, but it wants to be close to the dark end of the room or the object reads as cut out and pasted on. |
| `tint` | color | `#eef1f4` | any CSS hex | The metal. Near white is chrome; warm it towards #e8c89a for brass and cool it for steel. On a fully metallic surface this multiplies the reflection rather than adding a colour of its own, which is why a saturated one looks like coloured glass instead of metal. |
| `studio` | color | `#fff6e8` | any CSS hex | The strip lights, and therefore the bright part of every reflection. Slightly warm by default, because a neutral white room makes the metal read as grey. |
| `roughness` | number | `0.13` | 0 to 1 (looks right between 0.05 and 0.35) | How polished. At 0 it is a mirror with the room sharp in it; by about 0.4 the strips have softened into a sheen and it reads as brushed. Past about 0.6 there is nothing left to reflect and it goes to grey. |
| `lamps` | number | `3` | 1 to 6 (looks right between 2 and 4) | Strip lights round the room. Two is a photographer's key and fill. More than four and the object has highlights everywhere, which flattens it: the dark between the strips is what gives the form its shape. |
| `height` | number | `2.6` | 0.6 to 5 | Height of the form in scene units, where the camera frames about four. |
| `girth` | number | `0.78` | 0.1 to 2 | Radius at the widest point. |
| `waist` | number | `0.42` | 0 to 0.9 (looks right between 0.2 and 0.6) | How far the middle pulls in, as a share of girth. At 0 it is a plain capped barrel. The waist is what gives the reflection somewhere to bend sharply, which is the most metal-looking thing on the object. |
| `tilt` | number | `14` | -45 to 45 deg | Degrees the axis leans. A little off vertical is the difference between an object and a diagram of one. |
| `period` | number | `36` | 8 to 180 s (looks right between 24 and 60) | Seconds for one full turn. Exactly one turn, so the loop closes with no join. |

## 5. What makes it read as metal

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

## 6. Why a lathe and not a torus knot

A knot is what every WebGL demo reaches for, and reaching for it says nothing
about the thing you are making. A profile revolved about an axis is how a metal
object of this sort is actually made; it gives long uninterrupted curves, which
are what show a reflection off best; and the profile is three numbers you could
say out loud rather than a model file to fetch.

`height`, `girth` and `waist`. The waist is the one that matters: it is where
the reflection has to bend sharply, and a bend is the most metal-looking thing
on the object. At `waist: 0` you have a capped barrel and the reflections run
straight down it.

## 7. Do not animate the room

`studio` and `lamps` rebuild the environment, and rebuilding means repainting a
canvas and running PMREM over it. Both are cached against their inputs here, so
changing them occasionally is free and changing them every frame is the one way
to make this item expensive. Change `period`, `roughness` or the profile
instead; none of those rebuild anything but geometry, and that only when it
actually differs.

## 8. Making it brass, or steel

`tint` multiplies the reflection on a fully metallic surface rather than adding
a colour of its own, which is the thing people get wrong. Near white is chrome.
Around `#e8c89a` is brass. A saturated tint does not give you coloured metal,
it gives you coloured glass, because the reflection is all there is and you
have put a filter over it.

`studio` is the other half of the colour. A neutral white room makes the metal
read as grey, which is why the default is slightly warm.

## 9. It is for a dark ground

Declared `dark`. The room is dark so that the strips read as light, and
`background` is a flat fill that nothing reflects. On paper you would have to
make that fill pale, and a pale fill behind an object that is mirroring a dark
room looks like a hole cut in the page.

## 10. Cost and how busy it is

1.2ms at 1280 by 720, against TerrainRelief at 1.80 on the same run, and 0.035
mean absolute change per frame on a 0 to 255 scale against TerrainRelief at
0.450.

That makes it one of the quietest items here, which is what a backdrop wants: a
single object turning slowly against a flat fill changes very few pixels. It is
also the only thing in this library you could reasonably put a headline on top
of without touching a setting.

## 11. Cleanup and SSR

`destroy()` disposes the geometry, the material, the environment and the
renderer, releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createChromeForm` from `useEffect`, `onMounted`, or a `client:*`
island.

## 12. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. A still of a polished object is a perfectly good still.

## 13. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/chrome-form/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/chrome-form/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
