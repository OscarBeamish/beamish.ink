You are adding **Tally** from Beamish to this project.

> A number counting up to the one already written in the element. Type · effect · MIT.
> https://beamish.ink/effects/tally

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. It reads the number already in the element and counts up to it
- Formatting goes through Intl.NumberFormat, so grouping and the decimal mark follow the locale rather than a hand-rolled separator
- The finished figure stays in the accessibility tree as one string, because a screen reader on a live-updating number reads every value it passes
- There is no target option. The number lives in the element, which is what makes the figure correct before any script runs and correct forever if none does
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/tally/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/tally/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Tally counts a number up to the one already written in the element. No canvas, no
WebGL, no npm dependency.

It reads the target from the text content, and there is no option to override
that. The real figure is therefore in the HTML before any JavaScript runs, stays
there if none ever does, and is what a search engine indexes. A counter that
renders `0` until hydration is a counter that is wrong most of the time.

Formatting goes through `Intl.NumberFormat`. That is the part most counters get
wrong: 1,284 in Britain is 1.284 in Germany, and a hand-rolled thousands
separator is wrong in about half the world. Tally also parses both conventions on
the way in, so `1.284,50` and `1,284.50` both mean the same thing to it.

`destroy()` puts the original text back.

## 3. Wire it in

**Plain HTML.** Put the real number in the element.

```html
<span id="stars">45,400</span>

<script type="module">
  import { createTally } from './beamish/effects/tally/core.js'

  const tally = createTally(document.querySelector('#stars'))
  tally.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createTally } from '@/beamish/effects/tally/core'

export function Stat({ value }: { value: string }) {
  const host = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!host.current) return
    const tally = createTally(host.current, { duration: 1800 })
    tally.start()
    return () => tally.destroy()
  }, [value])

  return <span ref={host}>{value}</span>
}
```

The dependency on `value` is deliberate. If the figure changes, the count has to
be rebuilt.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createTally } from '@/beamish/effects/tally/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let tally: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  tally = createTally(host.value)
  tally.start()
})

onBeforeUnmount(() => tally?.destroy())
</script>

<template>
  <span ref="host">45,400</span>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Counting on scroll.** Do not add an `IntersectionObserver`. The runtime has
one: it holds the loop until the element is on screen, so `start()` on mount
counts when the stat scrolls into view.

**Counting again.**

```ts
tally.stop()
tally.renderAtTime(0)
tally.start()
```

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `from` | number | `0` | -1000000000 to 1000000000 | Where the count starts. Counting down works: set it above the target. |
| `duration` | number | `1800` | 200 to 8000 ms (looks right between 1200 and 2500) | Milliseconds from start to finish. Under a second reads as a flicker rather than a count. Over three and people have stopped watching. |
| `decimals` | number | `0` | 0 to 6 | Decimal places. Left at 0 it follows the element's own text, so 12.50 keeps its two places. |
| `locale` | string | `` | any value | BCP 47 locale for grouping and the decimal mark, for example en-GB or de-DE. Empty follows the browser, which is usually right. |
| `prefix` | string | `` | any value | Text before the number. Keep currency symbols here rather than in the element's text, so the parser sees a clean figure. |
| `suffix` | string | `` | any value | Text after the number, for a percent sign or a unit. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a count this should be a time after it has finished, so the final figure simply appears. |

## 5. Accessibility. Do not skip this

The counting digits are marked `aria-hidden`, and a visually hidden copy of the
final figure sits alongside them. A screen reader announces `45,400` once.

Without that, a live number either gets announced at every value it passes or,
with `aria-live` set wrongly, interrupts whatever the user was listening to. The
figure is the information. The counting is decoration.

## 6. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF and disconnects both
observers. There is no GPU resource to release.

It renders on the server as the finished number, which is the correct thing for
it to be. Call `createTally` from `useEffect`, `onMounted`, or a `client:*`
island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

That default is 999, which is any time after the count has finished, so the
number simply appears. Do not set it to 0: that shows `0` permanently, which is
not a stylistic choice but a wrong figure.

## 7. The three mistakes most likely to be made here

1. **Not using tabular figures.** Most typefaces give `1` a narrower glyph than
   `8`, so the number changes width every frame and everything beside it jitters.
   Add `font-variant-numeric: tabular-nums`, or give the element a fixed width.

2. **Leaving `locale` empty and expecting your `lang` attribute to matter.** It
   does not. `Intl.NumberFormat` follows the browser's own language setting, so a
   visitor whose browser is German reads `45.400` on your `lang="en-GB"` page.
   That is correct behaviour and almost never what you wanted. Name the locale.

   While you are there, keep currency symbols in `prefix` rather than in the
   element's text: `$` and `€` before a figure confuse the decimal detection.

3. **Setting `reducedMotionTime` to 0.** The element then permanently reads `0`
   for anyone who has asked for less motion. It wants to be a time after the
   count ends.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/tally/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/tally/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
