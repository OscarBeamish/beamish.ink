## What it is

WaterCaustics is the bright net of light on the floor of a swimming pool,
worked out rather than drawn.

Nothing in the shader draws a caustic line, and nothing knows where one is.
There is a wavy water surface and a floor some distance below it. Where the
surface happens to be concave it acts as a lens, squeezes a patch of light into
a smaller patch of floor, and the brightness there is however much the patch
shrank by. The net is what is left when you plot that.

## The arithmetic is one step of optics

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

## Why eighteen waves

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

## Two things that are easy to get wrong

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

## Wiring

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

## It is for a dark ground

Declared `dark`, and it means it. The effect adds light to deep water, and
light added to paper is invisible: on a pale page you get the water colour as a
flat rectangle and nothing else. Change `water` to something pale and you have
not made a paper version, you have removed the contrast the filaments need.

## Putting text on it

You can, but not at the defaults. It is the liveliest backdrop in the library
and the bright cores go to white.

Two dials, in this order. Raise `contrast` to about 2, which pulls the dim half
down and leaves the cores where they are. Then drop `exposure` to about 0.02,
which stops them blowing out. That gives a deep field with a suggestion of a
web in it, which sits under a headline without competing.

Lengthening `period` does not help legibility, only distraction.

## Cost and how busy it is

Measured at 1.1ms at 1280 by 720, against MeshGradient at 1.10 on the same run,
and 0.230 mean absolute change per frame on a 0 to 255 scale against
MarbledPaper at 0.166 and WindField at 0.104.

That makes it the busiest backdrop here, deliberately: a caustic that does not
shimmer is a photograph of one. `period` is the dial, and the change per frame
is very close to linear in it, so doubling the period halves the motion.

The cost is linear in `waves` and nothing else in the shader loops. Dropping to
twelve is about a third cheaper and is the first thing to try on a slow device,
though it brings the lattice closer.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createWaterCaustics` from `useEffect`, `onMounted`, or a `client:*`
island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

The still frame loses little here. The subject is the shape of the net, and a
single frame has all of it.

## Common mistakes

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
