## What it is

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

## What actually makes it look like glass

Not the blur. The blur is what everybody writes and it gives you a panel with
some opacity on it.

What reads as glass is the edge, and specifically a hairline of specular along
the top where a real sheet catches the light: `inset 0 1.5px 0 rgba(255, 255,
255, .9)`. Under it a rim, and under that a shadow deep enough to put the sheet
well above the page.

The backdrop keeps some of the page visible on purpose. A modal over a solid
scrim is a card on a grey screen, and then the glass has nothing to be glass
about.

## Blur, and bending

Two effects, one portable.

**The blur** is `backdrop-filter` and every current browser does it.

**The bend** is an SVG displacement filter on the backdrop, and only Chromium
applies it. Safari ignores SVG filters in `backdrop-filter`. Firefox parses the
value, passes an `@supports` test and then renders nothing, so no feature query
tells the truth. `refract` is on by default and the sheet is built to look
finished without it.

## Wiring

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

## Why the animation is written the way it is

A `<dialog>` is `display: none` when shut, so a transition has nothing to run
between: `close()` takes the element out of flow in the same frame.

So the leaving animation runs on a class, and `close()` is called on
`animationend`. There is a timer behind that, because an animation interrupted
part way never fires its end event and a dialog that will not shut is worse than
one that shuts abruptly.

Escape fires `cancel`, not `close`, which is why that is the event intercepted.
Letting the default through would skip the animation and never tell the parent
the dialog had gone, leaving your `open` state saying true about something that
is not on the screen any more.

## Contrast

`tint` is the control and a modal needs more of it than a nav does, because a
modal carries body copy rather than three words of navigation. WCAG wants 4.5:1
for body text. Check it against the busiest part of whatever is behind, not the
average.

`prefers-reduced-transparency` is a real system setting and a modal is exactly
what it exists for: this one sits over whatever somebody was reading. The sheet
goes opaque and the specular goes with it, because a highlight on something that
is not transparent is a lie about the material.

`forced-colors` throws out every background and shadow, so it falls back to a
border.

## Tuning it

`blur` past about 24 and the page behind stops being recognisable, at which
point the modal may as well be opaque and you have paid for a composited layer
to achieve it.

`lightDismiss` should stay on unless the dialog is asking something that must
not be dismissed by accident. If it is, the better question is whether it should
be a dialog at all: a destructive confirmation is usually better as a step in
the page than as something you can click away.

## Cleanup and SSR

Both components restore `body` overflow and remove the filter when the dialog
closes or they unmount. `window` is only touched inside effects, so they render
on a server without complaining.

## Common mistakes

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
