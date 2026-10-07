You are adding **ClickSpark** from Beamish to this project.

> A burst of sparks where you click, drawn as streaks that shorten as they slow. Pointer · effect · MIT.
> https://beamish.ink/effects/click-spark

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- Each spark is drawn as a streak whose length is its current speed, which is what a short exposure of something hot and moving looks like. The streaks shorten on their own as the sparks slow, with nothing extra to animate, and it is the single difference between this and a particle demo
- The sparks slow down. A spark meets air, so the distance is the integral of a decaying speed rather than speed times time. Linear motion outwards is the giveaway of every version of this: the burst expands like a diagram of an explosion instead of like one
- A little gravity, so the burst is not symmetrical. Not enough to read as falling, just enough that it is not a snowflake
- A fixed pool of elements, built once and reused. Bursts create and destroy nothing: a click takes the oldest slot, so forty clicks in a row cost exactly what four do. That matters because clicking it repeatedly is the first thing anybody does
- The element keeps its own content. The streaks go in a layer over the top with pointer-events none, and the press is listened for on the element itself, so a button inside stays clickable and the feedback belongs to the thing that was pressed
- Scripted presses and real ones are the same kind of event and go in the same list. The scripted ones are rebuilt from the options each frame rather than remembered, which is what keeps a scripted take pure in t: seeking backwards un-fires them
- destroy() removes the layer and the listener and puts the element's position back
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/click-spark/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/click-spark/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `count` | number | `11` | 3 to 40 (looks right between 8 and 16) | Streaks in one burst. An odd number is better than an even one: an even fan has a streak opposite every other streak, which the eye reads as a cross. |
| `bursts` | number | `4` | 1 to 10 | How many bursts can be in the air at once. The newest win, so clicking faster than this does not cost more, it just drops the oldest burst early. Raising it raises the element count by the same factor. |
| `colour` | color | `#c44400` | any CSS hex | The spark. One colour, not a gradient and not a palette: a palette of sparks is confetti. If it has to work on both grounds, pick something that is neither nearly white nor nearly black. |
| `speed` | number | `1.15` | 0.1 to 5 | How fast a spark leaves, as a share of the shorter side of the element per second. Relative rather than in pixels, so the same burst looks right on a small button and on a full-page panel. |
| `drag` | number | `0.22` | 0.02 to 2 s (looks right between 0.12 and 0.4) | Seconds for a spark to lose most of its speed to the air. Short, and it is what makes the burst read as thrown rather than as expanding: the sparks go a long way in the first fifth of a second and then barely move. |
| `gravity` | number | `0.55` | 0 to 5 | How far the burst droops, as a share of the shorter side per second. At 0 the burst is perfectly symmetrical, which reads as a snowflake. It should be small enough that nobody would name it as falling. |
| `life` | number | `0.62` | 0.1 to 3 s (looks right between 0.4 and 0.9) | Seconds a spark lasts. This is feedback for a click, so it has to be over before the next thing happens: much past a second it stops being an acknowledgement and starts being an animation somebody has to wait out. |
| `streak` | number | `0.055` | 0 to 0.3 s | How long a streak is, given as the seconds of travel it represents, so it is literally a shutter speed. At 0 the sparks are dots and the effect is confetti; long, and they are comet trails. |
| `thickness` | number | `2` | 0.5 to 8 px | Thickness of a streak, in pixels rather than relative, because a hairline is a hairline at any size and a thick spark at small sizes is a blob. |
| `scatter` | number | `0.45` | 0 to 1 | How uneven the burst is. At 0 it is a perfect star, evenly spaced and all one length, which no two things striking each other have ever produced. |
| `seed` | number | `7` | 0 to 9999 | Seed for the scatter. Every burst already differs from the last, because the burst's own number goes into the hash; this moves the whole series, so two of these on one page are not twins. |

## 5. Cleanup and SSR

`destroy()` removes the layer and the listener and puts the element's `position`
back. There is no GPU resource to release.

Nothing renders on the server, and nothing needs to: the element's own content
is untouched. Call `createClickSpark` from `useEffect`, `onMounted`, or a
`client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts, so no sparks are drawn at all, which is the right answer
here: this is decoration on an interaction that already has its own feedback.

If the click has no other visible result, give it one that is not motion.

## 7. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/click-spark/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/click-spark/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
