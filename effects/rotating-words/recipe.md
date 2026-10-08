## What it is

RotatingWords swaps one word in a sentence for another on a loop. "Printed by
letterpress, by lithography, by screen print."

Three things carry it, and the first is why most versions of this are
unpleasant to look at without anyone being able to say why.

**The box is sized to the longest word before anything moves.** A list of words
of different lengths, swapped in place, changes the width of its own line on
every swap, so everything after it slides back and forth for as long as the
page is open. It is the most common fault in this effect and it is entirely
avoidable.

The sizing needs no measurement. Every word is placed in the same cell of an
`inline-grid`, so the cell is as wide as the longest and as tall as the
tallest, and it stays that size whichever word is showing. Nothing to recompute
on resize, and nothing that can be wrong before a font has loaded.

**The words are your markup and are never replaced.** Passing a list of strings
and building spans makes the text invisible to anything reading the page before
the script runs, and puts copy inside a configuration object where nobody will
think to translate it.

**It is pure in `t`.** Which word is showing, and how far through its handover,
are arithmetic on the clock.

## Wiring

**Plain HTML.** The element's children are the words.

```html
Printed by
<span id="how">
  <span>letterpress</span>
  <span>lithography</span>
  <span>screen print</span>
  <span>risograph</span>
</span>

<script type="module">
  import { createRotatingWords } from './beamish/effects/rotating-words/core.js'

  const words = createRotatingWords(document.querySelector('#how'))
  words.start()
</script>
```

Write the words in the order you want them. The first one is what a reader sees
before the script runs and what a screen reader is given.

**React.** The words are the children.

```tsx
import { useEffect, useRef } from 'react'
import { createRotatingWords } from '@/beamish/effects/rotating-words/core'

export function Rotating({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!host.current) return
    const words = createRotatingWords(host.current, { interval: 2600 })
    words.start()
    return () => words.destroy()
  }, [children])

  return <span ref={host}>{children}</span>
}
```

The dependency on `children` is deliberate: a different set of words is a
different loop.

**Vue.** The words come in through the default slot.

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createRotatingWords } from '@/beamish/effects/rotating-words/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let words: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  words = createRotatingWords(host.value)
  words.start()
})

onBeforeUnmount(() => words?.destroy())
</script>

<template>
  <span ref="host"><slot /></span>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module.

## The loop is the interval times the words

Four words at 2200ms is an 8.8 second cycle, and that is what a recording of it
has to span for the loop to close. If you change either, change the record
duration with them.

`swap` is clamped to the interval, so one word can never still be leaving when
the next arrives.

## Rise, and when to set it to zero

The default lifts the arriving word into place and drops the leaving one out.
That is right for a display line.

Inside running text, set `rise: 0`. The words then cross-fade without moving,
which is much quieter, and a word that jumps vertically in the middle of a
paragraph pulls the eye off the sentence it is part of.

`tilt` is zero for the same reason, and it earns its place in a large heading
and almost nowhere else.

## Accessibility

Only the first word is left in the accessibility tree. The rest are
`aria-hidden`, and the element is `aria-live="off"`.

Both matter. Without the first, a screen reader meets every alternative in a
row and reads the sentence once per word. Without the second, a browser that
decides the element is a live region announces a change nobody asked for every
couple of seconds.

The sentence still reads correctly, because the first word is a real word in a
real sentence rather than a placeholder.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is 0: the first word, in place, with nothing moving.

Nothing is lost. The sentence was always complete with one word in it.

## Cleanup and SSR

`destroy()` restores every property it set on the words and on the element, and
removes the attributes it added. There is no GPU resource to release.

All the words render on the server, which means they appear as a list before
the first frame stacks them. If that matters, give the element
`display: inline-grid` in your own CSS so the stacking is the initial state
rather than something the script does.

## Common mistakes

1. **Letting the box resize.** The sentence after it moves on every swap. Fix
   the width, or stack the words in one grid cell as this does.

2. **Measuring the words in JavaScript.** It works until a font loads late, and
   then the box is the wrong size with no indication why. The grid cell does it
   with no measurement at all.

3. **Passing the words as an array of strings.** Invisible before hydration,
   and untranslatable in practice.

4. **Leaving every word readable.** The sentence is read once per alternative.

5. **Using `rise` inside a paragraph.** A word jumping vertically in running
   text pulls the eye off the line.

6. **Putting a comma or a full stop straight after the slot.** The box is as
   wide as the longest word, so every shorter one leaves the rest of that space
   empty, and a comma sitting a centimetre off the word it belongs to reads as
   a bug rather than as a held space. Nobody notices the same gap at the end of
   a line. Either end the sentence on the slot, or keep the alternatives close
   enough in length that the slack is a word space.
