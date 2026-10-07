## What it is

MasonryColumns packs items of unequal height into columns with no ragged gaps,
for a gallery or an index of cards. It ships two versions, and choosing between
them is the whole decision.

It is CSS. There is no runtime, nothing to mount and nothing to destroy.

Three things carry it, and the first is a warning rather than a technique.

**CSS columns destroy reading order, and most masonry layouts on the web are
quietly broken because of it.** `columns: 3` fills the first column top to
bottom, then the second. Item 2 sits below item 1 rather than beside it. For a
wall of photographs nobody minds. For a numbered list, a set of steps or search
results it is wrong, and it is wrong for a screen reader and for anyone tabbing
through as well as for the eye. So both versions are here, with which is which
written down, rather than one answer to two different questions.

**`break-inside: avoid` is not optional.** Without it a card splits across the
bottom of one column and the top of the next, and the half at the top has lost
its heading. One line, and it is the difference between a gallery and a mess.

**The ordered version does not pack, and that is the honest trade.** Keeping
reading order means items in a row share its height, so there are gaps under
the short ones. A layout cannot both read in order and pack perfectly. Anything
claiming otherwise is measuring heights in JavaScript and repositioning on
every resize.

## Which one to use

**`.g-mason`** packs, and reads down each column. Use it when the order carries
no meaning: a gallery, a moodboard, a wall of covers.

**`.g-mason-rows`** reads left to right and does not pack. Use it for anything
sequential, which is most things: a list of articles, results, steps, an index.

If you are not sure, use the ordered one. A gap under a short card costs a
reader nothing. An order that only makes sense down a column costs them the
meaning.

## Wiring

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

## The wide card only works on one of them

`.g-card--wide` spans two columns, and it only applies inside
`.g-mason-rows`. A CSS column layout has no concept of an item spanning two
columns, so there is nothing for the class to do in the packed version.

It is reset to a single column below 38rem, because a span of two on a grid of
one overflows silently and scrolls the page sideways with nothing in the
console.

## Narrow widths

Three columns to two below 60rem, and one below 38rem. Both versions read the
same at one column, which is the one width where the choice between them does
not matter.

## Common mistakes

1. **Using the packed version for a list.** The commonest masonry bug on the
   web, and invisible to whoever built it because they already know the order.

2. **Forgetting `break-inside`.** Cards cut in half across a column boundary.

3. **Expecting the ordered version to pack.** It cannot. That is the price of
   the order, and it is usually worth paying.

4. **Stretching cards to the row height.** It removes the only advantage the
   ordered version has over a plain grid of equal boxes.

5. **A span of two when the count has dropped to one.** Sideways scroll, no
   error.
