## What it is

Guilloche is the engine-turned line work off a banknote, a share certificate or
the bezel of a watch, drawn on warm paper.

It is not noise and it is not a gradient. A real rose engine cuts one continuous
line whose radius is modulated by a set of gears, so the result is a family of
curves in a strict harmonic relationship. That is what this draws: three
rosettes, each a circle whose radius wobbles at a whole number of lobes, rendered
as a line field rather than a fill, and multiplied together the way overlapping
ink actually behaves.

The whole-number lobe counts matter. A fractional count gives a curve that never
closes, and an open curve reads as a mistake rather than as engraving. The three
families are kept coprime so their interference takes a long time to repeat and
never settles into a grid.

One band is printed in a second colour, riding the same field, the way a
certificate prints one guilloche in red over the rest in black. It is part of the
engraving rather than a highlight laid on top of it.

One WebGL2 fragment shader on one full-screen triangle. No noise, no textures, no
render targets. It is the cheapest effect in the library.

## Wiring

**Plain HTML.** The element needs a size of its own.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createGuillocheLines } from './beamish/effects/guilloche-lines/core.js'

  const guilloche = createGuillocheLines(document.querySelector('#backdrop'), {
    lobes: 7,
    period: 40
  })
  guilloche.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createGuillocheLines } from '@/beamish/effects/guilloche-lines/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const guilloche = createGuillocheLines(host.current, { period: 40 })
    guilloche.start()
    return () => guilloche.destroy()
  }, [])

  return <div ref={host} className="fixed inset-0 -z-10" />
}
```

Do not put option values in the dependency array. Call `update()` instead: every
option is a uniform, so nothing rebuilds.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createGuillocheLines } from '@/beamish/effects/guilloche-lines/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let guilloche: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  guilloche = createGuillocheLines(host.value, { period: 40 })
  guilloche.start()
})

onBeforeUnmount(() => guilloche?.destroy())
</script>

<template>
  <div ref="host" class="backdrop" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

**Behind content.** Raise `period` to 40 and drop `weight` to about 0.2. The
engraving recedes into a watermark you stop noticing, which is what a certificate
background is for. Do not reach for opacity: it greys the paper and loses the
thing that makes it look printed.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createGuillocheLines` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

## Pausing

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable. `stop()` and `start()` are on the handle for that. Surface them as a
real control in your own build. Reduced motion does not cover this, and plenty of
people who need a pause button have not set that preference.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`.

This effect needs no care here. Any frame of it is an engraving, which is a
finished thing to look at, so the default is as good as any other number.

## Common mistakes

1. **Passing a fractional `lobes`.** The curve then never closes on itself, and
   what you get is a spiral with a visible join rather than a rosette. The option
   is stepped to whole numbers for that reason; if you set it from code, round it.

2. **Raising `pitch` and `weight` together.** Fine lines and heavy weight fill in
   solid, and the centre of the rosette goes black first because that is where
   the field changes fastest. Raise one and lower the other.

3. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing. Give the host `position: fixed; inset: 0`, or an
   explicit height.
