You are adding **OdometerNumber** from Beamish to this project.

> A number on wheels, where a wheel only turns while the one below it goes from nine round to nought. Type · effect · MIT.
> https://beamish.ink/effects/odometer-number

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The carry is the whole difference between this and ten independent spinners, and it is one line of arithmetic. A wheel is driven by the one to its right and turns only while that one is going from nine round to nought, so the tens wheel sits perfectly still for most of the units wheel's revolution and then turns all at once
- You can see it on any petrol pump: the pence wheel is a blur, the pounds wheel steps, and the tens of pounds wheel has not moved all day. Get it wrong and every wheel turns at its own steady speed, which is a fruit machine
- `carry` chooses the mechanism. Narrow is a geneva drive and snaps, so every figure sits squarely in its window. 1 is a straight gear train, and that one has a consequence: a continuously geared counter never shows clean figures except at exact multiples, which is why a gas meter is read to the last settled digit. The demo shows both, because they look nothing alike
- Each strip carries nought to nine and then nought again. Without the repeat a wheel rolling off nine has nothing to roll on to and snaps back through the whole drum
- The figures near the edge of the window are shaded, because they are on the curve of the wheel and going out of sight. Flat instead, they slide past as though printed on a belt
- The window is an em tall, so it follows the type. Only the pixel value for the transform is read from the layout, and only on resize
- A screen reader is given the value as a number, once, in a hidden label. A column of digits read aloud is not a number
- Pure in t: each wheel's position is arithmetic on the value and the value is arithmetic on the clock
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/odometer-number/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/odometer-number/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

OdometerNumber is a number on wheels. Each digit is a strip of figures behind a
window, and the strips roll.

The whole difference between this and ten independent spinners is the **carry**,
and it is one line of arithmetic. A wheel does not move on its own: it is driven
by the one to its right, and it only turns while that one is going from nine
round to nought. So the tens wheel sits perfectly still for most of the units
wheel's revolution and then turns all at once, and the hundreds wheel is still
for most of that.

You can see it on any petrol pump. The pence wheel is a blur, the pounds wheel
steps, and the tens of pounds wheel has not moved all day. Get it wrong and
every wheel turns at its own steady speed, which is a fruit machine.

## 3. Wire it in

**Plain HTML.** Whatever is in the element is replaced by the wheels, and put
back on destroy.

```html
<span id="miles">0</span>

<script type="module">
  import { createOdometerNumber } from './beamish/effects/odometer-number/core.js'

  const miles = createOdometerNumber(document.querySelector('#miles'), {
    to: 128640
  })
  miles.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createOdometerNumber } from '@/beamish/effects/odometer-number/core'

export function Miles({ to }: { to: number }) {
  const host = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!host.current) return
    const miles = createOdometerNumber(host.current, { to, digits: 6 })
    miles.start()
    return () => miles.destroy()
  }, [to])

  return <span ref={host}>{to}</span>
}
```

The dependency on `to` is deliberate: a new target is a new run.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createOdometerNumber } from '@/beamish/effects/odometer-number/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let miles: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  miles = createOdometerNumber(host.value, { to: 128640 })
  miles.start()
})

onBeforeUnmount(() => miles?.destroy())
</script>

<template>
  <span ref="host">128640</span>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Running it again.**

```ts
miles.stop()
miles.renderAtTime(0)
miles.start()
```

**Revealing on scroll.** Do not add an `IntersectionObserver`. The runtime
already has one: it holds the loop until the element is on screen, so calling
`start()` on mount gives you a counter that runs when it is seen.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `from` | number | `0` | 0 to 1000000000 | Where the count starts. A real odometer starts wherever it was left, so this is also how you show a figure that is already high and only moves a little. |
| `to` | number | `128640` | 0 to 1000000000 | Where it ends. The distance between the two decides how much rolling there is to watch: a change of twelve on a six-wheel counter moves one wheel and nudges a second. |
| `duration` | number | `4200` | 200 to 30000 ms (looks right between 2000 and 6000) | Milliseconds for the whole travel, eased so it arrives rather than stops. Longer than a count-up wants to be, because the mechanism is the point and a fast roll is a blur. |
| `hold` | number | `300` | 0 to 5000 ms | Milliseconds before it starts. A moment of the starting figure is what tells you the wheels were somewhere before they moved. |
| `digits` | number | `6` | 1 to 12 | Fewest wheels to show, padded with leading figures. Six is a car. The leading noughts are not decoration: a counter with a fixed number of wheels is what makes it a counter rather than a number, and it stops the layout changing width as the value grows. |
| `group` | string | `` | any value | What goes between groups of three, as furniture between the wheels. Empty by default, because a mechanical counter has no separators: the wheels are all the same and nothing sits between them. Set a comma if the figure is money rather than mileage. |
| `carry` | number | `0.12` | 0.01 to 1 (looks right between 0.08 and 0.25) | How much of a wheel's travel the wheel above it moves during, and the one setting that decides what machine this is. 0.12 is a geneva drive: the upper wheel is still until the lower one is nearly round, then snaps, and every figure sits squarely in its window. 1 is a straight gear train, where every wheel turns all the time, and it has a consequence worth knowing: such a counter never shows clean figures at all except at exact multiples, which is why a gas meter is read to the last settled digit. Anything between is a gear train with slack in it. |
| `drum` | number | `0.55` | 0 to 1 | How much a wheel darkens as it turns, because the figure coming into the window is on the curve of the drum. At 0 the figures slide past as though printed on a flat belt, which is the other thing this could be and a much less interesting one. |
| `seed` | number | `7` | 0 to 9999 | Unused by the maths, and here so that two counters on a page can be told apart in a config. Nothing about an odometer is random: that is rather the point of one. |
| `reducedMotionTime` | number | `999` | 0 to 9999 s | The single frame shown when the user prefers reduced motion. For a one-shot count this should be a time after it has finished, so the final figure is simply there. A counter is read, not watched. |

## 5. Accessibility. Do not skip this

A screen reader is given the value as a number, once, in a hidden label. A
column of digits read aloud is not a number, and a label that updates sixty
times a second is a live region nobody asked for.

## 6. Cleanup and SSR

`destroy()` puts the original content back, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

Put the final value in the element in your markup. It renders on the server,
reads correctly if the JavaScript never arrives, and is replaced by the wheels
on the first frame.

## 7. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is after the count has finished. The final figure is simply there. A
counter is read, not watched.

## 8. The three mistakes most likely to be made here

1. **No carry.** Every wheel turning at its own steady speed is a fruit machine.
   The carry is one line, and it is the entire difference.

2. **No repeated nought at the end of the strip.** A wheel rolling off nine has
   nothing to roll on to and snaps back through the whole drum.

3. **Taking the strip out of the flow.** Then the window has no child with a
   width, collapses to nothing, and draws the wheels perfectly inside a box of
   zero width. The counter is invisible and there is no error anywhere. This one
   cost me a build.

4. **A variable number of wheels.** The layout changes width on every frame of
   the count. Fixed wheels with leading noughts is what a counter is.

5. **Using it for a statistic.** CountUpNumber is cheaper, formats for a locale,
   and does not imply a machine. This one is for when the machine is the point.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/odometer-number/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/odometer-number/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
