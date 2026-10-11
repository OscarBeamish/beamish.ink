You are adding **WaterCaustics** from Beamish to this project.

> The net of focused light on the floor of a pool, worked out from a wavy surface rather than drawn. Backdrops · effect · MIT.
> https://beamish.ink/effects/water-caustics

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Nothing here draws a caustic. There is a height field and one step of optics: a ray through a surface of height h lands at p + d * grad(h) on a floor at depth d, and the brightness is one over the determinant of that mapping's Jacobian, which is the factor the area changed by. The filaments are where that determinant passes through zero and the mapping folds
- Built that way so the caustics behave rather than merely look right. Deepen the water and they spread and brighten, because a longer throw focuses harder. Flatten the waves and they fade rather than thin. They close into cells because the zero set of a determinant is a closed curve, which is the part a hand-drawn version never gets
- Eighteen waves, not six, and that is the whole difference between this and a plaid. A sum of a few plane waves is quasi-periodic however the directions and weights are chosen, so the caustics lay themselves out on a lattice: six gave columns, and reweighting them only changed which way the columns ran. Twenty-odd modes across a decade of wavelength is the smallest thing that stops reading as a pattern
- The curvature is summed in quadrature, not plainly. Waves at independent phases add as the root of their number, so dividing by the plain sum flattens the surface as modes are added. Going from six waves to eighteen that way took the curvature down by about half and the caustics disappeared into an almost black frame, which reads as a broken shader rather than as the normalisation it was
- Wave speeds follow deep-water dispersion, as the root of the wavelength, rounded to whole turns per period. Without it every mode drifts at one speed and the result reads as a moving photograph of water rather than as water. The rounding bends the dispersion by an amount nobody can see and removes a join everybody would
- The Hessian is analytic. A wave contributes -k^2 (u (x) u) sin(phase), so the second derivative is one sine per wave with no finite differencing, which at this scale would be dominated by the sampling rather than by the surface
- Filament width is measured against how fast the determinant is changing, with fwidth, so a line is the same number of pixels wide anywhere in the frame and at any resolution. A constant threshold gives hairlines where the field is slow and slabs where it is fast
- The brightness is not normalised to a peak. Light is conserved, so a patch squeezed to a tenth of its area is ten times as bright, and tone-mapping that with 1 - exp(-x) is what makes the tight folds blow out. An early version divided by the softening width instead, which capped every filament at the same brightness and produced a contour map: even outlines with nothing bright inside them
- The three channels focus at three depths, because water disperses and the short wavelengths bend further. That is the colour at the edge of a filament. At 0.22 it was three separate rings of red, green and blue and the thing read as a topographic map; the useful range is a few hundredths
- Built for a dark ground and declared as one. Light added to deep water is the whole idea, and added light on paper is invisible
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/water-caustics/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/water-caustics/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

WaterCaustics is the bright net of light on the floor of a swimming pool,
worked out rather than drawn.

Nothing in the shader draws a caustic line, and nothing knows where one is.
There is a wavy water surface and a floor some distance below it. Where the
surface happens to be concave it acts as a lens, squeezes a patch of light into
a smaller patch of floor, and the brightness there is however much the patch
shrank by. The net is what is left when you plot that.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="hero" style="height: 70vh"></div>

<script type="module">
  import { createWaterCaustics } from './beamish/effects/water-caustics/core.js'

  const pool = createWaterCaustics(document.querySelector('#hero'))
  pool.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createWaterCaustics } from '@/beamish/effects/water-caustics/core'

export function Pool() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pool = createWaterCaustics(host.current, { depth: 1.5 })
    pool.start()
    return () => pool.destroy()
  }, [])

  return <div ref={host} className="absolute inset-0 -z-10" />
}
```

Mount once. Option changes go through `update()` rather than a remount, because
a remount is a new WebGL context and the budget for those is small.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createWaterCaustics } from '@/beamish/effects/water-caustics/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pool: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pool = createWaterCaustics(host.value)
  pool.start()
})

onBeforeUnmount(() => pool?.destroy())
</script>

<template>
  <div ref="host" class="pool" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `water` | color | `#0b1a22` | any CSS hex | The water, which is what the floor looks like where no light is focused on it. Deep and desaturated: it is what the filaments are bright against, and a pale one leaves them nowhere to go. |
