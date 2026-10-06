## What it is

A beam of white light through a slowly turning prism, on a dark ground.

The fan is **traced, not drawn**. Sixteen wavelengths, each with its own
refractive index, each refracted at the entry face, carried through the glass
and refracted again on the way out, each cast as its own ray.

That matters because everything people recognise about a prism then falls out
of it rather than being arranged:

**Red bends least and violet most**, because the refractive index of glass rises
towards the blue end. The ordering is not a choice here. Reverse `dispersion`
and the spectrum reverses, as it would in a material with anomalous dispersion.

**The fan is narrow.** A real 60 degree prism in crown glass spreads the visible
band by about one degree. That is why a prism throws a long thin spectrum rather
than a wide one, and why the picture everybody has in mind is of a spectrum cast
several metres away.

**The spread changes as it turns**, and it is tightest near minimum deviation,
where the beam passes through symmetrically. That is the one moment in the cycle
when the fan narrows and brightens, and it is the detail that says this is being
worked out rather than painted.

**Some wavelengths do not get out.** Where the angle inside the glass is past
the critical angle the ray is totally internally reflected and no line is drawn
for it, which is a real thing a prism does and not a case to paper over.

## The index

Cauchy's equation, the two-term fit every glass catalogue starts with:

```glsl
float n = A + B / (um * um);   // um is the wavelength in micrometres
```

`index` is A, roughly the index in the middle of the band. `dispersion` is B in
micrometres squared, and it is the whole of the splitting:

| | index | dispersion |
| --- | --- | --- |
| fused silica | 1.46 | 0.0035 |
| crown glass, the default | 1.52 | 0.0045 |
| flint glass | 1.62 | 0.012 |
| diamond | 2.42 | 0.015 |

Flint is two or three times the dispersion of crown, which is why it is what
chandeliers are cut from. At `dispersion` 0 the glass still bends the beam and
no longer splits it, which is worth seeing once.

## The colours are not a palette

The tints are the CIE 1931 colour matching functions converted to linear sRGB
and evaluated at build time, one per wavelength.

Several of them are outside the sRGB gamut and clamp. That is correct and
unavoidable: a monitor cannot show a spectral green. The alternative is to
desaturate the whole spectrum until it fits, which makes the one part of the
picture everybody knows the look of into a pastel approximation of itself.

## Using it

```html
<div id="bg" style="position: fixed; inset: 0; z-index: -1"></div>
```

```ts
import { createPrismSpectrum } from './beamish/effects/prism-spectrum/core'

const prism = createPrismSpectrum(document.querySelector('#bg'))
prism.start()
```

The element needs a size. Give it width and height in CSS, not just content.

**React** and **Vue** adapters ship beside the core and do nothing but wire a
ref to it. **Astro** consumes either as an island, or calls the core from a
plain `<script>`.

## Putting text on it

Most of the frame is empty dark room, which makes this one of the easier
backdrops in the library to put words on. Light type, and keep it out of the
quadrant the fan sweeps through.

The fan is the brightest thing on the screen by a long way, and no amount of
scrim will save body copy sitting on it. Move the text, not the light.

## Tuning it

`apex` and `incidence` together decide how near the pass is to minimum
deviation. A shallow prism barely splits the light; past about 75 degrees most
of the beam is lost to total internal reflection and the fan disappears, which
is worth knowing before you conclude something is broken.

`sway` is how far it rocks over a cycle, and at 0 you get a still composition.
That is a legitimate way to use this and it is the quietest thing in the
library: nothing moves at all.

`glass` is deliberately low. The light is the subject, and a prism drawn as a
solid object in front of its own spectrum is a paperweight.

`spread` is the one number here that is a drawing decision rather than an
optical one. A real beam is as wide as its source; this is how wide you want it
to read.

## Performance

Two ray-triangle intersections for the beam itself, then sixteen refractions and
sixteen distance-to-ray tests per pixel. No textures, no noise lookups, no
render targets.

Measured at **0.57ms** for a 960 by 540 canvas, timed with a readPixels after
each draw so the number includes the GPU. That makes it the most expensive
backdrop in the library and still comfortably inside a frame, and the cost is
the sixteen rays rather than anything structural.

The motion is **0.064** mean absolute change per frame at 60Hz, against the 0.01
to 0.2 the quiet items sit in, and the loop seam is 0.000 at the 48 second
period. A rocking prism is naturally quiet: only the fan moves, and it moves
slowly.

Which face the beam leaves by is worked out once, with the middle of the band,
rather than per wavelength: the rays inside the glass differ by a fraction of a
degree, so over the width of a prism they arrive within a pixel of each other,
and intersecting all sixteen against all three faces would be three times the
work for a difference nobody can see.

## Pausing

Handled in the runtime, and non-negotiable: WCAG 2.2.2 is Level A and it
describes every ambient backdrop. The handle has `stop()` and `start()`.

## Reduced motion

Also handled in the runtime. Under `prefers-reduced-motion: reduce` the loop
never starts and one frame is drawn, at `reducedMotionTime`. With `sway` at 0
there is nothing to reduce, because nothing was moving.

## Cleanup and SSR

`destroy()` releases the context, deletes the program and the VAO, cancels the
RAF and disconnects the observers. Call it.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`, which is
already on the React adapter.

## Common mistakes

1. **Turning the dispersion up to see it better.** Past about 0.02 the fan stops
   being a spectrum and becomes a set of separate coloured beams, because the
   wavelengths are no longer overlapping enough to blend.

2. **A pale background.** Everything here is light added to the ground. On a
   light page there is nothing for the beams to be brighter than.

3. **Expecting a wide rainbow.** The spread of a real prism is about a degree.
   If you want the fan to fill the frame, move the exit further from the edge by
   raising `size`, which is what a longer throw does in life.

4. **Expecting it on paper.** `ground` says dark.
