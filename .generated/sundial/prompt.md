You are adding **Sundial** from Beamish to this project.

> Matte forms on paper, and one sun making a full circuit of them. Backdrops · effect · MIT.
> https://beamish.ink/effects/sundial

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses — that is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL1 or better
- three.js must already be a dependency of the project — it is not bundled
- A 2048² shadow map is allocated; on a very old integrated GPU drop it to 1024
- Falls back to a still frame under prefers-reduced-motion, handled in the runtime
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement — the
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/sundial/core.ts` | https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/effects/sundial/core.ts |

If you cannot fetch URLs, say so rather than writing the file from memory — there
is a version of this prompt with the source inlined, and guessing at a shader
produces something that compiles and looks wrong.

## 2. What it is

Sundial is a still life: seven matte forms standing on paper, lit by a single sun
that makes one complete circuit over the loop. The forms never move. The subject
is the shadows — they lengthen, swing round, cross each other and arrive back
exactly where they started.

It is a real three.js scene. A perspective camera, seven meshes, standard
materials, a directional light with a shadow map, and a bounce light standing in
for light coming back off the paper. Not a full-bleed shader pretending to be
three-dimensional.

The paper is never lit. It is the scene background, and the ground plane is a
`ShadowMaterial` that draws nothing but the shadow. That is why the paper comes
out exactly the colour you asked for instead of the warm grey a lit plane gives
you at a grazing sun angle.

Because the forms sit in the middle and the sun keeps the edges clear, there is
room for a headline over the top of it. That is what it is for.

## 3. Wire it in

**Plain HTML.** three.js must already be available to your build — this file
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

**React.** Start in an effect, destroy in its cleanup. In StrictMode the effect
runs twice in development; that is fine, because `destroy()` fully releases the
context — which is exactly the case StrictMode exists to catch.

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

Do not put option values in the dependency array — that tears the WebGL context
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

**Astro.** Nothing special is needed. Use the React or Vue file as an island with
`client:visible`, or call `createSundial` from a plain `<script>` in the page —
the core is a standard ES module.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper the forms stand on. Match it to your page background or the panel reads as a pasted-in rectangle. |
| `stone` | color | `#f5f2e9` | any CSS hex | The forms. Slightly lighter than the paper is what makes them read as objects standing on it rather than holes cut in it. |
| `accent` | color | `#c44400` | any CSS hex | One form carries colour. This is the obvious place to put your own brand colour. |
| `elevation` | number | `30` | 8 – 80 deg (looks right between 22 and 45) | How high the sun sits. Low is long dramatic shadows; above about 60 the shadows disappear under the objects and the whole thing goes flat. |
| `softness` | number | `0.68` | 0 – 1 (looks right between 0.35 and 0.75) | Shadow edge softness. Zero is a hard midday edge, one is heavy overcast. |
| `shadow` | number | `0.3` | 0 – 1 (looks right between 0.18 and 0.45) | How dark the shadows fall on the paper. The paper itself is never lit — it stays exactly the colour you set — so this is the only thing drawn on it. |
| `zoom` | number | `0.66` | 0.3 – 1.6 (looks right between 0.6 and 1) | How much of the frame the group fills. |
| `tilt` | number | `0.52` | 0 – 1 (looks right between 0.2 and 0.55) | Camera height. Zero is eye level with the paper, one looks straight down. Around 0.35 is a table seen from a chair. |
| `period` | number | `5` | 2 – 120 s (looks right between 5 and 30) | Seconds for one full circuit of the sun. The default is 5 so the preview video is a whole cycle; 20–30 is right for something you leave running behind a page. |
| `reducedMotionTime` | number | `1.1` | 0 – 120 s | The single frame shown when the user prefers reduced motion. Pick a sun angle that composes — the still is the whole effect for those users. |

## 5. Cleanup and SSR

`destroy()` disposes every geometry, material and shadow map, disposes the
three.js renderer, then releases the WebGL context itself. Call it. A page that
mounts and unmounts scenes without destroying them will hit the browser's context
limit — sixteen contexts *or* sixteen million pixels, whichever comes first — and
the browser starts killing the oldest one.

None of this can run on the server. `createSundial` touches `document` and
`matchMedia` at call time, so it must be inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

The runtime pauses the loop when the element scrolls offscreen and when the tab
is hidden, so the shadow map is not being redrawn behind a modal.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A and it applies to this: content that moves for more than
five seconds must be pausable. `stop()` and `start()` are on the handle for
exactly that reason. Surface them as a real control in your own build — a small
button in the corner is enough — rather than assuming reduced motion covers it.
It does not; plenty of people who need a pause button have not set that
preference.

Handled in the runtime, with a live `matchMedia` listener so toggling the OS
setting mid-session takes effect without a reload. Under reduced motion the loop
never starts and a single frame is drawn instead — the one at `reducedMotionTime`.

This effect degrades better than most: one frame of it is a photograph, which is
a perfectly good thing for a hero to be. Choose a sun angle where the shadows
rake across the composition rather than hiding behind the forms.

## 7. The three mistakes most likely to be made here

1. **Not installing three.js, or installing a version older than 0.160.** This
   file imports `three` and does not bundle it. `ShadowMaterial`, `SRGBColorSpace`
   and the current light-intensity model all need a reasonably recent version; on
   an old one the scene renders about twice as dark and nothing obviously errors.

2. **Mounting into an element with no height.** The canvas is `width: 100%;
   height: 100%`, so a `<div>` with no content and no CSS height is zero pixels
   tall and you get nothing. Give the host an `aspect-ratio` or an explicit
   height.

3. **Raising `elevation` to "see it better".** Above about 60 degrees the sun is
   nearly overhead, the shadows vanish underneath the forms, and the whole scene
   goes flat and dull. If it looks too dark, raise `shadow` towards 0.2 or lighten
   `stone` — do not move the sun up.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
