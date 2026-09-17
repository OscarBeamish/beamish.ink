## What it is

Riser brings a container's children in on a stagger. It is the plainest thing in
this library and the one most pages actually need.

There is no canvas, no WebGL and no npm dependency. It takes a container, finds
the children, and moves them.

There is no `IntersectionObserver` in it either, which is the part worth knowing.
The runtime already has one: it holds the loop until the element is on screen. So
calling `start()` on mount gives you a scroll-triggered reveal, and adding your
own observer on top would only fight it.

`destroy()` clears every style it set. The children are left as they were found.

## Wiring

**Plain HTML.**

```html
<div id="grid">
  <article>…</article>
  <article>…</article>
  <article>…</article>
</div>

<script type="module">
  import { createScrollRevealRows } from './beamish/effects/scroll-reveal-rows/core.js'

  const riser = createScrollRevealRows(document.querySelector('#grid'))
  riser.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createScrollRevealRows } from '@/beamish/effects/scroll-reveal-rows/core'

export function Grid({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const riser = createScrollRevealRows(host.current, { stagger: 90, rise: 34 })
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
import { createScrollRevealRows } from '@/beamish/effects/scroll-reveal-rows/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let riser: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  riser = createScrollRevealRows(host.value)
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

## Cleanup and SSR

`destroy()` clears opacity, transform, filter and `will-change` from every child,
cancels the RAF, and disconnects both observers. There is no GPU resource to
release.

The content renders on the server as ordinary markup and stays visible if the
JavaScript never arrives, because the styles are only applied on the first frame.
Call `createScrollRevealRows` from `useEffect`, `onMounted`, or a `client:*` island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For a one-shot reveal that default is 999, which is any time after the animation
has finished. The content simply appears. Do not set it to 0: that leaves the
whole container invisible for anyone who has asked for less motion, which is the
worst possible outcome of a motion preference.

## Common mistakes

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
