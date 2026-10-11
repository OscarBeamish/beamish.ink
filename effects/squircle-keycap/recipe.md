## What it is

SquircleKeycap is a key you can press: a superellipse, extruded, that travels
when you push it and comes back on a rubber dome.

## The shape is the point

`border-radius` gives you a rectangle with circular arcs stuck on the corners.
The join between the straight edge and the arc is continuous in position and in
direction, but not in curvature: curvature goes from zero to one over the
radius, instantly, at that one point. Nobody can name that when they see it and
everybody can see it.

A superellipse has no join at all. It is one equation the whole way round,
`|x/a|^n + |y/b|^n = 1`, and the curvature rises and falls smoothly through the
corner. It is the shape a keycap, a phone icon and a Braun dial have been for
far longer than anyone has said "squircle".

It is walked as a path here rather than approximated with Bézier curves, so
`corner` is a real control rather than a lookalike. 2 is an ellipse, 4 is the
shape everybody means, and by 12 it is a rectangle with a suggestion of a
corner. No value of `border-radius` lands on any of them.

One implementation note, because it is the thing that goes wrong: the exponent
has to be applied to the absolute value and the sign put back afterwards. A
fractional power of a negative number is not a number, and the left half of the
shape is simply never drawn.

## How a key can travel without keeping state

`renderAtTime` has to be pure in `t`, and a key is state between frames by
nature: whether it is down depends on something that happened earlier.

The resolution is to keep the list of **presses** rather than the position, and
work the displacement out from the clock each frame. Scripted presses are read
from the options every frame rather than remembered, so seeking backwards
unpresses the key. A spring integrated frame by frame can never do that, and
the recorder would get a different take every time it ran.

The displacement itself is an attack and a decay rather than a spring, because
a keycap does not oscillate: it goes down against a stop, which is fast and
ends abruptly, and comes back on a rubber dome, which is slower and settles
without overshoot. Two exponentials say that in one line.

## Wiring

**Plain HTML.** The element needs a size. A press anywhere on it presses the
key.

```html
<div id="key" style="width: 160px; height: 160px"></div>

<script type="module">
  import { createSquircleKeycap } from './beamish/effects/squircle-keycap/core.js'

  const key = createSquircleKeycap(document.querySelector('#key'), { legend: 'K' })
  key.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createSquircleKeycap } from '@/beamish/effects/squircle-keycap/core'

export function Key({ legend }: { legend: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const key = createSquircleKeycap(host.current, { legend })
    key.start()
    return () => key.destroy()
  }, [legend])

  return <div ref={host} className="size-40" />
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSquircleKeycap } from '@/beamish/effects/squircle-keycap/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let key: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  key = createSquircleKeycap(host.value, { legend: 'K' })
  key.start()
})

onBeforeUnmount(() => key?.destroy())
</script>

<template>
  <div ref="host" class="key" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## It is a drawing of a control, not a control

This matters more here than for anything else in the library, because it looks
exactly like a thing you would click to do something.

A canvas has no role, no focus, no label and no keyboard handling, and none of
that can be added to it. If the key is going to **do** something, put a real
`<button>` on the page and mount this inside it:

```html
<button class="key" aria-label="Run the task">
  <span data-keycap style="display: block; width: 100%; height: 100%"></span>
</button>
```

Mount on the inner span, give the button the usual reset and a focus ring of
its own, and you have a real control with this as its face. Everything that
makes a button a button stays in the DOM where screen readers and keyboards can
find it.

## The legend is set in the host's font

Deliberately: a thing pasted into somebody else's page should look like it
belongs to that page. It reads the computed `font-family` of the element it is
mounted on, so set that where you want it rather than passing a face in.

One or two characters. It is drawn at under a third of the key's width, and a
word at that size is a label on a key rather than a key.

## Getting the press to read

The travel is legible because the **side** gets shorter, not because the face
moves: the face moving a few pixels is almost invisible, and the band of colour
below it collapsing is not.

So the two settings that matter are `depth` and `travel`. A key with too little
`depth` has nowhere to go and the press reads as a flicker. A `travel` of 1
bottoms the cap out flush with the plate, which reads as broken rather than as
pressed. The defaults keep a visible lip at the bottom of the stroke.

`side` wants to be a clear step darker than `cap`. It is a facet turned away
from the light, not a shadow, and treating it as a shadow is what makes these
look like stickers.

## Cost

0.5ms: two filled paths of a hundred and twenty points, a clipped gradient and
one glyph. It holds no WebGL context, which is the reason it is 2D: a key is
something you want several of on a page, and the context budget is one.

## Cleanup and SSR

`destroy()` removes the press listener, cancels the RAF, disconnects both
observers and clears the canvas.

There is nothing to render on the server. The element is empty until the first
frame. Call `createSquircleKeycap` from `useEffect`, `onMounted`, or a
`client:*` island.

## Reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one
frame is drawn, which is the key at rest. The press is a response to an action
rather than ambient movement, so there is nothing here that needs pausing.

## Common mistakes

1. **Using it as a button.** It is a picture. Put a real `<button>` round it.

2. **Too little `depth`.** The press has nowhere to go and reads as a flicker
   rather than as travel.

3. **A `side` that is nearly the same colour as the cap.** The extrusion
   disappears and you have a flat shape with a shadow, which is the thing a
   superellipse was supposed to save you from.

4. **A long word as the legend.** It is set at a third of the key's width.

5. **Raising `corner` past about 8 to make it look crisper.** It stops being a
   squircle and becomes a rounded rectangle, which you could have had from CSS
   for nothing.
