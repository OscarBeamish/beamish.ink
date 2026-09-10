You are adding **Sundial** from Beamish to this project.

> Matte forms on paper, and one sun making a full circuit of them. Backdrops · effect · MIT.
> https://beamish.ink/effects/sundial

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL1 or better
- three.js must already be a dependency of the project. It is not bundled
- A 2048² shadow map is allocated; on a very old integrated GPU drop it to 1024
- Falls back to a still frame under prefers-reduced-motion, handled in the runtime
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/sundial/core.ts` | https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/effects/sundial/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Sundial is a still life. Seven matte forms stand on paper, lit by one sun that
makes a complete circuit over the loop. The forms never move. The shadows are the
subject: they lengthen, swing round, cross each other, and arrive back exactly
where they started.

It is a real three.js scene. A perspective camera, seven meshes, standard
materials, a directional light with a shadow map, and a dim bounce light standing
in for light coming back off the paper. Not a full-bleed shader pretending to be
three-dimensional.

The paper is never lit. It is the scene background, and the ground plane is a
`ShadowMaterial` that draws nothing but the shadow. A lit plane picks up the sun
at a grazing angle and lands around 85% of its own colour, which on warm paper is
a warm grey. This way the paper comes out the colour you asked for.

The forms sit in the middle and the sun keeps the edges clear, so there is room
for a headline over the top. That is what it is for.

## 3. Wire it in

**Plain HTML.** three.js must already be available to your build. This file
imports it and does not bundle it.

```html
<div id="hero" style="width: 100%; aspect-ratio: 16 / 9"></div>

<script type="module">
  import { createSundial } from './beamish/effects/sundial/core.js'

  const sundial = createSundial(document.querySelector('#hero'), {
    accent: '#c44400'
  })
  sundial.start()
</script>
```

**React.** Start in an effect. Destroy in its cleanup. StrictMode runs the effect
twice in development. That is fine, because `destroy()` fully releases the
context, which is the case StrictMode exists to catch.

```tsx
import { useEffect, useRef } from 'react'
import { createSundial } from '@/beamish/effects/sundial/core'

export function Hero() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sundial = createSundial(host.current, { accent: '#c44400' })
    sundial.start()
    return () => sundial.destroy()
  }, [])

  return <div ref={host} className="aspect-video w-full" />
}
```

Do not put option values in the dependency array. That tears the WebGL context
down and rebuilds the whole scene on every keystroke. Call `update()` instead:

```tsx
useEffect(() => {
  sundialRef.current?.update({ elevation })
}, [elevation])
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSundial } from '@/beamish/effects/sundial/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let sundial: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sundial = createSundial(host.value, { accent: '#c44400' })
  sundial.start()
})

onBeforeUnmount(() => sundial?.destroy())
</script>

<template>
  <div ref="host" class="hero" />
</template>
```

**Astro.** Nothing extra is required. Use the React or Vue file as an island with
`client:visible`, or call `createSundial` from a plain `<script>` in the page. The
core is a standard ES module.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper the forms stand on. Match it to your page background or the panel reads as a pasted-in rectangle. |
| `stone` | color | `#f5f2e9` | any CSS hex | The forms. Slightly lighter than the paper is what makes them read as objects standing on it rather than holes cut in it. |
| `accent` | color | `#c44400` | any CSS hex | One form carries colour. This is the obvious place to put your own brand colour. |
| `elevation` | number | `30` | 8 to 80 deg (looks right between 22 and 45) | How high the sun sits. Low is long dramatic shadows; above about 60 the shadows disappear under the objects and the whole thing goes flat. |
| `softness` | number | `0.68` | 0 to 1 (looks right between 0.35 and 0.75) | Shadow edge softness. Zero is a hard midday edge, one is heavy overcast. |
| `shadow` | number | `0.3` | 0 to 1 (looks right between 0.18 and 0.45) | How dark the shadows fall on the paper. The paper is never lit. It stays exactly the colour you set, so the shadow is the only thing drawn on it. |
| `zoom` | number | `0.66` | 0.3 to 1.6 (looks right between 0.6 and 1) | How much of the frame the group fills. |
| `tilt` | number | `0.52` | 0 to 1 (looks right between 0.2 and 0.55) | Camera height. Zero is eye level with the paper, one looks straight down. Around 0.35 is a table seen from a chair. |
| `period` | number | `5` | 2 to 120 s (looks right between 5 and 30) | Seconds for one full circuit of the sun. The default is 5 so the preview video is a whole cycle. Use 20 to 30 for something you leave running behind a page. |
| `reducedMotionTime` | number | `1.1` | 0 to 120 s | The single frame shown when the user prefers reduced motion. Pick a sun angle that composes. For those users the still is the whole effect. |

## 5. Cleanup and SSR

Call `destroy()`. It disposes every geometry, material and shadow map, disposes
the three.js renderer, then releases the WebGL context itself.

A page that mounts and unmounts scenes without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first. Past that the browser starts killing the oldest context.

None of this runs on the server. `createSundial` touches `document` and
`matchMedia` at call time. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

The runtime pauses the loop when the element scrolls offscreen and when the tab
is hidden, so the shadow map is not being redrawn behind a modal.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A and it applies here. Content that moves for more than five
seconds must be pausable. `stop()` and `start()` are on the handle for that.
Surface them as a real control in your own build. A small button in the corner is
enough.

Reduced motion does not cover this. Plenty of people who need a pause button have
not set that preference.

Handled in the runtime with a live `matchMedia` listener, so changing the OS
setting mid-session takes effect without a reload. Under reduced motion the loop
never starts and one frame is drawn instead, the one at `reducedMotionTime`.

This effect degrades better than most. One frame of it is a photograph, which is
a perfectly good thing for a hero to be. Choose a sun angle where the shadows
rake across the composition rather than hiding behind the forms.

## 7. The three mistakes most likely to be made here

1. **Not installing three.js, or installing a version older than 0.160.** This
   file imports `three` and does not bundle it. `ShadowMaterial`, `SRGBColorSpace`
   and the current light-intensity model all need a recent version. On an old one
   the scene renders about twice as dark and nothing obviously errors.

2. **Mounting into an element with no height.** The canvas is `width: 100%;
   height: 100%`. A `<div>` with no content and no CSS height is zero pixels tall
   and renders nothing. Give the host an `aspect-ratio` or an explicit height.

3. **Raising `elevation` to see it better.** Above about 60 degrees the sun is
   nearly overhead, the shadows vanish underneath the forms, and the scene goes
   flat. If it looks too dark, lower `shadow` towards 0.2 or lighten `stone`. Do
   not move the sun up.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
