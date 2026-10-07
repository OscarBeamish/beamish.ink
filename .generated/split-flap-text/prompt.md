You are adding **SplitFlapText** from Beamish to this project.

> A departure board, built as hinged leaves that have to pass through the strip to reach their letter. Type · effect · MIT.
> https://beamish.ink/effects/split-flap-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. Each character becomes four layers: the top half of the glyph arriving and the bottom half of the one leaving, both still, and two leaves over them that fall and rise
- The leaves go through the strip in order. A cell cannot jump from A to R, it has to pass through everything between, which is why a real board lands its letters in the order the alphabet puts them rather than left to right. Nothing about that was designed: it falls out of modelling the strip, and it is the most recognisable thing about the object
- A character that is not on the strip stops at position 0, the blank. A board cannot show what it does not carry, and inventing a leaf for it would be the one dishonest thing in here
- Every cell is the width of the widest glyph on the strip, measured once in the real face. The flaps on a board are all the same size because they are the same part, and a board whose cells breathe is not a board
- A falling leaf darkens as it turns away from the light. It is the only shading in the effect and it is doing a lot: without it the two leaves are flat shapes sliding over each other and the cell reads as a wipe
- Pure in t. Which leaf a cell is on and how far through its fall are both arithmetic on the clock, so the recorder can seek it and a dropped frame costs nothing
- The original string stays in the accessibility tree as one label. A board read leaf by leaf is a stream of nonsense
- destroy() puts the original text back, leaving the element as it was found
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/split-flap-text/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/split-flap-text/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

SplitFlapText is a departure board. Each character is a split-flap cell: a stack
of hinged leaves, each carrying half a glyph, dropping one at a time until the
right one is showing.

The mechanism is the effect, so it is built rather than suggested. Four layers
per cell:

- the top half of the glyph arriving, sitting still behind everything
- the bottom half of the glyph leaving, likewise
- a leaf over the top half, carrying the upper half of the leaving glyph,
  falling from upright to edge on
- a leaf over the bottom half, carrying the lower half of the arriving glyph,
  rising from edge on to upright

Two things follow from that and neither had to be designed.

**The leaves go through the strip in order.** A cell cannot jump from A to R. It
has to pass through everything between, one leaf at a time, which is why a real
board lands its letters in the order the alphabet puts them rather than left to
right, and why a time takes longer to arrive than a word. That is the single
most recognisable thing about the object, and it falls straight out of modelling
the strip.

**A character that is not on the strip stops at the blank.** A board cannot show
what it does not carry. Inventing a leaf for it would be the one dishonest thing
in here.

It is pure in `t`: which leaf a cell is on, and how far through its fall, are
both arithmetic on the clock.

## 3. Wire it in

**Plain HTML.** The text must already be in the element.

```html
<div id="board">Departures</div>

<script type="module">
  import { createSplitFlapText } from './beamish/effects/split-flap-text/core.js'

  const board = createSplitFlapText(document.querySelector('#board'))
  board.start()
</script>
```

**React.** Pass the text as children. Do not build the cells in JSX: React will
overwrite the DOM on the next render and the board will stop half way.

```tsx
import { useEffect, useRef } from 'react'
import { createSplitFlapText } from '@/beamish/effects/split-flap-text/core'

export function Board({ children }: { children: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const board = createSplitFlapText(host.current, { flap: 52 })
    board.start()
    return () => board.destroy()
  }, [children])

  return <div ref={host} />
}
```

The dependency on `children` is deliberate. If the text changes, the cells have
to be rebuilt.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSplitFlapText } from '@/beamish/effects/split-flap-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let board: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  board = createSplitFlapText(host.value)
  board.start()
})

onBeforeUnmount(() => board?.destroy())
</script>

<template>
  <div ref="host">Departures</div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Running it again.** It runs once from `t = 0`. To play it again, reset the
clock and start:

```ts
board.stop()
board.renderAtTime(0)
board.start()
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a scroll-triggered board with no extra code.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `strip` | string | ` ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:-` | any value | The leaves, in the order they are stacked. Position 0 is what a cell shows at rest, and a blank there is why a board starts empty. The order is the mechanism: a cell has to pass through every leaf between where it is and where it is going, so putting the digits after the letters is what makes a time take longer to land than a word. |
| `flap` | number | `52` | 10 to 300 ms (looks right between 35 and 80) | Milliseconds for one leaf to fall. This multiplies: a cell showing Z has to drop twenty six leaves to get there, so 52ms is already more than a second of travel for the back half of the alphabet. That is what a board does, and it is why they are satisfying. |
| `stagger` | number | `110` | 0 to 500 ms | Milliseconds between one cell starting and the next. At 0 the whole board starts together, which is what a board does when the schedule changes, and the letters still land in alphabetical order because the strip decides that, not this. |
| `hold` | number | `240` | 0 to 3000 ms | Milliseconds before the first cell starts. A board sits blank for a moment before it runs, and that moment is what tells you it is a board rather than a label that happens to be animating. |
| `face` | color | `#26261f` | any CSS hex | The face of a leaf. Dark, because that is what they are: these are painted metal or plastic tiles, and a pale one reads as a card being turned rather than a flap falling. |
| `ink` | color | `#f7f5ed` | any CSS hex | The type printed on the leaf. Off white rather than white, which is both what the real thing looks like after a few years and what keeps it from glaring out of a paper page. |
| `seam` | number | `0.45` | 0 to 1 | How dark the line across the middle of a cell is. It is drawn as a line rather than a gap, because on a board it is two leaves meeting and not a space between them. At 0 the cell reads as one tile and the mechanism disappears. |
| `depth` | number | `180` | 0 to 1200 px (looks right between 120 and 400) | Perspective applied to the fall. At 0 it is a flat fold, which looks like a sheet of paper creasing; low numbers are a strong perspective and read as a leaf that has thickness. Too low and the leaf swings past the front of the cell. |
| `shade` | number | `0.55` | 0 to 1 | How much a falling leaf darkens as it turns away from the light. At 0 the two leaves are flat shapes sliding over each other and the cell reads as a wipe rather than as something hinged. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot reveal this should be a time after the board has finished, so the text simply appears, set in its cells and still. |

## 5. Accessibility. Do not skip this

The cells are marked `aria-hidden` and a visually hidden copy of the original
string sits alongside them. A screen reader reads the sentence rather than a
stream of leaves.

Do not put an `aria-label` on the element as well. Two labels is worse than
none.

## 6. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The cells are only built on the first frame. Call
`createSplitFlapText` from `useEffect`, `onMounted`, or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For a one-shot reveal that default is 999, which is any time after the board has
finished, so the text appears set in its cells and still. Do not set it to 0:
that is a board of blanks.

## 7. The three mistakes most likely to be made here

1. **Transparent leaves.** A leaf is a tile and it hides what is behind it. The
   first version of this left the four layers transparent, and every cell at
   rest showed the top half of the letter that was arriving straight through the
   blank leaf covering it. It looks like a stacking bug and it is really a
   missing object.

2. **Leaving a leaf at exactly 90 degrees.** Under a perspective projection a
   plane standing edge on does not vanish, it projects as a sliver with half a
   letter smeared along it. Hide it instead.

3. **Letting the cells size themselves.** The flaps on a board are all the same
   size because they are the same part. Every cell here is the width of the
   widest glyph on the strip, measured once in the real face, and a board whose
   cells breathe is not a board.

4. **Using it for a paragraph.** Four elements per character, and a strip that
   can take a second to deliver one letter. It is a board.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/split-flap-text/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/split-flap-text/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
