## What it is

A sheet of handmade paper held up to the light.

Everything here is thickness. Paper is translucent, so what you see against a
light is not ink but where the sheet is thinner and lets more through. That is
the whole premise, and it is why nothing in this effect darkens: every term
lightens the paper, because every term is somewhere the paper is thinner.

Three of them come from the mould the sheet was formed on, not from the pulp.
The **laid lines** are its close-set wires, so the sheet is very slightly thinner
over each one. The **chain lines** are the heavier wires at right angles holding
those together, an inch or so apart. And the **formation** is the cloudiness:
fibres never settle evenly, and that blotchy variation is most of what separates
a handmade sheet from a machine one.

The fourth is the watermark proper, a wire device sewn onto the mould. The sheet
is much thinner there, which is why a watermark is brighter than everything
around it and why it only shows against a light.

Laid lines are drawn as a ripple and chain lines as a band, which is not an
arbitrary difference. A forming sheet follows fine wires and is drawn down
sharply over thick ones.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## Where it goes

Under everything, at the full width of the page.

A watermark is not a pattern you look at. It is the sheet the page is printed
on, which means it belongs behind the whole document rather than inside a panel,
and the test of it is that somebody scrolling past never consciously notices it
and would notice at once if it were gone.

So it wants to be larger than it looks like it should be. The laid lines read as
texture at full page width and as stripes in a 600px box. Give it the viewport.

The countermark is the one part that is meant to be found rather than felt. Put
it where a watermark would actually sit: off to one side, around a third of the
way down, well away from anything anyone has to read. `device` at zero turns it
off entirely and leaves you the sheet, which is a perfectly good way to use
this.

## Wiring

**Plain HTML.** The element needs a size of its own.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createWatermarkSheet } from './beamish/effects/watermark-sheet/core.js'

  const sheet = createWatermarkSheet(document.querySelector('#backdrop'), {
    period: 60
  })
  sheet.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createWatermarkSheet } from '@/beamish/effects/watermark-sheet/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sheet = createWatermarkSheet(host.current, { period: 60 })
    sheet.start()
    return () => sheet.destroy()
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
import { createWatermarkSheet } from '@/beamish/effects/watermark-sheet/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let sheet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sheet = createWatermarkSheet(host.value, { period: 60 })
  sheet.start()
})

onBeforeUnmount(() => sheet?.destroy())
</script>

<template>
  <div ref="host" class="backdrop" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

## Getting the paper you want

`paper` wants to be a shade or two deeper than the page it sits on, because
everything here brightens and a sheet already at the page colour has nowhere to
go. That is the one setting people get wrong first.

`chainPitch` is the quickest way to stop it looking like paper. On a real mould
the chain wires sit about an inch apart, so a handful across the sheet is right.
Crowding them turns it into corduroy.

`formation` at 0 gives you cartridge paper: perfectly even, machine made, and
dull. It is the cloudiness that makes a sheet look handled.

Set `device` to 0 for a plain laid sheet. Not every sheet carries a watermark,
and a backdrop behind a lot of text is usually better without one.

## Behind content

Drop `device` to 0 and bring `laid` and `chain` down by about half. The sheet
becomes a texture you stop noticing, which is what paper is supposed to be.

Do not reach for opacity. It flattens the sheet toward the page and loses the
difference between the thin parts and the thick parts, which is the only thing
being drawn here.

## Pausing

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable. `stop()` and `start()` are on the handle for that. Surface them as a
real control in your own build. Reduced motion does not cover this, and plenty of
people who need a pause button have not set that preference.

The movement is very slow by default, a full tilt taking sixteen seconds. That
does not exempt it.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`.

Any frame of this is a sheet of paper, so the default is as good as any other
number.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. `createWatermarkSheet` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'`.

## Common mistakes

1. **Leaving `paper` the same colour as the page.** Everything here lightens, so
   a sheet that already matches the page has nothing to brighten into and the
   whole effect disappears. Go a shade or two deeper.

2. **Raising `chainPitch` for more texture.** Chain wires sit an inch apart on a
   real mould. Crowding them is the single fastest way to stop it reading as
   paper. If you want more texture, that is `laidPitch`.

3. **Setting `formation` to 0.** You have made cartridge paper. The unevenness is
   the handmade part.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing. Give the host `position: fixed; inset: 0`, or an
   explicit height.
