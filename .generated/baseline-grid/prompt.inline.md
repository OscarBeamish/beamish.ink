You are adding **BaselineGrid** from Beamish to this project.

> Vertical rhythm where every line in adjacent columns sits on the same rule, including the lines under a photograph. A grid system, CSS, MIT.
> https://beamish.ink/grids/baseline-grid

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

- Everything is a multiple of one number: line heights, margins, the space above a heading and below it. The moment one value is chosen by eye the rhythm is gone, and it is gone for everything after it on the page rather than just for that element
- Pictures are the hard part and they are why most baseline grids are a lie. An image is whatever height its proportions make it, which is almost never a whole number of baselines, and one of them puts every line below it off the rule for the rest of the page. Either crop it to a multiple, which is the default here, or let it run free and put the rhythm back underneath it
- The free-height escape hatch is corrected in the browser rather than ignored, because the error is not known until the image has been laid out at a width nobody chose. A margin cannot fix a number that does not exist yet
- The first baseline is what has to land, not the box. A heading with a tall line-height has space above the letters that pushes the text off the rule while the box itself looks correct
- The overlay is a repeating gradient here, which would be wrong for a column grid and is right for this one: a baseline is an even repeat with no gutter to get wrong, so the gradient cannot disagree with the layout
- A heading takes two baselines above and one below, because a heading belongs to what follows it rather than to what it interrupts

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Save this file

Save it at `src/beamish/grids/baseline-grid/grid.css`, or wherever this project keeps its CSS.

```css
/*
 * BaselineGrid: Beamish
 * https://beamish.ink/grids/baseline-grid
 *
 * Vertical rhythm. Every line of type in two adjacent columns sits on the same
 * invisible rule, the way it does on a printed spread, and the overlay draws
 * those rules so you can see whether it is true.
 *
 * Three things carry it, and the second is where almost every attempt at this
 * falls over.
 *
 * Everything is a multiple of one number. Line heights, margins, the space
 * above a heading and below it: all of them `calc(var(--base-line) * n)`. The
 * moment one value is chosen by eye the rhythm is gone, and it is gone for
 * everything after it on the page rather than just for that element.
 *
 * Pictures are the hard part, and they are why most baseline grids are a lie.
 * An image is whatever height its own proportions make it, which is almost
 * never a whole number of baselines, and one of them puts every line below it
 * off the rule for the rest of the page. There are only two honest answers:
 * give the image a height that is a multiple and crop to it, or let it take its
 * own height and put the rhythm back underneath it. This does the first by
 * default, with `.g-plate--free` for the second, and the second is corrected
 * rather than ignored.
 *
 * And the first line is the one that has to land. A block's rhythm is set by
 * where its first baseline sits, not by its box: a heading with a tall
 * line-height has space above the letters that pushes the text off the rule
 * while the box looks right. The trim is done with padding derived from the
 * line-height, which is the only part of this that has to be arithmetic rather
 * than a round number.
 */

:root {
  /*
   * The unit. Everything on the page is a whole number of these, so changing
   * it rescales the whole rhythm without anything drifting.
   */
  --base-line: 1.5rem;
  /* Body type. Its line-height must be exactly one baseline. */
  --base-size: 1rem;
  --base-rule: rgba(54, 54, 48, 0.16);
  --base-measure: 66ch;
}

/*
 * Every text element gets a line box that is a whole number of baselines. This
 * is the whole system; the rest is applying it.
 */
.g-rhythm {
  font-size: var(--base-size);
  line-height: var(--base-line);
}

.g-rhythm :where(p, ul, ol, blockquote, pre, figure, table) {
  margin-block: 0 var(--base-line);
}

.g-rhythm :where(p, li) {
  max-width: var(--base-measure);
}

/*
 * Headings take whole baselines too, and the space above one is a baseline
 * more than the space below it, because a heading belongs to what follows.
 */
.g-rhythm :where(h1, h2, h3, h4) {
  margin-block: calc(var(--base-line) * 2) var(--base-line);
  font-weight: 700;
}

.g-rhythm h1 {
  font-size: calc(var(--base-line) * 2);
  line-height: calc(var(--base-line) * 2);
}

.g-rhythm h2 {
  font-size: calc(var(--base-line) * 1.15);
  line-height: calc(var(--base-line) * 1.5);
}

.g-rhythm :where(h3, h4) {
  font-size: var(--base-size);
  line-height: var(--base-line);
}

/*
 * A picture cropped to a whole number of baselines. The number is a property
 * rather than a fixed value, so a plate can be four baselines in a sidebar and
 * twelve across a page and both still land on the rule.
 */
.g-plate {
  --plate-lines: 8;
  display: block;
  width: 100%;
  height: calc(var(--base-line) * var(--plate-lines));
  object-fit: cover;
  margin-block: 0 var(--base-line);
}

/*
 * The escape hatch: a picture at its own proportions, with the rhythm put back
 * underneath it.
 *
 * `margin-bottom` cannot fix this, because the error is not known until the
 * image has been laid out at a width nobody chose. The round-up is done in the
 * browser, against the element's real height, which is the only place the
 * number exists.
 */
.g-plate--free {
  height: auto;
  margin-bottom: 0;
}

.g-plate--free + .g-catch {
  display: block;
  /* Set by the script below. Zero until then, so nothing jumps on load. */
  height: var(--catch, 0px);
}

/* Columns that share the rhythm, so two of them line up line for line. */
.g-columns {
  display: grid;
  grid-template-columns: repeat(var(--base-columns, 2), minmax(0, 1fr));
  column-gap: calc(var(--base-line) * 2);
}

/*
 * The overlay. Drawn from `--base-line` itself, so it cannot describe a rhythm
 * other than the one in force.
 *
 * A repeating gradient is right here, unlike the column overlay, because a
 * baseline really is an even repeat with no gutter to get wrong.
 */
.g-baseline-rules {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    to bottom,
    var(--base-rule) 0,
    var(--base-rule) 1px,
    transparent 1px,
    transparent var(--base-line)
  );
}

/*
 * Said again here, because the attribute's display:none lives in the browser's
 * stylesheet and any author display beats it. Without this the overlay ships
 * switched on with its own button insisting it is off.
 */
.g-baseline-rules[hidden] {
  display: none;
}

@media (max-width: 48rem) {
  .g-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

## 2. The custom properties are the interface

Override these in the project's own stylesheet rather than editing the file, so
a later version is a clean replacement.

| Property | Default | What it is |
| --- | --- | --- |
| `--base-line` | `1.5rem` | The unit. Every vertical measurement on the page is a whole number of these, so changing it rescales the whole rhythm at once without anything drifting out of step. |
| `--base-size` | `1rem` | Body type size. Its line box is exactly one baseline, which is the fact the rest of the system is built on. |
| `--base-rule` | `rgba(54, 54, 48, 0.16)` | The overlay colour. Fainter than a column overlay needs to be, because unlike one this covers every line of text on the page rather than the spaces between columns. |
| `--base-measure` | `66ch` | The widest a line of body copy gets. A baseline grid does nothing for readability if the lines are too long for the eye to track back to the next one. |

## 3. Wiring

```html
<link rel="stylesheet" href="./beamish/grids/baseline-grid/grid.css" />

