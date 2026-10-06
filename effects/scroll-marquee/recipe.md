## What it is

A strip of content running sideways for ever, which leans when the page is
scrolled and reverses when the scroll does.

No canvas and no WebGL. The strip is your own markup, moved into a track and
transformed, so the links keep working and the images that have loaded stay
loaded.

Three things separate it from a 1996 `<marquee>`:

**It never stops.** The content is duplicated and the transform wraps at exactly
one copy's width, so there is no jump to find and no gap at the end.

**It leans with the scroll.** The skew comes from scroll velocity, which is what
makes the strip feel like it has mass: it is being dragged by the page rather
than playing beside it.

**It reverses.** Scrolling up pushes it the other way, because the same scroll
that skews it is added to its travel.

## It is pure in `t`, and that takes care

A marquee written the obvious way adds a few pixels to an offset every frame.
That is the one thing an effect in this library may not do: it cannot be
recorded, it cannot be seeked, and it drifts whenever a frame is dropped, so two
tabs showing the same strip slowly disagree.

```ts
const travelled = (t / period) * direction + scroll.progress * drag
const offset = -(((travelled % 1) + 1) % 1) * width
```

Position from the clock and the scroll position and nothing else. Ask for the
frame at any time and you get the same frame.

## Using it

```html
<div id="strip" class="marquee">
  <span>Available for work</span>
  <span>Available for work</span>
  <span>Available for work</span>
</div>
```

```ts
import { createScrollMarquee } from './beamish/effects/scroll-marquee/core'

const marquee = createScrollMarquee(document.querySelector('#strip'))
marquee.start()
```

Whatever is inside the element becomes the strip, so put it on a wrapper around
the row rather than on the section the row is in.

Give the items `flex: 0 0 auto` and `white-space: nowrap`, or a long phrase will
wrap inside its own box and the measured width will be wrong.

**React** takes the strip as children:

```tsx
<ScrollMarquee period={24} skew={7}>
  <span>Available for work</span>
  <span>Available for work</span>
</ScrollMarquee>
```

**Vue** is the same with the default slot. **Astro** consumes either as an
island, or calls the core from a plain `<script>`.

## What it does to your markup

On mount the children are **moved** into a track and the track is cloned once.
On `destroy()` the originals are put back exactly where they were found.

The clone is `aria-hidden` and every focusable inside it is given `tabindex=-1`.
A duplicate of the content is a duplicate to a screen reader too, and hearing
the same six links twice is worse than not seeing the loop at all.

That is also the reason not to put anything in here that matters on its own. A
marquee is for a phrase, a set of client names, a row of logos. It is not for
navigation.

## Tuning it

`period` is a pace rather than a speed: it is the time to travel one copy of the
content, so longer content at the same period runs faster. That is usually what
you want, since it keeps a short strip and a long one feeling alike.

`skew` is the character. Past about 15 degrees it reads as a glitch rather than
as momentum.

`drag` is how much the page pushes it, in copies per full scroll. At 0 it runs
at a constant pace and ignores the page entirely, which is a perfectly good
ticker and a different effect.

`gap` is applied inside the copy rather than between the copies. That is
deliberate: a gap between them would make the loop a fraction longer than the
thing it is wrapping, and the strip would stutter once a cycle.

## Reduced motion

Handled in the runtime. Under `prefers-reduced-motion: reduce` the loop never
starts and one frame is drawn, which leaves the strip still and readable.

Worth saying plainly: a marquee is exactly the kind of thing that setting exists
for. Nothing here fights it.

## Pausing

The handle has `stop()` and `start()`. WCAG 2.2.2 is Level A and it names moving
text specifically, so if this is on a page it needs a visible control, which the
demo panel on the site wires up.

## Performance

One transform write per frame on one element. `transform` is a composited
property, so there is no layout and no paint, and the content width is measured
on mount and on resize rather than per frame.

## Cleanup and SSR

`destroy()` puts your markup back, removes the track, cancels the RAF and
disconnects the observers. Call it.

Nothing runs on the server. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'`, which is already on
the React adapter.

## Common mistakes

1. **Items that can wrap.** Without `white-space: nowrap` and `flex: 0 0 auto` a
   phrase breaks inside its own box, the measured width is wrong, and the strip
   jumps once a cycle.

2. **Putting navigation in it.** The clone is hidden from assistive technology
   and taken out of the tab order, which is right, but it means half your links
   are decorative. Use it for a phrase, not a menu.

3. **A `gap` on the flex container.** Use the option. A CSS gap between the two
   copies lands outside the width the wrap measures.

4. **Mounting it on the section rather than the row.** Everything inside the
   element becomes the strip, headings included.
