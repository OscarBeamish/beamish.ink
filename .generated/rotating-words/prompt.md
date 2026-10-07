You are adding **RotatingWords** from Beamish to this project.

> One word in a sentence swaps for another on a loop, in a box sized to the longest so the line never moves. Type · effect · MIT.
> https://beamish.ink/effects/rotating-words

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The box is sized to the longest word before anything moves. A list of words of different lengths swapped in place changes the width of its own line on every swap, so everything after it slides back and forth for as long as the page is open. It is the most common fault in this effect and it is entirely avoidable
- The sizing needs no measurement. Every word is placed in the same cell of an inline-grid, so the cell is as wide as the longest and as tall as the tallest, and it stays that size whichever word is showing. Nothing to recompute on resize and nothing that can be wrong before a font has loaded
- The words are the author's markup and are never replaced. Passing a list of strings and building spans means the text is invisible to anything reading the page before the script runs, and it puts copy inside a configuration object where nobody will think to translate it
- Only the first word is in the accessibility tree; the rest are aria-hidden and the element is aria-live off. A screen reader meeting eight alternatives in a row would otherwise read the sentence eight times, and a live region would announce a change nobody asked for every two seconds
- Pure in t: which word is showing and how far through its handover are arithmetic on the clock, so the recorder can seek anywhere and a live page and a take agree
- Only the arriving and leaving words are touched. Everything else is parked with no transform to compute, so twelve words cost the same per frame as two
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/rotating-words/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/rotating-words/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `interval` | number | `2200` | 600 to 10000 ms (looks right between 1800 and 3200) | Milliseconds each word is held, including its handover. This sets the length of the whole loop, which is the interval times the number of words, so four words at 2200ms is an 8.8 second cycle and that is what a recording has to span. |
| `swap` | number | `520` | 80 to 2000 ms | Milliseconds the handover takes, clamped to the interval so one word cannot still be leaving when the next starts. Around a quarter of the interval reads as a deliberate change rather than as a flicker. |
| `rise` | number | `0.9` | 0 to 2 | How far a word travels as it goes, as a share of its own line height. At 0 the words cross-fade in place, which is quieter and is the right answer inside running text. |
| `tilt` | number | `0` | -20 to 20 deg | Degrees the moving words tip. Zero by default because a tilted word in the middle of a sentence reads as a mistake; it earns its place in a large display line and almost nowhere else. |
| `blur` | number | `0` | 0 to 8 px | Blur on a word in motion. Zero is crisper and cheaper, and a filter costs a compositing layer whether or not it does anything, so a value of 0 is left off rather than written as blur(0px). |

## 5. Accessibility. Do not skip this

Only the first word is left in the accessibility tree. The rest are
`aria-hidden`, and the element is `aria-live="off"`.

Both matter. Without the first, a screen reader meets every alternative in a
row and reads the sentence once per word. Without the second, a browser that
decides the element is a live region announces a change nobody asked for every
couple of seconds.

The sentence still reads correctly, because the first word is a real word in a
real sentence rather than a placeholder.

## 6. Cleanup and SSR

`destroy()` restores every property it set on the words and on the element, and
removes the attributes it added. There is no GPU resource to release.

All the words render on the server, which means they appear as a list before
the first frame stacks them. If that matters, give the element
`display: inline-grid` in your own CSS so the stacking is the initial state
rather than something the script does.

## 7. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is 0: the first word, in place, with nothing moving.

Nothing is lost. The sentence was always complete with one word in it.

## 8. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/rotating-words/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/rotating-words/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
