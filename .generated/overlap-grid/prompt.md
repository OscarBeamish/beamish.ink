You are adding **OverlapGrid** from Beamish to this project.

> Blocks that deliberately share cells, so a title can sit across a photograph without a negative margin anywhere. A grid system, CSS, MIT.
> https://beamish.ink/grids/overlap-grid

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

- Overlap is two items given the same cells, not one item pulled across by a negative margin. A negative margin is a lie told to the layout: the element still occupies its original track, nothing around it knows where it really is, and at the next width it overlaps something it was never meant to touch. Two items sharing a grid area genuinely share the space, and the browser sizes the tracks knowing about both
- Explicit rows are the price of overlap. With grid-auto-rows, row 3 is wherever the content above it happened to end, so telling two items to share row 3 does not make them meet. A fixed row unit makes row 3 the same place for both
- Stacking order is declared rather than inherited from source order. Items in one cell paint in document order, so reordering markup for a screen reader silently changes which block is on top. The lift classes say it out loud, which keeps reading order and painting order separate decisions
- Anything on top of a photograph gets its own ground. Type over an image is unreadable about a third of the time, and the alternative to a wash is choosing pictures that happen to be dark in the right corner
- Below 54rem overlap is abandoned rather than scaled. Two blocks sharing a cell on a phone is two blocks on top of each other with no room to read either, so it becomes a single column in source order. This is the one grid here whose narrow layout is a different composition rather than the same one compressed

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch this file

| Save as | Fetch from |
| --- | --- |
| `src/beamish/grids/overlap-grid/grid.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/grids/overlap-grid/grid.css |

## 2. The custom properties are the interface

Override these in the project's own stylesheet rather than editing the file, so
a later version is a clean replacement.

| Property | Default | What it is |
| --- | --- | --- |
| `--over-columns` | `12` | The track count. Twelve gives enough places for two blocks to meet at a sensible fraction rather than at whatever the arithmetic allows. |
| `--over-gutter` | `clamp(0.75rem, 1.4vw, 1.5rem)` | Between columns. Note that two overlapping items ignore it where they meet, which is the point: the gutter separates neighbours, not things sharing a cell. |
| `--over-margin` | `clamp(1.25rem, 5vw, 5rem)` | Between the content and the trim, kept separate from the gutter for the same reason as every other grid here. |
| `--over-row` | `clamp(2rem, 4vw, 4rem)` | The row unit, and the price of overlap. With automatic rows, row 3 is wherever the content above happened to end, so two items told to share it would not. A fixed unit makes row 3 the same place for both. |
| `--over-shade` | `rgba(20, 20, 18, 0.55)` | The wash behind a block sitting over a photograph. Type over an image is unreadable about a third of the time and which third depends on the image, so this is the fix rather than hoping. |
| `--over-rule` | `rgba(54, 54, 48, 0.2)` | The border on a panel sitting on paper rather than over a picture. |

## 3. Wiring

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

## 4. Explicit rows are the price

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

## 5. Say which one is on top

```html
<div class="g-lift-1">…</div>
<div class="g-lift-2">…</div>
```

Without a lift class, the one later in the source wins. That is fine until
someone moves a block so it reads better aloud, at which point the picture
changes and nothing in the markup explains why.

## 6. Narrow widths

Below 54rem the overlap is abandoned and everything becomes a single column in
source order.

This is the one grid here whose narrow layout is a different composition rather
than the same one compressed. Two blocks sharing a cell on a phone is two
blocks on top of each other with no room to read either, and pretending
otherwise makes the page unusable at the width most people have.

## 7. Common mistakes

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
