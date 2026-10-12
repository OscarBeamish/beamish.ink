You are adding **SphereCluster** from Beamish to this project.

> A hundred and one lit spheres that fly in, settle, breathe, and open where you point. Backdrops · effect · MIT.
> https://beamish.ink/effects/sphere-cluster

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- One InstancedMesh rather than a mesh each: the same geometry at the same tessellation, one draw call and one matrix per sphere instead of a hundred and one draw calls.
- The entrance is a closed form in t rather than a timeline. Three stages per sphere, staggered, with the z bulge a half sine over each of the first two so it returns to the resting z exactly. A timeline would have been easier to write and could not be seeked, which would mean no recorded take.
- The warmth survives into the shadow side because it is the material emissive rather than a light. An ambient cannot colour a shadow side: it adds the same amount to every surface whichever way it faces.
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
| `background` | color | `#fbfaff` | any CSS hex | Behind the cluster. The near-white the hero sits on in the page this came from; the spheres are a pale blush and need a light ground to be pale against. |
| `body` | color | `#c7a5a5` | any CSS hex | The spheres' own colour, before the light and the glow reach them. A dusty rose, which with a pure red glow over it is what gives the cluster its colour from every angle. |
| `glow` | color | `#7a1414` | any CSS hex | The glow every sphere carries regardless of the light. This is the emissive, and it is doing more for the colour than the body is: an emissive is not lit, so it survives into the shadow side where the diffuse has gone, which is why the cluster reads warm all over rather than warm on one side. The scene this came from sets it to pure red. On r128's colour pipeline that renders as a blush; on a current one it saturates the red channel completely, which stops the bright side clipping to white and leaves every sphere a flat coral. A darker red puts the highlights back. |
| `light` | color | `#ffffff` | any CSS hex | The key light, which does the modelling. |
| `keyStrength` | number | `0.52` | 0 to 3 (looks right between 0.3 and 1) | How bright the key is. Half the flat light, which is the balance the scene was lit at: the flat light is most of what you see and the key only has to say where the form is. |
| `ambient` | color | `#ffffff` | any CSS hex | The flat light that reaches every surface whichever way it faces. |
| `ambientStrength` | number | `1` | 0 to 3 (looks right between 0.6 and 1.4) | How bright the flat light is. At full strength, as the scene has it, which is why the cluster is evenly lit and the shapes are carried by the silhouette rather than by shading. |
| `distance` | number | `24` | 8 to 60 (looks right between 18 and 34) | How far the camera sits from the cluster, in scene units. It is pulled back further on a narrow frame so the cluster still fits, which matters on a phone: at that aspect it otherwise runs off both sides. |
| `intro` | number | `2.6` | 0 to 8 (looks right between 2 and 4) | Seconds the entrance takes for one sphere, before the stagger. At 0 the cluster starts settled, which is what a backdrop behind a page that is already open wants. |
| `stagger` | number | `0.02` | 0 to 0.2 (looks right between 0.01 and 0.04) | Seconds between one sphere setting off and the next. The whole entrance therefore lasts the intro plus a hundred of these, so at the default it is finished a little after four and a half seconds. |
| `drop` | number | `25` | 2 to 60 | How far below the frame the spheres start, in scene units. Far enough that none of them is in shot before it sets off. |
| `overshoot` | number | `4` | 0 to 12 | How far past its resting place each sphere flies before falling back, and how far it bulges towards the camera on the way. The bulge is a half sine over each stage, so it returns to the resting depth exactly. |
| `breathe` | number | `0.1` | 0 to 1 (looks right between 0.05 and 0.25) | How far each sphere drifts once settled: a sine in height against a cosine in depth at half the amplitude. At 0 the settled cluster is still. |
| `breatheSpeed` | number | `2` | 0.1 to 8 (looks right between 1 and 3) | How fast it breathes, in radians a second. Each sphere is a fifth of a radian behind the one before it, which is what makes the cluster shimmer rather than pulse as one body. |
| `part` | number | `2.2` | 0 to 4 | How far the one sphere nearest the cursor moves: towards the camera, and a little away from the cursor. Only one moves, which is the difference between a swarm being disturbed and a bite taken out of it. Displacing every sphere within a radius was tried twice and draws a void either way, because a dense cluster has no slack and moving a group of them reveals the background. Instantaneous rather than a force that decays, because a decaying force is an accumulator and renderAtTime could no longer be seeked. |
| `partRadius` | number | `4.5` | 0.5 to 10 | How close the cursor has to be, in scene units, before the nearest sphere reacts at all. Beyond it nothing moves. |

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

Concept credit: The whole scene: the hundred and one hand-placed sphere positions and radii, the dusty rose body under a red emissive, the three light intensities, the twenty-five degree camera, and the staggered three-stage entrance. The arrangement is placed rather than generated and that is most of why it reads as composed, so it is carried across as his rather than replaced with a hash. What could not come across is the physics: its pointer force decays frame to frame and its collision pass tests every pair, and both are accumulators that would stop renderAtTime being seekable., by Ray Velez, https://github.com/RayVelez27/instalanding.ai.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
