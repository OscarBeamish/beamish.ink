You are adding **AsciiImage** from Beamish to this project.

> A picture set in characters, where each cell takes the glyph whose shape fits the edge running through it rather than the one whose brightness matches. Surfaces · effect · MIT.
> https://beamish.ink/effects/ascii-image

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Every ASCII renderer ever written does the brightness version: order characters by how much ink they carry, measure the average tone of a cell, look up the glyph at that position. The fault is always the same. A cell sitting on a hard edge averages to a midtone, a midtone glyph is a texture rather than a line, and every contour in the picture turns to mush
- So each cell is measured twice. A Sobel pass gives the direction and strength of the edge through it, and where that edge is strong the cell takes a glyph lying along it, quantised to four angles. Only the cells with nothing much going on fall back to the ramp
- The glyph lies along the edge, which is the gradient turned a quarter: a gradient points across an edge, not along it. Getting that backwards gives a picture whose every contour is drawn at right angles to itself, and it looks like a weave
- The Sobel is taken over neighbouring cells rather than neighbouring pixels, because the question is about the picture at the scale of a cell. Measured at pixel scale a strand of hair fills the kernel and every cell comes back as an edge
- `glyphs` is the tone ramp only. The four directional characters are not an option because they are not a palette: each is there because it lies along one of four angles, and a different character in the same slot is a character pointing the wrong way
- The glyphs are drawn once into a texture atlas in the element's own monospace face, so the picture is set in the type the page is set in. They are rendered at 64px and minified, because a glyph rasterised straight into a 9px cell is four pixels of aliasing
- The 2D canvas that sets the type is used once and never drawn to again. It is not a second live rendering context
- Rec. 709 luma rather than a mean of the channels. A straight mean makes red and blue too light, which on a face is the difference between skin and a mask
- The picture arrives cell by cell in reading order with a little jitter, so the front is a ragged edge rather than a diagonal line. A teleprinter delivers a character at a time
- Recast for paper. The original is green on black, which is a terminal; this is ink on a sheet, which is what a teleprinter actually produced
- The <img> stays in the document, hidden. Its alt text is the accessible version of the picture and a page whose script never runs still shows the photograph
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/ascii-image/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/ascii-image/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

AsciiImage sets a photograph in characters, where each cell takes the glyph
whose **shape** fits what is in it rather than the one whose brightness matches.

Every ASCII renderer ever written does the brightness version: order a set of
characters by how much ink they carry, measure the average tone of a cell, look
up the glyph at that position. It works, and it always has the same fault. Edges
come out as mush, because the average tone of a cell sitting on a hard edge is a
midtone, and a midtone glyph is a texture rather than a line. Set a face that
way and the jaw disappears.

So each cell here is measured twice. A Sobel pass gives the direction and
strength of whatever edge runs through it, and where that edge is strong enough
the cell takes a glyph that lies along it: a bar for a vertical edge, a slash
for a diagonal, an underscore for a horizontal. Only the cells with nothing much
going on fall back to the tone ramp.

The picture keeps its contours, which is the whole point.

Two details that are easy to get backwards:

**The glyph lies along the edge, not across it.** A gradient points across an
edge. Using the gradient angle directly gives a picture in which every contour
is drawn at right angles to itself, and it reads as a woven texture rather than
as a drawing.

**The Sobel is taken over neighbouring cells, not neighbouring pixels.** The
question is which way the edge in this cell runs, which is a question about the
picture at the scale of a cell. Measured at pixel scale, a strand of grass fills
the kernel and every cell in the frame comes back as an edge.

## 3. Wire it in

**Plain HTML.** The element must contain an `<img>`. It stays in the document,
hidden once the texture is uploaded, so a browser that never runs the script
shows the photograph and a screen reader still reads the alt text.

```html
<div id="plate" style="position: relative; height: 70vh">
  <img src="/plate.jpg" alt="A grass headland falling away to the sea" />
</div>

<script type="module">
  import { createAsciiImage } from './beamish/effects/ascii-image/core.js'

  const typed = createAsciiImage(document.querySelector('#plate'))
  typed.start()
</script>
```

Take the image out of the flow (`position: absolute; inset: 0`). Left in it, the
canvas the effect appends is pushed a full element height down the page, where it
draws perfectly and is never seen. That is worth saying because it looks like the
effect has failed rather than like a layout problem.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createAsciiImage } from '@/beamish/effects/ascii-image/core'

export function Plate({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const typed = createAsciiImage(host.current, { cell: 9 })
    typed.start()
    return () => typed.destroy()
  }, [src])

  return (
    <div ref={host} style={{ position: 'relative' }}>
      <img src={src} alt={alt} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createAsciiImage } from '@/beamish/effects/ascii-image/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let typed: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  typed = createAsciiImage(host.value)
  typed.start()
})

