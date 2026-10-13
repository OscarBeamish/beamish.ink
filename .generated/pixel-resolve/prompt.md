You are adding **PixelResolve** from Beamish to this project.

> A picture arriving out of big blocks, averaged rather than point sampled, landing in patches. Reveals · effect · MIT.
> https://beamish.ink/effects/pixel-resolve

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The obvious version quantises the coordinate, samples once per block and steps the block size down over time. It has two faults you can see immediately
- It jumps. A block has to be a whole number of pixels or the blocks come out uneven, so stepping the size gives four or five visible lurches with nothing in between. Crossfading between two rungs of the ladder is what turns the steps into an arrival
- It point samples. One pixel out of a block is not the block: anything thinner than a block vanishes at large sizes and pops back at small ones, which reads as the picture flickering rather than resolving. Averaging across the block is what a mipmap does and it is what keeps a subject legible at eight pixels across
- The blocks do not arrive together. Each has its own moment, hashed from the block rather than taken from its position, so the picture lands in patches. One that sharpens evenly reads as a lens being focused; one that arrives in patches reads as data
- Fewer colours while the blocks are big. A picture arriving over a slow line lost its palette as well as its resolution, and without that the big blocks are a smooth gradient, which no slow format ever produced
- The block ladder is in CSS pixels rather than device pixels, so the picture is the same picture on any display. A block measured in device pixels is half the size on a retina screen, which is the opposite of what a block is for
- One shot: it resolves and stays resolved. t past the end is the end and nothing is stored between frames
- The <img> stays in the document, hidden. Its alt text is the accessible version of the picture and a page whose script never runs still shows the photograph
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/pixel-resolve/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pixel-resolve/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

PixelResolve brings a picture in out of big blocks, the way one used to arrive
over a slow connection.

## 3. Wire it in

**Plain HTML.** The element must contain an `<img>`. It stays in the document,
hidden once the texture is uploaded, so a browser that never runs the script
shows the photograph and a screen reader still reads the alt text.

```html
<div id="plate" style="position: relative; height: 70vh">
  <img src="/plate.jpg" alt="A street at night under lit signs" />
</div>

<script type="module">
  import { createPixelResolve } from './beamish/effects/pixel-resolve/core.js'

  const plate = createPixelResolve(document.querySelector('#plate'))
  plate.start()
</script>
```

Take the image out of the flow (`position: absolute; inset: 0`). Left in it,
the canvas is pushed a full element height down the page, where it draws
perfectly and is never seen.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createPixelResolve } from '@/beamish/effects/pixel-resolve/core'

