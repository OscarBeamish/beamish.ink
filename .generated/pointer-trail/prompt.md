You are adding **PointerTrail** from Beamish to this project.

> Marks pressed into the paper behind the cursor, spreading as they soak in. Pointer · effect · MIT.
> https://beamish.ink/effects/pointer-trail

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- An older mark is wider and paler than a new one, because paper draws ink sideways along its fibres while it sinks in. That is the opposite of a particle trail, where older means smaller
- The marks multiply rather than compositing, so two that overlap are darker than either
- A trail needs history, which is not a function of t. When pointerPath is set the whole track is known in advance and the trail is read backwards off it instead of accumulated, so a recorded take is identical however the frames are asked for. A live pointer falls back to a ring buffer
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
| `src/beamish/effects/pointer-trail/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pointer-trail/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Marks pressed into the paper behind the cursor, spreading as they soak in.

Not a comet and not a glow. A nib touching down repeatedly leaves a row of blots,
and each one does two things while it sits there. It **spreads**, because the
paper draws the ink sideways along its fibres. And it **lightens**, because the
ink is sinking in. So an older mark here is wider and paler than a new one, which
is the opposite of a particle trail, where older means smaller, and it is the
single thing that makes this read as ink rather than as a cursor with a tail.

The marks multiply rather than compositing, so two that overlap are darker than
either. The head of the trail carries the accent, because ink that has only just
landed has not had time to sink.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## 3. Wire it in

**Plain HTML.** The element needs a size of its own.

```html
<div id="sheet" style="position: relative; height: 70vh"></div>

<script type="module">
  import { createPointerTrail } from './beamish/effects/pointer-trail/core.js'

  const trail = createPointerTrail(document.querySelector('#sheet'))
  trail.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. StrictMode runs the effect
twice in development, which is fine, because `destroy()` fully releases the
context.

```tsx
import { useEffect, useRef } from 'react'
import { createPointerTrail } from '@/beamish/effects/pointer-trail/core'

export function Sheet() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const trail = createPointerTrail(host.current)
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
import { createPointerTrail } from '@/beamish/effects/pointer-trail/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let trail: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  trail = createPointerTrail(host.value)
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
| `paper` | color | `#fbfaf4` | any CSS hex | The sheet the marks are pressed into. |
| `ink` | color | `#8d8577` | any CSS hex | Ink that has soaked in. Most of the trail is this. |
| `accent` | color | `#c44400` | any CSS hex | Ink that has only just landed, at the head of the trail. |
| `marks` | number | `22` | 2 to 28 | How many marks the trail holds. The shader has room for 28; asking for more silently gives you 28, because the array is a fixed size and growing it means editing the shader as well. |
| `size` | number | `0.032` | 0.005 to 0.2 | Radius of a fresh mark, as a share of the short side, so it keeps its proportion when the element changes shape. |
| `spread` | number | `1.6` | 0 to 4 | How much wider a mark gets by the end of its life. Paper draws ink sideways along its fibres, so an old mark is bigger than a new one. This is the opposite of a particle trail and it is the main thing that makes it read as ink. |
| `fade` | number | `1.8` | 0.2 to 6 | How quickly a mark gives up. Higher is a shorter trail with a harder end; lower leaves a long tail that never quite goes. |
| `edge` | number | `0.85` | 0 to 1 | How much of a mark is its soft shoulder rather than its body. Ink on a fibrous surface has no edge to speak of, so this wants to be high; at 0 you get discs. |
| `spacing` | number | `0.035` | 0.005 to 0.2 | Seconds between one mark and the next when the trail is replayed from a scripted path. It has no effect on a live pointer, where one mark is laid per frame. |
| `grain` | number | `0.4` | 0 to 1 | Paper tooth under the marks. |

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

With no pointer the trail is not drawn at all, so what you get is a clean sheet.
That is the right resting state: a trail with nothing having moved would be a
drawing of a gesture nobody made.

## 7. The three mistakes most likely to be made here

1. **Setting `spread` to 0.** You get a row of identical discs. The widening is
   what makes it ink; without it this is a cursor with a tail and there are
   simpler ways to draw one.

2. **Raising `marks` past 28 and wondering why nothing changes.** The shader
   array is a fixed size. The constant is named in both files and they have to
   move together.

3. **Expecting the live trail to match the recording exactly.** Live lays one
   mark per frame; a scripted path lays one per `spacing`. They are the same
   length only if `spacing` matches the frame interval.

4. **Mounting it into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and renders nothing.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pointer-trail/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pointer-trail/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
