You are adding **Plate** from Beamish to this project.

> A contact sheet that opens into a lightbox you can arrow, swipe or play through. Surfaces · component · MIT.
> https://beamish.ink/components/plate

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `react@>=18`
- Uses <dialog>.showModal(), so the focus trap, Escape, top layer, inerting and focus restoration are the browser's
- The fade uses transition-behavior: allow-discrete and @starting-style; where those are unsupported the overlay appears instantly, which is a graceful loss
- No carousel library, no focus-trap library, no portal, no scroll-lock package
- Swipe is Pointer Events, and is ignored for mouse input, where a small drag is the start of a click rather than a gesture
- React 18+ or Vue 3. This one is a component, not an imperative effect.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/components/plate/react.tsx` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/plate/react.tsx |
| `src/beamish/components/plate/styles.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/plate/styles.css |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 3. Wire it in

**React.** The plates are data. Nothing else is required.

```tsx
import { Plate } from '@/beamish/components/plate/react'

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
import { Plate } from '@/beamish/components/plate/vue'
import type { PlateItem } from '@/beamish/components/plate/vue'

const plates: PlateItem[] = [
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
import { Plate } from '@/beamish/components/plate/react'
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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `label` | string | `Plates` | any value | Accessible name for the sheet and for the overlay. Keep it a noun. It is read out as the name of the whole gallery. |
| `closeLabel` | string | `Close` | any value | Text on the close control. There is a visible one as well as Escape, because Escape is not discoverable and on a touch device it does not exist. |
| `columns` | number | `3` | 1 to 6 | Columns at the widest the container gets. The sheet steps down on its own below that, because it fits its container rather than the viewport. |
| `autoplay` | number | `0` | 0 to 12 | Seconds between plates once the overlay is open. Zero is off, and off is the default: a gallery that starts moving on its own is rarely what the reader wanted. Any value above zero renders a pause control, and reduced motion turns it off entirely. |
| `playLabel` | string | `Play` | any value | Text on the autoplay control when it is stopped. |
| `pauseLabel` | string | `Pause` | any value | Text on the autoplay control when it is running. |

## 5. Cleanup and SSR

There is nothing to destroy. The interval is cleared on unmount and when the
overlay closes, the `matchMedia` listener is removed on unmount, and the scroll
lock is released even if the component unmounts while open.

`window.matchMedia` is touched in an effect rather than during render, so the
component server-renders. Next.js App Router still needs `'use client'` at the
top of the file that uses it, which the React build already carries.

## 6. Pausing and reduced motion

Handled with a live `matchMedia` listener rather than a value read once at mount,
so changing the setting with the page open does the right thing.

What goes is the travel. The plate still changes, because that is the entire
function of the control and removing it would break the component rather than
calm it. It appears instead of sliding in, and the thumbnail stops growing under
the cursor.

## 7. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/plate/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
