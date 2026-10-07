## What it is

BaselineGrid is vertical rhythm: every line of type in two adjacent columns
sits on the same invisible rule, the way it does on a printed spread, and the
overlay draws those rules so you can check whether it is actually true.

It is CSS. There is no runtime, nothing to mount and nothing to destroy, except
one small script for the escape hatch described below.

Three things carry it, and the second is where almost every attempt falls over.

**Everything is a multiple of one number.** Line heights, margins, the space
above a heading and below it: all of them `calc(var(--base-line) * n)`. The
moment one value is chosen by eye the rhythm is gone, and it is gone for
everything after it on the page rather than just for that element.

**Pictures are the hard part, and they are why most baseline grids are a lie.**
An image is whatever height its own proportions make it, which is almost never
a whole number of baselines. One of them puts every line below it off the rule
for the rest of the page. There are only two honest answers: crop the image to
a height that is a multiple, or let it take its own height and put the rhythm
back underneath it.

**The first baseline is what has to land, not the box.** A heading with a tall
line-height has space above the letters that pushes the text off the rule while
the box itself measures correctly.

## Wiring

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

## Pictures, and the two honest answers

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

## The overlay

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

## Headings take two above and one below

A heading belongs to what follows it rather than to what it interrupts, so the
space above is twice the space below. Both are whole baselines.

If you change a heading's size, change its `line-height` to a whole number of
baselines in the same rule, or everything after it drifts.

## Narrow widths

`.g-columns` collapses to one column below 48rem. Two columns of body copy on a
phone is two columns of about four words, and the rhythm they share is not worth
what it costs to read them.

## Common mistakes

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
