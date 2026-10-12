# TruchetMaze

A square lattice where every cell holds the same marking in one of two
orientations, chosen at random, and the markings join across the edges into
curves that run much further than any one cell. Sebastien Truchet published
the idea in 1704; this is the quarter-circle variant everybody uses.

## The one thing that makes it work

Each tile holds two arcs of radius half a cell, centred on opposite corners.
That radius is not a choice. It is the only one for which every arc meets the
cell edge **at its midpoint and at a right angle**, so whichever way the
neighbour is flipped, its arc arrives at the same point travelling the same
way. The curve carries on and the joins cannot be seen. Change the radius and
you get a lattice of disconnected scratches.

## Building it

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

## Animating it without breaking it

Do not re-roll the tiles. A tile that flips cuts the curve it was part of into
two ends and the eye goes straight to the cut.

Travel the **line weight** instead: a wave whose phase advances with time and
retreats with `cell.x + cell.y`, so it runs diagonally across a maze that
never moves. One whole cycle per period makes the last frame the first frame,
so the loop joins with nothing to hide, and keeps `renderAtTime(t)` pure in
`t`.

## Colour

Run the ramp **across the frame**, not per tile. Per tile puts a hard edge on
every cell boundary, which undoes the one thing the tiling is for. Across the
frame, a single curve changes colour as it travels.

Use three stops. Between two colours you get one hue and a tint of it; passing
through a third is what makes a ramp read as light falling across something.
