## What it is

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

## Wiring

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

## Give it somewhere to fall

The element keeps its original height while the letters drop below it, which is
what stops the rest of the page moving. It also means the letters leave the
element's box.

So whatever contains it needs to allow that: no `overflow: hidden` on an
ancestor unless you want the letters clipped, and enough room below for `floor`
line heights of fall. If the letters vanish partway down, something above them
is clipping.

## Units are line heights

`gravity`, `drift` and `floor` are all in line heights rather than pixels, so
the same numbers behave the same at 16px and at 96px. A value tuned on a
heading will not need retuning for a caption.

## The order is the thing to tune

`stagger` sets how fast the line comes apart and `scatter` sets how ordered it
is.

At `scatter: 0` the letters drop strictly left to right, which reads as
mechanical. At 1 the order is unrelated to position, which reads as random
noise. The default sits between, which is what something actually coming apart
looks like: roughly left to right, but not reliably.

## Accessibility

The original text is put on the element as an `aria-label`, and every letter
span is `aria-hidden`. Without both, a screen reader meets a word split into
single characters and reads it one letter at a time.

Nothing is lost: the label is the exact text that was there before.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is 0: the line intact, before anything has gone.

That is the right still for this one. The text is the content, and the fall is
the decoration.

## Cleanup and SSR

`destroy()` restores the original text, including its spaces, and removes the
height and the label.

The text renders on the server as ordinary text, which means it is complete and
readable before the script runs. There is nothing to hide and no flash of
anything.

## Common mistakes

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
