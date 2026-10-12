You are adding **TumblingBlocks** from Beamish to this project.

> A rhombille tiling lit as stacked cubes, with the light going round rather than the geometry moving. Backdrops · effect · MIT.
> https://beamish.ink/effects/tumbling-blocks

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The three internal edges of a hexagon are rays from its centre, not lines through it. A line at one of those angles also passes through the opposite vertex, so measuring distance to lines draws six spokes and splits each rhombus into two triangles. Behind the ray the nearest point on it is the centre, so the distance there is the length.
- A hexagonal lattice is two rectangular lattices offset by half a cell, so the nearest centre is found by measuring against both and keeping the closer. No trigonometry and no loop.
- fwidth measures one pixel in lattice units, which keeps the line the same weight at every cell count and every rotation.
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/tumbling-blocks/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/tumbling-blocks/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `near` | color | `#7c5cff` | any CSS hex | The lighter cube colour, and the one a cube starts from. |
| `far` | color | `#ff5c9d` | any CSS hex | The other cube colour, mixed in per cube so the wall is not one tone. The variation is in hue only: see `relief`. |
| `line` | color | `#0b0a18` | any CSS hex | The lattice lines, between cubes and across each one. A near-black with some of the cube hue still in it, because a true black line over a coloured face reads as a gap rather than as an edge. |
| `cells` | number | `7` | 2 to 24 (looks right between 5 and 12) | Cubes across the short edge. Few and large reads as architecture; past about fifteen the faces are too small to carry their own shading and the illusion goes with them. |
| `rotation` | number | `0` | 0 to 60 | Rotation of the lattice in degrees. Only sixty are worth having: a rhombille is unchanged by a third of a turn, and the three faces simply exchange roles. |
| `thickness` | number | `0.04` | 0 to 0.2 (looks right between 0.02 and 0.08) | Line width in lattice units. At 0 there are no lines and the cubes are held apart by their shading alone, which works and is quieter. |
| `softness` | number | `0.05` | 0 to 1 | Softness of the line edge, on top of the one pixel of antialiasing that is always there. |
| `variation` | number | `0.28` | 0 to 1 (looks right between 0.3 and 0.7) | How far the cube colour wanders from cube to cube. Kept low on purpose. The variation is in hue and the shading is identical on every cube, because agreement about where the light is coming from is the only thing telling the eye these are solids; push this up and a dark-hued cube's lit face ends up darker than a light-hued one's shadowed face, which is enough to flatten the whole wall into a pattern of diamonds. |
| `relief` | number | `0.85` | 0 to 1 (looks right between 0.6 and 1) | How far the three faces separate in tone. This is the illusion and almost nothing else is: at 0 the faces match, the solids flatten, and what is left is a pattern of diamonds. The shading is identical on every cube in the field on purpose, because agreement about where the light is coming from is the only thing telling the eye these are solids. |
| `seed` | number | `5` | 0 to 999 | Which cubes take which colour. Changes nothing else. |
| `period` | number | `16` | 6 to 60 s (looks right between 12 and 30) | Seconds for one turn of the light. The loop closes exactly on it, because a whole turn of the light is the same light. |

## 5. The one thing the illusion depends on

Not the outline, and not the three-tone fill. It is that the three faces
**agree about where the light is**, and go on agreeing across the whole
field: every top face the same, every left the same, every right the same.

That agreement is the only thing telling the eye these are solids. So vary
the **hue** per cube as much as you like and never vary the **shading**. An
earlier version of this varied both and the wall collapsed into a flat
pattern of diamonds — which is also the quickest way to see that the solidity
was never in the geometry.

## 6. Building it

1. **Find the hexagon.** A hexagonal lattice is two rectangular lattices
   offset by half a cell, so measure the point against both and keep whichever
   centre is nearer. No trigonometry, no loop. Keep the hexagon's index as
   well as the local offset — the per-cube hash needs it.
2. **Find the face.** The hexagon divides into three 120° sectors and the
   sector is the face. Offset by a quarter turn so the boundaries land on
   vertices rather than through the middle of a rhombus.
3. **Light it.** Give each face a normal at its sector centre, a third of a
   turn apart, and take `0.5 + 0.5·cos(face − light)`. Pull the result towards
   the middle so no face reaches black: an unlit face reads as a hole in the
   wall rather than as a solid.
4. **Draw the edges.** The hexagon outline, plus three internal spokes.

## 7. The trap in the spokes

The three internal edges are **rays from the centre, not lines through it**. A
line at one of those angles also passes through the opposite vertex, so
measuring distance to lines gives you six spokes and splits every rhombus into
two triangles. Measure to a ray: ahead of it, the perpendicular distance;
behind it, simply the distance to the centre.

## 8. Animating it

Turn the light, not the geometry. Nothing about the vertices is a function of
time; the faces brighten and darken in sequence because their normals are a
third of a turn apart, and the stack appears to rotate. One whole turn per
period closes the loop exactly, because a whole turn of the light is the same
light — and `renderAtTime(t)` stays pure in `t`.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/tumbling-blocks/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/tumbling-blocks/adapters/vue.ts

---

Concept credit: The parameter set, and the choice of a rhombille tiling read as cubes. Their IsometricCubes names cells, thickness, rotation, softness and a per-cube colour variation, which is the right set. The tiling is a rhombille and the illusion is older than photography. The code here is this repo's own., by Shader Effects Inc., https://github.com/shader-effects-inc/shaders.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
