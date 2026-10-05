## What it is

A lamp moved across a printed photograph.

It does not relight the scene. There is no depth in a photograph and no honest
way to get one out of a single frame, so anything that claims to move the sun
around inside a picture is guessing at a shape it cannot see. What this lights
is the print: the sheet the picture is on, which has relief wherever the
impression is heavy, and a raking light finds that relief the way a raking light
finds any other surface.

Height is the picture's own luminance. A shadow in the photograph is a hollow in
the sheet and a highlight stands proud, and the normal is the gradient of that
height taken across a few pixels rather than one, because a one-pixel difference
is mostly sensor noise and compression blocks.

There is one thing the lamp adds that a gradient cannot, and it is the thing
worth having: ink has a sheen that paper does not. The specular is what says the
dark passages are ink sitting on a surface rather than dark paper, and without
it this is a soft blob moving about.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency, no depth map to author or ship.

## What it is honest about

Lighting that is already in the photograph becomes relief. A cast shadow across
a wall turns into a step in the paper; a bright sky becomes a plateau. That is
the known failure of deriving a height field from luminance and there is no
getting round it without a real depth map.

It is also the reason the modelling is laid over the picture rather than
replacing it. At the midpoint of the light the photograph is exactly itself, and
the lamp opens a gradient either side of that. Nothing is re-exposed, so when
the surface guesses wrong what you get is a slightly odd highlight rather than a
picture that has come apart.

A flat-lit image is the one this flatters most: a studio shot, a document, a
textile, a facade in overcast light. A photograph that is already a study in
raking sunlight will fight it, because you are lighting its shadows as though
they were trenches.

## Where it goes

On a single picture that is the point of its section: one plate in an essay, a
hero image, a product shot, an archive scan. With no cursor on it there is no
lamp and what you have is the photograph, so it costs nothing from anybody who
never moves a mouse over it.

One per page, or near enough. It is a WebGL context each.

## The picture is your markup

```html
<figure id="plate" style="position: relative; aspect-ratio: 3 / 2">
  <img src="/facade.jpg" alt="What the picture shows" />
</figure>
```

```ts
import { createRelightImage } from './beamish/effects/relight-image/core'

const lamp = createRelightImage(document.querySelector('#plate'))
lamp.start()
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
import { createRelightImage } from '@/beamish/effects/relight-image/core'

export function Plate() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const lamp = createRelightImage(host.current)
    lamp.start()
    return () => lamp.destroy()
  }, [])

  return (
    <figure ref={host} className="plate">
      <img src="/facade.jpg" alt="What the picture shows" />
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
import { createRelightImage } from '@/beamish/effects/relight-image/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let lamp: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  lamp = createRelightImage(host.value)
  lamp.start()
})

onBeforeUnmount(() => lamp?.destroy())
</script>

<template>
  <figure ref="host" class="plate">
    <img src="/facade.jpg" alt="What the picture shows" />
  </figure>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module with no
framework in it.

## Tuning it

`height` first. It is how far above the sheet the lamp is held and most of the
character is in it: low is a raking light that finds every ridge in the
impression, high is a lamp overhead that finds almost none. Everything else is
an adjustment to what that decides.

`smooth` is the one people skip and then wonder why the picture is fizzing. It
is how far apart the two samples are that the gradient is taken from, which
low-passes the height field on the way, so it is the difference between lighting
the shape of the impression and lighting the noise in the file. Below about 1.5
you are mostly lighting JPEG blocks. On a large, clean image you can take it up
to 4 or 5 and get a broader, calmer surface.

`relief` past about 15 stops reading as paper and starts reading as hammered
metal. That is a real look and it is not this one.

`gloss` and `shine` are a pair. Gloss is how much the ink catches; shine is how
tight the catch is. Low shine and moderate gloss is a satin sheen across a wide
area, which suits a matte stock. High shine and low gloss is a small hard glint
on the ridges, which suits a varnish.

On a dark photograph, raise `strength` and drop `gloss`. There is more room
above the base tone than below it, and a specular on top of an already dark
passage is the quickest way to make a picture look like it has been through a
filter.

## Pausing

Nothing moves unless the cursor does, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

## Reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn, which means the lamp never comes on and what you have is the
photograph. That is the right resting state rather than a compromise: the
picture is the content and the lamp was always an extra.

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
   from another origin without CORS headers, and it throws at upload rather than
   at load, so the picture appears and the lamp does nothing. Serve the image
   from your own origin or set `crossorigin`.

2. **Using it on a photograph that is already about light.** You will be
   lighting its shadows as though they were trenches. The pictures this suits
   are the flat-lit ones.

3. **Leaving `smooth` at the bottom of its range to get more detail.** What you
   get is the compression, lit. The detail you want is in the impression, and
   the impression is bigger than one pixel.

4. **Turning `relief` up to make it more visible.** `height` is the dial for
   that. Relief past 15 makes the paper metallic, and a photograph printed on
   metal is a different idea from this one.
