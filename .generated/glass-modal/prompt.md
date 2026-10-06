You are adding **GlassModal** from Beamish to this project.

> A sheet of glass over the page, on a native dialog so the browser handles the hard part. Navigation · component · MIT.
> https://beamish.ink/components/glass-modal

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `react@>=18`
- A native dialog opened with showModal(), so the top layer, the backdrop, the focus trap, the inert background, Escape and returning focus to the opener are all the browser's. There is no focus-trap library here and there should not be one
- showModal() does not stop the page behind from scrolling, which is the one thing it leaves you, so the component locks the body and puts it back on close
- The blur is backdrop-filter, which every current browser supports. The refraction is an SVG filter inside backdrop-filter, which only Chromium applies: Safari ignores it and Firefox parses the value, passes an @supports test and renders nothing
- A dialog is display:none when shut, so an opening transition has nothing to run between. It animates on a class either side of the frame and waits for animationend before calling close(), with a timer behind it because an interrupted animation never fires one
- Escape fires cancel rather than close, so that is what is intercepted. The default would skip the leaving animation and never tell the parent the dialog had gone
- prefers-reduced-transparency turns the sheet opaque and takes the specular with it. forced-colors falls back to a border, which is the one thing that mode keeps
- React 18+ or Vue 3. This one is a component, not an imperative effect.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/components/glass-modal/react.tsx` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/glass-modal/react.tsx |
| `src/beamish/components/glass-modal/glass.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/glass-modal/glass.ts |
| `src/beamish/components/glass-modal/styles.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/glass-modal/styles.css |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

A sheet of glass over the page, on a native `<dialog>`.

`showModal()` is doing the hard part and it is worth saying what that covers,
because it is most of what a modal is: the browser promotes the dialog into the
top layer, makes the rest of the document inert so nothing behind it is
focusable or reachable by a screen reader, traps focus inside, closes on Escape,
and hands focus back to whatever opened it.

There is no focus-trap library here and there should not be one. Every line of
that behaviour is something the platform now gets right, including for the
screen readers a hand-rolled trap tends to miss.

What is left is the glass, the light dismiss, and stopping the page behind from
scrolling, which `showModal()` does not do.

## 3. Wire it in

The component is controlled. It does not own whether it is open, because the
thing that opened it usually needs to know.

```tsx
import { useState } from 'react'
import { Pane } from '@/beamish/components/glass-modal/react'

export function Example() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>

      <Pane open={open} onClose={() => setOpen(false)} title="A dialog title">
        <p>Whatever the dialog is for.</p>
      </Pane>
    </>
  )
}
```

**Vue.** Same shape, with an event instead of a callback.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Pane } from '@/beamish/components/glass-modal/vue'

const open = ref(false)
</script>

<template>
  <button type="button" @click="open = true">Open</button>

  <Pane :open="open" title="A dialog title" @close="open = false">
    <p>Whatever the dialog is for.</p>
  </Pane>
</template>
```

**Astro.** `client:load`, or `client:visible` if the trigger is below the fold.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `blur` | number | `18` | 0 to 40 | Blur of the page showing through. Past about 24 the page behind stops being recognisable, and a modal whose backdrop is unrecognisable may as well be opaque. |
| `tint` | number | `0.72` | 0 to 1 | How milky the sheet is. This is the contrast control and a modal needs more of it than a nav does, because a modal carries body copy rather than three words of navigation. |
| `refract` | boolean | `true` | `true` · `false` | Bend the backdrop as well as blurring it. Chromium only. Everywhere else you get the blur and the edge, which is most of the effect, and nothing looks broken. |
| `refraction` | number | `22` | 0 to 60 | How far the rim bends what is behind it, in pixels. A modal can take more of this than a nav because its edge is further from the text. |
| `lightDismiss` | boolean | `true` | `true` · `false` | Close when the page behind is clicked. Leave it on unless the dialog is asking something that should not be dismissed by accident, in which case the question is whether it should be a dialog at all. |

## 5. Cleanup and SSR

Both components restore `body` overflow and remove the filter when the dialog
closes or they unmount. `window` is only touched inside effects, so they render
on a server without complaining.

## 7. The three mistakes most likely to be made here

1. **Reaching for a focus-trap library.** `showModal()` already does it, better,
   and the library will fight it. If focus is escaping, the dialog was opened
   with `show()` rather than `showModal()`.

2. **Putting it over a flat background.** There is nothing to blur and nothing
   to bend, so the sheet reads as a slightly dirty card. Glass wants something
   behind it.

3. **Forgetting that the page behind still scrolls.** `showModal()` makes the
   document inert but not unscrollable, so a wheel over the backdrop still moves
   what the dialog is sitting on. This component locks it; a hand-rolled one
   usually does not.

4. **Leaving `tint` low because it looks better.** It does look better, right up
   until somebody has to read a paragraph through it.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/glass-modal/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
