# SphereCluster

A drift of lit spheres behind a hero, breathing on its own, opening where the
cursor goes.

## Why it is not the simulation it came from

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

## Drawing it

**One `InstancedMesh`**, not a mesh each. One geometry, one draw call, a matrix
per sphere. The original builds 128 separate spheres at 64×64 segments — about
a million triangles — for balls a few dozen pixels across. 20×14 is already
smooth at this size.

**No shadow map.** A cluster of spheres is all curvature, so the bright side,
the terminator and the fill carry the form. A shadow pass over this many
instances costs a second pass over every one of them to darken contacts nobody
is looking for.

## The layout

Use a **direction and a cube-rooted radius**, not three independent axes.
Three axes fill a box and the corners of it read as corners. A direction with
`cbrt(random)` fills a ball evenly.

Square the size distribution so a few spheres are large and most are small. A
uniform spread of radii reads as gravel.

## The light is the palette

One body colour for every sphere. What separates one from the next is the
light falling across it, so the colour lives in the **lights**: a warm key
against a cool, saturated ambient. The shadowed half of a sphere is the half
that shows you what the room is made of, so a grey ambient wastes it.
