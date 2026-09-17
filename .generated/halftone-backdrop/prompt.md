You are adding **HalftoneBackdrop** from Beamish to this project.

> Two ink plates drift out of registration behind a halftone screen. Backdrops · effect · MIT.
> https://beamish.ink/effects/halftone-backdrop

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- WebGL2 for gl_VertexID; there is no WebGL1 fallback and none is planned
- Falls back to a still frame under prefers-reduced-motion, handled in the runtime
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/halftone-backdrop/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/halftone-backdrop/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Overprint is a full-bleed background that behaves like a two-colour print. Two
ink plates, a desaturated near-black and a burnt orange, are screened into
halftone dots at different angles and multiplied over the paper colour. That is
what a second pass of ink does to the first. Over the loop the plates slide
fractionally out of registration, which is the misprint that makes a risograph
look alive.

It is one WebGL2 fragment shader on one full-screen triangle. No three.js, no
textures, no render targets, no npm dependencies.

It needs a light background. Multiplying ink into black gets you black.

The defaults are tuned to be looked at: dense, plenty of solid ink. If you are
putting text on top, that is too much. Drop `coverage` to about 0.2 and raise
`period` to 15. Do not reach for opacity instead. Opacity greys the paper and
loses the thing that makes it look printed.

## 3. Wire it in

**Plain HTML.** Give the host element a size. The canvas fills it, so an element
with no height renders nothing.

```html
<div id="backdrop" style="position: fixed; inset: 0; z-index: -1"></div>

<script type="module">
  import { createHalftoneBackdrop } from './beamish/effects/halftone-backdrop/core.js'

  const overprint = createHalftoneBackdrop(document.querySelector('#backdrop'), {
    inkB: '#c44400'
  })
  overprint.start()
</script>
```

**React.** Start in an effect. Destroy in its cleanup. StrictMode runs the effect
twice in development. That is fine, because `destroy()` fully releases the
context, which is the case StrictMode exists to catch.

```tsx
import { useEffect, useRef } from 'react'
import { createHalftoneBackdrop } from '@/beamish/effects/halftone-backdrop/core'

export function Backdrop() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const overprint = createHalftoneBackdrop(host.current, { inkB: '#c44400' })
    overprint.start()
    return () => overprint.destroy()
  }, [])

  return <div ref={host} className="fixed inset-0 -z-10" />
}
```

Do not put option values in the dependency array. That tears the context down and
rebuilds it on every keystroke. Call `update()` instead:

```tsx
useEffect(() => {
  effectRef.current?.update({ coverage })
}, [coverage])
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createHalftoneBackdrop } from '@/beamish/effects/halftone-backdrop/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let overprint: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  overprint = createHalftoneBackdrop(host.value, { inkB: '#c44400' })
  overprint.start()
})

onBeforeUnmount(() => overprint?.destroy())
</script>

<template>
  <div ref="host" class="backdrop" />
</template>
```

**Astro.** Nothing extra is required. Use the React or Vue file as an island with
`client:visible`, or call `createHalftoneBackdrop` from a plain `<script>` in the page.
The core is a standard ES module with no framework in it.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | Paper colour. Set this to your own background or the panel will not sit in the page. |
| `inkA` | color | `#363630` | any CSS hex | First plate. A desaturated near-black reads as ink; pure black reads as a hole. |
| `inkB` | color | `#c44400` | any CSS hex | Second plate. This is where the colour lives, so change this one first. |
| `scale` | number | `1.9` | 0.3 to 6 (looks right between 1.2 and 3) | Size of the ink shapes. Lower is broader and calmer. |
| `screen` | number | `8` | 2 to 40 dots / 100px (looks right between 5 and 14) | Halftone frequency. Above about 20 the screen stops reading as a screen and starts reading as noise. |
| `angleA` | number | `15` | 0 to 180 deg | Screen angle of the first plate. |
| `angleB` | number | `75` | 0 to 180 deg (looks right between 45 and 105) | Screen angle of the second plate. Keep it at least 30 degrees from angleA. Closer than that and the two screens beat against each other. |
| `drift` | number | `5` | 0 to 30 px (looks right between 4 and 12) | Registration error: how far the plates slide apart over a loop. Zero is a clean print and much duller. |
| `coverage` | number | `0.32` | 0.1 to 0.9 (looks right between 0.35 and 0.6) | Ink density. Past 0.7 the plates flood and the paper stops showing through. |
| `grain` | number | `0.35` | 0 to 1 | Paper tooth. Static by design. Animated grain flickers, and a flicker this fine is what WCAG 2.3.1 exists to prevent. |
| `period` | number | `5` | 2 to 120 s (looks right between 5 and 25) | Seconds for one full loop. The animation is exactly periodic over this. The default is 5 so that the preview video is a whole cycle. Raise it to 15 or 25 for a page background you want to forget is moving. |
| `reducedMotionTime` | number | `1.4` | 0 to 120 s | The single frame shown when the user prefers reduced motion. Pick one that composes rather than the frame at zero. |

## 5. Cleanup and SSR

Call `destroy()`. It releases the WebGL context, cancels the RAF, disconnects
both observers and removes every listener.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createHalftoneBackdrop` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

The runtime already pauses the loop when the element scrolls offscreen and when
the tab is hidden.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A and it applies here. Content that moves for more than five
seconds must be pausable. `stop()` and `start()` are on the handle for that.
Surface them as a real control in your own build. A small button in the corner of
the panel is enough.

Reduced motion does not cover this. Plenty of people who need a pause button have
not set that preference.

Handled in the runtime with a live `matchMedia` listener, so changing the OS
setting mid-session takes effect without a reload. Under reduced motion the loop
never starts and one frame is drawn instead, the one at `reducedMotionTime`.

Set that value deliberately. The frame at zero has the plates in perfect
registration and looks like a mistake. Pick a time where the plates are visibly
offset.

## 7. The three mistakes most likely to be made here

1. **Mounting into an element with no height.** The canvas is `width: 100%;
   height: 100%`. A `<div>` with no content and no CSS height is zero pixels tall
   and renders nothing. Give the host `position: fixed; inset: 0`, or an explicit
   height.

2. **Leaving `paper` at the default when the page is not off-white.** Every other
   colour is multiplied over it, so a mismatch shows as a hard rectangle where
   the panel ends. Set `paper` to the actual background colour first, then tune
   the inks.

3. **Raising `screen` to make it look finer.** Past about 20 dots per 100px the
   halftone stops resolving, aliases against the pixel grid, and turns into noise
   that shimmers as the plates drift. Lower `coverage` instead.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/halftone-backdrop/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/halftone-backdrop/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
