You are adding **HalftoneReveal** from Beamish to this project.

> A picture arriving dot by dot, the way a halftone comes up on press. Reveals · effect · MIT.
> https://beamish.ink/effects/halftone-reveal

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The picture is the host element's own <img> child. It is hidden from sight and left in the document, so the alt text is whatever you wrote and a page with no JavaScript still shows it
- The two tonal orders read the tone at the pixel rather than at each cell centre, which would be nine more texture samples. The difference is sub-cell on a photograph and the ordering is a soft field, so it costs nothing visible
- renderAtTime is pure in t, so replaying is a matter of resetting the clock rather than restarting anything
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/halftone-reveal/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/halftone-reveal/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

A picture arriving the way a printed one does.

Not a fade and not a wipe. The image is screened into halftone cells and each
cell's dot grows from nothing to full. That is how a halftone carries tone in the
first place, so growing the dots is the honest way to bring one in, and it reads
as a press coming up to pressure rather than as opacity being turned up.

The cells do not all start together. Each gets an order, blended between where it
sits along the sweep direction and a hash of its coordinates, so `scatter` runs
from a clean directional sweep at 0 to a random dissolve at 1. Everything useful
is in between: the sweep keeps its direction, but its leading edge is ragged
rather than ruled.

The dots are tested against the whole neighbourhood rather than against their own
cell. A dot only stays a dot while it fits inside its cell, and past half a cell
width a single-cell test clips it against the edges, so the dots grow into
rounded squares and then into plain squares and the whole thing ends up looking
like blocks. Taking the union over the nine cells around each pixel lets them
spill over the boundaries and merge, which is what ink does. The star-shaped
scraps of paper left between merged dots near the end are not an artefact: that
is the shadow-dot stage of a real screen.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency, no render targets.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | Shown wherever a dot has not grown yet, which at the start is the whole frame. Match it to the page behind or the reveal begins as a visible panel. |
| `screen` | number | `14` | 4 to 48 | Cell size in CSS pixels. Bigger cells are a coarser screen and a more obviously printed arrival. Laid out in pixels rather than in UV so the dots stay round and keep their size when the element changes shape. |
| `angle` | number | `45` | 0 to 90 | Screen angle in degrees. 45 is the one a printer reaches for, because a screen on the square reads as a grid and fights whatever is underneath it. |
| `sweep` | number | `24` | 0 to 360 | Direction the reveal travels, in degrees. 0 runs left to right. Only visible when scatter is below 1. |
| `scatter` | number | `0.55` | 0 to 1 | 0 is a clean directional sweep, 1 is a random dissolve with no direction at all. Between the two the sweep keeps its direction but its leading edge is ragged, which is the part worth having. |
| `order` | enum | `sweep` | `sweep` · `centre` · `edges` · `shadows` · `highlights` | The queue the cells arrive in. sweep runs across the frame along `sweep`; centre works outward from the middle and edges closes inward from the border; shadows brings the dark areas up first, which is the order a press lays ink down in, and highlights does the reverse, which reads as a picture emerging out of the paper rather than being printed onto it. |
| `shape` | enum | `round` | `round` · `square` · `diamond` | The shape of the dot. All three are screens a press has actually used: round is the default everywhere, square holds its shape into the shadows instead of merging, which is why newspapers used it, and diamond breaks up the jump at fifty percent where round dots all meet their neighbours at once and the midtone goes abruptly dark. |
| `feather` | number | `0.55` | 0.05 to 1 | How much of the reveal has cells part way through at any one moment. Low is a hard edge travelling across; high has the whole frame coming up together. |
| `grain` | number | `0.4` | 0 to 1 | Paper tooth over the whole thing. |
| `duration` | number | `1800` | 200 to 8000 | Milliseconds from blank paper to the finished picture. |

## 5. Choosing the reveal

`order` is the queue the cells arrive in, and it is the setting that decides
what the reveal is about.

**sweep** runs across the frame along `sweep`, which is the plain one and the
default.

**centre** starts in the middle and works out. **edges** does the reverse and
closes in. Both are about the frame rather than the picture, so they suit an
image with nothing in particular in the middle.

**shadows** brings the dark areas up first. This is the order a press actually
lays ink down in: the heavy areas are the ones that take it, and the picture
builds out of its own blacks.

**highlights** does the reverse, and reads completely differently. The lights
arrive first, so the picture seems to emerge out of the paper rather than to be
printed onto it.

Both tonal orders pay attention to the photograph, which means they look
deliberate on a picture with real tonal structure and look like nothing much on
a flat one. Turn `scatter` down to 0 with either of them and you get a clean
tonal separation, which is the most striking thing this effect does.