onBeforeUnmount(() => typed?.destroy())
</script>

<template>
  <div ref="host" class="plate">
    <img src="/plate.jpg" alt="A grass headland falling away to the sea" />
  </div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `cell` | number | `9` | 3 to 40 px (looks right between 6 and 14) | Size of one character cell. This is the resolution of the whole thing: at 6 it is a halftone made of letters and the subject is readable, at 20 it is a pattern and the subject is a rumour. Below about 5 the glyphs stop being distinguishable and the shape-aware half stops earning its keep. |
| `glyphs` | string | ` .,:;ox%#@` | any value | The tone ramp, lightest first, used only where no edge was found. Order it by how much ink each character carries rather than by anything else: this is the one place in the effect where brightness is the right question. The four directional characters are not here on purpose. |
| `paper` | color | `#fbfaf4` | any CSS hex | The sheet. Set this and the ink the other way round and you have the terminal version, which is what everybody else ships and what this was recast away from. |
| `ink` | color | `#26261f` | any CSS hex | The ink. A soft black rather than a true one: a teleprinter ribbon is never quite black and a page of hard black characters on warm paper reads as a screenshot. |
| `contrast` | number | `1.25` | 0.2 to 4 (looks right between 1 and 2) | How hard the tone is pushed away from the midtone before the ramp is read. A photograph with a narrow range gives a picture made of three characters, and this is what opens it out. It does not affect the edge detection at all. |
| `threshold` | number | `0.7` | 0.05 to 3 (looks right between 0.45 and 1) | Edge strength above which a cell takes a directional glyph instead of a tone one, on the scale a Sobel over luminance produces, which tops out near 5.6 for a black-to-white step. The single most important number here, and it was set by looking: at 0.17 almost every cell claims an edge and the picture is a weave of dashes with no tone in it, and by 1.2 only the hardest boundary in the frame still gets one, so the contours go back to mush and you have an ordinary ASCII renderer. 0.7 keeps the horizon, the cliff line and the edge of the fog while leaving the grass and the sea as tone. |
| `shapes` | boolean | `true` | `true` · `false` | Turn the shape-aware half off, leaving an ordinary brightness ramp. It is here to be turned off once, so the difference is a thing you have seen rather than a claim in a file. |
| `reveal` | number | `2600` | 100 to 20000 ms | Milliseconds for the picture to come in, cell by cell in reading order. A teleprinter is not fast, and the arrival is most of the pleasure: at 300 it is a fade, at 2600 it is something being printed. |
| `hold` | number | `200` | 0 to 5000 ms | Milliseconds of blank paper before it starts. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot arrival this should be a time after it has finished, so the whole picture is simply there. The picture is the point; the typing is how it gets in. |

## 5. Accessibility. Do not skip this

The alt text on the `<img>` is the accessible version of the picture and it is
left exactly as written. Write it as you would for the photograph, because that
is what the reader is being told about.

A picture made of characters is not text, and no screen reader should be asked
to read it as text. There is nothing in the canvas for assistive technology, by
design.

## 6. Cleanup and SSR

`destroy()` releases the WebGL context and both textures, cancels the RAF,
disconnects both observers, removes every listener, and puts the image's
visibility back. One live context at a time is the budget, so call it.

The photograph renders on the server as an ordinary `<img>`, which is the whole
fallback: if the script never runs, the page shows the picture.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is after the arrival has finished. The picture is simply there. The
picture is the point; the typing is only how it gets in.

## 7. The three mistakes most likely to be made here

1. **Using the gradient angle directly.** It points across the edge. The glyph
   has to lie along it, which is a quarter turn away, and the version without
   the turn looks like a woven cloth.

2. **Sobel at pixel scale.** Every cell comes back as an edge, because at pixel
   scale almost everything is one. The kernel has to step by a cell.

3. **A threshold set by taste rather than by looking.** It is the one number
   here with a narrow right answer, and both failures look plausible on their
   own: a weave of slashes, or an ordinary ASCII picture.

4. **Leaving the image in the flow.** The canvas lands an element height below
   it, draws correctly, and is never seen.

5. **A photograph with no contours.** Gravel, fur, foliage. Every cell falls
   back to the ramp, and the whole reason for the effect goes unused.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/ascii-image/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/ascii-image/adapters/vue.ts

---

Concept credit: Choosing the glyph by the shape of the edge in a cell rather than by its average brightness, from a Codrops article on a shape-aware ASCII renderer, by Codrops, https://tympanus.net/codrops/.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
