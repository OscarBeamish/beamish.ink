You are adding **DecodeText** from Beamish to this project.

> Text resolving out of a run of cipher glyphs, one character at a time, without the line moving while it does. Type · effect · MIT.
> https://beamish.ink/effects/decode-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. It splits the text already in the element and swaps the characters that have not landed yet
- Pure in t. The usual way to write this is Math.random on a timer, which cannot be seeked, cannot be recorded, and shows something different every time anybody looks at it. The glyph at each position is a hash of the position, the seed and the frame number, so the same t always gives the same frame
- The glyphs change on their own cadence rather than once per frame. A per-frame swap is a grey blur at 120Hz and a legible stream at 30, which means the effect would look like a different effect depending on the monitor
- Each character is held in a box the width of the letter it will become, so a line decoding in the middle of a page does not push the page about. Turn `steady` off for monospace, where every box is the same width anyway
- Whitespace and punctuation are left alone. They carry the shape of the sentence, and scrambling the spaces turns text being decoded into a block of noise. It is also what keeps the word wrapping intact
- The original string stays in the accessibility tree as one label, so a screen reader reads the sentence rather than a live stream of junk
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
| `src/beamish/effects/decode-text/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/decode-text/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

DecodeText resolves text out of a run of substitute glyphs, one character at a time.
It is the effect on the hover of every studio nav bar, and on a good number of
the headlines that win awards for being difficult to read.

It takes an element that already contains text, splits it into characters, and
swaps the ones that have not landed yet. There is no canvas, no WebGL and no npm
dependency.

Three things it does that the version written in an afternoon does not.

It is pure in `t`. The obvious implementation calls `Math.random()` on a timer
and mutates as it goes, which cannot be seeked, cannot be recorded, and shows
something different every time anybody looks at it. Here the glyph at each
position is a hash of the position, the seed and the frame number, so the same
`t` always gives the same frame.

The glyphs change on their own cadence rather than once per display frame. At
120Hz a per-frame swap is a grey blur with no characters in it; at 30 it reads as
text being typed by something in a hurry. Fixing the cadence means the effect
looks the same on a 60Hz laptop, on a 144Hz monitor, and in a recording of
either.

Nothing moves. Each character is held in a box the width of the letter it will
become, and the substitutes are chosen from the glyphs that fit that box, so a
line decoding in the middle of a page neither pushes the page about nor collides
with itself while it runs.

`destroy()` puts the original text back. The element is left as it was found.

## 3. Wire it in

**Plain HTML.** The text must already be in the element. DecodeText splits what it
finds.

```html
<h1 id="headline">A headline sits here</h1>

<script type="module">
  import { createDecodeText } from './beamish/effects/decode-text/core.js'

  const cipher = createDecodeText(document.querySelector('#headline'))
  cipher.start()
</script>
```

**React.** Render the text as children, then split it in an effect. Do not build
the spans in JSX: React will fight the DOM changes on the next render.

```tsx
import { useEffect, useRef } from 'react'
import { createDecodeText } from '@/beamish/effects/decode-text/core'

export function Headline({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const cipher = createDecodeText(host.current, { stagger: 45 })
    cipher.start()
    return () => cipher.destroy()
  }, [children])

  return <h1 ref={host}>{children}</h1>
}
```

The dependency on `children` is deliberate. If the text changes, the split has to
be rebuilt.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createDecodeText } from '@/beamish/effects/decode-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let cipher: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  cipher = createDecodeText(host.value)
  cipher.start()
})

onBeforeUnmount(() => cipher?.destroy())
</script>

<template>
  <h1 ref="host">A headline sits here</h1>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Replaying it.** DecodeText runs once from `t = 0`. To play it again, reset the clock
and start:

```ts
cipher.stop()
cipher.renderAtTime(0)
cipher.start()
```

**On hover, which is what it is for.** Mount it without starting, and replay on
`pointerenter`. Let the run finish rather than reversing it on the way out: a
label abandoned half decoded is unreadable, and it is unreadable at exactly the
moment somebody is trying to read it.

```ts
const link = document.querySelector('#nav-link')
const cipher = createDecodeText(link, { stagger: 28, hold: 0 })

