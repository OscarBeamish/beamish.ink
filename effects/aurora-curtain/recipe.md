## What it is

The northern lights, on a night sky.

This is the first item in the library built for a dark ground rather than for
warm paper, and it declares that in its meta so the site shows it on one. Paper
is the house style here, not a rule about what may exist, and an aurora on paper
would be a worse aurora for no reason.

It is not a rainbow gradient with noise on it, and that is most of why those
read as wallpaper. An aurora is emission, and every part of its shape follows
from that.

**It hangs in vertical rays.** Electrons spiral down the magnetic field lines,
which are near vertical at those latitudes, and light up the gas along the way.
The striation is the single most recognisable thing about an aurora, and an
effect without it is a coloured cloud.

**The bottom edge is sharp and the top is not.** The electrons stop where the
air finally gets thick enough, an abrupt floor at around 100km, and thin out
upwards over hundreds of kilometres. So the foot is a hard line and the top has
no edge at all: it runs out.

**The colour is altitude.** Atomic oxygen gives the green line at 557.7nm low
down, and the red line at 630nm higher up, where collisions are rare enough to
let the slower transition finish. Green at the foot running to red at the top,
never the other way round and never a hue cycle.

**It folds along its length.** You are looking at a sheet edge on, so a fold
reads as a bright rib rather than as a wave passing through.

## The loop closes

Everything that moves is a sum of sines whose time coefficients are whole
numbers of turns over `period`:

```glsl
float phase = TAU * u_time / u_period;
float s  = sin(x * 0.7  + phase       + seed) * 0.55;
      s += sin(x * 1.63 - phase * 2.0 + seed * 2.1) * 0.3;
      s += sin(x * 3.11 + phase * 3.0 + seed * 3.7) * 0.15;
```

1, 2 and 3. A fractional coefficient never comes back to where it started, so
the loop never closes and the video jumps once a cycle. Two items in this
library shipped that way before there was a test for it.

It is also why there is no noise field here. Value noise advanced by time is the
obvious way to build a drifting curtain and it cannot be made periodic without
sampling it on a torus, which costs more than the sines do and buys nothing you
can see at this scale.

## Using it

```html
<div id="sky" style="position: fixed; inset: 0; z-index: -1"></div>
```

```ts
import { createAuroraCurtain } from './beamish/effects/aurora-curtain/core'

const aurora = createAuroraCurtain(document.querySelector('#sky'))
aurora.start()
```

The element needs a size. Give it width and height in CSS, not just content.

**React** and **Vue** adapters ship beside the core and do nothing but wire a
ref to it. **Astro** consumes either as an island, or calls the core from a
plain `<script>`.

## Putting text on it

The light is at the bottom of the frame and the top is nearly empty sky, which
is the opposite of most backdrops and decides where your copy goes.

Headline high, aurora low, and check the contrast where the curtain is
brightest rather than where it is average. White type over the green is roughly
4:1 on the defaults, which is not enough: either keep the type above the light,
lower `brightness`, or put a scrim under the words. A scrim is not a cheat. A
backdrop calm enough to need no scrim anywhere is a backdrop with nothing in it.

Dark type is a non-starter. This is a night sky and the whole frame is dark, so
the type is light and the only question is what sits behind it.

## Tuning it

`rays` is the first thing to reach for. If it reads as a gradient rather than an
aurora, it is low.

`curtains` is how many sheets, and each is further away: lower, dimmer, folded
on a different scale. One is a quiet backdrop. Three is a display, and a display
behind a headline is a lot.

`fold` at 0 gives flat bands, which is a real thing a quiet aurora does and the
safest setting behind text.

`period` is the pace, and the default is 36 seconds for one cycle. That is slow
on purpose: a backdrop has to survive being ignored, and movement at the edge of
vision pulls a reader off a headline, which is the one thing a background must
not do. If you shorten it, measure what you get rather than judging it by eye.
Mean absolute change per frame across the canvas, 0 to 255: the quiet items in
this library sit between 0.01 and 0.2, and anything past about 1 reads as
something happening.

`height` is a falloff rather than a ceiling. Raising it does not move the top of
the light, because there is no top; it makes the whole column reach further.

## Performance

No textures, no noise lookups, no render targets. The frame is about twenty
sines and two hashes per pixel, so the cost is the pixel count rather than the
shader, and a full-screen canvas at 2x DPR is the thing to watch rather than
the maths.

`curtains` is the one setting that changes the cost. The loop is bounded at
three and breaks early, so one curtain is a third of the work of three.

## Pausing

Handled in the runtime, and non-negotiable: WCAG 2.2.2 is Level A and it
describes every ambient backdrop. The handle has `stop()` and `start()`, and the
demo panel on the site wires them to a visible control.

## Reduced motion

Also handled in the runtime. Under `prefers-reduced-motion: reduce` the loop
never starts and one frame is drawn, at `reducedMotionTime`. That frame is
chosen rather than defaulted to zero: at 7 seconds the curtains are folded and
crossing, which is a composition rather than three parallel bands.

## Cleanup and SSR

`destroy()` releases the context, deletes the program and the VAO, cancels the
RAF and disconnects the observers. Call it.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`, which is
already on the React adapter.

## Common mistakes

1. **Making it fast.** An aurora moves slowly and it is behind your content. The
   first instinct with a shader like this is to shorten the period until the
   demo looks lively, which is the recorder setting the design.

2. **Cycling the colour.** The green and the red are two emission lines, not two
   ends of a hue ramp. Rotating the hue through blue and yellow is the clearest
   possible sign that nobody looked at the sky.

3. **Putting the headline over the brightest part.** The light is at the foot of
   the frame. That is where the contrast is worst and where the rays are busiest.

4. **Expecting it on paper.** `ground` says dark. On a light page the sky is a
   dark rectangle, which is a hole rather than a backdrop.
