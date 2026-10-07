## What it is

RegistrationMarks draws the marks a printer puts outside the trim so the plates
can be lined up, with the plates slightly out of register and drifting.

A registration mark is a ring with a cross through it, and the arms run past the
ring on all four sides. That is not a style choice: the ring reads rotation and
the arms read translation, so an operator can judge both through a loupe at
once. Each ink gets its own set in its own colour, and when the press is right
they sit exactly on top of one another and read as a single black mark.

So the subject here is the error. Three plates, each drifting on its own closed
orbit, which is what a press operator is looking at when they pull a sheet and
hold it up to the light. At `spread: 0` the plates land together and the marks
go black, which is the correct answer and much the duller picture.

Along the foot is the colour bar: one solid patch per plate, the way a sheet
carries them for a densitometer. It is the other half of what a printer reads
off a sheet.

## Two details that carry it

**The inks multiply.** Where the three plates land together the mark goes nearly
black; where they have come apart you see three coloured marks beside each
other. That difference is exactly how misregistration announces itself, and
adding the inks instead loses it.

**Everything is anti-aliased to one pixel's footprint.** These are hairlines
moving by fractions of a pixel, and a hairline without anti-aliasing crawls
between whole pixels as it drifts. The sub-pixel movement is the entire subject,
so it has to be the thing that survives.

## Wiring

**Plain HTML.** The element needs a size. The canvas fills it.

```html
<section id="sheet" style="height: 80vh"></section>

<script type="module">
  import { createRegistrationMarks } from './beamish/effects/registration-marks/core.js'

  const sheet = createRegistrationMarks(document.querySelector('#sheet'))
  sheet.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createRegistrationMarks } from '@/beamish/effects/registration-marks/core'

export function Sheet() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sheet = createRegistrationMarks(host.current, { spread: 3.2 })
    sheet.start()
    return () => sheet.destroy()
  }, [])

  return <div ref={host} className="absolute inset-0 -z-10" />
}
```

Mount once. Option changes go through `update()` rather than a remount, because
a remount is a new WebGL context and the budget for those is small.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createRegistrationMarks } from '@/beamish/effects/registration-marks/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sheet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sheet = createRegistrationMarks(host.value)
  sheet.start()
})

onBeforeUnmount(() => sheet?.destroy())
</script>

<template>
  <div ref="host" class="sheet" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Putting things on it

This is the quietest backdrop here after PaperGrain: 0.023 mean absolute change
per frame, and nearly all of the frame is bare paper. The marks live in the
margin, which is where they live on a real sheet, so the middle is free.

Set `margin` to put them further out and the page gets more room. Set `bar: 0`
to drop the colour bar if the foot of the frame is where your content is.

What it wants is to frame something: a section, a quote, a plate. It reads as a
page in production rather than a page that is finished, which is a tone worth
reaching for deliberately and worth avoiding by accident.

## How wrong to make it

`spread` is the worst misregistration, in pixels. A few is a press that needs
attention and is the setting that reads as a real sheet. Twenty is something
nobody would let off the floor, which is funnier but stops being a registration
mark and starts being three rings.

At 0 the plates sit on top of each other and the marks are black. That is what
a printer is aiming for, and it makes a perfectly good static mark if you want
the furniture without the drift.

## Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createRegistrationMarks` from `useEffect`, `onMounted`, or a
`client:*` island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`.
The marks are the thing and they are all there in one frame, so nothing is
lost.

## Common mistakes

1. **Hard-edged rules.** A hairline that is not anti-aliased crawls between
   whole pixels as it drifts, which is the one thing this effect must not do:
   the sub-pixel movement is what it is about.

2. **Adding the inks.** Where plates overlap you want them to go dark, because
   that is what tells you they are in register. Added, they go bright.

3. **Arms that stop at the ring.** Then it is a target, not a registration
   mark. The arms running past are how translation is read.

4. **Making them large.** Real ones are a few millimetres and read at arm's
   length. A big registration mark is a logo.

5. **Using it under a finished page.** It says production, press sheet, work in
   progress. That is a strong note to strike by accident.
