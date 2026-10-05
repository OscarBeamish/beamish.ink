You are adding **WatermarkSheet** from Beamish to this project.

> Handmade paper held up to the light, with laid lines, chain lines and a wire device. Backdrops · effect · MIT.
> https://beamish.ink/effects/watermark-sheet

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Everything here is thickness rather than ink. Paper is translucent, so what shows against a light is where the sheet is thinner, and every term lightens rather than darkens
- Laid lines are a ripple and chain lines are a band, because a sheet follows fine wires and is drawn down sharply over thick ones
- The device is drawn as a signed distance, so the wire keeps an even thickness all the way round, which a wire does
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
| `src/beamish/effects/watermark-sheet/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/watermark-sheet/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

A sheet of handmade paper held up to the light.

Everything here is thickness. Paper is translucent, so what you see against a
light is not ink but where the sheet is thinner and lets more through. That is
the whole premise, and it is why nothing in this effect darkens: every term
lightens the paper, because every term is somewhere the paper is thinner.

Three of them come from the mould the sheet was formed on, not from the pulp.
The **laid lines** are its close-set wires, so the sheet is very slightly thinner
over each one. The **chain lines** are the heavier wires at right angles holding
those together, an inch or so apart. And the **formation** is the cloudiness:
fibres never settle evenly, and that blotchy variation is most of what separates
a handmade sheet from a machine one.

The fourth is the watermark proper, a wire device sewn onto the mould. The sheet
is much thinner there, which is why a watermark is brighter than everything
around it and why it only shows against a light.

Laid lines are drawn as a ripple and chain lines as a band, which is not an
arbitrary difference. A forming sheet follows fine wires and is drawn down
sharply over thick ones.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## 3. Wire it in

**Plain HTML.** The element needs a size of its own.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createWatermarkSheet } from './beamish/effects/watermark-sheet/core.js'

  const sheet = createWatermarkSheet(document.querySelector('#backdrop'), {
    period: 60
  })
  sheet.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createWatermarkSheet } from '@/beamish/effects/watermark-sheet/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sheet = createWatermarkSheet(host.current, { period: 60 })
    sheet.start()
    return () => sheet.destroy()
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
import { createWatermarkSheet } from '@/beamish/effects/watermark-sheet/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let sheet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sheet = createWatermarkSheet(host.value, { period: 60 })
  sheet.start()
})

onBeforeUnmount(() => sheet?.destroy())
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
| `paper` | color | `#efede7` | any CSS hex | The sheet seen front on, before any light comes through it. Slightly deeper than the page, so there is somewhere for the thin parts to brighten into. |
| `light` | color | `#fffdf6` | any CSS hex | What comes through where the sheet is thinnest. Everything here lightens toward this; nothing darkens, because every feature is somewhere the paper is thinner. |
| `laid` | number | `0.18` | 0 to 1 | How much light the close-set mould wires let through. A ripple rather than hard lines: the sheet follows fine wires rather than being drawn down over them. |
| `laidPitch` | number | `210` | 40 to 600 | Laid wires across the sheet. A real mould has them roughly a millimetre apart, so this wants to be high enough that they are a texture rather than a pattern. |
| `chain` | number | `0.3` | 0 to 1 | How much light the heavy cross wires let through. A narrow band rather than a ripple, because the sheet is drawn down sharply over a thick wire. |
| `chainPitch` | number | `1.6` | 0.3 to 8 | Chain wires across the sheet. Rarely more than a handful: they sit about an inch apart on a real mould, and crowding them is the quickest way to stop it looking like paper. |
| `formation` | number | `0.5` | 0 to 1.5 | How unevenly the fibres settled. This is most of what separates a handmade sheet from a machine one, and at 0 you have made cartridge paper. |
| `cloud` | number | `2.4` | 0.3 to 10 | Size of the cloudiness. Lower is a coarser, blotchier sheet. |
| `device` | number | `0.45` | 0 to 1 | How brightly the wire device shows. The sheet is much thinner there than anywhere else, so it is the brightest thing present. Zero for a plain laid sheet with no watermark. |
| `deviceSize` | number | `0.26` | 0.05 to 0.6 | Size of the device, as a share of the short side. |
| `angle` | number | `4` | -45 to 45 | Angle of the mould to the frame. A few degrees off square, because a sheet is not laid down obediently aligned to anything. |
| `grain` | number | `0.35` | 0 to 1 | Paper tooth over the whole thing. |
| `period` | number | `16` | 4 to 180 | Seconds for one slow tilt against the light. Nothing moves on the sheet; the sheet moves. A closed orbit, so it returns to exactly where it began. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. `createWatermarkSheet` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable. `stop()` and `start()` are on the handle for that. Surface them as a
real control in your own build. Reduced motion does not cover this, and plenty of
people who need a pause button have not set that preference.

The movement is very slow by default, a full tilt taking sixteen seconds. That
does not exempt it.

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`.

Any frame of this is a sheet of paper, so the default is as good as any other
number.

## 7. The three mistakes most likely to be made here

1. **Leaving `paper` the same colour as the page.** Everything here lightens, so
   a sheet that already matches the page has nothing to brighten into and the
   whole effect disappears. Go a shade or two deeper.

2. **Raising `chainPitch` for more texture.** Chain wires sit an inch apart on a
   real mould. Crowding them is the single fastest way to stop it reading as
   paper. If you want more texture, that is `laidPitch`.

3. **Setting `formation` to 0.** You have made cartridge paper. The unevenness is
   the handmade part.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing. Give the host `position: fixed; inset: 0`, or an
   explicit height.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/watermark-sheet/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/watermark-sheet/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