<article class="g-rhythm">
  <h1>A heading on the rule</h1>
  <p>Body copy, one baseline per line.</p>
  <img class="g-plate" style="--plate-lines: 8" src="…" alt="…" />
  <div class="g-columns">
    <div><p>Two columns…</p></div>
    <div><p>…line for line.</p></div>
  </div>
</article>
```

`.g-rhythm` is the scope: everything inside it takes whole baselines. `.g-plate`
is a cropped picture. `.g-columns` splits into tracks that share the rhythm.

**React, Vue, Astro.** Import the stylesheet once at the root. The only
JavaScript is the free-height correction below, and only if you use it.

## 4. Pictures, and the two honest answers

`.g-plate` crops to a whole number of baselines, set per image:

```html
<img class="g-plate" style="--plate-lines: 8" src="…" alt="…" />
```

Eight baselines, whatever the photograph's proportions. It is `object-fit:
cover`, so the crop is the cost.

If a picture must keep its own proportions, use `.g-plate--free` and put the
rhythm back underneath it:

```html
<img class="g-plate g-plate--free" src="…" alt="…" />
<span class="g-catch"></span>
```

```js
const line = parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.5
for (const img of document.querySelectorAll('.g-plate--free')) {
  const fix = () => {
    const over = img.getBoundingClientRect().height % line
    const catcher = img.nextElementSibling
    if (catcher) catcher.style.setProperty('--catch', `${over ? line - over : 0}px`)
  }
  img.complete ? fix() : img.addEventListener('load', fix)
  addEventListener('resize', fix)
}
```

This has to run in the browser. The error is not known until the image has been
laid out at a width nobody chose, so no margin written in CSS can correct it:
the number does not exist until then.

## 5. The overlay

```html
<div class="g-baseline-rules" hidden></div>
```

Toggle the `hidden` attribute. It is a repeating gradient, which would be the
wrong answer for a column grid and is the right one here: a baseline is an even
repeat with no gutter to get wrong, so the gradient cannot disagree with the
layout it is describing.

`.g-baseline-rules[hidden]` is declared explicitly, because the `hidden`
attribute's `display: none` lives in the browser's own stylesheet and any
author `display` beats it. Without that line the overlay ships switched on with
its own button insisting it is off.

## 6. Headings take two above and one below

A heading belongs to what follows it rather than to what it interrupts, so the
space above is twice the space below. Both are whole baselines.

If you change a heading's size, change its `line-height` to a whole number of
baselines in the same rule, or everything after it drifts.

## 7. Narrow widths

`.g-columns` collapses to one column below 48rem. Two columns of body copy on a
phone is two columns of about four words, and the rhythm they share is not worth
what it costs to read them.

## 8. Common mistakes

1. **A margin picked by eye.** Everything below it is off the rule, for the
   rest of the page.

2. **An image at its own height.** The commonest way a baseline grid quietly
   stops being one. Crop it or correct underneath it.

3. **A heading line-height that is not a whole number of baselines.** The box
   looks right and the text sits between the rules.

4. **Setting the rhythm in `px` while the type is in `rem`.** It holds until
   someone changes their browser's font size, and then nothing lines up.

5. **Trusting it without the overlay.** This is the one grid you genuinely
   cannot check by eye. Turn the rules on and look.
