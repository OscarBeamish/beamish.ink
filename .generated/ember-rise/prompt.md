You are adding **EmberRise** from Beamish to this project.

> Embers lifting off the bottom edge of an element, cooling and slowing as they go, on a transparent canvas. Surfaces · effect · MIT.
> https://beamish.ink/effects/ember-rise

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- A fixed cast with staggered lives, not an array that grows and shrinks. Ember k is always ember k: its lane, its size, its sway and its place in the queue are hashes of k, and its age is fract(t / life + phase). Nothing is created or destroyed, and the frame at t is the same frame whenever you ask for it
- That is what makes it recordable. The page this came from pushes particles onto a list, advances each one against the last frame and splices out the dead, so there is no value of t you can ask it for and two machines disagree after a minute
- It also makes `count` exact. An emitter with a spawn rate gives you a number of embers that depends on the frame rate
- 2D rather than WebGL, deliberately. The budget is one live WebGL context per page and this is an effect you might want on three buttons at once. A couple of hundred small arcs cost almost nothing, and what makes embers look like embers is additive compositing rather than per-pixel work
- The canvas is cleared to transparent and never filled, so it composites over whatever is behind it. An ember effect that paints its own background is one you cannot put on top of a button
- `life` is snapped so a whole number of lives fits the period. Without it the cast is part way through a life when the loop comes round and the video jumps once a cycle
- Small embers go further and live longer in the air. That is the only depth cue in here, and without it the field reads as one object at one distance
- Built for a dark ground and declared as one. The compositing is additive, which on paper makes a hot ember brighter than white and a cool one invisible
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/ember-rise/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/ember-rise/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

EmberRise is embers lifting off the bottom edge of an element, cooling and
slowing as they go. It was built for a control that is supposed to look hot, and
it is transparent, so it sits over whatever that control is.

It is a **fixed cast with staggered lives**, not an array of particles, and that
is the most important thing about it.

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `ember` | color | `#ffb257` | any CSS hex | The hot core of a new ember. Orange rather than yellow: a yellow ember on a dark ground reads as a spark from a grinder, which is a different and much more violent thing. |
| `cool` | color | `#8c2f17` | any CSS hex | What an ember has cooled to by the end of its life. Dark red, close to the ground, so an ember goes out rather than disappearing. Set it closer to the ember colour and the field stops having a direction in time. |
| `count` | number | `120` | 1 to 600 (looks right between 80 and 260) | How many embers are alive at once, exactly. Not a spawn rate: a fixed cast with staggered lives is what makes this seekable, and it also means the number you set is the number you get on any machine. This is the whole cost of the effect and it is linear. |
| `rise` | number | `0.95` | 0.1 to 2 (looks right between 0.6 and 1.2) | How far an ember travels in its life, as a share of the host's height. At 1 the longest-lived ones just reach the top, which is usually what you want: embers that stop in the middle of a tall box look like they hit something. |
| `life` | number | `4` | 0.4 to 20 s (looks right between 2 and 5) | Seconds an ember lives. Snapped at render time so a whole number of lives fits the period, because a cast part way through a life when the loop comes round is a video that jumps once a cycle. Short lives give a busy fire, long ones give a few sparks drifting. |
| `sway` | number | `16` | 0 to 80 px | How far an ember wanders sideways, one whole turn over its life. At 0 they go straight up, which reads as a machine rather than as air. Large values turn the rise into a wave and the embers start to look tethered. |
| `size` | number | `2.4` | 0.4 to 10 px (looks right between 1.5 and 4) | Radius of the largest ember. They are drawn with a halo at three times this, so the lit area is bigger than the number suggests. Past about 5 they stop being embers and become fireflies. |
| `spread` | number | `0.74` | 0 to 1 | How much of the width the embers lift off, centred. Below about 0.3 it is a plume from a single point; at 1 the whole bottom edge is alight, which suits a hero and is too much for a button. |
| `heat` | number | `1` | 0 to 2 | Overall brightness. The one control to reach for when the effect is right but loud: it scales alpha rather than count, so the fire thins out instead of thinning down. |
| `seed` | number | `5` | 0 to 9999 | Seed for the cast: lanes, sizes, sway and the order they go up in. The same seed gives the same embers, so two of these side by side want two seeds. |
| `period` | number | `16` | 2 to 120 s (looks right between 10 and 30) | Seconds for one cycle. It has to be a whole number of lives and the render rounds `life` to make it so, so this is the figure that actually decides both. Long enough that the repeat is not obvious; a fire that loops every four seconds is a fire you notice looping. |

## 5. Why not an array

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

## 6. No WebGL context

It draws in 2D, which is unusual in this library and deliberate. The budget is
one live WebGL context per page, and this is an effect you might reasonably want
on three buttons at once. A couple of hundred small arcs cost almost nothing,
and the thing that makes embers look like embers is **additive compositing**
rather than per-pixel work: two embers crossing have to be brighter than one.

The canvas is cleared to transparent and never filled. An ember effect that
paints its own background is one you cannot put on top of a button.

## 7. Three things that make it fire and not confetti

**They slow down.** An ember leaves fast and loses to the air, so the travel is
eased rather than linear. Constant speed is the clearest tell.

**They cool.** The colour runs from `ember` to `cool` over a life, because what
you are watching is something losing its heat. Set `cool` close to `ember` and
the field stops having a direction in time.

**The small ones go further.** That is the whole of the depth in this. Without
it the field reads as one object at one distance.

## 8. It needs a dark ground

The compositing is additive, so on paper a hot ember is brighter than white and
a cool one is invisible. It declares `ground: "dark"` for that reason, and
unlike most of the library there is no version of this that works on both: the
whole effect is light being added to something.

## 9. Sizing the host

Embers lift off the **bottom edge** of the host and travel up by `rise` times
its height. For a button, the host wants to extend above the button rather than
match it: `inset: -40px 0 0` is the shape that works, so the embers start at the
button's own baseline and have somewhere to go.

For a hero, mount it on the section and set `spread: 1`.

## 10. Two of them

Give them different `seed` values. The cast is a function of the seed, so two
with the same one are the same fire twice, and side by side that is obvious.

## 11. Cleanup and SSR

`destroy()` cancels the RAF, disconnects both observers and removes every
listener. There is no GL context to release, which is the point of the 2D
canvas, but call it anyway.

There is nothing to render on the server. The element is empty until the first
frame. Call `createEmberRise` from `useEffect`, `onMounted`, or a `client:*`
island.

## 12. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`. A
still frame of this is a scatter of sparks at every stage of cooling, which is a
complete image rather than an empty box, and 4 seconds into the default period
is a full one.

## 13. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/ember-rise/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/ember-rise/adapters/vue.ts

---

Concept credit: embers lifting off a control, from the Fire Button page. The engine here is a fixed cast with staggered lives rather than a list that grows and shrinks, because a list cannot be seeked, by Ray Velez, https://github.com/RayVelez27/instalanding.ai.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
