You are adding **GuillocheLines** from Beamish to this project.

> The engine-turned line work off a banknote, printed on paper. Backdrops · effect · MIT.
> https://beamish.ink/effects/guilloche-lines

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- WebGL2 for gl_VertexID; there is no WebGL1 fallback and none is planned
- The line width is derived from the screen-space derivative of the field, so the engraving stays one pixel wide at any DPR instead of filling in at the centre
- Falls back to a still frame under prefers-reduced-motion, handled in the runtime
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/guilloche-lines/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/guilloche-lines/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Guilloche is the engine-turned line work off a banknote, a share certificate or
the bezel of a watch, drawn on warm paper.

It is not noise and it is not a gradient. A real rose engine cuts one continuous
line whose radius is modulated by a set of gears, so the result is a family of
curves in a strict harmonic relationship. That is what this draws: three
rosettes, each a circle whose radius wobbles at a whole number of lobes, rendered
as a line field rather than a fill, and multiplied together the way overlapping
ink actually behaves.

The whole-number lobe counts matter. A fractional count gives a curve that never
closes, and an open curve reads as a mistake rather than as engraving. The three
families are kept coprime so their interference takes a long time to repeat and
never settles into a grid.

One band is printed in a second colour, riding the same field, the way a
certificate prints one guilloche in red over the rest in black. It is part of the
engraving rather than a highlight laid on top of it.

One WebGL2 fragment shader on one full-screen triangle. No noise, no textures, no
render targets. It is the cheapest effect in the library.

## 3. Wire it in

**Plain HTML.** The element needs a size of its own.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createGuillocheLines } from './beamish/effects/guilloche-lines/core.js'

  const guilloche = createGuillocheLines(document.querySelector('#backdrop'), {
    lobes: 7,
    period: 40
  })
  guilloche.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createGuillocheLines } from '@/beamish/effects/guilloche-lines/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const guilloche = createGuillocheLines(host.current, { period: 40 })
    guilloche.start()
    return () => guilloche.destroy()
  }, [])

  return <div ref={host} className="fixed inset-0 -z-10" />
}
```

Do not put option values in the dependency array. Call `update()` instead: every
option is a uniform, so nothing rebuilds.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createGuillocheLines } from '@/beamish/effects/guilloche-lines/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let guilloche: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  guilloche = createGuillocheLines(host.value, { period: 40 })
  guilloche.start()
})

onBeforeUnmount(() => guilloche?.destroy())
</script>

<template>
  <div ref="host" class="backdrop" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

**Behind content.** Raise `period` to 40 and drop `weight` to about 0.2. The
engraving recedes into a watermark you stop noticing, which is what a certificate
background is for. Do not reach for opacity: it greys the paper and loses the
thing that makes it look printed.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper the plate is printed on. Match it to your page background. |
| `ink` | color | `#2f2b26` | any CSS hex | The engraving. A desaturated near-black reads as ink; pure black reads as a wireframe. |
| `accent` | color | `#c44400` | any CSS hex | The second colour, printed over one band of the pattern the way a share certificate prints one guilloche in red over the rest in black. |
| `scale` | number | `0.92` | 0.2 to 3 (looks right between 0.6 and 1.4) | Size of the whole rosette. Below about 0.5 the lines are finer than the pixels and the plate turns grey. |
| `pitch` | number | `26` | 4 to 80 (looks right between 14 and 40) | Lines per unit of radius. Higher is finer engraving, and past about 50 it stops resolving on anything but a retina screen. |
| `lobes` | number | `7` | 2 to 24 (looks right between 5 and 12) | Lobes on the first rosette. Whole numbers only: a fractional lobe count gives a curve that never closes, and an open curve reads as a mistake rather than as engraving. The other two families are derived from this and kept coprime to it. |
| `waves` | number | `24` | 4 to 80 (looks right between 12 and 40) | Spokes in the family that runs around the circle rather than out from it. This is what turns two ring families into woven guilloche instead of a moire. |
| `depth` | number | `0.07` | 0 to 0.4 (looks right between 0.04 and 0.14) | How far each rosette's radius wobbles. Zero is concentric circles. Past about 0.2 the curves cross themselves and the weave becomes a tangle. |
| `weight` | number | `0.35` | 0 to 1 (looks right between 0.2 and 0.55) | Weight of the engraved line. Heavy lines at a high pitch fill in solid, so raise one and lower the other. |
| `accentBand` | number | `0.22` | 0 to 1.2 (looks right between 0.1 and 0.5) | Where the second colour sits, as a radius from the centre. Set it past the corner of the panel to switch the second colour off. |
| `grain` | number | `0.28` | 0 to 1 | Paper tooth. Static by design. Animated grain flickers, and a flicker this fine is what WCAG 2.3.1 exists to prevent. |
| `period` | number | `6` | 4 to 180 s (looks right between 6 and 60) | Seconds for one turn of the gears. The pattern is exactly periodic over this. The default is 6 so the preview video is a whole turn; 30 to 60 is right behind a page, where the gears should be moving slowly enough that nobody catches them. |
| `reducedMotionTime` | number | `5` | 0 to 180 s | The single frame shown when the user prefers reduced motion. Any time works: a still guilloche is an engraving, which is a finished thing to look at. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createGuillocheLines` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable. `stop()` and `start()` are on the handle for that. Surface them as a
real control in your own build. Reduced motion does not cover this, and plenty of
people who need a pause button have not set that preference.

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`.

This effect needs no care here. Any frame of it is an engraving, which is a
finished thing to look at, so the default is as good as any other number.

## 7. The three mistakes most likely to be made here

1. **Passing a fractional `lobes`.** The curve then never closes on itself, and
   what you get is a spiral with a visible join rather than a rosette. The option
   is stepped to whole numbers for that reason; if you set it from code, round it.

2. **Raising `pitch` and `weight` together.** Fine lines and heavy weight fill in
   solid, and the centre of the rosette goes black first because that is where
   the field changes fastest. Raise one and lower the other.

3. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing. Give the host `position: fixed; inset: 0`, or an
   explicit height.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/guilloche-lines/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/guilloche-lines/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
