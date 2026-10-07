You are adding **CircularText** from Beamish to this project.

> Type set round a ring that closes exactly, because the string is fitted to the circumference rather than placed letter by letter. Type · effect · MIT.
> https://beamish.ink/effects/circular-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- An SVG textPath, which is the thing in the platform built for this, rather than a rotation and a translation per character. Placing letters by hand loses kerning, because the browser is handed ten one-character strings and kerning happens between characters in a string, and it never closes the ring, because the spacing comes from a guess at the arc each letter subtends
- The fit is the whole trick: the string is given a textLength equal to the circumference and lengthAdjust of spacing, so the browser opens or closes the spaces until it fits exactly. The ring closes at any radius, in any face, with any string, and there is no number to tune
- spacing rather than spacingAndGlyphs. A fit that stretches the letterforms has changed the typeface, which is the one thing a typesetter may not do. The option to do it anyway is there and it is off
- The circle is drawn as two arcs. A single arc of 360 degrees is degenerate, its start and end points coincide, and the renderer has no way to know which way round to go, so it draws nothing
- Letters hang inside the ring by reversing the path rather than by flipping the text: the baseline side follows the direction of travel, so the letters turn over without being touched
- The turn is one transform on one group. Animating startOffset instead re-lays out the text sixty times a second to produce a picture that is a rotation of the one before it
- The path gets an id unique to the instance. Two rings on a page sharing a path id is the one failure here that nothing in the markup hints at: the second textPath silently uses the first one's circle
- The face, weight and tracking are inherited from the element. A text effect that picks its own typeface is a graphic
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
| `src/beamish/effects/circular-text/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/circular-text/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

CircularText sets type round a ring and turns it slowly. A roundel, a seal, the
stamp on a bottle of something.

Nearly every version of this on the web places each character by hand, with a
rotation and a translation per letter, and it is wrong in two ways that are hard
to unsee once you know about them.

The letters are positioned but never **fitted**, so the spacing comes from a
guess at the arc each one subtends and the ring never quite closes. There is
always a gap, or an overlap, at the join.

And each letter is rotated as a rigid block, so nothing **kerns**. The browser
has been handed ten separate one-character strings, and kerning happens between
characters in a string.

This uses an SVG `textPath`, which is the thing in the platform built for
exactly this, and gets both back for free. The text is laid out as text, so it
kerns and it ligates. And it is given a `textLength` equal to the circumference
with `lengthAdjust="spacing"`, so the browser fits the string to the ring by
opening or closing the spaces and never by distorting the letterforms.

The ring closes exactly, at any radius, in any face, with any string. There is
no number to tune.

## 3. Wire it in

**Plain HTML.** The text must already be in the element, and the element needs a
size: the ring fills the box it is given.

```html
<div id="seal" style="width: 320px; aspect-ratio: 1">
  Printed and bound in England
</div>

<script type="module">
  import { createCircularText } from './beamish/effects/circular-text/core.js'

  const ring = createCircularText(document.querySelector('#seal'))
  ring.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createCircularText } from '@/beamish/effects/circular-text/core'

export function Seal({ children }: { children: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const ring = createCircularText(host.current, { repeat: 2 })
    ring.start()
    return () => ring.destroy()
  }, [children])

  return (
    <div ref={host} style={{ width: 320, aspectRatio: '1' }}>
      {children}
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createCircularText } from '@/beamish/effects/circular-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let ring: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  ring = createCircularText(host.value)
  ring.start()
})

onBeforeUnmount(() => ring?.destroy())
</script>

<template>
  <div ref="host" class="seal">Printed and bound in England</div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `radius` | number | `0.38` | 0.1 to 0.5 (looks right between 0.3 and 0.45) | Radius of the ring, as a share of the box. 0.5 puts the baseline on the very edge, which leaves the ascenders outside it: the overflow is visible rather than clipped, on purpose, but 0.38 is the largest that keeps everything inside a square box. |
| `repeat` | number | `2` | 1 to 8 | How many times the text goes round. Because the string is fitted to the circumference, this is really a density control: one copy of a short phrase is set very wide, four copies of it are set tight. Pick the one that gives the tracking you want. |
| `separator` | string | ` · ` | any value | What sits between one copy and the next. A middle dot is the one every seal and every bottle label uses, for the good reason that it reads at any size and has no direction to it. It is also what tells a reader the ring repeats rather than running on. |
| `size` | number | `0.17` | 0.04 to 0.5 | Letter height, as a share of the radius, so the ring scales as one object. It does not affect the fit at all: the string fills the circumference whatever size the letters are, and this only decides how heavy the ring looks. |
| `spin` | number | `360` | -1440 to 1440 deg (looks right between 180 and 720) | Degrees the ring turns over one period. Negative turns it the other way. A whole number of degrees over the period, so the loop closes exactly; 360 is one unhurried revolution. |
| `inside` | boolean | `false` | `true` · `false` | Hang the letters inside the ring rather than standing them on it. This is the half of a seal that reads along the bottom, and it is done by reversing the path rather than by flipping the text, so the letters keep their own shapes. |
| `distort` | boolean | `false` | `true` · `false` | Let the fit stretch the letterforms as well as the spaces. Off, and it should stay off: it is here so that the choice is visible rather than hidden. Turn it on once to see what a stretched face looks like, then turn it off. |
| `period` | number | `24` | 6 to 240 s | Seconds for one revolution. Long: a ring is a mark, not an animation, and a seal turning fast enough to notice is a loading spinner. Twenty-four seconds is fifteen degrees a second, which is about the slowest a turn can be and still read as turning. |

## 5. Accessibility. Do not skip this

The SVG is marked `aria-hidden` and a visually hidden copy of the original
string sits alongside it. A screen reader reads the sentence, once, in order.

A ring of text is decorative by nature: the lower half of a continuous ring is
upside down, which no reader should be asked to work through. Keep anything that
has to be read out of it.

## 6. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The SVG is only built on the first frame. Call
`createCircularText` from `useEffect`, `onMounted`, or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`, which here is 0: the ring at its starting angle. The ring
is the thing, and the turn is only how it passes the time.

## 7. The three mistakes most likely to be made here

1. **Placing the letters yourself.** It loses kerning and it never closes the
   ring. `textPath` and `textLength` do both properly, and they are in every
   browser.

2. **`lengthAdjust="spacingAndGlyphs"`.** It fits by stretching the letterforms,
   which means it has changed the typeface. The option is here as `distort` so
   the choice is visible rather than hidden, and it should stay off.

3. **A single 360 degree arc.** Its start and end points coincide, the renderer
   has no way to know which way round to go, and it draws nothing. The circle
   here is two arcs.

4. **Animating `startOffset`.** It re-lays out the text every frame to produce a
   picture that is a rotation of the one before it. Rotate the group.

5. **Spinning it fast.** A seal turning fast enough to notice is a loading
   spinner. The default is one revolution in forty-eight seconds.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/circular-text/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/circular-text/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
