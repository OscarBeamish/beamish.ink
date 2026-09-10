You are adding **Sort** from Beamish to this project.

> Type set one character at a time, in the order you choose. Type · effect · MIT.
> https://beamish.ink/effects/sort

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. It splits the text already in the element and animates the pieces
- The original string stays in the accessibility tree as one label, so a screen reader does not read sixty separate characters
- destroy() puts the original text back, leaving the element as it was found
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/sort/core.ts` | https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/effects/sort/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Sort sets type one piece at a time. A sort is a single piece of metal type, and
that is what each animated fragment here is: a character, a word or a whole line,
arriving on a stagger.

It takes an element that already contains text, splits it, and animates the
pieces. There is no canvas, no WebGL and no npm dependency.

Two things it does that most text-splitters do not. Characters are grouped inside
their word, so the text still wraps at the right places. And the original string
stays in the accessibility tree as one label, so a screen reader reads a sentence
rather than sixty separate characters.

`destroy()` puts the original text back. The element is left as it was found.

## 3. Wire it in

**Plain HTML.** The text must already be in the element. Sort splits what it
finds.

```html
<h1 id="headline">Come to my arms, my beamish boy</h1>

<script type="module">
  import { createSort } from './beamish/effects/sort/core.js'

  const sort = createSort(document.querySelector('#headline'))
  sort.start()
</script>
```

**React.** Render the text as children, then split it in an effect. Do not build
the spans in JSX: React will fight the DOM changes on the next render.

```tsx
import { useEffect, useRef } from 'react'
import { createSort } from '@/beamish/effects/sort/core'

export function Headline({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sort = createSort(host.current, { split: 'char', stagger: 26 })
    sort.start()
    return () => sort.destroy()
  }, [children])

  return <h1 ref={host}>{children}</h1>
}
```

The dependency on `children` is deliberate here, unlike the WebGL effects. If the
text changes, the split has to be rebuilt.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSort } from '@/beamish/effects/sort/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sort: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sort = createSort(host.value)
  sort.start()
})

onBeforeUnmount(() => sort?.destroy())
</script>

<template>
  <h1 ref="host">Come to my arms, my beamish boy</h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Replaying it.** Sort runs once from `t = 0`. To play it again, reset the clock
and start:

```ts
sort.stop()
sort.renderAtTime(0)
sort.start()
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a scroll-triggered reveal with no extra code.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `split` | enum | `char` | `char` · `word` · `line` | What each animated piece is. Characters are grouped inside their word so the text still wraps. |
| `order` | enum | `forward` | `forward` · `reverse` · `centre` · `random` | The order pieces arrive in. `centre` starts in the middle and works outwards. `random` keeps every piece in its place in the sentence and only changes its turn. |
| `stagger` | number | `26` | 0 to 200 ms (looks right between 15 and 45) | Milliseconds between one piece and the next. On a long heading this multiplies fast: 40ms across 60 characters is a two and a half second wait. |
| `duration` | number | `720` | 100 to 3000 ms (looks right between 500 and 900) | Milliseconds each piece takes on its own. |
| `rise` | number | `22` | -80 to 80 px (looks right between 12 and 34) | How far each piece travels. Negative falls from above instead of rising from below. |
| `blur` | number | `5` | 0 to 20 (looks right between 0 and 8) | Blur each piece starts at. Zero is cheaper and often better at small sizes, where the blur just reads as a smudge. |
| `scale` | number | `1` | 0.4 to 1.6 (looks right between 0.9 and 1.1) | Scale each piece starts at. 1 is no scaling, which is usually right for text. |
| `seed` | number | `7` | 0 to 9999 | Seed for the random order. The same seed always gives the same order, so a recorded video and a live page match. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot reveal this should be a time after the animation has finished, so the text simply appears. |

## 5. Accessibility. Do not skip this

The split version is marked `aria-hidden`, and a visually hidden copy of the
original string sits alongside it. A screen reader reads the sentence. This is
the part most text-splitting libraries get wrong, and the symptom is a screen
reader spelling a headline out letter by letter.

Do not put an `aria-label` on the element as well. Two labels is worse than none.

## 6. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text, and stays readable if the
JavaScript never arrives. Splitting only happens on the first frame. Call
`createSort` from `useEffect`, `onMounted`, or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For a one-shot reveal that default is 999, which is any time after the animation
has finished. The text simply appears, fully set, which is the correct outcome.
Do not set it to 0: that leaves the headline invisible.

## 7. The three mistakes most likely to be made here

1. **Building the spans in JSX or a template.** React and Vue will overwrite the
   DOM on the next render and the animation stops mid-way. Pass plain text as
   children and let `createSort` do the splitting inside an effect.

2. **Leaving `stagger` at 26ms on a long heading.** It multiplies. Sixty
   characters at 40ms is a two and a half second wait before the last one lands,
   which reads as a broken page rather than a reveal. Above about 40 characters,
   switch `split` to `word`.

3. **Setting `reducedMotionTime` to 0.** That is the frame before anything has
   arrived, so the text stays invisible for anyone who has asked for less motion.
   It wants to be a time after the animation ends.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
