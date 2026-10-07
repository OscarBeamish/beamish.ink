You are adding **TwelveColumn** from Beamish to this project.

> A twelve column editorial grid of full-bleed bands, with an overlay drawn from the same properties as the layout. A grid system, CSS, MIT.
> https://beamish.ink/grids/twelve-column

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

- The margin is not a gutter. They are different measurements doing different jobs, and systems that make the outer margin one more gutter end up with body copy sitting a few pixels off the trim on a phone, because a gutter that is correct between columns is far too tight against an edge
- A band is full bleed and its grid is not. The band spans the whole window so it can carry a ground colour or a photograph to the edges, and the tracks live inside it, inset by the margin. Putting the margin on the band instead means no section can ever bleed
- The overlay reads the same custom properties the layout does, so it cannot describe a grid other than the one it is sitting on. An overlay that is its own repeating gradient is correct on the day it is made and silently wrong after the first change to a gutter
- Spans are grid-column-end rather than the grid-column shorthand. The shorthand sets both ends, so a start class overrides the start while the end stays auto and resolves to a span of one: the element lands in exactly the right column at a twelfth of the width it asked for, with no error anywhere
- grid-rules[hidden] is declared explicitly, because the hidden attribute's display:none lives in the browser's own stylesheet and any author display beats it. Without it the overlay ships switched on with its own button insisting it is off
- Tracks are minmax(0, 1fr) rather than 1fr. A 1fr track refuses to go below the intrinsic width of its content, so one long word or one unconstrained image makes the whole grid wider than the window
- Measure is not span. Type does not become more readable as its column gets wider: past about seventy-five characters the eye loses the start of the next line, so body copy takes a measure as well as a span and the two are different instructions
- Below 48rem the count drops to four and everything spans the full set unless it carries keep-span. Twelve columns on a phone is a list of slivers, and the alternative to collapsing is re-stating every span at every breakpoint

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Save this file

Save it at `src/beamish/grids/twelve-column/grid.css`, or wherever this project keeps its CSS.