let running = false
link.addEventListener('pointerenter', () => {
  if (running) return
  running = true
  cipher.renderAtTime(0)
  cipher.start()
  // The run is hold plus stagger per character, and it is worth working out
  // rather than guessing: the guard is what stops a cursor swept along a bar
  // from stacking three runs on the same label.
  const length = 0 + 28 * link.textContent.length
  setTimeout(() => {
    cipher.stop()
    running = false
  }, length + 200)
})
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a scroll-triggered reveal with no extra code.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `glyphs` | string | `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+-=?/<>[]{}` | any value | The characters it cycles through before each letter lands. Keep them the same case and roughly the same weight as the text, or the line flickers between dark and light as it runs. Katakana is the one everybody reaches for and the one that dates the effect hardest. |
| `order` | enum | `forward` | `forward` · `reverse` · `centre` · `random` | The order the characters land in. Forward reads as something being typed or decoded. Random reads as something settling, and is the better one for a paragraph, where a left to right sweep takes long enough to watch. |
| `stagger` | number | `45` | 0 to 300 ms (looks right between 20 and 90) | Milliseconds between one character landing and the next. This is the control that sets the length of the whole run, because the last character lands at hold plus stagger times the number of characters. Short text can afford to be slow; a paragraph at 45ms is a run most of a minute long. |
| `hold` | number | `160` | 0 to 2000 ms (looks right between 0 and 400) | Milliseconds of cipher before the first character lands. A short hold is what makes it read as text arriving from somewhere rather than as text already there and merely untidy. |
| `rate` | number | `18` | 2 to 60 per second (looks right between 12 and 24) | Glyph changes per second, and a cadence rather than a frame rate: everything still running changes on the same tick, which is what makes the line read as one mechanism rather than a row of independent ones. Past about 30 the characters stop being readable and the whole thing greys out. |
| `dim` | number | `0.45` | 0 to 1 | How much paler an unlanded glyph is than the settled text. The reason to have it at all is that it separates the two states by more than the letters themselves do, so the text reads as arriving rather than as correcting itself. |
| `steady` | boolean | `true` | `true` · `false` | Hold each character in a box the width of the letter it will become. On for anything set in a proportional face, where an I becoming a W is enough to shift the rest of the line. Off for monospace, where the boxes are all the same width and measuring them is work for nothing. |
| `seed` | number | `7` | 0 to 9999 | Seed for the glyphs and for the random order. The same seed always gives the same run, so a recorded video and a live page match character for character. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot reveal this should be a time after the run has finished, so the text simply appears. |

## 5. Choosing the settings

`stagger` sets the length of the run, and it multiplies: the last character lands
at `hold + stagger × characters`. Forty-five milliseconds is right for a few
words and far too slow for a paragraph, where it is a run the better part of a
minute long. Over about forty characters, drop `stagger` to around 10 and switch
`order` to `random`, which settles the block as a whole rather than sweeping a
front across it.

`glyphs` wants to be the same case and roughly the same weight as the text it is
standing in for. Substitutes take the case of the letter they replace, so the
set can be written in capitals and still sit correctly in lowercase text. Katakana
is the set everybody reaches for and the one that dates the effect hardest.

`steady` is for proportional faces. In a monospace face every box is the same
width already, and the measuring is work for nothing.

## 6. Accessibility. Do not skip this

The split version is marked `aria-hidden`, and a visually hidden copy of the
original string sits alongside it. A screen reader reads the sentence. Without
this the effect is worse than a split headline, which merely spells itself out:
a screen reader on a live cipher reads a stream of junk.

Do not put an `aria-label` on the element as well. Two labels is worse than none.

## 7. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text, and stays readable if the
JavaScript never arrives. Splitting only happens on the first frame. Call
`createDecodeText` from `useEffect`, `onMounted`, or a `client:*` island.

## 8. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For a one-shot reveal that default is 999, which is any time after the run has
finished. The text simply appears, fully set, which is the correct outcome. Do
not set it to 0: that leaves the headline as a line of nonsense that never
resolves, which is the worst of the three states it could be in.

## 9. The three mistakes most likely to be made here

1. **Writing it with `Math.random()` on a `setInterval`.** It is the natural way
   to write it and it costs you the two things that matter: the effect can no
   longer be seeked or recorded, and it draws a different frame every time the
   page is loaded, so there is nothing to compare a change against.

2. **Swapping the glyph every frame.** The cadence is not the frame rate. A swap
   per frame is legible on a 60Hz monitor, a blur on a 144Hz one, and something
   else again in a 30fps recording of the same page.

3. **Leaving the boxes unpinned on a proportional face.** Every substitution
   changes the width of the line, so the text jitters, and anything laid out
   after it jitters too. This is why most versions of this effect only ever
   appear on short monospace labels.

4. **Scrambling the spaces.** Text with its spaces replaced is not text being
   decoded, it is a block of noise, and it rewraps on every tick. DecodeText leaves
   whitespace and punctuation alone.

5. **Running it on hover with no guard.** A cursor swept along a nav bar starts a
   run on every label it crosses, and re-entering one that is still going stacks
   a second run on top of the first. One flag fixes it.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/decode-text/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/decode-text/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
