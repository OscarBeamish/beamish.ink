## What it is

OverlapGrid lets blocks deliberately sit over one another: a title across a
photograph, a panel breaking out of its column, two plates sharing a corner.
The composition that looks laid out by hand rather than filled in.

It is CSS. There is no runtime, nothing to mount and nothing to destroy.

Three things carry it, and the first is the whole reason this is a grid rather
than a pile of negative margins.

**Overlap is two items in the same cells.** A negative margin is a lie told to
the layout: the element still occupies its original track, nothing around it
knows where it really is, and at the next width it overlaps something it was
never meant to touch. Two items given the same area genuinely share the space.
The browser sizes the tracks knowing about both, and the overlap holds at every
width because it was never a fudge.

**Stacking order is declared, not inherited from source order.** Items in one
cell paint in document order, so reordering the markup for a screen reader
silently changes which block is on top. The lift classes say it out loud, which
keeps reading order and painting order separate decisions.

**Anything over a photograph needs its own ground.** Type over an image is
unreadable about a third of the time, and which third depends on the
photograph. `.g-over-shade` is the honest fix; the alternative is choosing
pictures that happen to be dark in the right corner.

## Wiring

```html
<link rel="stylesheet" href="./beamish/grids/overlap-grid/grid.css" />

<section class="g-over">
  <figure class="g-o-c1 g-o-w8 g-o-r1 g-o-h6">
    <img src="…" alt="…" />
  </figure>

  <div class="g-o-c6 g-o-w6 g-o-r4 g-o-h3 g-lift-2 g-over-panel">
    <h2>A panel crossing the picture</h2>
  </div>
</section>
```

The picture takes columns 1 to 8 and rows 1 to 6. The panel starts at column 6
and row 4, so it crosses the picture, and `.g-lift-2` puts it on top.

**React, Vue, Astro.** Import the stylesheet once and use the class names.

## Explicit rows are the price

`.g-over` sets `grid-auto-rows` to a fixed unit rather than letting rows size
themselves. That is not a style choice.

With automatic rows, "row 3" is wherever the content above it happened to end,
which depends on the height of everything before it. Two items told to share
row 3 would land in two different places. A fixed row unit makes row 3 the same
place for both, which is what lets them be told to meet.

The cost is that you place things by row number, and a block taller than the
rows you gave it will overflow rather than push the grid down. That is the
trade: overlap needs a coordinate system, and a coordinate system has to be
fixed.

## Say which one is on top

```html
<div class="g-lift-1">…</div>
<div class="g-lift-2">…</div>
```

Without a lift class, the one later in the source wins. That is fine until
someone moves a block so it reads better aloud, at which point the picture
changes and nothing in the markup explains why.

## Narrow widths

Below 54rem the overlap is abandoned and everything becomes a single column in
source order.

This is the one grid here whose narrow layout is a different composition rather
than the same one compressed. Two blocks sharing a cell on a phone is two
blocks on top of each other with no room to read either, and pretending
otherwise makes the page unusable at the width most people have.

## Common mistakes

1. **Negative margins.** They work at the width you tested and nowhere else,
   because the layout never knew the element had moved.

2. **Automatic rows.** Two items told to share a row land in different places,
   and the gap between them changes with the content above.

3. **Relying on source order for stacking.** It is invisible, and it breaks the
   first time someone improves the reading order.

4. **Type straight onto a photograph.** Readable on the picture you chose,
   unreadable on the one that replaces it next year.

5. **Trying to keep the overlap on a phone.** There is no room. Let it become a
   column.
