You are adding **GradualBlur** from Beamish to this project.

> A band at the edge of a scrolling area where the content goes progressively out of focus, built from stacked blurs because a masked one does not ramp. Reveals · effect · MIT.
> https://beamish.ink/effects/gradual-blur

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The obvious build does not work, and the failure looks like a browser bug rather than a mistake. One element, a backdrop-filter and a gradient mask give a band of fully blurred content whose opacity ramps away: masking a blur fades how much of the blurred layer you can see and does nothing to how blurred it is. The hard edge where the blur starts is not in the mask, so softening the mask will never move it
- A blur that ramps has to be several blurs. Each layer blurs twice as hard as the one below it and is masked to its own band, and because a backdrop-filter sees everything painted beneath it, including the previous layers, the blurs compound
- The doubling is what makes six layers enough. A linear ramp over the same range needs dozens before the steps stop showing, and each one is another backdrop-filter for the compositor
- The bands overlap by one step on each side. Butted up against each other they leave faint but perfectly visible seams, which on a pale page read as printing bands
- The wash is a separate layer and is not the same thing as the blur. Haze over a dark photograph wants a little light in it, or the blurred content stays as dark as it was and nothing reads as distance
- backdrop-filter needs the content to be painted beneath the band, so this goes on the scrolling element and not on the thing inside it
- destroy() removes the band and puts the element's position back
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/gradual-blur/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/gradual-blur/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

GradualBlur puts a band at the edge of a scrolling area where the content goes
progressively out of focus before it runs off. Haze, rather than a fade to the
background colour. A fade tells you the text has stopped; a haze tells you it
has not.

The obvious way to build it does not work, and it is worth saying why, because
the failure looks like a bug in the browser rather than a mistake of yours.

One element, a `backdrop-filter` and a gradient mask gives you a band of **fully
blurred** content whose *opacity* ramps away. Masking a blur fades how much of
the blurred layer you can see. It does nothing at all to how blurred it is. So
there is a hard edge where the blur starts, and no amount of softening the mask
will move it, because the edge is not in the mask.

A blur that actually ramps has to be made of several blurs. Each layer here
blurs twice as hard as the one below it and is masked to its own band, and
because a `backdrop-filter` sees everything painted beneath it, including the
previous layers, the blurs compound.

The doubling is what makes six layers enough. A linear ramp over the same range
needs dozens before the steps stop showing, and every one of them is another
backdrop filter for the compositor.

## 3. Wire it in

**Plain HTML.** Put it on the scrolling element, not on the thing inside it. A
`backdrop-filter` blurs what is painted beneath it, so the content has to be
behind the band.

