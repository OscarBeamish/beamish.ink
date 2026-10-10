## What it is

IrisReveal is a camera iris opening on whatever is behind it.

## An iris is not a circle growing

A diaphragm is a ring of overlapping blades, and the hole they leave is a
**polygon with as many sides as there are blades**. Five blades give a pentagon.
Nine give something close to a circle but not a circle. Anybody who has seen an
out-of-focus highlight in a photograph has seen this shape, which is why a
growing circle reads as a spotlight and a growing heptagon reads as a lens.

Two details carry the rest:

**The opening turns.** The blades swing through their travel, so the whole hole
rotates as it opens. On a real lens that is a consequence of the mechanism
rather than a decision, and `swing: 0` is the clearest single way to make this
look like a mask.

**The edges bow.** A blade is a curved plate, so each side of the hole is a
shallow arc bulging inwards. The size of that is not a taste decision: a
polygon's inradius is its circumradius times the cosine of half a blade's angle,
so `1/cos − 1` is exactly how far the middle of a straight edge sits inside the
circle it is cutting, and `bow` is the share of that taken back.

## It clips, it does not draw

`clip-path`, on the element itself. Nothing is added to the DOM, nothing is
rendered, and the content inside is untouched: it selects, scrolls and reads the
whole time, it is simply not all visible yet.

That is also why this is the one item here that declares `ground: "either"`
without an argument. There is no colour in it. It clips whatever you put it on.

## Wiring

**Plain HTML.**

```html
<section id="plate">
  <h1>Seven blades</h1>
  <p>…</p>
</section>

<script type="module">
  import { createIrisReveal } from './beamish/effects/iris-reveal/core.js'

  const iris = createIrisReveal(document.querySelector('#plate'))
  iris.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createIrisReveal } from '@/beamish/effects/iris-reveal/core'

export function Plate() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const iris = createIrisReveal(host.current, { blades: 7, swing: 26 })
    iris.start()
    return () => iris.destroy()
  }, [])

  return <div ref={host} className="hero">…</div>
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createIrisReveal } from '@/beamish/effects/iris-reveal/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let iris: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  iris = createIrisReveal(host.value)
  iris.start()
})

onBeforeUnmount(() => iris?.destroy())
</script>

<template>
  <section ref="host" class="hero">…</section>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Put it on the block, not the children

Everything inside is revealed together, as one plate, which is what an iris does
to a scene. Mounting it on each child gives you several irises opening at once,
which is a different and much busier effect.

## It opens past the corner

A box's corner is further from the centre than its side, and the polygon's own
inradius is shorter again. The reach is computed from whichever corner is
furthest from the centre you set, divided by the cosine of half a blade's angle,
so the opening always clears the element.

If it did not, the last frame would have slivers left in the corners, which
reads as a dirty lens rather than as a design.

## Off-centre

`x` and `y` put the centre anywhere in the element, and the reach is measured
from wherever you put it. Opening on the subject rather than on the middle of
the frame is what a camera operator would do, and it is worth trying on anything
with a face or a product in it.

## Cleanup and SSR

`destroy()` restores the element's own `clip-path`, cancels the RAF, disconnects
both observers and removes every listener. The content was never touched.

There is nothing to render on the server, and nothing to wait for: the markup is
complete and correct before this runs. Call `createIrisReveal` from
`useEffect`, `onMounted`, or a `client:*` island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which for a one shot means fully open: nothing clipped, nothing moving. That is
the correct outcome rather than a compromise, because an iris that stays shut
for somebody with a vestibular disorder is content they cannot read.

## Common mistakes

1. **`swing: 0`.** A polygon being scaled. The turn is the mechanism.

2. **Too many blades.** Past about twelve it is a circle, and the one thing that
   says lens has gone.

3. **Mounting it on every child.** Several irises at once. The scene is one
   thing.

4. **A host that is already clipped.** `clip-path` does not compose: this sets
   the property, so an existing one on the same element is replaced for as long
   as the effect is mounted, and restored on `destroy()`.

5. **`from: 0`.** The first frames are an empty box. A real diaphragm does not
   close to a point, and a pinhole gives the eye something to track from.

6. **A `backdrop-filter` inside the host.** `clip-path` is normally composited
   rather than repainted, and that is the exception which will repaint every
   frame.
