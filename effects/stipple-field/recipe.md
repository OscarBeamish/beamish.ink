## What it is

A stipple drawing. Tone is carried by how many marks there are, not how big they
are.

That is the whole distinction from a halftone, and it is worth being exact about,
because the two look superficially alike and the difference is the entire reason
this exists alongside HalftoneBackdrop. A halftone puts a dot in the middle of
every cell of a regular grid and varies its size: the count is fixed and the area
does the work. A stipple engraver has one nib. Every mark is the same size, and
darker means more marks, closer together.

So the grid here is only a way of avoiding a sort. Each cell holds at most one
mark, thrown off the centre by a hash, and whether it exists at all comes from
comparing a second hash against the tone wanted at that point. Off-grid positions
and a population that thins out is what reads as a hand rather than as a screen.

Each pixel is tested against the nine cells around it rather than only its own. A
mark thrown off centre crosses into its neighbour, and testing one cell would
slice it at the boundary: the jitter would then read as marks being cut rather
than as marks being scattered.

The tone field drifts on a closed orbit through noise space, so the loop returns
to exactly where it started rather than being crossfaded.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## The hand

The cursor works the drawing up where it sits.

Tone is how many marks there are, so a hand shading a passage is adding marks to
it, and that is literally what `touch` does: it raises the tone under the
pointer and the population thickens to match. The falloff is a Gaussian, with no
edge to find. A circle of denser stipple with a findable boundary reads as a
torch being shone on the drawing rather than as somebody working on it.

Raising the tone is not enough on its own, and this is worth knowing before you
turn `touch` up and conclude it is broken. Tone saturates. A passage already
carrying a mark in every cell cannot take another one, so the hand shows up
beautifully in the light and does nothing at all in the darks. So it changes the
nib as well: the share of marks taking the accent rises under the pointer, which
is something a dense passage can answer to.

Set `touch` to zero for a field that is purely ambient. Everything else carries
on as before, and nothing about the pointer is integrated, so a scripted path
replays exactly and `renderAtTime` is still pure in `t`.

## Wiring

**Plain HTML.** The element needs a size of its own.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createStippleField } from './beamish/effects/stipple-field/core.js'

  const stipple = createStippleField(document.querySelector('#backdrop'), {
    period: 60
  })
  stipple.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createStippleField } from '@/beamish/effects/stipple-field/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const stipple = createStippleField(host.current, { period: 60 })
    stipple.start()
    return () => stipple.destroy()
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
import { createStippleField } from '@/beamish/effects/stipple-field/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let stipple: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  stipple = createStippleField(host.value, { period: 60 })
  stipple.start()
})

onBeforeUnmount(() => stipple?.destroy())
</script>

<template>
  <div ref="host" class="backdrop" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

## Tuning it

`pitch` and `weight` are the two that matter and they pull against each other.
`pitch` is the spacing of the cells in CSS pixels, so it sets how close marks can
get. `weight` is the radius of a mark in cells, so it sets how much of that space
a mark fills. Past about 0.4 the marks touch at full density and the dark areas
become a solid, which is a wash rather than a stipple.

`jitter` is what makes it a drawing. At 0 the marks sit on a grid and you have
built a bad halftone. At 1 a mark can be anywhere in its cell and the grid is
undetectable, which is where it should usually live.

`contrast` is applied about the midtone, so raising it opens the field out in
both directions rather than dragging the whole thing dark.

## Behind content

Raise `pitch` to about 12 and drop `contrast` to 1.2. The field becomes an even
tooth you stop noticing, which is what a stippled background is for.

Do not reach for opacity. It greys the marks and the paper together and loses the
thing that makes it look drawn rather than printed.

## Pausing

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable. `stop()` and `start()` are on the handle for that. Surface them as a
real control in your own build. Reduced motion does not cover this, and plenty of
people who need a pause button have not set that preference.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`.

This effect needs no care here. Any frame of it is a finished drawing, so the
default is as good as any other number.

The hand does not work under reduced motion. The runtime draws one frame and
never starts a loop, so there is nothing running to pick the pointer up. What
you get is a finished stipple drawing, which is the right thing to be left
with.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. `createStippleField` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

## Common mistakes

1. **Turning `weight` up to make it darker.** It makes every mark fatter, which
   is what a halftone does and what this is deliberately not. Density is the
   lever: lower `pitch` or raise `contrast`.

2. **Setting `jitter` to 0.** The grid reappears immediately and the whole thing
   reads as a cheap screen. If the marks look too chaotic the answer is a smaller
   `pitch`, not less jitter.

3. **A very small `pitch` on a full-width hero.** At three pixels a cell there
   are hundreds of thousands of cells and the marks are below what the eye
   resolves, so you have paid for a stipple and got a grey wash.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing. Give the host `position: fixed; inset: 0`, or an
   explicit height.
