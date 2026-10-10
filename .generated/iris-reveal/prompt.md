You are adding **IrisReveal** from Beamish to this project.

> A camera iris opening on whatever is behind it, with as many sides as it has blades and a swing as it goes. Reveals · effect · MIT.
> https://beamish.ink/effects/iris-reveal

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- An iris is not a circle growing. A diaphragm is a ring of overlapping blades and the hole they leave is a polygon with as many sides as there are blades: five give a pentagon, nine give something close to a circle but not one. Anybody who has seen an out-of-focus highlight in a photograph has seen this shape, which is why a growing circle reads as a spotlight and a growing heptagon reads as a lens
- The blades swing as they open, so the whole opening rotates. On a real lens that is a consequence of the mechanism rather than a decision, and leaving it out is the clearest way to make this look like a mask
- The edges bow. A blade is a curved plate, so each side of the hole is a shallow arc bulging inwards. The amount is measured rather than chosen: a polygon's inradius is its circumradius times the cosine of half a blade's angle, so 1/cos minus 1 is exactly how far the middle of a straight edge sits inside the circle it is cutting, and `bow` is the share of that taken back
- It reaches past the far corner rather than to the edge. A box's corner is further from the centre than its side and the polygon's own inradius is shorter again, so an opening that stops at 1 leaves slivers in the corners that read as a dirty lens
- Drawn with clip-path on the element itself. Nothing is added to the DOM, nothing is drawn, and the content is untouched: it selects, scrolls and reads the whole time, it is simply not all visible yet
- The polygon is in percentages, so it follows a resize with no measuring at all
- ground is `either` and for once that needs no argument: there is no colour in this item. It clips whatever you put it on, so there is nothing to tune against a background
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/iris-reveal/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/iris-reveal/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

IrisReveal is a camera iris opening on whatever is behind it.

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `blades` | number | `7` | 3 to 16 (looks right between 5 and 9) | How many blades, and so how many sides the opening has. Five is a cheap lens and the shape is unmistakable; nine is an expensive one and reads as nearly round. Past about twelve nobody can tell it from a circle and you have lost the only thing that says lens. |
| `swing` | number | `26` | 0 to 120 deg (looks right between 15 and 45) | Degrees the opening rotates between shut and open. This is the mechanism showing, and at 0 the effect is a polygon being scaled, which is a mask. Large values spin rather than swing and start to read as a shutter on a film projector. |
| `bow` | number | `0.14` | 0 to 1 | How far each edge bows into the hole, as a share of the gap between the straight edge and the circle through the vertices. At 0 the opening is a strict polygon; at 1 it is a circle and the blade count stops mattering. The default is a plate with a gentle curve on it. |
| `from` | number | `0.04` | 0 to 0.9 | How far open it starts, as a share of the finished opening. A little rather than nothing, because a real diaphragm does not close to a point and a pinhole gives the eye something to track from. At 0 the first frames are an empty box. |
| `duration` | number | `1100` | 150 to 6000 ms (looks right between 700 and 1800) | Milliseconds for the iris to open, eased at both ends because a diaphragm is sprung at both ends of its travel. An ease-out alone makes it look dropped. |
| `hold` | number | `220` | 0 to 5000 ms | Milliseconds of stillness before it starts. Short: this is a reveal, and the thing being revealed is what somebody came for. |
| `x` | number | `0.5` | 0 to 1 | Where the centre sits across the element. Off-centre is worth trying when the content has a subject: opening on the face rather than on the middle of the frame is what a camera operator would do. |
| `y` | number | `0.5` | 0 to 1 | Where the centre sits down the element. The reach is measured to the furthest corner from wherever this puts the centre, so an off-centre iris still clears the box. |

## 5. An iris is not a circle growing

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

## 6. It clips, it does not draw

`clip-path`, on the element itself. Nothing is added to the DOM, nothing is
rendered, and the content inside is untouched: it selects, scrolls and reads the
whole time, it is simply not all visible yet.

That is also why this is the one item here that declares `ground: "either"`
without an argument. There is no colour in it. It clips whatever you put it on.

## 7. Put it on the block, not the children

Everything inside is revealed together, as one plate, which is what an iris does
to a scene. Mounting it on each child gives you several irises opening at once,
which is a different and much busier effect.

## 8. It opens past the corner

A box's corner is further from the centre than its side, and the polygon's own
inradius is shorter again. The reach is computed from whichever corner is
furthest from the centre you set, divided by the cosine of half a blade's angle,
so the opening always clears the element.

If it did not, the last frame would have slivers left in the corners, which
reads as a dirty lens rather than as a design.

## 9. Off-centre

`x` and `y` put the centre anywhere in the element, and the reach is measured
from wherever you put it. Opening on the subject rather than on the middle of
the frame is what a camera operator would do, and it is worth trying on anything
with a face or a product in it.

## 10. Cleanup and SSR

`destroy()` restores the element's own `clip-path`, cancels the RAF, disconnects
both observers and removes every listener. The content was never touched.

There is nothing to render on the server, and nothing to wait for: the markup is
complete and correct before this runs. Call `createIrisReveal` from
`useEffect`, `onMounted`, or a `client:*` island.

## 11. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which for a one shot means fully open: nothing clipped, nothing moving. That is
the correct outcome rather than a compromise, because an iris that stays shut
for somebody with a vestibular disorder is content they cannot read.

## 12. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/iris-reveal/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/iris-reveal/adapters/vue.ts

---

Concept credit: an aperture cut into the page, from the Recessed Aperture page. The blade geometry here is worked out rather than taken, by Ray Velez, https://github.com/RayVelez27/instalanding.ai.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
