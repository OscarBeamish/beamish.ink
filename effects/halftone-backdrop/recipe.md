## What it is

Overprint is a full-bleed background that behaves like a two-colour print. Two
ink plates, a desaturated near-black and a burnt orange, are screened into
halftone dots at different angles and multiplied over the paper colour. That is
what a second pass of ink does to the first. Over the loop the plates slide
fractionally out of registration, which is the misprint that makes a risograph
look alive.

It is one WebGL2 fragment shader on one full-screen triangle. No three.js, no
textures, no render targets, no npm dependencies.

It needs a light background. Multiplying ink into black gets you black.

The defaults are tuned to be looked at: dense, plenty of solid ink. If you are
putting text on top, that is too much. Drop `coverage` to about 0.2 and raise
`period` to 15. Do not reach for opacity instead. Opacity greys the paper and
loses the thing that makes it look printed.

## Wiring

**Plain HTML.** Give the host element a size. The canvas fills it, so an element
with no height renders nothing.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createHalftoneBackdrop } from './beamish/effects/halftone-backdrop/core.js'

  const overprint = createHalftoneBackdrop(document.querySelector('#backdrop'), {
    inkB: '#c44400'
  })
  overprint.start()
</script>
```

**React.** Start in an effect. Destroy in its cleanup. StrictMode runs the effect
twice in development. That is fine, because `destroy()` fully releases the
context, which is the case StrictMode exists to catch.

```tsx
import { useEffect, useRef } from 'react'
import { createHalftoneBackdrop } from '@/beamish/effects/halftone-backdrop/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const overprint = createHalftoneBackdrop(host.current, { inkB: '#c44400' })
    overprint.start()
    return () => overprint.destroy()
  }, [])

  return <div ref={host} className="fixed inset-0 -z-10" />
}
```

Do not put option values in the dependency array. That tears the context down and
rebuilds it on every keystroke. Call `update()` instead:

```tsx
useEffect(() => {
  effectRef.current?.update({ coverage })
}, [coverage])
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createHalftoneBackdrop } from '@/beamish/effects/halftone-backdrop/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let overprint: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  overprint = createHalftoneBackdrop(host.value, { inkB: '#c44400' })
  overprint.start()
})

onBeforeUnmount(() => overprint?.destroy())
</script>

<template>
  <div ref="host" class="backdrop" />
</template>
```

**Astro.** Nothing extra is required. Use the React or Vue file as an island with
`client:visible`, or call `createHalftoneBackdrop` from a plain `<script>` in the page.
The core is a standard ES module with no framework in it.

## Cleanup and SSR

Call `destroy()`. It releases the WebGL context, cancels the RAF, disconnects
both observers and removes every listener.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createHalftoneBackdrop` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

The runtime already pauses the loop when the element scrolls offscreen and when
the tab is hidden.

## Pausing

WCAG 2.2.2 is Level A and it applies here. Content that moves for more than five
seconds must be pausable. `stop()` and `start()` are on the handle for that.
Surface them as a real control in your own build. A small button in the corner of
the panel is enough.

Reduced motion does not cover this. Plenty of people who need a pause button have
not set that preference.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener, so changing the OS
setting mid-session takes effect without a reload. Under reduced motion the loop
never starts and one frame is drawn instead, the one at `reducedMotionTime`.

Set that value deliberately. The frame at zero has the plates in perfect
registration and looks like a mistake. Pick a time where the plates are visibly
offset.

## Common mistakes

1. **Mounting into an element with no height.** The canvas is `width: 100%;
   height: 100%`. A `<div>` with no content and no CSS height is zero pixels tall
   and renders nothing. Give the host `position: fixed; inset: 0`, or an explicit
   height.

2. **Leaving `paper` at the default when the page is not off-white.** Every other
   colour is multiplied over it, so a mismatch shows as a hard rectangle where
   the panel ends. Set `paper` to the actual background colour first, then tune
   the inks.

3. **Raising `screen` to make it look finer.** Past about 20 dots per 100px the
   halftone stops resolving, aliases against the pixel grid, and turns into noise
   that shimmers as the plates drift. Lower `coverage` instead.
