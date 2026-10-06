## What it is

Heat tint on a slow-moving metal surface, on a dark ground.

The colour is **thin-film interference**, which is the same thing that colours
an oil slick, a soap bubble, anodised titanium, and steel that has been heated
in air. It is not a palette and not a hue ramp, and that difference is the whole
item.

Light reflecting off the top of a very thin transparent film and light
reflecting off the bottom of it travel different distances. Where that
difference is half a wavelength they cancel, and because each wavelength
cancels at a different thickness, what is left is a colour that belongs to the
film rather than to the paint.

```glsl
vec3 reflectance(float opd, float top) {
  float base = top + 0.85;              // the metal underneath reflects 85%
  float swing = 2.0 * sqrt(top * 0.85); // and the film's own surface, this much
  return base + swing * cos(TAU * opd / lambda + PI);
}
```

Three things fall out of that, and they are what make it read as metal:

**The colour follows the slope, not the position.** The path difference depends
on the angle light takes through the film, so tilting the surface moves the
colour. A gradient between two colours cannot do that, and the moment you put
them side by side it is obvious which is which.

**The bands repeat.** Thickness keeps increasing, the cancellation comes round
again, and you get order after order of the same sequence, paler each time.

**It lives at the rim.** Reflection off the film is strongest at a glancing
angle, so the colour is strongest where the surface turns away from you.

## Nine wavelengths, not three

The obvious implementation samples the interference at nominal red, green and
blue and calls it a colour. It does not work, and the way it fails is worth
knowing: at three wavelengths every thickness comes out as one of a
complementary pair, so the whole effect swings between green and magenta and
nothing else. The first draft of this looked like an oil slick and never once
like heated steel.

A real film runs straw, bronze, purple, blue, cyan, gold, because the eye is
integrating a whole spectrum with the cancellation sitting in different places.
So this integrates nine wavelengths across the visible band, weighted by the
CIE 1931 colour matching functions, and converts the result to sRGB.

The weights are evaluated at build time rather than per pixel, because the
wavelengths are fixed. What is left in the shader is nine cosines and nine
multiply adds, which is why it still costs a quarter of a millisecond.

## Two details that are physics rather than taste

**Snell's law.** The angle in the expression is the one *inside* the film, not
the one outside it, so the ray is refracted at the surface before the path
difference is worked out. At a glancing angle the two differ by most of a band,
and a glancing angle is exactly where the film is most visible.

**The half-wavelength flip.** Reflection off the top surface is off a denser
medium, which flips the phase; the reflection off the bottom is not. That is the
`+ PI`. Leave it out and every colour comes out as its own complement, which
looks perfectly plausible right up until you hold it next to a photograph of a
soap film.

## The surface

Five travelling waves, warped, and the normal is the analytic derivative of the
same sum rather than a sampled difference:

```glsl
h     += amp * sin(dot(p, dir) * k + phase * harm);
slope += amp * k * dir * cos(dot(p, dir) * k + phase * harm);
```

That is not an optimisation. A sampled normal quantises to the sample spacing,
and the flat runs come out faceted, which on something meant to be polished is
the illusion gone. The same argument as the distance field in the glass items.

Two things had to be built on top of that, and both were found by looking
rather than by reasoning.

**The waves alone are a lattice.** Five plane waves added together are
quasi-periodic however carefully the directions are chosen, and the moment there
is any contrast in the lighting the regularity shows: with creases in it, the
first version came out as a quilt of identical diamonds. `flow` is a domain
warp, which reads the field at a position pushed sideways by two more fields,
and that is the difference between a surface and a pattern. The normal survives
it by the chain rule, so everything stays analytic.

**The frequencies were ten times too low.** `p` spans a little over one unit on
a wide frame, so `sin(dot(p, dir))` turns through a fifth of a cycle from one
side of the canvas to the other. That is a tilt, not a wave, and it is why the
first draft was a soft grey blur. They are written in cycles now.

## The motion budget, which is measured

A backdrop has to survive being ignored, and this one is harder to keep quiet
than most: iridescence turns a small change in slope into a large change in
colour, so a surface that looks calm can be churning on the measurement.

Mean absolute change per frame at 60Hz across the whole canvas, 0 to 255:

