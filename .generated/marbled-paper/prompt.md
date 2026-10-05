You are adding **MarbledPaper** from Beamish to this project.

> Ink floated on size, dropped and then raked, the way marbled endpapers are made. Backdrops · effect · MIT.
> https://beamish.ink/effects/marbled-paper

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Every marbling operation has a closed-form inverse, so each pixel runs the session backwards instead of the tray being simulated forwards. One pass, no render targets, no feedback
- The drop loop runs backwards and stops at the first drop that contains the point, so raising the count costs much less than it looks like it should
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/marbled-paper/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/marbled-paper/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Ink floated on size, dropped, and then raked. The pattern on a marbled endpaper,
made the way the endpaper was.

This is not noise dressed up as marbling. Every operation a marbler performs on a
tray has a closed-form inverse, and that single fact is what the whole effect
rests on. A drop of ink pushes everything already floating outward by an exact
amount, conserving area. A comb drawn through displaces points along its own
direction by an amount that depends only on how far from it they sit, so the
displacement never changes the quantity the displacement was computed from. Both
undo in one step, with no iteration and no search.

So the tray is never simulated forwards. Each pixel runs the session backwards:
undo the combs, then undo the drops one at a time from the last to the first, and
the moment the point falls inside a drop you know which ink it was. That is the
colour. One pass, no render targets, no feedback, no history, and the result is
exact rather than approximated.

It gives the rings away for free, too. A drop laid down later pushes an earlier
one into an annulus around itself, and walking the operations backwards
reproduces that instead of having to draw it.

Measured at 0.42ms for one drop and 0.64ms for seventy-two, at 1440 by 900 on an
RTX 3080. The count costs far less than it looks like it should, because the loop
stops at the first drop that claims the point.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## 3. Wire it in

**Plain HTML.** The element needs a size of its own.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createMarbledPaper } from './beamish/effects/marbled-paper/core.js'

  const marbled = createMarbledPaper(document.querySelector('#backdrop'), {
    drops: 44,
    period: 60
  })
  marbled.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createMarbledPaper } from '@/beamish/effects/marbled-paper/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const marbled = createMarbledPaper(host.current, { period: 60 })
    marbled.start()
    return () => marbled.destroy()
  }, [])

  return <div ref={host} className="fixed inset-0 -z-10" />
}
```

Do not put option values in the dependency array. Call `update()` instead: every
option is a uniform, so nothing rebuilds, not even the drop count.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createMarbledPaper } from '@/beamish/effects/marbled-paper/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let marbled: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  marbled = createMarbledPaper(host.value, { period: 60 })
  marbled.start()
})

onBeforeUnmount(() => marbled?.destroy())
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
| `paper` | color | `#fbfaf4` | any CSS hex | The size in the tray, and what shows wherever no ink reached. Match it to the page behind or the margins read as a panel. |
| `ink` | color | `#36362f` | any CSS hex | The main ink. Roughly two thirds of the drops are this, or this thinned toward the paper, which is what a second pass of one colour looks like once the first has spread. |
| `accent` | color | `#c44400` | any CSS hex | The second ink, on roughly a third of the drops. |
| `drops` | number | `44` | 1 to 72 | How many drops go into the tray. Each one pushes every earlier one outward, so this sets the density of the rings rather than just the amount of ink. |
| `scale` | number | `1` | 0.2 to 4 | How large the pattern reads. Higher zooms in on fewer, bigger shapes; lower pulls back and shows more of the tray, down to the paper margin round the edge of the ink. |
| `spread` | number | `0.95` | 0.1 to 2 | How far the drops are scattered. Low stacks them into a single rosette, which is the stone pattern; high covers the tray. |
| `size` | number | `0.17` | 0.05 to 0.8 | How big each drop is before anything pushes it. The ink conserves area, so the patch it finally covers is the sum of the drop areas: halving this and quadrupling the count gives the same coverage at four times the detail, which is the knob you actually want. |
| `rake` | number | `0.25` | 0 to 0.6 | How far the comb pulls the ink across. Zero leaves the drops as plain rings, which is a stone marble and a perfectly good thing to stop at. |
| `comb` | number | `9` | 0.5 to 30 | Teeth per unit across the comb. Higher is a finer comb and a tighter zigzag. |
| `swirl` | number | `0.12` | 0 to 0.4 | A second comb drawn at right angles to the first. Two passes crossed is how a gel-git pattern is made; leave it at zero for a single-direction nonpareil. |
| `grain` | number | `0.5` | 0 to 1 | Paper tooth over the whole thing. |
| `period` | number | `12` | 2 to 120 | Seconds for one pass of the comb. Both combs run whole multiples of the same angle, so the pattern returns to exactly where it started and the loop is seamless. Behind content, raise it. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createMarbledPaper` touches `document` and
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

This effect needs no care here. Any frame of it is a finished sheet of marbled
paper, which is a complete thing to look at, so the default is as good as any
other number.

## 7. The three mistakes most likely to be made here

1. **Raising `size` to cover more of the frame.** It works, and it also makes
   every shape bigger, so you end up with four enormous blobs. Coverage is the
   sum of the drop areas: raise `drops` instead and the pattern gets denser
   rather than coarser.

2. **Raising `rake` to make the comb more visible.** Past about 0.4 the ink
   shears into long smears and stops reading as a comb at all. If you cannot see
   it, `comb` is probably too low: a comb with two teeth across the whole frame
   looks like a wave rather than a comb.

3. **Using the default palette behind text.** Two of the three inks are near
   black. It is a cover.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing. Give the host `position: fixed; inset: 0`, or an
   explicit height.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/marbled-paper/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/marbled-paper/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
