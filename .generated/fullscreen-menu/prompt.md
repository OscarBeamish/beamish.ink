You are adding **FullscreenMenu** from Beamish to this project.

> A full-viewport index that opens as a real dialog and cascades in. Navigation · component · MIT.
> https://beamish.ink/components/fullscreen-menu

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `react@>=18`
- Uses <dialog>.showModal(), so the focus trap, Escape, top layer and focus restoration are the browser's
- The fade uses transition-behavior: allow-discrete and @starting-style; where those are unsupported the overlay appears instantly, which is a graceful loss
- No focus-trap library, no portal, no scroll-lock package
- React 18+ or Vue 3. This one is a component, not an imperative effect.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/components/fullscreen-menu/react.tsx` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/fullscreen-menu/react.tsx |
| `src/beamish/components/fullscreen-menu/styles.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/fullscreen-menu/styles.css |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Contents is a full-viewport index: a small trigger, and an overlay that takes the
whole screen and lists everything in mono with hairline rules between the rows.
The rows cascade in on a 26ms stagger counted across every section, so the reveal
reads as one movement down the page rather than several.

The overlay is a real `<dialog>` opened with `showModal()`. That is the whole
design. The browser then provides the focus trap, Escape, the top layer,
inerting the rest of the page, and returning focus to the trigger on close. Every
one of those is something hand-rolled menus get subtly wrong, and none of them is
our code. There is no focus-trap library, no portal, and no scroll-lock package.

What is left is layout, type, and one transition.

## 3. Wire it in

**React.**

```tsx
import { Contents } from '@/beamish/components/fullscreen-menu/react'

const sections = [
  {
    title: 'Backdrops',
    items: [
      { label: 'Overprint', href: '/effects/halftone-backdrop', meta: 'shader' },
      { label: 'Sundial', href: '/effects/cast-shadow-scene', meta: 'three' }
    ]
  },
  {
    title: 'Pointer',
    items: [{ label: 'Foil', href: '/effects/pointer-foil-sheen', meta: 'shader' }]
  }
]

export function Header() {
  return <Contents sections={sections} label="Index" />
}
```

It is uncontrolled by default. Pass `open` and `onOpenChange` only when something
outside needs to close it. A route change is the usual reason:

```tsx
const [open, setOpen] = useState(false)
const pathname = usePathname()
useEffect(() => setOpen(false), [pathname])

return <Contents sections={sections} open={open} onOpenChange={setOpen} />
```

**Vue.**

```vue
<script setup lang="ts">
import { Contents } from '@/beamish/components/fullscreen-menu/vue'
const sections = [/* as above */]
</script>

<template>
  <Contents :sections="sections" label="Index" />
</template>
```

**Next.js App Router.** The React file carries `'use client'`. If you use
`next/link` rather than plain anchors, swap the `<a>` inside `react.tsx` for
`<Link>`. It is one element, and there is no configuration hook for it on
purpose.

**The stylesheet.** Both files do `import './styles.css'`, which works in Vite,
Next.js, Astro, Nuxt, and anything else with a normal CSS pipeline. If your setup
cannot import CSS from a component, paste the contents of `styles.css` into your
global stylesheet and delete the import.

**Tokens.** Every custom property has a fallback, so it looks right in a project
that has never heard of Beamish. If you define `--accent`, `--label-1`,
`--label-4`, `--control-line`, `--font-mono` or `--ease-66`, it inherits your
theme instead.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `label` | string | `Index` | any value | The trigger's text, and the dialog's accessible name. Keep it a noun. It is read out as the name of the whole overlay. |
| `closeLabel` | string | `Close` | any value | Text on the close control. There is a visible one as well as Escape, because Escape is not discoverable. |
| `open` | boolean | `false` | `true` · `false` | Pass it to control the overlay yourself and listen to onOpenChange. Leave it undefined and the component keeps its own state, which is what you want unless a route change needs to close it. |

## 5. Accessibility. Do not skip this

- The focus trap is the browser's. `showModal()` puts the dialog in the top layer
  and makes everything behind it inert. Do not add a trapping library on top. The
  two will fight.
- Escape closes it with no code from us. The `cancel` and `close` events are both
  handled, so React state cannot drift out of step when the browser closes the
  element itself.
- There is a visible Close control as well as Escape. Escape is not discoverable
  and it is not available on a touch screen.
- Focus returns to the trigger on close, again from the browser. This is the part
  of a menu like this that is most often missed.
- The trigger carries `aria-expanded` and `aria-haspopup="dialog"`, so the state
  is announced rather than implied by an icon.
- The overlay is labelled by the visible heading via `aria-labelledby`, so a
  screen reader announces "Index, dialog" rather than "dialog".
- The rows are a real `<nav>` containing a real list. Section headings are `<h3>`
  inside it, which gives heading navigation for free.

The browser does not stop the page scrolling behind the overlay. The component
locks `documentElement` while open and restores the previous value on close.

## 6. Cleanup and SSR

The only thing to undo is the scroll lock. It is released in the effect's cleanup
and again on unmount, so an unmount mid-transition cannot leave the page stuck.

It renders on the server. `showModal()` is only ever called from an effect, and a
`<dialog>` with no `open` attribute is invisible and inert in the initial HTML, so
there is no flash of an open menu before hydration.

## 6. Pausing and reduced motion

Under `prefers-reduced-motion: reduce` both the fade and the row stagger drop to
nothing, and the stagger's `transition-delay` is zeroed as well. A cascade with no
duration is still a cascade, just an ugly one.

The overlay still appears and disappears. Only the movement goes.

## 7. The three mistakes most likely to be made here

1. **Adding a focus-trap library.** It will fight `showModal()`. The symptom is
   focus that cannot leave the close button, or focus that escapes to the page
   behind. If focus misbehaves, remove the library rather than configuring it.

2. **Rendering the dialog conditionally.** `{open && <Contents … />}` breaks the
   exit transition and loses focus restoration, because the element the browser
   wants to return focus from no longer exists. Keep the dialog mounted and let
   the `open` attribute do the work. That is what `allow-discrete` is for.

3. **Expecting the fade everywhere.** The exit transition needs
   `transition-behavior: allow-discrete` and `@starting-style`. Where those are
   missing the overlay appears and disappears instantly. That is a deliberate
   graceful loss. Do not work around it with JavaScript timers.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/fullscreen-menu/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
