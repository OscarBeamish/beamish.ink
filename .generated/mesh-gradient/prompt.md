You are adding **MeshGradient** from Beamish to this project.

> The soft flowing colour field behind half the software marketing on the web, lit by its own slope. Backdrops · effect · MIT.
> https://beamish.ink/effects/mesh-gradient

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Three ingredients and nothing else: layered waves for scale, a domain warp so the bands bend around each other rather than staying parallel stripes, and shading taken from the slope of the same field
- The shading is the part most versions of this leave out. On the original the plane is a mesh whose vertices are displaced, so the light follows the displacement; here the same derivative that would have moved a vertex lights the result instead. Without it the whole thing flattens into wallpaper
- The diagonal edge people associate with this effect is not in the shader and should not be. On the original it is the container, skewed with CSS and clipped, which is two lines and is in the recipe
- Every moving term is a sum of waves whose time coefficients are whole numbers of turns over the period, so the loop closes exactly. Noise advanced by time never returns to its first frame and the recorder needs it to
- The warp is frozen while the layers drift through it. Warping the warp as well doubles the measured change per frame for something that reads as the whole image sliding
- Declared as working on either ground. The default palette is warm paper with pastel layers; the same effect with dark colours over a dark base is the version everybody else ships
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/mesh-gradient/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/mesh-gradient/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

The soft flowing colour field that sits behind half the software marketing on
the web, and behind Stripe's home page in particular.

It is worth being precise about what that effect is, because the usual
description is wrong in a way that matters. It is not a CSS gradient with more
stops, and it is not a blurred photograph of some blobs. The original is a plane
cut into a grid of a few hundred vertices, each pushed around by layered noise,
with three or four colour layers blended over each other by more noise.

Three ingredients, and this has all three:

**Layered waves.** Several octaves, each finer and weaker than the last. That is
what gives the field its sense of scale: broad shapes with detail inside them,
rather than one smooth blob or one busy texture.

**A domain warp.** The field is read at a position pushed sideways by another
field, which is what bends the bands around each other. At `warp` 0 you get
parallel stripes, and parallel stripes are the single thing that gives away most
attempts at this effect.

**Shading from the slope.** This is the one most copies leave out. On the
original the mesh is displaced, so the light follows the displacement; here the
same derivative that would have moved a vertex lights the result instead. Set
`relief` to 0 and the whole thing flattens into wallpaper. It is the difference
between a surface being folded and a picture being blurred.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `base` | color | `#fbfaf4` | any CSS hex | What the colour layers are laid over, and what shows wherever none of them reaches. Usually the palest of the four, because it is doing the job the paper does in print. |
| `one` | color | `#ffc9e3` | any CSS hex | The first colour layer, laid over the base. Keep the three within reach of each other on the wheel and mind what they make where they overlap: the first palette here had a peach under a cornflower, and peach under blue is tan, so the frame had a patch of mud in it that neither colour explains. |
| `two` | color | `#a9d8ff` | any CSS hex | The second layer, over the first. |
| `three` | color | `#cdbcff` | any CSS hex | The third, and the one that shows least, because it is only drawn where its own field is high. |
| `scale` | number | `0.75` | 0.3 to 4 | Size of the shapes. Lower is fewer and larger, which is what a hero wants: the shapes should be bigger than the headline sitting on them, not a texture behind it. |
| `warp` | number | `0.42` | 0 to 1.2 | How far the field is bent before it is read. At 0 the layers are parallel bands, which is the single thing that gives away most attempts at this effect. |
| `softness` | number | `0.6` | 0.02 to 1 | Width of the transition between one layer and the next. This is the control that decides whether the result reads as a gradient or as a map of three countries. |
| `relief` | number | `0.16` | 0 to 0.6 | How much the field is lit by its own slope. Small, and the thing that makes it look like a surface being folded rather than a picture being blurred. At 0 it is wallpaper. |
| `grain` | number | `0.3` | 0 to 1 | Grain, which on a field this smooth is doing real work: it breaks the banding that eight bit colour leaves across a slow gradient. Static rather than crawling. |
| `period` | number | `36` | 12 to 120 s | Seconds for one full cycle, and the pace control. Long on purpose: this sits behind a headline, and a backdrop has to survive being ignored. |

## 5. Cleanup and SSR

`destroy()` releases the context, deletes the program and the VAO, cancels the
RAF and disconnects the observers. Call it.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`, which is
already on the React adapter.

## 6. Pausing and reduced motion

Handled in the runtime, and non-negotiable: WCAG 2.2.2 is Level A and it
describes every ambient backdrop. The handle has `stop()` and `start()`.

Also handled in the runtime. Under `prefers-reduced-motion: reduce` the loop
never starts and one frame is drawn, at `reducedMotionTime`. A still frame of
this is a perfectly good hero background, which is not true of every effect in
this library.

## 7. The three mistakes most likely to be made here

1. **Four colours from all over the wheel.** It reads as one material lit
   unevenly or it reads as nothing.

2. **Turning `relief` off.** It is the only thing here that says surface rather
   than image, and at 0.16 it is almost subliminal, which is the point.

3. **Putting the skew in the shader.** The diagonal is the container's, and
   doing it in the canvas means the pixels are skewed too, so the grain goes
   lopsided and the edges stair-step.

4. **Speeding it up to make the demo livelier.** That is the recorder setting
   the design. It sits behind a headline.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/mesh-gradient/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/mesh-gradient/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
