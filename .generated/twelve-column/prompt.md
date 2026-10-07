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

## 1. Fetch this file

| Save as | Fetch from |
| --- | --- |
| `src/beamish/grids/twelve-column/grid.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/grids/twelve-column/grid.css |

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

## 9. Common mistakes

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
