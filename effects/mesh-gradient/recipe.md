## What it is

The soft flowing colour field that sits behind half the software marketing on
the web, and behind Stripe's home page in particular.

It is worth being precise about what that effect is, because the usual
description is wrong in a way that matters. It is not a CSS gradient with more
stops, and it is not a blurred photograph of some blobs. The original is a plane
cut into a grid of a few hundred vertices, each pushed around by layered noise,
with three or four colour layers blended over each other by more noise.

Three ingredients, and this has all three:

**Layered waves.** Several octaves, each finer and weaker than the last. That is
what gives the field its sense of scale: broad shapes with detail inside them,
rather than one smooth blob or one busy texture.

**A domain warp.** The field is read at a position pushed sideways by another
field, which is what bends the bands around each other. At `warp` 0 you get
parallel stripes, and parallel stripes are the single thing that gives away most
attempts at this effect.

**Shading from the slope.** This is the one most copies leave out. On the
original the mesh is displaced, so the light follows the displacement; here the
same derivative that would have moved a vertex lights the result instead. Set
`relief` to 0 and the whole thing flattens into wallpaper. It is the difference
between a surface being folded and a picture being blurred.

## The diagonal edge is CSS, not the shader

The sharp diagonal everybody associates with this effect is not in here, and
putting it in the shader would be a mistake: it belongs to the layout, not to
the material.

```css
.hero {
  overflow: hidden;
  transform: skewY(-12deg);
  transform-origin: top left;
}

.hero > * {
  transform: skewY(12deg); /* put the contents back upright */
}
```

The canvas stays a plain rectangle, the container is skewed and clipped, and the
contents are unskewed by the same amount so the type is not leaning. Two lines
and a counter-rotation.

## Using it

```html
<div id="hero" style="position: relative; min-height: 70vh">
  <div id="bg" style="position: absolute; inset: 0"></div>
  <h1 style="position: relative">Something worth reading</h1>
</div>
```

```ts
import { createMeshGradient } from './beamish/effects/mesh-gradient/core'

const mesh = createMeshGradient(document.querySelector('#bg'))
mesh.start()
```

The element needs a size. Give it width and height in CSS, not just content.

**React** and **Vue** adapters ship beside the core and do nothing but wire a
ref to it. **Astro** consumes either as an island, or calls the core from a
plain `<script>`.

## Choosing the four colours

This is most of the work, and the rule is narrower than it looks: **keep the
four within a hand's reach of each other on the wheel.**

The effect reads as one material lit unevenly. Four colours from opposite sides
of the wheel read as four materials, which is why so many of these end up
looking like a screensaver. The default is warm paper with a peach, a cornflower
and a lilac over it: three hues inside a quarter turn.

`base` is doing the job paper does in print. It shows wherever none of the
layers reaches, so it should be the quietest of the four.

For the dark version everybody else ships, put a near-black in `base` and three
saturated colours over it, and drop `relief` a little, because a dark field
shows shading more readily than a pale one.

## Putting text on it

Easier than most backdrops, because the whole field is close in value by
construction. Measure anyway, against the lightest patch the layers can make
rather than against the average: the point of the thing is that it moves, so the
worst case will arrive eventually.

If it fails, the fix is `softness` rather than opacity. A softer field has a
narrower range of values, because the layers spend more of their time blended
rather than fully themselves.

## Tuning it

`scale` is the one to set first. The shapes should be bigger than the headline
sitting on them: this is a hero, not a texture.

`softness` decides gradient or map. Low values give you three countries with
borders, which is a different and much harder effect to put text on.

`grain` is not decoration here. A field this smooth bands visibly in eight bit
colour, and a little noise is the standard fix: it dithers the step so the eye
reads a continuous ramp.

`period` is the pace, 36 seconds by default, and it is slow because this sits
behind a headline.

## Performance

Five fields of four waves each, so forty sines and forty cosines a pixel. No
textures, no noise lookups, no render targets, nothing that depends on a
neighbour.

So the cost is the pixel count rather than the shader, and a full-screen canvas
at 2x device pixel ratio is the thing to watch rather than the maths.

## Pausing

Handled in the runtime, and non-negotiable: WCAG 2.2.2 is Level A and it
describes every ambient backdrop. The handle has `stop()` and `start()`.

## Reduced motion

Also handled in the runtime. Under `prefers-reduced-motion: reduce` the loop
never starts and one frame is drawn, at `reducedMotionTime`. A still frame of
this is a perfectly good hero background, which is not true of every effect in
this library.

## Cleanup and SSR

`destroy()` releases the context, deletes the program and the VAO, cancels the
RAF and disconnects the observers. Call it.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`, which is
already on the React adapter.

## Common mistakes

1. **Four colours from all over the wheel.** It reads as one material lit
   unevenly or it reads as nothing.

2. **Turning `relief` off.** It is the only thing here that says surface rather
   than image, and at 0.16 it is almost subliminal, which is the point.

3. **Putting the skew in the shader.** The diagonal is the container's, and
   doing it in the canvas means the pixels are skewed too, so the grain goes
   lopsided and the edges stair-step.

4. **Speeding it up to make the demo livelier.** That is the recorder setting
   the design. It sits behind a headline.
