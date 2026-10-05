## What it is

Smoke off the cursor, spreading and thinning as it drifts.

Not a comet and not a glow. A puff of smoke does two things while it hangs
there. It **widens**, because nothing is holding it together. And it **thins**,
because the same amount of it is spread over more room. So an older puff is
bigger and fainter than a new one, which is the opposite of a particle trail,
where older means smaller, and it is the single thing that makes this read as
smoke rather than as a cursor with a tail.

The puffs multiply rather than compositing, so two that overlap are denser than
either. What warmth there is sits at the head, where the smoke has not yet had
room to spread.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## The trail is measured in seconds

`life` is how long a puff lasts, and it is the whole length of the trail.

That sounds obvious and it was not true of the first version, which laid one
puff per frame and read each one's age off its position in the list. A trail of
eighteen puffs was then eighteen frames long, which is 300ms on a 60Hz display
and 125ms on a 144Hz one: the same gesture, two different effects, and on the
slower display a grey cloud that kept arriving after the cursor had stopped.
That is what being told it felt laggy turned out to mean.

Now a puff is laid on a clock and carries the time it was laid. The trail is
`life` seconds long everywhere, it thins out and goes when the cursor stops, and
`marks` is only how finely those seconds are divided.

Keep `life` under about a second. Past that the smoke reads as something heavy
being dragged along behind the cursor, which is the one thing a pointer effect
cannot afford.

## How it stays recordable

A trail needs history, and history is not a function of `t`. That is a problem,
because `renderAtTime` is supposed to give the same answer every time it is asked
for a frame, and the recorder relies on it.

The way out is that when a scripted path is supplied the history is already
known. With `pointerPath` set, puff `i` is simply where the cursor was at
`t - i * life / marks`, read straight off the path and aged to match. No
accumulation, pure in `t`, and a recorded take is identical however the frames
are asked for.

With a live pointer there is no path to read, so it keeps its own stamps. That
is not pure, and it does not need to be: nothing is replaying a live cursor.

## Wiring

**Plain HTML.** The element needs a size of its own.

```html
<div id="sheet" style="position: relative; height: 70vh"></div>

<script type="module">
  import { createPointerSmoke } from './beamish/effects/pointer-smoke/core.js'

  const trail = createPointerSmoke(document.querySelector('#sheet'))
  trail.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createPointerSmoke } from '@/beamish/effects/pointer-smoke/core'

export function Sheet() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const trail = createPointerSmoke(host.current)
    trail.start()
    return () => trail.destroy()
  }, [])

  return <div ref={host} className="sheet" />
}
```

Do not put option values in the dependency array. Call `update()` instead: every
option is a uniform, so nothing rebuilds.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createPointerSmoke } from '@/beamish/effects/pointer-smoke/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let trail: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  trail = createPointerSmoke(host.value)
  trail.start()
})

onBeforeUnmount(() => trail?.destroy())
</script>

<template>
  <div ref="host" class="sheet" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

## Tuning it

`spread` is the one that matters and the one most likely to be set wrong out of
habit. It is how much **wider** an old puff gets, and turning it down to zero
gives you a row of identical discs, which is a cursor trail rather than smoke.

`smoke` wants to stay close to the paper. Smoke is the absence of a clear view
rather than a dark shape, and a strong colour here reads as paint being pushed
around. The same goes double for `accent`: only a little of the trail is ever
that colour, so a saturated one shows up as a bead following the cursor, which
is exactly what this is not.

`marks` is capped at 28, because the positions are a fixed-size array uniform in
the shader. Asking for more silently gives you 28. Raising the ceiling means
editing the `MARKS` constant in both the shader and the core, which are kept
equal on purpose and documented in both places.

`edge` wants to stay near 1. Smoke has no edge at all, and at 0 you get plates
of grey.

## Pausing

Nothing moves unless the cursor does, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

## Reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn.

With no pointer the smoke is not drawn at all, so what you get is a clean sheet.
That is the right resting state: a trail with nothing having moved would be a
picture of a gesture nobody made.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener including the window-scoped pointer one.
Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## Common mistakes

1. **Setting `spread` to 0.** You get a row of identical discs. The widening is
   what makes it smoke; without it this is a cursor with a tail and there are
   simpler ways to draw one.

2. **Raising `marks` past 28 and wondering why nothing changes.** The shader
   array is a fixed size. The constant is named in both files and they have to
   move together.

3. **Reaching for `life` to make it calmer.** A longer life is a longer trail,
   not a gentler one. `size` and `spread` are the two that decide how much of
   the panel it covers.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing.
