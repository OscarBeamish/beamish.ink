## What it is

StrokeText sets hollow letters and fills them with ink from the foot up. An
inline face being inked, rather than an outline for its own sake.

Two problems, and the first is why most outlined text on the web looks wrong.

**`-webkit-text-stroke` centres the stroke on the letterform**, so half of it is
painted inside the glyph. On a light weight that half eats the counters: the
inside of an o closes up, an e fills in, and the setting goes muddy at exactly
the widths where an outline is worth having. A typeface designed as an inline
puts the stroke outside the letter, where it belongs.

The fix needs no new CSS and works everywhere. The text is drawn twice. Behind,
a stroke of **twice** the width you asked for, centred, so it reaches the right
distance outside the letter and an equal distance inside. In front, the same
text filled, painting over the inner half. What is left is an outside-only
stroke of exactly the width given, with the counters intact.

**The second problem is what to animate**, and the answer is the ink. The front
layer is a gradient clipped to the text with a hard edge in it: below the edge
the letter is solid, above it the letter is paper. Move the edge and the type
fills from the foot up.

The edge tilts and has a small wobble, because a roller is not level. A dead
horizontal line across a setting reads as a mask rather than as a surface of
ink.

## `paper` has to be the real page colour

This is the one thing that will catch you out, and it is the same trap
EmbossedText has. The hollow of a letter is painted the `paper` colour, because
that is what covers the inner half of the stroke. Get it wrong and every counter
is wrong, and the outline looks twice as thick as you asked for.

If the background behind the text is an image or a gradient, this technique
cannot work. Use a single-layer centred stroke and accept the tighter counters,
or pick a different effect.

## Wiring

**Plain HTML.** The text must already be in the element.

```html
<h1 id="masthead">Inked from the foot up</h1>

<script type="module">
  import { createStrokeText } from './beamish/effects/stroke-text/core.js'

  const hollow = createStrokeText(document.querySelector('#masthead'), {
    paper: '#fbfaf4'
  })
  hollow.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createStrokeText } from '@/beamish/effects/stroke-text/core'

export function Masthead({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const hollow = createStrokeText(host.current, { paper: '#fbfaf4' })
    hollow.start()
    return () => hollow.destroy()
  }, [children])

  return <h1 ref={host}>{children}</h1>
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createStrokeText } from '@/beamish/effects/stroke-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let hollow: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  hollow = createStrokeText(host.value, { paper: '#fbfaf4' })
  hollow.start()
})

onBeforeUnmount(() => hollow?.destroy())
</script>

<template>
  <h1 ref="host">Inked from the foot up</h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Inking it again.**

```ts
hollow.stop()
hollow.renderAtTime(0)
hollow.start()
```

## The ink crosses the block, not each line

The gradient belongs to the element, so on a two-line heading the ink rises
through the lower line first and then into the upper one. That is a roller
crossing a forme rather than each line filling itself, and it is the same logic
as SplitFountainText: the ink is a property of where you are on the sheet.

If you want each line inked separately, mount one of these per line.

## Where to stop

`level: 1` ends on solid type, which is tidy and throws the outline away.

`level: 0.6` leaves the letters half inked, which is the more interesting place
to stop: it reads as a block that has been rolled once, and it keeps the
outline, which is the thing you went to the trouble of building.

## Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The two layers are only built on the first frame. Call
`createStrokeText` from `useEffect`, `onMounted`, or a `client:*` island.

## Accessibility

The stroked copy is the one in the flow and the one a screen reader reaches. The
filled copy on top is marked `aria-hidden`, which is the right way round for one
reason: the text underneath is the real text, and the layer over it is paint.

An empty outline has very little contrast against paper. If the heading matters,
end with the ink at or near full, or make the outline dark enough to be read on
its own.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is after the rise. The letters are inked to the level set, and nothing
moves.

Set it to 0 instead and you get the hollow outline, which is also a perfectly
good still if the outline has the contrast for it.

## Common mistakes

1. **One layer with a centred stroke.** Half the stroke lands inside the letter
   and closes the counters. Two layers, the back one at double width, costs
   nothing and fixes it completely.

2. **`paper` not matching the page.** Every counter is the wrong colour and the
   outline reads at twice its width.

3. **Filling from the top.** At 180 degrees a CSS gradient runs to the bottom,
   so 0% is the top of the box. Putting the ink at the start of the stop list
   drains the type instead of filling it, which is what the first version of
   this did.

4. **A dead level ink line.** It reads as a mask sliding up. Two degrees of tilt
   is the difference.

5. **Using it on body copy.** Text strokes and `background-clip` are both
   painted rather than composited, and an outline at body size is a smudge. It
   is a heading effect.