| `light` | color | `#9fe4f5` | any CSS hex | The light added where the surface focuses it. Added rather than mixed, so the brightest cores overexpose towards white the way more light does, instead of desaturating towards this colour. |
| `scale` | number | `1.9` | 0.4 to 8 (looks right between 1.4 and 3) | Waves across the short side of the frame, for the longest wave. Low is a lazy pool at dusk and high is a chop. The rest of the spectrum is built up from this, so it sets the size of the whole web. |
| `depth` | number | `1.5` | 0 to 4 (looks right between 1 and 2.2) | How hard the surface focuses, which is the throw from the surface to the floor. At 0 nothing is focused and the floor is flat water. Below about 0.8 the determinant never reaches zero, so there are no filaments at all, only a mottle. Past about 3 it folds everywhere and the web breaks into noise, which is also what a real pool does in a chop. |
| `waves` | number | `18` | 3 to 24 (looks right between 12 and 24) | Modes in the surface, spread geometrically over about a decade of wavelength. This is the one that decides whether it reads as water. Below about ten the sum is quasi-periodic and the caustics arrange themselves on a visible lattice however the rest is tuned. It is also the whole cost of the shader. |
| `thickness` | number | `1.6` | 0.3 to 8 (looks right between 1 and 3) | Filament width in pixels, measured against the rate the determinant is changing, so it means the same thing anywhere in the frame and at any resolution. |
| `exposure` | number | `0.04` | 0.005 to 0.3 (looks right between 0.02 and 0.08) | How much light there is. The optics hand back an unbounded brightness and this is where it meets a screen that stops at white, so it sets how much of the web blows out rather than how bright the dim parts are. |
| `contrast` | number | `1.35` | 0.5 to 4 (looks right between 1 and 2) | Pulls the dim half down without touching the blown-out cores. The difference between light through a metre of water and light through a centimetre. Raise it to put text over this. |
| `dispersion` | number | `0.03` | 0 to 0.25 (looks right between 0.01 and 0.06) | Difference in focal depth between red and blue, as a share of depth. At 0 the net is monochrome. Keep it small: by about 0.2 the three channels have separated into their own rings and the thing reads as a topographic map rather than as light. |
| `period` | number | `36` | 8 to 120 s (looks right between 28 and 60) | Seconds for one cycle. Every mode completes a whole number of turns in it, so the surface is exactly where it started and the loop has no join. This is also the dial for how busy the item is, and the change per frame is very close to linear in it. |
| `heading` | number | `18` | 0 to 360 deg | Which way the waves run. The directions fan out from here by the golden angle, so turning this turns the whole surface rather than rearranging it. |
| `seed` | number | `4` | 0 to 9999 | Seed for the wave directions and phases. Two of these side by side want two seeds, or they are the same pool twice. |

## 5. The arithmetic is one step of optics

A ray through a surface of height `h` is deflected by roughly the slope, so a
point `p` on the surface lands at `p + d * grad(h)` on a floor at depth `d`.
That is a mapping. Light is conserved, so the brightness it produces is one
over the determinant of its Jacobian: the factor by which it changed area. And
the Jacobian of that mapping is `I + d * H`, where `H` is the Hessian of the
height field.

So the whole effect is: build a height field whose second derivatives you
know, and divide by a two-by-two determinant.

Doing it this way is worth the trouble because the caustics then **behave**.
Deepen the water and the filaments spread and brighten, because a longer throw
focuses harder. Flatten the waves and they fade rather than thin. Where the
determinant passes through zero the mapping has folded over, and a fold is
exactly what a caustic is, which is why these lines close into cells rather
than lying about as stripes. The zero set of a determinant is a closed curve.

