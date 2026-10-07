## What it is

CrosshairCursor draws a pair of hairlines across a panel and four corner
brackets where they meet, following the pointer. A viewfinder rather than a
cursor.

The part that makes it worth building, rather than two divs tracking a mouse, is
what happens when it passes over something you can press: the brackets leave the
cursor and square up around that element instead. It stops being a decoration on
the pointer and becomes a statement about the page, which is the whole idea of a
reticle. Nothing locks on to empty space.

Three decisions worth knowing about.

**What counts as a target is a CSS selector, not a guess.** Anything that sniffs
for clickability gets it wrong in both directions: it misses the div somebody
wired a handler to, and it locks on to every link in a paragraph of running
text.

**The lock comes from a hit test at the pointer, not from a listener.** A
scripted path moves no real pointer and fires no events, so an effect that
locked on only for a live cursor would record as a reticle that never finds
anything. The test is skipped while the pointer is still, because it flushes
layout and the answer cannot have changed.

**The brackets take a target faster than the crosshair follows the hand.** A
reticle that drifts lazily into place has not locked on to anything. The snap is
the feedback.

## Wiring

**Plain HTML.** Put it on the area the reticle should cover. The element keeps
its own content and the reticle is drawn over the top of it.

```html
<section id="panel">
  <button type="button">Dispatch</button>
</section>

<script type="module">
  import { createCrosshairCursor } from './beamish/effects/crosshair-cursor/core.js'

  const sight = createCrosshairCursor(document.querySelector('#panel'))
  sight.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createCrosshairCursor } from '@/beamish/effects/crosshair-cursor/core'

export function Viewfinder({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sight = createCrosshairCursor(host.current, { lines: true })
    sight.start()
    return () => sight.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createCrosshairCursor } from '@/beamish/effects/crosshair-cursor/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sight: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sight = createCrosshairCursor(host.value)
  sight.start()
})

onBeforeUnmount(() => sight?.destroy())
</script>

<template>
  <div ref="host"><button type="button">Dispatch</button></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Choosing targets

`target` is a selector and the default is `a, button, [data-target]`. The data
attribute is there so you can nominate anything without rewriting the selector:
put it on the card, the image, the table row.

Be sparing. A reticle that locks on to everything is a reticle that is never
telling you anything, and over a paragraph of links it will snap between words
as the pointer crosses them.

## Hiding the real cursor

This does not hide it for you. Set `cursor: none` on the element yourself if you
want it gone, because that is a decision about the page rather than about the
effect, and it is one with a cost: a visitor who loses the system cursor loses
every affordance that came with it, including the text I-beam and the resize
arrows. Over a panel of buttons it is fine. Over a form it is not.

## The lines are optional, and often wrong

`lines: false` leaves the brackets on their own, which is quieter and much
better over text. The long hairlines cross everything on the page, and over a
paragraph that is a strikethrough following the cursor.

## Cleanup and SSR

`destroy()` removes the layer and puts the element's `position` back. There is
no GPU resource to release and no listener to remove, because the lock is a hit
test rather than an event.

Nothing renders on the server, and nothing needs to: the element's own content
is untouched. Call `createCrosshairCursor` from `useEffect`, `onMounted`, or a
`client:*` island.

## Determinism

Like every pointer effect in this library it eases against its own last frame,
so it is deliberately not pure in `t`. The recorder drives it from the scripted
cursor path in `meta.json` rather than from a mouse, which is what makes a take
reproducible.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts, so the reticle is not drawn. That is the right answer:
this is an ornament on a pointer that already works, and a crosshair that
follows the hand is motion by definition.

## Common mistakes

1. **Sniffing for what is clickable.** It misses handlers on plain elements and
   it catches every link in a paragraph. A selector you chose is better than a
   guess, every time.

2. **Locking on with a listener.** It works on the page and records as a reticle
   that never finds anything, because a scripted path fires no events.

3. **Hit testing every frame.** It flushes layout for a number that cannot have
   changed if the pointer did not move.

4. **The same easing for the crosshair and the brackets.** Then locking on looks
   like catching up. The snap has to be faster than the follow.

5. **Hiding the system cursor across a whole page.** The I-beam and the resize
   arrows were doing something. Over a panel of buttons, fine; over a form, no.