export function Plate({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const plate = createPixelResolve(host.current, { coarse: 64 })
    plate.start()
    return () => plate.destroy()
  }, [src])

  return (
    <div ref={host} style={{ position: 'relative' }}>
      <img src={src} alt={alt} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
```

**Vue.** Slot the picture in; the component hides it and uses it as a texture.

**Astro.** Nothing extra is required. The core is a standard ES module.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `coarse` | number | `64` | 4 to 256 px (looks right between 32 and 128) | The biggest a block gets, in CSS pixels. This is where the picture starts, and it decides whether the opening frame is a recognisable subject or an abstract. At 64 a face is still a face; at 160 it is four rectangles. |
| `steps` | number | `5` | 1 to 8 (looks right between 4 and 6) | How many halvings between the coarsest block and full resolution. Each one is a rung of the ladder the arrival crossfades along, so more rungs is a smoother arrival over the same time, not a longer one. |
| `duration` | number | `2.6` | 0.2 to 20 s (looks right between 1.5 and 4) | Seconds for the picture to arrive. Slow enough that each rung of the ladder is visible is the whole point; under about a second it reads as a glitch rather than as something loading. |
| `hold` | number | `0.25` | 0 to 5 s | Seconds of blocks before it starts. A short one matters more than it sounds: it lets the first frame register as a deliberate state rather than as the start of a transition that was already running. |
| `scatter` | number | `0.55` | 0 to 2 (looks right between 0.3 and 0.9) | How much the blocks disagree about when their turn is. At 0 the whole picture sharpens at once, which reads as a lens being focused rather than as data landing. The patchiness is the effect. |
| `taps` | number | `3` | 1 to 4 (looks right between 2 and 4) | Samples across a block, squared, so 3 is nine samples. At 1 it is a point sample: thin bright things vanish at large block sizes and pop back at small ones, and the picture flickers instead of resolving. This is also the performance control. |
| `levels` | number | `6` | 2 to 64 (looks right between 4 and 12) | How few colours the early blocks are allowed, climbing back to all of them by the end. A picture arriving over a slow line lost its palette as well as its resolution; without this the big blocks are a smooth gradient, which no slow format ever produced. |
| `ink` | color | `#0d0d12` | any CSS hex | What a block that has not arrived yet is. Near-black rather than black, so the empty blocks read as a surface waiting rather than as holes in the page. |
| `maxDpr` | number | `2` | 1 to 3 | Device pixel ratio ceiling. The blocks are measured in CSS pixels, so this changes how crisply a block's edges land rather than how big the blocks are. |
| `reducedMotionTime` | number | `9` | 0 to 60 s | The single frame shown when the user prefers reduced motion. For a one-shot arrival this has to be a time after it has finished, so the picture is simply there. The picture is the point; the arriving is how it gets in. |

## 5. Why it is not just a shrinking block size

The obvious version is three lines: quantise the coordinate, sample once per
block, step the block size down over time. It has two faults and you can see
both of them immediately.

**It jumps.** A block has to be a whole number of pixels, or the blocks come
out uneven and the grid shimmers. So stepping the size gives you four or five
visible lurches with nothing in between. The fix is to treat the sizes as a
*ladder* and crossfade between two rungs: at any moment two block sizes are in
flight and the picture is mixing from one to the other. That is what turns a
set of steps into an arrival.

**It point samples.** One pixel out of each block is not the block. Anything
thinner than a block — a cable, a sign, a highlight — vanishes completely at
large sizes and pops back at small ones, so the picture flickers instead of
resolving.

**Average across the block instead.** That is what a mipmap is for, and it is
what keeps a subject legible when it is eight pixels across. It costs `taps`
squared samples per block, and dropping `taps` to 1 brings the flicker
straight back, which is a quick way to see what the average is doing.

## 6. The blocks do not arrive together

A picture that sharpens evenly reads as **a lens being focused**. One that
arrives in patches reads as **data landing**. They are completely different
things and only the second one is interesting.

So each block gets its own moment, hashed from the block rather than taken from
its position, so the order is scattered rather than sweeping. `scatter: 0`
turns it back into a focus pull if you want to see the difference.

## 7. Fewer colours early

A picture arriving over a slow line lost its palette as well as its resolution.
Without that, the big blocks are a smooth gradient, which no slow format ever
actually produced. `levels` starts low and climbs back to the full range by the
end.

## 8. The ladder is in CSS pixels

Not device pixels. A block measured in device pixels is half the size on a
retina screen, which is the opposite of what a block is for: the whole point is
that it is a visible chunk, and it should be the same visible chunk everywhere.

## 9. Tuning it

1. **`coarse`.** Where the picture starts, and whether the opening frame is a
   recognisable subject or an abstract. At 64 a face is still a face; at 160 it
   is four rectangles.
2. **`duration`.** Slow enough that each rung of the ladder is visible is the
   whole point. Under about a second it reads as a glitch rather than as
   something loading.
3. **`scatter`.** Patches or a focus pull. See above.
4. **`taps`.** Quality and cost. Set it to 1 once to see the flicker the
   average exists to prevent.
5. **`levels`.** How much of the slow-connection character you want. Low is
   closer to a GIF; high is closer to a photograph that happens to be blocky.

## 10. Choosing a picture

One with big shapes and strong contrast. Pixelation keeps whatever survives
being averaged into a block, so a frame with bold shapes still reads at eight
pixels across while a frame of fine texture turns to mud.

Signage, a face, a silhouette, anything graphic. A field of foliage is the
worst case: every block averages to the same green and the arrival has nothing
to arrive at.

## 11. Accessibility. Do not skip this

The alt text on the `<img>` is the accessible version of the picture and it is
left exactly as written. There is nothing in the canvas for assistive
technology, by design.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`, which is after the arrival has finished. The picture is
simply there.

## 12. Cleanup and SSR

`destroy()` releases the WebGL context and the texture, cancels the RAF,
disconnects the observers, removes every listener and puts the image's
visibility back. One live context at a time is the budget, so call it.

The photograph renders on the server as an ordinary `<img>`, which is the whole
fallback: if the script never runs, the page shows the picture.

## 13. The three mistakes most likely to be made here

1. **Stepping the block size.** Four or five visible lurches. Two sizes have to
   be in flight at once and crossfading.

2. **Point sampling the block.** Thin bright things vanish and reappear, and
   the picture flickers rather than resolving.

3. **A block size that is not a whole number of pixels.** The grid shimmers,
   because some blocks round up and their neighbours round down.

4. **Measuring blocks in device pixels.** They come out half the size on a
   retina screen, which is backwards: a block is meant to be a visible chunk.

5. **No scatter.** It becomes a focus pull, which is a different effect and a
   duller one.

6. **A picture of texture.** Every block averages to the same colour and there
   is nothing to resolve into.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pixel-resolve/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pixel-resolve/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
