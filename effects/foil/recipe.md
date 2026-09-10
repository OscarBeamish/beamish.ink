## What it is

Foil is a hot-foil stamp pressed into paper, and the cursor is the light. Move it
and the highlight rakes across the relief the way tilting a real foil-stamped
card does: a narrow band of brightness travelling over a brushed surface, picking
up a little colour at the grazing edges.

There is no image and no texture. The stamp is a signed-distance rosette with a
brushed relief written into its height field. The light is a point source sitting
just above the surface at the cursor. Everything you see is that height field,
its gradient, and one specular term. WebGL2, one full-screen triangle, no npm
dependencies.

It is pointer-driven, never pointer-dependent. With no cursor, on touch, or
before anyone has moved the mouse, the light takes a slow closed orbit of its
own. The panel is alive on arrival and the loop still has no seam.

## Wiring

**Plain HTML.** Give the host element a size. The canvas fills it, so an element
with no height renders nothing.

```html
<div id="stamp" style="width: 100%; aspect-ratio: 1"></div>

<script type="module">
  import { createFoil } from './beamish/effects/foil/core.js'

  const foil = createFoil(document.querySelector('#stamp'), {
    foilHigh: '#f0b070'
  })
  foil.start()
</script>
```

**React.** Start in an effect. Destroy in its cleanup. StrictMode runs the effect
twice in development. That is fine, because `destroy()` fully releases the
context, which is the case StrictMode exists to catch.

```tsx
import { useEffect, useRef } from 'react'
import { createFoil } from '@/beamish/effects/foil/core'

export function Stamp() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const foil = createFoil(host.current, { spokes: 12 })
    foil.start()
    return () => foil.destroy()
  }, [])

  return <div ref={host} className="aspect-square w-full" />
}
```

Do not put option values in the dependency array. That tears the context down and
rebuilds it on every keystroke. Call `update()` instead:

```tsx
useEffect(() => {
  foilRef.current?.update({ spokes })
}, [spokes])
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createFoil } from '@/beamish/effects/foil/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let foil: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  foil = createFoil(host.value, { spokes: 12 })
  foil.start()
})

onBeforeUnmount(() => foil?.destroy())
</script>

<template>
  <div ref="host" class="stamp" />
</template>
```

**Astro.** Nothing extra is required. Use the React or Vue file as an island with
`client:visible`, or call `createFoil` from a plain `<script>` in the page. The
core is a standard ES module with no framework in it.

**Driving the light yourself.** The pointer is read from the element the effect
is mounted into. To drive the light from something else, a scripted path, a
scroll position, or an element elsewhere on the page, pass `pointerPath` as a
list of `{ t, x, y }` keys in 0 to 1 element coordinates, plus
`pointerPathDuration`. The runtime samples it at exactly the time being drawn and
ignores the live pointer. That is how the video on the site is recorded.

## Cleanup and SSR

Call `destroy()`. It releases the WebGL context, cancels the RAF, disconnects
both observers, and removes every listener including the pointer ones.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createFoil` touches `document` and `matchMedia`
at call time. Put the call inside `useEffect`, `onMounted`, or a `client:*`
island. Next.js App Router needs `'use client'` at the top of the component file.

The runtime pauses the loop when the element scrolls offscreen and when the tab
is hidden.

## Pausing

WCAG 2.2.2 is Level A. Content that moves for more than five seconds must be
pausable, and the idle orbit qualifies. `stop()` and `start()` are on the handle
for that. Surface them as a real control in your own build.

Stopping the loop holds the last frame. The motion pauses and the object stays on
screen, which is the correct behaviour.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener, so changing the OS
setting mid-session takes effect without a reload. Under reduced motion the idle
orbit never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

Foil degrades unusually well. A stamped emblem lit from one side is a finished
thing to look at and nobody would guess it was meant to move. Pick a light angle
where the relief is legible rather than one where the highlight is brightest.

## Common mistakes

1. **Mounting it into a wide, short element.** The stamp is sized against the
   shorter side, so in a 1200×200 banner it is 200px across with a lot of paper
   either side. Use something square, or raise `scale`.

2. **Making `foilLow` too light.** Metal has almost no diffuse term. Nearly all
   of its colour comes from the highlight, which is why real foil looks like foil
   and a matte print does not. A mid-tone `foilLow` turns the stamp into a flat
   coloured shape with a shine on it. Take it darker than feels right.

3. **Assuming it needs a mouse.** It does not. With no pointer the light orbits
   on its own, so it works on touch and in a screenshot. Do not hide it on small
   screens or gate it behind a hover media query.
