You are adding **StrokeText** from Beamish to this project.

> Hollow letters that fill with ink from the foot up, with the stroke outside the letterform where it belongs. Type · effect · MIT.
> https://beamish.ink/effects/stroke-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- -webkit-text-stroke centres the stroke on the letterform, so half of it is painted inside the glyph. On a light weight that half eats the counters: the inside of an o closes up, an e fills in, and the setting goes muddy at exactly the widths where an outline is worth having. A face designed as an inline puts the stroke outside the letter
- The fix needs no new CSS and works everywhere. The text is drawn twice: behind, a stroke of twice the width asked for, centred, so it reaches the right distance outside the letter; in front, the same text filled, painting over the inner half. What is left is an outside-only stroke of exactly the width given, with the counters intact
- The animated thing is the ink. The front layer is a gradient clipped to the text with a hard edge in it, so below the edge the letter is solid and above it the letter is paper. Moving the edge fills the type from the foot up, which is what inking a block looks like
- The ink line tilts and has a small wobble, because a roller is not level. A dead horizontal edge across a line of type reads as a mask rather than as a surface of ink
- `paper` has to match the page behind the element. It is not decoration: it is the colour that covers the inner half of the stroke, so if it is wrong the hollow of every letter is wrong and the outline looks twice as thick as it is
- The stroked copy is the one in the flow and the one a screen reader reaches. The filled copy on top is marked hidden, because the text underneath is the real text and the layer over it is paint
- -webkit-text-fill-color is set as well as color on the front layer. Without it WebKit paints the text over the clipped background and the fill never shows at all
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/stroke-text/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/stroke-text/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `outline` | color | `#36362f` | any CSS hex | The outline. It carries the whole letterform while the ink is still low, so it wants enough contrast against the paper to be read on its own. |
| `ink` | color | `#c44400` | any CSS hex | The ink that fills the letters. A second colour is worth having: ink the same colour as the outline gives a letter that simply goes solid, and the point is to watch it fill. |
| `paper` | color | `#fbfaf4` | any CSS hex | What the hollow of a letter shows, and it must match the page behind the element. Load-bearing rather than decorative: this is the colour that paints over the inner half of the stroke, so if it is wrong every counter is wrong and the outline looks twice as thick as it is. |
| `width` | number | `0.022` | 0.002 to 0.1 em (looks right between 0.012 and 0.04) | Width of the outline, in ems, so it holds at any size. This is the real outside width: the stroke actually drawn is twice this and the inner half is covered. Past about 0.05 the outline starts closing the counters from the outside instead, which no trick can fix. |
| `level` | number | `1` | 0 to 1 | How full the letters are when the run has finished. 1 fills them completely and ends on solid type. Around 0.6 leaves them half inked, which is the more interesting place to stop and reads as a block that has been rolled once. |
| `duration` | number | `2400` | 200 to 20000 ms | Milliseconds for the ink to rise, eased so it arrives rather than stops. Slow enough to watch: the rise is the effect and the outline is only where it starts. |
| `hold` | number | `300` | 0 to 5000 ms | Milliseconds of empty outline before the ink starts. Worth having: it is the moment that tells you the letters were hollow to begin with. |
| `tilt` | number | `2.5` | -15 to 15 deg | How far the ink line is off level. A roller is not level, and a dead horizontal edge across a line of type reads as a mask. Two or three degrees is enough to be felt without being seen. |
| `wobble` | number | `0.3` | 0 to 1 | How uneven the height of the ink is. Small, and fixed by the seed rather than moving: a roller lays an uneven line, it does not lay a wavy one. |
| `seed` | number | `7` | 0 to 9999 | Seed for the unevenness. The same seed gives the same pull, so a recording and a live page match. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot rise this should be a time after it has finished, so the letters are inked to the level set. Setting it to 0 instead gives the hollow outline, which is also a perfectly good still. |

## 5. Accessibility. Do not skip this

The stroked copy is the one in the flow and the one a screen reader reaches. The
filled copy on top is marked `aria-hidden`, which is the right way round for one
reason: the text underneath is the real text, and the layer over it is paint.

An empty outline has very little contrast against paper. If the heading matters,
end with the ink at or near full, or make the outline dark enough to be read on
its own.

## 6. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The two layers are only built on the first frame. Call
`createStrokeText` from `useEffect`, `onMounted`, or a `client:*` island.

## 7. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is after the rise. The letters are inked to the level set, and nothing
moves.

Set it to 0 instead and you get the hollow outline, which is also a perfectly
good still if the outline has the contrast for it.

## 8. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/stroke-text/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/stroke-text/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
