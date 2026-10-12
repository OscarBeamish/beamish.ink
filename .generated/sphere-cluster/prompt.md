You are adding **SphereCluster** from Beamish to this project.

> A drift of lit spheres that breathes on its own and opens where you point. Backdrops · effect · MIT.
> https://beamish.ink/effects/sphere-cluster

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- One InstancedMesh rather than a mesh each: one geometry, one draw call and a matrix per sphere. The scene this is taken from builds a hundred and twenty eight separate spheres at sixty-four segments square, which is about a million triangles and a draw call apiece for balls a few dozen pixels across.
- No shadow map. A cluster of spheres is all curvature, so the bright side, the terminator and the fill carry the form; a shadow pass over this many instances costs a second pass over every one of them to darken contacts nobody is looking for.
- The layout is a hash of the sphere index, not a table. A direction and a cube-rooted radius rather than three independent axes, because three axes fill a box and the corners of it read as corners.
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/sphere-cluster/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/sphere-cluster/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `background` | color | `#07060f` | any CSS hex | Behind the cluster. Nothing is drawn there, so it is a flat fill, and a near-black with a trace of the fill hue in it rather than a neutral grey: a neutral ground flattens whatever stands in front of it. |
| `body` | color | `#ddd4e8` | any CSS hex | The spheres. One colour for all of them, because what separates one sphere from the next is the light falling across it rather than its own hue. |
| `light` | color | `#ffb870` | any CSS hex | The key light, which is what gives every sphere its bright side. Warm against a cool fill is the whole palette: it is the same split that makes metal and skin read as lit rather than as coloured in. |
| `fill` | color | `#5f3fe8` | any CSS hex | The fill light, from the opposite side to the key, which decides what colour the turned-away half of a sphere goes. It has to be a direction rather than an ambient: ambient adds the same amount to every surface whatever way it faces, so a coloured one tints the whole cluster evenly and the shadowed side comes out as the lit side with less of it. What makes a sphere read as lit rather than as coloured in is that its two halves disagree about the colour of the light. |
| `count` | number | `120` | 8 to 400 (looks right between 60 and 180) | How many spheres. This is the cost and it is linear: one matrix written per sphere per frame and one draw call for all of them. |
| `spread` | number | `6.6` | 1 to 12 (looks right between 3.5 and 7) | How far the cluster reaches, in scene units. Large and sparse reads as a galaxy; small and dense reads as a single mass with a lumpy edge. |
| `flatten` | number | `0.45` | 0.05 to 1 (looks right between 0.3 and 0.7) | How flat the cluster is. At 1 it is a ball of spheres and mostly hides itself; lower values spread it across the frame, which is what a backdrop wants, and let the light reach further into it. |
| `size` | number | `0.74` | 0.1 to 2.5 | The largest sphere, in scene units. Past about 1.4 at the default spread the big ones meet and the cluster becomes one surface. |
| `sizeVariation` | number | `0.72` | 0 to 1 (looks right between 0.5 and 0.85) | How much the sizes differ. The spread is squared so a few are large and most are small: a uniform spread of radii reads as gravel. At 0 every sphere is the same size, which reads as a diagram. |
| `breathe` | number | `0.16` | 0 to 1 (looks right between 0.1 and 0.35) | How far each sphere drifts along the cluster's own radius as it breathes, so the whole thing swells and settles rather than sliding. At 0 it is still, which costs nothing to draw and is a legitimate way to use it. |
| `part` | number | `1.1` | 0 to 4 | How far the pointer pushes a sphere aside. Instantaneous rather than a force that decays: a decaying force is an accumulator, and the frame would then depend on the frames before it, which renderAtTime cannot allow. The squash of the scene this came from is what that costs. |
| `partRadius` | number | `3.4` | 0.5 to 10 | How wide the parting is, in scene units. Wide and gentle reads as the cluster leaning away; narrow and strong reads as a hole being pushed through it. |
| `seed` | number | `7` | 0 to 999 | The layout: where every sphere sits and how big it is. Every value is a different cluster and none is better than another. |
| `period` | number | `20` | 6 to 90 s (looks right between 14 and 40) | Seconds for one cycle of the breathing. The loop closes exactly on it, because the frequency is a whole number of turns in that time. |

## 5. Why it is not the simulation it came from

The scene this is taken from is a physics toy. Pointing at a sphere adds a
force to it; the force decays five per cent a frame; every pair of spheres is
tested for overlap and pushed apart. All three are **accumulators** — a
sphere's position depends on how it got there, not on the clock.

That cannot be seeked, so it cannot be recorded without a jump where the take
wraps, and it arranges itself differently every time the page loads.

So the state is gone. Every sphere is a closed form in `t`:

| | |
| --- | --- |
| **where it sits** | a hash of its index, which never changes |
| **how it breathes** | `sin(t·ω + phase)`, ω a whole number of turns per period |
| **how far the pointer moved it** | a function of where the pointer **is**, never of where it has been |

**What that costs:** the squash. A sphere no longer carries momentum away from
the cursor and settles back. Everything else it buys — seeking, an exact loop,
the same cluster on every load — is worth more for a backdrop.

The collision pass goes too, and not only because it accumulates. It is every
pair, so the cost is the square of the count: 128 spheres is ~8,000 distance
tests a frame to prevent an overlap a hash layout simply does not create.

## 6. Drawing it

**One `InstancedMesh`**, not a mesh each. One geometry, one draw call, a matrix
per sphere. The original builds 128 separate spheres at 64×64 segments — about
a million triangles — for balls a few dozen pixels across. 20×14 is already
smooth at this size.

**No shadow map.** A cluster of spheres is all curvature, so the bright side,
the terminator and the fill carry the form. A shadow pass over this many
instances costs a second pass over every one of them to darken contacts nobody
is looking for.

## 7. The layout

Use a **direction and a cube-rooted radius**, not three independent axes.
Three axes fill a box and the corners of it read as corners. A direction with
`cbrt(random)` fills a ball evenly.

Square the size distribution so a few spheres are large and most are small. A
uniform spread of radii reads as gravel.

## 8. The light is the palette

One body colour for every sphere. What separates one from the next is the
light falling across it, so the colour lives in the **lights**: a warm key
against a cool, saturated ambient. The shadowed half of a sphere is the half
that shows you what the room is made of, so a grey ambient wastes it.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/sphere-cluster/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/sphere-cluster/adapters/vue.ts

---

Concept credit: The scene: a cluster of lit spheres behind a hero, which you can push around with the cursor. Its version is a physics toy with accumulating forces and pairwise collisions, so none of that could come across; every sphere here is a closed form in t instead, and the squash is what that costs. The code is this repo's own., by Ray Velez, https://github.com/RayVelez27/instalanding.ai.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
