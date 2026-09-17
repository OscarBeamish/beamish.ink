You are adding **Vellum** from Beamish to this project.

> A drifting stack of translucent paper that goes darker where the sheets cross. Backdrops · effect · MIT.
> https://beamish.ink/effects/vellum

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL1 or better
- three.js must already be a dependency of the project. It is not bundled
- The sheets multiply rather than composite, which is order-independent, so the whole pile is one InstancedMesh and there is no transparency sorting to get wrong
- Nothing in the scene can be brighter than the paper. A multiply has no way to add light, so there is no specular highlight and there cannot be one
- No shadow map. Nothing here is opaque enough to cast one
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/vellum/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/vellum/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

A loose stack of translucent paper, drifting. Where two sheets cross the paper
goes darker, and you can read the order of the pile by how dark it gets.

The blend mode is the whole design. These sheets multiply rather than composite:
the result is destination times source, which is what a diffusing sheet laid over
another one actually does. More usefully, multiplying is order-independent. Two
sheets crossing give the same answer whichever is drawn first.

That matters more than it sounds. Ordinary alpha-blended transparency has to be
sorted back to front, and there is no way to sort inside a single InstancedMesh,
so stacked-plane scenes usually either flicker as the sort order flips or give up
on instancing and take a draw call per sheet. Multiplying sidesteps the problem
rather than solving it. Fourteen sheets draw in one call, in any order, and the
picture is the same.

The cost is real and worth stating. Nothing here can be brighter than the paper.
A multiply has no way to add light, so there is no specular highlight and there
cannot be one. Where a sheet turns into the light it fades toward no tint at all,
which within a multiply is the only direction "brighter" exists in, and which
happens to be what paper catching a lamp looks like anyway.

There is no shadow map either. Nothing in the scene is opaque enough to cast one,
and a translucent sheet throwing a hard shadow is the tell that gives these scenes
away. The overlaps are the depth cue.

Concept credit: [Infinite Liquid Glass
Grid](https://tympanus.net/codrops/), Codrops, September 2026, for the idea that
the glass can be faked in the shader with no refraction pass at all. Written from
scratch, and recast from glass to paper.

## 3. Wire it in

**Plain HTML.** three.js has to be a dependency of your project already. It is
not bundled and it is not fetched.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createVellum } from './beamish/effects/vellum/core.js'

  const vellum = createVellum(document.querySelector('#backdrop'), {
    sheets: 14,
    period: 30
  })
  vellum.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createVellum } from '@/beamish/effects/vellum/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const vellum = createVellum(host.current, { period: 30 })
    vellum.start()
    return () => vellum.destroy()
  }, [])

  return <div ref={host} className="fixed inset-0 -z-10" />
}
```

Do not put option values in the dependency array. Call `update()` instead. Every
option but one is a uniform or a camera value, so nothing rebuilds.

The exception is `sheets`. Changing the count disposes the geometry and builds a
new InstancedMesh, so do not animate it or bind it to a slider that fires on every
pixel of drag.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createVellum } from '@/beamish/effects/vellum/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let vellum: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  vellum = createVellum(host.value, { period: 30 })
  vellum.start()
})

onBeforeUnmount(() => vellum?.destroy())
</script>

<template>
  <div ref="host" class="backdrop" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

**Behind content.** Bring `density` down to about 0.06 and raise `period` to 30.
Fourteen sheets compound fast, and the middle of the pile is where they all cross,
so that is where your text will be. Do not reach for opacity: it greys the paper
and loses the thing that makes the overlaps look like paper rather than like
layers.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper behind the stack. Everything else multiplies down from here, so this is the lightest value in the scene. |
| `ink` | color | `#9a8e79` | any CSS hex | What each sheet multiplies the paper by. Most of the stack is this. A warm grey reads as tracing paper; push it green and it becomes drafting film. |
| `accent` | color | `#c44400` | any CSS hex | Roughly one sheet in five is printed in this instead. Never the first, so the accent always has something crossing it. |
| `sheets` | number | `14` | 3 to 30 | How many sheets. Changing it rebuilds the pile, which is the one option here that is not free. Depth is by index, so a new sheet lands on top rather than shuffling the stack. |
| `density` | number | `0.12` | 0.02 to 0.5 | How dark one sheet is on its own. The stack compounds from here, so small numbers go a long way: fourteen sheets at 0.3 is a solid brown blot in the middle where they all cross. Behind content, come down rather than reaching for opacity. |
| `spread` | number | `1` | 0.2 to 2 | How far the sheets are scattered. Low is a neat pile with heavy overlap, high is a table strewn with them. |
| `radius` | number | `0.08` | 0 to 0.5 | Corner radius of a sheet. Real vellum is guillotined rather than die-cut, so keep it small. It exists so the corners do not read as a hard polygon. |
| `sheen` | number | `0.55` | 0 to 1 | How much a sheet lifts toward the light as it turns into it. Within a multiply this can only mean less tint, never more light, which is what paper catching a lamp actually looks like. |
| `fibre` | number | `0.5` | 0 to 1 | Paper fibre. At zero the sheets are film rather than paper. |
| `elevation` | number | `34` | 0 to 90 | Light height above the horizon, degrees. |
| `azimuth` | number | `42` | 0 to 360 | Light direction around the compass, degrees. |
| `tilt` | number | `0.42` | 0 to 1 | Camera height. 0 is edge on to the pile, which is mostly cut edges. 1 looks straight down at it. |
| `zoom` | number | `0.62` | 0.15 to 1.4 | How much of the frame the stack fills. |
| `period` | number | `12` | 2 to 60 | Seconds for one loop of the drift. Every sheet travels a closed circle, so the pile returns to exactly where it started and the loop is seamless. Behind content, raise it. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, disposes the geometry and material,
cancels the RAF, disconnects both observers and removes every listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever runs
out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createVellum` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable. `stop()` and `start()` are on the handle for that. Surface them as a
real control in your own build. Reduced motion does not cover this, and plenty of
people who need a pause button have not set that preference.

Handled in the runtime with a live `matchMedia` listener. Under reduced motion the
loop never starts and one frame is drawn at `reducedMotionTime`.

Any frame of this is a finished picture, so the default is as good as any other
number. If you want a particular arrangement, scrub `renderAtTime` until you find
one you like and set `reducedMotionTime` to it.

## 7. The three mistakes most likely to be made here

1. **Raising `density` to make it more visible.** It compounds. One sheet at 0.3
   looks reasonable and fourteen of them produce a solid brown blot in the middle
   where they all cross. If the effect is too faint, add sheets or reduce `spread`
   so they overlap more. Density is the last thing to touch.

2. **Expecting a highlight.** There is no way to add light inside a multiply. If
   you need a sheet to gleam, `sheen` is as far as it goes, and what it does is
   remove tint rather than add brightness.

3. **Animating `sheets`.** It is the one option that rebuilds. Everything else is
   free to change per frame; this one disposes a geometry and allocates a new
   InstancedMesh.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing. Give the host `position: fixed; inset: 0`, or an
   explicit height.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/vellum/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/vellum/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
