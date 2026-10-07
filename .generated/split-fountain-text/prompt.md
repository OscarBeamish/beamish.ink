You are adding **SplitFountainText** from Beamish to this project.

> Two or three inks in the same duct, blended by the rollers, with the gradient belonging to the sheet rather than to the letters. Type · effect · MIT.
> https://beamish.ink/effects/split-fountain-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The gradient belongs to the sheet, not to the letters, and that is what makes it a split fountain rather than gradient text. One pass of ink across the whole forme: a word near the left is in one ink, a word near the right is in another, and the heading between them is caught in the blend
- That falls out of mounting it on the sheet. background-clip on a container clips its background to every piece of text inside, however deeply nested, so one gradient inks a whole page in register. Put the gradient on each element instead and every heading gets the same little rainbow
- It is the only text effect here that does not take the text apart. No spans, no splitting, no hidden label: the text is the text the browser already had, so it selects, wraps, translates, searches and reads exactly as before. Nothing else in this library can say that
- The blend is built from several stops per ink rather than one, so its boundary can be nudged. A duct is filled by hand and the rollers do not mix evenly, so the line where two inks meet is never straight; one stop per ink is a CSS gradient and not a press
- The stops are sorted before they are written. A CSS gradient quietly clamps any stop that falls before the one in front of it, which turns a wobble into a hard edge
- -webkit-text-fill-color is set as well as color. Without it WebKit paints the text in its own colour over the clipped background and the effect does nothing at all
- Pure in t: the whole gradient is arithmetic on the clock and a hash of the seed
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/split-fountain-text/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/split-fountain-text/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

SplitFountainText is a split fountain. Two or three inks go into the same duct
on the press, the rollers blend them where they meet, and every sheet comes off
with a gradient running across it.

What makes it a split fountain rather than gradient text is that **the gradient
belongs to the sheet, not to the letters**. One pass of ink across the whole
forme: a word near the left is in one ink, a word near the right is in another,
and the heading between them is caught in the blend. A heading that wraps starts
its second line back in the first ink, because the ink depends on where you are
on the sheet and not where you are in the string.

Put the gradient on each element instead, which is what every version of this
does, and every element gets its own little rainbow, every heading has the same
colours in the same places, and the whole point is gone.

That falls out of **mounting it on the sheet rather than on the text**.
`background-clip: text` on a container clips its background to every piece of
text inside it, however deeply nested, so one gradient inks a whole page in
register.

## 3. Wire it in

**Plain HTML.** Mount it on the sheet, not the heading.

```html
<section id="sheet">
  <p class="rule">One pass of ink</p>
  <h1>Two inks in the same duct</h1>
  <p>The rollers blend them where they meet.</p>
</section>

<script type="module">
  import { createSplitFountainText } from './beamish/effects/split-fountain-text/core.js'

  const sheet = createSplitFountainText(document.querySelector('#sheet'))
  sheet.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createSplitFountainText } from '@/beamish/effects/split-fountain-text/core'

export function Sheet({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sheet = createSplitFountainText(host.current)
    sheet.start()
    return () => sheet.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

There is no dependency on the children here, unlike the other text items,
because nothing is split: the text can change underneath it freely.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSplitFountainText } from '@/beamish/effects/split-fountain-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sheet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sheet = createSplitFountainText(host.value)
  sheet.start()
})

onBeforeUnmount(() => sheet?.destroy())
</script>

<template>
  <section ref="host"><slot /></section>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `first` | color | `#c44400` | any CSS hex | The ink at the start of the duct. Split fountains are at their best with inks that make something worth seeing where they meet: two that mix to mud give a sheet with a dead band across the middle. |
| `second` | color | `#8a3b6b` | any CSS hex | The ink in the middle. Set it to the same value as one of its neighbours and you have a two-ink fountain, which is what most presses actually run. |
| `third` | color | `#1b6f8c` | any CSS hex | The ink at the far end. |
| `angle` | number | `96` | 0 to 360 deg | Which way the duct runs across the sheet. A real fountain runs across the press, so the gradient is square to the sheet; a degree or two off square is the honest amount, and it stops the blend lining up with the lines of type. |
| `blend` | number | `0.42` | 0.02 to 1 (looks right between 0.25 and 0.6) | How wide the mixing zone is. Narrow is a press just started, with the inks still separate; wide is one that has been running, with the colours walked well into each other. Both are real points in a run and they look quite different. |
| `wobble` | number | `0.35` | 0 to 1 | How uneven the blend is. At 0 it is a perfectly even ramp, which is to say a CSS gradient. The unevenness is the whole tell that ink was involved. |
| `walk` | number | `0.12` | 0 to 0.5 | How far the whole fountain walks over one period. On a press the inks creep along the duct as the run goes on, so the boundary moves and never comes back. Here it returns, because a loop has to; keep it small enough that it reads as creep rather than as a sweep. |
| `seed` | number | `7` | 0 to 9999 | Seed for the unevenness. The same seed gives the same sheet, so a recording and a live page match. |
| `period` | number | `30` | 6 to 180 s | Seconds for one cycle of the walk. Long: this is the colour of the page, and the colour of a page should not be something you can watch changing. |

## 5. Cleanup and SSR

`destroy()` removes the background, the clip and the two colour properties,
leaving the element exactly as it was found. There is no GPU resource to
release and no DOM to rebuild.

The text renders on the server as ordinary text, in its own colour, and is inked
on the first frame. If the JavaScript never arrives it stays in its own colour,
which is the best fallback any effect here has. Call `createSplitFountainText`
from `useEffect`, `onMounted`, or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`, so the sheet is inked and still. The inking is the effect;
the walk is only what a press does over a run.

## 7. The three mistakes most likely to be made here

1. **Mounting it on the heading.** Then the gradient belongs to the heading, and
   you have gradient text: the same colours in the same places on every element.
   Mount it on the sheet.

2. **Forgetting `-webkit-text-fill-color`.** WebKit paints the text in its own
   colour over the clipped background, and the effect does nothing at all. Both
   properties are needed.

3. **Unsorted gradient stops.** A CSS gradient quietly clamps any stop that
   falls before the one in front of it, which turns the wobble into a hard edge.
   Sort them before writing.

4. **`wobble: 0`.** A perfectly even ramp is a CSS gradient, and there is no
   reason to run an effect to get one.

5. **Two inks that mix to mud.** The middle of the sheet goes dead. Pick inks
   whose blend is worth looking at, because the blend is most of the sheet.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/split-fountain-text/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/split-fountain-text/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
