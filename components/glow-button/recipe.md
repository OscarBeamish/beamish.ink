## What it is

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

## Wiring

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

## Accessibility

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

## Cleanup and SSR

Nothing to clean up. There is no JavaScript animation, no timer, and no listener.
The motion is two CSS transitions.

It renders on the server without complaint. The `'use client'` directive at the
top of the React file is there because the component takes an `onClick`, not
because it needs the browser. If you are rendering it purely as a link, remove
that line.

## Reduced motion

Under `prefers-reduced-motion: reduce` the light sweep is removed entirely rather
than shortened, and the press scale is dropped. A sweep that completes in a
millisecond is a flash, which is worse than no sweep at all.

The colour change on hover stays. It is state, not decoration, and people who
have asked for less motion still need to know what they are pointing at.

## Common mistakes

1. **Using `solid` for everything.** The accent is for actions, and on this
   library's own site it appears once per screen. Two solid pills side by side
   means neither is the primary. Use one `solid` and one `quiet`.

2. **Making a link out of a button with `onClick={() => router.push(...)}`.**
   Pass `href` instead. A real anchor can be middle-clicked, opened in a new tab,
   copied, and read out as a link. A click handler gives you none of that.

3. **Deleting the `outline` in `:focus-visible` because it looks untidy.** It is
   the only focus affordance the component has. Recolour it, offset it further,
   change its width, but leave something there.
