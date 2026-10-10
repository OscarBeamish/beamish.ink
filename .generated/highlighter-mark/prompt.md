You are adding **HighlighterMark** from Beamish to this project.

> Somebody going through a page with a highlighter, marking one phrase at a time, overshooting the ends. Type · effect · MIT.
> https://beamish.ink/effects/highlighter-mark

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- It marks the `<mark>` elements already in the text, and that is the whole interface. The browser has had an element for this bit matters since HTML 4 and screen readers announce it, so a page using it reads correctly with the effect off, with CSS off and in a feed reader. Nothing here parses prose, searches for strings or wraps words in spans
- Not a CSS background. An animated linear-gradient gets the sweep right and everything else wrong: the band is level, the edges are straight by construction, it stops exactly on the last letter, and the ink is the same everywhere
- A hand does none of those. The band has a slight slope, the edges are ragged at the scale of the tip, the stroke overshoots the phrase by a different amount at each end, and the ink doubles where the pen went back over it. The second pass is most of what makes it read as a pen rather than as a fill
- Blended with multiply, because that is what translucent ink on paper does: the glyphs stay on top and darken the ink rather than being covered by it. It is also why this is a paper item and has no dark version. Multiply against a dark ground is black
- A phrase that wraps gets one stroke per line, because that is what a person does, and getClientRects already returns exactly those boxes
- The geometry is built once and the animation is a clip rectangle widening over it, so a frame costs one attribute per stroke. Rebuilt only on resize or when an option that changes the shape changes, because measuring forces layout
- The host is promoted to position: relative if it is static, because the overlay is absolutely positioned inside it, and a static host silently puts every stroke at the top left of the page. Put back on teardown
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/highlighter-mark/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/highlighter-mark/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

HighlighterMark is somebody going through a page with a highlighter, marking
one phrase at a time and overshooting the ends.

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `selector` | string | `mark` | any value | What to mark, inside the element this is mounted on. The default is the element HTML already has for the job, and using anything else means the page stops saying what it means when the effect is off. |
| `ink` | color | `#ffe14d` | any CSS hex | The ink. Highlighter yellow is yellow because it is the hue that darkens text least at a given opacity: a blue of the same strength takes a paragraph down to grey. Any colour works, but check the text through it before shipping a dark one. |
| `strength` | number | `0.55` | 0.05 to 1 (looks right between 0.35 and 0.7) | How opaque one pass of the pen is. The second pass goes over the first and multiplies rather than adds, so the middle of a stroke is always darker than this. Past about 0.8 the text underneath starts to struggle, which is a contrast failure rather than a look. |
| `height` | number | `0.72` | 0.3 to 1.4 | Band height as a share of the line's height. Under 1 by default, and sat low on the line, because a highlighter covers the body of the text and lets the ascenders out of the top. At 1.2 it is a wide chisel tip and starts to touch the line above. |
| `overshoot` | number | `7` | 0 to 40 px (looks right between 4 and 14) | How far the stroke runs past the phrase, with a different amount drawn at each end from the seed. Nobody stops exactly on the last letter, and at 0 this reads as a rectangle that happens to be ragged. |
| `tilt` | number | `1.1` | 0 to 6 deg | Slope of the hand. A degree is enough: it is the difference between a stroke and a highlight, and it is the first thing to turn down if the marks start to look untidy rather than human. |
| `rag` | number | `1.6` | 0 to 8 px | How ragged the edges are, at the scale of the pen tip. The two edges are ragged independently, because a soft tip wears differently on each side. At 0 the stroke is a clean polygon, which is a sticker. |
| `duration` | number | `420` | 80 to 3000 ms (looks right between 250 and 700) | Milliseconds for one stroke to be drawn, eased out, because a pen is thrown rather than driven. A long duration reads as a machine filling a box; this is somebody moving their wrist once. |
| `stagger` | number | `260` | 0 to 3000 ms | Milliseconds between the start of one stroke and the next. Less than the duration, so a reader is still finishing one mark as the next begins, which is what reading with a pen in your hand looks like. At 0 every mark appears at once and the sequence is lost. |
| `hold` | number | `260` | 0 to 5000 ms | Milliseconds of stillness before the first stroke. The page should be readable for a moment before anything is marked on it, or the marks arrive before anybody has seen what is being marked. |
| `seed` | number | `3` | 0 to 9999 | Seed for the hand: the rag on both edges, the slope of each stroke, how far each one overshoots and where the second pass starts and stops. The same seed draws the same strokes every time. |

## 5. It marks the `<mark>` elements already in your text

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

## 6. Why it is not a CSS background

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

## 7. Multiply, which is why it is a paper item

The overlay is blended with `mix-blend-mode: multiply`, because that is what
translucent ink on paper does: the glyphs stay on top and darken the ink rather
than being covered by it.

It is also why there is no dark version of this. Multiply against a dark ground
is black. If you need marked text on a dark page, that is a different effect
with a different physical model, not this one with a different colour.

## 8. A phrase that wraps gets two strokes

Which is what a person does. `getClientRects` already returns exactly those
boxes, one per line, and each gets its own slope, rag and overshoot.

## 9. Turn off the browser's own mark styling

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

## 10. The host becomes a containing block

The overlay is absolutely positioned inside the element you mount on, so a
`static` host is promoted to `relative` on setup and put back on teardown. If
you are already positioning that element, nothing happens.

## 11. Timing

`hold`, then one stroke every `stagger`, each taking `duration` and eased out,
because a pen is thrown rather than driven.

`stagger` is shorter than `duration` on purpose: a reader is still finishing one
mark as the next begins, which is what reading with a pen in your hand looks
like. At 0 every mark appears at once and the sequence is lost.

## 12. It is a one shot

It marks, and it is done. The demo panel gives it a Replay control; on your own
page, mount it when the text arrives rather than on load, so the marks are drawn
while somebody is looking at them.

## 13. Cleanup and SSR

`destroy()` removes the overlay, cancels the RAF, disconnects both observers,
removes every listener and restores the host's `position`. The text is untouched
throughout, so there is nothing to put back.

There is nothing to render on the server, and nothing is needed: the text is
already in the markup and already correct. Call `createHighlighterMark` from
`useEffect`, `onMounted`, or a `client:*` island.

## 14. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which for a one shot means the finished state: every phrase marked, nothing
moving. That is the correct outcome rather than a compromise, because the marks
are information and withholding them would be withholding the point.

## 15. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/highlighter-mark/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/highlighter-mark/adapters/vue.ts

---

Concept credit: marking running text with a highlighter rather than a background, from the Highlighter Markup page, by Ray Velez, https://github.com/RayVelez27/instalanding.ai.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
