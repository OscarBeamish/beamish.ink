You are adding **ScrollWarpImage** from Beamish to this project.

> A sheet that is dragged down by the scroll and settles flat when it stops. Surfaces · effect · MIT.
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
- One arc across the width, sin(pi x), so the sheet is held at its sides and trails in the middle. The sign follows the scroll: down the page pulls it down, back up hangs it the other way
- The sheet is a rectangle inset from the frame and the drag carries its boundary with its contents, so the edges curve rather than staying square. Nothing is done to the horizontal axis: a sideways bend has no edge to run along and reads as the picture breathing
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

A photograph on a sheet that is dragged by the scroll.

One arc across the width. The sheet is held at its sides, the span between them
trails behind the direction the page is travelling, and it settles flat the
moment the scroll stops. Scroll down and it is pulled down; scroll back up and
it hangs the other way. At rest there is no effect at all, which is the point: a
reader who has stopped scrolling is looking at a photograph rather than at a
filter.

**The shape is the whole thing**, and it is worth saying what it is, because
there are two curves you could draw here and only one of them is a sheet.

```glsl
uv.y -= velocity * bend * sin(uv.x * PI);
```

Half a period of a sine: zero at both sides, one in the middle, one smooth curve
with nothing in it to catch the eye. That is a sheet pinned at its edges and
heavy in the middle, which is what hanging paper does and what the eye already
knows.

The other curve is the distance from the centre, squared, which is what this
effect used to do. It pins the middle and throws the sides about, which is the
same sheet inverted and reads as the frame wobbling rather than as the picture
being pulled. It also used to bend both axes at once. A sideways bend has no
edge to run along, so all it does is muddle the shape, and taking it out is most
of what makes the arc read.

The sign follows the scroll rather than being fixed, because a sheet that always
sagged downward would be a sheet nothing was pulling.

The edges deform with the picture. The sheet is a rectangle inset from the
frame, the drag carries its boundary and its contents together, and whatever
falls outside is paper, so the edges curve rather than staying square. There is
no geometry here beyond one triangle: the shape of the sheet is a by-product of
the sampling rather than a mesh.

One WebGL2 fragment shader. No three.js, no dependency, no render targets.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | Shown wherever the warp has pulled the sheet away from the frame. Match it to the page behind, or a border appears out of nowhere as soon as anyone scrolls. |
| `bend` | number | `0.06` | 0 to 0.3 | How far the middle of the sheet trails behind its sides. This is the arc, and it is the option you came for: half a period of a sine across the width, nothing at the edges and everything in the span between them, which is where a sheet being pulled gives. Keep it and slip together under about inset x (1 - 2 x inset), or a hard flick pushes the bent edge off the frame. |
| `slip` | number | `0.015` | 0 to 0.15 | How far the whole sheet slides against the direction of travel, flat across its width, the way anything with mass does when it is pulled. Small: this is the part you feel rather than see, and it is kept apart from the bend so either can be turned off. |
| `fringe` | number | `0.005` | 0 to 0.03 | Separation between the colour channels while the sheet is moving. A press strikes one plate per ink and a moving web lands them a fraction apart. Keep it under about 0.01 or it reads as a broken monitor. |
| `grain` | number | `0.4` | 0 to 1 | Paper tooth over the image. |
| `inset` | number | `0.1` | 0 to 0.25 | How far the sheet sits in from every edge of the frame, as a share of the frame. The margin is what the bend happens in: at 0 the bent edge runs off the canvas and is chopped square, which reads as clipping rather than as paper. Measured in the frame rather than in the picture, so a photograph of any shape is inset by the same amount on all four sides. |
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

1. **Leaving `paper` on the default when the page is not.** The drag pulls the
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
