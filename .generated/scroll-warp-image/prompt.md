You are adding **ScrollWarpImage** from Beamish to this project.

> One picture that deforms, edges and all, as it travels up the viewport. Surfaces · effect · MIT.
> https://beamish.ink/effects/scroll-warp-image

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The picture is the host element's own <img> child. It is hidden from sight and left in the document, so the alt text is whatever you wrote and a page with no JavaScript still shows it
- Driven by scroll position rather than scroll speed, so the sheet is somewhere in the deformation the whole time it is on screen
- The edges deform with the picture. The warp is applied first and whatever falls outside the source is paper, so the boundary of the sheet bends rather than staying a rectangle
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
| `src/beamish/effects/scroll-warp-image/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/scroll-warp-image/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

One picture, printed on something that is not flat, deforming as it travels up
the viewport.

The distortion is driven by scroll **position**, not scroll speed. That is the
opposite choice to ScrollSlideshow and it gives a completely different feel.
Speed-driven means nothing happens until the reader moves, and the picture is
flat the moment they stop. Position-driven means the sheet is somewhere in a
continuous deformation the whole time it is on screen, and scrolling walks it
through: barrelled and twisted one way as it comes up from the bottom, flat as it
passes the middle of the viewport, barrelled and twisted the other way as it
leaves the top.

The edges deform with everything else. This is not a rectangle with a warped
picture inside it. The warp is applied first and whatever falls outside the
source is paper, so the boundary of the sheet bends too. That is the part that
sells it, and it is why there is no geometry here beyond one triangle: the shape
of the sheet is a by-product of the sampling rather than a mesh.

One WebGL2 fragment shader. No three.js, no dependency, no render targets.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | Shown wherever the warp has pulled the sheet away from the frame. Match it to the page behind, or a border appears out of nowhere as soon as anyone scrolls. |
| `bulge` | number | `0.34` | 0 to 1.2 | Barrels the sheet at both ends of its travel, flat only as it passes the middle. The main shape of the effect, and the first thing to reach for. Signing it so that one end pinches instead wastes half the travel: a pinch samples inside the picture, so it reads as a zoom and the edges stay a rectangle. |
| `twist` | number | `0.13` | 0 to 0.8 | Rotation that grows with radius, so the corners lead and the middle holds. Without some of this the bulge reads as a zoom, because a purely radial scale is what a zoom is. |
| `squeeze` | number | `0.06` | 0 to 0.4 | How much the sheet narrows across its width, the way paper does between two rollers. |
| `fringe` | number | `0.035` | 0 to 0.2 | Separation between the colour channels where the warp is strongest, which is at the corners. A press strikes one plate per ink and a moving sheet lands them a fraction apart. |
| `vignette` | number | `0.16` | 0 to 0.6 | How much heavier the ink lies where the sheet curves away from you. Arrives and leaves with the warp rather than sitting there permanently. |
| `grain` | number | `0.4` | 0 to 1 | Paper tooth over the image. |
| `range` | number | `1` | 0.2 to 3 | How much of the element's travel through the viewport the warp uses. 1 runs the full range. Lower holds the picture flat for longer around the middle and then goes harder at the ends. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, deletes the texture, restores the
original image, cancels the RAF, disconnects both observers and removes every
listener including the scroll one. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

There is nothing to pause. Nothing moves unless the reader moves it, which puts
this outside WCAG 2.2.2 rather than exempting it from it. `stop()` and `start()`
are still on the handle.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn, at `reducedMotionTime`. The default is 0, which is the start of the
travel and therefore fully warped.

If you would rather the picture simply sat flat for those readers, the flat point
is the middle of the travel, so drive it yourself: mount with `bulge: 0`,
`twist: 0` and `squeeze: 0` when `matchMedia('(prefers-reduced-motion: reduce)')`
matches. An undistorted photograph is a perfectly good outcome and it costs you
nothing.

## 7. The three mistakes most likely to be made here

1. **Putting text over the middle of it.** The middle is the calmest part of the
   frame, which makes it tempting, and it is also the part that moves least, so
   nothing warns you during development that the corners are doing something
   violent. If there is text, bring `range` down so the sheet is flat for most of
   its travel.

2. **Reaching for `bulge` when it looks like a zoom.** More bulge makes a bigger
   zoom. `twist` is the option that makes it read as a sheet turning.

3. **A short host element.** The travel is the element's passage through the
   viewport. Something 200px tall crosses it in a flick and the effect never
   resolves.

4. **A soft or empty picture.** The warp is legible only where a straight line
   bends. Architecture, type, grids and horizons all show it; a portrait against a
   blurred background hides it completely.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/scroll-warp-image/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/scroll-warp-image/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
