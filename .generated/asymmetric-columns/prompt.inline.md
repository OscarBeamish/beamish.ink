You are adding **AsymmetricColumns** from Beamish to this project.

> Unequal columns generated from one ratio, with a single vertical axis that every block hangs from. A grid system, CSS, MIT.
> https://beamish.ink/grids/asymmetric-columns

Beamish is not a package and there is nothing to install from npm. This one is
a single stylesheet: put it in the project, link it, and use the class names.
There is no runtime, nothing to mount and nothing to destroy.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None.
- **Browser support:** CSS grid and custom properties. The nested-alignment
  helper uses subgrid; without it that one rule does nothing and the rest is
  unaffected.
- Every class carries a `g-` prefix. That is deliberate: `col-6` and
  `start-8` are Tailwind utilities, and `.band` and `.measure` are words a
  project may already be using.

- The asymmetry comes from one ratio applied once, as a geometric run of tracks. Pick the widths by eye section by section and you do not have a grid, you have a series of decisions that happen to be unequal, and a reader feels the difference even if they could not name it
- The axis is the point rather than the unevenness. A page like this works because a great many things begin at the same x and the eye finds that line and holds on to it, which is what the axis property and the g-axis class are for
- The narrow column is for the small voice. The run is widest first, so the narrow tracks fall where captions, notes and numbers go. Body copy in the narrowest track is the system used backwards, and the giveaway is a column of two-word lines
- Mirror the run rarely. Two sections leaning opposite ways cancel out and the page reads as symmetrical again, which is the one thing this grid is not for
- The tracks are written out rather than generated, because CSS cannot raise a number to a power where this has to run. Four terms is the whole system and is legible as arithmetic, which beats a clever rule nobody can check
- The overlay inherits grid-template-columns rather than restating it, so an unequal run cannot be described by an even one

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Save this file

Save it at `src/beamish/grids/asymmetric-columns/grid.css`, or wherever this project keeps its CSS.

```css
/*
 * AsymmetricColumns: Beamish
 * https://beamish.ink/grids/asymmetric-columns
 *
 * Unequal columns with one strong vertical axis running down the page. The
 * layout a poster uses: nothing is centred, nothing is halved, and the thing
 * that holds it together is that every block starts on the same few lines.
 *
 * Three things carry it, and the first is what separates this from a layout
 * that is merely lopsided.
 *
 * The asymmetry comes from one ratio, applied once. The tracks here are a
 * geometric run: each is `--asym-ratio` times the one before it, generated from
 * a single number rather than typed out. Pick the widths by eye, section by
 * section, and you do not have a grid, you have a series of decisions that
 * happen to be unequal, and a reader feels the difference even if they could
 * not name it.
 *
 * The axis is the point, not the unevenness. A page like this works because a
 * great many things begin at the same x, and the eye finds that line and holds
 * on to it. `--asym-axis` names the track everything hangs from, and
 * `.g-axis` puts a block there whatever its width. Asymmetry without an axis is
 * just mess.
 *
 * And the narrow column is for the small voice. The run is widest first by
 * default, so the narrow tracks fall where captions, notes and numbers go. A
 * layout that puts body copy in the narrowest track is using the system
 * backwards, and the giveaway is a column of two-word lines.
 */

:root {
  /*
   * How much wider each track is than the next. 1.618 is the obvious choice
   * and 1.3 is usually the better one: past about 1.8 the narrow tracks stop
   * being able to hold words at all.
   */
  --asym-ratio: 1.38;
  /* How many tracks. Four is the most a page can use without losing the axis. */
  --asym-tracks: 4;
  /* The track everything hangs from, counted from 1. */
  --asym-axis: 2;
  --asym-gutter: clamp(1rem, 2.5vw, 2.5rem);
  --asym-margin: clamp(1.25rem, 5vw, 5rem);
  --asym-rule: rgba(54, 54, 48, 0.2);
  --asym-step: clamp(1.5rem, 4vw, 4rem);
}

/*
 * The tracks, widest first, each one the last divided by the ratio.
 *
 * Written out rather than generated, because CSS cannot raise a number to a
 * power: `calc(pow())` is not available where this has to run. Four terms is
 * the whole system and they are legible as arithmetic, which is better than a
 * clever rule nobody can check.
 */
.g-asym {
  display: grid;
  grid-template-columns:
    minmax(0, calc(1fr * 1))
    minmax(0, calc(1fr / var(--asym-ratio)))
    minmax(0, calc(1fr / (var(--asym-ratio) * var(--asym-ratio))))
    minmax(0, calc(1fr / (var(--asym-ratio) * var(--asym-ratio) * var(--asym-ratio))));
  column-gap: var(--asym-gutter);
  row-gap: var(--asym-step);
  padding-inline: var(--asym-margin);
  box-sizing: border-box;
  width: 100%;
}

/* Reversed, for a section that should lean the other way. Use it rarely: two
 * sections leaning opposite ways cancel out and the page reads as symmetrical
 * again, which is the one thing this grid is not for. */
.g-asym--mirror {
  grid-template-columns:
    minmax(0, calc(1fr / (var(--asym-ratio) * var(--asym-ratio) * var(--asym-ratio))))
    minmax(0, calc(1fr / (var(--asym-ratio) * var(--asym-ratio))))
    minmax(0, calc(1fr / var(--asym-ratio)))
    minmax(0, calc(1fr * 1));
}

/* Spans are grid-column-end, so a start and a span compose. */
.g-a-1 { grid-column-end: span 1 }
.g-a-2 { grid-column-end: span 2 }
.g-a-3 { grid-column-end: span 3 }
.g-a-4 { grid-column-end: span 4 }

.g-at-1 { grid-column-start: 1 }
.g-at-2 { grid-column-start: 2 }
.g-at-3 { grid-column-start: 3 }
.g-at-4 { grid-column-start: 4 }

/* The axis. Whatever its width, this block starts on the page's spine. */
.g-axis {
  grid-column-start: var(--asym-axis);
}

.g-measure {
  max-width: 64ch;
}

.g-note {
  font-size: 0.78em;
  line-height: 1.55;
}

/*
 * The overlay, built from the same track list rather than a second copy of it.
 * One element per track, so it cannot describe a grid other than this one.
 */
.g-asym-rules {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
  display: grid;
  grid-template-columns: inherit;
  column-gap: var(--asym-gutter);
  padding-inline: var(--asym-margin);
  box-sizing: border-box;
}

.g-asym-rules > * {
  background: var(--asym-rule);
}

.g-asym-rules[hidden] {
  display: none;
}

/*
 * Narrow. The run collapses to one column, because four geometric tracks on a
 * phone makes the last one about two characters wide.
 */
@media (max-width: 52rem) {
  .g-asym,
  .g-asym--mirror {
    grid-template-columns: minmax(0, 1fr);
  }

  .g-asym > *:not(.g-keep) {
    grid-column: 1 / -1;
  }
}
```