```css
/*
 * TwelveColumn: Beamish
 * https://beamish.ink/grids/twelve-column
 *
 * A twelve column editorial grid, for pages built out of full-bleed bands with
 * their content placed on a shared set of tracks.
 *
 * Four things carry it, and the last two are what every other version of this
 * gets wrong.
 *
 * The margin is not a gutter. They are different measurements doing different
 * jobs: the gutter is the space between two columns of content, and the margin
 * is the space between the content and the trimmed edge of the page. Systems
 * that make the outer margin one more gutter end up with text sitting a
 * sixteenth of an inch off the edge on a phone, because a gutter that works
 * between columns is far too tight against a trim.
 *
 * A band is full bleed and its grid is not. The band spans the whole window so
 * it can carry a ground colour or a photograph to the edges; the tracks live
 * inside it, inset by the margin. Putting the margin on the band instead means
 * no section can ever bleed, which is the first thing anyone wants.
 *
 * The rules are drawn from the same custom properties as the layout. A grid
 * overlay that is its own repeating gradient, or worse an exported image, is
 * correct on the day it is made and wrong after the first change to a gutter.
 * Here `.g-rules` reads `--grid-columns`, `--grid-gutter` and `--grid-margin`
 * and cannot describe a grid other than the one it is sitting on.
 *
 * Every class carries a `g-` prefix, which looks fussy until you paste this
 * into a project that already has a `.band`, or into a Tailwind one, where
 * `start-8` and `col-6` are utilities that already mean something. A grid is
 * pasted into code nobody here has seen, so it may not claim common words.
 *
 * And the column count is a custom property, so narrow widths redefine it
 * rather than re-stating every span. Twelve columns on a phone is not a grid,
 * it is a list of slivers: below the breakpoint everything spans the full set
 * unless it opts out, so a span of 8 does not silently overflow a grid of 4.
 */

:root {
  /*
   * Twelve because it divides by two, three, four and six, which is every
   * division an editorial page actually asks for. Ten looks tidier and cannot
   * do thirds.
   */
  --grid-columns: 12;
  /* Between columns. Tight: this is the space that holds two columns apart. */
  --grid-gutter: clamp(0.75rem, 1.4vw, 1.5rem);
  /* Between content and trim. Generous, and nothing to do with the gutter. */
  --grid-margin: clamp(1.25rem, 5vw, 6rem);
  /* The widest the tracks ever get, however wide the window is. */
  --grid-measure: 110rem;
  --grid-rule: rgba(54, 54, 48, 0.2);
  /* Vertical rhythm. One unit, and everything spaces in multiples of it. */
  --grid-step: clamp(1rem, 2vw, 2rem);
}

/* A band is full bleed, so it can carry a ground to the edges of the page. */
.g-band {
  position: relative;
  width: 100%;
  padding-block: calc(var(--grid-step) * 3);
}

/*
 * The tracks. Inset by the margin and capped by the measure, centred in
 * whatever is left. `minmax(0, 1fr)` rather than `1fr`, because a `1fr` track
 * refuses to go below the intrinsic width of its content: one long word or one
 * unconstrained image and the whole grid is wider than the window.
 */
.g-band__grid {
  display: grid;
  grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
  column-gap: var(--grid-gutter);
  row-gap: calc(var(--grid-step) * 2);
  max-width: var(--grid-measure);
  margin-inline: auto;
  padding-inline: var(--grid-margin);
  box-sizing: border-box;
}

/*
 * Nested alignment by subgrid, so a caption under a picture lines up with the
 * column above it. The alternative is re-declaring twelve tracks inside a
 * six column area, where every nested track is half the width of the ones it
 * is supposed to agree with, and nothing lines up with anything.
 */
.g-band__sub {
  display: grid;
  grid-template-columns: subgrid;
  column-gap: var(--grid-gutter);
}

/*
 * Spans, as `grid-column-end` rather than the `grid-column` shorthand.
 *
 * The shorthand sets the start as well: `grid-column: span 6` means a start of
 * `span 6` and an end of `auto`. Add a start class on top and the start is
 * overridden while the end stays `auto`, which resolves to a span of one. The
 * element lands in the right column and is a twelfth of the width it asked for,
 * and nothing anywhere reports an error. Setting only the end leaves the start
 * free for auto-placement or for a start class, and the two compose.
 */
.g-col-1 { grid-column-end: span 1 }
.g-col-2 { grid-column-end: span 2 }
.g-col-3 { grid-column-end: span 3 }
.g-col-4 { grid-column-end: span 4 }
.g-col-5 { grid-column-end: span 5 }
.g-col-6 { grid-column-end: span 6 }
.g-col-7 { grid-column-end: span 7 }
.g-col-8 { grid-column-end: span 8 }
.g-col-9 { grid-column-end: span 9 }
.g-col-10 { grid-column-end: span 10 }
.g-col-11 { grid-column-end: span 11 }
.g-col-12 { grid-column-end: span 12 }

/*
 * Starts, for the asymmetry that makes a grid worth having. A page where
 * everything begins at column 1 has a grid and no composition.
 */
.g-start-2 { grid-column-start: 2 }
.g-start-3 { grid-column-start: 3 }
.g-start-4 { grid-column-start: 4 }
.g-start-5 { grid-column-start: 5 }
.g-start-6 { grid-column-start: 6 }
.g-start-7 { grid-column-start: 7 }
.g-start-8 { grid-column-start: 8 }
.g-start-9 { grid-column-start: 9 }
.g-start-10 { grid-column-start: 10 }

/*
 * Measure. Type does not become more readable as its column gets wider, it
 * becomes less: past about 75 characters the eye loses the start of the next
 * line. A span of 7 columns on a wide screen is well past that, so body copy
 * takes a measure as well as a span.
 */
.g-measure {
  max-width: 68ch;
}

/*
 * The overlay, drawn from the same properties as the grid.
 *
 * It is a grid of the same tracks holding one element per column, rather than a
 * repeating gradient: a gradient has to be told the gutter as a percentage and
 * is then wrong at every width where the gutter is a clamp rather than a ratio.
 * This cannot be wrong, because it is the grid.
 */
.g-rules {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
  display: grid;
  grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
  column-gap: var(--grid-gutter);
  max-width: var(--grid-measure);
  margin-inline: auto;
  padding-inline: var(--grid-margin);
  box-sizing: border-box;
}

.g-rules > * {
  background: var(--grid-rule);
}

/*
 * `hidden` has to be said again here, because the attribute's `display: none`
 * lives in the browser's own stylesheet and any author `display` beats it. A
 * `.g-rules` element carrying `hidden` is otherwise still a grid, and the
 * overlay ships switched on with its own button insisting it is off.
 */
.g-rules[hidden] {
  display: none;
}

/* Narrow. Twelve slivers is not a grid, so the tracks are redefined. */
@media (max-width: 48rem) {
  :root {
    --grid-columns: 4;
  }

  /*
   * Everything spans the full set unless it says otherwise. Without this a
   * span of 8 on a grid of 4 overflows, silently, and the page scrolls
   * sideways on a phone.
   */
  .g-band__grid > *:not(.g-keep) {
    grid-column: 1 / -1;
  }
}
```

## 2. The custom properties are the interface

Override these in the project's own stylesheet rather than editing the file, so
a later version is a clean replacement.