| | measured |
| --- | --- |
| first version, time coefficients 1, 2, 3, 5, 7 | 1.414 |
| halved to 1, 1, 2, 2, 3 | 0.669 |
| two finest octaves held still | 0.520 |
| warp frozen as well | 0.172 |
| and `period` at 48 seconds | **0.129** |

The quiet items in this library sit between 0.01 and 0.2, so the last two
changes are the ones that matter. Holding the fine octaves still leaves the
large forms drifting and the texture on them stationary, which is also what a
heavy liquid does; freezing the warp means what you see is a surface flowing
through a shape rather than the whole frame sliding. A river moves, the bend it
runs through does not.

The time coefficients that remain are whole numbers of turns over `period`, so
the loop closes exactly: measured seam of 0.000.

## Using it

```html
<div id="bg" style="position: fixed; inset: 0; z-index: -1"></div>
```

```ts
import { createMoltenMetal } from './beamish/effects/molten-metal/core'

const molten = createMoltenMetal(document.querySelector('#bg'))
molten.start()
```

The element needs a size. Give it width and height in CSS, not just content.

**React** and **Vue** adapters ship beside the core and do nothing but wire a
ref to it. **Astro** consumes either as an island, or calls the core from a
plain `<script>`.

## Putting text on it

This is a busier backdrop than it looks, because the interference puts
saturated colour in places a gradient would not. Light type works, dark type
does not, and neither survives the brightest band without help.

The reliable answer is to take `iridescence` down behind the words rather than
to fight it: at 0.3 it is still clearly a tinted metal and the contrast problem
goes away. A scrim under the copy is the other answer and it is not a cheat.

## Tuning it

`film` is the control you came for. It is the mean thickness in nanometres and
it picks the colour family, exactly as it does on a real piece of steel:

| film | what it looks like |
| --- | --- |
| 250 | the straw and brown of lightly heated steel |
| 420 | blues and purples, the default |
| 650 | greens and pinks, second order |
| 900+ | the pale higher orders, soap film just before it pops |

`variation` decides whether the bands follow the shape. At 0 the colour comes
only from the viewing angle, which is cleaner and colder; raising it makes the
film thicker in the troughs the way a real one is.

`relief` scales the slope rather than the height. Flat surfaces show almost no
colour, because there is no angle for the film to work with.

`flow` is the domain warp. At 0 you get the lattice described above, which is
worth looking at once so the reason for it is obvious.

`scale` is feature size. Low and large for a full screen; high packs the bands
until it reads as shot silk rather than metal, which is a nice thing to have but
is a different material.

`period` is the pace, 36 seconds by default. Slow on purpose: a backdrop has to
survive being ignored. If you shorten it, measure what you get rather than
judging by eye, mean absolute change per frame across the canvas on a 0 to 255
scale. The quiet items in this library sit between 0.01 and 0.2.

## Performance

Four waves, each giving its height and its slope from one sine and one cosine,
plus three cosines for the interference. No textures, no noise lookups, no
render targets, nothing per-pixel that depends on anything else.

So the cost is the pixel count rather than the shader. A full-screen canvas at
2x device pixel ratio is the thing to watch, not the maths.

## Pausing

Handled in the runtime, and non-negotiable: WCAG 2.2.2 is Level A and it
describes every ambient backdrop. The handle has `stop()` and `start()`.

## Reduced motion

Also handled in the runtime. Under `prefers-reduced-motion: reduce` the loop
never starts and one frame is drawn, at `reducedMotionTime`.

## Cleanup and SSR

`destroy()` releases the context, deletes the program and the VAO, cancels the
RAF and disconnects the observers. Call it.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`, which is
already on the React adapter.

## Common mistakes

1. **A pale metal.** The colour is a reflection off the film. On a light base
   there is nothing for it to reflect against and the whole effect washes out.

2. **Reaching for the hue.** If the colours are wrong, the control is `film`,
   not a hue rotation. Rotating the hue breaks the one thing that makes this
   read as a material: that the sequence of colours is the sequence a real film
   goes through.

3. **Flattening it.** At low `relief` there is no angle for the interference to
   vary over, so you get a flat wash. The colour needs the shape.

4. **Expecting it on paper.** `ground` says dark.
