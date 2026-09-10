## What it is

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

## Wiring

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

## Cleanup and SSR

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

## Pausing

WCAG 2.2.2 is Level A. The idle swell moves on its own for more than five
seconds, so it must be pausable. `stop()` and `start()` are on the handle for
that. Surface them as a real control in your own build.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

Pick a time where the idle swell has variation across the field rather than one
where it happens to be flat. The still is the whole effect for those users, and a
flat grid of identical pins is not worth looking at.

## Common mistakes

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
