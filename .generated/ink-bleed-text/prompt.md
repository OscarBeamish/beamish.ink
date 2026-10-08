You are adding **InkBleedText** from Beamish to this project.

> Type on paper too absorbent for it, the ink wicking along the fibres. Type · effect · MIT.
> https://beamish.ink/effects/ink-bleed-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. One SVG displacement filter, which is the honest mechanism: turbulence supplies the fibre and feDisplacementMap pushes each pixel of the glyph by the amount of fibre under it
- Not a blur. A Gaussian softens an edge evenly, which is a lens out of focus rather than ink spreading, and it is what makes most attempts at this look photographic rather than printed
- fractalNoise rather than turbulence: turbulence takes the modulus of each octave and leaves hard creases that read as cracks in the letter
- The filter region is widened to 150%, because displaced pixels outside it are cut off and a heavily bled letter would come back with its edges sliced square
- Each instance gets its own filter, so two bled headings on a page do not share one
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/ink-bleed-text/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/ink-bleed-text/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Type printed on paper that is too absorbent for it.

The usual version of this is a CRT wobble: the glyph edges shimmer sideways like
a signal losing lock. Paper has its own way of ruining a letter and it is nothing
like that. Ink wicks along the fibres, so the edge does not move, it grows teeth.
Serifs fill in, counters close up, and the letter gains a fuzz that is irregular
at the scale of the fibre rather than smooth.

An SVG displacement filter is the honest way to draw it. Turbulence supplies the
fibre and `feDisplacementMap` pushes each pixel of the glyph sideways by the
amount of fibre under it, which is exactly the mechanism: the ink goes where the
paper lets it.

It is deliberately **not** a blur. A Gaussian softens an edge evenly, which is a
lens out of focus rather than ink spreading, and it is the thing that makes most
attempts at this look photographic rather than printed.

It also uses `fractalNoise` rather than turbulence proper. Turbulence takes the
modulus of each octave, which leaves hard creases that read as cracks in the
letter rather than as fibre.

No canvas and no WebGL.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `bleed` | number | `9` | 0 to 14 | How far the ink creeps, in pixels, at its furthest. Past about 8 the counters of a and e close up and the word stops being readable, which is a real thing badly printed paper does and rarely a thing you want. |
| `floor` | number | `3` | 0 to 8 | How far it has crept at its least. Deliberately not zero: a sheet that has taken ink does not give it back, so the letter never returns to a clean edge. |
| `fibre` | number | `0.055` | 0.002 to 0.2 | Coarseness of the fibre, as a turbulence base frequency. Lower is a longer, rougher, more absorbent fibre. This is the one to reach for if the bleed looks like noise rather than paper. |
| `detail` | number | `3` | 1 to 5 | Layers of fibre. More is a finer, more tangled structure and more work for the filter; the gain above four is hard to see. |
| `period` | number | `9` | 1 to 60 | Seconds for one breath of the ink. Driven by a cosine, so it is exactly periodic and the loop closes. |
| `seed` | number | `4` | 0 to 999 | Which sheet of paper. Any two seeds give different fibre; the same seed always gives the same sheet. |

## 5. The text is your markup

It is whatever is already in the element.

```html
<h1 id="title">Blotting paper</h1>
```

```ts
import { createInkBleedText } from './beamish/effects/ink-bleed-text/core'

const bleed = createInkBleedText(document.querySelector('#title'))
bleed.start()
```

The element is not rebuilt and the text is not split, so it stays selectable, it
still wraps, and a screen reader gets exactly what you wrote. The effect adds one
hidden SVG to the document and sets a `filter` on the element; `destroy()`
removes both.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createInkBleedText } from '@/beamish/effects/ink-bleed-text/core'

export function Title({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const bleed = createInkBleedText(host.current)
    bleed.start()
    return () => bleed.destroy()
  }, [])

  return <h1 ref={host}>{children}</h1>
}
```

Do not put option values in the dependency array. Call `update()` instead.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createInkBleedText } from '@/beamish/effects/ink-bleed-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let bleed: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  bleed = createInkBleedText(host.value)
  bleed.start()
})

onBeforeUnmount(() => bleed?.destroy())
</script>

<template>
  <h1 ref="host">Blotting paper</h1>
</template>
```

## 6. Tuning it

`fibre` is the one to reach for first, and it is the one that decides whether
this looks like paper or like noise. It is the turbulence base frequency, so
lower is a longer, coarser, more absorbent fibre. If the bleed looks like static,
`fibre` is too high.

`floor` is deliberately not zero. A sheet that has taken ink does not give it
back, so the letter never returns to a clean edge. Setting it to zero gives you
something that dries completely twice a cycle, which paper does not do.

`bleed` past about 8 closes the counters of **a** and **e** and the word stops
being readable. Badly printed paper really does that, and it is rarely what you
want on a page somebody has to read.

## 7. Performance

It holds 59.8fps at 1440 by 900 at 2× DPR, measured, which is indistinguishable
from the same page with no filter on it.

That is only true because the turbulence is cached. It is the expensive half of
the filter, and the fibre of a sheet does not change between frames, so only the
displacement scale is set per frame. Setting `baseFrequency` every frame instead
costs a full filter rebuild each time and the figure above stops being true.

SVG filters are rasterised on the CPU in some browsers, and the cost scales with
the filtered area. This is for a heading.

## 8. Cleanup and SSR

`destroy()` removes the filter from the element, removes the SVG it lives in,
cancels the RAF and disconnects both observers. There is no WebGL context to
release.

Each instance gets its own filter with its own id, so two bled headings on a page
do not share one and tearing one down cannot break the other.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## 9. Pausing and reduced motion

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable, and this moves indefinitely. `stop()` and `start()` are on the handle
for that. Surface them as a real control in your own build.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn, at `reducedMotionTime`, which defaults to 0. At t = 0 the cosine is at
its minimum, so what gets drawn is the letter at `floor`: bled, but as little as
it ever is, and completely still.

If you would rather it were perfectly clean for those readers, mount with
`bleed: 0, floor: 0` when `matchMedia('(prefers-reduced-motion: reduce)')`
matches.

## 10. The three mistakes most likely to be made here

1. **Using it on body text.** It is a filter over the whole element, rasterised
   on the CPU in some browsers, and a paragraph of bled type is both expensive
   and unreadable. Headings.

2. **Raising `fibre` to get more texture.** Higher is a finer fibre, and past
   about 0.1 it stops reading as paper and starts reading as static. More texture
   is lower `fibre` and more `bleed`.

3. **Setting `floor` to 0.** The letter dries completely twice a cycle, which
   paper does not do once it has taken ink.

4. **Putting it on text that has to be read quickly.** A nav label or a button is
   a bad place for a letterform that is actively getting worse.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/ink-bleed-text/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/ink-bleed-text/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
