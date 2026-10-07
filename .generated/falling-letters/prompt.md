You are adding **FallingLetters** from Beamish to this project.

> A line of type comes apart and falls, each letter dropping and bouncing once, with every position a closed form in t. Type · effect · MIT.
> https://beamish.ink/effects/falling-letters

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- Every letter's position is a closed form in t rather than a simulation. A solver steps from the last frame to the next, so frame 200 can only be reached by computing the 199 before it: you cannot seek, you cannot record a loop, and two runs drift apart as soon as one misses a frame. Here the fall is the parabola itself and the bounce is the same parabola reflected and damped, so any t in any order gives the same frame
- The letters are measured once and taken out of flow, so nothing reflows. Split a line into spans and animate them in place and every letter that moves changes the line box, so the letters that have not fallen yet shuffle along underneath
- The measuring has to finish before any letter is taken out of flow. Do it letter by letter and each removal reflows the rest, so every measurement after the first is of a line that no longer exists
- One damped bounce, not none and not five. A letter that falls and stops dead reads as a dropped frame rather than as a thing with weight; five is a rubber ball. One is a piece of lead type landing on a stone
- Distances are in line heights rather than pixels, so the same numbers behave at any type size
- The original text stays in the accessibility tree as a label on the element, and the per-letter spans are hidden from it. A word split into letters is otherwise read out one letter at a time
- destroy() puts the original text back exactly as it was found, including the spaces
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/falling-letters/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/falling-letters/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

FallingLetters takes a line of type apart and drops it, each letter falling,
bouncing once and settling. Pied type: a forme dropped on the way to the press.

Three things carry it, and the first is why this is arithmetic rather than a
physics engine.

**Every letter's position is a closed form in `t`.** A solver steps from the
last frame to the next, which means frame 200 can only be reached by computing
the 199 before it. You cannot seek it, you cannot record a clean loop from it,
and two runs drift apart as soon as one misses a frame. Here the fall is the
parabola itself and the bounce is the same parabola reflected and damped, so
asking for any `t` in any order gives the same frame.

**The letters are measured once and taken out of flow.** Split a line into
spans and animate them in place, and every letter that moves changes the line
box, so the letters that have not fallen yet shuffle along underneath. The
block keeps the height it had and each letter falls from exactly where it was
set.

**One damped bounce.** A letter that falls and stops dead reads as a dropped
frame rather than as a thing with weight. Five bounces is a rubber ball. One is
a piece of lead type landing on a stone, which is what this is.

## 3. Wire it in

**Plain HTML.** The element's text is what falls.

```html
<h1 id="masthead">Pied type</h1>

<script type="module">
  import { createFallingLetters } from './beamish/effects/falling-letters/core.js'

  const pied = createFallingLetters(document.querySelector('#masthead'))
  pied.start()
</script>
```

The text is yours. It is split into letters at mount and put back exactly as it
was found on `destroy()`.

**React.** The text is the children.

```tsx
import { useEffect, useRef } from 'react'
import { createFallingLetters } from '@/beamish/effects/falling-letters/core'

export function Pied({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pied = createFallingLetters(host.current, { stagger: 55 })
    pied.start()
    return () => pied.destroy()
  }, [children])

  return <h1 ref={host}>{children}</h1>
}
```

Pass a string, not elements. The core replaces the element's contents with
per-letter spans, and React will fight it over any children it rendered itself.

**Vue.** Same shape, with the text in the slot.

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createFallingLetters } from '@/beamish/effects/falling-letters/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pied: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pied = createFallingLetters(host.value)
  pied.start()
})

onBeforeUnmount(() => pied?.destroy())
</script>

<template>
  <h1 ref="host"><slot /></h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `hold` | number | `400` | 0 to 4000 ms | Milliseconds before the first letter goes. Long enough that the line is read as a line first, because the whole gesture depends on it having been intact a moment ago. |
| `stagger` | number | `42` | 0 to 300 ms (looks right between 25 and 80) | Milliseconds between one letter leaving and the next. At 0 the whole line goes at once, which reads as the shelf giving way rather than as the type coming loose. |
| `scatter` | number | `0.55` | 0 to 1 | How scattered the order is. At 0 the letters drop strictly left to right, which reads as mechanical; at 1 the order is unrelated to position, which reads as random. The middle is what looks like something coming apart. |
| `gravity` | number | `26` | 4 to 120 | Fall acceleration, in line heights per second squared. In line heights rather than pixels so the same value behaves at any type size. |
| `bounce` | number | `0.28` | 0 to 0.8 | How much of its speed a letter keeps on the bounce. At 0 it stops dead, which reads as a dropped frame. Past about 0.5 it is a rubber ball rather than a piece of lead type. |
| `drift` | number | `0.35` | 0 to 2 | How far a letter wanders sideways as it falls, in line heights. A little is the difference between type coming loose and a row of counters dropping down a slot. |
| `spin` | number | `150` | 0 to 900 deg/s | Degrees a letter turns per second while falling, in whichever direction its hash gives it. At 0 the letters stay upright, which is quieter and is the right answer for a line that has to stay readable as it goes. |
| `floor` | number | `3.2` | 0.5 to 20 | How far below the baseline the letters come to rest, in line heights. Make sure there is room: the element keeps its original height, so anything past the bottom of its container needs the container to allow overflow. |
| `seed` | number | `7` | 0 to 9999 | Seed for the scatter and the spin directions. The same seed gives the same fall, so a recording and a live page agree letter for letter. |

## 5. Accessibility. Do not skip this

The original text is put on the element as an `aria-label`, and every letter
span is `aria-hidden`. Without both, a screen reader meets a word split into
single characters and reads it one letter at a time.

Nothing is lost: the label is the exact text that was there before.

## 6. Cleanup and SSR

`destroy()` restores the original text, including its spaces, and removes the
height and the label.

The text renders on the server as ordinary text, which means it is complete and
readable before the script runs. There is nothing to hide and no flash of
anything.

## 7. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is 0: the line intact, before anything has gone.

That is the right still for this one. The text is the content, and the fall is
the decoration.

## 8. The three mistakes most likely to be made here

1. **Using a physics step.** It cannot be seeked, cannot be recorded cleanly,
   and drifts between runs. The closed form is less code and does more.

2. **Animating the letters in flow.** Every letter that moves reflows the ones
   that have not gone yet, so the line walks sideways as it falls apart.

3. **Measuring as you go.** Taking one letter out of flow reflows the rest, so
   every measurement after the first is of a line that no longer exists.

4. **No bounce.** The letters stop dead and it reads as a dropped frame.

5. **Clipping the container.** The letters fall out of the element by design.
   An `overflow: hidden` anywhere above them cuts the gesture in half.

6. **Passing React children other than a string.** The core owns the element's
   contents once it mounts.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/falling-letters/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/falling-letters/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
