You are adding **Contents** from Beamish to this project.

> A full-viewport index that opens as a real dialog and cascades in. Navigation · component · MIT.
> https://beamish.ink/components/contents

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

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/components/contents/react.tsx`**

```tsx
/*
 * Contents: Beamish
 * https://beamish.ink/components/contents
 *
 * A full-viewport index. The overlay is a real <dialog> opened with showModal(),
 * which is a decision worth stating plainly: the browser then gives us the focus
 * trap, Escape, the top layer, inerting the rest of the page, and returning focus
 * to the trigger on close. Every one of those is a thing hand-rolled menus get
 * subtly wrong, and none of them is our code.
 *
 * What is left is layout, type and a staggered reveal.
 */

'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './styles.css'

export type ContentsItem = {
  label: string
  href: string
  /** Small trailing note: a category, a count, a date. */
  meta?: string
}

export type ContentsSection = {
  title: string
  items: ContentsItem[]
}

export type ContentsProps = {
  sections: ContentsSection[]
  /** Trigger text and the dialog's accessible name. */
  label?: string
  /** Text on the close control. */
  closeLabel?: string
  /** Rendered under the heading, inside the overlay. */
  children?: ReactNode
  /** Controlled mode. Leave undefined and the component manages its own state. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

export function Contents({
  sections,
  label = 'Index',
  closeLabel = 'Close',
  children,
  open,
  onOpenChange,
  className
}: ContentsProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const titleId = useId()

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  // showModal() and close() are the source of truth for the element; this keeps
  // the element in step with React rather than the other way round.
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (isOpen && !element.open) element.showModal()
    if (!isOpen && element.open) element.close()
  }, [isOpen])

  /*
   * showModal() inerts the page but does not stop it scrolling behind the
   * overlay, which on a long index is disorienting. Locking the root element
   * rather than the body avoids fighting anything that positions off body.
   */
  useEffect(() => {
    if (!isOpen) return
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = previous
    }
  }, [isOpen])

  let index = 0

  return (
    <>
      <button
        type="button"
        className={['beamish-contents__trigger', className].filter(Boolean).join(' ')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      <dialog
        ref={dialog}
        className="beamish-contents"
        aria-labelledby={titleId}
        // Escape fires `cancel` before `close`; both are handled so state cannot
        // drift out of step with the element when the browser closes it for us.
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        // Clicking the backdrop lands on the dialog element itself, never on its
        // children, which is the cheapest reliable outside-click test there is.
        onClick={event => {
          if (event.target === dialog.current) setOpen(false)
        }}
      >
        <div className="beamish-contents__inner">
          <div className="beamish-contents__head">
            <h2 className="beamish-contents__title" id={titleId}>
              {label}
            </h2>
            <button
              type="button"
              className="beamish-contents__close"
              onClick={() => setOpen(false)}
            >
              {closeLabel}
            </button>
          </div>

          {children ? <div className="beamish-contents__lede">{children}</div> : null}

          <nav className="beamish-contents__nav" aria-label={label}>
            {sections.map(section => (
              <section className="beamish-contents__section" key={section.title}>
                <h3 className="beamish-contents__heading">{section.title}</h3>
                <ul className="beamish-contents__list">
                  {section.items.map(item => (
                    <li
                      className="beamish-contents__item"
                      key={item.href}
                      // Drives the reveal stagger. Counted across every section
                      // so the cascade reads as one movement down the page.
                      style={{ ['--beamish-i' as string]: index++ }}
                    >
                      <a className="beamish-contents__link" href={item.href}>
                        <span className="beamish-contents__label">{item.label}</span>
                        {item.meta ? (
                          <span className="beamish-contents__meta">{item.meta}</span>
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        </div>
      </dialog>
    </>
  )
}

export default Contents
```

**`src/beamish/components/contents/styles.css`**

```text
/*
 * Contents: Beamish
 *
 * Every custom property has a fallback, so the component looks right dropped into
 * a project that has never heard of Beamish tokens. If the tokens are present it
 * inherits them instead.
 */

.beamish-contents,
.beamish-contents__trigger {
  --contents-paper: var(--background-deep, 251, 250, 244);
  --contents-ink: var(--label-1, #000);
  --contents-ink-2: var(--label-2, rgba(54, 54, 48, 0.78));
  --contents-ink-3: var(--label-3, rgba(54, 54, 48, 0.7));
  --contents-rule: var(--label-4, rgba(54, 54, 48, 0.16));
  --contents-line: var(--control-line, rgba(54, 54, 48, 0.7));
  --contents-accent: var(--accent, #c44400);
  --contents-ease: var(--ease-66, cubic-bezier(0.66, 0, 0.01, 1));
  --contents-expo: var(--ease-out-expo, cubic-bezier(0.22, 1, 0.36, 1));
  --contents-mono: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

/* --- trigger ------------------------------------------------------------- */

.beamish-contents__trigger {
  appearance: none;
  background: none;
  border: 1px solid var(--contents-line);
  border-radius: 100px;
  padding: 0.6rem 1.15rem;
  font-family: var(--contents-mono);
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: inherit;
  cursor: pointer;
  transition: background-color 0.35s var(--contents-ease);
}

.beamish-contents__trigger:hover {
  background-color: color-mix(in srgb, currentColor 8%, transparent);
}

.beamish-contents__trigger:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}

/* --- overlay ------------------------------------------------------------- */

/*
 * A <dialog> arrives with a pile of user-agent styles built for a small centred
 * box. All of them have to go before it can be a full-viewport surface.
 */
.beamish-contents {
  width: 100vw;
  max-width: 100vw;
  height: 100dvh;
  max-height: 100dvh;
  margin: 0;
  padding: 0;
  border: 0;
  background: rgb(var(--contents-paper));
  color: var(--contents-ink);
  font-family: var(--contents-mono);
  /* A dialog inherits from wherever it is written in the markup, so a centred
     hero or an rtl wrapper would silently reflow the index. Pin it. */
  text-align: start;
  overflow: hidden;

  opacity: 0;
  /*
   * `display` and `overlay` are discrete properties. Without allow-discrete the
   * element is removed from the top layer the instant close() is called and the
   * exit transition never runs. This one line is the whole difference between a
   * dialog that fades out and one that vanishes.
   */
  transition:
    opacity 0.45s var(--contents-ease),
    display 0.45s allow-discrete,
    overlay 0.45s allow-discrete;
}

.beamish-contents[open] {
  opacity: 1;
}

@starting-style {
  .beamish-contents[open] {
    opacity: 0;
  }
}

.beamish-contents::backdrop {
  background: rgb(var(--contents-paper) / 0.6);
  backdrop-filter: blur(6px);
}

.beamish-contents__inner {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: clamp(1.25rem, 4vw, 3rem);
  display: flex;
  flex-direction: column;
  gap: clamp(1.5rem, 4vw, 3rem);
}

/* --- head ---------------------------------------------------------------- */

.beamish-contents__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--contents-rule);
}

.beamish-contents__title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--contents-ink-3);
}

.beamish-contents__close {
  appearance: none;
  background: none;
  border: 1px solid var(--contents-line);
  border-radius: 100px;
  padding: 0.6rem 1.15rem;
  font: inherit;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--contents-ink);
  cursor: pointer;
  transition: background-color 0.35s var(--contents-ease);
}

.beamish-contents__close:hover {
  background-color: color-mix(in srgb, var(--contents-line) 10%, transparent);
}

.beamish-contents__close:focus-visible {
  outline: 2px solid var(--contents-ink);
  outline-offset: 3px;
}

.beamish-contents__lede {
  max-width: 46ch;
  color: var(--contents-ink-2);
  font-size: 0.95rem;
  line-height: 1.55;
}

/* --- list ---------------------------------------------------------------- */

.beamish-contents__nav {
  display: grid;
  gap: clamp(1.5rem, 4vw, 2.75rem);
}

.beamish-contents__heading {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--contents-ink-3);
}

.beamish-contents__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.beamish-contents__item {
  border-top: 1px solid var(--contents-rule);
  opacity: 0;
  transform: translateY(0.6rem);
  transition:
    opacity 0.5s var(--contents-expo),
    transform 0.5s var(--contents-expo);
  /* Counted across every section, so the cascade reads as one movement. */
  transition-delay: calc(var(--beamish-i, 0) * 26ms);
}

.beamish-contents[open] .beamish-contents__item {
  opacity: 1;
  transform: none;
}

.beamish-contents__link {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 0;
  color: inherit;
  text-decoration: none;
  transition: color 0.3s var(--contents-ease);
}

.beamish-contents__label {
  font-size: clamp(1.35rem, 4.2vw, 2.1rem);
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.beamish-contents__meta {
  flex: none;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--contents-ink-3);
}

.beamish-contents__link:hover,
.beamish-contents__link:focus-visible {
  color: var(--contents-accent);
}

.beamish-contents__link:focus-visible {
  outline: 2px solid var(--contents-accent);
  outline-offset: 4px;
}

/* --- reduced motion ------------------------------------------------------ */

@media (prefers-reduced-motion: reduce) {
  .beamish-contents,
  .beamish-contents__item,
  .beamish-contents__link,
  .beamish-contents__close,
  .beamish-contents__trigger {
    transition-duration: 0.01ms;
    /* A staggered cascade with no duration is still a cascade of repaints. */
    transition-delay: 0ms;
  }

  .beamish-contents__item {
    transform: none;
  }
}
```

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
import { Contents } from '@/beamish/components/contents/vue'
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

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
