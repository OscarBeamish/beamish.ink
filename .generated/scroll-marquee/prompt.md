You are adding **ScrollMarquee** from Beamish to this project.

> A strip of content running sideways for ever, leaning with the scroll and reversing when it does. Type · effect · MIT.
> https://beamish.ink/effects/scroll-marquee

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- No canvas and no WebGL. The strip is the author's own markup, moved into a track and transformed, so links keep working and images that have loaded stay loaded
- Pure in t, which is the part that takes care. A marquee written the obvious way accumulates an offset every frame, and an effect that integrates against its own last frame cannot be recorded, cannot be seeked and drifts on a dropped frame. The position here is a function of the clock and the scroll position and nothing else
- The content is duplicated once so the wrap is seamless, and the clone is aria-hidden with every focusable inside it given tabindex -1. A duplicate of the content is a duplicate to a screen reader too
- The lean is scroll velocity, normalised and clipped. A trackpad reports an order of magnitude more than a wheel, and without a ceiling the strip lies flat on its side the first time somebody flicks the page
- One transform on one element per frame, which is a composited property, so this does no layout work at all
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/scroll-marquee/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/scroll-marquee/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `period` | number | `24` | 4 to 120 s | Seconds for the strip to travel exactly one copy of its content, which is also the loop. Longer content at the same period runs faster, because the distance is longer: this is a pace rather than a speed. |
| `direction` | number | `1` | -1 to 1 | Which way it runs when the page is still. 1 is leftwards, which is the direction text is read away from and the one that feels like it is going somewhere. |
| `drag` | number | `0.35` | 0 to 2 | How far the scroll drags it, in copies of the content per full scroll of the element through the viewport. This is what makes it reverse when you scroll back up. At 0 it runs at a constant pace and ignores the page. |
| `skew` | number | `7` | 0 to 25 deg | Degrees of lean at full scroll speed. This is the whole character of the effect: it is what makes the strip feel like it has mass and is being dragged rather than playing beside the page. Past about 15 it reads as a glitch. |
| `stretch` | number | `0.12` | 0 to 0.5 | How much it stretches along its travel at full scroll speed. Small: it is the squash-and-stretch of the thing, and at anything over about 0.2 the type distorts enough to notice as distortion. |
| `reference` | number | `1.2` | 0.2 to 6 | The scroll speed that counts as full, in screens per second. 1.2 is about a brisk flick, so an ordinary scroll leans the strip a few degrees and a hard one leans it fully. Too low and a single wheel click pins it at maximum, which loses the difference between a nudge and a flick. |
| `gap` | number | `48` | 0 to 240 px | Space between the end of one copy of the content and the start of the next. It is applied inside the copy, so it is part of the width the wrap is measured against: a gap added between the copies instead would make the loop a fraction longer than the thing it is wrapping, and the strip would stutter once per cycle. |

## 5. Cleanup and SSR

`destroy()` puts your markup back, removes the track, cancels the RAF and
disconnects the observers. Call it.

Nothing runs on the server. Put the call inside `useEffect`, `onMounted`, or a
`client:*` island. Next.js App Router needs `'use client'`, which is already on
the React adapter.

## 6. Pausing and reduced motion

The handle has `stop()` and `start()`. WCAG 2.2.2 is Level A and it names moving
text specifically, so if this is on a page it needs a visible control, which the
demo panel on the site wires up.

Handled in the runtime. Under `prefers-reduced-motion: reduce` the loop never
starts and one frame is drawn, which leaves the strip still and readable.

Worth saying plainly: a marquee is exactly the kind of thing that setting exists
for. Nothing here fights it.

## 7. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/scroll-marquee/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/scroll-marquee/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
