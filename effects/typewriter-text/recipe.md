## What it is

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

## Wiring

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

## Pace is a function of length

`pace` is the average gap between characters, so it multiplies by how long the
string is. A sentence at 62ms is about four seconds. A paragraph at 62ms is a
minute, and nobody waits a minute.

Rough guide: **90ms** for a line somebody is meant to watch, **25ms** for copy
somebody is meant to read. If a block is long enough that even 25ms is too slow,
it is too long to type at all: type the heading and let the copy arrive with
ScrollRevealRows or ScrambleText.

## Two of them on one page

Give the second a `hold` long enough to let the first finish, and a different
`seed` so they are two different typists rather than the same hand twice. The
demo does both.

## Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

The text renders on the server as ordinary text and stays readable if the
JavaScript never arrives. The characters are only split on the first frame. Call
`createTypewriterText` from `useEffect`, `onMounted`, or a `client:*` island.

## Accessibility

The characters are marked `aria-hidden` and a visually hidden copy of the
original string sits alongside them. A screen reader reads the sentence once,
whole. The alternative, a label that grows by a character at a time, is a live
region nobody asked for and it is genuinely unusable.

Do not put an `aria-label` on the element as well. Two labels is worse than
none.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`.

For a one-shot reveal that default is 999, which is after the typing has
finished. The strikes are still in that frame, which is the nice part: the page
looks typed rather than set, with no motion at all.

## Common mistakes

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
