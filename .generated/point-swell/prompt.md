You are adding **PointSwell** from Beamish to this project.

> A sea of glowing points rolling toward you, with the camera diving into it as the page scrolls. Backdrops · effect · MIT.
> https://beamish.ink/effects/point-swell

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- Travelling waves, not scrolling noise. The usual way to build this is two octaves of simplex with the sample point sliding forward each frame, which looks right and cannot loop: simplex is not periodic in any direction, so a field that slides forward never returns. It also cannot be driven by renderAtTime, because sliding forward means accumulating and the surface then depends on how it got there rather than on the clock
- Each mode is a sine of k dot x minus omega t, which is a closed form in t, and every omega is a whole number of turns per period, so the sea is exactly where it started when the period comes round. The waves travel toward the camera because that is what a positive omega against a forward wavevector does: the streaming is the physics rather than an offset added to a sample point
- Eighteen modes, because a sum of a few plane waves is quasi-periodic and lays itself out in a visible lattice however it is weighted. The count is what stops it reading as a pattern
- The headings fan about straight-on rather than spreading over the full circle. A real swell has a direction; waves arriving from everywhere average into chop, and what reads as a sea rolling toward you is a narrow fan with a little disagreement in it
- Deep-water dispersion, so a long wave runs faster than a short one as the root of the wavelength, rounded to whole turns because that is what closes the loop
- No bloom pass. The glow is tens of thousands of additively blended points overlapping, which is where the brightness in this kind of scene actually comes from. A composer stack buys a halo for three full-screen render targets and a second pair of passes, and this is a backdrop that sits behind a page rather than being the page
- A grid, not a reshaped sphere. Scenes of this kind often start from a SphereGeometry and throw the shape away in the vertex shader, which works and leaves the point spacing bunched at the poles of a sphere nobody can see
- The grid is jittered off its lattice. A perfectly regular sheet of points shows its rows as moire at a shallow angle, and a shallow angle is the only one this is ever seen at
- The cursor parts the surface sideways along the ground plane rather than lifting it. A sea that bulges towards whoever is looking at it is the wrong physical story and a much louder one
- Built for a dark ground and declared as one. Additive points on a near-black fill is the whole idea, and added light on paper is invisible
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/point-swell/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/point-swell/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `background` | color | `#080616` | any CSS hex | Behind the sea. Nothing is drawn there, so it is a flat fill, and it wants to be near black: the points are additive, so every bit of brightness in the fill is brightness the crests cannot add to. |
| `colorLow` | color | `#3f2a9e` | any CSS hex | The troughs. Close to the background, because a trough is the part of the sea with no light on it. |
| `colorHigh` | color | `#72f2ff` | any CSS hex | The crests. The whole range of the sea lies between this and colorLow, so the distance between the two is the contrast of the item. |
| `density` | number | `300` | 40 to 400 (looks right between 140 and 260) | Points across the sheet. The count goes as the square of it, so this is the whole cost. Below about 120 the sea stops being a surface and becomes a scatter. |
| `pointSize` | number | `7.2` | 0.5 to 10 (looks right between 1.8 and 4) | Point size at the near edge, falling off with distance. Large enough and the crests fuse into a solid ribbon, which loses the thing that makes it points. |
| `opacity` | number | `0.95` | 0.05 to 1 (looks right between 0.3 and 0.7) | How much light each point adds. They are additive, so this compounds where they overlap: the crests are bright because many dim points are stacked there, not because any one of them is. |
| `swell` | number | `1.15` | 0 to 4 (looks right between 0.7 and 2) | Height of the swell in scene units. At 0 it is a flat sheet of points, which is a different and quieter item. Past about 3 the crests reach the camera at the near edge. |
| `scale` | number | `1.5` | 0.3 to 5 (looks right between 1 and 2.5) | Waves across the sheet, for the longest one. The rest of the spectrum is built up from it, so this sets the size of the whole sea. |
| `waves` | number | `18` | 3 to 24 (looks right between 12 and 24) | Modes in the surface. The one that decides whether it reads as water: below about twelve the sum is quasi-periodic and the swell arranges itself on a visible lattice however the rest is tuned. |
| `dive` | number | `1` | 0 to 1 | How much of the camera's descent the scroll performs. At 0 the view stays high and the item is a sea seen from above; at 1 it finishes skimming the surface. Eased over the first third of the travel, because the interesting part of the move is the arrival. |
| `parallax` | number | `1.2` | 0 to 4 | How far the pointer moves the camera, in scene units. The pointer does not touch the water: it moves the viewer. Parting the surface under the cursor was tried first and reads as the sea noticing you, where moving the camera reads as leaning over it, which is what somebody looking at a sea is doing. The move is instant rather than eased, because easing means keeping the last position and moving a fraction of the way each frame, and that is an accumulator: it would make the frame depend on the frames before it and renderAtTime could no longer be seeked. |
| `period` | number | `32` | 8 to 120 s (looks right between 24 and 60) | Seconds for one cycle. Every mode completes a whole number of turns in it, so the sea returns exactly and the loop has no join. |
| `seed` | number | `4` | 0 to 9999 | Seed for the headings and phases. Two of these side by side want two seeds, or they are the same sea twice. |

## 5. Why it is a sum of waves and not scrolling noise

The scene this came from advances a simplex noise field with an accumulator:
each frame adds to the one before it. That cannot be seeked, so it cannot be
recorded, and it cannot loop, because there is no `t` at which it returns.

This is a sum of travelling waves instead. Every mode is a closed form in `t`,
and every angular frequency is rounded to a **whole number of turns over the
period**, so at `t = period` every mode is back where it started and the sea
returns exactly. Seeking backwards is free.

Deep-water dispersion sets the relationship: frequency goes as the square root
of wavenumber, so long waves travel faster than short ones. Ignore that and
the sheet reads as a vibrating membrane rather than as water.

## 6. The three things that decide whether it reads as a surface

1. **Point size against distance.** `gl_PointSize = size * k / -z`. Get this
   wrong and the far half of the sheet is one pixel per point, which reads as
   a sparse scatter rather than as a surface going away from you. It was the
   single biggest thing wrong with the first version.
2. **Crest contrast.** A sum of sines spends most of its time near zero,
   because the modes cancel. A plain remap of height to the colour ramp
   therefore leaves every point on the middle of the ramp and the whole sheet
   comes out one flat colour. Stretch it around the midpoint so the crests
   actually reach the high colour.
3. **The background is not neutral.** A dark green ground turns a blue sea
   green and there is no amount of point colour that fixes it. Keep the
   ground a near-black of the same family as the low colour.

## 7. Colour

Near-black ground with a trace of the low hue in it, a deep violet for the
troughs and a bright cyan for the crests. Two colours is a fade; what stops
this one reading as a fade is that the crest colour is only ever reached by a
small fraction of the points, so it works as light rather than as a gradient.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/point-swell/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/point-swell/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
