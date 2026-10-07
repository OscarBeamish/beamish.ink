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

## 1. Save this file

Save it at `src/beamish/grids/full-bleed-tiles/grid.css`, or wherever this project keeps its CSS.

```css
/*
 * FullBleedTiles: Beamish
 * https://beamish.ink/grids/full-bleed-tiles
 *
 * A grid of tiles that runs to the edges of the window, ruled by hairlines, with
 * no outer margin at all. The kind of front page that is a contents list and a
 * composition at the same time.
 *
 * Three things carry it, and the first is the one everybody gets wrong.
 *
 * The rules are the gaps, not borders on the cells. Give every tile a 1px
 * border and the line between two tiles is 2px while the line at the edge of
 * the grid is 1px, so the whole thing reads as slightly broken without anyone
 * being able to say why. A 1px gap with a ground behind it produces exactly one
 * rule everywhere, because there is only ever one gap between two cells.
 *
 * The cells are sized by ratio, not by height. A tile grid whose rows are fixed
 * pixels needs a breakpoint every time the window changes shape. Giving the
 * tile an `aspect-ratio` and letting the column count change means the rows
 * size themselves, and the only thing a breakpoint has to say is how many
 * columns there are.
 *
 * And the outer rule is a decision, not an accident. A grid with no margin has
 * its outermost cells against the trim, so whether there is a line there at all
 * is something you choose: `--tiles-frame` draws it, and at 0 the grid bleeds
 * off the page. Most implementations get whichever one the gap happened to give
 * them.
 */

:root {
  /* How many tiles across. The rows follow from the ratio. */
  --tiles-columns: 4;
  /* The hairline. One value: it is a gap, so it cannot be doubled. */
  --tiles-rule: 1px;
  --tiles-rule-colour: rgba(54, 54, 48, 0.28);
  /* The shape of one tile. Rows size themselves from this. */
  --tiles-ratio: 5 / 4;
  /* The outer line, if you want one. 0 bleeds off the page. */
  --tiles-frame: 1px;
  --tiles-pad: clamp(0.9rem, 2cqw, 1.8rem);
}

/*
 * The ground behind the gaps is what you actually see as the rules, so the
 * element's background is the line colour and the tiles cover everything else.
 */
.g-tiles {
  display: grid;
  grid-template-columns: repeat(var(--tiles-columns), minmax(0, 1fr));
  gap: var(--tiles-rule);
  background: var(--tiles-rule-colour);
  border: var(--tiles-frame) solid var(--tiles-rule-colour);
  box-sizing: border-box;
  width: 100%;
  /*
   * Container queries, so a tile's own padding and type can answer to the tile
   * rather than to the window. The same grid in a sidebar and across a page
   * then behaves, with no breakpoint knowing where it was put.
   */
  container-type: inline-size;
}

.g-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  aspect-ratio: var(--tiles-ratio);
  padding: var(--tiles-pad);
  box-sizing: border-box;
  background: var(--background-elevated, #faf9f6);
  color: inherit;
  text-decoration: none;
  overflow: hidden;
}

/*
 * A tile that holds a picture and nothing else. The image fills it and the
 * ratio still comes from the grid, so one row cannot be a different height
 * from the one beside it.
 */
.g-tile--plate {
  padding: 0;
}

.g-tile--plate > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Spans, as grid-column-end, for the tile that is worth two. */
.g-tile--wide {
  grid-column-end: span 2;
  aspect-ratio: calc(var(--tiles-ratio) * 2);
}

.g-tile--tall {
  grid-row-end: span 2;
  aspect-ratio: calc(var(--tiles-ratio) / 2);
}

/*
 * Narrow. The count drops and the tiles get squarer, because a 5:4 tile two
 * across on a phone is a letterbox with a word in it.
 */
@media (max-width: 48rem) {
  :root {
    --tiles-columns: 2;
    --tiles-ratio: 1 / 1;
  }

  /*
   * A span of two on a grid of two is the whole row, which is usually what was
   * meant, but a tall tile next to nothing is not. Both are reset.
   */
  .g-tile--tall {
    grid-row-end: auto;
    aspect-ratio: var(--tiles-ratio);
  }
}
```

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
