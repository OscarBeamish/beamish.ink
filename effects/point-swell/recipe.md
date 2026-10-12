# PointSwell

A sea of points, seen at a low angle, with the swell running through it.

## Why it is a sum of waves and not scrolling noise

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

## The three things that decide whether it reads as a surface

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

## Colour

Near-black ground with a trace of the low hue in it, a deep violet for the
troughs and a bright cyan for the crests. Two colours is a fade; what stops
this one reading as a fade is that the crest colour is only ever reached by a
small fraction of the points, so it works as light rather than as a gradient.