```html
<div id="list" style="position: relative; overflow: auto; height: 400px">
  <!-- a long column of content -->
</div>

<script type="module">
  import { createGradualBlur } from './beamish/effects/gradual-blur/core.js'

  const haze = createGradualBlur(document.querySelector('#list'), {
    edge: 'bottom'
  })
  haze.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createGradualBlur } from '@/beamish/effects/gradual-blur/core'

export function Scroller({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const haze = createGradualBlur(host.current, { edge: 'bottom', wash: 0 })
    haze.start()
    return () => haze.destroy()
  }, [])

  return (
    <div ref={host} style={{ overflow: 'auto', position: 'relative' }}>
      {children}
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createGradualBlur } from '@/beamish/effects/gradual-blur/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let haze: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  haze = createGradualBlur(host.value)
  haze.start()
})

onBeforeUnmount(() => haze?.destroy())
</script>

<template>
  <div ref="host" class="scroller"><slot /></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `edge` | enum | `bottom` | `top` · `bottom` · `left` · `right` | Which edge the haze sits on. The foot of a scrolling panel is the one that earns its keep: it says the text continues. At the top it competes with whatever header is already there. |
| `depth` | number | `0.22` | 0.03 to 0.6 (looks right between 0.12 and 0.3) | How far the band reaches in from the edge, as a share of the element. A share rather than pixels, so a tall panel gets a long ramp and a short one does not lose a third of itself to haze. |
| `strength` | number | `14` | 1 to 60 px (looks right between 8 and 24) | Blur at the very edge. This is the end of the ramp, not the whole of it: everything between here and the far side of the band is a fraction of it. Past about 30 the last line is a smear rather than something going out of focus. |
| `layers` | number | `6` | 2 to 12 | How many blurs the ramp is built from. Six is enough because each one is twice the last; below about four the steps are visible as bands, and above eight you are paying the compositor for a difference nobody can see. |
| `tint` | color | `#fbfaf4` | any CSS hex | The colour of the wash, if there is one. The page's own paper is the usual answer. Over a photograph a colour taken out of the image reads better than white. `auto` takes it from the page, so the effect adopts whatever it is dropped onto. |
| `wash` | number | `0.35` | 0 to 1 | How strong the wash is at the edge. At 0 there is only blur, which is right on paper. Over a dark photograph it wants some, or the blurred content stays as dark as it was and nothing reads as distance. |
| `follow` | boolean | `false` | `true` · `false` | Bring the haze in as the element is scrolled rather than leaving it always on. For a panel with a top edge this is the honest setting: there is nothing above a list until it has been scrolled, and a haze over nothing is a smudge on the glass. |

## 5. Which edge, and whether it is always there

The foot of a scrolling panel is the one that earns its keep: it says the text
continues. At the top it usually competes with whatever header is already there.

`follow` brings the haze in as the element is scrolled rather than leaving it on
always, and for a top edge that is the honest setting. There is nothing above a
list until it has been scrolled, and a haze over nothing is a smudge on the
glass.

## 6. Blur and wash are different things

`strength` is the blur at the very edge, and everything between there and the
far side of the band is a fraction of it. `wash` is a separate layer of colour
over the top.

On paper, `wash: 0` is usually right: the blur alone is the effect. Over a dark
photograph it wants some, or the blurred content stays exactly as dark as it was
and nothing reads as distance. Take the tint out of the image rather than
reaching for white.

## 7. Cost

The stack is built once and rebuilt only when its shape changes. Per frame there
is at most one opacity write, and none at all when `follow` is off.

The cost that matters is the compositor's: every layer is a `backdrop-filter`
over the same region of the screen. Six is a deliberate ceiling, and the
doubling is what buys the range without raising it. If you need a longer ramp,
raise `depth`, not `layers`.

## 8. Cleanup and SSR

`destroy()` removes the band and puts the element's `position` back. There is no
GPU resource of ours to release, though the compositor will drop its layers.

Nothing renders on the server, and nothing needs to: the element's own content
is untouched. Call `createGradualBlur` from `useEffect`, `onMounted`, or a
`client:*` island.

## 9. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
one frame is drawn, at `reducedMotionTime`, which here is 0.

The haze itself is not motion: it is a static band, and it stays. Only the
`follow` fade would have moved, and under reduced motion it simply settles at
its starting value.

## 10. The three mistakes most likely to be made here

1. **One blurred element with a gradient mask.** It ramps the opacity, not the
   blur, and leaves a hard edge where the blur begins. This is the mistake the
   whole item exists to avoid.

2. **A linear ramp of blur values.** The steps show. Doubling each layer is what
   makes a handful of them enough.

3. **Butting the bands together.** Faint seams, which on a pale page read as
   printing bands. The bands here overlap by one step on each side.

4. **Mounting it on the content instead of the scroller.** A `backdrop-filter`
   blurs what is painted beneath it, so the band has to be a sibling that sits
   over the content, inside the element that clips it.

5. **Raising `layers` to get a longer ramp.** Length is `depth`. Layers only buy
   smoothness, and past about eight you are paying the compositor for a
   difference nobody can see.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/gradual-blur/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/gradual-blur/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
