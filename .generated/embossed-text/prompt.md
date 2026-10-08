You are adding **EmbossedText** from Beamish to this project.

> Type pressed into paper rather than extruded off it, with the impression biting unevenly across the line. Type · effect · MIT.
> https://beamish.ink/effects/embossed-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. Two text shadows and a colour per character, and getting those right is the whole job
- It presses in rather than standing out. The effect this is a recast of extrudes letters towards the viewer with a stack of shadows going down and to the right, which is a sign or a plastic badge. Letterpress leaves the type below the surface: the paper is deformed and what you read is light on the walls of the impression
- The dark edge goes on the side the light comes from, because that wall of the impression is turned away from it, and the light edge goes opposite. Reversed, the letter stands up off the page, and that is the most common way this gets written
- The impression is uneven across the line. Getting a forme to print evenly is a job with a name, makeready, and before it is done some letters bite harder than others. That unevenness is the difference between a press and a filter
- Ink is optional, and a blind emboss with none at all is the best thing here: the letter face is the same paper as the page and the impression is the only thing to read. It needs the `paper` option to match the actual page colour, because the letter face really is painted that colour
- The whole line presses at once, because a platen is one surface coming down. The variation is in how hard each letter bites, not in when
- The press overshoots and settles, since paper is compressed past where it ends up and pushes some of it back. The curve is divided by its own value at 1 so it finishes at exactly 1 whatever the spring is: without that the last frame of a recording does not match the resting state
- Depth and softness are in ems, so an impression looks the same at every size
- destroy() puts the original text back, leaving the element as it was found
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/embossed-text/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/embossed-text/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

EmbossedText presses type into paper. A platen comes down, the sheet takes the
impression, and the paper springs back a little.

The effect this is a recast of is called depth text, and it extrudes the letters
towards the viewer in fake 3D with a stack of shadows going down and to the
right. That is a sign, or a plastic badge. Letterpress goes the other way: the
type ends up below the surface, the paper is deformed, and what you read is
light catching the walls of the impression.

So the whole thing is two shadows and a colour, and getting those right is the
entire job.

**A dark edge on the side the light comes from**, because that wall of the
impression is turned away from it, and a light edge opposite. Reverse the two
and the letter stands up off the page instead. Everybody writing a debossed text
shadow does this at least once.

**The impression bites unevenly across the line.** Getting a forme to print
evenly is a job with a name, makeready, and before it is done some letters bite
harder than others. That unevenness is the difference between a press and a CSS
filter, and at `makeready: 0` the two are indistinguishable.

**Ink is optional.** A blind emboss has none at all: the letter face is the same
paper as the page, and the impression is the only thing to read. It is the best
thing this effect does and it is one setting.

The whole line presses at once, because a platen is one surface coming down. The
variation is in how hard each letter bites, not in when.

## 3. Wire it in

**Plain HTML.** The text must already be in the element.

