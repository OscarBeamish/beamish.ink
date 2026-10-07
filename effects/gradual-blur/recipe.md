## What it is

GradualBlur puts a band at the edge of a scrolling area where the content goes
progressively out of focus before it runs off. Haze, rather than a fade to the
background colour. A fade tells you the text has stopped; a haze tells you it
has not.

The obvious way to build it does not work, and it is worth saying why, because
the failure looks like a bug in the browser rather than a mistake of yours.

One element, a `backdrop-filter` and a gradient mask gives you a band of **fully
blurred** content whose *opacity* ramps away. Masking a blur fades how much of
the blurred layer you can see. It does nothing at all to how blurred it is. So
there is a hard edge where the blur starts, and no amount of softening the mask
will move it, because the edge is not in the mask.

A blur that actually ramps has to be made of several blurs. Each layer here
blurs twice as hard as the one below it and is masked to its own band, and
because a `backdrop-filter` sees everything painted beneath it, including the
previous layers, the blurs compound.

The doubling is what makes six layers enough. A linear ramp over the same range
needs dozens before the steps stop showing, and every one of them is another
backdrop filter for the compositor.

## Wiring

**Plain HTML.** Put it on the scrolling element, not on the thing inside it. A
`backdrop-filter` blurs what is painted beneath it, so the content has to be
behind the band.

```html
<div id="list" style="position: relative; overflow: auto; height: 400px">
  <!-- a long column of content -->
</div>

<script type="module">
  import { createGradualBlur } from './beamish/effects/gradual-blur/core.js'

  const haze = createGradualBlur(document.querySelector('#list'), {
    edge: 'bottom'
  })
  haze.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createGradualBlur } from '@/beamish/effects/gradual-blur/core'

export function Scroller({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const haze = createGradualBlur(host.current, { edge: 'bottom', wash: 0 })
    haze.start()
    return () => haze.destroy()
  }, [])

  return (
    <div ref={host} style={{ overflow: 'auto', position: 'relative' }}>
      {children}
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createGradualBlur } from '@/beamish/effects/gradual-blur/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let haze: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  haze = createGradualBlur(host.value)
  haze.start()
})

onBeforeUnmount(() => haze?.destroy())
</script>

<template>
  <div ref="host" class="scroller"><slot /></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Which edge, and whether it is always there

The foot of a scrolling panel is the one that earns its keep: it says the text
continues. At the top it usually competes with whatever header is already there.

`follow` brings the haze in as the element is scrolled rather than leaving it on
always, and for a top edge that is the honest setting. There is nothing above a
list until it has been scrolled, and a haze over nothing is a smudge on the
glass.

## Blur and wash are different things

`strength` is the blur at the very edge, and everything between there and the
far side of the band is a fraction of it. `wash` is a separate layer of colour
over the top.

On paper, `wash: 0` is usually right: the blur alone is the effect. Over a dark
photograph it wants some, or the blurred content stays exactly as dark as it was
and nothing reads as distance. Take the tint out of the image rather than
reaching for white.

## Cost

The stack is built once and rebuilt only when its shape changes. Per frame there
is at most one opacity write, and none at all when `follow` is off.

The cost that matters is the compositor's: every layer is a `backdrop-filter`
over the same region of the screen. Six is a deliberate ceiling, and the
doubling is what buys the range without raising it. If you need a longer ramp,
raise `depth`, not `layers`.

## Cleanup and SSR

`destroy()` removes the band and puts the element's `position` back. There is no
GPU resource of ours to release, though the compositor will drop its layers.

Nothing renders on the server, and nothing needs to: the element's own content
is untouched. Call `createGradualBlur` from `useEffect`, `onMounted`, or a
`client:*` island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
one frame is drawn, at `reducedMotionTime`, which here is 0.

The haze itself is not motion: it is a static band, and it stays. Only the
`follow` fade would have moved, and under reduced motion it simply settles at
its starting value.

## Common mistakes

1. **One blurred element with a gradient mask.** It ramps the opacity, not the
   blur, and leaves a hard edge where the blur begins. This is the mistake the
   whole item exists to avoid.

2. **A linear ramp of blur values.** The steps show. Doubling each layer is what
   makes a handful of them enough.

3. **Butting the bands together.** Faint seams, which on a pale page read as
   printing bands. The bands here overlap by one step on each side.

4. **Mounting it on the content instead of the scroller.** A `backdrop-filter`
   blurs what is painted beneath it, so the band has to be a sibling that sits
   over the content, inside the element that clips it.

5. **Raising `layers` to get a longer ramp.** Length is `depth`. Layers only buy
   smoothness, and past about eight you are paying the compositor for a
   difference nobody can see.
