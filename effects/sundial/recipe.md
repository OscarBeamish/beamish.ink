## What it is

Sundial is a still life. Seven matte forms stand on paper, lit by one sun that
makes a complete circuit over the loop. The forms never move. The shadows are the
subject: they lengthen, swing round, cross each other, and arrive back exactly
where they started.

It is a real three.js scene. A perspective camera, seven meshes, standard
materials, a directional light with a shadow map, and a dim bounce light standing
in for light coming back off the paper. Not a full-bleed shader pretending to be
three-dimensional.

The paper is never lit. It is the scene background, and the ground plane is a
`ShadowMaterial` that draws nothing but the shadow. A lit plane picks up the sun
at a grazing angle and lands around 85% of its own colour, which on warm paper is
a warm grey. This way the paper comes out the colour you asked for.

The forms sit in the middle and the sun keeps the edges clear, so there is room
for a headline over the top. That is what it is for.

## Wiring

**Plain HTML.** three.js must already be available to your build. This file
imports it and does not bundle it.

```html
<div id="hero" style="width: 100%; aspect-ratio: 16 / 9"></div>

<script type="module">
  import { createSundial } from './beamish/effects/sundial/core.js'

  const sundial = createSundial(document.querySelector('#hero'), {
    accent: '#c44400'
  })
  sundial.start()
</script>
```

**React.** Start in an effect. Destroy in its cleanup. StrictMode runs the effect
twice in development. That is fine, because `destroy()` fully releases the
context, which is the case StrictMode exists to catch.

```tsx
import { useEffect, useRef } from 'react'
import { createSundial } from '@/beamish/effects/sundial/core'

export function Hero() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sundial = createSundial(host.current, { accent: '#c44400' })
    sundial.start()
    return () => sundial.destroy()
  }, [])

  return <div ref={host} className="aspect-video w-full" />
}
```

Do not put option values in the dependency array. That tears the WebGL context
down and rebuilds the whole scene on every keystroke. Call `update()` instead:

```tsx
useEffect(() => {
  sundialRef.current?.update({ elevation })
}, [elevation])
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSundial } from '@/beamish/effects/sundial/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let sundial: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sundial = createSundial(host.value, { accent: '#c44400' })
  sundial.start()
})

onBeforeUnmount(() => sundial?.destroy())
</script>

<template>
  <div ref="host" class="hero" />
</template>
```

**Astro.** Nothing extra is required. Use the React or Vue file as an island with
`client:visible`, or call `createSundial` from a plain `<script>` in the page. The
core is a standard ES module.

## Cleanup and SSR

Call `destroy()`. It disposes every geometry, material and shadow map, disposes
the three.js renderer, then releases the WebGL context itself.

A page that mounts and unmounts scenes without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createSundial` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

The runtime pauses the loop when the element scrolls offscreen and when the tab
is hidden, so the shadow map is not being redrawn behind a modal.

## Pausing

WCAG 2.2.2 is Level A and it applies here. Content that moves for more than five
seconds must be pausable. `stop()` and `start()` are on the handle for that.
Surface them as a real control in your own build. A small button in the corner is
enough.

Reduced motion does not cover this. Plenty of people who need a pause button have
not set that preference.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener, so changing the OS
setting mid-session takes effect without a reload. Under reduced motion the loop
never starts and one frame is drawn instead, the one at `reducedMotionTime`.

This effect degrades better than most. One frame of it is a photograph, which is
a perfectly good thing for a hero to be. Choose a sun angle where the shadows
rake across the composition rather than hiding behind the forms.

## Common mistakes

1. **Not installing three.js, or installing a version older than 0.160.** This
   file imports `three` and does not bundle it. `ShadowMaterial`, `SRGBColorSpace`
   and the current light-intensity model all need a recent version. On an old one
   the scene renders about twice as dark and nothing obviously errors.

2. **Mounting into an element with no height.** The canvas is `width: 100%;
   height: 100%`. A `<div>` with no content and no CSS height is zero pixels tall
   and renders nothing. Give the host an `aspect-ratio` or an explicit height.

3. **Raising `elevation` to see it better.** Above about 60 degrees the sun is
   nearly overhead, the shadows vanish underneath the forms, and the scene goes
   flat. If it looks too dark, lower `shadow` towards 0.2 or lighten `stone`. Do
   not move the sun up.
