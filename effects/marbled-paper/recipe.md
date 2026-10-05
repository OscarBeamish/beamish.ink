## What it is

Ink floated on size, dropped, and then raked. The pattern on a marbled endpaper,
made the way the endpaper was.

This is not noise dressed up as marbling. Every operation a marbler performs on a
tray has a closed-form inverse, and that single fact is what the whole effect
rests on. A drop of ink pushes everything already floating outward by an exact
amount, conserving area. A comb drawn through displaces points along its own
direction by an amount that depends only on how far from it they sit, so the
displacement never changes the quantity the displacement was computed from. Both
undo in one step, with no iteration and no search.

So the tray is never simulated forwards. Each pixel runs the session backwards:
undo the combs, then undo the drops one at a time from the last to the first, and
the moment the point falls inside a drop you know which ink it was. That is the
colour. One pass, no render targets, no feedback, no history, and the result is
exact rather than approximated.

It gives the rings away for free, too. A drop laid down later pushes an earlier
one into an annulus around itself, and walking the operations backwards
reproduces that instead of having to draw it.

Measured at 0.42ms for one drop and 0.64ms for seventy-two, at 1440 by 900 on an
RTX 3080. The count costs far less than it looks like it should, because the loop
stops at the first drop that claims the point.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## Wiring

**Plain HTML.** The element needs a size of its own.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createMarbledPaper } from './beamish/effects/marbled-paper/core.js'

  const marbled = createMarbledPaper(document.querySelector('#backdrop'), {
    drops: 44,
    period: 60
  })
  marbled.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createMarbledPaper } from '@/beamish/effects/marbled-paper/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const marbled = createMarbledPaper(host.current, { period: 60 })
    marbled.start()
    return () => marbled.destroy()
  }, [])

  return <div ref={host} className="fixed inset-0 -z-10" />
}
```

Do not put option values in the dependency array. Call `update()` instead: every
option is a uniform, so nothing rebuilds, not even the drop count.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createMarbledPaper } from '@/beamish/effects/marbled-paper/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let marbled: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  marbled = createMarbledPaper(host.value, { period: 60 })
  marbled.start()
})

onBeforeUnmount(() => marbled?.destroy())
</script>

<template>
  <div ref="host" class="backdrop" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

## Getting the pattern you want

Three settings decide what kind of marble this is, and they are the three a
marbler would actually choose between.

**Stone.** Set `rake` and `swirl` to zero. The drops stay as plain concentric
rings, which is where every marbled sheet starts and a perfectly good place to
stop. Raise `drops` for a denser stone.

**Nonpareil.** Leave `rake` at its default and set `swirl` to zero. One comb,
drawn in one direction, which gives the tight repeating zigzag the name belongs
to. Raise `comb` for a finer one.

**Gel-git.** Both combs, which is the default: one pass across and one down. The
hooked lobes come from the second pass catching the first.

`size` and `drops` are not independent. The ink conserves area, so the patch it
finally covers is the sum of the drop areas. Halving `size` and quadrupling
`drops` gives the same coverage at four times the detail, which is almost always
what you actually wanted when you reached for one of them.

## Behind content

Bring the inks most of the way to the paper. The default palette is a cover, not
a background, and dark type over it is unreadable wherever a drop happens to
land.

```ts
createMarbledPaper(host, {
  ink: '#e8e4d8',
  accent: '#efddd0',
  period: 90
})
```

Do not reach for opacity. It greys the paper along with the ink and loses the
thing that makes the pattern look floated rather than printed.

## Pausing

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable. `stop()` and `start()` are on the handle for that. Surface them as a
real control in your own build. Reduced motion does not cover this, and plenty of
people who need a pause button have not set that preference.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`.

This effect needs no care here. Any frame of it is a finished sheet of marbled
paper, which is a complete thing to look at, so the default is as good as any
other number.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createMarbledPaper` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

## Common mistakes

1. **Raising `size` to cover more of the frame.** It works, and it also makes
   every shape bigger, so you end up with four enormous blobs. Coverage is the
   sum of the drop areas: raise `drops` instead and the pattern gets denser
   rather than coarser.

2. **Raising `rake` to make the comb more visible.** Past about 0.4 the ink
   shears into long smears and stops reading as a comb at all. If you cannot see
   it, `comb` is probably too low: a comb with two teeth across the whole frame
   looks like a wave rather than a comb.

3. **Using the default palette behind text.** Two of the three inks are near
   black. It is a cover.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing. Give the host `position: fixed; inset: 0`, or an
   explicit height.
