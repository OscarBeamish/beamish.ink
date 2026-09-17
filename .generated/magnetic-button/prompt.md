You are adding **MagneticButton** from Beamish to this project.

> An element that leans towards the cursor before the cursor arrives. Pointer · effect · MIT.
> https://beamish.ink/effects/magnetic-button

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. One CSS transform
- Reads the pointer at window scope, because the point is reacting to a cursor that is still outside the element
- The easing is a CSS transition rather than a per-frame spring, so nothing integrates and renderAtTime stays pure
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/magnetic-button/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/magnetic-button/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `reach` | number | `1.1` | 0 to 4 (looks right between 0.6 and 1.6) | How far outside the element the pull starts, as a multiple of its own size. 1 is one element-width of empty space around it. Large values on a small button make it twitch at things happening on the other side of the page. |
| `strength` | number | `0.34` | 0 to 1 (looks right between 0.2 and 0.5) | How far the element travels towards the cursor, as a fraction of the gap. Above 0.6 the cursor can never catch it, which is funny once and annoying afterwards. |
| `maxShift` | number | `26` | 0 to 120 px (looks right between 15 and 40) | Cap on the travel, whatever the strength works out to. This is what stops a wide element sliding out of its own layout. |
| `scale` | number | `1.04` | 0.9 to 1.4 (looks right between 1 and 1.08) | Scale at full pull. 1 is no growth. |
| `rotate` | number | `0` | 0 to 20 deg (looks right between 0 and 6) | Degrees of lean at full pull, following the cursor left and right. Off by default: on text it reads as a wobble rather than a lean. |
| `ease` | number | `420` | 0 to 1500 ms (looks right between 280 and 600) | How long it takes to follow the cursor, and to let go. Low is a rubber band; high is treacle. The release matters more than the catch. |
| `reducedMotionTime` | number | `0` | 0 to 60 s | The single frame shown when the user prefers reduced motion. At rest there is no pointer, so this draws the element unmoved, which is the right answer. |

## 5. Cleanup and SSR

`destroy()` clears the transform, transition and `will-change`, removes the
window listener, cancels the RAF and disconnects both observers.

The window listener is the one worth being careful about. An element that unmounts
without `destroy()` leaves a `pointermove` handler running for the life of the
page, holding a reference to a node that is no longer in the document.

The element renders on the server as ordinary markup and behaves completely
normally without JavaScript. Call `createMagneticButton` from `useEffect`, `onMounted`,
or a `client:*` island.

## 6. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn at `reducedMotionTime`, which is 0.

At `t = 0` there is no pointer, so the element draws unmoved. That is the right
answer: the button is still a button, it simply does not chase anything.

## 7. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/magnetic-button/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/magnetic-button/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
