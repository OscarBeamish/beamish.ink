You are adding **Loupe** from Beamish to this project.

> A printer's glass on the page: continuous tone until you look closely, then dots. Surfaces · effect · MIT.
> https://beamish.ink/effects/loupe

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The picture is the host element's own <img> child. It is hidden from sight and left in the document, so the alt text is whatever you wrote and a page with no JavaScript still shows it
- The screen ruling belongs to the print rather than to the viewer, so the cell is magnified along with everything else and turning the zoom up makes the dots bigger rather than finer
- Four plates at 15, 75, 0 and 45 degrees, with grey component replacement, so what resolves under the glass is a rosette rather than four screens fighting
- Nothing is integrated against the previous frame. The glass is exactly where the pointer is, so renderAtTime is pure in t and a scripted path replays identically
- No fwidth anywhere. The lens sits inside a branch and derivatives in non-uniform control flow are undefined, so every edge width is worked out from the device pixel ratio instead
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
| `src/beamish/effects/loupe/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/loupe/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

A printer's glass laid on the page.

The picture is continuous tone until you look closely, and then it is dots. That
is not a stylisation. It is what a printed photograph is, and it is the one
thing a screen never shows you: away from the glass the halftone is finer than
the eye resolves and reads as tone, which is the entire reason printing works at
all, and under the glass it resolves into four screens at four angles.

So the dots are not drawn at whatever size looks good. They are drawn at
`screen` pixels in the print and magnified along with everything else, which is
why turning `zoom` up makes them bigger rather than finer. A screen ruling
belongs to the press, not to the person looking at it.

The four angles are 15, 75, 0 and 45 degrees, and they are not decoration.
Thirty degrees between the strong plates is what keeps their interference down
to a fine rosette instead of a coarse plaid, and yellow sits at zero because it
is the plate you cannot see anyway. The ink that all three of cyan, magenta and
yellow have in common is pulled out and printed as black instead, which is what
a press does and the reason a shadow in a printed photograph is not a muddy
brown.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The sheet the picture is printed on. It shows between the dots, so it is most of what you see in the light passages under the glass. |
| `cyan` | color | `#1fb6e3` | any CSS hex | The cyan plate. |
| `magenta` | color | `#e5157f` | any CSS hex | The magenta plate. |
| `yellow` | color | `#ffe800` | any CSS hex | The yellow plate. Barely visible on its own, which is why it goes at zero degrees where the interference would show most. |
| `black` | color | `#2b2721` | any CSS hex | The black plate, which also tints the barrel. A desaturated near-black reads as ink; pure black reads as a hole. |
| `size` | number | `0.26` | 0.05 to 0.6 | Radius of the glass, as a share of the short side, so it keeps its size when the element changes shape. Past about 0.4 it stops being a glass on a picture and becomes a picture with a border. |
| `zoom` | number | `2.6` | 1 to 12 | How much it magnifies. This magnifies the screen as well as the picture, because the ruling belongs to the press: turning it up makes the dots bigger, never finer. |
| `screen` | number | `2` | 1 to 12 | The print's screen ruling, as a cell in CSS pixels before magnification. Low is a fine screen and a magazine; high is a coarse one and a newspaper. Below about 2 the rosette is finer than the glass can show and you get tone under the glass as well as outside it, which is the one setting that defeats the whole thing. |
| `bulge` | number | `0.35` | 0 to 1 | How much the magnification eases off towards the rim, the way a real lens does. At 0 the glass magnifies evenly and the edge reads as a hole cut in the picture rather than as something resting on it. |
| `fringe` | number | `0.012` | 0 to 0.06 | Lateral colour at the rim. Every simple lens has it and every one shows it most at the edge, so a little is what makes the glass read as glass. Past about 0.03 it reads as a broken monitor. |
| `rim` | number | `0.8` | 0 to 1 | How strongly the barrel reads: the ring and the short fall into shade just inside it. This is what makes the glass an object sitting on the page rather than a filter applied to part of it. |
| `grain` | number | `0.3` | 0 to 1 | Paper tooth over the whole thing, inside the glass and out. |

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
is drawn, which means the glass never appears and what you have is the
photograph. That is the right resting state rather than a compromise: the
picture is the content and the glass was always an extra.

## 7. The three mistakes most likely to be made here

1. **A cross-origin image.** `texImage2D` throws a SecurityError on an image
   from another origin without CORS headers, and the catch is that it throws at
   upload rather than at load, so the picture appears and the glass does not.
   Serve the image from your own origin or set `crossorigin`.

2. **Setting `screen` very low to make it look sharper.** It makes the rosette
   finer than the glass can show, so the magnified patch is tone and the whole
   point of the thing is gone. Coarser is the direction that helps.

3. **Expecting the dots to stay the same size as you zoom.** They are in the
   print, so they magnify. An effect where they did not would be a screen laid
   over the viewer's eye rather than over the paper.

4. **Using it on a decorative background behind text.** It magnifies, so
   whatever is under the glass moves, and moving the background of a paragraph
   somebody is reading is the one thing a page should not do.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/loupe/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/loupe/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
