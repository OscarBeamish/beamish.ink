You are adding **GlassNav** from Beamish to this project.

> A bar of glass across the top of a page, clear over a hero and frosted once it has scrolled. Navigation · component · MIT.
> https://beamish.ink/components/glass-nav

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `react@>=18`
- The blur is backdrop-filter, which every current browser supports. The refraction is an SVG filter inside backdrop-filter, which only Chromium applies: Safari ignores it and Firefox parses the value, passes an @supports test and then renders nothing, so there is no feature query that tells the truth
- What makes a panel read as glass rather than as tinted film is the hairline specular along its top edge, not the blur. Take that one line away and the rest is a grey rectangle
- The lens is a signed distance field for the rounded rectangle, computed per pixel into a canvas and handed to feImage. The displacement is the field's gradient weighted towards the edge, which is a bevel rather than a uniform stretch
- prefers-reduced-transparency turns the glass opaque and takes the specular with it, because a highlight on something that is not transparent is a lie about the material
- forced-colors throws out every background and shadow, so the bar falls back to a border, which is the one thing the mode keeps
- A nav landmark, a list, and links. The bar is markup rather than a widget, so the keyboard behaviour is the browser's
- The current page is marked with aria-current='page', which is also what the underline styling keys off, so what is announced and what is drawn cannot drift
- Contrast is the real risk. Glass over a photograph can put 2:1 text on the page without anybody noticing, which is why the tint comes up as the page scrolls under it rather than staying clear
- React 18+ or Vue 3. This one is a component, not an imperative effect.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/components/glass-nav/react.tsx` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/glass-nav/react.tsx |
| `src/beamish/components/glass-nav/glass.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/glass-nav/glass.ts |
| `src/beamish/components/glass-nav/styles.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/glass-nav/styles.css |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

A bar of glass across the top of a page. Nearly clear over a hero, settling into
frosted once the page has scrolled under it.

That settle is the whole design. A bar legible over a photograph and a bar
legible over body copy are not the same bar, and a fixed one has to be the
second, which means it is milky over the thing you most wanted people to see.
Tying the tint to the scroll lets it be clear exactly while there is something
behind it worth looking at.

Underneath it is a nav landmark, a list and links. The current page is marked
with `aria-current="page"`, which is also what the underline keys off, so what a
screen reader announces and what you can see cannot drift apart.

## 3. Wire it in

```tsx
import { Crossbar } from '@/beamish/components/glass-nav/react'

export function Header() {
  return (
    <Crossbar
      brand="Beamish.ink"
      items={[
        { label: 'Work', href: '/work', current: true },
        { label: 'Studio', href: '/studio' },
        { label: 'Contact', href: '/contact' }
      ]}
    />
  )
}
```

Put it inside a `position: sticky; top: 0` wrapper, or give it `position:
fixed` yourself. The component does not take a position, because where a header
sits is a page layout decision and not a component one.

**Vue.**

```vue
<script setup lang="ts">
import { Crossbar } from '@/beamish/components/glass-nav/vue'

const items = [
  { label: 'Work', href: '/work', current: true },
  { label: 'Studio', href: '/studio' },
  { label: 'Contact', href: '/contact' }
]
</script>

<template>
  <Crossbar brand="Beamish.ink" :items="items" />