```html
<h1 id="masthead">Pressed into the sheet</h1>

<script type="module">
  import { createEmbossedText } from './beamish/effects/embossed-text/core.js'

  const pressed = createEmbossedText(document.querySelector('#masthead'), {
    paper: '#fbfaf4'
  })
  pressed.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createEmbossedText } from '@/beamish/effects/embossed-text/core'

export function Masthead({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pressed = createEmbossedText(host.current, { paper: '#fbfaf4' })
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
import { createEmbossedText } from '@/beamish/effects/embossed-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pressed: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pressed = createEmbossedText(host.value, { paper: '#fbfaf4' })
  pressed.start()
})

onBeforeUnmount(() => pressed?.destroy())
</script>

<template>
  <h1 ref="host">Pressed into the sheet</h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Pulling it again.**

```ts
pressed.stop()
pressed.renderAtTime(0)
pressed.start()
```

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The sheet. This is not decoration: with no ink the letter face is painted this colour, so it has to match the page the text is actually sitting on, or the heading appears as a block of slightly wrong white and looks like a bug rather than a setting. The default is the house paper. If the page behind the text is a gradient or an image, a blind emboss cannot work at all: put ink on the type instead. |
| `ink` | color | `#2b2b24` | any CSS hex | The ink on the type, for when there is any. Letterpress ink sits in the bottom of the impression and reads darker than the same colour printed flat, so a softer black than you would normally pick is usually right. |
| `transfer` | number | `0` | 0 to 1 | How much ink transferred. 0 is a blind emboss, with no ink at all, and it is the setting worth trying first: it is the one thing this does that nothing else in the library does. Anything between is a light pull, which is a real thing and reads as one. |
| `depth` | number | `0.045` | 0 to 0.2 em (looks right between 0.03 and 0.08) | How deep the impression is, in ems, so it holds at any size. Small. A heavy impression is fashionable and it is also what a printer means by punching through the sheet; past about 0.1 this stops being a press and starts being a stamp. |
| `light` | number | `125` | 0 to 360 deg | Where the light comes from, with 0 to the right. Up and to the left is what nearly every photograph of printed matter uses, and it is what the eye reads as recessed rather than raised. Turn it 180 degrees and the same shadows read as embossing instead. |
| `softness` | number | `0.012` | 0 to 0.1 em | How soft the walls of the impression are. At 0 the edges are hard, which is a die cut rather than a press: paper compresses, so the wall of a real impression is a curve. |
| `press` | number | `620` | 60 to 3000 ms | Milliseconds for the platen to come down. A press is quick and heavy. Slow it far past a second and it reads as the letters fading in, which is the thing this is trying not to be. |
| `hold` | number | `240` | 0 to 4000 ms | Milliseconds before the press comes down. Also how you stagger two of these on one page. |
| `spring` | number | `0.35` | 0 to 1 | How much the paper pushes back. Paper is not clay: it compresses past where it ends up and returns some of that. At 0 the press arrives and stops, which reads as a fade rather than as a strike. |
| `makeready` | number | `0.45` | 0 to 1 | How uneven the impression is across the line. At 0 every letter bites identically, which is a forme that has been made ready properly and, on a screen, is indistinguishable from a CSS filter. The unevenness is the whole tell that something was pressed. |
| `seed` | number | `7` | 0 to 9999 | Seed for the unevenness. The same seed always gives the same forme, so a recorded video and a live page match letter for letter. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot press this should be a time after it has finished, so the text appears already pressed. That still frame is the whole effect with its one moving part stopped, which costs the viewer nothing here. |

## 5. `paper` has to be the real page colour

This is the one thing that will catch you out. With `transfer: 0` the letter
face is painted the `paper` colour, because that is what a blind emboss is: the
same sheet, pushed down. If `paper` does not match the page the text is actually
on, the heading appears as a block of slightly wrong white, and it looks like a
bug rather than like a setting.

If the page behind the text is a gradient or an image, a blind emboss cannot
work. Put some ink on the type instead, with `transfer` somewhere above about
0.6, and the letter stops depending on the background.

## 6. Size

Depth and softness are in ems, so one impression looks the same at every size.
What does change with size is whether the impression is visible at all: at body
size a 0.045em wall is under a pixel, and the effect vanishes. This is for a
heading, and the larger the better.

It is also why the inked setting needs more depth than the blind one. Ink is
high contrast and it hides the impression, which is true of the real thing too:
look at a letterpress business card and the bite is easiest to see where there
is no ink.

## 7. Accessibility. Do not skip this

The characters are marked `aria-hidden` and a visually hidden copy of the
original string sits alongside them, so a screen reader reads the sentence.

A blind emboss has almost no contrast by design, which means it fails WCAG 1.4.3
as body copy and should only ever be decorative or a heading that is repeated in
accessible text nearby. That is not a flaw in the implementation, it is what the
print technique is: a blind emboss is for texture, and a reader who needs
contrast needs ink.

## 8. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives, though it will be the `paper` colour on the first
frame only once the effect has mounted. For a blind emboss above the fold, set
the heading's own `color` to the paper colour in CSS as well, so there is no
flash of dark text.

Call `createEmbossedText` from `useEffect`, `onMounted`, or a `client:*` island.

## 9. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. For this item the still frame is the finished impression,
which costs the viewer nothing.

## 10. The three mistakes most likely to be made here

1. **The shadows the wrong way round.** The dark edge goes on the side the light
   comes from. The other way is embossing, which stands proud of the sheet, and
   the two look nothing alike once you have seen both.

2. **`paper` left at the default on a white page.** The letters become a block
   of cream on white. It has to be the page colour.

3. **`makeready: 0`.** Every letter bites identically and the result is
   indistinguishable from a static CSS filter. The unevenness is the tell.

4. **Using it at body size.** The impression is sub-pixel and disappears. It is
   a heading effect.

5. **A deep impression because it looks impressive.** Past about 0.1em it is no
   longer a press, it is a stamp, and a printer would tell you it is punching
   through the sheet.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/embossed-text/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/embossed-text/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