The height field is a sum of directional sines, because the Hessian of a sine
is free: a wave of unit direction `u` and wavenumber `k` contributes
`-k² (u ⊗ u) sin(phase)`, so the second derivative is one sine per wave with no
finite differencing anywhere.

## 6. Why eighteen waves

This is the setting that decides whether the thing reads as water, and it is
not obvious.

A sum of a few plane waves is quasi-periodic. Always. However the directions
are spread and however the weights are tuned, the caustics lay themselves out
on a lattice: six waves gave neat columns of identical bright lozenges, and
reweighting them only changed which way the columns ran. Water does not look
like that because water is not six waves. It is a continuum, and twenty-odd
modes spread geometrically across a decade of wavelength is the smallest thing
that stops reading as a pattern.

Below about `waves: 10` you will see the lattice. There is no other dial that
hides it.

## 7. Two things that are easy to get wrong

**Sum the curvature in quadrature, not plainly.** Waves at independent phases
do not add up, they add in quadrature: the sum of N of them has a typical size
of √N, not N. Divide by the plain sum of the weights and the surface flattens
as you add detail. Going from six waves to eighteen that way halved the
curvature and the caustics vanished into a near-black frame with a faint
mottle, which reads as a broken shader rather than as the normalisation error
it is.

**Do not normalise the brightness to a peak.** Light is conserved, so a patch
squeezed to a tenth of its area is ten times as bright, and the tight folds are
supposed to blow out. An early version divided by the softening width, which
capped every filament at the same brightness however hard it was focusing, and
the result was a contour map: thin even outlines with nothing bright inside
them. `exposure` and a `1 - exp(-x)` roll-off are what turn an unbounded
physical brightness into something a screen can show.

## 8. It is for a dark ground

Declared `dark`, and it means it. The effect adds light to deep water, and
light added to paper is invisible: on a pale page you get the water colour as a
flat rectangle and nothing else. Change `water` to something pale and you have
not made a paper version, you have removed the contrast the filaments need.

## 9. Putting text on it

You can, but not at the defaults. It is the liveliest backdrop in the library
and the bright cores go to white.

Two dials, in this order. Raise `contrast` to about 2, which pulls the dim half
down and leaves the cores where they are. Then drop `exposure` to about 0.02,
which stops them blowing out. That gives a deep field with a suggestion of a
web in it, which sits under a headline without competing.

Lengthening `period` does not help legibility, only distraction.

## 10. Cost and how busy it is

Measured at 1.1ms at 1280 by 720, against MeshGradient at 1.10 on the same run,
and 0.230 mean absolute change per frame on a 0 to 255 scale against
MarbledPaper at 0.166 and WindField at 0.104.

That makes it the busiest backdrop here, deliberately: a caustic that does not
shimmer is a photograph of one. `period` is the dial, and the change per frame
is very close to linear in it, so doubling the period halves the motion.

The cost is linear in `waves` and nothing else in the shader loops. Dropping to
twelve is about a third cheaper and is the first thing to try on a slow device,
though it brings the lattice closer.

## 11. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createWaterCaustics` from `useEffect`, `onMounted`, or a `client:*`
island.

## 12. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

The still frame loses little here. The subject is the shape of the net, and a
single frame has all of it.

## 13. The three mistakes most likely to be made here

1. **Too few waves.** Under about ten the caustics sit on a visible lattice and
   the whole thing reads as a printed pattern. No other setting hides it.

2. **Too much dispersion.** By about 0.2 the three channels have separated into
   their own rings of red, green and blue and it reads as a topographic map.
   Real water does this by a few hundredths.

3. **Too little depth.** Below about 0.8 the determinant never reaches zero, so
   there are no folds and therefore no filaments: you get a soft mottle and it
   looks like the shader is broken. It is not. Nothing is being focused.

4. **Putting it on paper.** It adds light. There is nothing for added light to
   do on a pale page.

5. **Reaching for `period` to calm it down behind text.** It makes the motion
   slower, not the contrast lower, and it is the contrast that makes copy hard
   to read. Use `contrast` and `exposure`.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/water-caustics/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/water-caustics/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
