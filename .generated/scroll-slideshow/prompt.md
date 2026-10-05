You are adding **ScrollSlideshow** from Beamish to this project.

> A slideshow the page scroll runs, on a web that drags and fringes as it moves. Surfaces · effect · MIT.
> https://beamish.ink/effects/scroll-slideshow

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The images are the host element's own <img> children. They are hidden from sight and left in the document, so the alt text and source order are whatever you wrote, and a page with no JavaScript still shows the pictures
- At rest nothing is distorted. The whole effect is a function of scroll velocity, so a reader who has stopped scrolling is looking at a photograph
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- Textures are CLAMP_TO_EDGE. The bow samples past the edge of the image and a repeating wrap would tile the opposite side of the picture into the gap
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/scroll-slideshow/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/scroll-slideshow/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

A slideshow the page scroll runs, printed on a web rather than on sheets.

A web press does not feed sheets. It feeds one continuous ribbon of paper off a
reel, and everything this does follows from that: the ribbon has mass, so it
drags against the direction of travel, and a press running colour work strikes
one plate per ink, so a moving web lands them a fraction apart.

That is the whole behaviour. At rest this draws an undistorted photograph and
nothing else. The distortion is a function of scroll velocity, not of time and
not of position, so a reader who has stopped scrolling is looking at the picture
rather than at an effect. Most WebGL sliders warp continuously and end up reading
as a filter laid over the content. This one only exists while it is being pulled.

There is a third thing the press does, and it is off by default. At speed the
ribbon bows between the rollers, the sides lagging behind the middle. It is a
good effect and it is the loudest thing here by some distance, which is why
`bend` starts at zero: a slideshow is for showing the pictures, and a picture
that bends every time somebody scrolls past it is being shown second. Set `bend`
to about 0.09 if you want the press rather than the pictures. ScrollWarpImage is
the one that is actually about the distortion.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency, no render targets.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | Shown wherever the web has pulled the image away from the edge of the frame. Match it to the page behind, or the gap reads as a border that appears only while scrolling. |
| `bend` | number | `0` | 0 to 0.3 | How hard the sides lag behind the middle. Off by default: the bow is the loudest thing the press does and it competes with the picture, which is the thing you are actually showing. Turn it up to around 0.09 for the full press. Past about 0.12 it stops being a press and starts being a fisheye. |
| `slip` | number | `0.018` | 0 to 0.15 | How far the whole web slides against the direction of travel, the way anything with mass does when it is pulled. Small: this is the part you feel rather than see. |
| `fringe` | number | `0.004` | 0 to 0.03 | Separation between the colour channels at the edges while moving. A press running colour work strikes one plate per ink, and a moving web lands them a fraction apart. Keep it under about 0.01 or it reads as a broken monitor. |
| `grain` | number | `0.4` | 0 to 1 | Paper tooth over the image. Fixed per slide rather than per frame, because grain that crawls is a screen artefact and grain that sits still is paper. |
| `reference` | number | `1.6` | 0.2 to 6 | The scroll velocity that counts as full speed, in screens per second. Above it the effect stops growing. Lower makes the web bow more readily; too low and an ordinary wheel click maxes it out. |
| `crossfade` | number | `0.55` | 0.05 to 1 | Fraction of each slide's travel spent crossing to the next. Low holds each picture still and then cuts; 1 never stops dissolving. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, deletes every texture, restores the
original images, cancels the RAF, disconnects both observers and removes every
listener including the scroll one. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever runs
out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

There is nothing to pause. Nothing moves unless the reader moves it, which is
what takes this outside WCAG 2.2.2 rather than exempting it from it. `stop()` and
`start()` are still on the handle.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn, which means the reader gets a still photograph with no warp at all.
That is the correct outcome here and it needs no special case.

## 7. The three mistakes most likely to be made here

1. **Turning `bend` up to see it better.** If you cannot see it, the reason is
   almost always that the host is too short, so the whole set crosses in one flick
   and there is no room to build speed. Give it height before you touch `bend`.
   Past about 0.12 it stops being a press and starts being a fisheye.

2. **Leaving `paper` on the default when the page is not.** The slip pulls the
   image away from the top and bottom of the frame and `paper` is what shows in
   the gap. If it does not match the page behind, a border appears out of nowhere
   whenever somebody scrolls.

3. **Pale images.** The warp is an edge effect, and an image that is nearly the
   same colour as the paper hides its own edges. Pictures with detail running to
   the frame show it; washed-out ones do not.

4. **Expecting it to animate on its own.** It has no idle state and no loop of its
   own. A screenshot of a page nobody is scrolling is a photograph, which is the
   entire point.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/scroll-slideshow/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/scroll-slideshow/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
