You are adding **RegistrationMarks** from Beamish to this project.

> The marks a printer puts outside the trim, with the plates slightly out of register and drifting. Backdrops · effect · MIT.
> https://beamish.ink/effects/registration-marks

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- A registration mark is a ring with a cross through it, and the arms run past the ring on all four sides. That is not a style: the ring reads rotation and the arms read translation, so a printer can judge both through a loupe at once
- The subject is the error. Three plates, each drifting on its own closed orbit, which is what a press operator is looking for when they pull a sheet and hold it up. At spread 0 it is a sheet in perfect register, which is the correct answer and much the duller picture
- The inks multiply. Where all three plates land together the mark goes nearly black, and where they have come apart you see three coloured marks beside each other, which is exactly how misregistration announces itself. Added instead, that difference is lost
- Everything is a signed distance in CSS pixels, softened by one pixel's footprint. That is not for looks: these are hairlines moving by fractions of a pixel, and a hairline without anti-aliasing crawls between whole pixels as it drifts. The sub-pixel movement is the entire subject, so it has to be the thing that survives
- The plates orbit rather than wander, a third of a turn apart, so after one period every plate is back where it started and the loop closes. A press drifts because something is turning
- The colour bar along the foot is the other half of what a printer reads off a sheet: one solid patch per plate, for a densitometer
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- Measured at 0.023 mean absolute change per frame on a 0 to 255 scale, which makes it the quietest backdrop here after PaperGrain, and 0.55ms at 640 by 360. Nearly all of the frame is bare paper
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/registration-marks/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/registration-marks/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The sheet. Nearly all of the frame is this, which is the point: registration marks live in the margin and the margin is mostly empty. |
| `first` | color | `#1b6f8c` | any CSS hex | The first plate. Process colours are the honest choice here, but any three inks that can be told apart will do: the whole effect depends on seeing which plate has moved. |
| `second` | color | `#c44400` | any CSS hex | The second plate. |
| `third` | color | `#36362f` | any CSS hex | The third plate. Making one of them the key black is worth it, because black over the other two is what a mark in register actually looks like. |
| `size` | number | `17` | 5 to 60 px (looks right between 12 and 26) | Radius of a mark's ring. Real ones are a few millimetres across and read at arm's length, so keep them small: a large registration mark is a logo. |
| `weight` | number | `1.4` | 0.4 to 6 px | Thickness of the rules. Hairline, because the whole purpose of the mark is to resolve a small error, and a thick rule cannot show a small error. It is also why the anti-aliasing matters so much here. |
| `arms` | number | `1.8` | 1 to 4 | How far the cross runs past the ring, as a share of the radius. At 1 the arms stop at the ring and it is a target rather than a registration mark. |
| `margin` | number | `0.13` | 0.02 to 0.45 | How far the marks sit in from the edge, as a share of the short side. On a press sheet they are outside the trim, so near the edge is the truthful setting and also the one that leaves the middle of the frame free. |
| `spread` | number | `3.2` | 0 to 30 px (looks right between 1.5 and 6) | Worst misregistration, in pixels, and the whole subject. A few pixels is a press that needs attention; twenty is a sheet nobody would let off the floor. At 0 the plates sit exactly on top of each other and the marks read as one black mark, which is what a printer is aiming for and the dullest version of this. |
| `bar` | number | `18` | 0 to 60 px | Height of the colour bar along the foot, one solid patch per plate. 0 leaves only the marks, which is cleaner and loses the other half of what a printer reads off a sheet. |
| `period` | number | `32` | 8 to 180 s | Seconds for one cycle of the drift. A press does not go out of register quickly, and this is a backdrop, so long. |

## 5. Two details that carry it

**The inks multiply.** Where the three plates land together the mark goes nearly
black; where they have come apart you see three coloured marks beside each
other. That difference is exactly how misregistration announces itself, and
adding the inks instead loses it.

**Everything is anti-aliased to one pixel's footprint.** These are hairlines
moving by fractions of a pixel, and a hairline without anti-aliasing crawls
between whole pixels as it drifts. The sub-pixel movement is the entire subject,
so it has to be the thing that survives.

## 6. Putting things on it

This is the quietest backdrop here after PaperGrain: 0.023 mean absolute change
per frame, and nearly all of the frame is bare paper. The marks live in the
margin, which is where they live on a real sheet, so the middle is free.

Set `margin` to put them further out and the page gets more room. Set `bar: 0`
to drop the colour bar if the foot of the frame is where your content is.

What it wants is to frame something: a section, a quote, a plate. It reads as a
page in production rather than a page that is finished, which is a tone worth
reaching for deliberately and worth avoiding by accident.

## 7. How wrong to make it

`spread` is the worst misregistration, in pixels. A few is a press that needs
attention and is the setting that reads as a real sheet. Twenty is something
nobody would let off the floor, which is funnier but stops being a registration
mark and starts being three rings.

At 0 the plates sit on top of each other and the marks are black. That is what
a printer is aiming for, and it makes a perfectly good static mark if you want
the furniture without the drift.

## 8. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener. One live context at a time is the budget,
so call it.

There is nothing to render on the server. The element is empty until the first
frame. Call `createRegistrationMarks` from `useEffect`, `onMounted`, or a
`client:*` island.

## 9. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`.
The marks are the thing and they are all there in one frame, so nothing is
lost.

## 10. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/registration-marks/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/registration-marks/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
