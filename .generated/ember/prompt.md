You are adding **Ember** from Beamish to this project.

> The action pill: mono, uppercase, with a slow band of light crossing it. Navigation · component · MIT.
> https://beamish.ink/components/ember

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses — that is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `react@>=18`
- Uses color-mix(); Chrome 111+, Safari 16.2+, Firefox 113+. Older browsers get the base colour with no hover shift, which is a graceful loss
- No JavaScript animation at all — the motion is two CSS transitions
- React 18+ or Vue 3. This one is a component, not an imperative effect.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement — the
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/components/ember/react.tsx` | https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/components/ember/react.tsx |
| `src/beamish/components/ember/styles.css` | https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/components/ember/styles.css |

If you cannot fetch URLs, say so rather than writing the file from memory — there
is a version of this prompt with the source inlined, and guessing at a shader
produces something that compiles and looks wrong.

## 2. What it is

Ember is the action pill: mono, uppercase, 100px radius, with a single slow band
of light crossing its face on hover. It is the one piece of the library that is
deliberately ordinary — a button that does not surprise anyone — because the
surprising things are meant to be the effects, and the button is meant to be the
thing you press to get one.

Two tones. `solid` is the accent pill and belongs to the single most important
action on a screen. `quiet` is the outlined secondary. If a page has two solid
Embers on it, one of them is wrong.

It renders a `<button>` by default and an `<a>` when given an `href`, because a
thing that navigates should be a link and a thing that acts should be a button.
There is no `as` prop and no polymorphic generic: the distinction is small enough
to make by hand and important enough not to get wrong.

The hover state *darkens*. The accent sits near the top of its range already, and
lifting it drops white lettering below 4.5:1 — the direction most libraries go is
the one that fails.

## 3. Wire it in

**React.**

```tsx
import { Ember } from '@/beamish/components/ember/react'

export function Cta() {
  return (
    <div className="flex gap-4">
      <Ember onClick={() => copy()}>Get prompt</Ember>
      <Ember tone="quiet" href="https://github.com/oscarbeamish/beamish">
        View source
      </Ember>
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { Ember } from '@/beamish/components/ember/vue'
</script>

<template>
  <Ember @click="copy">Get prompt</Ember>
  <Ember tone="quiet" href="https://github.com/oscarbeamish/beamish">View source</Ember>
</template>
```

**The stylesheet.** Both files do `import './styles.css'`, which works in Vite,
Next.js, Astro, Nuxt and anything else with a normal CSS pipeline. If your setup
cannot import CSS from a component, paste the contents of `styles.css` into your
global stylesheet instead and delete the import — nothing else changes.

**Tokens.** Every custom property in `styles.css` has a fallback, so it looks
right in a project that has never heard of Beamish. If you already define
`--accent`, `--label-1`, `--control-line`, `--font-mono` or `--ease-66`, it picks
those up and inherits your theme instead. Set `--accent` and it becomes your
button.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `tone` | enum | `solid` | `solid` · `quiet` | `solid` is the accent pill and is for the one action on the page that matters. `quiet` is the outlined secondary. If a screen has two solid Embers on it, one of them is wrong. |
| `href` | string | `` | — | Given an href it renders an <a>; without one it renders a <button type="button">. Do not fake a link with a click handler — keyboard users and screen readers both notice. |
| `disabled` | boolean | `false` | `true` · `false` | Button form only. An anchor cannot be disabled, so the anchor form sets aria-disabled instead and you must stop the navigation yourself. |

## 5. Accessibility — do not skip this

- **Focus is a ring on the outside**, not a recoloured border. WCAG 2.4.11 wants
  the focus indicator distinguishable from the unfocused state at 3:1, and
  swapping a border colour on a pill this size does not clear that. Do not remove
  the `outline` — if it clashes with your design, change its colour.
- **`type="button"` is set explicitly.** A `<button>` inside a `<form>` defaults
  to `submit`, which is never what anyone wanted from a component like this.
- **The anchor form cannot be disabled.** HTML has no such thing. Passing
  `disabled` to the anchor sets `aria-disabled="true"` and dims it, but you must
  stop the navigation yourself — or, better, do not render a disabled link.
- **Give it a real label.** The children are the accessible name. "Get prompt"
  is a label; an icon on its own is not. If you use an icon alone, add
  `aria-label`.
- The light sweep is decorative and drawn in a pseudo-element, so it is invisible
  to assistive technology and cannot be selected or copied.

## 6. Cleanup and SSR

Nothing to clean up — there is no JavaScript animation, no timer and no
listener. The motion is two CSS transitions.

It renders on the server without complaint. The `'use client'` directive at the
top of the React file is there because the component takes an `onClick`, not
because it needs the browser; if you are rendering it purely as a link you can
remove that line.

## 6. Pausing and reduced motion

Under `prefers-reduced-motion: reduce` the light sweep is removed entirely rather
than shortened, and the press scale is dropped. A sweep that completes in a
millisecond is a flash, which is worse than no sweep at all.

The colour change on hover stays, because it is state, not decoration — people
who have asked for less motion still need to know what they are pointing at.

## 7. The three mistakes most likely to be made here

1. **Using `solid` for everything.** The accent is for actions, and on this
   library's own site it appears exactly once per screen. Two solid pills side by
   side means neither is the primary; use one `solid` and one `quiet`.

2. **Making a link out of a button with `onClick={() => router.push(...)}`.**
   Pass `href` instead. A real anchor can be middle-clicked, opened in a new tab,
   copied, and read out as a link — none of which a click handler gives you.

3. **Deleting the `outline` in `:focus-visible` because it looks untidy.** It is
   the only focus affordance the component has. Recolour it, offset it further,
   change its width — but leave something there.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/oscarbeamish/beamish/{{PIN}}/components/ember/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
