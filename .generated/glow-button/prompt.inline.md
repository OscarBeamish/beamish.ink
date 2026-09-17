You are adding **GlowButton** from Beamish to this project.

> The action pill: mono, uppercase, with a slow band of light crossing it. Navigation · component · MIT.
> https://beamish.ink/components/glow-button

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `react@>=18`
- Uses color-mix(); Chrome 111+, Safari 16.2+, Firefox 113+. Older browsers get the base colour with no hover shift, which is a graceful loss
- No JavaScript animation at all. The motion is two CSS transitions
- React 18+ or Vue 3. This one is a component, not an imperative effect.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/components/glow-button/react.tsx`**

```tsx
/*
 * Ember: Beamish
 * https://beamish.ink/components/glow-button
 *
 * The action pill: mono, uppercase, 100px radius, with a slow band of light
 * crossing it on hover. Renders a <button> by default and an <a> when given an
 * href, because a thing that navigates should be a link and a thing that acts
 * should be a button. The difference matters to anyone using a keyboard or
 * a screen reader.
 */

'use client'

import { forwardRef } from 'react'
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ForwardedRef,
  ReactNode
} from 'react'
import './styles.css'

export type EmberTone = 'solid' | 'quiet'

type Common = {
  children: ReactNode
  /** `solid` is the accent pill. `quiet` is the outlined secondary. */
  tone?: EmberTone
  className?: string
}

type ButtonProps = Common &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & { href?: undefined }

type AnchorProps = Common &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className'> & { href: string }

export type GlowButtonProps = ButtonProps | AnchorProps

const classes = (tone: EmberTone, className?: string) =>
  ['beamish-glow-button', `beamish-glow-button--${tone}`, className].filter(Boolean).join(' ')

export const Ember = forwardRef<HTMLButtonElement | HTMLAnchorElement, GlowButtonProps>(
  function Ember({ children, tone = 'solid', className, ...rest }, ref) {
    if ('href' in rest && rest.href !== undefined) {
      const anchor = rest as AnchorHTMLAttributes<HTMLAnchorElement>
      return (
        <a
          {...anchor}
          ref={ref as ForwardedRef<HTMLAnchorElement>}
          className={classes(tone, className)}
        >
          {children}
        </a>
      )
    }

    const button = rest as ButtonHTMLAttributes<HTMLButtonElement>
    return (
      <button
        // An explicit type, because a <button> inside a form defaults to submit
        // and that is never what anyone wanted from a component like this.
        type={button.type ?? 'button'}
        {...button}
        ref={ref as ForwardedRef<HTMLButtonElement>}
        className={classes(tone, className)}
      >
        {children}
      </button>
    )
  }
)

export default Ember
```

**`src/beamish/components/glow-button/styles.css`**

```text
/*
 * Ember: Beamish
 *
 * Every custom property has a fallback, so the component looks right dropped into
 * a project that has never heard of Beamish tokens. If the tokens are present it
 * inherits them instead, which is the whole point of shipping it this way.
 */

.beamish-glow-button {
  --ember-accent: var(--accent, #c44400);
  --ember-ink: var(--label-1, #000);
  --ember-line: var(--control-line, rgba(54, 54, 48, 0.7));
  --ember-ease: var(--ease-66, cubic-bezier(0.66, 0, 0.01, 1));

  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.6em;

  /* Mono, uppercase, wide. The type is doing most of the work here. */
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.9rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-decoration: none;
  white-space: nowrap;

  padding: 0.95rem 1.6rem;
  border: 1px solid transparent;
  border-radius: 100px;
  cursor: pointer;
  overflow: hidden;
  isolation: isolate;

  transition:
    background-color 0.4s var(--ember-ease),
    border-color 0.4s var(--ember-ease),
    color 0.4s var(--ember-ease),
    transform 0.25s var(--ember-ease);
}

.beamish-glow-button:disabled,
.beamish-glow-button[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
}

/* --- solid -------------------------------------------------------------- */

.beamish-glow-button--solid {
  background-color: var(--ember-accent);
  color: #fff;
}

/*
 * Darkens on hover rather than lightening. The accent sits near the top of its
 * range already, and lifting it drops the white lettering below 4.5:1.
 */
.beamish-glow-button--solid:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--ember-accent) 84%, #000);
}

/* --- quiet -------------------------------------------------------------- */

.beamish-glow-button--quiet {
  background-color: transparent;
  border-color: var(--ember-line);
  color: var(--ember-ink);
}

.beamish-glow-button--quiet:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--ember-line) 10%, transparent);
}

/* --- the catch ---------------------------------------------------------- */

/*
 * A single band of light crossing the face on hover, the ember of the name. It
 * is deliberately slow and low-contrast: a fast bright sweep on a button reads as
 * a discount code, not as a piece of design.
 */
.beamish-glow-button::after {
  content: '';
  position: absolute;
  inset: -40% -10%;
  z-index: -1;
  transform: translateX(-130%) rotate(14deg);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.34) 45%,
    rgba(255, 255, 255, 0.34) 55%,
    transparent 100%
  );
  transition: transform 0.9s var(--ember-ease);
  pointer-events: none;
}

.beamish-glow-button--quiet::after {
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--ember-accent) 18%, transparent) 50%,
    transparent 100%
  );
}

.beamish-glow-button:hover:not(:disabled)::after,
.beamish-glow-button:focus-visible::after {
  transform: translateX(130%) rotate(14deg);
}

.beamish-glow-button:active:not(:disabled) {
  transform: scale(0.985);
}

/* --- focus -------------------------------------------------------------- */