## 6. Choosing the dot

`shape` is the screen itself, and all three are ones a press has used.

**round** is the default everywhere and the one to leave alone unless you have a
reason.

**square** holds its shape into the shadows instead of merging with its
neighbours, which is why newspapers used it. It reads as coarser at the same
`screen` value.

**diamond** exists to solve a real problem: round dots all touch their
neighbours at the same moment, around fifty percent coverage, so the midtone
takes a visible step. A diamond meets two neighbours before the other two and
spreads that jump over a wider range of tones.

## 7. The picture is your markup

It comes from the host element's first `<img>` child, not from an option.

```html
<figure id="plate" style="position: relative; height: 60vh; margin: 0">
  <img src="/press.jpg" alt="What the picture shows" />
</figure>
```

```ts
import { createHalftoneReveal } from './beamish/effects/halftone-reveal/core'

const reveal = createHalftoneReveal(document.querySelector('#plate'))
reveal.start()
```

The effect hides it from sight once it has uploaded it and puts it back on
`destroy()`. It stays in the document throughout, so the alt text and the loading
behaviour are whatever you wrote, and a browser that never runs the script shows
the picture. Style it so that case looks deliberate: absolutely positioned with
`object-fit: cover` is usually right, because that is what the shader does too.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createHalftoneReveal } from '@/beamish/effects/halftone-reveal/core'

export function Plate({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!host.current) return
    const reveal = createHalftoneReveal(host.current)
    reveal.start()
    return () => reveal.destroy()
  }, [])

  return (
    <figure ref={host} className="plate">
      <img src={src} alt={alt} />
    </figure>
  )
}
```

The image is read once, at setup. If `src` changes, destroy and remount.

**Cross-origin images.** `texImage2D` refuses to upload an image from another
origin unless it was fetched with CORS, and it throws rather than giving you a
blank texture. Serve the picture from your own origin, or set
`crossorigin="anonymous"` and make sure the host sends
`Access-Control-Allow-Origin`.

## 8. Running it when the picture arrives

The reveal is a pure function of time from `start()`, so the only thing that
decides when it runs is when you call it. The usual want is on scroll into view:

```ts
const reveal = createHalftoneReveal(host)
new IntersectionObserver(
  ([entry], observer) => {
    if (!entry?.isIntersecting) return
    reveal.start()
    observer.disconnect()
  },
  { threshold: 0.3 }
).observe(host)
```

Disconnect after the first hit, or scrolling back up replays it, which nobody
asked for.

To replay deliberately, `renderAtTime(0)` and `start()` again.

## 9. Tuning it

`screen` is the cell size in CSS pixels and the first thing to reach for. Coarse
cells are more obviously printed; fine cells read closer to a dissolve. It is
laid out in pixels rather than in UV on purpose, so the dots stay round and keep
their size when the element changes shape.

`angle` at 45 is what a printer would use. On the square the screen reads as a
grid and fights whatever is underneath it.

`scatter` and `feather` do different jobs and are easy to confuse. `scatter` is
how much of the order is random rather than directional. `feather` is how many
cells are part way through at any one moment: low is a hard edge travelling
across the frame, high has the whole thing coming up together.

## 10. Cleanup and SSR

`destroy()` releases the WebGL context, deletes the texture, restores the
original image, cancels the RAF, disconnects both observers and removes every
listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## 11. Pausing and reduced motion

Nothing to pause. It runs once, for under two seconds by default, and then it is
a photograph. That is below the five seconds WCAG 2.2.2 is concerned with rather
than exempt from it, and `stop()` and `start()` are still on the handle.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn at `reducedMotionTime`, which defaults to 999 seconds: long past the end
of any reveal, so what gets drawn is the finished picture.

That is the right outcome and it is worth being deliberate about. Somebody who
has asked for less motion still wants to see the image; what they do not want is
to watch it assemble.

## 12. The three mistakes most likely to be made here

1. **Starting it on mount for something below the fold.** The reveal is over
   before the reader has scrolled to it and they see a plain photograph. Tie it
   to an IntersectionObserver as above.

2. **Leaving `paper` on the default when the page is not.** It is the whole
   frame at the start, so a mismatch means the reveal opens as a visible panel in
   the wrong colour.

3. **Reaching for `scatter` when you wanted `feather`.** If the edge is too hard,
   that is `feather`. If the sweep is too obviously a direction, that is
   `scatter`.

4. **A very fine `screen` on a large element.** At four pixels a cell on a
   full-width hero there are hundreds of thousands of cells, the dots are below
   the size the eye resolves, and you have paid for a halftone to get a fade.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/halftone-reveal/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/halftone-reveal/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
