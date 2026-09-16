You are adding **Contour** from Beamish to this project.

> A topographic relief on paper, printed with its own contour lines. Backdrops · effect · MIT.
> https://beamish.ink/effects/contour

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL1 or better
- three.js must already be a dependency of the project. It is not bundled
- The displacement runs in the vertex shader, so a 160 square grid is one upload and costs memory rather than frame time
- The same displacement is injected into a custom depth material. Without that the land casts the shadow of a flat plane and the relief detaches from its own shading
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/contour/core.ts` | https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/effects/contour/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Contour is a topographic relief on paper: matte land, one low sun, and contour
lines printed on the surface at fixed height intervals. Every fifth line is an
index contour, the one a real map would label, drawn in a second colour.

It is a real three.js scene, and the displacement runs in the vertex shader
rather than in JavaScript. A 160 square grid is 25,600 vertices uploaded once,
after which the resolution costs memory and not frame time.

The part worth knowing about is the shadow. three renders the shadow pass with a
different material, which knows nothing about a displacement written into the
surface shader, so the land would cast the shadow of a flat plane and the whole
relief would detach from its own shading. The same terrain function is therefore
injected into a custom depth material as well. That is the step most terrain
demos skip, and it is why theirs look painted on.

The height field is ridged rather than smooth. Taking the absolute value of each
octave and inverting it turns rolling hills into ridges and valleys, which is
what makes contour lines worth drawing at all: smooth noise gives you concentric
blobs.

The land morphs along a closed orbit through noise space, so the loop returns to
its start exactly and any span of `period` seconds joins back on itself.

## 3. Wire it in

**Plain HTML.** three.js must already be available to your build. This file
imports it and does not bundle it.

```html
<div id="hero" style="width: 100%; aspect-ratio: 16 / 9"></div>

<script type="module">
  import { createContour } from './beamish/effects/contour/core.js'

  const contour = createContour(document.querySelector('#hero'), {
    indexInk: '#c44400'
  })
  contour.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createContour } from '@/beamish/effects/contour/core'

export function Hero() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const contour = createContour(host.current, { relief: 1.9 })
    contour.start()
    return () => contour.destroy()
  }, [])

  return <div ref={host} className="aspect-video w-full" />
}
```

Do not put option values in the dependency array. That tears the context down and
recompiles both shaders. Call `update()` instead:

```tsx
useEffect(() => {
  contourRef.current?.update({ density })
}, [density])
```

Every option here is a uniform, so `update()` is free. Nothing rebuilds.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createContour } from '@/beamish/effects/contour/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let contour: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  contour = createContour(host.value, { relief: 1.9 })
  contour.start()
})

onBeforeUnmount(() => contour?.destroy())
</script>

<template>
  <div ref="host" class="hero" />
</template>
```

**Astro.** Nothing extra is required. Use the React or Vue file as an island with
`client:visible`, or call `createContour` from a plain `<script>` in the page.

**Using it flat.** Set `tilt` to 1 and `weight` to 0.9 and you get a printed map
seen from directly above rather than a relief. Both are the same effect and the
map version makes a much quieter page background.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper behind the land. Match it to your page background or the horizon reads as a hard edge. |
| `land` | color | `#f4f1e7` | any CSS hex | The land itself. Keep it close to the paper but not identical, or the horizon disappears entirely. |
| `ink` | color | `#6f665a` | any CSS hex | The contour lines. A warm grey reads as print; pure black reads as a wireframe. |
| `indexInk` | color | `#c44400` | any CSS hex | Every fifth line is an index contour, the one a real map would label. This is the obvious place for your own colour. |
| `relief` | number | `1.9` | 0.2 to 5 (looks right between 1 and 2.4) | Height of the land. Past about 3 the ridges are steeper than the sun can light and the far side goes black. |
| `scale` | number | `0.3` | 0.1 to 2 (looks right between 0.2 and 0.5) | Size of the landforms. Lower is broader country with fewer, longer ridges. |
| `density` | number | `1.7` | 0.5 to 12 (looks right between 1.2 and 3) | Contour lines per unit of height. More lines reads as steeper country. Past about 8 the lines are closer than the pixels and the map turns grey. |
| `weight` | number | `0.72` | 0 to 1 (looks right between 0.45 and 0.85) | Weight of the lines. Zero is bare land with no map printed on it, which is a perfectly good backdrop in its own right. |
| `elevation` | number | `26` | 5 to 80 deg (looks right between 15 and 40) | Sun height above the horizon. Low rakes the ridges and is most of where the depth comes from. High flattens the whole thing into a map. |
| `azimuth` | number | `38` | 0 to 360 deg (looks right between 20 and 70) | Sun direction around the compass. Convention on a printed map is light from the north west, which is about 315. |
| `tilt` | number | `0.5` | 0 to 1 (looks right between 0.3 and 0.7) | Camera height. Zero is down on the deck with a horizon, one looks straight down at a map. The interesting ground is in between. |
| `zoom` | number | `0.55` | 0.3 to 2 (looks right between 0.45 and 0.8) | How much of the frame the land fills. |
| `period` | number | `6` | 4 to 120 s (looks right between 6 and 40) | Seconds for one loop of the morph. The land travels a closed orbit through noise space and returns exactly. The default is 6 so the preview video is a whole cycle; 20 to 40 is right behind a page, where the land should be moving slowly enough that nobody catches it. |
| `reducedMotionTime` | number | `3` | 0 to 120 s | The single frame shown when the user prefers reduced motion. Any time works here: a still relief is a map, which is a finished thing to look at. |

## 5. Cleanup and SSR

Call `destroy()`. It disposes the geometry, both materials, the shadow map and
the three.js renderer, then releases the WebGL context itself.

A page that mounts and unmounts scenes without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createContour` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A. The land moves on its own for more than five seconds, so
it must be pausable. `stop()` and `start()` are on the handle for that. Surface
them as a real control in your own build.

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`.

This effect needs no care here. Any frame of it is a map, which is a finished
thing to look at, so the default of 3 is as good as any other number.

## 7. The three mistakes most likely to be made here

1. **Raising `relief` past about 3.** The ridges become steeper than a 26-degree
   sun can light, the far sides go black, and a library built for warm paper
   suddenly has a large dark shape in it. If you want more drama, lower
   `elevation` instead: long shadows read as height without any of the land
   going dark.

2. **Raising `density` to get more lines.** Past about 8 lines per unit the
   contours are closer together than the pixels that have to draw them, and the
   whole surface turns to flat grey. The lines already anti-alias against the
   local slope, so they will not disappear at low values either.

3. **Setting `land` to exactly `paper`.** The horizon then vanishes and the
   relief looks like it is floating in fog. Keep them close, because that is what
   makes it read as a paper model, but not identical.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/effects/contour/adapters/react.tsx
- https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/effects/contour/adapters/vue.ts

---

Concept credit: real-time terrain with shader displacement, by Codrops, https://tympanus.net/codrops/2026/07/22/building-ridgeline-engineering-a-real-time-3d-experience-in-webflow/.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
