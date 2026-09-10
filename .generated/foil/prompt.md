You are adding **Foil** from Beamish to this project.

> A hot-foil stamp on paper, raked by the light your cursor carries. Pointer · effect · MIT.
> https://beamish.ink/effects/foil

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses — that is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2 — there is no WebGL1 fallback
- WebGL2 for gl_VertexID; there is no WebGL1 fallback and none is planned
- Pointer-driven, but never pointer-dependent — with no cursor the light orbits on its own, so it works on touch and under reduced motion
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement — the
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/foil/core.ts` | https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/effects/foil/core.ts |

If you cannot fetch URLs, say so rather than writing the file from memory — there
is a version of this prompt with the source inlined, and guessing at a shader
produces something that compiles and looks wrong.

## 2. What it is

Foil is a hot-foil stamp pressed into paper, and your cursor is the light. Move
it and the highlight rakes across the relief exactly the way tilting a real
foil-stamped card does — a narrow band of brightness travelling over a brushed
surface, picking up a little colour at the grazing edges.

There is no image and no texture. The stamp is a signed-distance rosette with a
brushed relief written into its height field; the light is a point source sitting
just above the surface at the cursor. Everything you see is that height field,
its gradient, and one specular term. WebGL2, one full-screen triangle, no
dependencies.

It is pointer-driven but never pointer-dependent. With no cursor — on touch, or
before anyone has moved the mouse — the light takes a slow closed orbit of its
own, so the panel is alive on arrival and the loop still has no seam.

## 3. Wire it in

**Plain HTML.** The element needs a size of its own — the canvas fills it, so an
element with no height renders nothing.

```html
<div id="stamp" style="width: 100%; aspect-ratio: 1"></div>

<script type="module">
  import { createFoil } from './beamish/effects/foil/core.js'

  const foil = createFoil(document.querySelector('#stamp'), {
    foilHigh: '#f0b070'
  })
  foil.start()
</script>
```

**React.** Start in an effect, destroy in its cleanup. In StrictMode the effect
runs twice in development; that is fine, because `destroy()` fully releases the
context — which is exactly the case StrictMode exists to catch.

```tsx
import { useEffect, useRef } from 'react'
import { createFoil } from '@/beamish/effects/foil/core'

export function Stamp() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const foil = createFoil(host.current, { spokes: 12 })
    foil.start()
    return () => foil.destroy()
  }, [])

  return <div ref={host} className="aspect-square w-full" />
}
```

Do not put option values in the dependency array — that tears the context down
and rebuilds it on every keystroke. Call `update()` instead:

```tsx
useEffect(() => {
  foilRef.current?.update({ spokes })
}, [spokes])
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createFoil } from '@/beamish/effects/foil/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLDivElement | null>(null)
let foil: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  foil = createFoil(host.value, { spokes: 12 })
  foil.start()
})

onBeforeUnmount(() => foil?.destroy())
</script>

<template>
  <div ref="host" class="stamp" />
