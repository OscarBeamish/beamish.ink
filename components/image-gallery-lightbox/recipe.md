## What it is

Plate is a contact sheet that opens into a lightbox. A grid of numbered plates,
and an overlay you move through with the arrow keys, a swipe, the controls, or an
autoplay you have to start yourself.

The overlay is a real `<dialog>` opened with `showModal()`. That is the decision
the rest of it hangs off. The browser then gives you the focus trap, Escape, the
top layer, inerting the page behind, and returning focus to where you came from.
Every one of those is something hand-rolled galleries get subtly wrong, and none
of it is code in this repo or a package in yours. There is no carousel library
here, no focus-trap library, no portal and no scroll-lock.

What is left is the part worth building. Arrow keys and Home and End. A swipe
that is ignored for mouse input, where a small drag is the start of a click
rather than a gesture. Neighbour preload, so the next plate is already decoded
before you ask for it. And a counter, because a gallery with no sense of how far
through you are is a gallery you leave.

The overlay is paper rather than black. A dark lightbox is the convention and it
is the wrong one here: it turns every warm image cold, and it makes the caption
the brightest thing on the screen. A plate in a book sits on the page, with a
margin, which is what this does.

## Wiring

**React.** The plates are data. Nothing else is required.

```tsx
import { Plate } from '@/beamish/components/image-gallery-lightbox/react'

export function Gallery() {
  return (
    <Plate
      label="Selected work"
      columns={3}
      plates={[
        {
          src: '/work/thumb-01.webp',
          full: '/work/full-01.webp',
          alt: 'The homepage at desktop width, dark type on cream',
          width: 1600,
          height: 900,
          caption: 'Homepage'
        }
      ]}
    />
  )
}
```

`width` and `height` are the intrinsic pixel size of the file and they are not
optional. They are how the sheet reserves its cells before anything
downloads, and how the overlay sizes the plate it is fitting. Get them wrong and
the grid moves under the reader as it loads.

`full` is for when the sheet shows a smaller file than the overlay should. Leave
it out and both use `src`.

**Vue.** Same props, and `open` works with `v-model`.

```vue
<script setup lang="ts">
import { Plate } from '@/beamish/components/image-gallery-lightbox/vue'
import type { ImageGalleryLightboxItem } from '@/beamish/components/image-gallery-lightbox/vue'

const plates: ImageGalleryLightboxItem[] = [
  {
    src: '/work/thumb-01.webp',
    alt: 'The homepage at desktop width, dark type on cream',
    width: 1600,
    height: 900,
    caption: 'Homepage'
  }
]
</script>

<template>
  <Plate label="Selected work" :plates="plates" :columns="3" />
</template>
```

**Astro.** It is a React or Vue island like any other. The sheet needs no
JavaScript to look right, so hydrate it late.

```astro
---
import { Plate } from '@/beamish/components/image-gallery-lightbox/react'
import plates from '../data/plates.json'
---

<Plate client:visible label="Selected work" plates={plates} />
```

**Deep-linking a plate.** Pass `open` and handle `onOpenChange` yourself. The
index is the position in the array, and `null` is closed.

```tsx
const [open, setOpen] = useState<number | null>(null)

<Plate plates={plates} open={open} onOpenChange={setOpen} />
```

## Sizing

The sheet fits its container, not the viewport. `columns` sets the most columns
it will use at its widest, and it steps down on its own below that, because a
gallery is as likely to sit in a reading column as across a page. There are no
breakpoints to keep in step with your layout.

Cells are square whatever the file is, so the sheet is a grid rather than a
staircase. Giving portrait plates a taller box is the obvious move and it is
wrong: the rows go ragged and a landscape plate ends up floating above a hole. A
contact sheet has uniform frames for the same reason. The overlay never crops: it
fits the whole image inside the margin, at its own proportions.

## Autoplay

Off by default, and that is deliberate. A gallery that starts moving on its own
is rarely what the reader wanted, and it takes the one thing they were looking at
away from them.

Set `autoplay` to a number of seconds and a pause control appears next to the
close. WCAG 2.2.2 is Level A: anything that moves for more than five seconds has
to be pausable, and a control that is only in the docs is not one. It never
starts on its own, it stops when the overlay closes so it does not resume the
next time, and it skips while the tab is in the background, where it would
otherwise run through the whole set unseen.

Under reduced motion the control is not rendered and autoplay does not run.

## Reduced motion

Handled with a live `matchMedia` listener rather than a value read once at mount,
so changing the setting with the page open does the right thing.

What goes is the travel. The plate still changes, because that is the entire
function of the control and removing it would break the component rather than
calm it. It appears instead of sliding in, and the thumbnail stops growing under
the cursor.

## Cleanup and SSR

There is nothing to destroy. The interval is cleared on unmount and when the
overlay closes, the `matchMedia` listener is removed on unmount, and the scroll
lock is released even if the component unmounts while open.

`window.matchMedia` is touched in an effect rather than during render, so the
component server-renders. Next.js App Router still needs `'use client'` at the
top of the file that uses it, which the React build already carries.

## Common mistakes

1. **Leaving `width` and `height` off the plates.** The sheet then has no shape
   to reserve, so every cell is zero-height until its file arrives and the grid
   jumps as they land. They are the intrinsic size of the image file, not the
   size you want it displayed at.

2. **Writing the caption into `alt`.** They do different jobs. `alt` is what the
   picture shows, for someone who cannot see it. The caption is what you want to
   say about it, and it is read by everyone. Putting the caption in both means
   a screen reader hears it twice.

3. **Turning `autoplay` on for a portfolio.** Someone looking at your work is
   reading it, not watching it, and moving the plate on while they are still on
   it is the fastest way to lose them. It is there for a display screen or a
   hero, which is a different job.

4. **Pointing `src` at the full-size file.** Six 4000px photographs in a grid of
   300px cells is tens of megabytes to render thumbnails. Use `src` for the
   thumbnail and `full` for the one the overlay shows.
