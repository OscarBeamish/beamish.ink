You are adding **TypewriterText** from Beamish to this project.

> Text typed on a machine with type bars: an uneven hand, a breath at the punctuation, and every letter struck a little off square. Type · effect · MIT.
> https://beamish.ink/effects/typewriter-text

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. The string is already in the element and the untyped part is hidden rather than absent, so the line boxes are final from the first frame and a paragraph typing itself in the middle of a page does not push the page about
- The rhythm is uneven. Each character takes its own interval from a hash, spread around the mean rather than added to it, so raising the unevenness does not also slow the whole thing down
- It takes a breath at the punctuation: a full stop costs the full pause, a comma a third of it, a space an eighth. That pause is most of what makes typing sound like language rather than like a machine gun, and it is the one thing an even timer can never give you
- Every letter is struck rather than placed. It lands a fraction off the baseline, a fraction off square, and with more or less ink depending on how it was hit. All three come off one hash of the letter's index, so the same string always types the same way and the recorder gets the same frames
- The caret is solid while typing and blinks once it stops, which is what a caret does. The blink runs on its own clock rather than on the typing one, so it does not stutter when the rhythm does
- One caret element for the whole string, moved to the cell the next character will land in. A caret per character is 2N elements for something only one of them is ever doing
- The schedule is built from the text rather than from the clock, so seeking to the middle of a run costs one scan and the effect is pure in t
- The original string stays in the accessibility tree as one label. The alternative is a label that grows a character at a time, which is a live region nobody asked for
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
| `src/beamish/effects/typewriter-text/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/typewriter-text/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

TypewriterText types text one character at a time, on a machine with type bars
rather than a cursor that reveals a string.

The usual implementation animates the width of a box, or appends to a string on
a timer, and both have the same two faults: the rhythm is perfectly even, which
no typist has managed, and every letter lands exactly in place, which no
typewriter has managed either. The result is a progress bar made of letters.

Four things here instead, and all four are cheap.

**The rhythm is uneven.** Each character takes its own interval from a hash,
spread around the mean rather than added to it, so turning the unevenness up
does not also slow the run down.

**It takes a breath at the punctuation.** A full stop costs the full pause, a
comma a third of it, a space an eighth. This is most of what makes typing sound
like language rather than like a machine gun, and it is the one thing an even
timer can never give you.

**Each letter is struck rather than placed.** It lands a fraction off the
baseline, a fraction off square, and with more or less ink depending on how it
was hit. All three come off one hash of the letter's index, so the same string
always types the same way.

**The caret is solid while typing and blinks once it stops**, which is what a
caret does, on its own clock rather than on the typing one.

Nothing reflows. The whole string is in the element from the start and the
untyped part is hidden rather than absent, so a paragraph typing itself in the
middle of a page does not push the page about. The letters are invisible either
way, so it looks the same, and the layout is the one it will finish at.

## 3. Wire it in

**Plain HTML.** The text must already be in the element.

```html
<p id="intro">It is uneven on purpose.</p>

<script type="module">
  import { createTypewriterText } from './beamish/effects/typewriter-text/core.js'

  const typed = createTypewriterText(document.querySelector('#intro'))
  typed.start()
</script>
```

**React.** Pass the text as children. Do not build the characters in JSX: React
overwrites the DOM on the next render and the typing stops half way.

```tsx
import { useEffect, useRef } from 'react'
import { createTypewriterText } from '@/beamish/effects/typewriter-text/core'