</template>
```

**Astro.** `<Crossbar client:load items={items} />`. It needs to be hydrated,
because the settle is JavaScript.

Anything you pass as children lands at the end of the bar, after the links,
which is where an action belongs.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `settleOver` | number | `120` | 0 to 600 | Pixels of scroll over which the glass goes from clear to frosted. Roughly the height of whatever is behind it at the top of the page. |
| `blur` | number | `14` | 0 to 40 | Blur at full settle. Past about 20 it stops reading as glass and starts reading as fog, and it is the setting most likely to cost a user on an old machine their frame rate. |
| `tint` | number | `0.55` | 0 to 1 | How milky it goes once settled. This is the contrast control: glass over a photograph can put 2:1 text on a page without anybody noticing, and this is what stops it. |
| `refract` | boolean | `true` | `true` · `false` | Bend the backdrop as well as blurring it. Chromium only. Everywhere else you get the blur and the edge, which is most of the effect, and nothing looks broken. |
| `refraction` | number | `18` | 0 to 60 | How far the rim bends what is behind it, in pixels. Past about 30 the bar stops looking like glass and starts looking like a heat haze. |

## 5. What actually makes it look like glass

Not the blur. The blur is what everybody writes and it gives you tinted film.

What reads as glass is the edge, and specifically a hairline of specular along
the top where a real sheet catches the light: `inset 0 1.5px 0 rgba(255, 255,
255, .9)`. Under it sits a rim that separates the bar from whatever is behind,
and under that a soft shadow that puts it above the page rather than in it.
Take the specular line away and the rest of this is a grey rectangle with
rounded corners.

The second thing, and the one most people get wrong, is what is behind it. Glass
over a flat background has nothing to refract and nothing to blur, so it reads
as a slightly dirty panel. This wants a photograph, a gradient, or one of the
backdrops in this library under it. On plain paper, do not use it.

## 6. Blur, and bending

There are two different effects here and only one of them is portable.

**The blur** is `backdrop-filter`, and every current browser does it.

**The bend** is an SVG displacement filter applied to the backdrop, and only
Chromium applies it. Safari ignores SVG filters in `backdrop-filter` entirely.
Firefox parses the value, passes an `@supports` test, and then renders nothing,
which means there is no feature query that tells you the truth. You cannot
detect your way out of this one.

So `refract` is on by default and the component is built to look finished
without it. In Safari and Firefox you get the blur, the tint, the specular and
the rim, which is most of the effect and nothing that looks broken. In Chromium
the rim also bends what is behind it.

The lens itself is a signed distance field for the rounded rectangle, computed
per pixel into a canvas and handed to `feImage`. The displacement is that
field's gradient, weighted towards the edge, which is what makes it a bevel
rather than a uniform stretch of the backdrop.

## 7. Contrast is the thing that will catch you out

Glass over a photograph can put 2:1 text on a page and nobody on the team will
notice, because you all know what it says. WCAG wants 4.5:1 for body text and
3:1 for large.

`tint` is the control that fixes it, and it is why the default settles to 0.55
rather than staying clear. If you are putting this over something busy, check it
against the worst part of the image rather than the average, and raise `tint`
until it passes there.

`prefers-reduced-transparency` is a real system setting and this is exactly the
component it exists for. The bar goes opaque, and the specular goes with it,
because a highlight on something that is not transparent is a lie about the
material.

`forced-colors` throws out every background and shadow, so the bar would lose
its edges entirely. It falls back to a border, which is the one thing the mode
keeps.

## 8. Tuning it

`settleOver` is roughly the height of whatever sits behind the bar at the top of
the page. Set it to the hero's height and the glass arrives exactly as the hero
leaves.

`blur` past about 20 stops reading as glass and starts reading as fog, and it is
also the setting most likely to cost somebody on an old machine their frame
rate. `backdrop-filter` is not free: it forces the backdrop into its own layer.

`refraction` past about 30 stops looking like glass and starts looking like a
heat haze.

## 9. Putting it on a dark page

The pane is warm white, because the house ground is paper. Left at that over a
near black page it is not glass, it is a pale bar: the illusion rests on the
panel reading as the same material as the air in front of the page, and a tint
the page uses nowhere else is what gives it away.

Set `--crossbar-pane` to the page's own ground, as an unwrapped rgb triple so
the component can still compute the alpha from the settle, and give it type to
match:

```css
.my-dark-page .beamish-glass-nav {
  --crossbar-pane: 11, 13, 16;
  --crossbar-ink: #e8ebf0;
  --crossbar-quiet: rgba(232, 235, 240, 0.72);
}
```

The specular along the top edge stays white on both grounds. That one is not a
tint, it is a highlight: glass catches light from the room whatever colour the
wall behind it is, and taking it out is what makes a dark panel read as a hole
cut in the page.

## 10. Performance

Scroll is read on a rAF rather than on the event, and the settle value is
rounded to two decimal places before it is written to a custom property, so a
style recalculation only happens when something actually changed rather than
sixty times a second.

The lens map is drawn once per resize at quarter scale, not per frame. It is a
smooth field and `feImage` resamples it, so the extra pixels buy nothing.

One bar per page is the intended dose.

## 11. Cleanup and SSR

The React component removes its scroll listener and its filter on unmount, and
the Vue one does the same in `onBeforeUnmount`. Both touch `window` only inside
the mount effect, so they render on a server without complaining.

## 12. The three mistakes most likely to be made here

1. **Putting it on a flat background.** There is nothing to blur and nothing to
   bend, so it reads as a slightly dirty panel. This is the single most common
   reason glass falls flat and it is not a problem with the glass.

2. **Expecting the bend in Safari or Firefox.** It is not there, there is no
   feature query that says so, and the build will look finished in Chrome while
   shipping a plain blur everywhere else. That is by design here, but only
   because the plain blur was built to stand on its own.

3. **Leaving `tint` at zero because it looks better.** It does look better, and
   then somebody reads your nav against a white sky.

4. **Using it for a nav that has to hold a lot.** This is a bar of links. A menu
   with sections, descriptions and a search belongs in FullscreenMenu, which
   was built for exactly that and has the keyboard handling to match.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/glass-nav/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
