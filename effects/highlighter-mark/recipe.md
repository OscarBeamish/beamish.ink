## What it is

HighlighterMark is somebody going through a page with a highlighter, marking
one phrase at a time and overshooting the ends.

## It marks the `<mark>` elements already in your text

That is the whole interface.

```html
<p id="brief">
  The rule is <mark>scope to the surface</mark>, and the reason is that
  <mark>a token used in three places is three decisions</mark>.
</p>
```

```ts
const pen = createHighlighterMark(document.querySelector('#brief')!)
pen.start()
```

The browser has had an element for "this bit matters" since HTML 4 and screen
readers announce it, so the page reads correctly with the effect switched off,
with CSS off, and in a feed reader. Nothing here parses prose, searches for
strings or wraps words in spans, so the text selects and copies exactly as it
did before.

Set `selector` if you must, but anything else means the page stops saying what
it means when the effect is not running.

## Why it is not a CSS background

An animated `linear-gradient` is the usual way and it gets the sweep right and
everything else wrong. A highlighter is a wet, wide, soft-tipped pen held in a
hand, and four things follow from that which a background cannot do:

- **The band is not level.** A hand draws a slight slope and the pen is not held
  square, so the top and bottom edges are not parallel.
- **The edges are ragged at the scale of the tip**, not smooth at the scale of
  the box. A background edge is a straight line by construction.
- **It overshoots.** Nobody stops exactly on the last letter, and not by the
  same amount at each end.
- **The ink doubles where the pen went twice.** That second pass down the middle
  is most of what makes it read as a pen rather than as a fill.

So each mark becomes a polygon in one SVG over the text.

## Multiply, which is why it is a paper item

The overlay is blended with `mix-blend-mode: multiply`, because that is what
translucent ink on paper does: the glyphs stay on top and darken the ink rather
than being covered by it.

It is also why there is no dark version of this. Multiply against a dark ground
is black. If you need marked text on a dark page, that is a different effect
with a different physical model, not this one with a different colour.

## A phrase that wraps gets two strokes

Which is what a person does. `getClientRects` already returns exactly those
boxes, one per line, and each gets its own slope, rag and overshoot.

## Wiring

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createHighlighterMark } from '@/beamish/effects/highlighter-mark/core'

export function Brief() {
  const host = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pen = createHighlighterMark(host.current, { ink: '#ffe14d' })
    pen.start()
    return () => pen.destroy()
  }, [])

  return (
    <p ref={host}>
      The rule is <mark>scope to the surface</mark>, every time.
    </p>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createHighlighterMark } from '@/beamish/effects/highlighter-mark/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pen: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pen = createHighlighterMark(host.value)
  pen.start()
})

onBeforeUnmount(() => pen?.destroy())
</script>

<template>
  <p ref="host">The rule is <mark>scope to the surface</mark>, every time.</p>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Turn off the browser's own mark styling

`<mark>` ships with a yellow box and square corners, which is the thing this
effect exists to replace. The ink is drawn over the top, so the element itself
should carry none:

```css
mark {
  background: none;
  color: inherit;
}
```

Leave it in and every phrase has a rectangle under its stroke.

## The host becomes a containing block

The overlay is absolutely positioned inside the element you mount on, so a
`static` host is promoted to `relative` on setup and put back on teardown. If
you are already positioning that element, nothing happens.

## Timing

`hold`, then one stroke every `stagger`, each taking `duration` and eased out,
because a pen is thrown rather than driven.

`stagger` is shorter than `duration` on purpose: a reader is still finishing one
mark as the next begins, which is what reading with a pen in your hand looks
like. At 0 every mark appears at once and the sequence is lost.

## It is a one shot

It marks, and it is done. The demo panel gives it a Replay control; on your own
page, mount it when the text arrives rather than on load, so the marks are drawn
while somebody is looking at them.

## Cleanup and SSR

`destroy()` removes the overlay, cancels the RAF, disconnects both observers,
removes every listener and restores the host's `position`. The text is untouched
throughout, so there is nothing to put back.

There is nothing to render on the server, and nothing is needed: the text is
already in the markup and already correct. Call `createHighlighterMark` from
`useEffect`, `onMounted`, or a `client:*` island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which for a one shot means the finished state: every phrase marked, nothing
moving. That is the correct outcome rather than a compromise, because the marks
are information and withholding them would be withholding the point.

## Common mistakes

1. **Leaving the default `<mark>` background on.** A rectangle under every
   stroke.

2. **A dark ground.** Multiply against black is black. This is a paper item.

3. **`strength` above about 0.8.** The text under the ink stops passing
   contrast, which is a failure rather than a look. Run `pnpm contrast` or the
   equivalent on your own page after changing the ink.

4. **A host that clips.** `overflow: hidden` cuts the overshoot off at the edge
   of the block, which is the one part of the stroke that says a hand drew it.

5. **Wrapping words in spans yourself.** `<mark>` already means this, already
   reads correctly, and already survives the effect being switched off.

6. **`stagger` longer than `duration`.** Each mark finishes and waits, which
   reads as a slideshow rather than as somebody working down a page.
