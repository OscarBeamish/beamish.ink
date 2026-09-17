## What it is

Magnet leans an element towards the cursor before the cursor gets there, and lets
go once it has passed. One CSS transform. No canvas, no WebGL, no npm dependency.

It reads the pointer at window scope rather than element scope, because the whole
point is reacting to a cursor that is still outside. The runtime reports
element-relative coordinates that go past 0 and 1, so "one and a half element
widths away, up and to the right" is a number rather than a guess.

The easing is a CSS transition, not a per-frame spring. Nothing integrates
against the previous frame, so `renderAtTime` stays pure and the recorder can
scrub it. The release is what people actually notice, and a transition handles
the release better than most springs do.

`destroy()` clears every style it set.

## Wiring

**Plain HTML.** Mount it on the element that should move, not on a wrapper.

```html
<button class="cta">Get prompt</button>

<script type="module">
  import { createMagneticButton } from './beamish/effects/magnetic-button/core.js'

  const magnet = createMagneticButton(document.querySelector('.cta'))
  magnet.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createMagneticButton } from '@/beamish/effects/magnetic-button/core'

export function Cta({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!host.current) return
    const magnet = createMagneticButton(host.current, { strength: 0.34 })
    magnet.start()
    return () => magnet.destroy()
  }, [])

  return <button ref={host}>{children}</button>
}
```

Do not put option values in the dependency array. Call `update()` instead.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createMagneticButton } from '@/beamish/effects/magnetic-button/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let magnet: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  magnet = createMagneticButton(host.value)
  magnet.start()
})

onBeforeUnmount(() => magnet?.destroy())
</script>

<template>
  <button ref="host"><slot /></button>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

**Several of them.** One instance per element. Each holds a window-scoped
`pointermove` listener, so a page with thirty magnets has thirty listeners
running on every mouse move. That is fine for a handful of buttons and wrong for
a grid of cards; for a grid, mount one Magnet on the grid itself.

## Cleanup and SSR

`destroy()` clears the transform, transition and `will-change`, removes the
window listener, cancels the RAF and disconnects both observers.

The window listener is the one worth being careful about. An element that unmounts
without `destroy()` leaves a `pointermove` handler running for the life of the
page, holding a reference to a node that is no longer in the document.

The element renders on the server as ordinary markup and behaves completely
normally without JavaScript. Call `createMagneticButton` from `useEffect`, `onMounted`,
or a `client:*` island.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`, which is 0.

At `t = 0` there is no pointer, so the element draws unmoved. That is the right
answer: the button is still a button, it simply does not chase anything.

## Common mistakes

1. **Putting it on a large element.** Magnet moves the whole element, and on a
   full-width bar that means shunting the layout sideways. It is for buttons,
   icons and small marks. `maxShift` caps the damage but does not make it a good
   idea.

2. **Raising `strength` past about 0.6.** The element then outruns the cursor and
   can never be clicked, which is funny exactly once. If you want more presence,
   raise `scale` or `reach` instead.

3. **Mounting one per card in a grid.** Each instance adds a window-scoped
   `pointermove` listener. Thirty of them fire thirty times per mouse move. Mount
   one on the grid and move the grid, or use a hover state instead.
