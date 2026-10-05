## What it is

Iron filings scattered over a magnet, and the magnet is the cursor.

Filings do not point at a magnet. That is the thing most versions of this get
wrong, and it is why most of them look like a starburst rather than like a
physics demonstration. Filings align with the **field**, and the field of a
dipole loops: out of one pole, round through the space beside it, and back into
the other. Spokes radiating from a point are what a single charge gives, and a
single magnetic charge is not a thing that exists.

So this evaluates the real expression. For a moment **m** at displacement **r**
the field runs along `3(m · r̂)r̂ − m`, and every mark is a short segment laid
along it. The loops are a consequence of the maths rather than something drawn.

The field is sampled once per filing, at the filing, not per pixel. Sampling per
pixel bends each segment into a little curve, which no single filing does: a
filing is a rigid sliver of iron and it can only be straight.

Near the magnet the dipole expression runs away to infinity, so the falloff is a
ratio rather than a product. It saturates at 1 instead of producing a handful of
enormous marks on top of each other at the centre.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## Wiring

**Plain HTML.** The element needs a size of its own.

```html
<div id="tray" style="position: relative; height: 70vh"></div>

<script type="module">
  import { createPointerFilings } from './beamish/effects/pointer-filings/core.js'

  const filings = createPointerFilings(document.querySelector('#tray'))
  filings.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createPointerFilings } from '@/beamish/effects/pointer-filings/core'

export function Tray() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const filings = createPointerFilings(host.current)
    filings.start()
    return () => filings.destroy()
  }, [])

  return <div ref={host} className="tray" />
}
```

Do not put option values in the dependency array. Call `update()` instead: every
option is a uniform, so nothing rebuilds.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createPointerFilings } from '@/beamish/effects/pointer-filings/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let filings: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  filings = createPointerFilings(host.value)
  filings.start()
})

onBeforeUnmount(() => filings?.destroy())
</script>

<template>
  <div ref="host" class="tray" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

## The pointer reaches outside the element

This mounts with `pointerScope: 'window'`, so the filings have already begun to
turn as the cursor comes toward the element rather than snapping into position
the moment it crosses the edge. That is what the scope is for, and it is the
right default here because a magnet outside the tray still has a field inside it.

If you would rather it only responded while the cursor is over it, pass
`pointerScope: 'element'`.

## Tuning it

`reach` is the one to understand. It sets how far the magnet carries before the
filings stop caring, and it is applied as a saturating ratio rather than as a
multiplier, so raising it widens the influence without making the marks near the
centre any larger. Lower it and the pattern tightens into a knot with a calm
field around it.

`length` and `pitch` pull against each other. A filing is measured in cells, so
raising `pitch` makes everything bigger together; raising `length` alone makes
them overlap. Past about 0.9 they join into continuous lines, which is a field
diagram rather than a tray of filings, and that is a different and less
interesting picture.

`tilt` turns the bar. The two poles move with it, which is the only honest way to
rotate this: turning the whole image instead would rotate the falloff as well.

## Pausing

Nothing moves unless the cursor does, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

## Reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn.

With no pointer the magnet sits in the middle of the element and the marks are
drawn at reduced contrast, so what gets drawn is a settled tray rather than an
empty rectangle. Nobody has to have moved anything for it to look finished.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener, including the window-scoped pointer one.
Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## Common mistakes

1. **Expecting it to point at the cursor.** It does not, and that is correct. If
   you want spokes you want a monopole, which means not using a dipole
   expression at all.

2. **Raising `length` to make the pattern clearer.** It joins the marks into
   lines. The field is read from the alignment of separate marks; once they touch
   you have drawn the field instead of showing it. Raise `pitch` instead and the
   whole thing scales.

3. **A very small `pitch` on a large element.** At five pixels a cell on a
   full-width hero there are hundreds of thousands of filings, each a dipole
   evaluation, and the marks are too small to show their own direction.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing.
