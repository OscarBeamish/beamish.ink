## What it is

FullBleedTiles is a grid of tiles that runs to the edges of the window with no
outer margin, ruled by hairlines. The kind of front page that is a contents
list and a composition at the same time.

It is CSS. There is no runtime, nothing to mount and nothing to destroy.

Three things carry it, and the first is the one everybody gets wrong.

**The rules are the gaps, not borders on the cells.** Give every tile a 1px
border and the line between two tiles is 2px while the line at the edge of the
grid is 1px. The whole thing then reads as slightly broken without anyone being
able to say why. A 1px gap with a ground behind it produces exactly one rule
everywhere, because there is only ever one gap between two cells.

**The cells are sized by ratio, not by height.** A tile grid whose rows are
fixed pixels needs a breakpoint every time the window changes shape. Give the
tile an `aspect-ratio` and the rows size themselves, so the only thing a
breakpoint has to say is how many columns there are.

**The outer rule is a decision.** A grid with no margin has its outermost cells
against the trim, so whether there is a line there at all is something you
choose. `--tiles-frame` draws it; at 0 the grid bleeds off the page. Most
implementations get whichever one the gap happened to give them.

## Wiring

```html
<link rel="stylesheet" href="./beamish/grids/full-bleed-tiles/grid.css" />

<div class="g-tiles">
  <a class="g-tile" href="/letterpress">
    <span>01</span>
    <span>Letterpress</span>
  </a>
  <div class="g-tile g-tile--plate"><img src="…" alt="…" /></div>
  <a class="g-tile g-tile--wide" href="/gravure">
    <span>02</span>
    <span>Gravure</span>
  </a>
</div>
```

`.g-tiles` is the grid, `.g-tile` is a cell. `.g-tile--plate` is a cell holding
only a picture, `.g-tile--wide` takes two columns and `.g-tile--tall` takes two
rows.

**React, Vue, Astro.** Nothing to do. Import the stylesheet once at the root
and use the class names. There is no component to render.

## A span has to change the ratio too

`.g-tile--wide` sets `grid-column-end: span 2` *and* doubles the aspect ratio.
Both are necessary: a cell spanning two columns is twice as wide, so leaving
the ratio alone makes it twice as tall as its neighbours and the row grows to
fit it.

This is the part people miss when they add their own span class. If you write
one, change the ratio in the same rule.

## It is a container

`.g-tiles` sets `container-type: inline-size`, and the tile padding is in `cqw`.
That means a tile answers to the tile rather than to the window, so the same
grid behaves in a sidebar and across a page with no breakpoint needing to know
where it was put.

If you set your own type sizes inside a tile, use `cqw` for the same reason.

## There is no overlay

There does not need to be one. The rules are the grid: they are visible all the
time, because they are what the gaps show. An overlay would be drawing a
picture of something already on the screen.

## Narrow widths

Below 48rem the count drops to two and the tiles become square. A 5:4 tile two
across on a phone is a letterbox with a word in it.

`.g-tile--tall` is reset there as well, because a double-height cell beside
nothing is not what was meant by it.

## Common mistakes

1. **Borders instead of gaps.** Doubled lines between cells, single lines at
   the edge. It is the one thing that makes a tile grid look amateur.

2. **Fixed row heights.** A breakpoint for every window shape, and a last row
   that is a different height from the others.

3. **A span without a ratio.** The cell is twice as wide and twice as tall, and
   the whole row grows to accommodate it.

4. **Padding in `vw` inside a tile.** The tile stops being reusable anywhere
   narrower than the page.

5. **Leaving the outer rule to chance.** Decide. Either the grid is framed or
   it bleeds, and both are fine, but the one you did not choose looks like an
   accident because it is one.
