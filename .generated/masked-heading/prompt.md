You are adding **MaskedHeading** from Beamish to this project.

> A heading uncovered by a sheet sliding off it, with the edge of that sheet torn rather than cut. Reveals · effect · MIT.
> https://beamish.ink/effects/masked-heading

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- A straight-edged mask crossing a heading is a wipe, and a wipe reads as a machine because nothing in the physical world has an edge that straight. The whole item is in the edge
- A deckle edge, the untrimmed side of a handmade sheet, has structure at two scales: a slow wander where the pulp ran thin against the deckle, and a fine fray of fibres on top. One scale alone gives either a gentle curve or a saw blade, and neither reads as paper
- The tear is built once and keeps its shape as it travels, because a torn edge does not re-tear itself while the sheet is being pulled away. Regenerating it per frame is the quickest way to turn paper into a flame
- It is a clip-path polygon and nothing else, so the text is never taken apart: it selects, wraps, translates and reads exactly as before. This and SplitFountainText are the only two effects here that leave the DOM alone
- The clip is composited, so a heading being uncovered costs a transform rather than a repaint
- The polygon closes across the side that stays uncovered, and the corners sit outside the box. Closing it the other way round clips the half you meant to keep, which looks like the animation running backwards
- The travel goes past the end by the overshoot, so the torn edge clears the type rather than coming to rest somewhere across it
- The travel starts and ends entirely off the element, by the depth of the tear at each end. Starting at exactly 0 looks like a bug rather than a sheet: the parts of the tear that poke forwards are already inside the box, so a sheet supposedly at rest leaks slivers of the heading through its own edge
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/masked-heading/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/masked-heading/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

MaskedHeading uncovers a heading by sliding a sheet off it, and the edge of that
sheet is torn rather than cut.

A straight-edged mask crossing a heading is a wipe, and a wipe reads as a
machine, because nothing in the physical world has an edge that straight. The
whole of this item is in the edge.

A **deckle edge** is the untrimmed side of a handmade sheet, where the pulp ran
thin against the frame. It has structure at two scales: a slow wander over a
third of the sheet, and a fine fray of fibres on top of it. One scale alone
gives either a gentle curve or a saw blade, and neither reads as paper. Both are
here.

The tear is built once and **keeps its shape as it travels**, because a torn
edge does not re-tear itself while you pull the sheet away. Regenerating it per
frame is the quickest way to turn paper into a flame.

## 3. Wire it in

**Plain HTML.** Everything inside the element is uncovered together, so put it
on the block rather than on each line.

```html
<div id="masthead">
  <h1>Uncovered, not wiped</h1>
  <p>A straight-edged mask is a wipe.</p>
</div>

<script type="module">
  import { createMaskedHeading } from './beamish/effects/masked-heading/core.js'

  const sheet = createMaskedHeading(document.querySelector('#masthead'))
  sheet.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createMaskedHeading } from '@/beamish/effects/masked-heading/core'

export function Uncover({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sheet = createMaskedHeading(host.current, { direction: 'up' })
    sheet.start()
    return () => sheet.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

Nothing is split, so there is no dependency on the children: the content can
change underneath it freely.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createMaskedHeading } from '@/beamish/effects/masked-heading/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sheet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sheet = createMaskedHeading(host.value)
  sheet.start()
})

onBeforeUnmount(() => sheet?.destroy())
</script>

<template>
  <div ref="host"><slot /></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Uncovering it again.**

```ts
sheet.stop()
sheet.renderAtTime(0)
sheet.start()
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a block that is uncovered when it comes into view.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `direction` | enum | `up` | `up` · `down` · `left` · `right` | Which way the uncovered area grows. Up is a sheet lifted off, and it is the one that reads as paper rather than as a transition; the sideways ones read as a sheet being slid, which is also a real thing but a busier one on a wide heading. |
| `duration` | number | `1500` | 200 to 10000 ms (looks right between 900 and 2400) | Milliseconds for the sheet to come away, eased so it arrives rather than stops. Quick: somebody pulling a sheet off a print does it in about a second, and anything slower reads as a curtain in a theatre. |
| `hold` | number | `250` | 0 to 5000 ms | Milliseconds before it starts, and how you stagger two blocks on one page. |
| `tear` | number | `0.07` | 0 to 0.4 (looks right between 0.04 and 0.12) | How far the slow wander of the edge reaches, as a share of the element. This is the large structure: where the pulp ran thin. At 0 the edge is straight and you have a wipe. |
| `fray` | number | `0.018` | 0 to 0.1 | How far the fine fray reaches. The fibres, on top of the wander. Raise it past about 0.05 and the edge stops being torn paper and becomes a saw blade. |
| `points` | number | `48` | 6 to 200 (looks right between 32 and 80) | Points along the edge. More is a finer tear and a longer path: below about twenty the fray has nowhere to happen and the edge reads as a gentle curve, and past a hundred you are paying for detail smaller than a pixel. |
| `overshoot` | number | `0.12` | 0 to 0.5 | How far past the end the sheet travels, so the torn edge clears the type. At 0 it comes to rest exactly at the far side, which on a tear means a few fibres are still lying across the last line. |
| `seed` | number | `7` | 0 to 9999 | Seed for the tear. The same seed gives the same sheet, so a recording and a live page match. Give two blocks on one page different seeds, or they are uncovered by the same torn sheet twice. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot reveal this should be a time after the sheet has gone, so the heading is simply there and unclipped. |