</template>
```

**Astro.** Nothing special is needed. Use the React or Vue file as an island with
`client:visible`, or call `createFoil` from a plain `<script>` in the page — the
core is a standard ES module with no framework in it.

**Driving the light yourself.** The pointer is read from the element the effect
is mounted into. If you want the light to follow something else — a scripted
path, a scroll position, an element elsewhere on the page — pass `pointerPath`, a
list of `{ t, x, y }` keys in 0–1 element coordinates, plus
`pointerPathDuration`. The runtime samples it at exactly the time being drawn and
ignores the live pointer. This is how the video on the site is recorded.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The paper the stamp is pressed into. Match it to your page background or the panel reads as a pasted-in rectangle. |
| `foilLow` | color | `#7a3410` | any CSS hex | The foil where the light does not reach. Metal takes almost all its colour from the highlight, so this wants to be genuinely dark. |
| `foilHigh` | color | `#f0b070` | any CSS hex | The foil at the highlight. Copper by default; a pale grey here gives silver, a yellow gives gold. |
| `spokes` | number | `12` | 3 – 40 (looks right between 8 and 18) | Points on the rosette. Above about 24 the petals are narrower than the relief and it turns into a disc. |
| `scale` | number | `0.86` | 0.3 – 1.6 (looks right between 0.7 and 1.1) | Size of the stamp relative to the shorter side of the element. |
| `relief` | number | `0.38` | 0 – 1 (looks right between 0.35 and 0.7) | Depth of the brushed relief. At zero the foil is a flat shape that changes brightness, which reads as plastic rather than metal. |
| `sharpness` | number | `0.42` | 0 – 1 (looks right between 0.3 and 0.65) | How tight the highlight is. High is a mirror finish, low is a brushed one. |
| `iridescence` | number | `0.3` | 0 – 1 (looks right between 0.15 and 0.45) | Spectral shift at grazing angles. Past about 0.6 it stops being a foil and becomes a hologram. |
| `lightHeight` | number | `0.42` | 0.05 – 2 (looks right between 0.3 and 0.7) | How far above the surface the cursor's light sits. Low is a hard raking light that sweeps a narrow band; high floods the whole stamp at once. |
| `grain` | number | `0.3` | 0 – 1 | Paper tooth. Static by design — animated grain flickers, and a flicker this fine is what WCAG 2.3.1 exists to prevent. |
| `period` | number | `5` | 2 – 60 s (looks right between 5 and 20) | Seconds for one orbit of the idle light — the motion used when no pointer is present. Exactly periodic, so the loop has no seam. |
| `reducedMotionTime` | number | `0.9` | 0 – 60 s | The single frame shown when the user prefers reduced motion. Pick a light angle where the relief is legible. |

## 5. Cleanup and SSR

`destroy()` releases the WebGL context, cancels the RAF, disconnects both
observers and removes every listener including the pointer ones. Call it. A page
that mounts and unmounts demos without destroying them will hit the browser's
context limit — sixteen contexts *or* sixteen million pixels, whichever comes
first — and the browser will start killing the oldest one.

None of this can run on the server. `createFoil` touches `document` and
`matchMedia` at call time, so it must be inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'` at the top of the
component file.

The runtime pauses the loop when the element scrolls offscreen and when the tab
is hidden.

## 6. Pausing and reduced motion

WCAG 2.2.2 is Level A: content that moves for more than five seconds must be
pausable. The idle orbit qualifies, so `stop()` and `start()` are on the handle
for exactly that reason. Surface them as a real control in your own build.

Note that stopping the loop does not stop the effect responding to the cursor in
any meaningful sense — with the loop stopped the surface simply holds its last
frame, which is the correct behaviour: the motion is paused, the object is still
there.

Handled in the runtime, with a live `matchMedia` listener so toggling the OS
setting mid-session takes effect without a reload. Under reduced motion the idle
orbit never starts and a single frame is drawn instead — the one at
`reducedMotionTime`.

Foil degrades unusually well: a stamped emblem lit from one side is a perfectly
finished thing to look at, and nobody would guess it was meant to move. Pick a
light angle where the relief is legible rather than one where the highlight is
brightest.

## 7. The three mistakes most likely to be made here

1. **Mounting it into a wide, short element.** The stamp is sized against the
   *shorter* side, so in a 1200×200 banner it is 200px across with a great deal
   of paper either side. Give it something square-ish, or raise `scale`.

2. **Making `foilLow` too light.** Metal has almost no diffuse term — nearly all
   of its colour comes from the highlight, which is why real foil looks like foil
   and a matte print does not. If `foilLow` is a mid-tone the stamp turns into a
   flat coloured shape with a shine on it. Take it darker than feels right.

3. **Assuming it needs a mouse.** It does not: with no pointer the light orbits
   on its own, so it works on touch and in a screenshot. Do not hide it on small
   screens or gate it behind a hover media query.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
