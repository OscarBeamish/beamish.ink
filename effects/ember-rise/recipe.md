## What it is

EmberRise is embers lifting off the bottom edge of an element, cooling and
slowing as they go. It was built for a control that is supposed to look hot, and
it is transparent, so it sits over whatever that control is.

It is a **fixed cast with staggered lives**, not an array of particles, and that
is the most important thing about it.

## Why not an array

The usual version pushes a few particles onto a list every frame, advances each
one against the last frame, and splices out the dead. That cannot be used here,
for the reason every integrating effect in this library was rewritten: an
ember's position depends on the frame before it, so there is no value of `t` you
can ask the effect for. It cannot be recorded, and two machines running the same
page disagree after a minute.

Here, ember k is always ember k. Its lane, its size, its sway and its place in
the queue are hashes of k, and its age is `fract(t / life + phase)`. Nothing is
created, nothing is destroyed, nothing is stored.

Two things fall out of that:

- **`count` is exact.** An emitter with a spawn rate gives you a number of
  embers that depends on the frame rate. This many is this many.
- **The loop closes.** `life` is snapped at render time so a whole number of
  lives fits the `period`, because a cast part way through a life when the loop
  comes round is a video that jumps once a cycle, forever.

## No WebGL context

It draws in 2D, which is unusual in this library and deliberate. The budget is
one live WebGL context per page, and this is an effect you might reasonably want
on three buttons at once. A couple of hundred small arcs cost almost nothing,
and the thing that makes embers look like embers is **additive compositing**
rather than per-pixel work: two embers crossing have to be brighter than one.

The canvas is cleared to transparent and never filled. An ember effect that
paints its own background is one you cannot put on top of a button.

## Three things that make it fire and not confetti

**They slow down.** An ember leaves fast and loses to the air, so the travel is
eased rather than linear. Constant speed is the clearest tell.

**They cool.** The colour runs from `ember` to `cool` over a life, because what
you are watching is something losing its heat. Set `cool` close to `ember` and
the field stops having a direction in time.

**The small ones go further.** That is the whole of the depth in this. Without
it the field reads as one object at one distance.

## Wiring

**Plain HTML.** Put it over the thing that should look hot. The host needs a
size and should not clip.

```html
<div class="cta-wrap" style="position: relative">
  <button class="cta">Light it</button>
  <div id="fire" style="position: absolute; inset: -40px 0 0; pointer-events: none"></div>
</div>

<script type="module">
  import { createEmberRise } from './beamish/effects/ember-rise/core.js'

  const fire = createEmberRise(document.querySelector('#fire'))
  fire.start()
</script>
```

`pointer-events: none` on the host, or the embers eat the click on the button
underneath them.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createEmberRise } from '@/beamish/effects/ember-rise/core'

export function HotButton() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const fire = createEmberRise(host.current, { count: 120, spread: 0.6 })
    fire.start()
    return () => fire.destroy()
  }, [])

  return (
    <div className="relative inline-block">
      <button className="cta">Light it</button>
      <div ref={host} className="pointer-events-none absolute -inset-y-10 inset-x-0" />
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createEmberRise } from '@/beamish/effects/ember-rise/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let fire: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  fire = createEmberRise(host.value)
  fire.start()
})

onBeforeUnmount(() => fire?.destroy())
</script>

<template>
  <div ref="host" class="fire" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## It needs a dark ground

The compositing is additive, so on paper a hot ember is brighter than white and
a cool one is invisible. It declares `ground: "dark"` for that reason, and
unlike most of the library there is no version of this that works on both: the
whole effect is light being added to something.

## Sizing the host

Embers lift off the **bottom edge** of the host and travel up by `rise` times
its height. For a button, the host wants to extend above the button rather than
match it: `inset: -40px 0 0` is the shape that works, so the embers start at the
button's own baseline and have somewhere to go.

For a hero, mount it on the section and set `spread: 1`.

## Two of them

Give them different `seed` values. The cast is a function of the seed, so two
with the same one are the same fire twice, and side by side that is obvious.

## Cleanup and SSR

`destroy()` cancels the RAF, disconnects both observers and removes every
listener. There is no GL context to release, which is the point of the 2D
canvas, but call it anyway.

There is nothing to render on the server. The element is empty until the first
frame. Call `createEmberRise` from `useEffect`, `onMounted`, or a `client:*`
island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`. A
still frame of this is a scatter of sparks at every stage of cooling, which is a
complete image rather than an empty box, and 4 seconds into the default period
is a full one.

## Common mistakes

1. **An array of particles.** It cannot be seeked, so it cannot be recorded, and
   it drifts on a dropped frame.

2. **A host that clips.** `overflow: hidden` on the wrapper cuts the embers off
   at the top of the button, which looks like a bug rather than like a short
   fire.

3. **Forgetting `pointer-events: none`.** The canvas is over the control, so
   without it the control cannot be clicked.

4. **A life that does not divide the period.** The render snaps it, but if you
   are reading the numbers back out, `life` is not what you set unless
   `period / life` is already whole.

5. **Linear travel.** Embers that rise at a constant speed are confetti going
   the wrong way.

6. **One size.** The small ones have to go further, or there is no depth in it
   at all.
