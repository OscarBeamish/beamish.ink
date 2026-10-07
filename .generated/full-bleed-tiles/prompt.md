You are adding **FullBleedTiles** from Beamish to this project.

> A grid of tiles running to the edges of the window, ruled by hairlines that are gaps rather than borders. A grid system, CSS, MIT.
> https://beamish.ink/grids/full-bleed-tiles

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

- The rules are the gaps, not borders on the cells. Give every tile a 1px border and the line between two tiles is 2px while the line at the edge is 1px, so the grid reads as slightly broken without anyone being able to say why. A 1px gap with a ground behind it produces exactly one rule everywhere, because there is only ever one gap between two cells
- Cells are sized by ratio rather than by height. A tile grid with fixed pixel rows needs a breakpoint every time the window changes shape; an aspect-ratio means the rows size themselves and a breakpoint only has to say how many columns there are
- The outer rule is a decision rather than an accident. A grid with no margin has its outermost cells against the trim, so tiles-frame draws that line and 0 lets the grid bleed off the page. Most implementations get whichever one the gap happened to give them
- The element is a container, so a tile's padding and type answer to the tile rather than to the window. The same grid in a sidebar and across a page both behave, with no breakpoint needing to know where it was put
- Below 48rem the count drops to two and the tiles become square, because a 5:4 tile two across on a phone is a letterbox with a word in it. A tall tile is reset there too, since a double-height cell beside nothing is not what was meant

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch this file

| Save as | Fetch from |
| --- | --- |
| `src/beamish/grids/full-bleed-tiles/grid.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/grids/full-bleed-tiles/grid.css |

## 2. The custom properties are the interface

Override these in the project's own stylesheet rather than editing the file, so
a later version is a clean replacement.

| Property | Default | What it is |
| --- | --- | --- |
| `--tiles-columns` | `4` | How many tiles across. The rows follow from the ratio rather than from a height, so this is the only number a breakpoint has to change. |
| `--tiles-rule` | `1px` | The hairline between tiles. It is a gap rather than a border, so there is exactly one of it between any two cells and it cannot be doubled. |
| `--tiles-rule-colour` | `rgba(54, 54, 48, 0.28)` | The ground behind the gaps, which is what you see as the rules. The tiles cover everything else, so this colour only ever shows in the lines themselves. |
| `--tiles-ratio` | `5 / 4` | The shape of one tile. Rows size themselves from this, which is what lets the grid reflow without a breakpoint for every window shape. |
| `--tiles-frame` | `1px` | The outer line. A grid with no margin has its outermost cells against the trim, so whether there is a rule there is a decision: 0 lets the grid bleed off the page. |
| `--tiles-pad` | `clamp(0.9rem, 2cqw, 1.8rem)` | Padding inside a tile, in container units so it answers to the tile rather than to the window. The same grid then behaves in a sidebar and across a page. |

## 3. Wiring

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

## 4. A span has to change the ratio too

`.g-tile--wide` sets `grid-column-end: span 2` *and* doubles the aspect ratio.
Both are necessary: a cell spanning two columns is twice as wide, so leaving
the ratio alone makes it twice as tall as its neighbours and the row grows to
fit it.

This is the part people miss when they add their own span class. If you write
one, change the ratio in the same rule.

## 5. It is a container

`.g-tiles` sets `container-type: inline-size`, and the tile padding is in `cqw`.
That means a tile answers to the tile rather than to the window, so the same
grid behaves in a sidebar and across a page with no breakpoint needing to know
where it was put.

If you set your own type sizes inside a tile, use `cqw` for the same reason.

## 6. There is no overlay

There does not need to be one. The rules are the grid: they are visible all the
time, because they are what the gaps show. An overlay would be drawing a
picture of something already on the screen.

## 7. Narrow widths

Below 48rem the count drops to two and the tiles become square. A 5:4 tile two
across on a phone is a letterbox with a word in it.

`.g-tile--tall` is reset there as well, because a double-height cell beside
nothing is not what was meant by it.

## 8. Common mistakes

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
