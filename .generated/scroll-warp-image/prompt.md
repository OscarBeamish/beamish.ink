You are adding **ScrollWarpImage** from Beamish to this project.

> One picture on a paper web that bows on every edge as it accelerates. Surfaces · effect · MIT.
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
- The same deformation as ScrollSlideshow, run on both axes rather than one, so every edge of the sheet bends instead of just the top and bottom
- At rest nothing is distorted. The whole effect is a function of scroll velocity, so a reader who has stopped scrolling is looking at a photograph
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

One picture on a paper web that bows on every edge as it accelerates.

The same press as ScrollSlideshow, and deliberately the same deformation. The
sides lag behind the middle, the whole sheet slips against the direction of
travel, and the inks land a fraction apart while it moves. At rest it lies flat
and there is no effect at all, which is the point: a reader who has stopped
scrolling is looking at a photograph rather than at a filter.

What is different is that there is one picture and it never changes, so there is
no crossfade drawing the eye away from the edges, and the bow runs on **both**
axes rather than one. The slideshow curves the top and bottom, which is all you
see of a sheet that is being replaced. Here every edge bends, because the sheet
is the subject.

The cross-coupling is the whole trick. Each axis is displaced by how far the
*other* axis is from the centre: displacing y by a function of x is what curves
the top and bottom, and doing the same the other way round curves the sides.
Displacing each axis by its own distance would only stretch the sheet, which
reads as a zoom.

The edges deform with the picture. The bow is applied first and whatever falls
outside the source is paper, so the boundary bends rather than staying a
rectangle. There is no geometry here beyond one triangle: the shape of the sheet
is a by-product of the sampling rather than a mesh.

One WebGL2 fragment shader. No three.js, no dependency, no render targets.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | Shown wherever the warp has pulled the sheet away from the frame. Match it to the page behind, or a border appears out of nowhere as soon as anyone scrolls. |
| `bend` | number | `0.07` | 0 to 0.3 | How hard the edges lag behind the middle. This is the bow, and it is the option you came for. Each axis is displaced by how far the other one is from the centre, which is what curves the edges rather than stretching the sheet. |
| `slip` | number | `0.02` | 0 to 0.15 | How far the whole sheet slides against the direction of travel, the way anything with mass does when it is pulled. Small: this is the part you feel rather than see. |
| `fringe` | number | `0.005` | 0 to 0.03 | Separation between the colour channels while the sheet is moving. A press strikes one plate per ink and a moving web lands them a fraction apart. Keep it under about 0.01 or it reads as a broken monitor. |
| `grain` | number | `0.4` | 0 to 1 | Paper tooth over the image. |
| `reference` | number | `1.6` | 0.2 to 6 | The scroll velocity that counts as full speed, in screens per second. Above it the effect stops growing. Lower makes the sheet bow more readily; too low and an ordinary wheel click maxes it out. |

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
is drawn.

This effect needs no special case. Velocity is zero when nothing is scrolling, so
the frame that gets drawn is the undistorted photograph, which is exactly what
somebody who has asked for less motion wants to see.

## 7. The three mistakes most likely to be made here

1. **Leaving `paper` on the default when the page is not.** The bow pulls the
   sheet away from the frame and `paper` is what shows in the gap. If it does not
   match the page behind, a border appears out of nowhere whenever somebody
   scrolls, and only while they scroll, which is a maddening thing to debug.

2. **Turning `bend` up to see it better.** If you cannot see it the host is
   probably too short to build any speed. Height first.

3. **A short host element.** The travel is the element's passage through the
   viewport. Something 200px tall crosses it in one flick.

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
