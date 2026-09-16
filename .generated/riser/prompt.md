You are adding **Riser** from Beamish to this project.

> Children arrive on a stagger, held until the container is on screen. Reveals · effect · MIT.
> https://beamish.ink/effects/riser

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. It moves the children already in the element
- No IntersectionObserver of its own: the runtime already holds the loop until the element is on screen
- destroy() clears every style it set, leaving the children as they were found
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/riser/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/riser/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Riser brings a container's children in on a stagger. It is the plainest thing in
this library and the one most pages actually need.

There is no canvas, no WebGL and no npm dependency. It takes a container, finds
the children, and moves them.

There is no `IntersectionObserver` in it either, which is the part worth knowing.
The runtime already has one: it holds the loop until the element is on screen. So
calling `start()` on mount gives you a scroll-triggered reveal, and adding your
own observer on top would only fight it.

`destroy()` clears every style it set. The children are left as they were found.

## 3. Wire it in

**Plain HTML.**

```html
<div id="grid">
  <article>…</article>
  <article>…</article>
  <article>…</article>
</div>

<script type="module">
  import { createRiser } from './beamish/effects/riser/core.js'

  const riser = createRiser(document.querySelector('#grid'))
  riser.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createRiser } from '@/beamish/effects/riser/core'

export function Grid({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const riser = createRiser(host.current, { stagger: 90, rise: 34 })
    riser.start()
    return () => riser.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

If the children are fetched and the list changes length, destroy and remount. The
selection is taken once, on the first frame.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createRiser } from '@/beamish/effects/riser/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let riser: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  riser = createRiser(host.value)
  riser.start()
})

onBeforeUnmount(() => riser?.destroy())
</script>

<template>
  <div ref="host"><slot /></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Playing it again.** Riser runs once from `t = 0`:

```ts
riser.stop()
riser.renderAtTime(0)
riser.start()
```

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `select` | string | `` | any value | CSS selector for the children to animate, scoped to the container. Empty means every direct child, which is what you want most of the time. |
| `order` | enum | `forward` | `forward` · `reverse` · `centre` | The order children arrive in. `centre` starts in the middle and works outwards, which suits a row of three or five. |
| `stagger` | number | `90` | 0 to 400 ms (looks right between 60 and 140) | Milliseconds between one child and the next. Past about 150 a list of eight takes over a second to finish and people start scrolling away from it. |
| `duration` | number | `900` | 100 to 3000 ms (looks right between 600 and 1100) | Milliseconds each child takes on its own. |
| `rise` | number | `34` | -120 to 120 px (looks right between 20 and 50) | How far each child travels. Negative falls from above. Large values read as a page that has not finished loading. |
| `scale` | number | `1` | 0.5 to 1.5 (looks right between 0.94 and 1.06) | Scale each child starts at. 1 is no scaling. Anything below 0.9 makes text resample and look soft on the way in. |
| `blur` | number | `0` | 0 to 20 (looks right between 0 and 6) | Blur each child starts at. Off by default: on a card with an image inside, a blur costs far more than the transform does. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot reveal this should be a time after the animation has finished, so the content simply appears. |

## 5. Cleanup and SSR

`destroy()` clears opacity, transform, filter and `will-change` from every child,
cancels the RAF, and disconnects both observers. There is no GPU resource to
release.

The content renders on the server as ordinary markup and stays visible if the
JavaScript never arrives, because the styles are only applied on the first frame.
Call `createRiser` from `useEffect`, `onMounted`, or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For a one-shot reveal that default is 999, which is any time after the animation
has finished. The content simply appears. Do not set it to 0: that leaves the
whole container invisible for anyone who has asked for less motion, which is the
worst possible outcome of a motion preference.

## 7. The three mistakes most likely to be made here

1. **Adding your own `IntersectionObserver`.** The runtime has one. Yours will
   start the loop while the element is offscreen, the animation will finish
   before anyone sees it, and the content will simply be there when they scroll
   down.

2. **Mounting it on a container whose children arrive later.** The selection is
   taken on the first frame. If the list is fetched, mount after the data lands,
   or destroy and remount when it changes.

3. **Setting `reducedMotionTime` to 0.** That is the frame before anything has
   arrived, so the content stays invisible. It wants to be a time after the
   animation ends.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/riser/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/riser/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
