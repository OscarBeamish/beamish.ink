## What it is

ClickSpark throws a burst of sparks where you click. It is the cheapest piece of
feedback there is and it is genuinely useful, which is why everybody ships one
and why most of them look like confetti.

Three things make a spark read as a spark rather than as a dot moving.

**It is a streak, not a point, and the streak is as long as the spark is fast.**
That is what a short exposure of something hot and moving looks like, and it is
the single difference between this and a particle demo. The streaks shorten on
their own as the sparks slow down, with nothing extra to animate: the length is
the speed.

**It slows down.** A spark meets air, so the distance travelled is the integral
of a decaying speed rather than speed times time. Linear motion outwards is the
giveaway of every other version: the burst expands like a diagram of an
explosion instead of like one.

**It falls, a little.** Not enough to read as gravity. Just enough that the
burst is not symmetrical, because a symmetrical burst is a snowflake.

## Wiring

**Plain HTML.** Put it on the thing being clicked, or on a wrapper around it.
The element keeps its own content: the sparks go in a layer over the top that
the pointer cannot touch.

```html
<div id="panel">
  <button type="button">Press me</button>
</div>

<script type="module">
  import { createClickSpark } from './beamish/effects/click-spark/core.js'

  const sparks = createClickSpark(document.querySelector('#panel'))
  sparks.start()
</script>
```

The press is listened for on the element itself, so a click on the button inside
bubbles up and lights it. That is the point: the feedback belongs to the thing
that was pressed, and the button keeps working.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createClickSpark } from '@/beamish/effects/click-spark/core'

export function SparkOn({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sparks = createClickSpark(host.current, { colour: '#c44400' })
    sparks.start()
    return () => sparks.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createClickSpark } from '@/beamish/effects/click-spark/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sparks: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sparks = createClickSpark(host.value)
  sparks.start()
})

onBeforeUnmount(() => sparks?.destroy())
</script>

<template>
  <div ref="host"><button type="button">Press me</button></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Where to put it

On the thing that was pressed, not on the page. A spark at the cursor anywhere
on a document is a toy; a spark on the button somebody just committed to is
feedback, and the difference is only where you mount it.

`speed` and `gravity` are shares of the element's shorter side rather than
pixels, so the same burst looks right on a small button and on a full-page
panel. That is the reason to mount it on the element and not on `document.body`
and position it by hand.

## Scripted presses

Every effect in this library has to be recordable, which for a click means the
clicks have to come from somewhere other than a mouse. `pressPath` is a list of
times and points, and the effect treats each one exactly as it treats a real
press at that moment:

```ts
createClickSpark(el, {
  pressPath: [
    { t: 0.45, x: 0.5, y: 0.5 },
    { t: 1.5, x: 0.28, y: 0.34 }
  ]
})
```

Unlike `pointerPath`, this does not replace the live input. A scripted press and
a real one are the same kind of event and they go in the same list, so the page
is still alive while a script is running.

## Cost

The elements are a pool built once and reused. A burst creates and destroys
nothing: a click takes the oldest slot, so forty clicks in a row cost exactly
what four do. That matters, because clicking it repeatedly is the first thing
anybody does.

`count × bursts` is the element count, 44 at the defaults. Raising `bursts` is
the expensive change, not raising `count`.

## Cleanup and SSR

`destroy()` removes the layer and the listener and puts the element's `position`
back. There is no GPU resource to release.

Nothing renders on the server, and nothing needs to: the element's own content
is untouched. Call `createClickSpark` from `useEffect`, `onMounted`, or a
`client:*` island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts, so no sparks are drawn at all, which is the right answer
here: this is decoration on an interaction that already has its own feedback.

If the click has no other visible result, give it one that is not motion.

## Common mistakes

1. **Dots instead of streaks.** The whole thing then reads as confetti. The
   length of a streak is its current speed, which also means it gets shorter on
   its own as the spark slows.

2. **Constant speed.** Sparks that travel at the speed they left at expand like
   a diagram. Air is the reason a real burst goes a long way in the first fifth
   of a second and then barely moves.

3. **A perfectly even fan.** At `scatter: 0` it is a star, evenly spaced and all
   one length, which no two things striking each other have ever produced. An
   even `count` is worth avoiding too: it puts a streak opposite every other
   streak and the eye reads a cross.

4. **A long life.** This is an acknowledgement of a click, so it has to be over
   before the next thing happens. Much past a second and it is an animation
   somebody has to wait out.

5. **Mounting it on the page and positioning by hand.** Then the burst is sized
   against the viewport rather than against the thing that was pressed, and it
   is far too big on a button.
