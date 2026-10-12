# VoronoiCells

Scatter sites across the plane; give every pixel to whichever site is nearest.

The boundaries are never drawn and never chosen. They fall exactly halfway
between neighbouring sites, because halfway is where "nearest" changes its
mind, so moving one site moves every edge it owns. That is why this reads as a
membrane under tension rather than as a pattern laid down.

## Nine cells is the whole search

Put each site at a jittered position **inside its own lattice cell**, and cap
the jitter so it can never leave. Then the nearest site to any pixel is in
that pixel's cell or one of the eight around it, and the search is a fixed
3x3: nine hashes and nine distances. No list, no sorting, no texture.

**The cap is load-bearing.** A site that crosses into its neighbour's cell
breaks the assumption the 3x3 rests on, the nearest site can be two cells
away, and the field tears along the lattice.

## The second nearest is where the edges come from

Distance to the nearest site tells you how far you are from a *site*, which is
no use. What you want is how far you are from a *border*.

Halfway between two sites the nearest and second nearest distances are equal,
so `second - first` falls to zero at the boundary. That difference is a usable
distance to the edge for free. Stroke it with a `smoothstep` widened by one
pixel of the lattice, measured with `fwidth`.

It is slightly wrong where three cells meet, by an amount nobody has noticed.

## Two things that look like details

**Key the colour to the cell, not to the position.** Key it to where the site
currently is and a cell shifts hue as it drifts, which reads as a fault in the
rendering rather than as movement.

**Keep each cell flat.** The edges are the subject, and shading inside a cell
is a second pattern competing with the first. A little darkening away from the
site stops a large cell reading as a sticker, and that is all it is for.

## Animating it

Send each site round its own small circle, a whole number of turns over the
period, so the field returns exactly and `renderAtTime(t)` stays pure in `t`.
