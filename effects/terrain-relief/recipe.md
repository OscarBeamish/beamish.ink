## What it is

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

## Wiring

**Plain HTML.** three.js must already be available to your build. This file
imports it and does not bundle it.

```html
<div id="hero" style="width: 100%; aspect-ratio: 16 / 9"></div>

<script type="module">
  import { createTerrainRelief } from './beamish/effects/terrain-relief/core.js'

  const contour = createTerrainRelief(document.querySelector('#hero'), {
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
import { createTerrainRelief } from '@/beamish/effects/terrain-relief/core'

export function Hero() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const contour = createTerrainRelief(host.current, { relief: 1.9 })
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
import { createTerrainRelief } from '@/beamish/effects/terrain-relief/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let contour: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  contour = createTerrainRelief(host.value, { relief: 1.9 })
  contour.start()
})

onBeforeUnmount(() => contour?.destroy())
</script>

<template>
  <div ref="host" class="hero" />
</template>
```

**Astro.** Nothing extra is required. Use the React or Vue file as an island with
`client:visible`, or call `createTerrainRelief` from a plain `<script>` in the page.

**Using it flat.** Set `tilt` to 1 and `weight` to 0.9 and you get a printed map
seen from directly above rather than a relief. Both are the same effect and the
map version makes a much quieter page background.

## Cleanup and SSR

Call `destroy()`. It disposes the geometry, both materials, the shadow map and
the three.js renderer, then releases the WebGL context itself.

A page that mounts and unmounts scenes without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createTerrainRelief` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

## Pausing

WCAG 2.2.2 is Level A. The land moves on its own for more than five seconds, so
it must be pausable. `stop()` and `start()` are on the handle for that. Surface
them as a real control in your own build.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`.

This effect needs no care here. Any frame of it is a map, which is a finished
thing to look at, so the default of 3 is as good as any other number.

## Common mistakes

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