/*
 * A visible ring on the outside, not a recoloured border. WCAG 2.4.11 wants the
 * indicator to be distinguishable from the unfocused state at 3:1, and swapping
 * a border colour on a pill this size does not clear that.
 */
.beamish-glow-button:focus-visible {
  outline: 2px solid var(--ember-ink);
  outline-offset: 3px;
}

/* --- reduced motion ------------------------------------------------------ */

@media (prefers-reduced-motion: reduce) {
  .beamish-glow-button,
  .beamish-glow-button::after {
    transition-duration: 0.01ms;
  }
  /* No sweep at all rather than an instant one, which would read as a flash. */
  .beamish-glow-button::after {
    display: none;
  }
  .beamish-glow-button:active:not(:disabled) {
    transform: none;
  }
}
```

## 2. What it is

Ember is the action pill: mono, uppercase, 100px radius, with one slow band of
light crossing its face on hover. It is the one piece of the library that is
deliberately ordinary. The surprising things are meant to be the effects. This is
the thing you press to get one.

Two tones. `solid` is the accent pill and belongs to the single most important
action on a screen. `quiet` is the outlined secondary. If a page has two solid
Embers on it, one of them is wrong.

It renders a `<button>` by default and an `<a>` when given an `href`. A thing
that navigates should be a link and a thing that acts should be a button. There
is no `as` prop and no polymorphic generic: the distinction is small enough to
make by hand and important enough not to get wrong.

The hover state darkens. The accent sits near the top of its range already, and
lifting it drops white lettering below 4.5:1. The direction most libraries go is
the one that fails.

## 3. Wire it in

**React.**

```tsx
import { Ember } from '@/beamish/components/glow-button/react'

export function Cta() {
  return (
    <div className="flex gap-4">
      <Ember onClick={() => copy()}>Get prompt</Ember>
      <Ember tone="quiet" href="https://github.com/OscarBeamish/beamish.ink">
        View source
      </Ember>
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { Ember } from '@/beamish/components/glow-button/vue'
</script>

<template>
  <Ember @click="copy">Get prompt</Ember>
  <Ember tone="quiet" href="https://github.com/OscarBeamish/beamish.ink">View source</Ember>
</template>
```

**The stylesheet.** Both files do `import './styles.css'`, which works in Vite,
Next.js, Astro, Nuxt, and anything else with a normal CSS pipeline. If your setup
cannot import CSS from a component, paste the contents of `styles.css` into your
global stylesheet and delete the import. Nothing else changes.

**Tokens.** Every custom property in `styles.css` has a fallback, so it looks
right in a project that has never heard of Beamish. If you already define
`--accent`, `--label-1`, `--control-line`, `--font-mono` or `--ease-66`, it picks
those up and inherits your theme. Set `--accent` and it becomes your button.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `tone` | enum | `solid` | `solid` · `quiet` | `solid` is the accent pill and is for the one action on the page that matters. `quiet` is the outlined secondary. If a screen has two solid Embers on it, one of them is wrong. |
| `href` | string | `` | any value | Given an href it renders an <a>. Without one it renders a <button type="button">. Do not fake a link with a click handler. Keyboard users and screen readers both notice. |
| `disabled` | boolean | `false` | `true` · `false` | Button form only. An anchor cannot be disabled, so the anchor form sets aria-disabled instead and you must stop the navigation yourself. |

## 5. Accessibility. Do not skip this

- Focus is a ring on the outside, not a recoloured border. WCAG 2.4.11 requires
  the focus indicator to be distinguishable from the unfocused state at 3:1, and
  swapping a border colour on a pill this size does not clear that. Do not remove
  the `outline`. Change its colour if it clashes.
- `type="button"` is set explicitly. A `<button>` inside a `<form>` defaults to
  `submit`, which is never what anyone wanted from a component like this.
- The anchor form cannot be disabled. HTML has no such thing. Passing `disabled`
  to the anchor sets `aria-disabled="true"` and dims it, but you must stop the
  navigation yourself. Better: do not render a disabled link.
- The children are the accessible name. "Get prompt" is a label. An icon on its
  own is not. If you use an icon alone, add `aria-label`.
- The light sweep is decorative and drawn in a pseudo-element, so it is invisible
  to assistive technology and cannot be selected or copied.

## 6. Cleanup and SSR

Nothing to clean up. There is no JavaScript animation, no timer, and no listener.
The motion is two CSS transitions.

It renders on the server without complaint. The `'use client'` directive at the
top of the React file is there because the component takes an `onClick`, not
because it needs the browser. If you are rendering it purely as a link, remove
that line.

## 6. Pausing and reduced motion

Under `prefers-reduced-motion: reduce` the light sweep is removed entirely rather
than shortened, and the press scale is dropped. A sweep that completes in a
millisecond is a flash, which is worse than no sweep at all.

The colour change on hover stays. It is state, not decoration, and people who
have asked for less motion still need to know what they are pointing at.

## 7. The three mistakes most likely to be made here

1. **Using `solid` for everything.** The accent is for actions, and on this
   library's own site it appears once per screen. Two solid pills side by side
   means neither is the primary. Use one `solid` and one `quiet`.

2. **Making a link out of a button with `onClick={() => router.push(...)}`.**
   Pass `href` instead. A real anchor can be middle-clicked, opened in a new tab,
   copied, and read out as a link. A click handler gives you none of that.

3. **Deleting the `outline` in `:focus-visible` because it looks untidy.** It is
   the only focus affordance the component has. Recolour it, offset it further,
   change its width, but leave something there.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
