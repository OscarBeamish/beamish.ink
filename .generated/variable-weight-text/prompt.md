You are adding **VariableWeightText** from Beamish to this project.

> Type that puts on weight under the cursor, on a line that does not move while it does. Pointer · effect · MIT.
> https://beamish.ink/effects/variable-weight-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- Needs a variable font with the axis being driven. A static face ignores font-variation-settings without complaining, which is the one way this fails silently: the effect mounts, runs, and does nothing visible
- The line does not move, and that is the whole item. A weight axis changes the advance width of every glyph it touches, so a line of individually weighted letters reflows continuously as the cursor crosses it: characters shuffle sideways, the line end breathes, and anything laid out after it moves too. That is why most versions of this only ever appear on a single centred word
- Each character is measured once at the heaviest value the axis will reach, which is the widest it can ever be, and held in a box that wide with the letter centred in it. One measuring pass, and it is the difference between an effect you can put on a paragraph and one you can put on a word
- The falloff has a shoulder rather than being linear. Pressure does not fall off in a straight line from a nib, and a linear ramp reads as a triangle of bold sliding along the line
- The axis is a setting rather than a constant. Weight is the obvious one and the default, but a face with a width or a slant axis will do this just as well and only three strings change
- The value is written to one decimal place. A weight axis quantised to a tenth is finer than any face resolves, and it stops the style being rewritten every frame for a change nothing can draw
- Like every pointer effect here it eases against its own last frame, so it is deliberately not pure in t, and the recorder drives it from the scripted path in this file
- The original string stays in the accessibility tree as one label, so a screen reader reads the sentence rather than the characters
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/variable-weight-text/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/variable-weight-text/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

VariableWeightText makes type put on weight under the cursor. The hand presses,
the letters take more ink, and the line stays exactly where it was.

That last clause is the whole item, and it is why most versions of this only
ever appear on a single centred word.

A variable font's weight axis changes the **advance width** of every glyph it
touches. Go from 400 to 700 and the letters get wider, so a line whose letters
are individually weighted reflows continuously as the cursor crosses it:
characters shuffle sideways, the line end breathes, and anything laid out after
it moves too.

So each character is measured once at the heaviest value the axis will ever
reach, which is the widest it can ever be, and held in a box that wide with the
letter centred in it. One measuring pass, and after it nothing moves again. It
is the difference between an effect you can put on a paragraph and one you can
put on a word.

Two smaller things. The falloff has a shoulder rather than being linear, because
pressure does not fall off in a straight line from a nib and a linear ramp reads
as a triangle of bold sliding along the line. And the axis is a setting rather
than a constant: weight is the obvious one, but a width or slant axis works the
same way and only the strings change.

## 3. Wire it in

**Plain HTML.** The text must already be in the element.

```html
<h1 id="masthead">Pressure of the press</h1>

<script type="module">
  import { createVariableWeightText } from './beamish/effects/variable-weight-text/core.js'

  const pressed = createVariableWeightText(document.querySelector('#masthead'))
  pressed.start()
</script>
```

**React.** Pass the text as children. Do not build the characters in JSX: React
overwrites the DOM on the next render and the measuring is lost with it.

