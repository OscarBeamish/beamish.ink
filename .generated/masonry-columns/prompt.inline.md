You are adding **MasonryColumns** from Beamish to this project.

> Items of unequal height packed into columns, with the ordered variant for anything that is read in sequence. A grid system, CSS, MIT.
> https://beamish.ink/grids/masonry-columns

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

- CSS columns destroy reading order, and most masonry layouts on the web are quietly broken because of it. Three columns fills the first top to bottom and then the second, so item 2 is below item 1 rather than beside it. For a wall of photographs nobody minds; for a numbered list, a set of steps or search results it is wrong, and wrong for a screen reader and for anyone tabbing as well as for the eye. Both versions ship here, with which is which written down
- break-inside: avoid is not optional on the packed version. Without it a card splits across the bottom of one column and the top of the next, and the half at the top has lost its heading. One line, and it is the difference between a gallery and a mess
- The ordered version does not pack, and that is the honest trade. Keeping reading order means items in a row share its height, so there are gaps under the short ones. A layout cannot both read in order and pack perfectly; anything claiming otherwise is measuring heights in JavaScript and repositioning on every resize
- align-items: start on the ordered version is what keeps a short card short rather than stretching it to the tallest in its row, which would be packing's worst feature with none of its benefit
- A column layout has no concept of an item spanning two columns, so the wide modifier only works on the ordered version. It is reset to a single column below 38rem, because a span of two on a grid of one overflows silently and scrolls the page sideways

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Save this file

Save it at `src/beamish/grids/masonry-columns/grid.css`, or wherever this project keeps its CSS.

```css
/*
 * MasonryColumns: Beamish
 * https://beamish.ink/grids/masonry-columns
 *
 * Items of unequal height packed into columns with no ragged gaps, for a
 * gallery or an index of cards.
 *
 * Three things carry it, and the first is a warning rather than a technique.
 *
 * CSS columns destroy reading order, and most masonry layouts on the web are
 * quietly broken because of it. `columns: 3` fills the first column top to
 * bottom, then the second: item 2 is below item 1 rather than beside it. For a
 * wall of photographs nobody minds. For anything read in sequence, a numbered
 * list, a set of steps, search results, it is wrong, and it is wrong for a
 * screen reader and for anyone tabbing through as well as for the eye. So this
 * ships both, and says which is which, rather than giving one answer to two
 * different questions.
 *
 * `break-inside: avoid` is not optional. Without it a card splits across the
 * bottom of one column and the top of the next, and the half at the top has no
 * heading. It is one line and it is the difference between a gallery and a
 * mess.
 *
 * And the row-ordered version does not pack. That is the honest trade: keeping
 * reading order means items in a row share its height, so there are gaps under
 * the short ones. A layout cannot both read in order and pack perfectly, and
 * anything claiming otherwise is measuring heights in JavaScript and
 * repositioning on every resize.
 */

:root {
  --mason-columns: 3;
  --mason-gap: clamp(0.75rem, 1.6vw, 1.5rem);
  --mason-margin: clamp(1rem, 4vw, 4rem);
  --mason-rule: rgba(54, 54, 48, 0.2);
}

/*
 * The packed version. Column order, so use it only where order does not carry
 * meaning: a gallery, a moodboard, a wall of covers.
 */
.g-mason {
  columns: var(--mason-columns);
  column-gap: var(--mason-gap);
  padding-inline: var(--mason-margin);
  box-sizing: border-box;
}

.g-mason > * {
  /*
   * Not optional. Without it a card splits across the bottom of one column and
   * the top of the next, and the half at the top has lost its heading.
   */
  break-inside: avoid;
  /* Safari has wanted the older spelling for a long time. */
  -webkit-column-break-inside: avoid;
  margin: 0 0 var(--mason-gap);
  /*
   * `inline-block` stops a stray break in browsers that ignore break-inside on
   * a block, at the cost of nothing: these are already full-column width.
   */
  display: inline-block;
  width: 100%;
}

/*
 * The ordered version. Reads left to right, which is what a sequence needs,
 * and does not pack: items in a row share its height.
 *
 * `align-items: start` is what keeps a short card short rather than stretching
 * it to the tallest in its row, which would be packing's worst feature without
 * any of its benefit.
 */
.g-mason-rows {
  display: grid;
  grid-template-columns: repeat(var(--mason-columns), minmax(0, 1fr));
  gap: var(--mason-gap);
  align-items: start;
  padding-inline: var(--mason-margin);
  box-sizing: border-box;
}

/* A card. Plain, because the grid is the item here and this is scaffolding. */
.g-card {
  background: var(--background-elevated, #faf9f6);
  border: 1px solid var(--mason-rule);
  box-sizing: border-box;
  overflow: hidden;
}

.g-card img {
  display: block;
  width: 100%;
  height: auto;
}

.g-card__body {
  padding: clamp(0.7rem, 1.6vw, 1.1rem);
}

/* One that is worth two columns, in the ordered version only. Column layout
 * has no concept of an item spanning two columns, which is another thing the
 * packed version cannot do. */
.g-mason-rows > .g-card--wide {
  grid-column-end: span 2;
}

@media (max-width: 60rem) {
  :root {
    --mason-columns: 2;
  }
}

@media (max-width: 38rem) {
  :root {
    --mason-columns: 1;
  }

  /* A span of two on one column overflows, silently, and the page scrolls
   * sideways with nothing in the console. */
  .g-mason-rows > .g-card--wide {
    grid-column-end: span 1;
  }
}
```

