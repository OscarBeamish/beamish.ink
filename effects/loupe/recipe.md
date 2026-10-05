## What it is

A printer's glass laid on the page.

The picture is continuous tone until you look closely, and then it is dots. That
is not a stylisation. It is what a printed photograph is, and it is the one
thing a screen never shows you: away from the glass the halftone is finer than
the eye resolves and reads as tone, which is the entire reason printing works at
all, and under the glass it resolves into four screens at four angles.

So the dots are not drawn at whatever size looks good. They are drawn at
`screen` pixels in the print and magnified along with everything else, which is
why turning `zoom` up makes them bigger rather than finer. A screen ruling
belongs to the press, not to the person looking at it.

The four angles are 15, 75, 0 and 45 degrees, and they are not decoration.
Thirty degrees between the strong plates is what keeps their interference down
to a fine rosette instead of a coarse plaid, and yellow sits at zero because it
is the plate you cannot see anyway. The ink that all three of cyan, magenta and
yellow have in common is pulled out and printed as black instead, which is what
a press does and the reason a shadow in a printed photograph is not a muddy
brown.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency.

## Where it goes

On a photograph somebody is going to look at: a press shot, a portfolio plate,
an archive image, anything where the picture is the point rather than the
decoration. It rewards attention and costs nothing from anyone who gives it
none, because with no cursor on it there is no glass and what you have is a
photograph.

Not on a background image behind text. The glass magnifies, and magnifying the
area under a paragraph moves the paragraph's background around while somebody is
reading it.

One per page, or near enough. It is a WebGL context each.

## The picture is your markup

The picture comes from the host element's own `<img>` child, not from an option.

```html
<figure id="plate" style="position: relative; aspect-ratio: 3 / 2">
  <img src="/press.jpg" alt="What the picture shows" />
</figure>
```

```ts
import { createLoupe } from './beamish/effects/loupe/core'

const loupe = createLoupe(document.querySelector('#plate'))
loupe.start()
```

The image is hidden from sight once it has been uploaded and left in the
document, so the alt text is whatever you wrote, the loading attribute is
whatever you set, and a browser that never runs the script shows the photograph
rather than an empty box.

Give the element a size of its own. The canvas is `width: 100%; height: 100%`,
so a `<figure>` with no aspect ratio and no height is zero pixels tall.

**React.** The picture goes in as children.

```tsx
import { useEffect, useRef } from 'react'
import { createLoupe } from '@/beamish/effects/loupe/core'

export function Plate() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const loupe = createLoupe(host.current)
    loupe.start()
    return () => loupe.destroy()
  }, [])

  return (
    <figure ref={host} className="plate">
      <img src="/press.jpg" alt="What the picture shows" />
    </figure>
  )
}
```

Do not put option values in the dependency array. Call `update()` instead: every
option is a uniform, so nothing rebuilds.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createLoupe } from '@/beamish/effects/loupe/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let loupe: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  loupe = createLoupe(host.value)
  loupe.start()
})

onBeforeUnmount(() => loupe?.destroy())
</script>

<template>
  <figure ref="host" class="plate">
    <img src="/press.jpg" alt="What the picture shows" />
  </figure>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

## Tuning it

`screen` and `zoom` work against each other and it is worth knowing which way.
`screen` is the press: how coarse the print is. `zoom` is the glass: how much
closer you are holding it. A fine screen under a strong glass is a magazine
plate; a coarse screen under a weak one is newsprint at arm's length.

Below about 2, `screen` produces a rosette finer than the glass can resolve, so
you get tone under the glass as well as outside it. That is the one setting that
defeats the whole idea.

`bulge` is what stops the edge reading as a hole cut in the picture. A real lens
magnifies most in the middle and eases off, and at 0 this does not, so the
magnified patch sits there with a hard boundary and reads as a filter applied to
a circle.

`rim` does the same job from the other side. The ring and the short fall into
shade just inside it are what make the glass an object resting on the page.

A little `fringe` sells it and a lot ruins it. Every simple lens shows lateral
colour at its edge; past about 0.03 it stops reading as glass and starts reading
as a broken monitor.

For a duotone press, set `cyan`, `magenta` and `yellow` all to the same ink and
leave `black`. Two plates at 15 and 45 degrees is a perfectly ordinary way to
print a photograph and it suits a restrained page better than full colour does.

## Pausing

Nothing moves unless the cursor does, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

## Reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn, which means the glass never appears and what you have is the
photograph. That is the right resting state rather than a compromise: the
picture is the content and the glass was always an extra.

## Cleanup and SSR

`destroy()` releases the WebGL context, deletes the texture, cancels the RAF,
disconnects both observers, removes every listener and puts the `<img>` back the
way it found it. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`.

## Common mistakes

1. **A cross-origin image.** `texImage2D` throws a SecurityError on an image
   from another origin without CORS headers, and the catch is that it throws at
   upload rather than at load, so the picture appears and the glass does not.
   Serve the image from your own origin or set `crossorigin`.

2. **Setting `screen` very low to make it look sharper.** It makes the rosette
   finer than the glass can show, so the magnified patch is tone and the whole
   point of the thing is gone. Coarser is the direction that helps.

3. **Expecting the dots to stay the same size as you zoom.** They are in the
   print, so they magnify. An effect where they did not would be a screen laid
   over the viewer's eye rather than over the paper.

4. **Using it on a decorative background behind text.** It magnifies, so
   whatever is under the glass moves, and moving the background of a paragraph
   somebody is reading is the one thing a page should not do.
