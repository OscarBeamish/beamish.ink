You are adding **PaperGrain** from Beamish to this project.

> The surface of a sheet of paper with nothing on it, lit by its own roughness. Backdrops · effect · MIT.
> https://beamish.ink/effects/paper-grain

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The image is a lighting calculation rather than a pattern. One noise field becomes a height, the height is differenced into a normal, and the normal meets one low light. Drawn as tone instead, the same field is a grey cloud that could be anything
- Which field goes into the height and which goes into the tone is the whole shape of this rather than a detail. Only the fibre is surface. Formation is a density, so it changes how much light comes back and not which way the sheet faces, and it belongs in the tone: put both in the height, which is the obvious way to write it, and the broad field contributes almost nothing while the fine fibre dominates the derivative. The first version of this was rough-cast plaster
- The fibre is stretched along the machine direction, because stock runs in a direction on a paper machine and the fibres lie along it. Isotropic noise is the single thing that stops a paper texture reading as paper: the sheets that really are isotropic are the handmade ones, and they look like felt
- The tooth is smaller than a pixel, so it is in neither the height nor the tone. It is a flicker added to the light and weighted by how much the light rakes, because roughness you cannot resolve only shows as sparkle in grazing light. Raise `light` towards overhead and it goes flat, which is what happens to real paper under a ceiling light
- Nothing in the paper moves. The light swings through a few degrees and back. Grain that crawls is film grain, which is a different effect and a far noisier one: measured at 0.013 mean absolute change per frame on a 0 to 255 scale, this is the quietest thing in the library by a factor of several
- The normal is differenced over exactly one CSS pixel and divided by that step, so it is a slope rather than a difference and `relief` means the same thing at every canvas size. A shorter step samples detail the screen cannot resolve, which comes back as sparkle that changes when the canvas is resized
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/paper-grain/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/paper-grain/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

PaperGrain is the surface of a sheet of paper, with nothing on it. Not a pattern laid
over a background: the paper is the subject, and what you are looking at is
light falling across its own roughness.

Three things make a surface read as paper rather than as noise, and leaving any
one of them out gives you grey static.

**Fibre.** A sheet is a mat of fibres, and on a machine-made sheet they lie more
along one axis than the other, because the stock runs in a direction. So the
noise is stretched along that axis rather than isotropic. This is the machine
direction, and it is why a sheet tears cleanly one way and raggedly the other.

**Formation.** Hold a sheet up to a window and you see cloud: the fibre is not
spread evenly, and the patches are far larger than the fibres themselves.
Papermakers call it formation, or look-through, and it is what separates good
stock from newsprint.

**PaperGrain.** The micro-roughness that takes the ink, and the thing the effect is
named after. Too small to see as shape, so it shows only as a flicker in the
light, and only where the light is raking.

Which of those goes into the surface and which goes into the tone is the whole
shape of this effect rather than a detail of it. Only the fibre is surface: it
is differenced into a normal and lit. Formation is a density, so it changes how
much light comes back rather than which way the sheet faces, and it belongs in
the tone. The tooth is smaller than a pixel, so it is in neither, and it is
added to the light.

Get that wrong and no amount of tuning will save it. The first version of this
put both fields in the height, which is the obvious way to write it, and the
result was rough-cast plaster: the broad field contributed nothing, because a
broad field has almost no slope, and the fine fibre dominated the derivative.

## 3. Wire it in

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<div id="sheet" style="height: 100vh"></div>

<script type="module">
  import { createPaperGrain } from './beamish/effects/paper-grain/core.js'

  const sheet = createPaperGrain(document.querySelector('#sheet'))
  sheet.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createPaperGrain } from '@/beamish/effects/paper-grain/core'

export function Sheet() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sheet = createPaperGrain(host.current, { light: 0.14 })
    sheet.start()
    return () => sheet.destroy()
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
import { createPaperGrain } from '@/beamish/effects/paper-grain/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sheet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sheet = createPaperGrain(host.value)
  sheet.start()
})

onBeforeUnmount(() => sheet?.destroy())
</script>