export function Intro({ children }: { children: string }) {
  const host = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (!host.current) return
    const typed = createTypewriterText(host.current, { pace: 26 })
    typed.start()
    return () => typed.destroy()
  }, [children])

  return <p ref={host}>{children}</p>
}
```

The dependency on `children` is deliberate. If the text changes, the schedule
and the characters have to be rebuilt.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createTypewriterText } from '@/beamish/effects/typewriter-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let typed: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  typed = createTypewriterText(host.value)
  typed.start()
})

onBeforeUnmount(() => typed?.destroy())
</script>

<template>
  <p ref="host">It is uneven on purpose.</p>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Typing it again.** It runs once from `t = 0`:

```ts
typed.stop()
typed.renderAtTime(0)
typed.start()
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a scroll-triggered reveal with no extra code.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `pace` | number | `62` | 8 to 400 ms (looks right between 25 and 110) | Average milliseconds between one character and the next. It multiplies by the length of the string, so a sentence at 62ms is about four seconds and a paragraph at 62ms is a minute. Heading slow, body fast: about 90 for a line somebody is meant to watch and about 25 for copy they are meant to read. |
| `rhythm` | number | `0.6` | 0 to 1 | How uneven the hand is. At 0 it is a machine, and an even typewriter is the single thing that gives away every version of this effect. Spread around the mean rather than added to it, so this does not change how long the run takes. |
| `pause` | number | `420` | 0 to 2000 ms (looks right between 200 and 600) | Extra milliseconds after a full stop. A comma takes a third of it and a space an eighth. This is the setting that makes it read as somebody writing: at 0 the punctuation goes by at the same speed as the letters and the whole thing flattens. |
| `hold` | number | `300` | 0 to 6000 ms | Milliseconds before the first character. Also how you stagger two of these: give the paragraph a hold long enough to let the heading finish. |
| `jitter` | number | `0.035` | 0 to 0.2 em (looks right between 0.02 and 0.06) | How far off the baseline a letter lands, in ems, so it holds at any size. Small. A type bar is a mechanism with slack in it, not a drunk. |
| `skew` | number | `1.1` | 0 to 8 deg (looks right between 0.5 and 2.5) | How far off square a letter lands. Past about three degrees it stops reading as a machine with slack and starts reading as a ransom note. |
| `ribbon` | number | `0.35` | 0 to 1 | How much the ribbon varies: the ink a strike leaves. A worn ribbon gives an uneven page, and this is the difference between type that was struck and type that was set. |
| `caret` | number | `0.09` | 0 to 0.6 em | Width of the caret, in ems. A real typewriter has no caret at all, so 0 is the historically honest setting and the one to use when the effect is standing in for a printed page rather than for a screen. |
| `blink` | number | `1060` | 200 to 3000 ms | Milliseconds for one blink, once typing has stopped. It runs on its own clock rather than on the typing one. Keep it slow: a fast blink is the fastest way to make a block of text hard to sit with. |
| `seed` | number | `7` | 0 to 9999 | Seed for the rhythm and the strikes. The same seed always gives the same hand, so a recorded video and a live page match letter for letter. Change it to give two blocks of text on the same page two different typists. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot reveal this should be a time after the typing has finished, so the text simply appears. The strikes are still there in that frame, which is the nice part: the page looks typed rather than set. |

## 5. Pace is a function of length

`pace` is the average gap between characters, so it multiplies by how long the
string is. A sentence at 62ms is about four seconds. A paragraph at 62ms is a
minute, and nobody waits a minute.

Rough guide: **90ms** for a line somebody is meant to watch, **25ms** for copy
somebody is meant to read. If a block is long enough that even 25ms is too slow,
it is too long to type at all: type the heading and let the copy arrive with
ScrollRevealRows or ScrambleText.

## 6. Two of them on one page

Give the second a `hold` long enough to let the first finish, and a different
`seed` so they are two different typists rather than the same hand twice. The
demo does both.

## 7. Accessibility. Do not skip this

The characters are marked `aria-hidden` and a visually hidden copy of the
original string sits alongside them. A screen reader reads the sentence once,
whole. The alternative, a label that grows by a character at a time, is a live
region nobody asked for and it is genuinely unusable.

Do not put an `aria-label` on the element as well. Two labels is worse than
none.

## 8. Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The characters are only split on the first frame. Call
`createTypewriterText` from `useEffect`, `onMounted`, or a `client:*` island.

## 9. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For a one-shot reveal that default is 999, which is after the typing has
finished. The strikes are still in that frame, which is the nice part: the page
looks typed rather than set, with no motion at all.

## 10. The three mistakes most likely to be made here

1. **An even rhythm.** `rhythm: 0` is a machine, and it is the single thing that
   gives away every version of this effect. A typist does not keep time.

2. **No pause at the punctuation.** With `pause: 0` a full stop goes by at the
   same speed as a letter, and the whole thing flattens into a crawl. The
   pauses are the prosody.

3. **Leaving `pace` at the default for a paragraph.** It multiplies. Three
   hundred characters at 62ms is nearly twenty seconds of someone waiting.

4. **Revealing by removing the text.** Then the line boxes grow as it types and
   everything below the paragraph moves on every character. The untyped part is
   hidden here, not absent, which is why the page stays still.

5. **A fast caret blink.** It is the quickest way to make a block of text
   impossible to sit with. Slow, or `caret: 0`, which is also what a real
   typewriter has.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/typewriter-text/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/typewriter-text/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
