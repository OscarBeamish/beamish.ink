## What it is

Contents is a full-viewport index: a small trigger, and an overlay that takes the
whole screen and lists everything in mono with hairline rules between the rows.
The rows cascade in on a 26ms stagger counted across every section, so the reveal
reads as one movement down the page rather than several.

The overlay is a real `<dialog>` opened with `showModal()`. That is worth saying
plainly, because it is the whole design: the browser then provides the focus
trap, Escape, the top layer, inerting the rest of the page, and returning focus
to the trigger on close. Every one of those is something hand-rolled menus get
subtly wrong, and none of them is our code. There is no focus-trap library, no
portal and no scroll-lock package.

What is left is layout, type, and one transition.

## Wiring

**React.**

```tsx
import { Contents } from '@/beamish/components/contents/react'

const sections = [
  {
    title: 'Backdrops',
    items: [
      { label: 'Overprint', href: '/effects/overprint', meta: 'shader' },
      { label: 'Sundial', href: '/effects/sundial', meta: 'three' }
    ]
  },
  {
    title: 'Pointer',
    items: [{ label: 'Foil', href: '/effects/foil', meta: 'shader' }]
  }
]

export function Header() {
  return <Contents sections={sections} label="Index" />
}
```

Uncontrolled by default. Pass `open` and `onOpenChange` only when something
outside needs to close it — a route change is the usual reason:

```tsx
const [open, setOpen] = useState(false)
const pathname = usePathname()
useEffect(() => setOpen(false), [pathname])

return <Contents sections={sections} open={open} onOpenChange={setOpen} />
```

**Vue.**

```vue
<script setup lang="ts">
import { Contents } from '@/beamish/components/contents/vue'
const sections = [/* as above */]
</script>

<template>
  <Contents :sections="sections" label="Index" />
</template>
```

**Next.js App Router.** The React file carries `'use client'`. If you are using
`next/link` rather than plain anchors, swap the `<a>` inside `react.tsx` for
`<Link>` — it is one element, and there is no configuration hook for it on
purpose.

**The stylesheet.** Both files do `import './styles.css'`, which works in Vite,
Next.js, Astro, Nuxt and anything else with a normal CSS pipeline. If your setup
cannot import CSS from a component, paste the contents of `styles.css` into your
global stylesheet instead and delete the import.

**Tokens.** Every custom property has a fallback, so it looks right in a project
that has never heard of Beamish. If you define `--accent`, `--label-1`,
`--label-4`, `--control-line`, `--font-mono` or `--ease-66`, it inherits your
theme instead.

## Accessibility

- **The focus trap is the browser's.** `showModal()` puts the dialog in the top
  layer and makes everything behind it inert. Do not add a trapping library on
  top; the two will fight.
- **Escape closes it** with no code from us. The `cancel` and `close` events are
  both handled so React state cannot drift out of step when the browser closes
  the element itself.
- **There is a visible Close control as well as Escape.** Escape is not
  discoverable, and it is not available to someone using a touch screen.
- **Focus returns to the trigger** on close, again from the browser. This is the
  single most commonly missed part of a menu like this.
- **`aria-expanded` on the trigger** and `aria-haspopup="dialog"`, so the state is
  announced rather than implied by an icon.
- **The overlay is labelled** by the visible heading via `aria-labelledby`, so a
  screen reader announces "Index, dialog" rather than just "dialog".
- **The rows are a real `<nav>` containing a real list.** Section headings are
  `<h3>` inside it, which gives heading navigation for free.

One thing the browser does not do: stop the page scrolling behind the overlay.
The component locks `documentElement` while open and restores the previous value
on close.

## Cleanup and SSR

The only thing to undo is the scroll lock, which is released in the effect's
cleanup and again on unmount, so an unmount mid-transition cannot leave the page
stuck.

It renders on the server. `showModal()` is only ever called from an effect, and
a `<dialog>` with no `open` attribute is invisible and inert in the initial HTML,
so there is no flash of an open menu before hydration.

## Reduced motion

Under `prefers-reduced-motion: reduce` both the fade and the row stagger drop to
nothing, and the stagger's `transition-delay` is zeroed as well — a cascade with
no duration is still a cascade, just an ugly one.

The overlay still appears and disappears; only the movement goes.

## Common mistakes

1. **Adding a focus-trap library.** It will fight `showModal()`, and the symptom
   is focus that cannot leave the close button or escapes to the page behind. If
   focus is misbehaving, remove the library rather than adding configuration.

2. **Rendering the dialog conditionally.** `{open && <Contents … />}` breaks the
   exit transition and loses focus restoration, because the element the browser
   wants to return focus from no longer exists. The dialog stays mounted and the
   `open` attribute does the work — that is what `allow-discrete` is for.

3. **Expecting the fade everywhere.** The exit transition needs
   `transition-behavior: allow-discrete` and `@starting-style`. Where those are
   missing the overlay appears and disappears instantly. That is a deliberate
   graceful loss, not a bug to work around with JavaScript timers.
