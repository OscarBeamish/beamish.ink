You are adding **VoronoiCells** from Beamish to this project.

> The plane divided by which scattered point is nearest, with the sites drifting so every border moves with them. Backdrops · effect · MIT.
> https://beamish.ink/effects/voronoi-cells

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Nine cells is the whole search. Each site is jittered inside its own lattice cell and capped so it can never leave, so the nearest site to a pixel is in that pixel cell or one of the eight around it: nine hashes and nine distances, no list, no sorting and no texture.
- The borders come from the second nearest site. Halfway between two sites the two distances are equal, so their difference goes to zero at the boundary, which is a usable distance to the edge for nothing. It is slightly wrong where three cells meet, by an amount nobody has noticed.
- The wobble radius is capped just under a half. A site that crosses into its neighbour cell breaks the assumption the three by three search rests on, and the field tears along the lattice.
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/voronoi-cells/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/voronoi-cells/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `near` | color | `#2440d8` | any CSS hex | Cell colour at the near end of the ramp. |
| `mid` | color | `#fc02dd` | any CSS hex | Cell colour through the middle. Between two colours a ramp gives one hue and a tint of it; passing through a third is what makes a field of flat cells read as lit from somewhere. |
| `far` | color | `#ffc2f0` | any CSS hex | Cell colour at the far end. |
| `edge` | color | `#06040c` | any CSS hex | The borders between cells. Near-black with a little of the cell hue still in it, because a true black line across a saturated cell reads as a gap rather than as an edge. |
| `cells` | number | `7` | 2 to 30 (looks right between 5 and 12) | Cells across the short edge. Few and large reads as stained glass; past about twenty the borders are closer together than the cells are wide and it becomes a texture. |
| `wobble` | number | `0.34` | 0 to 0.49 (looks right between 0.2 and 0.42) | How far each site drifts from the middle of its own cell, in cell widths. Capped just under a half on purpose: a site that crosses into its neighbour cell breaks the nine-cell search and the field tears along the lattice. At 0 nothing moves, which costs nothing to draw and is a legitimate way to use it. |
| `thickness` | number | `0.055` | 0 to 0.3 (looks right between 0.02 and 0.1) | Border width, in lattice units. At 0 there are no borders and the cells are held apart by colour alone, which is quieter and entirely usable. |
| `softness` | number | `0.18` | 0 to 1 | Softness of the border, on top of the one pixel of antialiasing that is always there. A little helps more here than on a straight line, because a Voronoi border meets its neighbours at angles that are never the same twice. |
| `depth` | number | `0.22` | 0 to 0.6 (looks right between 0.1 and 0.35) | How much a cell darkens away from its own site. Just enough that a large cell does not read as a flat sticker; past about 0.4 it is a gradient competing with the borders for attention. |
| `seed` | number | `4` | 0 to 999 | Where every site sits and which cell takes which colour. Every value is a different field and none is better than another. |
| `period` | number | `24` | 6 to 90 s (looks right between 16 and 40) | Seconds for one circuit of the sites. The loop closes exactly on it, because each site completes a whole turn of its own small circle in that time. |

## 5. Nine cells is the whole search

Put each site at a jittered position **inside its own lattice cell**, and cap
the jitter so it can never leave. Then the nearest site to any pixel is in
that pixel's cell or one of the eight around it, and the search is a fixed
3x3: nine hashes and nine distances. No list, no sorting, no texture.

**The cap is load-bearing.** A site that crosses into its neighbour's cell
breaks the assumption the 3x3 rests on, the nearest site can be two cells
away, and the field tears along the lattice.

## 6. The second nearest is where the edges come from

Distance to the nearest site tells you how far you are from a *site*, which is
no use. What you want is how far you are from a *border*.

Halfway between two sites the nearest and second nearest distances are equal,
so `second - first` falls to zero at the boundary. That difference is a usable
distance to the edge for free. Stroke it with a `smoothstep` widened by one
pixel of the lattice, measured with `fwidth`.

It is slightly wrong where three cells meet, by an amount nobody has noticed.

## 7. Two things that look like details

**Key the colour to the cell, not to the position.** Key it to where the site
currently is and a cell shifts hue as it drifts, which reads as a fault in the
rendering rather than as movement.

**Keep each cell flat.** The edges are the subject, and shading inside a cell
is a second pattern competing with the first. A little darkening away from the
site stops a large cell reading as a sticker, and that is all it is for.

## 8. Animating it

Send each site round its own small circle, a whole number of turns over the
period, so the field returns exactly and `renderAtTime(t)` stays pure in `t`.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/voronoi-cells/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/voronoi-cells/adapters/vue.ts

---

Concept credit: The parameter set and the pair of colours. Their Voronoi names two cell colours, a border, a scale, a seed and an edge intensity and softness, which is the right set, and the blue and magenta are theirs: far enough apart in hue to separate every cell from its neighbours without either reading as a highlight. The tessellation is Georgy Voronoy from 1908. The code here is this repo own., by Shader Effects Inc., https://github.com/shader-effects-inc/shaders.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
