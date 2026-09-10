You are adding **Swell** from Beamish to this project.

> A field of matte forms on paper, rippling around the cursor. Pointer · effect · MIT.
> https://beamish.ink/effects/swell

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL1 or better
- three.js must already be a dependency of the project. It is not bundled
- One InstancedMesh, so 324 forms cost one draw call and one shadow pass
- The ripple is a standing wave centred on the cursor, not a propagating one with memory. renderAtTime has to be pure in t, and a wave with history is not
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/swell/core.ts` | https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/effects/swell/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Swell is a field of matte forms standing on paper, rippling around the cursor.
324 of them by default, drawn as one instanced mesh, lit by a single sun with a
real shadow map. Same family as Sundial: matte forms, warm paper, shadows doing
the work.

The ripple is a standing wave centred on the pointer rather than a propagating
one with memory. That is a deliberate constraint. A wave with history integrates
against the previous frame, and `renderAtTime` has to be pure in `t` or the
effect cannot be recorded or scrubbed. A standing wave that follows the cursor is
indistinguishable at a glance and reproducible to the pixel.

With no pointer the field keeps a slow diagonal swell of its own, so it is alive
before anyone touches it and the loop still closes.

The crest is tinted towards the accent colour. That is what makes the wave
legible in a still frame, which matters for the poster, for reduced motion, and
for anybody who arrives on a touch screen.

## 3. Wire it in

**Plain HTML.** three.js must already be available to your build. This file
imports it and does not bundle it.

```html
<div id="field" style="width: 100%; aspect-ratio: 16 / 9"></div>

<script type="module">
  import { createSwell } from './beamish/effects/swell/core.js'

  const swell = createSwell(document.querySelector('#field'), { count: 18 })
  swell.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createSwell } from '@/beamish/effects/swell/core'

export function Field() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const swell = createSwell(host.current, { count: 18, accent: '#c44400' })
    swell.start()
    return () => swell.destroy()
  }, [])

  return <div ref={host} className="aspect-video w-full" />
}
```

Do not put option values in the dependency array. That tears the context down and
rebuilds the whole field. Call `update()` instead:

```tsx
useEffect(() => {
  swellRef.current?.update({ falloff })
}, [falloff])
```

Note that `count`, `form` and `thickness` rebuild the instanced mesh when they
change, which is the one expensive thing here. The other options are free.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSwell } from '@/beamish/effects/swell/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let swell: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  swell = createSwell(host.value, { count: 18 })
  swell.start()
})

onBeforeUnmount(() => swell?.destroy())
</script>

<template>
  <div ref="host" class="field" />
</template>
```

**Astro.** Nothing extra is required. Use the React or Vue file as an island with
`client:visible`, or call `createSwell` from a plain `<script>` in the page.

**Driving it without a cursor.** Pass `pointerPath`, a list of `{ t, x, y }` keys
in 0 to 1 element coordinates, plus `pointerPathDuration`. The runtime samples it
at exactly the time being drawn and ignores the live pointer. That is how the
video on the site is recorded, and it is the way to run this as a hero that
animates on its own.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper the field stands on. Match it to your page background or the panel reads as a pasted-in rectangle. |
| `stone` | color | `#f2efe6` | any CSS hex | The forms at rest. Slightly lighter than the paper is what makes them read as objects standing on it. |
| `accent` | color | `#c44400` | any CSS hex | The forms at the crest of the ripple. The colour is what makes the wave legible in a still frame, so do not set it to the same value as stone. |
| `count` | number | `18` | 6 to 40 (looks right between 16 and 26) | Forms per side. 18 is 324 of them. Past 30 the forms are narrower than their own shadows and the field turns to fur. |
| `form` | enum | `cylinder` | `cylinder` · `box` | Shape of each form. Cylinders read as softer and hide the grid; boxes keep the rows visible, which suits a lower count. |
| `thickness` | number | `0.58` | 0.1 to 0.95 (looks right between 0.4 and 0.7) | Width of each form as a fraction of its cell. Above 0.9 neighbours touch and the field becomes a surface. |
| `base` | number | `0.14` | 0.01 to 1 (looks right between 0.05 and 0.3) | Height of a form at rest. Low is a floor that rises; high is a forest that sways. |
| `amplitude` | number | `1.9` | 0.1 to 4 (looks right between 1.2 and 2.6) | How far the crest rises above the base. |
| `frequency` | number | `1.9` | 0.5 to 8 (looks right between 1.5 and 3.5) | Rings per unit of distance. Above about 5 the rings are finer than the grid and it aliases into noise. |
| `falloff` | number | `0.26` | 0.05 to 2 (looks right between 0.18 and 0.6) | How quickly the ripple fades away from the cursor. Low spreads across the whole field; high is a tight pool underneath it. |
| `elevation` | number | `36` | 8 to 80 deg (looks right between 25 and 50) | Sun height above the horizon. Low throws long shadows between the forms, which is most of what gives the field depth. |
| `shadow` | number | `0.26` | 0 to 1 (looks right between 0.15 and 0.4) | How dark the shadows fall on the paper. The paper is never lit, so this is the only thing drawn on it. |
| `tilt` | number | `0.6` | 0 to 1 (looks right between 0.4 and 0.75) | Camera height. Zero is eye level with the paper, one looks straight down. Low is dramatic and hides the ripple; high shows the pattern and flattens the forms. |
| `zoom` | number | `0.8` | 0.3 to 1.6 (looks right between 0.6 and 1) | How much of the frame the field fills. |
| `period` | number | `5` | 2 to 60 s (looks right between 5 and 20) | Seconds for one loop of the idle swell, the motion used when no pointer is present. Exactly periodic, so the loop closes. |
| `reducedMotionTime` | number | `1.4` | 0 to 60 s | The single frame shown when the user prefers reduced motion. Pick a time where the idle swell has some variation across the field rather than one where it is flat. |

## 5. Cleanup and SSR

Call `destroy()`. It disposes the instanced mesh, its geometry and material, the
ground, the shadow map and the three.js renderer, then releases the WebGL context
itself.

A page that mounts and unmounts scenes without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createSwell` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A. The idle swell moves on its own for more than five
seconds, so it must be pausable. `stop()` and `start()` are on the handle for
that. Surface them as a real control in your own build.

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

Pick a time where the idle swell has variation across the field rather than one
where it happens to be flat. The still is the whole effect for those users, and a
flat grid of identical pins is not worth looking at.

## 7. The three mistakes most likely to be made here

1. **Raising `count` to make it look finer.** Past about 30 per side the forms
   are narrower than their own shadows, the field turns to fur, and the shadow
   pass gets expensive. If you want finer, lower `thickness` instead. The shadow
   map is the cost here, not the geometry.

2. **Putting it in a short, wide banner.** The camera frames the field, so a
   1600×200 strip shows you the front two rows and nothing else. Give it
   something close to 16:9 or squarer.

3. **Setting `accent` to the same value as `stone`.** The tint is what makes the
   ripple readable when it is not moving, which is every poster, every
   screenshot, and every visitor who has asked for reduced motion.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/effects/swell/adapters/react.tsx
- https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/effects/swell/adapters/vue.ts

---

Concept credit: the wave-propagation grid, by Codrops, https://tympanus.net/codrops/2026/07/09/building-an-interactive-wave-propagation-cube-grid-with-three-js/.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
