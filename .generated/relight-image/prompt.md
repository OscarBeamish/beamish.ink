You are adding **RelightImage** from Beamish to this project.

> A lamp moved across a printed photograph, finding the relief in the impression. Surfaces · effect · MIT.
> https://beamish.ink/effects/relight-image

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The picture is the host element's own <img> child. It is hidden from sight and left in the document, so the alt text is whatever you wrote and a page with no JavaScript still shows it
- This lights the print rather than the scene. There is no depth in a photograph and no honest way to get one out of a single frame, so the height field is the picture's own luminance and what the lamp finds is relief in the sheet
- Known limit, and the reason the modelling is laid over the picture rather than replacing it: lighting already in the photograph becomes relief, so a cast shadow across a wall turns into a step in the paper. A flat-lit image is the one this flatters most
- The gradient is taken across several pixels rather than one, which low-passes the height field on the way and is what keeps sensor noise and compression blocks out of the normal
- Nothing is integrated against the previous frame. The lamp is exactly where the pointer is, so renderAtTime is pure in t and a scripted path replays identically
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
| `src/beamish/effects/relight-image/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/relight-image/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

A lamp moved across a printed photograph.

It does not relight the scene. There is no depth in a photograph and no honest
way to get one out of a single frame, so anything that claims to move the sun
around inside a picture is guessing at a shape it cannot see. What this lights
is the print: the sheet the picture is on, which has relief wherever the
impression is heavy, and a raking light finds that relief the way a raking light
finds any other surface.

Height is the picture's own luminance. A shadow in the photograph is a hollow in
the sheet and a highlight stands proud, and the normal is the gradient of that
height taken across a few pixels rather than one, because a one-pixel difference
is mostly sensor noise and compression blocks.

There is one thing the lamp adds that a gradient cannot, and it is the thing
worth having: ink has a sheen that paper does not. The specular is what says the
dark passages are ink sitting on a surface rather than dark paper, and without
it this is a soft blob moving about.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency, no depth map to author or ship.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `light` | color | `#fff3df` | any CSS hex | Colour of the lamp. Keep it close to white, warm or cool. It is painted over the picture as a sheen rather than mixed into it, so a saturated colour tints the highlights rather than reading as illumination. |
| `height` | number | `0.32` | 0.02 to 2 | How far above the sheet the lamp is held, as a share of the frame's height. Low is a raking light that finds every ridge in the impression; high is a lamp overhead that finds almost none. This is the first dial to reach for and most of the character is in it. |
| `relief` | number | `7` | 0 to 30 | How much relief the impression has. At 0 the sheet is flat and all you have is a soft gradient moving about. Past about 15 the paper stops reading as paper and starts reading as hammered metal. |
| `smooth` | number | `2` | 0.5 to 8 | Pixels either side the gradient is taken across. Low-passes the height field on the way, so this is the difference between lighting the shape of the impression and lighting the noise in the file. Below about 1.5 you are mostly lighting JPEG blocks. |
| `strength` | number | `0.55` | 0 to 1.5 | How much modelling the lamp lays over the picture. The photograph is exactly itself at the midpoint of the light, so this opens the gradient out either side of it rather than re-exposing anything. |
| `gloss` | number | `0.3` | 0 to 1 | How much the ink catches the light that the paper does not. This is the part that says the dark areas are ink rather than dark paper, and it is what separates this from a gradient. |
| `shine` | number | `26` | 2 to 160 | How tight that catch is. Low is a broad satin sheen; high is a small hard glint that only appears where a ridge faces the lamp exactly. |
| `reach` | number | `0.75` | 0.1 to 3 | How far the lamp throws, as a share of the frame's height. Small is a reading lamp held close with the corners falling away; large is a window on the far side of the room. |
| `grain` | number | `0.25` | 0 to 1 | Paper tooth over the whole thing. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, deletes the texture, cancels the RAF,
disconnects both observers, removes every listener and puts the `<img>` back the
way it found it. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

Nothing moves unless the cursor does, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn, which means the lamp never comes on and what you have is the
photograph. That is the right resting state rather than a compromise: the
picture is the content and the lamp was always an extra.

## 7. The three mistakes most likely to be made here

1. **A cross-origin image.** `texImage2D` throws a SecurityError on an image
   from another origin without CORS headers, and it throws at upload rather than
   at load, so the picture appears and the lamp does nothing. Serve the image
   from your own origin or set `crossorigin`.

2. **Using it on a photograph that is already about light.** You will be
   lighting its shadows as though they were trenches. The pictures this suits
   are the flat-lit ones.

3. **Leaving `smooth` at the bottom of its range to get more detail.** What you
   get is the compression, lit. The detail you want is in the impression, and
   the impression is bigger than one pixel.

4. **Turning `relief` up to make it more visible.** `height` is the dial for
   that. Relief past 15 makes the paper metallic, and a photograph printed on
   metal is a different idea from this one.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/relight-image/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/relight-image/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
