## What it is

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

## Wiring

**Plain HTML.** three.js has to be a dependency of your project already. It is
not bundled and it is not fetched.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createTranslucentSheets } from './beamish/effects/translucent-sheets/core.js'

  const vellum = createTranslucentSheets(document.querySelector('#backdrop'), {
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
import { createTranslucentSheets } from '@/beamish/effects/translucent-sheets/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const vellum = createTranslucentSheets(host.current, { period: 30 })
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
import { createTranslucentSheets } from '@/beamish/effects/translucent-sheets/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let vellum: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  vellum = createTranslucentSheets(host.value, { period: 30 })
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

## Performance

One draw call whatever the sheet count, and two triangles per sheet. The geometry
is nothing.

Fill rate is the cost instead. Every sheet is deliberately larger than the frame,
so a stack of fourteen means the fragment shader runs over the whole viewport
something like fourteen times. That is fine on a laptop and it is the number to
come down on if a phone struggles. Halve `sheets` before you touch anything else.

The instance matrices are rebuilt on the CPU every frame, which is fourteen
`compose` calls into pre-allocated scratch vectors. It allocates nothing.

## Cleanup and SSR

`destroy()` releases the WebGL context, disposes the geometry and material,
cancels the RAF, disconnects both observers and removes every listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever runs
out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createTranslucentSheets` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

## Pausing

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable. `stop()` and `start()` are on the handle for that. Surface them as a
real control in your own build. Reduced motion does not cover this, and plenty of
people who need a pause button have not set that preference.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion the
loop never starts and one frame is drawn at `reducedMotionTime`.

Any frame of this is a finished picture, so the default is as good as any other
number. If you want a particular arrangement, scrub `renderAtTime` until you find
one you like and set `reducedMotionTime` to it.

## Common mistakes

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
