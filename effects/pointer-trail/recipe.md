## What it is

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

## How it stays recordable

A trail needs history, and history is not a function of `t`. That is a problem,
because `renderAtTime` is supposed to give the same answer every time it is asked
for a frame, and the recorder relies on it.

The way out is that when a scripted path is supplied the history is already
known. With `pointerPath` set, mark `i` is simply where the cursor was at
`t - i * spacing`, read straight off the path. No accumulation, pure in `t`, and
a recorded take is identical however the frames are asked for.

With a live pointer there is no path to read, so it keeps a ring buffer and lays
one mark per frame. That is not pure, and it does not need to be: nothing is
replaying a live cursor.

One consequence worth knowing. `spacing` only applies to the scripted case. Live,
the trail is one mark per frame, so it spans `marks` frames of real time, which
is about a third of a second at the default count. If you want the recording to
match what people see, leave `spacing` at roughly the recorder's frame interval.

## Wiring

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

## Tuning it

`spread` is the one that matters and the one most likely to be set wrong out of
habit. It is how much **wider** an old mark gets, and turning it down to zero
gives you a row of identical discs, which is a cursor trail rather than ink.

`marks` is capped at 28, because the positions are a fixed-size array uniform in
the shader. Asking for more silently gives you 28. Raising the ceiling means
editing the `MARKS` constant in both the shader and the core, which are kept
equal on purpose and documented in both places.

`edge` wants to stay high. Ink on a fibrous surface has no edge to speak of, and
at 0 you get hard discs that read as plastic.

## Pausing

Nothing moves unless the cursor does, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

## Reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn.

With no pointer the trail is not drawn at all, so what you get is a clean sheet.
That is the right resting state: a trail with nothing having moved would be a
drawing of a gesture nobody made.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener including the window-scoped pointer one.
Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## Common mistakes

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
