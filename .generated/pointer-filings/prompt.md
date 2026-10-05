You are adding **PointerFilings** from Beamish to this project.

> Iron filings aligning to a magnetic field, with the cursor as the magnet. Pointer · effect · MIT.
> https://beamish.ink/effects/pointer-filings

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The real dipole expression, not spokes radiating from a point. Filings align with the field rather than pointing at the magnet, and a dipole field loops: out of one pole, round, and back into the other
- The field is sampled once per filing rather than per pixel. Per pixel each segment bends into a curve, which no single filing does
- Window pointer scope, so the filings have begun to turn before the cursor reaches the element
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
| `src/beamish/effects/pointer-filings/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pointer-filings/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Iron filings scattered over a magnet, and the magnet is the cursor.

Filings do not point at a magnet. That is the thing most versions of this get
wrong, and it is why most of them look like a starburst rather than like a
physics demonstration. Filings align with the **field**, and the field of a
dipole loops: out of one pole, round through the space beside it, and back into
the other. Spokes radiating from a point are what a single charge gives, and a
single magnetic charge is not a thing that exists.

So this evaluates the real expression. For a moment **m** at displacement **r**
the field runs along `3(m · r̂)r̂ − m`, and every mark is a short segment laid
along it. The loops are a consequence of the maths rather than something drawn.

The field is sampled once per filing, at the filing, not per pixel. Sampling per
pixel bends each segment into a little curve, which no single filing does: a
filing is a rigid sliver of iron and it can only be straight.

Near the magnet the dipole expression runs away to infinity, so the falloff is a
ratio rather than a product. It saturates at 1 instead of producing a handful of
enormous marks on top of each other at the centre.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## 3. Wire it in

**Plain HTML.** The element needs a size of its own.

```html
<div id="tray" style="position: relative; height: 70vh"></div>

<script type="module">
  import { createPointerFilings } from './beamish/effects/pointer-filings/core.js'

  const filings = createPointerFilings(document.querySelector('#tray'))
  filings.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createPointerFilings } from '@/beamish/effects/pointer-filings/core'

export function Tray() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const filings = createPointerFilings(host.current)
    filings.start()
    return () => filings.destroy()
  }, [])

  return <div ref={host} className="tray" />
}
```

Do not put option values in the dependency array. Call `update()` instead: every
option is a uniform, so nothing rebuilds.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createPointerFilings } from '@/beamish/effects/pointer-filings/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let filings: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  filings = createPointerFilings(host.value)
  filings.start()
})

onBeforeUnmount(() => filings?.destroy())
</script>

<template>
  <div ref="host" class="tray" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The tray the filings are scattered on. |
| `ink` | color | `#8d8577` | any CSS hex | A filing lying flat, out where the field is weak. |
| `accent` | color | `#36362f` | any CSS hex | A filing standing up in a strong field. The pattern reads as much from this change in tone as from the alignment. |
| `pitch` | number | `13` | 5 to 40 | Cell size in CSS pixels. There is one filing per cell, so this is how thickly they are scattered. |
| `length` | number | `0.42` | 0.1 to 1.2 | Length of a filing where the field is strongest, measured in cells. Past about 0.9 they overlap into continuous lines, which is a field diagram rather than a tray of filings. |
| `weight` | number | `0.055` | 0.01 to 0.2 | Half the thickness of a filing, in cells. |
| `reach` | number | `0.02` | 0.002 to 0.2 | How far the magnet reaches before the filings stop caring. The falloff saturates rather than multiplying, so close to the magnet the marks stand fully up instead of running away to a few enormous ones. |
| `jitter` | number | `0.6` | 0 to 1 | How far each filing is thrown off the centre of its cell. At 0 the grid they are organised by becomes visible, which no scattered tray has. |
| `tilt` | number | `0` | 0 to 360 | Angle of the bar magnet in degrees. Turns the whole pattern, the way turning the magnet on the bench would. |
| `grain` | number | `0.4` | 0 to 1 | Paper tooth under the filings. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener, including the window-scoped pointer one.
Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## 6. Pausing and reduced motion

Nothing moves unless the cursor does, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn.

With no pointer the magnet sits in the middle of the element and the marks are
drawn at reduced contrast, so what gets drawn is a settled tray rather than an
empty rectangle. Nobody has to have moved anything for it to look finished.

## 7. The three mistakes most likely to be made here

1. **Expecting it to point at the cursor.** It does not, and that is correct. If
   you want spokes you want a monopole, which means not using a dipole
   expression at all.

2. **Raising `length` to make the pattern clearer.** It joins the marks into
   lines. The field is read from the alignment of separate marks; once they touch
   you have drawn the field instead of showing it. Raise `pitch` instead and the
   whole thing scales.

3. **A very small `pitch` on a large element.** At five pixels a cell on a
   full-width hero there are hundreds of thousands of filings, each a dipole
   evaluation, and the marks are too small to show their own direction.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pointer-filings/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pointer-filings/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
