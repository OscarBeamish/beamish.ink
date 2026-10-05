## What it is

A printing plate slipping out of register, so the word prints twice in two inks.

The usual version of this splits the red and blue channels apart and calls it a
glitch. That is a television fault: an analogue signal arriving at the wrong
time. Paper has its own version of the same idea and it looks quite different. A
press lays one plate per ink, and if a plate is a fraction out of position its
colour prints beside the others rather than on top of them.

So this is three copies of the same text, two of them coloured and offset, and
the stack **multiplies** rather than composites, because that is what overlapping
ink does. The overlap going darker is the whole tell. A channel split goes
brighter where the channels meet, which is light, not ink, and it is the thing
that makes the usual version read as a screen rather than as a page.

Registration does not drift, either. A plate sits wrong for a whole run and then
gets knocked, so the offset holds still and then jumps. Easing it would turn a
press into a wobble, and a wobble is a very different and much less interesting
fault.

No canvas and no WebGL. Three stacked spans and two transforms per frame.

## The text is your markup

It is whatever is already in the element.

```html
<h1 id="title">Out of register</h1>
```

```ts
import { createMisprintText } from './beamish/effects/misprint-text/core'

const misprint = createMisprintText(document.querySelector('#title'))
misprint.start()
```

The in-register plate stays in normal flow, so it is the one that sizes the
element and the one a mouse can select. The two that move are `aria-hidden` and
`pointer-events: none`, so a screen reader reads the text once and selecting it
gives you one copy rather than three. `destroy()` puts the original text back.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createMisprintText } from '@/beamish/effects/misprint-text/core'

export function Title({ children }: { children: string }) {
  const host = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!host.current) return
    const misprint = createMisprintText(host.current)
    misprint.start()
    return () => misprint.destroy()
  }, [children])

  return <h1 ref={host}>{children}</h1>
}
```

The text is read once, at setup, so put it in the dependency array if it can
change. Option values should not go there: call `update()` instead.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createMisprintText } from '@/beamish/effects/misprint-text/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let misprint: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  misprint = createMisprintText(host.value)
  misprint.start()
})

onBeforeUnmount(() => misprint?.destroy())
</script>

<template>
  <h1 ref="host">Out of register</h1>
</template>
```

## Tuning it

`slip` is in em, so one setting works at every type size and you do not need a
different number for a heading and a caption. Past about 0.12 the words separate
far enough that you are reading three of them rather than one printed badly.

`hold` and `chance` are what keep it from being a strobe. `hold` is how long a
plate keeps its position, and `chance` is the share of runs where the plates are
out at all. A press that is always wrong is not a press that is nearly right: at
`chance` 1 the text never settles and there is nothing to notice, because there
is no correct state to compare against.

`skew` wants to stay small. A plate out by a whole degree is a plate that has
fallen off the press.

## Pausing

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable, and this moves indefinitely. `stop()` and `start()` are on the handle
for that. Surface them as a real control in your own build.

The jump rate is also worth a thought under WCAG 2.3.1, which is Level A and
allows at most three changes a second. The default `hold` of 1.4 seconds is well
inside that. If you drop it below about 0.34 you are in breach, so do not.

## Reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn, at `reducedMotionTime`, which defaults to 0.

Whether that frame is in or out of register depends on `seed`. If you want it
reliably settled for those readers, mount with `chance: 0` when
`matchMedia('(prefers-reduced-motion: reduce)')` matches: clean type is the
correct outcome and it costs nothing.

## Cleanup and SSR

`destroy()` restores the original text, cancels the RAF, disconnects both
observers and removes every listener. There is no WebGL context to release.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## Common mistakes

1. **Using it on a paragraph.** Three stacked copies of a block of body text is
   unreadable, and the offset is per-element rather than per-line so a wrapped
   paragraph moves as one slab. It is for a heading.

2. **Raising `chance` to 1.** The text never returns to register, so there is
   nothing to read the misprint against and it stops looking like an error. The
   effect lives in the contrast between right and nearly right.

3. **Picking two dark inks.** They multiply, so the overlap is darker than
   either. Two near-blacks give you a slightly blacker black and no visible
   separation. One of the three wants to be light.

4. **Expecting it to work on a background colour.** `mix-blend-mode: multiply`
   blends with whatever is painted behind, which is the point on paper and a
   problem over a photograph. On a busy background, put it on its own layer.
