## What it is

Overprint is a full-bleed background that behaves like a two-colour print rather
than like a light source. Two ink plates — a desaturated near-black and a burnt
orange — are screened into halftone dots at different angles, then multiplied
over the paper colour the way a second pass of ink actually behaves. Over the
loop the plates slide fractionally out of registration, which is the misprint
that makes a risograph look alive.

It is a single WebGL2 fragment shader on one full-screen triangle. No three.js,
no textures, no render targets, no dependencies at all.

The whole thing is designed for a light background. On black it does nothing,
because multiplying ink into black gets you black.

The defaults are tuned to be looked at — dense, confident, plenty of solid ink.
If you are putting text on top of it, that is too much: drop `coverage` to around
0.2 and raise `period` to 15 or so, and it recedes into a texture you stop
noticing. Do that rather than reaching for opacity, which greys the paper and
loses the thing that makes it look printed.

## Wiring

**Plain HTML.** The element needs a size of its own — the canvas fills it, so an
element with no height renders nothing.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createOverprint } from './beamish/effects/overprint/core.js'

  const overprint = createOverprint(document.querySelector('#backdrop'), {
    inkB: '#c44400'
  })
  overprint.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. In StrictMode the effect
runs twice in development; that is fine, because `destroy()` fully releases the
context — which is exactly the case StrictMode exists to catch.

```tsx
import { useEffect, useRef } from 'react'
import { createOverprint } from '@/beamish/effects/overprint/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const overprint = createOverprint(host.current, { inkB: '#c44400' })
    overprint.start()
    return () => overprint.destroy()
  }, [])

  return <div ref={host} className="fixed inset-0 -z-10" />
}
```

Do not put option values in the dependency array — that tears the context down
and rebuilds it on every keystroke. Call `update()` instead:

```tsx
useEffect(() => {
  effectRef.current?.update({ coverage })
}, [coverage])
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createOverprint } from '@/beamish/effects/overprint/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let overprint: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  overprint = createOverprint(host.value, { inkB: '#c44400' })
  overprint.start()
})

onBeforeUnmount(() => overprint?.destroy())
</script>

<template>
  <div ref="host" class="backdrop" />
</template>
```

**Astro.** Nothing special is needed. Use the React or Vue file as an island with
`client:visible`, or call `createOverprint` from a plain `<script>` in the page —
the core is a standard ES module with no framework in it.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. Call it. A page that mounts and unmounts
demos without destroying them will hit the browser's context limit — sixteen
contexts *or* sixteen million pixels, whichever comes first — and the browser
will start killing the oldest one.

None of this can run on the server. `createOverprint` touches `document` and
`matchMedia` at call time, so it must be inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

The runtime already pauses the loop when the element scrolls offscreen and when
the tab is hidden, so a background does not burn a GPU behind a modal.

## Pausing

WCAG 2.2.2 is Level A and it applies to this: content that moves for more than
five seconds must be pausable. `stop()` and `start()` are on the handle for
exactly that reason. Surface them as a real control in your own build — a small
button in the corner of the panel is enough — rather than assuming reduced motion
covers it. It does not; plenty of people who need a pause button have not set
that preference.

## Reduced motion

Handled in the runtime, with a live `matchMedia` listener so toggling the OS
setting mid-session takes effect without a reload. Under reduced motion the loop
never starts and a single frame is drawn instead — the one at `reducedMotionTime`.

That default is chosen, not zero: the frame at zero has the plates in perfect
registration and looks like a mistake. Pick a time where the two plates are
visibly offset, so the still reads as a composed image rather than a failure.

## Common mistakes

1. **Mounting into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and you get nothing. Give the host `position: fixed; inset: 0`, or an
   explicit height.

2. **Leaving `paper` at the default when your page is not off-white.** Every
   other colour is multiplied over it, so a mismatch shows as a hard rectangle
   where the panel ends. Set `paper` to your actual background colour first, then
   tune the inks.

3. **Pushing `screen` high to make it look finer.** Past about 40 dots per 100px
   the halftone stops resolving, starts aliasing against the pixel grid, and
   turns into noise that shimmers when the plates drift. If you want finer,
   lower `coverage` instead.