## 2. The custom properties are the interface

Override these in the project's own stylesheet rather than editing the file, so
a later version is a clean replacement.

| Property | Default | What it is |
| --- | --- | --- |
| `--mason-columns` | `3` | How many columns, for both the packed and the ordered version. It drops to two below 60rem and one below 38rem, which is the only breakpoint either of them needs. |
| `--mason-gap` | `clamp(0.75rem, 1.6vw, 1.5rem)` | Between items, horizontally and vertically. In the packed version the vertical gap is a margin on the item, because a column layout has no row gap to set. |
| `--mason-margin` | `clamp(1rem, 4vw, 4rem)` | Between the content and the trim. A gallery wants less of this than a text page: the pictures are the content and the margin is only there to stop them touching the edge. |
| `--mason-rule` | `rgba(54, 54, 48, 0.2)` | The card border. Hairline, because a packed wall of cards has a great many edges and anything heavier turns the page into a lattice. |

## 3. Which one to use

**`.g-mason`** packs, and reads down each column. Use it when the order carries
no meaning: a gallery, a moodboard, a wall of covers.

**`.g-mason-rows`** reads left to right and does not pack. Use it for anything
sequential, which is most things: a list of articles, results, steps, an index.

If you are not sure, use the ordered one. A gap under a short card costs a
reader nothing. An order that only makes sense down a column costs them the
meaning.

## 4. Wiring

```html
<link rel="stylesheet" href="./beamish/grids/masonry-columns/grid.css" />

<!-- A gallery. Order does not matter. -->
<div class="g-mason">
  <figure class="g-card"><img src="…" alt="…" /></figure>
  <figure class="g-card"><img src="…" alt="…" /></figure>
</div>

<!-- An index. Order does matter. -->
<ol class="g-mason-rows">
  <li class="g-card">
    <img src="…" alt="…" />
    <div class="g-card__body">First</div>
  </li>
  <li class="g-card g-card--wide">
    <div class="g-card__body">Second, across two columns</div>
  </li>
</ol>
```

**React, Vue, Astro.** Import the stylesheet once and use the class names.

## 5. The wide card only works on one of them

`.g-card--wide` spans two columns, and it only applies inside
`.g-mason-rows`. A CSS column layout has no concept of an item spanning two
columns, so there is nothing for the class to do in the packed version.

It is reset to a single column below 38rem, because a span of two on a grid of
one overflows silently and scrolls the page sideways with nothing in the
console.

## 6. Narrow widths

Three columns to two below 60rem, and one below 38rem. Both versions read the
same at one column, which is the one width where the choice between them does
not matter.

## 7. Common mistakes

1. **Using the packed version for a list.** The commonest masonry bug on the
   web, and invisible to whoever built it because they already know the order.

2. **Forgetting `break-inside`.** Cards cut in half across a column boundary.

3. **Expecting the ordered version to pack.** It cannot. That is the price of
   the order, and it is usually worth paying.

4. **Stretching cards to the row height.** It removes the only advantage the
   ordered version has over a plain grid of equal boxes.

5. **A span of two when the count has dropped to one.** Sideways scroll, no
   error.
