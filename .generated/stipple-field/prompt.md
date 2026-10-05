You are adding **StippleField** from Beamish to this project.

> A stipple drawing where tone is how many marks there are, and the cursor works it up. Backdrops · effect · MIT.
> https://beamish.ink/effects/stipple-field

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Tone is carried by the number of marks rather than their size, which is what separates a stipple from a halftone: an engraver has one nib, so darker means more marks rather than fatter ones
- Each mark is tested against the nine surrounding cells, because a mark thrown off centre crosses into its neighbour and testing only its own cell would slice it at the boundary
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- The cursor raises the tone it is over, which adds marks rather than enlarging them. It is a plain function of the pointer position with nothing integrated, so a scripted path replays identically and renderAtTime stays pure
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/stipple-field/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/stipple-field/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

A stipple drawing. Tone is carried by how many marks there are, not how big they
are.

That is the whole distinction from a halftone, and it is worth being exact about,
because the two look superficially alike and the difference is the entire reason
this exists alongside HalftoneBackdrop. A halftone puts a dot in the middle of
every cell of a regular grid and varies its size: the count is fixed and the area
does the work. A stipple engraver has one nib. Every mark is the same size, and
darker means more marks, closer together.

So the grid here is only a way of avoiding a sort. Each cell holds at most one
mark, thrown off the centre by a hash, and whether it exists at all comes from
comparing a second hash against the tone wanted at that point. Off-grid positions
and a population that thins out is what reads as a hand rather than as a screen.

Each pixel is tested against the nine cells around it rather than only its own. A
mark thrown off centre crosses into its neighbour, and testing one cell would
slice it at the boundary: the jitter would then read as marks being cut rather
than as marks being scattered.

The tone field drifts on a closed orbit through noise space, so the loop returns
to exactly where it started rather than being crossfaded.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## 3. Wire it in

**Plain HTML.** The element needs a size of its own.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createStippleField } from './beamish/effects/stipple-field/core.js'

  const stipple = createStippleField(document.querySelector('#backdrop'), {
    period: 60
  })
  stipple.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createStippleField } from '@/beamish/effects/stipple-field/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const stipple = createStippleField(host.current, { period: 60 })
    stipple.start()
    return () => stipple.destroy()
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
import { createStippleField } from '@/beamish/effects/stipple-field/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let stipple: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  stipple = createStippleField(host.value, { period: 60 })
  stipple.start()
})

onBeforeUnmount(() => stipple?.destroy())
</script>

<template>
  <div ref="host" class="backdrop" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper behind the marks. |
| `ink` | color | `#36362f` | any CSS hex | The nib. |
| `accent` | color | `#c44400` | any CSS hex | A second nib, on a small share of the marks. |
| `pitch` | number | `7` | 3 to 30 | Cell size in CSS pixels. There is at most one mark per cell, so this is the spacing of the stipple rather than its weight. Laid out in pixels so the marks keep their size whatever shape the element is. |
| `jitter` | number | `0.75` | 0 to 1 | How far each mark is thrown off the centre of its cell. At 0 the marks sit on a grid and it stops being a stipple; at 1 they are anywhere in their cell and the grid is undetectable. |
| `scale` | number | `1.6` | 0.2 to 8 | Size of the tone field the marks follow. Lower is broader country with slower changes in density. |
| `weight` | number | `0.19` | 0.05 to 0.45 | Radius of a mark, measured in cells. Every mark is the same size, which is the point: an engraver has one nib. Past about 0.4 they touch at full density and it becomes a solid. |
| `contrast` | number | `1.9` | 0.5 to 5 | How hard the tone field pushes away from the midtone. Applied about 0.5, so raising it opens the field out rather than dragging the whole thing dark. |
| `accentShare` | number | `0.06` | 0 to 0.5 | Share of marks that take the second nib. Small: this is a second pass over a drawing, not a second drawing. |
| `grain` | number | `0.4` | 0 to 1 | Paper tooth under the marks. |
| `touch` | number | `0.65` | 0 to 1 | How much tone the cursor works up under itself. Tone is how many marks there are, so this is the hand adding marks, not a light being shone on the drawing. Zero leaves the field ambient. |
| `reach` | number | `0.45` | 0.05 to 1.5 | How far the hand reaches, as a share of the short side. The falloff is a Gaussian and has no edge to find, so this is where it has mostly faded rather than where it stops. |
| `period` | number | `18` | 2 to 120 | Seconds for one loop of the drift. The tone field travels a closed circle through noise space, so it returns to exactly where it began and the loop is seamless. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. `createStippleField` touches `document` and
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

This effect needs no care here. Any frame of it is a finished drawing, so the
default is as good as any other number.

The hand does not work under reduced motion. The runtime draws one frame and
never starts a loop, so there is nothing running to pick the pointer up. What
you get is a finished stipple drawing, which is the right thing to be left
with.

## 7. The three mistakes most likely to be made here

1. **Turning `weight` up to make it darker.** It makes every mark fatter, which
   is what a halftone does and what this is deliberately not. Density is the
   lever: lower `pitch` or raise `contrast`.

2. **Setting `jitter` to 0.** The grid reappears immediately and the whole thing
   reads as a cheap screen. If the marks look too chaotic the answer is a smaller
   `pitch`, not less jitter.

3. **A very small `pitch` on a full-width hero.** At three pixels a cell there
   are hundreds of thousands of cells and the marks are below what the eye
   resolves, so you have paid for a stipple and got a grey wash.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing. Give the host `position: fixed; inset: 0`, or an
   explicit height.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/stipple-field/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/stipple-field/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
