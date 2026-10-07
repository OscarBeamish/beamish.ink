You are adding **MoireScreens** from Beamish to this project.

> Two halftone screens laid over each other at a small angle, with the fringes left to emerge rather than drawn. Backdrops · effect · MIT.
> https://beamish.ink/effects/moire-screens

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Nothing in the shader draws a fringe or knows where one is. There are two regular screens and the interference is what comes out, which is why the fringes behave correctly when the angle changes: the spacing of the beat goes as the pitch over twice the sine of half the angle, so it runs away towards infinity as the screens line up
- The anti-aliasing is load-bearing rather than a polish pass. A regular screen at this frequency aliases against the pixel grid, and that aliasing is itself a moire, so the fringes would be partly the screens beating with the display rather than with each other and the effect would be a rendering artefact wearing the costume of an optical one. Each screen's coverage is computed analytically and softened by exactly one pixel's footprint, measured with fwidth
- The inks multiply rather than add, because that is what ink does: two transparent layers pass the product of what each passes. Added instead, the overlaps saturate and the fringes flatten at the dark end, which is the difference between reading as print and reading as two gels on a lightbox
- Element size is derived from coverage properly, through the area of a disc in a square cell for dots and half the covered width for lines, so `coverage` means the same thing in both modes
- This is a printing fault induced on purpose, and the reason process colour is screened at 15, 45, 75 and 105 degrees is to avoid it. Set `separation` to 30 for the industry's answer and 4 for the thing every printer has had to explain to a client
- The drift is a sine rather than a continuous turn, so the loop closes. A screen turning continuously passes through the angles where the beat vanishes and comes out the other side, which is a busier effect and a different one
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- Measured at 0.103 mean absolute change per frame on a 0 to 255 scale at the default drift, which is in line with MeshGradient at 0.091, and 1.1ms at 640 by 360. The change per frame is exactly linear in the drift, so halving one halves the other
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/moire-screens/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/moire-screens/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

MoireScreens lays two halftone screens over each other at a small angle and
lets them beat.

The fringes are not drawn. Nothing in the shader draws a fringe or knows where
one is: there are two regular screens, and the interference is what comes out.
That is the point of building it this way rather than drawing the pattern, and
it is why the fringes behave correctly when the angle changes. The spacing of
the beat is the pitch over twice the sine of half the angle, so it runs away
towards infinity as the screens line up: ten degrees gives a tight rosette, two
gives fringes the size of the frame, and zero gives nothing at all.

This is a printing fault, induced on purpose. It is the reason process colour is
screened at fifteen, forty-five, seventy-five and a hundred and five degrees:
those angles are chosen so four screens do not do this. Set `separation` to 30
and you have the industry's answer. Set it to 4 and you have the thing every
printer has had to explain to a client.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="hero" style="height: 70vh"></div>

<script type="module">
  import { createMoireScreens } from './beamish/effects/moire-screens/core.js'

  const beat = createMoireScreens(document.querySelector('#hero'))
  beat.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createMoireScreens } from '@/beamish/effects/moire-screens/core'

export function Beat() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const beat = createMoireScreens(host.current, { separation: 3.2 })
    beat.start()
    return () => beat.destroy()
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
import { createMoireScreens } from '@/beamish/effects/moire-screens/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let beat: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  beat = createMoireScreens(host.value)
  beat.start()
})

onBeforeUnmount(() => beat?.destroy())
</script>

<template>
  <div ref="host" class="beat" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The sheet both screens are printed on, and what shows where neither covers. |
| `first` | color | `#36362f` | any CSS hex | The first screen's ink. Since the two multiply, this is the colour the sheet takes where only this screen covers. |
| `second` | color | `#c44400` | any CSS hex | The second screen's ink. Two different inks make the fringes read as colour as well as tone, which is what makes the beat visible at low coverage. The same colour twice is the purer demonstration and the duller picture. |
| `pitch` | number | `14` | 2 to 40 (looks right between 8 and 18) | Distance between screen elements, in CSS pixels. Fine pitches give large fringes for a given angle and read as an optical event; coarse ones read as two patterns you can see individually. It is also the one setting that decides what this costs to ship: a screen is high-frequency detail across the whole frame, so halving the pitch roughly quadruples the dot count and the video with it. At 10 the take would not fit in the repo's budget at any frame rate worth watching; at 14 it does, and the dots read more clearly as dots. Below about 3 the screen is at the limit of what a display can resolve and the effect starts depending on the device. |
| `coverage` | number | `0.3` | 0.02 to 0.98 (looks right between 0.3 and 0.6) | Share of the sheet each screen covers. The fringes are strongest near a half, because that is where a small change in overlap makes the biggest difference to how much paper is left. At the extremes there is either nothing to overlap or nothing left uncovered. |
| `separation` | number | `3.2` | 0 to 45 (looks right between 1 and 12) | The angle between the two screens, and the control that matters. It sets the fringe spacing through the pitch over twice the sine of half of it, so the relationship is violently non-linear: 10 degrees gives a tight rosette, 2 gives fringes the size of the frame, and 0 gives no beat at all because the screens are in register. |
| `angle` | number | `15` | 0 to 90 deg | How the first screen is set in the frame. It does not affect the beat at all, only which way the whole thing is turned. 15 is where a printer would put the first screen of a four-colour job. |
| `drift` | number | `0.8` | 0 to 20 deg (looks right between 0.4 and 2) | Degrees the second screen turns over one period, and the one setting that decides how busy this is. Tiny numbers are enough, because the fringe spacing depends so sharply on the angle that a degree sweeps the fringes right across the frame. It is also exactly linear in the change per frame: measured at 0.0514, 0.1028 and 0.2055 for 0.4, 0.8 and 1.6 degrees, so this is the dial to turn if it is too much. At 0 it is a still image, which is a perfectly good way to use this. |
| `lines` | boolean | `false` | `true` · `false` | Fine lines rather than dots. A line screen beats in one axis only, so the fringes are bands rather than a rosette, which is the version you see when a striped shirt is photographed. Dots are the print version. |
| `detune` | number | `0.04` | -0.3 to 0.3 | Difference in pitch between the two screens, as a share of the first. The other way to make a beat: two screens at the same angle but slightly different pitch give straight fringes rather than turned ones. A little of both is more interesting than either alone. |
| `period` | number | `28` | 12 to 180 s | Seconds for one cycle of the drift. Long, because the fringes move much faster than the angle does and a backdrop has to survive being ignored. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createMoireScreens` from `useEffect`, `onMounted`, or a `client:*`
island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For this item that matters more than most. A drifting moire is exactly the kind
of high-contrast, large-scale movement that triggers discomfort, and the still
frame loses nothing: the fringes are the subject and they are all there in one
frame.

## 7. The three mistakes most likely to be made here

1. **Hard-edged screens.** They alias, the aliasing is its own moire against the
   display, and the effect ends up reporting on the monitor. The edge has to be
   softened by one pixel's footprint, no more and no less.

2. **Adding the inks instead of multiplying them.** The overlaps saturate and
   the fringes flatten at the dark end. Two transparent layers pass the product
   of what each passes.

3. **A large `separation`.** Past about fifteen degrees the beat is a fine
   rosette and the effect looks like a texture. The interesting range is one to
   nine.

4. **Putting copy on it.** It is the loudest item here. That is not a defect; it
   is what a moire is.

5. **A fine `pitch` on a high-density display.** Below about three CSS pixels
   the screen is at the limit of what the device can resolve and the result
   starts to depend on the device, which is the one thing this item is built to
   avoid.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/moire-screens/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/moire-screens/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