```tsx
import { useEffect, useRef } from 'react'
import { createVariableWeightText } from '@/beamish/effects/variable-weight-text/core'

export function Masthead({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pressed = createVariableWeightText(host.current, { reach: 0.3 })
    pressed.start()
    return () => pressed.destroy()
  }, [children])

  return <h1 ref={host}>{children}</h1>
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createVariableWeightText } from '@/beamish/effects/variable-weight-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pressed: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pressed = createVariableWeightText(host.value)
  pressed.start()
})

onBeforeUnmount(() => pressed?.destroy())
</script>

<template>
  <h1 ref="host">Pressure of the press</h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `axis` | string | `wght` | any value | The variation axis to drive, spelled as the font declares it. Four lower-case letters for a registered axis: wght for weight, wdth for width, slnt for slant, opsz for optical size. A custom axis is upper case. Name one the face does not have and nothing happens, with no error anywhere. |
| `rest` | number | `400` | 1 to 1000 | Where the axis sits with the cursor far away, which is to say what the text looks like to everybody who never moves a mouse over it. It should be the weight you would have set anyway. |
| `peak` | number | `700` | 1 to 1000 | Where the axis goes directly under the cursor. Stay inside the range the face actually has: asking for 900 of a 400 to 700 font clamps to 700, so the effect quietly gets weaker as the cursor arrives rather than stronger. |
| `reach` | number | `0.22` | 0.02 to 1 (looks right between 0.12 and 0.35) | How far the hand reaches, as a share of the element's width. Relative, so the same setting works on a heading and on a column. Wide reaches read as the whole line breathing; narrow ones as a finger pressing on one letter. |
| `shoulder` | number | `2.4` | 0.5 to 8 (looks right between 1.6 and 4) | Shape of the falloff. 1 is linear, which reads as a triangle of bold sliding along the line and is the giveaway of every version of this. Higher keeps the peak tight and lets it fall away quickly, which is what pressure from a nib actually does. |
| `ease` | number | `0.22` | 0.02 to 1 | How fast the letters follow the hand, per frame. At 1 they are welded to the cursor, which looks like a bug rather than like ink. Paper takes a moment to give. |
| `steady` | boolean | `true` | `true` · `false` | Hold each character in a box as wide as its heaviest form. On, always, unless the face has no width change across the axis: a slant axis does not need it, and a weight axis absolutely does. Turn it off once on a paragraph to see why it is here. |
| `tracking` | number | `0.012` | 0 to 0.1 em | Extra tracking. A little room stops the heaviest letters touching their neighbours, since every box is as wide as its own character needs and not as wide as the pair does. |

## 5. It needs a variable font

The face must carry the axis you are driving. A static font ignores
`font-variation-settings` without complaining, so the effect mounts, runs, and
does nothing at all. If you see no change, check the font before you check
anything else.

Stay inside the range the face actually has, too. Asking for 900 of a 400-to-700
font clamps to 700, which means the effect gets quietly weaker as the cursor
arrives rather than stronger.

## 6. Other axes

`axis` is spelled as the font declares it: four lower-case letters for a
registered axis (`wght`, `wdth`, `slnt`, `opsz`) and upper case for a custom
one. Name an axis the face does not have and nothing happens, with no error
anywhere.

`steady` can come off for an axis that does not change the advance width, a
slant for instance. For weight it should stay on. Turn it off once on a
paragraph and watch the line crawl: that is the thing this item exists to stop.

## 7. Size

One rect read and at most one style write per character per frame. The rects are
read live rather than cached, which is what lets this work on a wrapped
paragraph: the characters really are where the browser put them.

That makes length the thing to watch. Three hundred characters is three hundred
rects a frame, and at that length the effect is a smudge following the cursor
anyway. A heading, or a short paragraph.

## 8. Accessibility. Do not skip this

The characters are marked `aria-hidden` and a visually hidden copy of the
original string sits alongside them, so a screen reader reads the sentence
rather than the letters.

`rest` is what the text looks like to everyone who never moves a pointer over
it, which is most people and all touch users. Set it to the weight you would
have chosen anyway, and treat everything above it as a flourish nobody needs to
see.

## 9. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The characters are only split on the first frame. Call
`createVariableWeightText` from `useEffect`, `onMounted`, or a `client:*` island.

## 10. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts, so the text simply sits at `rest`. Nothing is lost: the
resting state is the design.

## 11. The three mistakes most likely to be made here

1. **Not pinning the boxes.** The line reflows under the cursor. It is the only
   reason you ever see this effect on one word in the middle of a page, and it
   is one measuring pass to fix.

2. **A static font.** `font-variation-settings` is ignored in silence. There is
   no error to find.

3. **A `peak` outside the face's range.** It clamps, so the effect gets weaker
   as the cursor arrives instead of stronger, which reads as a bug in the
   falloff.

4. **A linear falloff.** `shoulder: 1` is a triangle of bold sliding along the
   line. Pressure from a nib does not do that.

5. **Using it on body copy.** Three hundred rects a frame, for an effect that at
   that size is a smudge. It is for a heading.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/variable-weight-text/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/variable-weight-text/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