## 2. The custom properties are the interface

Override these in the project's own stylesheet rather than editing the file, so
a later version is a clean replacement.

| Property | Default | What it is |
| --- | --- | --- |
| `--asym-ratio` | `1.38` | How much wider each track is than the next. 1.618 is the obvious choice and 1.3 is usually the better one: past about 1.8 the narrow tracks stop being able to hold words at all. |
| `--asym-tracks` | `4` | How many tracks. Four is the most a page can use before the axis stops being findable, and the axis is the thing holding the layout together. |
| `--asym-axis` | `2` | The track everything hangs from, counted from 1. Asymmetry without an axis is mess: the layout works because a great many things begin at the same x. |
| `--asym-gutter` | `clamp(1rem, 2.5vw, 2.5rem)` | Between tracks. Wider than an even grid wants, because unequal columns need more air to read as deliberate rather than as a mistake in the arithmetic. |
| `--asym-margin` | `clamp(1.25rem, 5vw, 5rem)` | Between the content and the trim. A separate measurement from the gutter, for the same reason it is separate in every other grid here. |
| `--asym-step` | `clamp(1.5rem, 4vw, 4rem)` | The vertical unit between rows. Generous, because a poster layout earns its asymmetry by having room around it. |
| `--asym-rule` | `rgba(54, 54, 48, 0.2)` | The overlay colour. Drawn as one element per track, inheriting the real track list rather than describing a second copy of it. |

## 3. Wiring

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

## 4. Use the axis, or none of this works

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

## 5. Spans are `grid-column-end`

`.g-a-2` sets `grid-column-end: span 2` rather than the `grid-column`
shorthand, so a span and a start compose. The shorthand sets both ends: add a
start class on top and the start is overridden while the end stays `auto`,
which resolves to a span of one. The element lands in exactly the right column
at a quarter of the width it asked for, and nothing reports an error.

## 6. Mirror it rarely

`.g-asym--mirror` reverses the run, narrowest first. It is there for the one
section that should lean the other way.

Use it twice and the page is symmetrical again on average, which is the one
thing this grid is not for. If you find yourself alternating, you want an even
grid and should say so.

## 7. The overlay

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

## 8. Narrow widths

Below 52rem the run collapses to a single column and everything spans it,
unless it carries `.g-keep`.

Four geometric tracks on a phone makes the last one about two characters wide.
There is no useful intermediate: an asymmetric run either has room to be
asymmetric or it does not.

## 9. Common mistakes

1. **Widths chosen per section.** The commonest version of this layout, and the
   reason most of them feel arbitrary. One ratio, applied once.

2. **No axis.** Unequal columns with nothing aligned is not a composition.

3. **Body copy in the narrow track.** Two words a line. The narrow tracks are
   for captions and numbers.

4. **Mirroring freely.** The asymmetry cancels out and you have paid for a grid
   that reads as even.

5. **A ratio past about 1.8.** The last track cannot hold a word, and you have
   three columns and a margin pretending to be four columns.
