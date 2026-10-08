You are adding **AuroraCurtain** from Beamish to this project.

> The northern lights on a night sky, folded into curtains and lit from the bottom up. Backdrops · effect · MIT.
> https://beamish.ink/effects/aurora-curtain

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Built for a dark ground and declared as one. On warm paper it is a worse aurora for no reason, and the house style is a house style rather than a rule about what may exist
- The shape follows the physics rather than a reference photograph. Emission runs along near-vertical magnetic field lines, which is the striation; the electrons stop at an abrupt floor around 100km and thin out upwards over hundreds of kilometres, which is why the bottom edge is sharp and the top has no edge at all
- The colour is altitude. Oxygen's green line at 557.7nm low down, its red line at 630nm higher up where collisions are rare enough to let the slower transition happen. Green at the foot running to red at the top, never a hue cycle
- Every moving term is a sum of sines whose time coefficients are whole numbers of turns over the period, so the loop closes exactly. A noise field advanced by time never returns to its first frame and the recorder needs it to
- Three curtains at different depths, each lower, dimmer and folded on a different scale. Sharing a scale makes them read as one curtain drawn three times
- The stars do not twinkle. Scintillation is strongest near the horizon and nearly absent overhead, and faking it evenly costs a per-frame change in every pixel for something nobody looks at
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/aurora-curtain/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/aurora-curtain/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `sky` | color | `#070b18` | any CSS hex | The night sky behind it. Dark, and not black: a real sky has a colour, and the shoulder that keeps the bright parts from clipping lifts pure black into a flat grey anyway. |
| `low` | color | `#45efa0` | any CSS hex | The colour at the foot, which is oxygen's green line at 557.7nm and the brightest thing in the display. Shifting it far from green stops reading as an aurora, because this is the one colour everybody has seen. |
| `high` | color | `#d8468f` | any CSS hex | The colour at the top, which is the slower red transition high up where the air is thin enough to let it happen. Magenta rather than pure red is what a camera records and what most people picture. |
| `curtains` | number | `3` | 1 to 3 | How many curtains. Each is further away: lower in the frame, dimmer, and folded on a different scale. One is a quiet backdrop, three is a display. |
| `height` | number | `0.3` | 0.15 to 0.9 | How far up the frame the light reaches, as a share of its height. It is a falloff rather than a limit, so a curtain has no top edge: it runs out. |
| `fold` | number | `0.62` | 0 to 1.5 | How hard the curtains fold along their length. At 0 you have flat bands, which is a real thing a quiet aurora does and is also the safest setting behind text. |
| `rays` | number | `0.8` | 0 to 1.4 | Contrast of the vertical rays. This is the most recognisable thing about an aurora and the first thing to raise if it looks like a gradient. |
| `pitch` | number | `40` | 8 to 120 | How fine the rays are, as turns across the frame rather than a count: x spans the aspect ratio, so 40 is roughly a dozen ribs on a wide canvas. Past about 90 they stop resolving on a small panel and read as noise. |
| `brightness` | number | `0.8` | 0.1 to 2 | Overall strength of the light. A soft shoulder keeps it from clipping, so a high value compresses rather than flaring into a white patch. |
| `stars` | number | `0.5` | 0 to 1.5 | Stars. They sit under the aurora rather than over it, and they are brighter overhead than near the horizon, because low stars are seen through more air. |
| `horizon` | number | `0.45` | 0 to 1.5 | Light on the horizon. Nowhere on Earth is the bottom of the sky as dark as the top, and the gradient is most of what stops a flat sky colour looking like a swatch. |
| `grain` | number | `0.3` | 0 to 1 | The sensor noise of a long exposure. Static rather than crawling: film grain that moves is a different effect and a far noisier one. |
| `period` | number | `36` | 12 to 120 s | Seconds for one full cycle, and the pace control. Long on purpose: a backdrop has to survive being ignored, and an aurora that hurries is a screensaver. |

## 5. The loop closes

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

## 6. Using it

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

## 7. Putting text on it

The light is at the bottom of the frame and the top is nearly empty sky, which
is the opposite of most backdrops and decides where your copy goes.

Headline high, aurora low, and check the contrast where the curtain is
brightest rather than where it is average. White type over the green is roughly
4:1 on the defaults, which is not enough: either keep the type above the light,
lower `brightness`, or put a scrim under the words. A scrim is not a cheat. A
backdrop calm enough to need no scrim anywhere is a backdrop with nothing in it.

Dark type is a non-starter. This is a night sky and the whole frame is dark, so
the type is light and the only question is what sits behind it.

## 8. Tuning it

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

## 9. Performance

No textures, no noise lookups, no render targets. The frame is about twenty
sines and two hashes per pixel, so the cost is the pixel count rather than the
shader, and a full-screen canvas at 2x DPR is the thing to watch rather than
the maths.

`curtains` is the one setting that changes the cost. The loop is bounded at
three and breaks early, so one curtain is a third of the work of three.

## 10. Cleanup and SSR

`destroy()` releases the context, deletes the program and the VAO, cancels the
RAF and disconnects the observers. Call it.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`, which is
already on the React adapter.

## 11. Pausing and reduced motion

Handled in the runtime, and non-negotiable: WCAG 2.2.2 is Level A and it
describes every ambient backdrop. The handle has `stop()` and `start()`, and the
demo panel on the site wires them to a visible control.

Also handled in the runtime. Under `prefers-reduced-motion: reduce` the loop
never starts and one frame is drawn, at `reducedMotionTime`. That frame is
chosen rather than defaulted to zero: at 7 seconds the curtains are folded and
crossing, which is a composition rather than three parallel bands.

## 12. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/aurora-curtain/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/aurora-curtain/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
