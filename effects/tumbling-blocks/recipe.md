# TumblingBlocks

Three rhombi fill a hexagon exactly. Shade each as a different face of a cube
and the hexagon stops being a hexagon: it is a cube seen corner-on, and a
plane of them is a wall of stacked blocks. Quilters have called it tumbling
blocks for two centuries. The reversal comes free, and once the stack has
flipped you cannot see it the first way again.

## The one thing the illusion depends on

Not the outline, and not the three-tone fill. It is that the three faces
**agree about where the light is**, and go on agreeing across the whole
field: every top face the same, every left the same, every right the same.

That agreement is the only thing telling the eye these are solids. So vary
the **hue** per cube as much as you like and never vary the **shading**. An
earlier version of this varied both and the wall collapsed into a flat
pattern of diamonds — which is also the quickest way to see that the solidity
was never in the geometry.

## Building it

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

## The trap in the spokes

The three internal edges are **rays from the centre, not lines through it**. A
line at one of those angles also passes through the opposite vertex, so
measuring distance to lines gives you six spokes and splits every rhombus into
two triangles. Measure to a ray: ahead of it, the perpendicular distance;
behind it, simply the distance to the centre.

## Animating it

Turn the light, not the geometry. Nothing about the vertices is a function of
time; the faces brighten and darken in sequence because their normals are a
third of a turn apart, and the stack appears to rotate. One whole turn per
period closes the loop exactly, because a whole turn of the light is the same
light — and `renderAtTime(t)` stays pure in `t`.