| Property | Default | What it is |
| --- | --- | --- |
| `--grid-columns` | `12` | The track count. Twelve because it divides by two, three, four and six, which is every division an editorial page actually asks for. Ten looks tidier on paper and cannot do thirds, which you discover on the first spread that wants three of anything. |
| `--grid-gutter` | `clamp(0.75rem, 1.4vw, 1.5rem)` | The space between two columns of content. Tight, because its only job is to stop two columns of type touching. This is not the margin and should not be the same number. |
| `--grid-margin` | `clamp(1.25rem, 5vw, 6rem)` | The space between the content and the trimmed edge of the page. Several times the gutter, because a gap that reads as correct between two columns reads as a mistake against the edge of the sheet. |
| `--grid-measure` | `110rem` | The widest the tracks ever get, however wide the window is. Without it a twelve column grid on a large display gives every column a line length nobody can read. |
| `--grid-step` | `clamp(1rem, 2vw, 2rem)` | The vertical unit. Everything spaces in multiples of it, which is what stops a page accumulating seven slightly different gaps between sections. |
| `--grid-rule` | `rgba(54, 54, 48, 0.2)` | The overlay colour. Faint enough to read the page through, strong enough to see where a column starts. |

## 3. Wiring

Link the stylesheet and write the markup. That is the whole installation.

```html
<link rel="stylesheet" href="./beamish/grids/twelve-column/grid.css" />

<section class="g-band">
  <div class="g-band__grid">
    <h1 class="g-col-10">A heading across ten</h1>
    <p class="g-col-5 g-start-7 g-measure">A column of text in the right half.</p>
  </div>
</section>
```

`.g-band` is the full-bleed section. `.g-band__grid` is the tracks. `.g-col-N`
sets a span, `.g-start-N` sets where it begins, and the two compose.

Every class carries a `g-` prefix, which looks fussy until you paste this into
a project that already has a `.band`, or into a Tailwind one, where `start-8`
and `col-6` are utilities that already mean something.

**React, Vue, Astro.** Nothing to do. It is a stylesheet: import it once at the
root and use the class names. There is no component to render, which is the
point of shipping a grid rather than a layout component.

## 4. Spans are `grid-column-end`, and that matters

`.g-col-6` sets `grid-column-end: span 6` rather than the `grid-column`
shorthand, and this is the one piece of the file you should not simplify.

The shorthand sets both ends: `grid-column: span 6` means a start of `span 6`
and an end of `auto`. Put a start class on top of it and the start is overridden
while the end stays `auto`, which resolves to a span of one. The element lands
in exactly the right column and is a twelfth of the width it asked for, and
nothing reports an error anywhere. Setting only the end leaves the start free
for auto-placement or for a start class.

## 5. Measure is not span

Type does not become more readable as its column gets wider. Past about
seventy-five characters the eye loses the start of the next line, and seven
columns on a wide screen is well past that.

So `.g-measure` caps body copy at 68ch independently of how many columns it
spans. A span says where something sits. A measure says how wide the text inside it
is allowed to get. Use both on anything anyone has to read.

## 6. The overlay

```html
<div class="g-rules" hidden>
  <i></i><i></i><i></i><i></i><i></i><i></i>
  <i></i><i></i><i></i><i></i><i></i><i></i>
</div>
```

One element per column. Toggle the `hidden` attribute.

Note that `.g-rules[hidden]` is declared explicitly in the stylesheet. The
`hidden` attribute's `display: none` lives in the browser's own stylesheet, and
any author `display` beats it, so a `.g-rules` element carrying `hidden` is
otherwise still a grid: the overlay ships switched on with its own button
insisting it is off. This catches people every time they style something that
also uses `hidden`.

## 7. Narrow widths

Below 48rem the grid becomes four columns and everything spans the full set
unless it carries `.g-keep`.

This is deliberate rather than lazy. Twelve columns on a phone is not a grid, it
is a list of slivers, and the alternative to collapsing is re-stating every span
at every breakpoint. It also prevents the silent failure: a span of 8 on a grid
of 4 overflows, and the page scrolls sideways with nothing in the console.

If a particular element genuinely should keep its span when narrow, give it
`.g-keep` and set the span you want in your own stylesheet.

## 8. Subgrid

`.g-band__sub` inherits the parent's tracks, so a caption under a picture lines up
with the column above it. The alternative is re-declaring twelve tracks inside a
six column area, where every nested track is half the width of the ones it is
supposed to agree with and nothing lines up with anything.

## 9. Tuning it

Everything is a custom property on `:root`. Override them in your own stylesheet
rather than editing the file, so the next version is a clean replacement.

- `--grid-columns` the track count
- `--grid-gutter` between columns
- `--grid-margin` between content and trim
- `--grid-measure` the widest the tracks ever get
- `--grid-step` the vertical unit everything spaces in multiples of
- `--grid-rule` the overlay colour

## 10. Common mistakes

1. **Making the margin a gutter.** The content ends up jammed against the trim
   on small screens, and no amount of breakpoint fiddling fixes the ratio.

2. **Putting the margin on the band.** Nothing can bleed, so every photograph
   has a strip of background down each side.

3. **An overlay that is its own gradient or an exported image.** It is right
   once and silently wrong thereafter, which is worse than not having one.

4. **Using the `grid-column` shorthand with a start class.** Span of one, in the
   right place, no error.

5. **Spanning seven columns of body copy on a wide screen.** It is a grid
   decision that produces an unreadable line length. Add a measure.

6. **Twelve columns on a phone.** Collapse the count instead.