## 5. It never touches the text

It is a `clip-path` polygon and nothing else, which buys two things.

The text is never taken apart: it selects, wraps, translates, searches and reads
exactly as before. This and SplitFountainText are the only two effects in the
library that leave the DOM alone.

And the clip is composited, so a heading being uncovered costs a transform
rather than a repaint.

## 6. Shaping the tear

`tear` is the slow wander and `fray` is the fibres. Keep the first around a
tenth of the element and the second at a fiftieth: the ratio between them is
what makes it paper rather than a wave or a blade.

`points` is the resolution of the edge. Below about twenty the fray has nowhere
to happen and the edge reads as a gentle curve. Past a hundred you are paying
for detail smaller than a pixel.

Give two blocks on one page **different seeds**, or they are uncovered by the
same torn sheet twice, which the eye catches immediately.

## 7. Direction

`up` is a sheet lifted off, and it is the one that reads as paper. The sideways
directions read as a sheet being slid, which is also a real thing and a busier
one across a wide heading: the tear travels along the reading direction, so it
cuts through words rather than lines.

## 8. Accessibility. Do not skip this

The text is untouched, so there is nothing to announce and nothing hidden from a
screen reader. A clipped heading is still in the accessibility tree and still
read, which is the correct behaviour for a decorative reveal.

## 9. Cleanup and SSR

`destroy()` removes the clip, leaving the element exactly as it was found. There
is no GPU resource to release and no DOM to rebuild.

The content renders on the server unclipped, which means it is fully visible for
a moment before the first frame covers it. If that matters, hide the block with
CSS and let the effect's first frame take over, or accept the flash: it is one
frame, and the alternative is content that is invisible without JavaScript.

## 10. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is after the sheet has gone. The heading is simply there, unclipped.

## 11. The three mistakes most likely to be made here

1. **A straight edge.** `tear: 0` is a wipe, and a wipe is a television
   transition. The edge is the entire item.

2. **Regenerating the tear each frame.** The edge crawls and flickers, and what
   looked like paper becomes a flame. A torn edge keeps its shape.

3. **Starting the travel at exactly 0.** The parts of the tear that poke
   forwards are already inside the box, so a sheet supposedly at rest leaks
   slivers of the heading through its own edge. The travel has to begin a tear's
   depth off the element, and end a tear's depth past the far side.

4. **Closing the polygon the wrong way round.** It clips the half you meant to
   keep, which looks like the animation running backwards.

5. **One tear for several blocks.** The same seed gives the same sheet, and
   seeing it twice on one page gives the whole thing away.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/masked-heading/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/masked-heading/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
