## What it is

TwelveColumn is an editorial grid for pages built out of full-bleed bands with
their content placed on a shared set of tracks. Twelve columns, a gutter, a
margin that is not the gutter, and an overlay that cannot disagree with the
layout it is describing.

It is CSS. There is no runtime, nothing to mount and nothing to destroy.

Four things carry it, and the last two are what every other version of this gets
wrong.

**The margin is not a gutter.** They are different measurements doing different
jobs. The gutter is the space that holds two columns of type apart. The margin
is the space that holds the type off the trimmed edge of the sheet, and it wants
to be several times larger. Systems that make the outer margin one more gutter
end up with body copy sitting a few pixels off the edge of a phone, because a
gutter that is correct between columns is far too tight against a trim.

**A band is full bleed and its grid is not.** The band spans the whole window so
it can carry a ground colour or a photograph to the edges. The tracks live
inside it, inset by the margin. Put the margin on the band instead and no
section can ever bleed, which is the first thing anybody wants from a layout
like this.

**The rules are drawn from the same custom properties as the layout.** A grid
overlay that is its own repeating gradient is correct on the day it is made and
wrong after the first change to a gutter. An overlay exported as an image is
wrong sooner. `.grid-rules` reads `--grid-columns`, `--grid-gutter` and
`--grid-margin`, which means it cannot describe a grid other than the one it is
sitting on.

**The column count is a custom property.** Narrow widths redefine it rather than
re-stating every span.

## Wiring

Link the stylesheet and write the markup. That is the whole installation.

```html
<link rel="stylesheet" href="./beamish/grids/twelve-column/grid.css" />

<section class="band">
  <div class="band__grid">
    <h1 class="col-10">A heading across ten</h1>
    <p class="col-5 start-7 measure">A column of text in the right half.</p>
  </div>
</section>
```

`.band` is the full-bleed section. `.band__grid` is the tracks. `.col-N` sets a
span, `.start-N` sets where it begins, and the two compose.

**React, Vue, Astro.** Nothing to do. It is a stylesheet: import it once at the
root and use the class names. There is no component to render, which is the
point of shipping a grid rather than a layout component.

## Spans are `grid-column-end`, and that matters

`.col-6` sets `grid-column-end: span 6` rather than the `grid-column`
shorthand, and this is the one piece of the file you should not simplify.

The shorthand sets both ends: `grid-column: span 6` means a start of `span 6`
and an end of `auto`. Put a start class on top of it and the start is overridden
while the end stays `auto`, which resolves to a span of one. The element lands
in exactly the right column and is a twelfth of the width it asked for, and
nothing reports an error anywhere. Setting only the end leaves the start free
for auto-placement or for a start class.

## Measure is not span

Type does not become more readable as its column gets wider. Past about
seventy-five characters the eye loses the start of the next line, and seven
columns on a wide screen is well past that.

So `.measure` caps body copy at 68ch independently of how many columns it
spans. A span says where something sits. A measure says how wide the text inside
it is allowed to get. Use both on anything anyone has to read.

## The overlay

```html
<div class="grid-rules" hidden>
  <i></i><i></i><i></i><i></i><i></i><i></i>
  <i></i><i></i><i></i><i></i><i></i><i></i>
</div>
```

One element per column. Toggle the `hidden` attribute.

Note that `.grid-rules[hidden]` is declared explicitly in the stylesheet. The
`hidden` attribute's `display: none` lives in the browser's own stylesheet, and
any author `display` beats it, so a `.grid-rules` element carrying `hidden` is
otherwise still a grid: the overlay ships switched on with its own button
insisting it is off. This catches people every time they style something that
also uses `hidden`.

## Narrow widths

Below 48rem the grid becomes four columns and everything spans the full set
unless it carries `.keep-span`.

This is deliberate rather than lazy. Twelve columns on a phone is not a grid, it
is a list of slivers, and the alternative to collapsing is re-stating every span
at every breakpoint. It also prevents the silent failure: a span of 8 on a grid
of 4 overflows, and the page scrolls sideways with nothing in the console.

If a particular element genuinely should keep its span when narrow, give it
`.keep-span` and set the span you want in your own stylesheet.

## Subgrid

`.band__sub` inherits the parent's tracks, so a caption under a picture lines up
with the column above it. The alternative is re-declaring twelve tracks inside a
six column area, where every nested track is half the width of the ones it is
supposed to agree with and nothing lines up with anything.

## Tuning it

Everything is a custom property on `:root`. Override them in your own stylesheet
rather than editing the file, so the next version is a clean replacement.

- `--grid-columns` the track count
- `--grid-gutter` between columns
- `--grid-margin` between content and trim
- `--grid-measure` the widest the tracks ever get
- `--grid-step` the vertical unit everything spaces in multiples of
- `--grid-rule` the overlay colour

## Common mistakes

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
