## What it is

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

## Two mechanisms, and they look nothing alike

`carry` chooses which machine you have built.

**Narrow, around 0.12.** A geneva drive. The upper wheel is still until the
lower one is nearly round, then snaps. Every figure sits squarely in its window
and the number is readable at any moment.

**1.** A straight gear train: every wheel turning all the time. This has a
consequence worth knowing, and it is not a bug. Such a counter **never shows
clean figures** except at exact multiples, because the higher wheels are always
somewhere between two numbers. It is why a gas meter is read to the last settled
digit rather than straight off the dial.

Anything between is a gear train with slack in it. The demo shows both, because
seeing them side by side is the fastest way to understand the setting.

## Wiring

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

## The leading noughts are the point

`digits` sets how many wheels there are, padded with leading figures. Six is a
car.

They are not decoration. A counter with a fixed number of wheels is what makes
it a counter rather than a number, and it also stops the layout changing width
as the value grows, which a count from 0 to 128,640 otherwise does on every
single frame.

`group` is empty by default, because a mechanical counter has no separators: the
wheels are all the same part and nothing sits between them. Set a comma if the
figure is money rather than mileage, and it is drawn as furniture between the
wheels rather than as a wheel.

## This or CountUpNumber

CountUpNumber tweens a figure and sets it as text. It is the right choice for a
statistic, it formats properly for a locale, and it is far cheaper.

This one is a machine. Use it when the mechanism is part of what you are saying:
a mileage, a meter, a total that has been ticking up since before the page
loaded. If the number is just a number, use the other one.

## Cleanup and SSR

`destroy()` puts the original content back, cancels the RAF, disconnects both
observers and removes every listener. There is no GPU resource to release.

Put the final value in the element in your markup. It renders on the server,
reads correctly if the JavaScript never arrives, and is replaced by the wheels
on the first frame.

## Accessibility

A screen reader is given the value as a number, once, in a hidden label. A
column of digits read aloud is not a number, and a label that updates sixty
times a second is a live region nobody asked for.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is after the count has finished. The final figure is simply there. A
counter is read, not watched.

## Common mistakes

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
