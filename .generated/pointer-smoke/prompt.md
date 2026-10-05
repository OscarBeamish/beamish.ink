You are adding **PointerSmoke** from Beamish to this project.

> Smoke off the cursor, spreading and thinning as it drifts. Pointer · effect · MIT.
> https://beamish.ink/effects/pointer-smoke

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- An older puff is wider and fainter than a new one, because nothing holds smoke together. That is the opposite of a particle trail, where older means smaller
- The puffs multiply rather than compositing, so two that overlap are denser than either
- Every puff carries its own age in seconds rather than taking it from its place in the list. The list version worked out to one puff per frame, which left a third of a second of smoke on a 60Hz display and a sixth on a 120Hz one
- A trail needs history, which is not a function of t. When pointerPath is set the whole track is known in advance and the trail is read backwards off it instead of accumulated, so a recorded take is identical however the frames are asked for. A live pointer keeps its own stamps
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
| `src/beamish/effects/pointer-smoke/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pointer-smoke/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Smoke off the cursor, spreading and thinning as it drifts.

Not a comet and not a glow. A puff of smoke does two things while it hangs
there. It **widens**, because nothing is holding it together. And it **thins**,
because the same amount of it is spread over more room. So an older puff is
bigger and fainter than a new one, which is the opposite of a particle trail,
where older means smaller, and it is the single thing that makes this read as
smoke rather than as a cursor with a tail.

The puffs multiply rather than compositing, so two that overlap are denser than
either. What warmth there is sits at the head, where the smoke has not yet had
room to spread.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## 3. Wire it in

**Plain HTML.** The element needs a size of its own.

```html
<div id="sheet" style="position: relative; height: 70vh"></div>

<script type="module">
  import { createPointerSmoke } from './beamish/effects/pointer-smoke/core.js'

  const trail = createPointerSmoke(document.querySelector('#sheet'))
  trail.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createPointerSmoke } from '@/beamish/effects/pointer-smoke/core'

export function Sheet() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const trail = createPointerSmoke(host.current)
    trail.start()
    return () => trail.destroy()
  }, [])

  return <div ref={host} className="sheet" />
}
```

Do not put option values in the dependency array. Call `update()` instead: every
option is a uniform, so nothing rebuilds.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createPointerSmoke } from '@/beamish/effects/pointer-smoke/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let trail: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  trail = createPointerSmoke(host.value)
  trail.start()
})

onBeforeUnmount(() => trail?.destroy())
</script>

<template>
  <div ref="host" class="sheet" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper the smoke drifts over. |
| `smoke` | color | `#b4afa4` | any CSS hex | The body of it, once it has spread. Keep it close to the paper: smoke is the absence of a clear view, not a dark shape, and a strong colour here reads as paint. |
| `accent` | color | `#bfae9e` | any CSS hex | What warmth the freshest smoke carries, at the head of the trail. Only a little of the trail is ever this, so a saturated colour shows up as a bead following the cursor. |
| `marks` | number | `28` | 2 to 28 | How many puffs the trail holds. The shader has room for 28; asking for more silently gives you 28, because the array is a fixed size and growing it means editing the shader as well. |
| `size` | number | `0.026` | 0.005 to 0.2 | Radius of a fresh puff, as a share of the short side, so it keeps its proportion when the element changes shape. |
| `spread` | number | `2.4` | 0 to 4 | How much wider a puff gets by the end of its life. Nothing holds smoke together, so this is the main thing that makes it read as smoke rather than as a cursor with a tail. At 0 you get a row of identical discs. |
| `fade` | number | `2.4` | 0.2 to 6 | How quickly a puff gives up. Higher is a shorter trail with a cleaner end; lower leaves a tail that hangs about. |
| `edge` | number | `0.95` | 0 to 1 | How much of a puff is its soft shoulder rather than its body. Smoke has no edge at all, so this wants to be near 1; at 0 you get plates of grey. |
| `life` | number | `0.45` | 0.1 to 3 | Seconds a puff lasts, which is the length of the trail. This is measured in time rather than in frames, so the same gesture leaves the same trail on a 60Hz display and a 144Hz one. Past about a second the smoke starts to read as something heavy being dragged behind the cursor. |
| `grain` | number | `0.4` | 0 to 1 | Paper tooth under the smoke. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener including the window-scoped pointer one.
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

With no pointer the smoke is not drawn at all, so what you get is a clean sheet.
That is the right resting state: a trail with nothing having moved would be a
picture of a gesture nobody made.

## 7. The three mistakes most likely to be made here

1. **Setting `spread` to 0.** You get a row of identical discs. The widening is
   what makes it smoke; without it this is a cursor with a tail and there are
   simpler ways to draw one.

2. **Raising `marks` past 28 and wondering why nothing changes.** The shader
   array is a fixed size. The constant is named in both files and they have to
   move together.

3. **Reaching for `life` to make it calmer.** A longer life is a longer trail,
   not a gentler one. `size` and `spread` are the two that decide how much of
   the panel it covers.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pointer-smoke/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pointer-smoke/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
