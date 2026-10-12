You are adding **TruchetMaze** from Beamish to this project.

> Quarter-circle tiles flipped at random in a square lattice, joining into one continuous maze that breathes along a diagonal. Backdrops · effect · MIT.
> https://beamish.ink/effects/truchet-maze

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The arcs are distance fields rather than drawn strokes. Distance to a circle is one length() and a subtraction, so a tile is two of those and a minimum, and the stroke is a band around the zero set. Line width is therefore a number rather than a resolution, and nothing aliases as the cells get small
- fwidth measures one pixel in lattice units, which is what keeps the edge the same softness at every cell count and every rotation. A constant would be a different number of pixels each time the lattice is scaled
- The tile hash is the multiply-and-stir kind rather than fract(sin(x) * 43758.0). The argument is a cell index that grows without bound as the lattice is rotated or the cell count raised, and the sine of a large number is a different value on a different driver
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/truchet-maze/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/truchet-maze/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `ground` | color | `#0b0a18` | any CSS hex | The ground the maze is drawn on. Near-black with a trace of violet in it rather than a true black, so the darkest part of the ramp still has somewhere to go. |
| `near` | color | `#6d2fd1` | any CSS hex | Line colour at the near end of the ramp. |
| `mid` | color | `#e04b9e` | any CSS hex | Line colour through the middle. This is the stop that matters: between two colours you get one hue and a tint of it, and passing through a third is what makes a ramp read as light falling across something rather than as a fade. |
| `far` | color | `#ff9a4a` | any CSS hex | Line colour at the far end. |
| `cells` | number | `9` | 3 to 30 (looks right between 6 and 14) | Tiles across the short edge of the frame. Few and large reads as architecture; many and small reads as a textile, and past about twenty the curves are too short to follow and it becomes a texture rather than a maze. |
| `thickness` | number | `0.17` | 0.02 to 0.5 (looks right between 0.1 and 0.25) | Line width as a fraction of a cell, so it holds when the cell count changes. At 0.5 neighbouring arcs meet and the maze fills in solid, which is a different and also usable look. |
| `rotation` | number | `0` | 0 to 90 (looks right between 0 and 45) | Rotation of the lattice in degrees. Only ninety are worth having: a square lattice of symmetric tiles is unchanged by a quarter turn. |
| `softness` | number | `0.04` | 0 to 1 (looks right between 0 and 0.2) | Softness of the line edge, on top of the one pixel of antialiasing that is always there. At 0 the line is as crisp as the display allows; high values turn the maze into a glow of itself. |
| `seed` | number | `3` | 0 to 999 | Which tiles are flipped. Changes the maze and nothing else, and every value is as good as every other, which is the pleasant thing about a Truchet tiling. |
| `breathe` | number | `0.42` | 0 to 0.9 (looks right between 0.2 and 0.6) | How much the line weight swells and thins as the wave passes. At 0 the maze is a still image, which is a legitimate way to use this and costs nothing to draw. |
| `wave` | number | `7` | 2 to 24 (looks right between 5 and 12) | Cells between one crest of the breathing wave and the next. Short wavelengths make neighbouring tiles disagree and read as noise; long ones move the whole frame together and read as a tide. |
| `tilt` | number | `0.35` | 0 to 1 | Direction of the colour ramp. 0 runs it up the frame, 1 runs it across, and between the two it runs on a diagonal, which is where it crosses the most curves. |
| `period` | number | `12` | 6 to 60 s (looks right between 10 and 24) | Seconds for one cycle of the breathing wave. The loop closes exactly on it, because the phase advances a whole turn in that time. |

## 5. The one thing that makes it work

Each tile holds two arcs of radius half a cell, centred on opposite corners.
That radius is not a choice. It is the only one for which every arc meets the
cell edge **at its midpoint and at a right angle**, so whichever way the
neighbour is flipped, its arc arrives at the same point travelling the same
way. The curve carries on and the joins cannot be seen. Change the radius and
you get a lattice of disconnected scratches.

## 6. Building it

1. Map the pixel into lattice space: centre it, divide by the **short edge**
   so cells stay square in any aspect, rotate about the centre, multiply by
   `cells`. Split into `floor` (which tile) and `fract` (where in it).
2. Hash the tile index to one bit. That single bit is the entire random
   content of a Truchet tiling and it is enough.
3. Two arc distances, `abs(length(local - corner) - 0.5)`, and take the
   minimum. This is a distance field, so the line width is a number rather
   than a resolution.
4. Stroke it: `smoothstep` a band around zero, widened by one pixel measured
   with `fwidth` **in lattice units**. A constant here would be a different
   number of pixels at every cell count.

## 7. Animating it without breaking it

Do not re-roll the tiles. A tile that flips cuts the curve it was part of into
two ends and the eye goes straight to the cut.

Travel the **line weight** instead: a wave whose phase advances with time and
retreats with `cell.x + cell.y`, so it runs diagonally across a maze that
never moves. One whole cycle per period makes the last frame the first frame,
so the loop joins with nothing to hide, and keeps `renderAtTime(t)` pure in
`t`.

## 8. Colour

Run the ramp **across the frame**, not per tile. Per tile puts a hard edge on
every cell boundary, which undoes the one thing the tiling is for. Across the
frame, a single curve changes colour as it travels.

Use three stops. Between two colours you get one hue and a tint of it; passing
through a third is what makes a ramp read as light falling across something.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/truchet-maze/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/truchet-maze/adapters/vue.ts

---

Concept credit: The parameter set: cells, thickness, rotation, softness and seed turned out to be the right five knobs for a quarter-circle Truchet tiling, and there was no reason to invent different ones. The tiling itself is Sebastien Truchet's, from 1704. The code here is this repo's own., by Shader Effects Inc., https://github.com/shader-effects-inc/shaders.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
