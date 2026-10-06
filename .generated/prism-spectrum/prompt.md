You are adding **PrismSpectrum** from Beamish to this project.

> A beam of white light through a turning prism, split into a spectrum by tracing it rather than drawing it. Backdrops · effect · MIT.
> https://beamish.ink/effects/prism-spectrum

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Built for a dark ground and declared as one. This is light on a ground rather than a pattern on a surface
- The fan is traced, not drawn: sixteen wavelengths, each refracted at the entry face, carried through the glass and refracted again on the way out, each cast as its own ray
- The index comes from Cauchy's equation, n = A + B over lambda squared, which is the two-term fit every glass catalogue starts with. Red bends least and violet most because the index rises towards the blue end, so the ordering is a consequence rather than a choice: reverse the dispersion constant and the spectrum reverses
- The fan is narrow on purpose. A real 60 degree prism in crown glass spreads the visible band by about a degree, which is why a prism throws a long thin spectrum rather than a wide one
- Total internal reflection is handled rather than papered over: where a wavelength cannot leave the second face, no ray is drawn for it, which is a real thing a prism does
- The tints are the CIE 1931 colour matching functions converted to linear sRGB and evaluated at build time. Several are outside the gamut and clamp, which is unavoidable: a monitor cannot show a spectral green, and desaturating the whole spectrum to make it fit would be worse
- The prism rocks rather than spins. A whole turn spends most of its time with the beam missing the glass or leaving by the face it came in through, and the pass through minimum deviation goes by in a moment
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/prism-spectrum/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/prism-spectrum/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

A beam of white light through a slowly turning prism, on a dark ground.

The fan is **traced, not drawn**. Sixteen wavelengths, each with its own
refractive index, each refracted at the entry face, carried through the glass
and refracted again on the way out, each cast as its own ray.

That matters because everything people recognise about a prism then falls out
of it rather than being arranged:

**Red bends least and violet most**, because the refractive index of glass rises
towards the blue end. The ordering is not a choice here. Reverse `dispersion`
and the spectrum reverses, as it would in a material with anomalous dispersion.

**The fan is narrow.** A real 60 degree prism in crown glass spreads the visible
band by about one degree. That is why a prism throws a long thin spectrum rather
than a wide one, and why the picture everybody has in mind is of a spectrum cast
several metres away.

**The spread changes as it turns**, and it is tightest near minimum deviation,
where the beam passes through symmetrically. That is the one moment in the cycle
when the fan narrows and brightens, and it is the detail that says this is being
worked out rather than painted.

**Some wavelengths do not get out.** Where the angle inside the glass is past
the critical angle the ray is totally internally reflected and no line is drawn
for it, which is a real thing a prism does and not a case to paper over.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `background` | color | `#07080c` | any CSS hex | The room behind it. Dark, because everything drawn here is light being added to it: on a pale ground the beams have nothing to be brighter than. |
| `apex` | number | `60` | 20 to 110 deg | Apex angle of the prism. 60 is the one in every textbook and the one that spreads the band usefully; a shallow prism barely splits the light, and past about 75 degrees most of the beam is lost to total internal reflection. |
| `incidence` | number | `10` | -40 to 40 deg | The angle the beam arrives at. Together with the sway this decides how near the pass is to minimum deviation, which is where the fan is tightest and brightest. |
| `tilt` | number | `-30` | -90 to 90 deg | How the prism is set in the frame. This is the aim: it decides where the spectrum lands and how much of the canvas it crosses, and together with incidence it sets how near the pass is to minimum deviation. |
| `index` | number | `1.52` | 1.3 to 2.2 | Cauchy's A, which is roughly the refractive index in the middle of the visible band. 1.52 is crown glass, 1.46 fused silica, 2.42 diamond. |
| `dispersion` | number | `0.012` | 0 to 0.05 | Cauchy's B, in micrometres squared, and the dispersion itself. 0.0045 is about right for crown glass; flint glass is two or three times that, which is why it is what you cut a chandelier from. At 0 the glass still bends the beam and no longer splits it. |
| `size` | number | `0.34` | 0.1 to 0.7 | How large the prism is, as a share of the short side of the frame. Larger glass means a longer path inside it and a wider fan on the way out. |
| `spread` | number | `0.012` | 0.002 to 0.05 | Width of the beams. This is the one number here that is a drawing decision rather than an optical one: a real beam is as wide as its source, and this is how wide you want it to read. |
| `brightness` | number | `1` | 0.1 to 3 | Strength of the light. A soft shoulder keeps the crossings from clipping, so a high value goes white where the rays overlap the way a photograph does rather than flattening into a hard patch. |
| `glass` | number | `0.8` | 0 to 2 | How visible the prism itself is. Low on purpose: the light is the subject, and a prism drawn as a solid object in front of its own spectrum is a paperweight. |
| `sway` | number | `0.22` | 0 to 1 | How far the prism rocks, in radians, over one cycle. At 0 it is a still composition, which is a legitimate way to use this and the quietest thing in the library. |
| `grain` | number | `0.3` | 0 to 1 | The sensor noise of a long exposure. Static rather than crawling: film grain that moves is a different effect and a far noisier one. |
| `period` | number | `48` | 12 to 120 s | Seconds for one full cycle, and the pace control. Long on purpose: a backdrop has to survive being ignored, and a spectrum sweeping across a page is about as distracting as a backdrop can be. |

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
never starts and one frame is drawn, at `reducedMotionTime`. With `sway` at 0
there is nothing to reduce, because nothing was moving.

## 7. The three mistakes most likely to be made here

1. **Turning the dispersion up to see it better.** Past about 0.02 the fan stops
   being a spectrum and becomes a set of separate coloured beams, because the
   wavelengths are no longer overlapping enough to blend.

2. **A pale background.** Everything here is light added to the ground. On a
   light page there is nothing for the beams to be brighter than.

3. **Expecting a wide rainbow.** The spread of a real prism is about a degree.
   If you want the fan to fill the frame, move the exit further from the edge by
   raising `size`, which is what a longer throw does in life.

4. **Expecting it on paper.** `ground` says dark.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/prism-spectrum/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/prism-spectrum/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