<template>
  <div ref="host" class="sheet" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#f7f5ed` | any CSS hex | The stock. A warm white, because a true white sheet is a thing almost nobody prints on: it is bleached, it is colder than the ink wants, and on a screen it leaves the lighting nowhere to go above it. |
| `fibre` | color | `#fffdf6` | any CSS hex | What the sheet is tinted towards where the fibre lies thickest. Close to the stock on purpose. The difference between the two is doing the same job as the difference between two whites in a real sheet, which is to say it should be almost nothing. |
| `scale` | number | `340` | 40 to 600 (looks right between 240 and 460) | Fibres across the short side. Higher is a finer, harder sheet; lower is closer to a heavy rag paper, where the fibre is visible as fibre rather than as texture. |
| `direction` | number | `12` | -90 to 90 deg | The machine direction: the axis the fibre lies along, and the axis a sheet tears cleanly down. Slightly off square is better than square, for the same reason a halftone screen is set at an angle. |
| `stretch` | number | `3.4` | 1 to 8 (looks right between 2.5 and 5) | How far the fibre is drawn out along that axis. At 1 there is no direction at all, which is a handmade sheet, and handmade sheets read as felt rather than as paper. |
| `formation` | number | `0.55` | 0 to 1.5 | Strength of the cloud: the uneven spread of fibre you see when a sheet is held up to a window. Papermakers judge stock by it. It works on the tone rather than on the surface, because it is a density and not a shape. At 0 the sheet is perfectly even, which no sheet is. |
| `tooth` | number | `0.5` | 0 to 1.5 | The micro-roughness that takes the ink, which is what a printer means by the tooth of a paper. It is in the light rather than in the surface, so it fades as the light rises: that is not a shortcut, it is what grazing light does to a rough surface. |
| `light` | number | `0.18` | 0 to 1 (looks right between 0.08 and 0.35) | Height of the light. 0 rakes along the surface and 1 is straight down on it. Low, always: this is a flat sheet, and the only thing that can make a flat sheet interesting is light arriving across it rather than onto it. |
| `relief` | number | `0.6` | 0.05 to 2 | How strongly the surface is lit by its own slope. Past about 1.5 the sheet stops being paper and becomes hammered metal, which is a real effect and not this one. |
| `sweep` | number | `26` | 0 to 120 deg (looks right between 12 and 45) | Degrees the light swings over one period, and the only moving thing here. At 0 it is a still image, which is a perfectly good way to use this and the quietest thing in the library. |
| `shive` | number | `0.35` | 0 to 2 | Specks of fibre the beater did not break down. Papermakers call it shive, and it is the one thing here that is a mark rather than a surface. Sparse on purpose: a sheet with visible shive all over it is a sheet nobody bought. |
| `period` | number | `36` | 12 to 180 s | Seconds for one swing of the light and back. Long, because this sits behind something else and a backdrop has to survive being ignored. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createPaperGrain` from `useEffect`, `onMounted`, or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For this item that frame is a complete image: the paper does not move, only the
light does, so the still frame is the effect with its one moving part stopped.
That is the rare case where reduced motion costs the viewer nothing.

## 7. The three mistakes most likely to be made here

1. **Putting the cloud in the height.** It contributes almost nothing, because a
   broad field has almost no slope, and it leaves the fine fibre dominating the
   derivative. The sheet comes out as plaster. Formation is a density; it
   belongs in the tone.

2. **Isotropic noise.** Paper has a grain direction. Noise without one reads as
   felt, which is what handmade sheets actually look like and not what anybody
   means by paper.

3. **Raising `relief` to make it more visible.** The way to make paper more
   visible is to lower the light, not to deepen the surface. A sheet with deep
   relief is not a sheet.

4. **Animating the grain.** Grain that crawls is film grain. It is a different
   effect, it is far noisier, and it will make a page unreadable. Only the light
   moves here, and `sweep: 0` stops even that.

5. **Differencing the normal over a step smaller than a pixel.** It samples
   detail the screen cannot resolve and comes back as sparkle that changes when
   the canvas is resized. The step is one CSS pixel, and it is divided out so
   `relief` means the same thing at every size.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/paper-grain/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/paper-grain/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
