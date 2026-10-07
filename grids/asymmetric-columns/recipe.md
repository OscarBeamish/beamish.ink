## What it is

AsymmetricColumns is a set of unequal columns with one strong vertical axis
running down the page. The layout a poster uses: nothing is centred, nothing is
halved, and the thing holding it together is that every block starts on the
same few lines.

It is CSS. There is no runtime, nothing to mount and nothing to destroy.

Three things carry it, and the first is what separates this from a layout that
is merely lopsided.

**The asymmetry comes from one ratio, applied once.** The tracks are a
geometric run: each is `--asym-ratio` times the one before it. Pick the widths
by eye, section by section, and you do not have a grid, you have a series of
decisions that happen to be unequal. A reader feels the difference even if they
could not name it.

**The axis is the point, not the unevenness.** A page like this works because a
great many things begin at the same x, and the eye finds that line and holds on
to it. `--asym-axis` names the track everything hangs from. Asymmetry without
an axis is just mess.

**The narrow column is for the small voice.** The run is widest first, so the
narrow tracks fall where captions, notes and numbers go. Body copy in the
narrowest track is the system used backwards, and the giveaway is a column of
two-word lines.

## Wiring

```html
<link rel="stylesheet" href="./beamish/grids/asymmetric-columns/grid.css" />

<section class="g-asym">
  <h1 class="g-a-2">A heading across the two widest</h1>
  <p class="g-axis g-a-2 g-measure">Body copy, hung from the axis.</p>
  <p class="g-at-4 g-a-1 g-note">A note, in the narrow track.</p>
</section>
```

`.g-asym` is the grid. `.g-a-N` sets a span, `.g-at-N` sets where it begins,
and `.g-axis` starts a block on the page's spine whatever its width.

**React, Vue, Astro.** Import the stylesheet once at the root and use the class
names. There is no component to render.

## Use the axis, or none of this works

The single most useful thing in the file is `.g-axis`. Put most of the page's
text on it and the layout reads as composed:

```html
<p class="g-axis g-a-2">…</p>
<h2 class="g-axis g-a-3">…</h2>
<figure class="g-axis g-a-2">…</figure>
```

Three blocks of different widths all starting at the same x is what the eye
reads as a system. Three blocks of different widths all starting at different
x is what it reads as a mistake.

## Spans are `grid-column-end`

`.g-a-2` sets `grid-column-end: span 2` rather than the `grid-column`
shorthand, so a span and a start compose. The shorthand sets both ends: add a
start class on top and the start is overridden while the end stays `auto`,
which resolves to a span of one. The element lands in exactly the right column
at a quarter of the width it asked for, and nothing reports an error.

## Mirror it rarely

`.g-asym--mirror` reverses the run, narrowest first. It is there for the one
section that should lean the other way.

Use it twice and the page is symmetrical again on average, which is the one
thing this grid is not for. If you find yourself alternating, you want an even
grid and should say so.

## The overlay

```html
<div class="g-asym-rules" hidden>
  <i></i><i></i><i></i><i></i>
</div>
```

One element per track. It sets `grid-template-columns: inherit`, so it takes
the real track list rather than a second copy of it: an unequal run cannot end
up being described by an even one.

Put it inside an element carrying `.g-asym`, or the `inherit` has nothing to
take. `.g-asym-rules[hidden]` is declared explicitly, because the `hidden`
attribute's `display: none` lives in the browser's own stylesheet and any
author `display` beats it.

## Narrow widths

Below 52rem the run collapses to a single column and everything spans it,
unless it carries `.g-keep`.

Four geometric tracks on a phone makes the last one about two characters wide.
There is no useful intermediate: an asymmetric run either has room to be
asymmetric or it does not.

## Common mistakes

1. **Widths chosen per section.** The commonest version of this layout, and the
   reason most of them feel arbitrary. One ratio, applied once.

2. **No axis.** Unequal columns with nothing aligned is not a composition.

3. **Body copy in the narrow track.** Two words a line. The narrow tracks are
   for captions and numbers.

4. **Mirroring freely.** The asymmetry cancels out and you have paid for a grid
   that reads as even.

5. **A ratio past about 1.8.** The last track cannot hold a word, and you have
   three columns and a margin pretending to be four columns.
